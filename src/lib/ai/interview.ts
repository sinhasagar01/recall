import 'server-only'

import { chat } from '@/lib/ai/client'
import {
  parseQuizDraft,
  parseRewindScore,
  parseScorecard,
  parseTurn,
  type Level,
  type QuizDraftResult,
  type RewindScoreResult,
  type RoundType,
  type ScorecardResult,
  type Turn,
  type TurnReplyResult,
} from '@/lib/domain/interview'

/**
 * Interview mode's prompts and its parse. **The key lives in `lib/ai/client.ts`.**
 *
 * Two calls: one per turn, and one at the end for the scorecard. Neither writes
 * anything and neither can — no module on this path has a database client, which
 * `ai-boundary.test.ts` asserts.
 */

/**
 * ── Level changes the PROMPT and never the scoring ──────────────────────────
 * A skeptical principal is harder to satisfy and does not make your score lower;
 * the dimensions measure what you said, not who asked. That is a rule about two
 * strings, so it is enforced by there being two strings: this one varies, and
 * `SCORING_PROMPT` below is a constant a unit test renders at all three levels
 * and requires to be identical.
 */
const LEVEL_PROMPT: Record<Level, string> = {
  friendly:
    'You are a friendly senior engineer. Nudge when they stall, accept a good direction, and follow up once where an answer leaves an opening.',
  staff:
    'You are a staff engineer, terse. No encouragement and no filler. Follow up twice where an answer leaves an opening.',
  skeptical:
    'You are a skeptical principal engineer. Push on every claim until they either concede or hold the position with a reason.',
}

const ROUND_PROMPT: Record<RoundType, string> = {
  javascript: 'Ask about JavaScript, from the topics supplied.',
  react: 'Ask about React, from the topics supplied.',
  typescript: 'Ask about TypeScript, from the topics supplied.',
  dsa:
    'Set ONE data-structures-and-algorithms problem at a time, of medium difficulty, stated in two sentences. They write code in an editor and send it with their answer. Once they have written something, ask about complexity, where it comes from, and what breaks — that is where the round is. Never ask them to run it: nothing is executed.',
  design:
    'Set ONE system design problem and work through it in four phases: requirements, high-level shape, a deep dive, then scaling it a hundred times. Press on the choices they make. When a phase has been covered properly, say so in your reply and set `phase_done`.',
  behavioural:
    'Ask about the decisions and incidents supplied, which are from their own project ledger. Ask what they did and why, and push on the trade-off.',
  mixed: 'Mix the topics supplied, moving between them the way a real loop does.',
}

/**
 * ── The one rule DSA has to break, and it is the central one ───────────────
 * *Every question must come from the material supplied* is what makes "nothing
 * is asked that you have not saved" true, and it has been true for every round
 * type until now. Your library has no DSA problems in it, so a DSA round
 * generates them — and the alternative, pretending a problem came from a topic,
 * is the fake this product refuses.
 *
 * So the exception is stated rather than left implicit: in the prompt here, on
 * the setup card where DSA is chosen, and in the reference's rules. A function
 * rather than a constant because exactly one line differs, and a second copy of
 * the other nine would drift.
 */
const roomRules = (roundType: RoundType) => [
  'You ask ONE thing at a time and wait.',
  roundType === 'dsa'
    ? 'You invent the problems: their library contains none, and this is the only round where that is true. Never claim a problem came from something they saved.'
    : 'Every question must come from the material supplied. Never invent a topic they have not saved.',
  'A follow-up arrives when an answer leaves an opening — not on a fixed count.',
  'If they ask a clarifying question, ANSWER it and then return to your question. Asking is not a wrong answer and must never be treated as one.',
  'If they ask for a hint, give one that points at the shape of the answer without stating it.',
  'Never grade, never score, never say how they are doing. That happens once, at the end, elsewhere.',
  'Reply as JSON: `say` is the next thing you say, plain prose with no preamble, labels or markdown.',
  '`topic_id` is the id in brackets of the supplied topic you are asking about, copied exactly.',
  'Use null for topic_id when you are giving a hint or answering a clarifying question rather than asking.',
  'NEVER invent an id. If the exchange is about none of the supplied topics, use null.',
  ...(roundType === 'design'
    ? [
        '`phase_done` is true only when the phase you are in has been covered properly, and false otherwise.',
        'You do NOT name or number phases. Saying a phase is done is all you decide; moving is not yours.',
      ]
    : []),
].join('\n')

const TURN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['say', 'topic_id', 'phase_done'],
  properties: {
    say: { type: 'string' },
    topic_id: { type: ['string', 'null'] },
    /*
      Design rounds only, and required for all of them because a strict schema
      cannot make a field conditional. Every other type sends false and the room
      ignores it — cheaper than two schemas that would drift.
    */
    phase_done: { type: 'boolean' },
  },
} as const

/**
 * ── The scoring prompt is a CONSTANT ────────────────────────────────────────
 * It takes no level and no round type. "Interviewer level is a prompt, not a
 * multiplier" is only true if the scoring half cannot see the level, and the way
 * to make that true is for there to be nothing to pass it through.
 *
 * It also asks for judgement and nothing else: every countable thing — answered,
 * follow-ups held, hints used, questions asked — is counted by `countRound` from
 * the transcript and rendered beside these numbers, never mixed into them.
 */
const SCORING_PROMPT = [
  'Score this interview transcript on four dimensions, each 0-100.',
  '',
  'recall     — did they know what things were? Definitions, mechanisms, names.',
  'depth      — did they hold up under follow-ups, or go thin when asked for a consequence?',
  'precision  — were the answers exact, or true-but-vague enough to be unfalsifiable?',
  'enquiry    — did they ask clarifying questions, and were they load-bearing? Asking counts FOR them.',
  '',
  'Also give an overall 0-100; a `verdict` of at most eight words naming the single shape of the',
  'round ("Strong on mechanism, thin on consequence"); a one-or-two-sentence `summary` saying where',
  'they were strong and where they went thin; a note per dimension; and a per-question result with',
  'its topic_id and a score.',
  '',
  'Score what was SAID. Do not consider who was asking or how hard they pushed.',
  'Do not count anything — how many questions there were, how many hints were used, how many',
  'follow-ups were held. Those are counted elsewhere and your count would only disagree.',
].join('\n')

const SCORECARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recall', 'depth', 'precision', 'enquiry', 'overall', 'verdict', 'summary', 'questions'],
  properties: {
    ...Object.fromEntries(
      ['recall', 'depth', 'precision', 'enquiry'].map((dimension) => [
        dimension,
        {
          type: 'object',
          additionalProperties: false,
          required: ['score', 'note'],
          properties: { score: { type: 'integer' }, note: { type: 'string' } },
        },
      ]),
    ),
    overall: { type: 'integer' },
    verdict: { type: 'string' },
    summary: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic_id', 'title', 'score', 'note'],
        properties: {
          topic_id: { type: ['string', 'null'] },
          title: { type: 'string' },
          score: { type: 'integer' },
          note: { type: 'string' },
        },
      },
    },
  },
} as const

const asMessages = (turns: Turn[]) =>
  turns.map((turn) => ({
    role: turn.speaker === 'you' ? ('user' as const) : ('assistant' as const),
    content: turn.text,
  }))

export type TurnOutcome = { ok: true; text: string } | { ok: false; reason: string }

/**
 * What the interviewer says next, and which topic it is about.
 *
 * Structured rather than plain text since issue #25: the room's tag row has to
 * name the topic and say whether you grade it weak, and nothing else in the
 * round knows. `Turn.topicId` existed for this from the first day and was never
 * populated — see `parseTurn` for the full account.
 */
export async function nextTurn(
  input: {
    roundType: RoundType
    level: Level
    material: string
    turns: Turn[]
    /** 'hint' and 'clarify' change what this turn is for, not who is asking. */
    intent: 'ask' | 'follow' | 'hint' | 'clarify'
  },
  fetchImpl: typeof fetch = fetch,
): Promise<TurnReplyResult> {
  const intent = {
    ask: 'Ask the next question.',
    follow: 'Respond to what they just said. Follow up if it left an opening.',
    hint: 'They asked for a hint. Give one, then wait.',
    clarify: 'They asked a clarifying question. Answer it, then return to your question.',
  }[input.intent]

  const outcome = await chat(
    {
      system: [
        LEVEL_PROMPT[input.level],
        ROUND_PROMPT[input.roundType],
        roomRules(input.roundType),
        '',
        'The material you may ask about:',
        input.material,
        '',
        intent,
      ].join('\n'),
      messages: asMessages(input.turns),
      maxOutputTokens: 700,
      schema: { name: 'interviewer_turn', schema: TURN_SCHEMA },
      whatWasLost: 'The round is still going — try again, or leave.',
    },
    fetchImpl,
  )

  if (!outcome.ok) return { ok: false, reason: outcome.reason }

  return parseTurn(outcome.content)
}

/*
  ── Everything below this comment must stay ABOVE `scoreRound` ──────────────

  `interview-boundary.test.ts` proves the scoring prompt cannot see the
  interviewer level. Its last clause does so by finding the declaration of
  `scoreRound`, slicing from there to the END OF THE FILE, and asserting the
  slice never contains the word "level". So anything written below that function
  which mentions a level fails a test about a rule it has nothing to do with.

  That is the "coupled to location" weakness in ARCHITECTURE.md coming due as a
  constraint on unrelated work. It is respected here rather than widened — see
  that entry for what fixing it would take, and why that is its own change.

  This comment cannot spell that declaration out, either: the anchor is a plain
  `indexOf`, so writing the exact phrase in prose ABOVE the function moves the
  slice to the prose. It did, on the first attempt, and the failure named
  `scoreRound` while pointing at a comment.
*/

const DRAFT_PROMPT = [
  'A candidate could not answer the follow-up below. Turn it into a multiple-choice quiz they can practise.',
  '',
  'The question is the follow-up, rewritten to stand alone — it will be read months later with no transcript.',
  'Give 4 options: one correct, three wrong in ways someone who half-knows this would actually be wrong.',
  'A distractor nobody would pick teaches nothing.',
  'The explanation is one or two sentences saying WHY the answer is right. It becomes the card they read.',
  '',
  'Also give the topic_id of the supplied topic this follow-up was about, exactly as it appears in brackets.',
  'Return null for topic_id if it was about none of them. Never invent an id.',
].join('\n')

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['question', 'options', 'correct_option', 'explanation', 'topic_id'],
  properties: {
    question: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
    correct_option: { type: 'integer' },
    explanation: { type: 'string' },
    topic_id: { type: ['string', 'null'] },
  },
} as const

/**
 * Draft a quiz from a follow-up, and say which topic it came from.
 *
 * ── Why the attribution rides along here ────────────────────────────────────
 * Saving mid-round needs to know which saved topic the follow-up was about, and
 * `Turn.topicId` is typed but never populated (issue #25). The alternative was
 * making every turn a structured call so it could be tagged — a change to the
 * turn transport, the e2e stub and session one's five specs, to obtain something
 * exactly one action needs. This call has to be schema'd anyway, so it carries
 * the attribution at no extra cost, by the same mechanism `scoreRound` already
 * uses to attribute questions to topics.
 *
 * Nothing here writes, and nothing here can: this module has no database client.
 */
export async function draftQuiz(
  input: { followUp: string; answer: string; material: string },
  fetchImpl: typeof fetch = fetch,
): Promise<QuizDraftResult> {
  const outcome = await chat(
    {
      system: [DRAFT_PROMPT, '', 'The topics they have saved:', input.material].join('\n'),
      messages: [
        {
          role: 'user',
          content: `FOLLOW-UP: ${input.followUp}\n\nWHAT THEY SAID: ${input.answer}`,
        },
      ],
      maxOutputTokens: 700,
      schema: { name: 'quiz_draft', schema: DRAFT_SCHEMA },
      whatWasLost: 'Nothing was saved — the round is still going.',
    },
    fetchImpl,
  )

  if (!outcome.ok) return { ok: false, reason: outcome.reason }

  return parseQuizDraft(outcome.content)
}

/**
 * Re-ask one question. Plain text, exactly like the room.
 *
 * The round is over, so this is deliberately NOT counted against `EXCHANGE_CAP`:
 * the cap bounds a round's quadratic transcript, and a rewind is two messages
 * with no history behind them.
 */
export async function reaskOne(
  input: { title: string; note: string },
  fetchImpl: typeof fetch = fetch,
): Promise<TurnOutcome> {
  const outcome = await chat(
    {
      system: [
        'Ask one question on this topic, at interview difficulty, aimed at the gap described below.',
        'Rephrased so it cannot be answered from memory of the original wording, and testing the same thing.',
        'One question. No preamble, no encouragement, no markdown.',
      ].join('\n'),
      messages: [
        { role: 'user', content: `TOPIC: ${input.title}\n\nWHERE THEY WENT THIN: ${input.note}` },
      ],
      maxOutputTokens: 300,
      whatWasLost: 'Your round is unchanged — the score was already saved.',
    },
    fetchImpl,
  )

  return outcome.ok ? { ok: true, text: outcome.content } : { ok: false, reason: outcome.reason }
}

const REASK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['score', 'note'],
  properties: { score: { type: 'integer' }, note: { type: 'string' } },
} as const

/**
 * Score one re-asked answer, on its own.
 *
 * A number and a line, for this answer only. **It never reaches the stored
 * round** — the row was inserted once, at the end, and nothing updates it. The
 * result lives in the scorecard's state and dies with the page.
 */
export async function scoreOne(
  input: { question: string; answer: string },
  fetchImpl: typeof fetch = fetch,
): Promise<RewindScoreResult> {
  const outcome = await chat(
    {
      system: [
        'Score this single answer 0-100 on how well it holds up, and give one sentence saying why.',
        'Score what was said. This is one answer, not a round — do not compare it to anything.',
      ].join('\n'),
      messages: [{ role: 'user', content: `QUESTION: ${input.question}\n\nANSWER: ${input.answer}` }],
      maxOutputTokens: 300,
      schema: { name: 'rewind_score', schema: REASK_SCHEMA },
      whatWasLost: 'Your round is unchanged.',
    },
    fetchImpl,
  )

  if (!outcome.ok) return { ok: false, reason: outcome.reason }

  return parseRewindScore(outcome.content)
}

/** The scorecard, once, at the end. Judgement only. */
export async function scoreRound(
  turns: Turn[],
  titles: Map<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<ScorecardResult> {
  const outcome = await chat(
    {
      system: SCORING_PROMPT,
      messages: [
        {
          role: 'user',
          content: turns
            .map((turn) => `${turn.speaker === 'you' ? 'CANDIDATE' : 'INTERVIEWER'} [${turn.kind}]${turn.topicId ? ` (topic ${turn.topicId})` : ''}: ${turn.text}`)
            .join('\n\n'),
        },
      ],
      maxOutputTokens: 1600,
      schema: { name: 'scorecard', schema: SCORECARD_SCHEMA },
      whatWasLost: 'The round is not saved without a scorecard.',
    },
    fetchImpl,
  )

  if (!outcome.ok) return { ok: false, reason: outcome.reason }

  return parseScorecard(outcome.content, titles)
}
