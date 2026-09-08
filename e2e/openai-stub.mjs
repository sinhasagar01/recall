/**
 * A stand-in for the OpenAI chat-completions endpoint, for the e2e suite.
 *
 * The app points at this through `OPENAI_BASE_URL`, which is the standard
 * override for a proxy or a compatible host — the same code path, the same
 * parsing, the same server action. Nothing in `src/` knows this exists.
 *
 * ── Why this is a mock and why that is correct here ─────────────────────────
 * The rule in this repo is that Supabase is never mocked: a test that mocks the
 * database asserts that our code called a function, which is not the thing worth
 * knowing. This is different in kind. The assertions built on it are about OUR
 * behaviour around the call — that nothing is written before Save, that a
 * partial response is offered rather than discarded, that duplicates arrive
 * unticked — and none of them is a claim about the model. A test that called a
 * real model would be non-deterministic, cost money per run, and fail when
 * someone else changed their weights.
 *
 * The transcript decides the response, so a spec chooses a scenario by what it
 * pastes rather than by a flag:
 *
 *   contains "PARTIAL-RUN"  → finish_reason "length", JSON cut mid-object
 *   contains "NOTHING-RUN"  → a valid, empty list
 *   contains "BROKEN-RUN"   → finish_reason "stop", unparseable body
 *   otherwise               → three concepts, one of which duplicates a seeded topic
 */
import { createServer } from 'node:http'

const PORT = Number(process.env.STUB_PORT ?? 4599)

const concept = (title, definition, timestamp, questions) => ({
  title,
  definition,
  mental_model: `${title}: the instructor's picture of it.`,
  when_not_to_use: null,
  timestamp,
  questions,
})

const QUESTIONS = [
  {
    question: 'What does a closure capture?',
    options: ['The variable itself, a live reference', 'A copy made at creation'],
    correct_option: 0,
  },
  {
    question: 'Why does a var loop log the same number?',
    options: ['One binding is shared', 'The body runs late'],
    correct_option: 0,
  },
]

const FULL = [
  concept('Closures hold a reference not a copy', 'A returned function keeps a live reference.', '05:31', QUESTIONS),
  concept('The temporal dead zone', 'A let binding cannot be read until its declaration runs.', '12:40', QUESTIONS),
  /*
    Deliberately the title of a topic the `few` fixture user already owns — see
    `title: 'The event loop'` in scripts/seed-e2e-user.mts — so the duplicate
    path is exercised by the same run that exercises the happy path.

    It must belong to whichever user the spec signs in as: `readLibraryTitles`
    reads through RLS, so a title owned by a different fixture is correctly
    invisible and the duplicate check correctly finds nothing.
  */
  concept('The event loop', 'Tasks, microtasks, and the order they run in.', '18:05', QUESTIONS),
]

const body = (transcript) => {
  if (transcript.includes('NOTHING-RUN')) {
    return { content: JSON.stringify({ concepts: [] }), finish_reason: 'stop' }
  }
  if (transcript.includes('BROKEN-RUN')) {
    return { content: 'Sure! Here are the concepts I found:', finish_reason: 'stop' }
  }
  if (transcript.includes('PARTIAL-RUN')) {
    // Two complete elements, then a third cut mid-object — what a real response
    // truncated by the output limit actually looks like.
    const whole = JSON.stringify({ concepts: FULL })
    return { content: whole.slice(0, whole.indexOf('"The temporal dead zone"') + 60), finish_reason: 'length' }
  }
  return { content: JSON.stringify({ concepts: FULL }), finish_reason: 'stop' }
}

createServer((req, res) => {
  // Playwright waits on this before starting the app.
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
    return
  }

  let raw = ''
  req.on('data', (chunk) => {
    raw += chunk
  })
  req.on('end', () => {
    let transcript = ''
    try {
      const parsed = JSON.parse(raw)
      transcript = parsed.messages?.find((m) => m.role === 'user')?.content ?? ''
    } catch {
      // An unparseable request body means the app sent something wrong, which
      // the default scenario will surface as an ordinary result.
    }

    const { content, finish_reason } = body(transcript)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason }] }))
  })
}).listen(PORT, () => {
  console.log(`openai stub listening on ${PORT}`)
})
