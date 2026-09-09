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
 *   contains "SLOW-ANSWER"  → the same reply, five seconds later
 *   otherwise               → three concepts, one of which duplicates a seeded topic
 *
 * Interview mode's calls are told apart by the SYSTEM prompt instead, because
 * that is what actually differs between them — see `interviewBody`.
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'

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

/*
  Arc 7. Interview mode makes two shapes of call through the same endpoint: a
  plain-text turn, and a strict-schema scorecard. They are told apart by the
  system prompt, because that is what actually differs — sniffing the schema name
  would couple this to a field the app could rename.
*/
const interviewBody = (system, messages) => {
  const STUB_TOPIC_IDS = topicIds()
  /*
    A DSA round's scorecard names no topics, because there are none.

    Not a convenience: the real model is given no material for a DSA round and
    has no ids to return, so a stub that returned seeded uuids here would be
    describing our parser rather than the service — the third instance of the
    error recorded in ARCHITECTURE.md, in the same file that records it. The
    rows are problems, and a problem is not a topic in the library.
  */
  const said = (messages ?? []).map((m) => m.content ?? '').join('\n')
  if (system.includes('Score this interview transcript') && /```ts|Next problem/.test(said)) {
    return {
      content: JSON.stringify({
        recall: 74, depth: 66, precision: 71, enquiry: 60, overall: 70,
        verdict: 'Correct, and thin on cost',
        summary: 'The solution was right. The complexity answer stopped at the shape.',
        recall_note: 'Knew the approach.',
        depth_note: 'Went thin on why the sort dominates.',
        precision_note: 'Exact about the loop.',
        enquiry_note: 'Asked nothing.',
        questions: [
          { topic_id: null, title: 'Merge overlapping intervals', score: 70, note: 'Right, and slower than it needed to be.' },
          { topic_id: null, title: 'Two-sum in one pass', score: 0, note: 'Not attempted.' },
        ],
      }),
      finish_reason: 'stop',
    }
  }

  if (system.includes('Score this interview transcript')) {
    /*
      A scorecard whose per-question scores straddle OFFER_BELOW, so the offer
      step has something ticked AND something unticked — the case the checkbox
      exists for.
    */
    return {
      content: JSON.stringify({
        recall: { score: 86, note: 'You knew what things were.' },
        depth: { score: 41, note: 'Thin the moment a follow-up asked for a consequence.' },
        precision: { score: 79, note: 'Mostly exact.' },
        enquiry: { score: 80, note: 'Both clarifying questions were load-bearing.' },
        overall: 74,
        verdict: 'Strong on mechanism, thin on consequence',
        summary:
          'You knew what things were, and went shallow the moment a follow-up asked what follows from them.',
        /*
          Index 2 and 4 deliberately — the seed makes those `okay` and `strong`,
          NOT weak.

          The first draft offered index 0, which the seed makes weak. Marking a
          weak topic weak changes nothing, so the spec's "rendering a scorecard
          must not change a confidence" compared weak to weak and could not fail:
          the perturbation that put the write on the render path passed clean.
          The assertion was vacuous because of the FIXTURE, which is the failure
          recorded in ARCHITECTURE.md as "vacuous fixture".
        */
        questions: [
          { topic_id: STUB_TOPIC_IDS[2] ?? null, title: 'Microtasks drain first', score: 41, note: 'Could not say why.' },
          { topic_id: STUB_TOPIC_IDS[4] ?? null, title: 'Task ordering on the stack', score: 88, note: 'Landed it.' },
        ],
      }),
      finish_reason: 'stop',
    }
  }

  /*
    Session two-a. Three more shapes through the same endpoint, told apart by the
    system prompt for the same reason as above.

    The draft returns a topic_id the SEED wrote, so the spec can assert the saved
    quiz points at a real row rather than at whatever the model felt like. Index 2
    is `Microtasks drain first` — the one the scorecard also scores 41, which is
    what makes it the question you would want to keep.
  */
  if (system.includes('could not answer the follow-up')) {
    return {
      content: JSON.stringify({
        question: 'What does the other closure see when one changes a captured variable?',
        options: [
          'The new value — they share one scope',
          'A copy taken when the closure was created',
          'Undefined, until the outer function returns',
          'Whatever it saw first, frozen',
        ],
        correct_option: 0,
        explanation: 'Both closures hold a reference to one binding, so a change through either is visible to the other.',
        topic_id: STUB_TOPIC_IDS[2] ?? null,
      }),
      finish_reason: 'stop',
    }
  }
  if (system.includes('Ask one question on this topic')) {
    return { content: 'Two closures, one scope: which sees a change made through the other?', finish_reason: 'stop' }
  }
  if (system.includes('Score this single answer')) {
    return {
      content: JSON.stringify({ score: 71, note: 'Got the shared-scope consequence this time.' }),
      finish_reason: 'stop',
    }
  }

  /*
    The room's turn is a structured call since issue #25 — `say` plus the topic it
    is about — so these answer with JSON. A hint and a clarification carry a null
    topic, exactly as the prompt asks: the model names a topic when it is ASKING,
    not when it is helping.

    The id is a real seeded uuid, not a slug. That distinction is the whole of
    what a stub can get wrong here — see ARCHITECTURE.md on a stub returning the
    shape the parser wants rather than the shape the vendor returns.
  */
  const last = messages.at(-1)?.content ?? ''
  /*
    `phase_done` is in every turn because the schema requires it of every round
    type — a strict schema cannot make a field conditional, and one schema that
    always carries it beats two that drift. The room ignores it unless the round
    is a design round.
  */
  const turn = (say, topicId = null, phaseDone = false) => ({
    content: JSON.stringify({ say, topic_id: topicId, phase_done: phaseDone }),
    finish_reason: 'stop',
  })

  /*
    The interviewer's own phase advance, chosen by what the spec types — the same
    way every other scenario here is chosen. It exists for one assertion: the
    room advances on the model's word as well as on yours, and it advances by
    exactly one because the model never says WHICH phase comes next.
  */
  if (last.includes('PHASE-DONE')) {
    return turn('Good. That is enough on this — let us move on.', null, true)
  }

  /*
    A DSA round opens with a PROBLEM, not a concept question.

    Without this the stub answered a DSA round with "Walk me through what a
    closure actually captures" under a DSA tag — a fixture describing the code's
    generic turn path rather than what the service would do when its system
    prompt says *set one data-structures problem at a time*. Third instance of
    the same error in this file, and the first found by looking at a screen
    rather than by a test.

    `topic_id` is null throughout, because a DSA round supplies no material and
    the model has no ids to return. That is the shape the vendor answers with,
    not the shape our parser hopes for.
  */
  if (system.includes('Set ONE data-structures')) {
    if (system.includes('Ask the next question')) {
      return turn('Second one: given a sorted array and a target, return the two indices that sum to it.')
    }
    if (system.includes('They asked for a hint')) {
      return turn('What does sorting cost you, and what does it buy you afterwards?')
    }
    if (system.includes('They asked a clarifying question')) {
      return turn('Assume the intervals are unsorted and may touch at the endpoints.')
    }
    if (last.includes('```ts')) {
      return turn('That works. What is the complexity, and where does it come from? And if the input arrived already sorted, could you do better?')
    }
    return turn('Merge all overlapping intervals and return the result. Write it, then I will ask about complexity and what breaks.')
  }

  /*
    And a design round opens on its first phase, asking for requirements rather
    than for a definition. Same reason.
  */
  if (system.includes('Set ONE system design problem')) {
    if (system.includes('Ask the next question')) {
      return turn('Good. Now the shape: what are the main services, and where does state live?')
    }
    if (system.includes('They asked for a hint')) {
      return turn('Start from who reads and who writes, and how often.')
    }
    return turn('Design a collaborative task app for fifty teams. Start with requirements: what must it do, and what can it refuse to do?')
  }

  if (system.includes('They asked for a hint')) {
    return turn('Think about what the scope is a reference to.')
  }
  if (system.includes('They asked a clarifying question')) {
    return turn('Same invocation. Good question.')
  }
  if (system.includes('Ask the next question')) {
    /*
      Moving on makes the model pick a NEW topic, and a real one invented an id:
      well-formed, plausible, and naming nothing we hold. That is what broke the
      room's tag, so the stub does it too — on the skip path only, so the opening
      question still names a seeded topic and every other spec is unaffected.

      The value matters. A slug would be caught by `asUuid`; this is a uuid, and
      the only thing wrong with it is that it is not ours. A stub returning the
      shape the parser wants is how the previous two attribution bugs survived.
    */
    if (last.includes('Move on.')) {
      /*
        ── Two skips, two shapes, and the FIRST is what the model really does ──
        Moving on makes the interviewer pick a new topic, and the ordinary case
        is that it picks a real one — an id we hold, for a topic that is not the
        one the round opened on. That is the case the room got wrong, and the
        first version of this stub never produced it: it returned an invented id,
        which is the input that exercises the FIX rather than the input that
        exercises the bug.

        So the first skip names a seeded topic, and the second keeps the invented
        one — a uuid naming nothing we hold, which `asUuid` cannot catch because
        the only thing wrong with it is that it is not ours.
      */
      const secondSkip = (messages.filter((m) => String(m.content).includes('Move on.')).length) > 1
      return secondSkip
        ? turn('And once more — what does the event loop do with a microtask?', '3f1c9a52-7b40-4e19-9d6a-0c1e5f8a2b77')
        : turn('Different tack — how does the stack order two queued callbacks?', STUB_TOPIC_IDS[4] ?? null)
    }
    return turn('Walk me through what a closure actually captures.', STUB_TOPIC_IDS[2] ?? null)
  }
  return turn(
    `So if two closures share one scope — what does the other see? (you said: ${last.slice(0, 30)})`,
    STUB_TOPIC_IDS[2] ?? null,
  )
}

/*
  The ids the scorecard offers to mark weak, written by the seed so the spec can
  assert the exact rows before and after pressing.

  Read PER REQUEST, not at startup: this server is launched by Playwright before
  globalSetup runs the seed, so anything captured at boot would be the previous
  run's ids — or nothing at all on a fresh checkout.
*/
const topicIds = () => {
  try {
    return JSON.parse(readFileSync(new URL('./.auth/stub-topics.json', import.meta.url), 'utf8'))
  } catch {
    return []
  }
}

/**
 * Which calls belong to interview mode, matched on the SYSTEM prompt because that
 * is what actually differs between them.
 *
 * ── Listed, and the list has to grow when the mode does ─────────────────────
 * This was two inline `system.includes(...)` checks. Session two-a added three
 * calls and every one of them fell through to the EXTRACTION branch, which
 * answered with a well-formed list of concepts — so `parseQuizDraft` reported
 * "the draft had no question" and the failure named the parser rather than the
 * router. An unmatched call does not error here; it gets a plausible answer to a
 * different question, which is the most expensive kind of wrong.
 *
 * Each marker is the shortest phrase unique to one prompt, with the call named
 * beside it, so adding one is deliberate rather than remembered.
 */
const INTERVIEW_CALLS = [
  'interview transcript', // scoreRound
  'ONE thing at a time', // nextTurn
  'could not answer the follow-up', // draftQuiz
  'Ask one question on this topic', // reaskOne
  'Score this single answer', // scoreOne
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

    let parsed = {}
    try {
      parsed = JSON.parse(raw)
    } catch {
      // handled below by the default scenario
    }
    const system = parsed.messages?.find((m) => m.role === 'system')?.content ?? ''

    const { content, finish_reason } = INTERVIEW_CALLS.some((marker) => system.includes(marker))
      ? interviewBody(system, parsed.messages ?? [])
      : body(transcript)

    /*
      A deliberately slow reply, chosen by what the spec types — the same way
      every other scenario here is chosen.

      It exists for one assertion: `End the round` must work WHILE a reply is in
      flight. That is not a state a fast stub can produce, and it is the state
      the control exists for.
    */
    /*
      A scoring call that fails, for the one screen that has to handle it.

      Gated on the SCORING marker specifically, not on the transcript alone, so
      the answer that carries the word still succeeds and the round reaches the
      point where scoring is what breaks.

      The body is OpenAI's real error envelope and the status is the real status
      — copied from the vendor's documented shape rather than from what our code
      does with it. A failure fixture invented from the consumer proves only that
      the consumer accepts it; see ARCHITECTURE.md.
    */
    if (system.includes('interview transcript') && transcript.includes('RATE-LIMIT')) {
      res.writeHead(429, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          error: {
            message: 'Rate limit reached for gpt-4o in organization org-xxxx on tokens per min.',
            type: 'tokens',
            param: null,
            code: 'rate_limit_exceeded',
          },
        }),
      )
      return
    }

    const delay = transcript.includes('SLOW-ANSWER') ? 5000 : 0

    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { content }, finish_reason }] }))
    }, delay)
  })
}).listen(PORT, () => {
  console.log(`openai stub listening on ${PORT}`)
})
