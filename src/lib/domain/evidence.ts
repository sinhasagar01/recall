import type { Topic, TopicRecord } from '@/lib/domain/types'

/**
 * Evidence on a topic.
 *
 * The learning plan calls a concept known only when you can **explain it,
 * implement a variant, and use it in a design decision**. `confidence` measures
 * the first and calls it "strong". These three markers record the rest.
 *
 * ── The one sentence this encodes ───────────────────────────────────────────
 * It is rendered above the row in the product, deliberately: without it the row
 * is four checkboxes with no reason, and a rule with a hole in it reads as three
 * unrelated ticks.
 */
export const EVIDENCE_RULE =
  'Weak until you can explain it, implement a variant, and use it in a design decision.'

/** The three recordable markers. Recall is derived and is not one of them. */
export const EVIDENCE_KINDS = ['rebuild', 'challenge', 'production'] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

/**
 * The label and the "not yet" hint for each marker, defined once.
 *
 * The detail page, the record dialog and the markdown export all read from here,
 * so the three cannot describe the same marker differently.
 */
export const EVIDENCE_COPY: Record<EvidenceKind, { label: string; hint: string; prompt: string }> = {
  rebuild: {
    label: 'Rebuild',
    hint: 'from memory, in isolation',
    prompt: 'Implemented from memory, without looking at the original.',
  },
  challenge: {
    label: 'Challenge',
    hint: 'a constrained variant',
    prompt: 'A realistic constrained problem you solved using this.',
  },
  production: {
    label: 'Production',
    hint: 'used in a real decision',
    prompt: 'A real design decision this informed, in work that shipped.',
  },
}

export interface EvidenceEntry {
  at: string
  note: string
  url: string | null
}

/**
 * One marker, or null when it has never been recorded.
 *
 * The columns are coupled by `topics_evidence_is_consistent` — a date and a note
 * arrive together or not at all — so a date without a note is unreachable rather
 * than merely unexpected. The guard below is what turns that database guarantee
 * into a type, and it reads `at` because `at` is the column the constraint pairs
 * with `note`.
 */
export function evidenceFor(topic: Topic, kind: EvidenceKind): EvidenceEntry | null {
  const at = topic[`${kind}_at`]
  const note = topic[`${kind}_note`]

  /*
    `== null`, loosely, so `undefined` counts as absent too.

    A read that forgets to select these columns yields `undefined`, and a strict
    `=== null` check would then treat every topic as having every marker — which
    is exactly what happened when `library_page` was missing them: filtered cards
    showed three squares for rows that were empty. A missing column should render
    nothing, never invent something.
  */
  if (at == null || note == null) return null
  return { at, note, url: topic[`${kind}_url`] ?? null }
}

/** Every recorded marker, in the order the row displays them. */
export function evidenceEntries(topic: Topic): { kind: EvidenceKind; entry: EvidenceEntry }[] {
  return EVIDENCE_KINDS.flatMap((kind) => {
    const entry = evidenceFor(topic, kind)
    return entry === null ? [] : [{ kind, entry }]
  })
}

/**
 * Whether the card should draw squares at all.
 *
 * A topic with nothing recorded shows nothing — three empty squares on every card
 * would be noise on a library where most topics will never carry evidence.
 */
export function hasEvidence(topic: Topic): boolean {
  return evidenceEntries(topic).length > 0
}

/**
 * A quiz never carries evidence, so its section is absent rather than empty.
 *
 * A quiz is a retrieval device, not a concept: there is nothing to rebuild and
 * nothing to apply. The database refuses it too, so this is the same rule said
 * twice rather than a convention held up by the UI alone.
 */
export function takesEvidence(topic: Topic): topic is TopicRecord {
  return topic.kind === 'topic'
}

/**
 * Today, as the browser's calendar sees it.
 *
 * NOT `toISOString().slice(0, 10)`, which is UTC and therefore gives yesterday or
 * tomorrow depending on the hour and the zone — wrong for some hours of every day,
 * in a field whose whole point is that you record this when you do it.
 *
 * It takes `now` rather than reading the clock, the rule the rest of the domain
 * already follows: `filterTopics` takes its clock and `orderForPractice` takes an
 * injected shuffle. A default computed inside the dialog would be untestable
 * exactly where it is wrong.
 */
export function localDateString(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export interface EvidenceFormInput {
  note: string
  at: string
  url: string
}

export type ParsedEvidence =
  | { error: string; value?: undefined }
  | { error?: undefined; value: { at: string; note: string; url: string | null } }

/**
 * Reading the record dialog, on the server as well as in the browser.
 *
 * `required` on an input is a courtesy to the person, not a guarantee to an
 * action — anything that can sign in can POST to one. Pure, so the rules are
 * testable without a form, a request or a database.
 */
export function parseEvidenceForm(input: EvidenceFormInput): ParsedEvidence {
  const note = input.note.trim()
  const at = input.at.trim()
  const url = input.url.trim()

  // The note is what makes it evidence. A date on its own records nothing.
  if (note === '') return { error: 'Say what you did — a date on its own records nothing.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at)) return { error: 'Give the date you did it.' }

  /*
    Round-tripped, not parsed. `Date.parse('2026-02-31')` does NOT fail — it rolls
    over to March 3 — so a plain isNaN check accepts a date that does not exist and
    silently stores a different one. Rebuilding the string from the parsed parts is
    what catches the rollover.
  */
  const [year, month, day] = at.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return { error: 'That is not a real date.' }
  }

  /*
    A URL or nothing. Checked by parsing rather than by a pattern, and restricted
    to http(s) so a `javascript:` string cannot be stored and later rendered as a
    link. The field is the entire integration with any document — an ADR, a PR, a
    gist — so it is the one place a hostile string could arrive.
  */
  if (url !== '') {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return { error: 'That link is not a URL. Paste the whole thing, including https://.' }
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'Links have to be http or https.' }
    }
  }

  return { value: { at, note, url: url === '' ? null : url } }
}

/**
 * The three columns one marker owns, for a write that records or clears it.
 *
 * The return type names the actual columns rather than `Record<string, ...>`, so
 * a typo in a key is a compile error and the update stays type-checked against the
 * generated row. A loose index signature type-checks and then writes nothing.
 */
export type EvidenceColumn = `${EvidenceKind}_at` | `${EvidenceKind}_note` | `${EvidenceKind}_url`

/** Every evidence column, derived — the boundary test reads this rather than a list. */
export const EVIDENCE_COLUMNS: EvidenceColumn[] = EVIDENCE_KINDS.flatMap((kind) => [
  `${kind}_at` as const,
  `${kind}_note` as const,
  `${kind}_url` as const,
])

export type EvidenceUpdate = Partial<Record<EvidenceColumn, string | null>>

export function evidenceColumns(
  kind: EvidenceKind,
  entry: { at: string; note: string; url: string | null } | null,
): EvidenceUpdate {
  return {
    [`${kind}_at`]: entry?.at ?? null,
    [`${kind}_note`]: entry?.note ?? null,
    [`${kind}_url`]: entry?.url ?? null,
  }
}
