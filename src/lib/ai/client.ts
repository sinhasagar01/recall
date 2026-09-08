import 'server-only'

/**
 * The ONLY module in this application that names the key or the vendor.
 *
 * `ai-boundary.test.ts` asserts exactly that, with an allowlist of one file. Arc 7
 * needed a second feature to call a model, and the obvious move — widen the
 * allowlist to two files — is the wrong one: **an allowlist that grows once grows
 * again, and its whole strength is its length.**
 *
 * So the transport moved here instead. `extract.ts` and `interview.ts` are now
 * prompt-and-parse modules that name neither the key nor the host, and the
 * allowlist still has one entry while covering two features. That is stronger
 * than it was, not weaker.
 *
 * `import 'server-only'` is the second lock: the grep fails the suite, this fails
 * the build the moment a client component imports it, which is the failure that
 * arrives first and reads most clearly.
 */

/** Vendor facts, gathered so re-checking them is one edit. */
const DEFAULT_BASE_URL = 'https://api.openai.com'
const DEFAULT_MODEL = 'gpt-4.1'

/**
 * `OPENAI_BASE_URL` is the standard override for a proxy or a compatible host,
 * and it is what the e2e suite points at a local stub.
 *
 * NOT a test backdoor: it changes where the request goes, it is the same code
 * path in every environment, and it cannot make the app skip a call or fabricate
 * a result. The alternative — a `NODE_ENV === 'test'` branch returning canned
 * data — would mean the thing under test is not the thing that ships.
 */
const endpoint = () =>
  `${(process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '')}/v1/chat/completions`

/** Whether the feature exists at all. No key means no button, not a disabled one. */
export function hasKey(): boolean {
  return (process.env.OPENAI_API_KEY ?? '').trim() !== ''
}

export type ChatOutcome =
  | { ok: true; content: string; finishReason: string }
  | { ok: false; reason: string }

/**
 * HTTP status to something a person can act on.
 *
 * Every one names what to do next rather than what went wrong, and none suggests
 * the problem is with Recall — out of credit is genuinely not, and saying so is
 * the difference between a message and an apology.
 *
 * `whatWasLost` is the caller's word for what did not happen, because "nothing
 * was saved" is right for extraction and wrong for a round that was never stored
 * in the first place.
 */
function messageFor(status: number, whatWasLost: string): string {
  if (status === 401 || status === 403) {
    return `The OpenAI key was rejected. ${whatWasLost}`
  }
  if (status === 429) {
    return `Your OpenAI credit is exhausted, or the rate limit was hit. Nothing in Recall is affected — top up at platform.openai.com. ${whatWasLost}`
  }
  if (status >= 500) {
    return `OpenAI did not respond. ${whatWasLost}`
  }
  return `The request was refused (${status}). ${whatWasLost}`
}

export interface ChatRequest {
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  maxOutputTokens: number
  /** A strict json_schema, when the caller needs a shape rather than prose. */
  schema?: { name: string; schema: unknown }
  /** What the caller tells a person did not happen, on failure. */
  whatWasLost: string
}

/**
 * One call. Returns text; writes nothing, and cannot — it has no database client,
 * which `ai-boundary.test.ts` asserts rather than assumes.
 *
 * `fetchImpl` is injected so unit tests never reach the network. That mocks the
 * TRANSPORT, not a Supabase client, and it is the one place in this repo where
 * mocking is correct: the assertions are about our behaviour around the call, and
 * a test that called a real model would be non-deterministic, cost money per run,
 * and go red when somebody else changed their weights.
 */
export async function chat(
  request: ChatRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatOutcome> {
  const key = (process.env.OPENAI_API_KEY ?? '').trim()
  if (key === '') return { ok: false, reason: 'No OpenAI key is configured.' }

  let response: Response
  try {
    response = await fetchImpl(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? DEFAULT_MODEL,
        max_completion_tokens: request.maxOutputTokens,
        messages: [{ role: 'system', content: request.system }, ...request.messages],
        ...(request.schema
          ? {
              response_format: {
                type: 'json_schema',
                json_schema: { ...request.schema, strict: true },
              },
            }
          : {}),
      }),
    })
  } catch {
    return { ok: false, reason: `Could not reach OpenAI. ${request.whatWasLost}` }
  }

  if (!response.ok) return { ok: false, reason: messageFor(response.status, request.whatWasLost) }

  let body: { choices?: { message?: { content?: string }; finish_reason?: string }[] }
  try {
    body = (await response.json()) as typeof body
  } catch {
    return { ok: false, reason: 'OpenAI returned something that was not JSON.' }
  }

  const choice = body.choices?.[0]
  const content = choice?.message?.content
  if (typeof content !== 'string') return { ok: false, reason: 'OpenAI returned no content.' }

  return { ok: true, content, finishReason: choice?.finish_reason ?? 'stop' }
}
