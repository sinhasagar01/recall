import 'server-only'

import {
  MAX_OUTPUT_TOKENS,
  parseExtraction,
  type ParseResult,
} from '@/lib/domain/extraction'

/**
 * The only module in this application that names the key or the vendor.
 *
 * `ai-boundary.test.ts` asserts that, the way `secret-key-boundary.test.ts`
 * asserts it for the Supabase secret key: an allowlist of exactly one file,
 * checked by walking `src/`. The browser never sees the key and never talks to
 * OpenAI — every call arrives here through a server action.
 *
 * `import 'server-only'` is the second lock. The grep fails the suite; this
 * fails the build the moment a client component imports this file, which is the
 * failure that arrives first and reads most clearly.
 *
 * ── Why a plain fetch and no SDK ─────────────────────────────────────────────
 * One POST with a JSON body. An SDK would add a dependency, a second retry
 * policy, and a second place for a key to be read from the environment — and the
 * thing being tested here is our behaviour around the call, which is easier to
 * hold with the transport injectable.
 */

/** Vendor facts, gathered so re-checking them is one edit. */
const DEFAULT_BASE_URL = 'https://api.openai.com'
const DEFAULT_MODEL = 'gpt-4.1'

/**
 * `OPENAI_BASE_URL` is the standard override for a proxy or a compatible host,
 * and it is what the e2e suite points at a local stub.
 *
 * Worth being explicit that this is NOT a test backdoor: it changes where the
 * request goes, it is the same code path in every environment, and it cannot
 * make the app skip the call or fabricate a result. The alternative — an
 * `if (process.env.NODE_ENV === 'test')` branch returning canned concepts — would
 * mean the thing under test is not the thing that ships.
 */
const endpoint = () =>
  `${(process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '')}/v1/chat/completions`

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

/** Whether the feature exists at all. No key means no button, not a disabled one. */
export function hasKey(): boolean {
  return (process.env.OPENAI_API_KEY ?? '').trim() !== ''
}

/**
 * HTTP status to something a person can act on.
 *
 * Every one of these names what to do next rather than what went wrong, and none
 * of them suggests the problem is with Recall — out of credit is genuinely not,
 * and saying so is the difference between a message and an apology.
 */
function messageFor(status: number): string {
  if (status === 401 || status === 403) {
    return 'The OpenAI key was rejected. Nothing was sent to your library, and the manual path still works.'
  }
  if (status === 429) {
    return 'Your OpenAI credit is exhausted, or the rate limit was hit. Nothing in Recall is affected — top up at platform.openai.com, or distil by hand.'
  }
  if (status >= 500) {
    return 'OpenAI did not respond. Nothing was saved; try again, or distil by hand.'
  }
  return `The request was refused (${status}). Nothing was saved.`
}

/**
 * One call. Returns data; writes nothing, and cannot — it has no database client.
 *
 * `fetchImpl` is injected so tests never reach the network. That is a mock of the
 * TRANSPORT, not of a Supabase client, and it is the one place in this repo where
 * mocking is the correct choice — see the note at the injection point in
 * `extract.test.ts`.
 */
export async function extractConcepts(
  transcript: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExtractOutcome> {
  const key = (process.env.OPENAI_API_KEY ?? '').trim()
  if (key === '') return { ok: false, reason: 'No OpenAI key is configured.' }

  let response: Response
  try {
    response = await fetchImpl(endpoint(), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: transcript },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'concepts', strict: true, schema: CONCEPT_SCHEMA },
        },
      }),
    })
  } catch {
    return { ok: false, reason: 'Could not reach OpenAI. Nothing was saved.' }
  }

  if (!response.ok) return { ok: false, reason: messageFor(response.status) }

  let body: {
    choices?: { message?: { content?: string }; finish_reason?: string }[]
  }
  try {
    body = (await response.json()) as typeof body
  } catch {
    return { ok: false, reason: 'OpenAI returned something that was not JSON.' }
  }

  const choice = body.choices?.[0]
  const content = choice?.message?.content
  if (typeof content !== 'string') {
    return { ok: false, reason: 'OpenAI returned no content.' }
  }

  return { ok: true, result: parseExtraction(content, choice?.finish_reason ?? 'stop') }
}
