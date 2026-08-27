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
*/
await admin.from('topics').delete().eq('user_id', fewUserId)

const { error: fewError } = await admin.from('topics').insert([
  {
    user_id: fewUserId,
    title: 'The event loop',
    definition: 'Microtasks drain before the next macrotask.',
  },
  {
    user_id: fewUserId,
    title: 'Specificity',
    definition: 'Which selector wins when two of them apply.',
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
*/
await admin.from('topics').delete().eq('user_id', strongUserId)

const { error: strongError } = await admin.from('topics').insert([
  {
    user_id: strongUserId,
    title: 'Flexbox main axis',
    definition: 'Items lay out along the main axis, which flex-direction picks.',
    confidence: 'strong',
    practice_count: 4,
    last_practiced_at: new Date('2026-06-01T00:00:00.000Z').toISOString(),
  },
  {
    user_id: strongUserId,
    title: 'Stacking contexts',
    definition: 'A new context is formed by opacity, transform and a few others.',
    confidence: 'okay',
    practice_count: 2,
    last_practiced_at: new Date('2026-06-02T00:00:00.000Z').toISOString(),
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
  The general-purpose user is reset too.

  Its specs each create their own uniquely-titled topic and never assert on a total,
  so leftovers do not make them wrong — but they accumulate, run after run, until the
  library is large enough that saving a topic outlasts a Playwright timeout. Left
  alone this suite slowly poisons itself, and the failure looks like flakiness rather
  than like the compounding it is.
*/
await admin.from('topics').delete().eq('user_id', mainUserId)
console.log(`General-purpose user's topics cleared: ${email}`)

for (const userId of [mainUserId, emptyUserId, fewUserId, strongUserId]) {
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
