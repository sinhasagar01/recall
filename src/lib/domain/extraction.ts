/**
 * Extraction: what comes back from a model, and what we are allowed to believe.
 *
 * Everything here is pure. No `fetch`, no clock, no Supabase — the transport
 * lives in `lib/ai/extract.ts` and the writes live in the source's actions. This
 * file is the part that can be tested without a network, which is most of the
 * behaviour worth testing: what a malformed answer does, how a truncated one is
 * salvaged, what counts as a duplicate, and how a second pass merges.
 */

/** One question, with its distractors. `correctOption` indexes into `options`. */
export interface ExtractedQuestion {
  question: string
  options: string[]
  correctOption: number
}

/** One concept the video taught, in the shape this app already stores. */
export interface ExtractedConcept {
  title: string
  definition: string
  /** The instructor's, not ours. Editable in review, and attributed to the source. */
  mentalModel: string | null
  whenNotToUse: string | null
  /** Where in the video it was taught, as the model reported it. Free text. */
  timestamp: string | null
  questions: ExtractedQuestion[]
}

export type ParseResult =
  | {
      ok: true
      concepts: ExtractedConcept[]
      /**
       * The model stopped early. Six concepts from a failed call are offered for
       * review rather than thrown away — see `parseExtraction`.
       */
      partial: boolean
      /** Titles dropped because the object was unusable, so coverage can say so. */
      dropped: string[]
    }
  | { ok: false; reason: string }

/*
  ── The estimate, and how wrong it can be ───────────────────────────────────
  These are facts about a vendor, not about this product. They go stale, they
  are not verified by any test, and every one of them is a number someone must
  re-check rather than trust. They are gathered here so that re-checking is one
  edit rather than a search.
*/

/** English prose runs about 0.75 words per token. */
const TOKENS_PER_WORD = 1.33

/** Vendor facts. Verify before trusting; nothing here can. */
export const CONTEXT_TOKENS = 128_000
export const MAX_OUTPUT_TOKENS = 32_000
export const USD_PER_INPUT_TOKEN = 2 / 1_000_000
export const USD_PER_OUTPUT_TOKEN = 8 / 1_000_000

/**
 * How wrong the estimate can be, made explicit rather than implied.
 *
 * ±20% on English prose, and **worse on code-heavy transcripts**, where
 * identifiers and punctuation tokenise denser and the estimate runs LOW. Running
 * low is the dangerous direction — it is what lets a call through that cannot
 * succeed — so `isTooLong` inflates by this margin before comparing.
 *
 * No tokeniser dependency. `tiktoken` is a WASM package for a number that is
 * displayed, and a displayed number with a stated error bar is more honest than
 * an exact one that is exact about the wrong model.
 */
export const ESTIMATE_MARGIN = 0.25

export function estimateTokens(words: number): number {
  return Math.round(Math.max(0, words) * TOKENS_PER_WORD)
}

/**
 * What the send box shows, as a RANGE.
 *
 * A point estimate on a cost is the same class of mistake as telling someone a
 * cancelled call is not billed: it states as fact something that cannot be known
 * until the call returns. How much comes back depends on how many concepts the
 * video contains, which is the thing we are paying to find out.
 */
export function estimateCostRange(words: number): { low: number; high: number } {
  const inputTokens = estimateTokens(words)
  const inputCost = inputTokens * USD_PER_INPUT_TOKEN

  // Output scales with the teaching in the transcript, not with its length
  // exactly — half a token to a whole token per input word, observed.
  const low = inputCost + Math.min(words * 0.5, MAX_OUTPUT_TOKENS) * USD_PER_OUTPUT_TOKEN
  const high = inputCost + Math.min(words * 1.0, MAX_OUTPUT_TOKENS) * USD_PER_OUTPUT_TOKEN

  return { low, high }
}

/**
 * Named BEFORE you press, not after you are billed.
 *
 * The threshold inherits the estimate's error, so it leaves margin in the safe
 * direction: an underestimate still fails this check rather than paying for a
 * call that cannot succeed. The cost of being conservative is refusing a
 * transcript that might just have fitted, and the remedy for that is in the copy
 * — extract it in halves, and coverage merges both passes.
 */
export function isTooLong(words: number): boolean {
  const usable = CONTEXT_TOKENS - MAX_OUTPUT_TOKENS
  return estimateTokens(words) * (1 + ESTIMATE_MARGIN) > usable
}

/*
  ── Reading the response ────────────────────────────────────────────────────
*/

/**
 * Complete top-level elements of a possibly-truncated JSON array.
 *
 * A `strict` response cut off by the output limit is invalid JSON — the array
 * ends mid-object — so `JSON.parse` gives nothing at all, and "the model stopped
 * after 6 concepts" would become "the call failed". This walks the text tracking
 * depth and string state, and returns each complete element, discarding the
 * trailing fragment.
 *
 * String-aware because a brace inside a definition is not a brace: `"a {" ` would
 * otherwise unbalance the count and swallow every concept after it.
 */
export function salvageArrayPrefix(text: string): unknown[] {
  const start = text.indexOf('[')
  if (start === -1) return []

  const out: unknown[] = []
  let depth = 0
  let elementStart = -1
  let inString = false
  let escaped = false

  for (let i = start + 1; i < text.length; i += 1) {
    const char = text[i]

    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{' || char === '[') {
      if (depth === 0) elementStart = i
      depth += 1
      continue
    }

    if (char === '}' || char === ']') {
      depth -= 1
      if (depth === 0 && elementStart !== -1) {
        try {
          out.push(JSON.parse(text.slice(elementStart, i + 1)))
        } catch {
          // An element that will not parse is not an element.
        }
        elementStart = -1
      }
      if (depth < 0) break
    }
  }

  return out
}

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * One concept, validated against what the review screen will actually render.
 *
 * Returns null rather than a half-object. A concept with no title has nothing to
 * show in the list and nothing to compare for duplicates; a question whose
 * `correctOption` is out of range would render an answer key pointing at
 * nothing. Both are dropped, and the caller records that they were.
 */
function readConcept(value: unknown): ExtractedConcept | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>

  const title = asString(raw.title)
  const definition = asString(raw.definition)
  if (title === null || definition === null) return null

  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((entry): ExtractedQuestion | null => {
      if (typeof entry !== 'object' || entry === null) return null
      const q = entry as Record<string, unknown>

      const question = asString(q.question)
      const options = (Array.isArray(q.options) ? q.options : [])
        .map(asString)
        .filter((option): option is string => option !== null)
      const correctOption = typeof q.correct_option === 'number' ? q.correct_option : -1

      // Two options is what makes it a question rather than a statement, and the
      // answer has to be one of them. `topics_shape_is_consistent` enforces the
      // same thing in the database; failing here means a readable drop instead
      // of a 400 at save.
      if (question === null || options.length < 2) return null
      if (!Number.isInteger(correctOption)) return null
      if (correctOption < 0 || correctOption >= options.length) return null

      return { question, options, correctOption }
    })
    .filter((entry): entry is ExtractedQuestion => entry !== null)

  return {
    title,
    definition,
    mentalModel: asString(raw.mental_model),
    whenNotToUse: asString(raw.when_not_to_use),
    timestamp: asString(raw.timestamp),
    questions,
  }
}

/**
 * The whole response, and the three things it can be.
 *
 * | `finishReason` | parse | outcome |
 * | --- | --- | --- |
 * | `stop` | valid | complete |
 * | `length` | invalid tail | **partial** — salvaged, offered, recorded as partial |
 * | `stop` | invalid | a readable error, and nothing offered |
 *
 * **A parse failure is never a partial save.** It is not a save at all: this
 * returns data, the review screen renders it, and only Save writes.
 *
 * Stated honestly: a response that is valid JSON but semantically short — the
 * model simply found less — is indistinguishable from a thorough one and is
 * reported complete. `finishReason` is a claim about the transport, and the
 * transport is the only thing that can actually be observed from here.
 */
export function parseExtraction(text: string, finishReason: string): ParseResult {
  const truncated = finishReason === 'length'

  let elements: unknown[]
  if (truncated) {
    elements = salvageArrayPrefix(text)
  } else {
    try {
      const parsed = JSON.parse(text) as unknown
      const list = Array.isArray(parsed)
        ? parsed
        : (parsed as { concepts?: unknown })?.concepts
      if (!Array.isArray(list)) {
        return { ok: false, reason: 'The response was not a list of concepts.' }
      }
      elements = list
    } catch {
      return { ok: false, reason: 'The response was not readable as JSON.' }
    }
  }

  const concepts: ExtractedConcept[] = []
  const dropped: string[] = []

  for (const element of elements) {
    const concept = readConcept(element)
    if (concept === null) {
      const title =
        typeof element === 'object' && element !== null
          ? (asString((element as Record<string, unknown>).title) ?? 'an unnamed concept')
          : 'an unnamed concept'
      dropped.push(title)
      continue
    }
    concepts.push(concept)
  }

  if (concepts.length === 0) {
    return {
      ok: false,
      reason: truncated
        ? 'The model stopped before finishing a single concept.'
        : 'No concepts found.',
    }
  }

  return { ok: true, concepts, partial: truncated, dropped }
}

/*
  ── Duplicates ──────────────────────────────────────────────────────────────
*/

/**
 * The comparison, and its limit.
 *
 * Lowercased, punctuation stripped, whitespace collapsed. Exact on the result —
 * **deliberately not fuzzy**. A similarity threshold turns a missed duplicate
 * into a wrongly-unticked new concept, and that is the worse failure: you lose
 * something you wanted and never see that it happened.
 *
 * **The false negative is real and is not designed around.** "Function
 * declarations are hoisted" matches itself; it does not match "How declarations
 * get hoisted", and that concept arrives ticked and creates a second topic. The
 * app cannot know better, which is another reason review is not optional — the
 * review screen is where a person catches what a string comparison cannot.
 */
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface ReviewedConcept {
  concept: ExtractedConcept
  /** The title of the existing topic it matches, or null. */
  duplicateOf: string | null
  /** Kept by default — you are mining a video, so unticking two beats ticking twelve. */
  keep: boolean
}

export function markDuplicates(
  concepts: ExtractedConcept[],
  existingTitles: string[],
): ReviewedConcept[] {
  const existing = new Map(existingTitles.map((title) => [normaliseTitle(title), title]))

  return concepts.map((concept) => {
    const match = existing.get(normaliseTitle(concept.title)) ?? null
    return { concept, duplicateOf: match, keep: match === null }
  })
}

/*
  ── Coverage ────────────────────────────────────────────────────────────────
*/

export type CoverageStatus = 'kept' | 'dropped'

export interface CoverageEntry {
  title: string
  normalised: string
  timestamp: string | null
  status: CoverageStatus
  /** Why it was dropped, in the product's words. Null when kept. */
  reason: string | null
  topicId: string | null
  /** Which extraction pass offered it. 1-based. */
  pass: number
  /** The pass ended early, so this record is of an incomplete reading. */
  partial: boolean
}

/**
 * The stored column is jsonb, so the database cannot see its shape.
 *
 * A malformed column renders as **empty rather than throwing**: coverage is a
 * record, and a record that takes the page down with it is worse than a record
 * that is missing. The CHECK in the migration buys the one guarantee worth
 * having at that level — that it is an array — and this buys the rest.
 */
export function parseCoverage(value: unknown): CoverageEntry[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((entry): CoverageEntry[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const raw = entry as Record<string, unknown>

    const title = asString(raw.title)
    if (title === null) return []

    const status: CoverageStatus = raw.status === 'dropped' ? 'dropped' : 'kept'

    return [
      {
        title,
        normalised: asString(raw.normalised) ?? normaliseTitle(title),
        timestamp: asString(raw.timestamp),
        status,
        reason: asString(raw.reason),
        topicId: asString(raw.topic_id),
        pass: typeof raw.pass === 'number' && raw.pass > 0 ? raw.pass : 1,
        partial: raw.partial === true,
      },
    ]
  })
}

/**
 * A second pass **merges, never overwrites**.
 *
 * Existing entries win, on every field. A pass cannot un-drop what you dropped,
 * re-attribute what you saved, or renumber which pass first offered a concept —
 * coverage is the record of decisions you made, and a later reading of the same
 * video does not get to revise them.
 *
 * Matched on `normalised`, so the same concept described with different
 * punctuation is one row rather than two.
 */
export function mergeCoverage(
  existing: CoverageEntry[],
  incoming: CoverageEntry[],
): CoverageEntry[] {
  const seen = new Set(existing.map((entry) => entry.normalised))

  return [...existing, ...incoming.filter((entry) => !seen.has(entry.normalised))]
}

/** The stored shape: snake_case, and assignable to the column's `Json`. */
export interface CoverageRow {
  [key: string]: string | number | boolean | null
  title: string
  normalised: string
  timestamp: string | null
  status: string
  reason: string | null
  topic_id: string | null
  pass: number
  partial: boolean
}

/**
 * The stored shape, which is NOT the domain shape.
 *
 * `parseCoverage` reads `topic_id`; the domain calls it `topicId`. Writing the
 * domain object straight into the column would store the camelCase key and read
 * back `null` forever — a silent, one-way data loss that no type would catch,
 * because jsonb accepts anything. So the mapping is explicit and round-tripped
 * in a test rather than being a property of how the object happened to be built.
 */
export function coverageToRows(entries: CoverageEntry[]): CoverageRow[] {
  return entries.map((entry) => ({
    title: entry.title,
    normalised: entry.normalised,
    timestamp: entry.timestamp,
    status: entry.status,
    reason: entry.reason,
    topic_id: entry.topicId,
    pass: entry.pass,
    partial: entry.partial,
  }))
}

/** What the coverage screen counts. */
export function coverageSummary(entries: CoverageEntry[]): {
  found: number
  kept: number
  dropped: number
  partial: boolean
} {
  return {
    found: entries.length,
    kept: entries.filter((entry) => entry.status === 'kept').length,
    dropped: entries.filter((entry) => entry.status === 'dropped').length,
    partial: entries.some((entry) => entry.partial),
  }
}
