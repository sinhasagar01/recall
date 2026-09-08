/**
 * Creates the deterministic user the Playwright specs sign in as.
 *
 * Idempotent and safe to re-run: if the user already exists its password is reset
 * to the configured one, so a half-changed local database cannot leave the suite
 * failing for a reason that has nothing to do with the code.
 *
 * Uses the SECRET key, so it never runs in the browser and the variable carries no
 * NEXT_PUBLIC_ prefix. Run with: npm run seed:e2e
 */
import { createClient } from '@supabase/supabase-js'
import { LOCAL_MODE_MAX } from '../src/lib/domain/library-paging.ts'

process.loadEnvFile('.env.local')


const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const email = process.env.E2E_USER_EMAIL
const password = process.env.E2E_USER_PASSWORD
const emptyEmail = process.env.E2E_EMPTY_USER_EMAIL
const emptyPassword = process.env.E2E_EMPTY_USER_PASSWORD
const fewEmail = process.env.E2E_FEW_USER_EMAIL
const fewPassword = process.env.E2E_FEW_USER_PASSWORD
const extractEmail = process.env.E2E_EXTRACT_USER_EMAIL
const extractPassword = process.env.E2E_EXTRACT_USER_PASSWORD
const strongEmail = process.env.E2E_STRONG_USER_EMAIL
const strongPassword = process.env.E2E_STRONG_USER_PASSWORD
const largeEmail = process.env.E2E_LARGE_USER_EMAIL
const largePassword = process.env.E2E_LARGE_USER_PASSWORD

const missing = [
  ['NEXT_PUBLIC_SUPABASE_URL', url],
  ['SUPABASE_SECRET_KEY', secretKey],
  ['E2E_USER_EMAIL', email],
  ['E2E_USER_PASSWORD', password],
  ['E2E_EMPTY_USER_EMAIL', emptyEmail],
  ['E2E_EMPTY_USER_PASSWORD', emptyPassword],
  ['E2E_FEW_USER_EMAIL', fewEmail],
  ['E2E_FEW_USER_PASSWORD', fewPassword],
  ['E2E_EXTRACT_USER_EMAIL', extractEmail],
  ['E2E_EXTRACT_USER_PASSWORD', extractPassword],
  ['E2E_STRONG_USER_EMAIL', strongEmail],
  ['E2E_STRONG_USER_PASSWORD', strongPassword],
  ['E2E_LARGE_USER_EMAIL', largeEmail],
  ['E2E_LARGE_USER_PASSWORD', largePassword],
]
  .filter(([, value]) => !value)
  .map(([name]) => name)

if (missing.length > 0) {
  console.error(`Missing in .env.local: ${missing.join(', ')}. See .env.example.`)
  process.exit(1)
}

const admin = createClient(url!, secretKey!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: existing, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })

if (listError) {
  console.error(`Could not list users: ${listError.message}`)
  console.error('Is the local stack running? Try: supabase start')
  process.exit(1)
}

async function upsertUser(userEmail: string, userPassword: string): Promise<string> {
  const found = existing.users.find((user) => user.email === userEmail)

  if (found) {
    const { error } = await admin.auth.admin.updateUserById(found.id, {
      password: userPassword,
      email_confirm: true,
    })
    if (error) {
      console.error(`Could not reset ${userEmail}: ${error.message}`)
      process.exit(1)
    }
    console.log(`Seeded user already existed, password reset: ${userEmail}`)
    return found.id
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: userEmail,
    password: userPassword,
    // Local email confirmation is off (supabase/config.toml, enable_confirmations
    // = false). Set explicitly anyway so the seed does not silently depend on it.
    email_confirm: true,
  })
  if (error || !data.user) {
    console.error(`Could not create ${userEmail}: ${error?.message}`)
    process.exit(1)
  }
  console.log(`Seeded user created: ${userEmail}`)
  return data.user.id
}

const mainUserId = await upsertUser(email!, password!)
const emptyUserId = await upsertUser(emptyEmail!, emptyPassword!)
const fewUserId = await upsertUser(fewEmail!, fewPassword!)
const extractUserId = await upsertUser(extractEmail!, extractPassword!)
const strongUserId = await upsertUser(strongEmail!, strongPassword!)
const largeUserId = await upsertUser(largeEmail!, largePassword!)

/** Every fixture user, so a reset can never be written for only some of them. */
const FIXTURE_USER_IDS = [
  mainUserId,
  emptyUserId,
  fewUserId,
  extractUserId,
  strongUserId,
  largeUserId,
]

/*
  ── Sources, for EVERY fixture user, before anything is seeded ──────────────
  Topics are reset per user further down, each beside the fixture it belongs to.
  Sources were not, and for a while only the `extract` user's were cleared —
  because that is where the accumulation was first noticed.

  Fixing the instance and not the class meant `main` went on collecting sources
  on every run: nine copies of "Closures, in depth" under one chapter, which is
  invisible to every assertion in the suite and obvious the moment anyone looks
  at the page. That is the same "fixed the instance, not the class" failure
  recorded in ARCHITECTURE.md about the export's duplicate column list, made
  twice in two arcs.

  So it is one loop over one list, and adding a fixture cannot half-add it.
  `on delete set null` means topics keep their rows and lose the link, which is
  what the per-user topic resets below then clean up anyway.
*/
for (const userId of FIXTURE_USER_IDS) {
  const { error } = await admin.from('sources').delete().eq('user_id', userId)
  if (error) {
    console.error(`Could not clear sources for a fixture user: ${error.message}`)
    process.exit(1)
  }
}

/*
  Test isolation.

  The empty-library spec needs a user with no topics, and it must not be defeated
  by rows another spec left behind. Rather than resetting the database between
  runs — which would serialise the suite — a SECOND user exists that no spec ever
  writes to, and its topics are cleared here on every run. That keeps the four
  Playwright workers independent: add-topic specs use the main user and assert on
  a unique title they generated, never on a global count.
*/
const { error: clearError } = await admin.from('topics').delete().eq('user_id', emptyUserId)

if (clearError) {
  console.error(`Could not clear the empty-library user's topics: ${clearError.message}`)
  process.exit(1)
}
console.log(`Empty-library user cleared: ${emptyEmail}`)

/*
  The too-few-topics user: exactly two, always. Reset from scratch each run so the
  count is not one topic away from correct after a spec that went sideways. Two is
  below the practice minimum of three, which is the state under test.

  ── Both are backdated, deliberately ────────────────────────────────────────
  A fixture whose every row was created seconds ago cannot express any behaviour
  that depends on a date. Every other user here is seeded that way, which is why
  this one carries the library's date-dependent assertions: 30 and 40 days puts
  both outside RECENT_WINDOW_DAYS, so a topic saved during a spec is the only
  recent one and "newest first" is a claim the fixture can actually falsify.

  See ARCHITECTURE.md, "A fixture with no spread on a dimension cannot test that
  dimension".
*/
await admin.from('topics').delete().eq('user_id', fewUserId)

/** Shared by every backdated fixture below. One definition, so two cannot drift. */
const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

const { error: fewError } = await admin.from('topics').insert([
  {
    user_id: fewUserId,
    title: 'The event loop',
    definition: 'Microtasks drain before the next macrotask.',
    created_at: daysAgo(40),
  },
  {
    user_id: fewUserId,
    title: 'Specificity',
    definition: 'Which selector wins when two of them apply.',
    created_at: daysAgo(30),
  },
])

if (fewError) {
  console.error(`Could not seed the two-topic user: ${fewError.message}`)
  process.exit(1)
}
console.log(`Two-topic user reset: ${fewEmail}`)

/*
  The nothing-needs-review user: every topic at okay or better, so /weak shows its
  empty state for the reason the copy gives — not merely because the library is
  empty. Reset from scratch each run.

  It also straddles the staleness window, which makes it the month-two fixture:
  one topic settled long enough ago to have gone quiet, one settled recently. Both
  stamps are RELATIVE. They used to be absolute dates that happened to be far
  enough in the past to read as stale, which would have quietly stopped being true
  as the calendar moved — the fixture would have decayed instead of the data.
*/
await admin.from('topics').delete().eq('user_id', strongUserId)

const { error: strongError } = await admin.from('topics').insert([
  {
    user_id: strongUserId,
    title: 'Flexbox main axis',
    definition: 'Items lay out along the main axis, which flex-direction picks.',
    confidence: 'strong',
    practice_count: 4,
    // Comfortably past STALE_WINDOW_DAYS: this is the one that has gone quiet.
    last_practiced_at: daysAgo(120),
  },
  {
    user_id: strongUserId,
    title: 'Stacking contexts',
    definition: 'A new context is formed by opacity, transform and a few others.',
    confidence: 'okay',
    practice_count: 2,
    // Comfortably inside it: settled, and recent enough to leave alone.
    last_practiced_at: daysAgo(10),
  },
])

if (strongError) {
  console.error(`Could not seed the nothing-needs-review user: ${strongError.message}`)
  process.exit(1)
}
console.log(`Nothing-needs-review user reset: ${strongEmail}`)

/*
  ── The extraction fixture ──────────────────────────────────────────────────
  A sixth user, and the reason is worth stating: `extraction.spec.ts` is the only
  spec that SAVES topics and quizzes as part of what it asserts, and every other
  fixture has a shape those saves would break.

    main    a saved quiz is `new`, so it sorts to the front of the default queue
            and practice.spec's first card stops being a topic
    few     exactly two topics IS its purpose — a third lifts it over the
            practice minimum and the override test has nothing to override
    strong  "nothing needs review", which a `new` topic falsifies immediately
    empty   empty is the whole fixture
    large   read through SQL rather than locally, which is what it is for

  Both were tried before this one was written, and both broke a spec arc 6 never
  touched. A fixture whose purpose is "may be written to" is cheaper than a spec
  that has to clean up after itself, and much cheaper than one that quietly
  depends on running first.

  One seeded topic, so duplicate detection has something to find. Reset from
  scratch each run, so what the spec saves never accumulates.
*/
/* Sources for every fixture user are cleared above, in one loop. */
await admin.from('topics').delete().eq('user_id', extractUserId)

const { error: extractError } = await admin.from('topics').insert([
  {
    user_id: extractUserId,
    title: 'The event loop',
    definition: 'Tasks, microtasks, and the order they run in.',
    confidence: 'okay',
    practice_count: 1,
    last_practiced_at: daysAgo(3),
  },
])

if (extractError) {
  console.error(`Could not seed the extraction user: ${extractError.message}`)
  process.exit(1)
}
console.log(`Extraction user reset: ${extractEmail}`)

/*
  Storage isolation.

  Rows vanish with a db reset; objects do not. Paths are
  {user_id}/{topic_id}/{filename} and every spec-created topic gets a fresh uuid, so
  two runs can never collide on a name — but the fixture users would slowly
  accumulate files from runs whose topics were never deleted. Purge their folders
  here, the same way their rows are reset.

  The main user's objects are removed by the specs themselves: anything they upload
  belongs to a topic they also delete, and deleting a topic removes the object first.
*/
/*
  The over-the-threshold user: exactly one topic more than local mode allows, so
  the library is read through SQL instead of being sent whole.

  Both reading modes have to be exercised end to end, and the boundary is the only
  place the mode is decided — a fixture that merely had "a lot" of topics would
  test the same branch as one topic more or less. LOCAL_MODE_MAX + 1 is the
  smallest library that is definitely in server mode.

  The titles are deterministic and ordered so a spec can assert exactly which rows
  a page and a cursor return.
*/
await admin.from('topics').delete().eq('user_id', largeUserId)

const CONFIDENCES = ['new', 'weak', 'okay', 'strong'] as const
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

const largeTopics = Array.from({ length: LOCAL_MODE_MAX + 1 }, (_, index) => ({
  user_id: largeUserId,
  // Zero-padded so lexical order matches numeric order in an assertion.
  title: `Bulk topic ${String(index).padStart(4, '0')}`,
  definition: `Number ${index} of the over-the-threshold library.`,
  category: index % 5 === 0 ? null : `Bucket ${index % 5}`,
  tags: index % 7 === 0 ? ['bulk', `tag${index % 3}`] : [],
  confidence: CONFIDENCES[index % CONFIDENCES.length],
  difficulty: DIFFICULTIES[index % DIFFICULTIES.length],
  // Strictly increasing, so `created_at desc` is a total order with no ties and a
  // spec can name the first page exactly.
  created_at: new Date(Date.UTC(2020, 0, 1) + index * 60_000).toISOString(),
}))

const { error: largeError } = await admin.from('topics').insert(largeTopics)

if (largeError) {
  console.error(`Could not seed the large-library user: ${largeError.message}`)
  process.exit(1)
}
console.log(`Large-library user seeded with ${largeTopics.length} topics: ${largeEmail}`)

/*
  The general-purpose user is reset too.

  Its specs each create their own uniquely-titled topic and never assert on a total,
  so leftovers do not make them wrong — but they accumulate, run after run, until the
  library is large enough that saving a topic outlasts a Playwright timeout. Left
  alone this suite slowly poisons itself, and the failure looks like flakiness rather
  than like the compounding it is.
*/
await admin.from('topics').delete().eq('user_id', mainUserId)
console.log(`General-purpose user's topics cleared: ${email}`)

/*
  Two quizzes on the general-purpose user, deterministic on every run.

  The two-option one exists because it is the shape with no quiet third option —
  after checking, BOTH get marked, and it is the state most likely to look broken.
  The three-option one is the ordinary case with a muted survivor.

  Quizzes cannot be authored through the UI until the type toggle ships, and these
  specs have to run red before it does, so they are seeded rather than driven.
*/
/*
  Two backdated topics on the general-purpose user.

  Everything else in this library is debris the specs create as they run, all of
  it seconds old — so before these existed the fixture had no date spread at all
  and could not express any behaviour that depends on one. The library's
  "newest first" assertion needs at least one row outside RECENT_WINDOW_DAYS to
  be falsifiable, and this is the fixture specs are free to write to.

  See ARCHITECTURE.md, "A fixture with no spread on a dimension cannot test that
  dimension".
*/
const { error: datedError } = await admin.from('topics').insert([
  {
    user_id: mainUserId,
    title: 'Cascade layers',
    definition: 'An explicit precedence order for rules, decided before specificity is.',
    category: 'CSS',
    tags: ['layout'],
    created_at: daysAgo(45),
  },
  {
    user_id: mainUserId,
    title: 'The paint holding timeout',
    definition: 'A browser will delay the first paint briefly, waiting for stylesheets.',
    category: 'Browser',
    tags: ['performance'],
    created_at: daysAgo(35),
  },
])

if (datedError) {
  console.error(`Could not seed the backdated topics: ${datedError.message}`)
  process.exit(1)
}
console.log('Backdated topics seeded: 2 (so the fixture has a date spread)')

/*
  One topic carrying every marker, and one carrying a single marker.

  The specs need a topic whose card already shows squares before they record
  anything, and one that reads WEAK with all three recorded — the case the whole
  feature exists to make visible, and the case the library could not show before.
*/
const { error: evidenceError } = await admin.from('topics').insert([
  {
    user_id: mainUserId,
    title: 'Debouncing a scroll handler',
    definition: 'Collapse a burst of events into one call by resetting a timer on every event.',
    mental_model: 'The lift doors that keep reopening while people keep arriving.',
    category: 'JavaScript',
    tags: ['performance'],
    confidence: 'weak',
    /*
      Practised and still weak — the case the feature exists to make visible.

      Both rows in this insert set practice_count and last_practiced_at, and they
      have to: PostgREST unions the keys across a bulk insert, so a column present
      on one object and absent on another is sent as an explicit NULL for the
      other rather than falling back to the column default.
    */
    practice_count: 3,
    last_practiced_at: daysAgo(8),
    created_at: daysAgo(20),
    rebuild_at: daysAgo(10).slice(0, 10),
    rebuild_note: 'debounce() from memory',
    rebuild_url: 'https://gist.github.com/example/debounce',
    challenge_at: daysAgo(6).slice(0, 10),
    challenge_note: 'Stale search responses',
    production_at: daysAgo(3).slice(0, 10),
    production_note: 'Search cancellation in the capstone',
    production_url: 'https://example.com/adr-002',
  },
  {
    user_id: mainUserId,
    title: 'The backpack',
    definition: 'A returned function carries a live reference to the scope it was defined in.',
    mental_model: 'The same backpack, not a photocopy.',
    category: 'JavaScript',
    tags: ['closures'],
    confidence: 'strong',
    practice_count: 6,
    last_practiced_at: daysAgo(4),
    created_at: daysAgo(25),
    rebuild_at: daysAgo(12).slice(0, 10),
    rebuild_note: 'once() from memory',
  },
])

if (evidenceError) {
  console.error(`Could not seed the evidence topics: ${evidenceError.message}`)
  process.exit(1)
}
console.log('Evidence topics seeded: 2 (one with all three markers, one with a rebuild)')

/*
  One source with a transcript and linked entries, and one stale source with
  nothing — the two states the list exists to distinguish.

  The stale one is backdated past UNDISTILLED_WINDOW_DAYS so the crimson yield
  label has something to say. A fixture where every source was created seconds
  ago cannot express it, which is the lesson recorded in ARCHITECTURE.md.
*/
const { data: seededSources, error: sourceError } = await admin
  .from('sources')
  .insert([
    {
      user_id: mainUserId,
      lesson: 'Closures, in depth',
      course: 'JavaScript: The Hard Parts',
      chapter: 'Principles of JavaScript',
      duration_seconds: 803,
      url: 'https://example.com/closures',
      transcript: [
        'A closure is the combination of a function and the lexical environment within which that function was declared.',
        'When we return a function from another function, it carries a live reference to the variables that were in scope where it was defined.',
        'Some people call this the backpack. The returned function walks away carrying a backpack of everything it might still need.',
        'The crucial thing is that it is not a copy. It is a live reference.',
      ].join('\n'),
      created_at: daysAgo(9),
    },
    {
      user_id: mainUserId,
      lesson: 'Database indexing internals',
      duration_seconds: 6960,
      transcript: 'A B-tree keeps its leaves at the same depth, which is what bounds the lookup.',
      created_at: daysAgo(21),
    },
  ])
  .select('id, lesson')

if (sourceError) {
  console.error(`Could not seed the sources: ${sourceError.message}`)
  process.exit(1)
}

const closures = seededSources?.find((row) => row.lesson === 'Closures, in depth')
if (closures) {
  const { error: linkError } = await admin
    .from('topics')
    .update({ source_id: closures.id })
    .in('title', ['The backpack', 'Debouncing a scroll handler'])
  if (linkError) {
    console.error(`Could not link the seeded entries: ${linkError.message}`)
    process.exit(1)
  }
}

console.log('Sources seeded: 2 (one with entries, one stale with nothing)')

const { error: quizError } = await admin.from('topics').insert([
  {
    user_id: mainUserId,
    kind: 'quiz',
    title: 'Does a transform on a parent create a stacking context?',
    options: ['Yes — any transform other than none', 'No — only position plus z-index'],
    correct_option: 0,
    mental_model:
      'Which is why a z-index that should work stops working the moment a parent gets a transform for performance.',
    category: 'CSS',
    tags: ['layout'],
    confidence: 'new',
  },
  {
    user_id: mainUserId,
    kind: 'quiz',
    title: 'What runs first — a resolved promise or a zero-delay timeout?',
    options: [
      'The promise — microtasks drain before the next macrotask',
      'The timeout — a zero delay is always immediate',
      "Depends on the browser's scheduler",
    ],
    correct_option: 0,
    mental_model:
      'The microtask queue empties completely between macrotasks, so a pending promise chain always finishes before a zero-delay timer gets a turn.',
    category: 'JavaScript',
    tags: ['async', 'event-loop'],
    confidence: 'new',
  },
])

if (quizError) {
  console.error(`Could not seed the quizzes: ${quizError.message}`)
  process.exit(1)
}
console.log(`Quizzes seeded: 2 (one two-option, one three-option)`)

for (const userId of FIXTURE_USER_IDS) {
  const { data: folders } = await admin.storage.from('mental-models').list(userId)
  const paths = (folders ?? []).flatMap((folder) => folder.name)

  for (const topicFolder of paths) {
    const { data: files } = await admin.storage
      .from('mental-models')
      .list(`${userId}/${topicFolder}`)
    const keys = (files ?? []).map((file) => `${userId}/${topicFolder}/${file.name}`)
    if (keys.length > 0) await admin.storage.from('mental-models').remove(keys)
  }
}
console.log('Fixture users\' storage folders purged')

/*
  Two phases, so "current" has something to choose between, and four capabilities
  spanning the states the screen exists to distinguish.

  Deliberately NOT one of each state: the fixture carries the two opposite middle
  cases — recall without evidence, and evidence without recall — because those are
  the two the reference calls the point of the whole screen, and a fixture that
  only had "done" and "nothing" could not tell them apart.
*/
/*
  Cleared first, like the topics above. A run that fails between creating a phase
  and deleting it leaves the phase behind, and the next run's assertions then
  count rows a previous run made — the leak class issue #21 already tracks for
  users. Deleting the phase cascades to its capabilities and nulls its topics'
  capability_id, so this is also a live check that the cascade works.
*/
await admin.from('phases').delete().eq('user_id', mainUserId)

const { data: seededPhases, error: phaseError } = await admin
  .from('phases')
  .insert([
    {
      user_id: mainUserId,
      name: 'Core engineering foundations',
      when_text: 'Weeks 1-2',
      sources_text: 'JavaScript: The Hard Parts · Full Stack Fundamentals',
      created_at: daysAgo(30),
    },
    {
      user_id: mainUserId,
      name: 'Senior and staff frontend',
      when_text: 'Weeks 3-7',
      created_at: daysAgo(10),
    },
  ])
  .select('id, name')

if (phaseError) {
  console.error(`Could not seed the phases: ${phaseError.message}`)
  process.exit(1)
}

const core = seededPhases?.find((row) => row.name === 'Core engineering foundations')
const senior = seededPhases?.find((row) => row.name === 'Senior and staff frontend')

if (core && senior) {
  const { data: seededCapabilities, error: capabilityError } = await admin
    .from('capabilities')
    .insert([
      { user_id: mainUserId, phase_id: core.id, name: 'Explain closures without notes', created_at: daysAgo(30) },
      { user_id: mainUserId, phase_id: core.id, name: 'Debounce and throttle from memory', created_at: daysAgo(29) },
      { user_id: mainUserId, phase_id: core.id, name: 'Trace a click from browser to database', created_at: daysAgo(28) },
      { user_id: mainUserId, phase_id: senior.id, name: 'Design a component API others can extend', created_at: daysAgo(10) },
    ])
    .select('id, name')

  if (capabilityError) {
    console.error(`Could not seed the capabilities: ${capabilityError.message}`)
    process.exit(1)
  }

  const byName = (name: string) => seededCapabilities?.find((row) => row.name === name)?.id

  /*
    The two opposite middle states, which is the whole point of the screen.

    "Debouncing a scroll handler" is already weak AND carries all three evidence
    markers → evidence without recall. Nothing seeded was okay-or-better WITHOUT
    evidence, so the other half needs its own row: "The backpack" looks like the
    candidate and is not, because the evidence seed gives it a rebuild marker,
    which would make it demonstrated rather than half-done.
  */
  const { error: recallOnlyError } = await admin.from('topics').insert({
    user_id: mainUserId,
    title: 'Lexical scope at definition time',
    definition: 'Scope is fixed where a function is written, not where it is called.',
    mental_model: 'The address on the envelope, not the postbox you drop it in.',
    category: 'JavaScript',
    tags: ['closures'],
    confidence: 'okay',
    practice_count: 3,
    last_practiced_at: daysAgo(5),
    created_at: daysAgo(20),
  })

  if (recallOnlyError) {
    console.error(`Could not seed the recall-only topic: ${recallOnlyError.message}`)
    process.exit(1)
  }

  for (const [title, capability] of [
    ['Lexical scope at definition time', 'Explain closures without notes'],
    ['Debouncing a scroll handler', 'Debounce and throttle from memory'],
  ] as const) {
    const id = byName(capability)
    if (!id) continue
    const { error } = await admin.from('topics').update({ capability_id: id }).eq('title', title).eq('user_id', mainUserId)
    if (error) {
      console.error(`Could not link ${title} to a capability: ${error.message}`)
      process.exit(1)
    }
  }
}

console.log('Phases seeded: 2 (4 capabilities, spanning both middle states)')

/*
  A small ledger: one item per state the list has to render.

  Cleared first, like the phases above — a run that fails between creating an item
  and deleting it would otherwise leave rows the next run's counts include.
*/
await admin.from('project_items').delete().eq('user_id', mainUserId)

const closuresCapability = core
  ? (
      await admin
        .from('capabilities')
        .select('id')
        .eq('phase_id', core.id)
        .eq('name', 'Explain closures without notes')
        .maybeSingle()
    ).data?.id ?? null
  : null

const { error: ledgerError } = await admin.from('project_items').insert([
  {
    user_id: mainUserId,
    kind: 'adr',
    title: 'Search state ownership: URL over client store',
    link: 'https://github.com/example/recall/blob/main/adr-002.md',
    status: 'settled',
    capability_id: closuresCapability,
    created_at: daysAgo(4),
  },
  {
    user_id: mainUserId,
    kind: 'incident',
    title: 'New table shipped without a GRANT — app down 40 minutes',
    link: 'https://github.com/example/recall/issues/23',
    note: 'RLS and GRANT are two gates.',
    status: 'settled',
    created_at: daysAgo(5),
  },
  {
    user_id: mainUserId,
    kind: 'task',
    title: 'Request cancellation on the search endpoint',
    link: 'https://github.com/example/recall/pull/41',
    status: 'open',
    capability_id: closuresCapability,
    created_at: daysAgo(6),
  },
  // No link: the row says "no link yet" rather than looking broken.
  {
    user_id: mainUserId,
    kind: 'task',
    title: 'Add optimistic updates to the comment thread',
    status: 'open',
    created_at: daysAgo(7),
  },
  // Retired: stays in the list, in place, at its original date.
  {
    user_id: mainUserId,
    kind: 'adr',
    title: 'Client-side search over server search',
    link: 'https://github.com/example/recall/blob/main/adr-000.md',
    note: 'superseded by ADR-002',
    status: 'retired',
    created_at: daysAgo(14),
  },
])

if (ledgerError) {
  console.error(`Could not seed the ledger: ${ledgerError.message}`)
  process.exit(1)
}

console.log('Ledger seeded: 5 items (settled, open, no-link and retired states)')

/*
  A few days, so Earlier days has something to read and Today has a carried
  blocker to show.

  Cleared first, like the phases and the ledger — a failed run that wrote a day
  would otherwise leave a row the next run's counts include.

  Dated relative to the LOCAL date, the way the app does. Seeding with a UTC slice
  would put "yesterday" on the wrong side of midnight for a third of the day and
  make the prefill spec flaky in exactly the way localDateString exists to prevent.
*/
await admin.from('days').delete().eq('user_id', mainUserId)
// `few` writes its own day in the mobile spec — cleared so each run starts from
// nothing, the same reason the phases and ledger seeds clear theirs.
await admin.from('days').delete().eq('user_id', fewUserId)

const localDay = (offset: number) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const dayOfMonth = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${dayOfMonth}`
}

const { error: daysError } = await admin.from('days').insert([
  /*
    Yesterday: one line ticked, one left unticked. The unticked one is what Today
    prefills, and the ticked one is what it must NOT — a finished line offered
    back would be asking you to do it twice.
  */
  {
    user_id: mainUserId,
    day: localDay(-1),
    explain_text: 'Finish closures and write three retrieval questions',
    explain_done: true,
    rebuild_text: 'Write once() from memory, no notes',
    rebuild_done: false,
    apply_text: null,
    apply_done: false,
    blocker_text: null,
    blocker_resolved_at: null,
  },
  // Two days back: an unresolved blocker, so Today has one to carry.
  {
    user_id: mainUserId,
    day: localDay(-2),
    explain_text: 'Finish the event loop lesson',
    explain_done: true,
    rebuild_text: 'Rebuild debounce from memory',
    rebuild_done: true,
    apply_text: 'Ship search cancellation',
    apply_done: false,
    blocker_resolved_at: null,
    blocker_text: 'Debounced search still fires after unmount. Cleanup runs, but the in-flight request resolves anyway.',
  },
  /*
    Three days back: a resolved blocker, so "still open" means something.

    Every key is repeated on both rows on purpose. PostgREST unions the keys
    across a bulk insert, so a column present on only one object is sent as an
    explicit NULL for the other — and `rebuild_done` is NOT NULL. The same trap
    the topics seed above already documents.
  */
  {
    user_id: mainUserId,
    day: localDay(-3),
    explain_text: 'Review the week',
    explain_done: true,
    rebuild_text: null,
    rebuild_done: false,
    apply_text: 'Write ADR-001: modular monolith',
    apply_done: false,
    blocker_text: 'Could not decide whether audit writes belong in the same transaction.',
    blocker_resolved_at: new Date().toISOString(),
  },
])

if (daysError) {
  console.error(`Could not seed the days: ${daysError.message}`)
  process.exit(1)
}

console.log('Days seeded: 3 (yesterday unfinished, one open blocker, one resolved)')
