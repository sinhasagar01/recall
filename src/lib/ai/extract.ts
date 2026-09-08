import 'server-only'

import { chat, hasKey } from '@/lib/ai/client'
import {
  MAX_OUTPUT_TOKENS,
  parseExtraction,
  type ParseResult,
} from '@/lib/domain/extraction'

/**
 * Extraction's prompt and its parse. **The key lives in `lib/ai/client.ts`.**
 *
 * This module held the key until arc 7 needed a second feature to call a model.
 * Widening `ai-boundary.test.ts`'s allowlist to two files was the obvious move
 * and the wrong one — an allowlist that grows once grows again — so the transport
 * moved to `client.ts` instead and the allowlist still has one entry while
 * covering two features.
 *
 * What is left here is what was always specific to extraction: the schema, the
 * instruction not to invent a mental model, and `parseExtraction`.
 */

/**
 * The schema the model must answer in.
 *
 * `strict: true` makes the SHAPE the model's problem. It does not make the
 * CONTENT trustworthy, which is why `parseExtraction` validates every field it
 * will render anyway — a title can still be blank, and `correct_option` can
 * still point past the end of `options`.
 */
const CONCEPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['concepts'],
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'definition',
          'mental_model',
          'when_not_to_use',
          'timestamp',
          'questions',
        ],
        properties: {
          title: { type: 'string' },
          definition: { type: 'string' },
          mental_model: { type: ['string', 'null'] },
          when_not_to_use: { type: ['string', 'null'] },
          timestamp: { type: ['string', 'null'] },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['question', 'options', 'correct_option'],
              properties: {
                question: { type: 'string' },
                options: { type: 'array', items: { type: 'string' } },
                correct_option: { type: 'integer' },
              },
            },
          },
        },
      },
    },
  },
} as const

/**
 * Transcription of teaching, not invention.
 *
 * The one line that matters is the instruction NOT to author. These courses give
 * a mental model; extracting the instructor's is the same act as extracting the
 * definition — someone else's words, attributed to the source. Writing one that
 * the video did not contain is the thing this whole arc is on the far side of a
 * line from, so the prompt says so and the field is nullable rather than
 * required-and-filled.
 */
const SYSTEM_PROMPT = [
  'You extract what a video taught, from its transcript. You are transcribing teaching, not inventing it.',
  '',
  'For every distinct concept the transcript teaches, return: a title; a definition in the instructor\'s terms;',
  'the mental model, analogy or intuition the INSTRUCTOR gave for it; a "when not to use it" if the video offers',
  'one; the approximate timestamp; and two or three questions with one correct answer and plausible distractors.',
  '',
  'Rules:',
  '- If the video gave no mental model for a concept, return null. Do NOT write one. A model you invent is one',
  '  the learner has never had, and it is worse than nothing because it reads exactly like one they were taught.',
  '- Same for "when not to use it": null unless the video offers it.',
  '- Skip housekeeping — roadmaps, introductions, sign-offs, and anything that is not a concept.',
  '- Distractors must be wrong but tempting: things a learner would plausibly believe.',
].join('\n')

export type ExtractOutcome =
  | { ok: true; result: ParseResult }
  | { ok: false; reason: string }

/** Re-exported so callers keep one import; the check itself lives in client.ts. */
export { hasKey }

/**
 * One call. Returns data; writes nothing, and cannot — neither this module nor
 * `client.ts` has a database client, which `ai-boundary.test.ts` asserts.
 */
export async function extractConcepts(
  transcript: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExtractOutcome> {
  const outcome = await chat(
    {
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: transcript }],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      schema: { name: 'concepts', schema: CONCEPT_SCHEMA },
      whatWasLost: 'Nothing was saved; try again, or distil by hand.',
    },
    fetchImpl,
  )

  if (!outcome.ok) return { ok: false, reason: outcome.reason }

  return { ok: true, result: parseExtraction(outcome.content, outcome.finishReason) }
}

