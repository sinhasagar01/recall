/**
 * Interview mode: the pure rules of a round.
 *
 * No clock, no fetch, no Supabase. The transport lives in `lib/ai/`, the reads
 * in `lib/data/interview.ts`, and the conversation lives in the browser and is
 * never written anywhere.
 *
 * A round deliberately carries no `confidence` and no `last_practiced_at`: the
 * score is about the round, never about what you know, and the queue must have
 * nothing to order one by. Asserted in `interview-boundary.test.ts`.
 */

/** Session one ships five. DSA and System design arrive with their runners. */
export const ROUND_TYPES = ['javascript', 'react', 'typescript', 'behavioural', 'mixed'] as const
export type RoundType = (typeof ROUND_TYPES)[number]

export const LEVELS = ['friendly', 'staff', 'skeptical'] as const
export type Level = (typeof LEVELS)[number]

export const LENGTHS = [20, 45, 60, 90] as const
export type Length = (typeof LENGTHS)[number]

/**
 * Type plus duration sets the structure — never a minutes-per-question slider.
 * Forty-five minutes of concepts is eight questions with follow-ups.
 */
export function questionCount(minutes: Length): number {
  return { 20: 4, 45: 8, 60: 11, 90: 16 }[minutes]
}

/** Three hints a round, each visible on the scorecard. */
export const HINTS_PER_ROUND = 3

/**
 * The conversation is resent every turn, so a round is quadratic in exchanges.
 * The cap lives here beside the estimate that displays it, and the runner refuses
 * the next exchange rather than the model doing so.
 */
export const EXCHANGE_CAP = 40

/**
 * And a byte cap, because the exchange cap alone stops being the binding one.
 *
 * A server action body is limited to 1 MB and the whole transcript crosses it
 * each turn. Measured: a typical exchange is ~1.25 KB, so forty is ~49 KB — 5% of
 * the limit. Reaching 1 MB needs ~26 KB per exchange, about 4,400 words per
 * answer, forty times over.
 *
 * Not close today. It is enforced anyway because session two's DSA round pastes
 * source code into the transcript, and that arithmetic is completely different —
 * this is the cap that will bind first, and it should already exist when it does.
 */
export const TRANSCRIPT_BYTE_CAP = 512_000

export type Speaker = 'interviewer' | 'you'

export interface Turn {
  speaker: Speaker
  text: string
  /** Which topic the exchange is about, so session two can save a quiz from it. */
  topicId: string | null
  /** A clarifying question is never scored as a wrong answer. */
  kind: 'question' | 'answer' | 'follow-up' | 'clarification' | 'clarification-answer' | 'hint'
}

/**
 * ── Counted in code, never judged by a model ────────────────────────────────
 * Anything countable is counted here. The model is asked for judgement about what
 * was said and nothing else, and these are rendered BESIDE the scores rather than
 * mixed into them — so a wrong count is a visible disagreement rather than a
 * silently different number.
 *
 * `answered` counts answers, not clarifications: **asking is never scored as a
 * wrong answer**, which is the whole reason `Ask a question` is its own action.
 */
export interface RoundCounts {
  asked: number
  answered: number
  followUpsOffered: number
  followUpsHeld: number
  questionsAsked: number
  hintsUsed: number
}

export function countRound(turns: Turn[]): RoundCounts {
  /*
    Only YOUR turns count for the things you did.

    The first version counted by kind alone, and the interviewer's reply to a hint
    request also carries kind `hint` — so one click showed "2 hints used" on the
    scorecard. Found by looking at the rendered page beside the reference, not by
    any test: both numbers were plausible and nothing asserted the difference.
  */
  const yours = turns.filter((turn) => turn.speaker === 'you')
  const of = (kind: Turn['kind']) => yours.filter((turn) => turn.kind === kind).length

  /* Offered BY the interviewer — the one count that is not yours. */
  const followUpsOffered = turns.filter(
    (turn) => turn.speaker === 'interviewer' && turn.kind === 'follow-up',
  ).length
  /*
    A follow-up is HELD when an answer follows it before the next question or
    follow-up. Counted positionally rather than flagged, so it cannot disagree
    with the transcript it is derived from.
  */
  let followUpsHeld = 0
  for (const [index, turn] of turns.entries()) {
    if (turn.kind !== 'follow-up') continue
    const next = turns.slice(index + 1).find((later) => later.kind !== 'clarification' && later.kind !== 'clarification-answer' && later.kind !== 'hint')
    if (next?.kind === 'answer') followUpsHeld += 1
  }

  return {
    asked: turns.filter((turn) => turn.speaker === 'interviewer' && turn.kind === 'question').length,
    answered: of('answer'),
    followUpsOffered,
    followUpsHeld,
    questionsAsked: of('clarification'),
    hintsUsed: of('hint'),
  }
}

/** The four dimensions, in the order the scorecard shows them. */
export const DIMENSIONS = ['recall', 'depth', 'precision', 'enquiry'] as const
export type Dimension = (typeof DIMENSIONS)[number]

export interface QuestionResult {
  topicId: string | null
  title: string
  score: number
  /** Model prose. Rendered once, never stored. */
  note: string
}

export interface Scorecard {
  scores: Record<Dimension, number>
  overall: number
  /** Model prose. Rendered once, never stored. */
  summary: string
  notes: Record<Dimension, string>
  questions: QuestionResult[]
}

export type ScorecardResult =
  | { ok: true; scorecard: Scorecard }
  | { ok: false; reason: string }

const asScore = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100 ? value : null

const asText = (value: unknown): string =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : ''

/**
 * A malformed scorecard is a readable error, never a partial row.
 *
 * The same contract as `parseExtraction`: every number is validated into 0–100
 * here, so a model returning 137 is refused at the boundary rather than rendering
 * as a bar wider than its track — and the database refuses it too, which is the
 * second of the two gates rather than the only one.
 */
export function parseScorecard(text: string, titles: Map<string, string>): ScorecardResult {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text) as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'The scorecard came back unreadable. Nothing was saved.' }
  }

  const scores = {} as Record<Dimension, number>
  for (const dimension of DIMENSIONS) {
    const score = asScore((raw[dimension] as { score?: unknown })?.score ?? raw[dimension])
    if (score === null) {
      return { ok: false, reason: `The scorecard's ${dimension} was not a number from 0 to 100.` }
    }
    scores[dimension] = score
  }

  const overall = asScore(raw.overall)
  if (overall === null) {
    return { ok: false, reason: 'The scorecard had no overall score from 0 to 100.' }
  }

  const notes = {} as Record<Dimension, string>
  for (const dimension of DIMENSIONS) {
    notes[dimension] = asText((raw[dimension] as { note?: unknown })?.note)
  }

  const questions = (Array.isArray(raw.questions) ? raw.questions : []).flatMap(
    (entry): QuestionResult[] => {
      if (typeof entry !== 'object' || entry === null) return []
      const item = entry as Record<string, unknown>
      const score = asScore(item.score)
      const topicId = typeof item.topic_id === 'string' ? item.topic_id : null
      if (score === null) return []
      return [
        {
          topicId,
          title: asText(item.title) || (topicId ? (titles.get(topicId) ?? 'a question') : 'a question'),
          score,
          note: asText(item.note),
        },
      ]
    },
  )

  return { ok: true, scorecard: { scores, overall, summary: asText(raw.summary), notes, questions } }
}

/**
 * Below this, a question is offered for marking weak, ticked by default.
 *
 * The scorecard OFFERS and you confirm — nothing here writes, and the threshold
 * only decides what arrives ticked. Unticking is one click, and the reference's
 * third row is unticked because the person disagreed, which is what the checkbox
 * is for.
 */
export const OFFER_BELOW = 60

export interface Offer {
  topicId: string
  title: string
  note: string
  /** Ticked by default below the threshold; still a checkbox either way. */
  ticked: boolean
  /** Whether this question was re-asked after the round. Never changes `ticked`. */
  rewound: boolean
}

/**
 * The offers, and what a rewind does to them: **nothing automatic.**
 *
 * `ticked` still comes from the ORIGINAL score, because that is what the round
 * found and the round is the artefact. A rewind is information you were given
 * after the fact, so it appears on the row and you decide — which is the same
 * rule as everywhere else here: the scorecard offers and you confirm.
 *
 * ── The key is the question's index, not the offer's ────────────────────────
 * Offers are a FILTERED view of questions — those with a topic id — so the two
 * lists have different lengths and different positions. Keying a rewind by its
 * position in the offers would silently annotate the wrong row as soon as any
 * question came back without a topic id. The index is captured before the
 * filter, deliberately.
 */
export function offersFrom(
  scorecard: Scorecard,
  rewound: ReadonlySet<number> = new Set(),
): Offer[] {
  return scorecard.questions
    .map((question, index) => ({ question, index }))
    .filter(
      (entry): entry is { question: QuestionResult & { topicId: string }; index: number } =>
        entry.question.topicId !== null,
    )
    .map(({ question, index }) => ({
      topicId: question.topicId,
      title: question.title,
      note: question.note,
      ticked: question.score < OFFER_BELOW,
      rewound: rewound.has(index),
    }))
}

/**
 * Whether a question may be re-asked.
 *
 * Below the offer threshold, and not already re-asked. `OFFER_BELOW` is reused
 * rather than a second threshold invented: the reference draws Rewind on the 41
 * and the 33 and not on the 64, which is exactly this line.
 *
 * **Once per question is the weakest of the three things that stop a retry.** The
 * stored score cannot move — asserted byte-identical — and a round is never
 * resumed, so the scorecard does not exist tomorrow. This one only stops the room
 * becoming a grinder inside the session it lives in.
 */
export function canRewind(score: number, alreadyRewound: boolean): boolean {
  return score < OFFER_BELOW && !alreadyRewound
}

/**
 * A re-asked question's own small result. **Never stored.**
 *
 * It lives in the scorecard's state for as long as the page does and is written
 * nowhere — the same rule as the conversation. The round row is inserted once, at
 * the end, and is never written again; `interview-boundary.test.ts` asserts there
 * is no update to it anywhere in the tree.
 *
 * The cost, stated: tomorrow's sparkline cannot tell you that you went back.
 */
export interface RewindResult {
  /** Index into `Scorecard.questions` — the list is immutable for this page's life. */
  questionIndex: number
  question: string
  answer: string
  score: number
  /** Model prose. Rendered once, never stored. */
  note: string
}

export type RewindScoreResult =
  | { ok: true; score: number; note: string }
  | { ok: false; reason: string }

/** One number and one line, for one answer. The same contract as the scorecard. */
export function parseRewindScore(text: string): RewindScoreResult {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text) as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'The rewind came back unreadable. Your round is unchanged.' }
  }

  const score = asScore(raw.score)
  if (score === null) {
    return { ok: false, reason: 'The rewind had no score from 0 to 100. Your round is unchanged.' }
  }

  return { ok: true, score, note: asText(raw.note) }
}

/**
 * A drafted quiz, before you have looked at it.
 *
 * ── This parse enforces the database's own shape rule ───────────────────────
 * `topics_shape_is_consistent` requires a quiz to have two or more options and a
 * `correct_option` inside them. Checking it here means a malformed draft is a
 * readable sentence on the screen you are standing on, rather than a constraint
 * violation from an insert — the same reason `parseScorecard` bounds 0-100 rather
 * than letting the CHECK do it. Two gates, and this is the first.
 *
 * Note what is NOT checked: that the distractors are wrong and the answer right.
 * No parse can know that, which is exactly why the draft is shown to you before
 * it is saved.
 */
export interface QuizDraft {
  question: string
  options: string[]
  correctOption: number
  /** Becomes the quiz's `mental_model` — one field, one register, as arc 6 set. */
  explanation: string
  /** Which saved topic the follow-up was about, so the quiz can point at it. */
  topicId: string | null
}

export type QuizDraftResult = { ok: true; draft: QuizDraft } | { ok: false; reason: string }

/** A quiz needs at least this many options, and the database agrees. */
export const MIN_OPTIONS = 2

export function parseQuizDraft(text: string): QuizDraftResult {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(text) as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'The draft came back unreadable. Nothing was saved.' }
  }

  const question = asText(raw.question)
  if (question === '') {
    return { ok: false, reason: 'The draft had no question. Nothing was saved.' }
  }

  const options = (Array.isArray(raw.options) ? raw.options : [])
    .map((option) => asText(option))
    .filter((option) => option !== '')

  if (options.length < MIN_OPTIONS) {
    return {
      ok: false,
      reason: `A quiz needs at least ${MIN_OPTIONS} options and the draft had ${options.length}. Nothing was saved.`,
    }
  }

  /*
    Bounded against the options that SURVIVED the filter above, not against the
    raw array. A draft with a blank option and `correct_option: 3` would
    otherwise pass here and be refused by the CHECK, which is the failure this
    function exists to move earlier.
  */
  const correctOption =
    typeof raw.correct_option === 'number' && Number.isInteger(raw.correct_option)
      ? raw.correct_option
      : null

  if (correctOption === null || correctOption < 0 || correctOption > options.length - 1) {
    return { ok: false, reason: 'The draft did not say which option was correct. Nothing was saved.' }
  }

  return {
    ok: true,
    draft: {
      question,
      options,
      correctOption,
      explanation: asText(raw.explanation),
      topicId: typeof raw.topic_id === 'string' && raw.topic_id !== '' ? raw.topic_id : null,
    },
  }
}

/** The band label beside the ring. Words, so the number is not the only signal. */
export function scoreBand(overall: number): string {
  if (overall >= 85) return 'Strong — would clear a bar raiser'
  if (overall >= 70) return 'Solid — would pass a screen'
  if (overall >= 50) return 'Mixed — knew it, could not defend it'
  return 'Thin — the follow-ups found the edges'
}

/**
 * The cost, as a RANGE and never a figure — arc 6's rule, for arc 6's reason: how
 * much comes back is the thing being paid to find out.
 *
 * Computed from the cap and the question count rather than from a guess about
 * answer length, and shown before you enter.
 */
export function estimateRoundCost(minutes: Length): {
  lowTokens: number
  highTokens: number
  lowUsd: number
  highUsd: number
} {
  const questions = questionCount(minutes)
  /* Each exchange resends everything before it: 1+2+…+n, the quadratic. */
  const exchanges = Math.min(EXCHANGE_CAP, questions * 3)
  const perExchange = 320
  const resent = ((exchanges * (exchanges + 1)) / 2) * perExchange

  const lowTokens = Math.round(resent * 0.8)
  const highTokens = Math.round(resent * 1.25)

  /* Vendor facts, and they go stale — see lib/domain/extraction.ts. */
  const IN = 2 / 1_000_000
  const OUT = 8 / 1_000_000

  return {
    lowTokens,
    highTokens,
    lowUsd: lowTokens * IN + questions * 220 * OUT,
    highUsd: highTokens * IN + questions * 600 * OUT,
  }
}
