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
const strongUserId = await upsertUser(strongEmail!, strongPassword!)
const largeUserId = await upsertUser(largeEmail!, largePassword!)

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
      title: 'Closures, in depth',
      course: 'JavaScript: The Hard Parts',
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
      title: 'Database indexing internals',
      transcript: 'A B-tree keeps its leaves at the same depth, which is what bounds the lookup.',
      created_at: daysAgo(21),
    },
  ])
  .select('id, title')

if (sourceError) {
  console.error(`Could not seed the sources: ${sourceError.message}`)
  process.exit(1)
}

const closures = seededSources?.find((row) => row.title === 'Closures, in depth')
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

for (const userId of [mainUserId, emptyUserId, fewUserId, strongUserId, largeUserId]) {
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
