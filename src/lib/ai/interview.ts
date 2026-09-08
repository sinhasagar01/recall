import 'server-only'

import { chat } from '@/lib/ai/client'
import {
  parseScorecard,
  type Level,
  type RoundType,
  type ScorecardResult,
  type Turn,
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
  behavioural:
    'Ask about the decisions and incidents supplied, which are from their own project ledger. Ask what they did and why, and push on the trade-off.',
  mixed: 'Mix the topics supplied, moving between them the way a real loop does.',
}

const ROOM_RULES = [
  'You ask ONE thing at a time and wait.',
  'Every question must come from the material supplied. Never invent a topic they have not saved.',
  'A follow-up arrives when an answer leaves an opening — not on a fixed count.',
  'If they ask a clarifying question, ANSWER it and then return to your question. Asking is not a wrong answer and must never be treated as one.',
  'If they ask for a hint, give one that points at the shape of the answer without stating it.',
  'Never grade, never score, never say how they are doing. That happens once, at the end, elsewhere.',
  'Reply with the next thing you say, as plain text. No preamble, no labels, no markdown.',
].join('\n')

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
  'Also give an overall 0-100, a one-or-two-sentence summary of where they were strong and where',
  'they went thin, a note per dimension, and a per-question result with its topic_id and a score.',
  '',
  'Score what was SAID. Do not consider who was asking or how hard they pushed.',
  'Do not count anything — how many questions there were, how many hints were used, how many',
  'follow-ups were held. Those are counted elsewhere and your count would only disagree.',
].join('\n')

const SCORECARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recall', 'depth', 'precision', 'enquiry', 'overall', 'summary', 'questions'],
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

/** What the interviewer says next. Plain text, one thing at a time. */
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
): Promise<TurnOutcome> {
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
        ROOM_RULES,
        '',
        'The material you may ask about:',
        input.material,
        '',
        intent,
      ].join('\n'),
      messages: asMessages(input.turns),
      maxOutputTokens: 700,
      whatWasLost: 'The round is still going — try again, or leave.',
    },
    fetchImpl,
  )

  return outcome.ok ? { ok: true, text: outcome.content } : { ok: false, reason: outcome.reason }
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
