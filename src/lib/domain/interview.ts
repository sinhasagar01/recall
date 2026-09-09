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

/**
 * The round's name as a person writes it, not as the enum is stored.
 *
 * Rendering the enum raw put "javascript · 20 minutes" in an h1, caught by
 * looking at the page beside the drawing. It lives here rather than in a
 * component because two screens now say it — the room's topic tag and the
 * scorecard's heading — and two copies would drift.
 */
export const ROUND_LABEL: Record<string, string> = {
  javascript: 'JavaScript',
  react: 'React',
  typescript: 'TypeScript',
  dsa: 'DSA',
  design: 'System design',
  behavioural: 'Behavioural',
  mixed: 'Mixed',
}

/** Seven. DSA and System design arrived with their runners, in session three. */
export const ROUND_TYPES = [
  'javascript',
  'react',
  'typescript',
  'dsa',
  'design',
  'behavioural',
  'mixed',
] as const
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

/**
 * DSA counts problems, not concepts, and far fewer of them.
 *
 * Writing a solution and then defending its complexity is fifteen to thirty
 * minutes of one problem — so twenty minutes is one, and ninety is three rather
 * than the sixteen concepts the same ninety minutes buys. The unit of the round
 * changes, which is why this is its own function and not a divisor applied to
 * `questionCount`.
 *
 * The upper bound is also the `code` column's CHECK. Both say three; the column
 * says it because a runner that asked four would otherwise write a fourth
 * solution nobody can see.
 */
export function problemCount(minutes: Length): number {
  return { 20: 1, 45: 2, 60: 2, 90: 3 }[minutes]
}

/**
 * A design round is four movements at every length.
 *
 * The phases stretch; the count does not. Twenty minutes is a rushed design
 * round, not a two-phase one — the shape of the conversation is the same and you
 * have less time for each part of it.
 *
 * Generic on purpose. The reference draws phase three as "Permissions & audit",
 * which is the DRAWN EXAMPLE's deep dive rather than the phase's name — reading
 * a worked example's label as the specification is the mistake recorded against
 * this same file's line 151.
 */
export const PHASES = [
  'Requirements',
  'High-level shape',
  'Deep dive',
  'Scale it 100×',
] as const
export type Phase = (typeof PHASES)[number]

/**
 * The minute range under each phase, stretched to the round's length.
 *
 * The fractions are read off the reference's sixty-minute strip — 0–10, 10–25,
 * 25–45, 45–60 — which is 1/6, 1/4, 1/3, 1/4. A deep dive is the longest
 * movement and requirements the shortest, at every length.
 *
 * A guide the clock does not enforce, exactly as the advisory clock does not end
 * a round: nothing here advances a phase, and the last window always ends at the
 * round's length so the strip cannot claim time the round does not have.
 */
export function phaseWindows(minutes: Length): { from: number; to: number }[] {
  const shares = [1 / 6, 1 / 4, 1 / 3, 1 / 4]
  const windows: { from: number; to: number }[] = []
  let from = 0

  for (const [index, share] of shares.entries()) {
    /*
      The last window is pinned to the length rather than accumulated, so
      rounding never leaves the strip ending at 59 or 61 on a 60-minute round.
    */
    const to = index === shares.length - 1 ? minutes : Math.round(from + minutes * share)
    windows.push({ from, to })
    from = to
  }

  return windows
}

/**
 * Forward only, one at a time, and it is the CLIENT that decides.
 *
 * A design round is a conversation and you cannot un-say the requirements, so
 * there is no way back. Either you press the advance or the interviewer reports
 * the phase finished — and in the second case the model says only THAT it is
 * done, never which phase comes next. Naming would let it skip or reverse; this
 * is the same rule as never inventing a topic id, one field over.
 *
 * Clamped at the last phase rather than wrapping or erroring: a model that keeps
 * saying "done" past the end should leave the round in its final phase, not
 * crash the room or start it again.
 */
export function advancePhase(current: number): number {
  return Math.min(Math.max(current, 0) + 1, PHASES.length - 1)
}

/**
 * What a round type has to draw on, and how the card says it.
 *
 * Three shapes, because the three kinds of round count different things and the
 * reference draws each differently: concepts count topics, weak and quizzes;
 * behavioural counts decisions and incidents separately, because a ledger with
 * three decisions and no incidents is a different round from one with both;
 * mixed does not count at all and says "everything above", since restating the
 * sum of four cards directly beneath them tells you nothing.
 *
 * A function rather than four fields on a props object, so the sentence and the
 * thin test are decided in one place and tested without a browser.
 */
export interface Pool {
  /** Concepts: topics in the category. Behavioural: decisions in the ledger. */
  topics: number
  weak: number
  /** Concepts only. */
  quizzes: number
  /** Behavioural only. */
  incidents: number
  /*
    System design only — three ledger kinds, each identified by a column rather
    than inferred. There is deliberately no "design-shaped topics" count: a
    topic's category is free text, nothing marks one as design material, and a
    keyword list over what the user typed would be a claim the app cannot check.
    With none of these three the round is thin, and the card says so.
  */
  adrs: number
  diagrams: number
  exercises: number
}

export interface PoolLine {
  /** The count, drawn in the type's own tone. */
  lead: string
  /** Everything after it, in the muted ink. */
  rest: string
  /** Said honestly, before you press, rather than starting a round that cannot fill. */
  thin: boolean
}

export function poolLine(type: RoundType, pool: Pool, questions: number | null): PoolLine {
  if (type === 'mixed') {
    /* No count: it is the sum of the cards directly above it. */
    return { lead: 'everything', rest: ' above', thin: false }
  }

  /*
    ── DSA is the one type that draws on nothing ────────────────────────────
    Its problems are generated, because your library has no DSA problems in it
    and pretending otherwise would be the fake this product refuses. So the line
    ignores the pool entirely — the way `mixed` does, for the opposite reason —
    and it is never thin: a generated round always fills.

    It names the exception here rather than only in the page's sub-line, because
    this card is where someone choosing DSA is looking. The sub-line says an
    exception exists; this says it is this one.
  */
  if (type === 'dsa') {
    const n = questions ?? 0
    return {
      lead: `${n} ${n === 1 ? 'problem' : 'problems'}`,
      rest: ' · generated, not from your library · your code is kept',
      thin: false,
    }
  }

  /*
    ── System design draws on the ledger, and is thin without it ────────────
    ADRs, diagrams and scale exercises. Thin is a real state here and it is the
    honest one: without them there is nothing to defend, and the alternative was
    a keyword heuristic over free-text categories claiming to have found
    "design-shaped topics".
  */
  if (type === 'design') {
    const material = pool.adrs + pool.diagrams + pool.exercises
    if (material === 0) {
      return { lead: '0 ADRs', rest: ', 0 diagrams — nothing to draw on', thin: true }
    }
    return {
      lead: `${pool.adrs} ${pool.adrs === 1 ? 'ADR' : 'ADRs'}`,
      rest:
        `${pool.diagrams > 0 ? ` · ${pool.diagrams} ${pool.diagrams === 1 ? 'diagram' : 'diagrams'}` : ''}` +
        `${pool.exercises > 0 ? ` · ${pool.exercises} scale ${pool.exercises === 1 ? 'exercise' : 'exercises'}` : ''}`,
      thin: false,
    }
  }

  const thin = questions !== null && pool.topics + pool.incidents < questions

  if (type === 'behavioural') {
    return {
      lead: `${pool.topics} ${pool.topics === 1 ? 'decision' : 'decisions'}`,
      rest: `, ${pool.incidents} ${pool.incidents === 1 ? 'incident' : 'incidents'}`,
      thin,
    }
  }

  return {
    lead: `${pool.topics} ${pool.topics === 1 ? 'topic' : 'topics'}`,
    rest: `${pool.weak > 0 ? ` · ${pool.weak} weak` : ''}${pool.quizzes > 0 ? ` · ${pool.quizzes} quizzes` : ''}`,
    thin,
  }
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
  /**
   * `skip` is you moving on, and it is NOT an answer.
   *
   * Its own kind for the same reason `clarification` is: `countRound` counts
   * `answered` by kind, so folding a skip into `answer` would inflate the one
   * number the scorecard is judged against. Leaving a question is a real move
   * and it is not a wrong answer either — it is simply not an answer.
   */
  kind:
    | 'question'
    | 'answer'
    | 'follow-up'
    | 'clarification'
    | 'clarification-answer'
    | 'hint'
    | 'skip'
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

/**
 * `mm:ss`, for a duration measured in seconds. Minutes are not capped at 60 —
 * a ninety-minute round reads `92:14` rather than pretending to be an hour.
 */
export function clockOf(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** One question in the round, as the transcript alone can describe it. */
export interface QuestionOutline {
  /** For looking the title up in the room's topic map. Null if none was named. */
  topicId: string | null
  followUpsOffered: number
  followUpsHeld: number
}

/**
 * The question list, derived from turns and nothing else.
 *
 * The scoring screen needs the shape of *Question by question* before any score
 * exists: how many rows, in what order, about what, with how many follow-ups
 * each. All of that is in the transcript already — only the numbers are pending.
 *
 * Deliberately the same positional reasoning as `countRound`, one scope down. A
 * follow-up belongs to the question above it, and it is HELD when an answer
 * follows it before the next question or follow-up, skipping the turns that are
 * neither — a hint, a clarification, and the reply to one. Written as one shared
 * predicate rather than twice, so the per-question counts cannot sum to
 * something the round total disagrees with.
 */
export function outlineRound(turns: Turn[]): QuestionOutline[] {
  const outline: QuestionOutline[] = []

  for (const [index, turn] of turns.entries()) {
    if (turn.speaker !== 'interviewer' || turn.kind !== 'question') continue

    const rest = turns.slice(index + 1)
    const nextQuestion = rest.findIndex(
      (later) => later.speaker === 'interviewer' && later.kind === 'question',
    )
    const window = nextQuestion === -1 ? rest : rest.slice(0, nextQuestion)

    let offered = 0
    let held = 0
    for (const [at, inner] of window.entries()) {
      if (inner.kind !== 'follow-up') continue
      offered += 1
      if (answeredAfter(window, at)) held += 1
    }

    outline.push({ topicId: turn.topicId, followUpsOffered: offered, followUpsHeld: held })
  }

  return outline
}

/** Whether the next turn that is not an aside is an answer. */
function answeredAfter(turns: Turn[], index: number): boolean {
  const next = turns
    .slice(index + 1)
    .find(
      (later) =>
        later.kind !== 'clarification' &&
        later.kind !== 'clarification-answer' &&
        later.kind !== 'hint',
    )
  return next?.kind === 'answer'
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

  /*
    ── `answered` counts QUESTIONS answered, not answers given ───────────────
    It counted `kind === 'answer'`, which includes every answer to a follow-up.
    One question with three follow-ups therefore reported `answered = 4` against
    `asked = 1`, and the round could not be saved:

        23514 · violates check constraint "interview_rounds_counts_reconcile"

    That constraint exists because the reference's own hero claimed 11 of 14
    follow-ups held over a list whose ceiling was 9 — a figure counting cannot
    produce. It was written to stop an impossible number reaching a row, and the
    first impossible number it caught was one of ours.

    A question is answered if an answer follows it before the next question.
    Symmetric with `followUpsHeld` below, and it cannot exceed `asked` by
    construction rather than by care.
  */
  let answered = 0
  for (const [index, turn] of turns.entries()) {
    if (turn.speaker !== 'interviewer' || turn.kind !== 'question') continue

    const rest = turns.slice(index + 1)
    const next = rest.findIndex((later) => later.speaker === 'interviewer' && later.kind === 'question')
    const window = next === -1 ? rest : rest.slice(0, next)

    if (window.some((later) => later.speaker === 'you' && later.kind === 'answer')) answered += 1
  }

  return {
    asked: turns.filter((turn) => turn.speaker === 'interviewer' && turn.kind === 'question').length,
    answered,
    followUpsOffered,
    followUpsHeld,
    questionsAsked: of('clarification'),
    hintsUsed: of('hint'),
  }
}

/**
 * How many follow-ups this interviewer presses for, or null where there is no
 * ceiling.
 *
 * The same three numbers `LEVEL_PROMPT` states in prose — friendly follows up
 * once, staff twice, a skeptical principal until you concede or hold. Held here
 * so the room's tag and the prompt cannot drift apart; the drawing's
 * "follow-up 2 of 3" over a staff round is an example, and the ceiling is the
 * rule.
 */
export const FOLLOW_UP_CEILING: Record<Level, number | null> = {
  friendly: 1,
  staff: 2,
  skeptical: null,
}

/**
 * Which follow-up you are on, for the current question.
 *
 * Counted from the transcript rather than tracked, so it cannot disagree with
 * what is on screen — the same rule `countRound` follows.
 */
export function followUpsOnCurrent(turns: Turn[]): number {
  const lastQuestion = turns.map((turn) => turn.kind).lastIndexOf('question')
  return turns
    .slice(lastQuestion + 1)
    .filter((turn) => turn.speaker === 'interviewer' && turn.kind === 'follow-up').length
}

/** The room's follow-up tag, or null when there is nothing to say yet. */
export function followUpTag(level: Level, turns: Turn[]): string | null {
  const nth = followUpsOnCurrent(turns)
  if (nth === 0) return null

  const ceiling = FOLLOW_UP_CEILING[level]

  /*
    No total where there is no ceiling — and none where the ceiling has been
    passed either. The prompt asks a staff interviewer to follow up twice; it is
    an instruction, not a constraint, and a third arrives. Rendering "follow-up
    3 of 2" puts a figure on screen that cannot be true, which is the same
    failure the reference made and this project recorded.
  */
  if (ceiling === null || nth > ceiling) return `follow-up ${nth}`
  return `follow-up ${nth} of ${ceiling}`
}

/**
 * The progress pips: one per question, filling behind you.
 *
 * **They do not grade you.** The reference fills them green, amber or rose —
 * which is the room scoring you question by question, and `ROOM_RULES` forbids
 * this surface from grading, scoring or saying how you are doing. Scoring happens
 * once, at the end, elsewhere. So a pip is done, current, or not yet.
 */
export type PipState = 'done' | 'now' | 'todo'

export function pipState(index: number, answered: number): PipState {
  if (index < answered) return 'done'
  return index === answered ? 'now' : 'todo'
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
  /**
   * The one-line verdict, and the paragraph under it. Two fields because the
   * drawing has two: a headline you read at a glance and the sentences that
   * justify it. Collapsing them into one made the hero a heading with nothing
   * beneath it and a wide empty column beside the numeral.
   *
   * Both are model prose, rendered once and never stored.
   */
  verdict: string
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
 * A uuid, or null. **Not "any string".**
 *
 * The model is handed topics as `[uuid] Title` and asked to give the id back. It
 * does not always: production returned `"arrow-function-this"` and
 * `"js-serialization-structuredclone-vs-json"` — plausible, well-formed, and not
 * uuids. Those reached a `uuid[]` column and every round save failed 22P02.
 *
 * The scores were bounded here from the first day and the ids were not, which is
 * the asymmetry worth naming: a number that is obviously a number invites
 * validation, and a string that is obviously a string does not.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const asUuid = (value: unknown): string | null =>
  typeof value === 'string' && UUID.test(value.trim()) ? value.trim().toLowerCase() : null

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
      /*
        A uuid or nothing — never "any string".

        Every score here was bounded 0-100 from the first day and this was not,
        and the asymmetry cost the feature: the real model answers
        "arrow-function-this" where it was handed `[uuid] Title`, that reached a
        `uuid[]` column, and EVERY round save in production failed 22P02 from the
        day interview mode shipped. `interview_rounds` had 0 rows and always had.

        Dropped rather than rejected: a question whose topic could not be
        identified is still a scored question, and losing the round over an
        attribution would be the worse trade. The scorecard says so on the row.
      */
      const topicId = asUuid(item.topic_id)
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

  return {
    ok: true,
    scorecard: {
      scores,
      overall,
      /* A missing verdict falls back to the band rather than leaving a gap. */
      verdict: asText(raw.verdict) || scoreBand(overall),
      summary: asText(raw.summary),
      notes,
      questions,
    },
  }
}

/**
 * What the interviewer says, and which topic it is about.
 *
 * ── Why the room's turn is a structured call now ────────────────────────────
 * `Turn.topicId` was typed from the first day of interview mode and populated at
 * none of its five construction sites — a field that reads as available, is
 * commented as available, and is always null. Two consumers read it: the
 * transcript serializer's `(topic …)` branch, which could never be taken, and the
 * round's `topic_ids`, which was silently always empty.
 *
 * Session two-a routed around it by having `draftQuiz` return the attribution,
 * which left one fewer feature needing it to stop being a lie. This populates it,
 * because the room's tag row has to say WHICH topic you are being asked about and
 * whether you grade it weak — and a tag row that reads from your library is the
 * difference between an interviewer and a question bank.
 */
export interface TurnReply {
  text: string
  /** Null when the reply is a hint or an answer to a clarification. */
  topicId: string | null
  /** Design rounds only. The model says a phase is done; it never says which. */
  phaseDone: boolean
}

export type TurnReplyResult = { ok: true; reply: TurnReply } | { ok: false; reason: string }

export function parseTurn(raw: string): TurnReplyResult {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'The interviewer’s reply came back unreadable. Try again.' }
  }

  const text = asText(parsed.say)
  if (text === '') {
    return { ok: false, reason: 'The interviewer said nothing. Try again.' }
  }

  /*
    An unrecognised id is dropped, not rejected. A turn whose topic could not be
    identified is still a turn worth having — the tag row simply says less. The
    round is not worth losing over an attribution.
  */
  /*
    `phase_done` is the design round's one extra field, and it is deliberately
    the only thing the model gets to say about phases. It reports that THIS phase
    is finished; it never names or numbers the next one, because naming would let
    it skip or reverse and the room is the thing that owns forward-only.

    Absent or malformed reads as false, which is the safe direction: a missing
    field leaves you where you are, and you can always press the advance
    yourself. The opposite default would move the round on a parse failure.
  */
  return {
    ok: true,
    reply: {
      text,
      topicId: asUuid(parsed.topic_id),
      phaseDone: parsed.phase_done === true,
    },
  }
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

/** The hero meter: twenty segments, one per five points. */
export const METER_SEGMENTS = 20

/**
 * Which segments are lit, and which is the tip.
 *
 * Floor, not round — 74 lights fourteen of twenty and marks the fourteenth,
 * which is what the drawing shows. A meter that rounds up would claim a point
 * the round did not earn.
 */
export function meterSegments(overall: number): { on: boolean; tip: boolean }[] {
  const lit = Math.max(0, Math.min(METER_SEGMENTS, Math.floor(overall / (100 / METER_SEGMENTS))))
  return Array.from({ length: METER_SEGMENTS }, (_, index) => ({
    on: index < lit,
    tip: index === lit - 1,
  }))
}

/**
 * The three bands a score falls in, for the bar colours.
 *
 * Both thresholds already exist — `scoreBand`'s 70, and `OFFER_BELOW`. Reusing
 * them is the point rather than a saving: the drawing puts a rose bar on exactly
 * the rows that carry a Rewind button, and that is true here *because both read
 * the same constant* instead of two numbers that happen to agree today.
 */
export type Tone = 'hi' | 'mid' | 'lo'

export function scoreTone(score: number): Tone {
  if (score >= 70) return 'hi'
  return score < OFFER_BELOW ? 'lo' : 'mid'
}

/**
 * A sparkline column's label. `now` is taken rather than computed, so this stays
 * pure and a test does not have to mock the clock.
 */
export function sparkLabel(iso: string, now: Date): string {
  const then = new Date(iso)
  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()

  if (sameDay) return 'today'
  return `${then.getDate()} ${then.toLocaleString('en-GB', { month: 'short' })}`
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
