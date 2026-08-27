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

const missing = [
  ['NEXT_PUBLIC_SUPABASE_URL', url],
  ['SUPABASE_SECRET_KEY', secretKey],
  ['E2E_USER_EMAIL', email],
  ['E2E_USER_PASSWORD', password],
  ['E2E_EMPTY_USER_EMAIL', emptyEmail],
  ['E2E_EMPTY_USER_PASSWORD', emptyPassword],
  ['E2E_FEW_USER_EMAIL', fewEmail],
  ['E2E_FEW_USER_PASSWORD', fewPassword],
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

await upsertUser(email!, password!)
const emptyUserId = await upsertUser(emptyEmail!, emptyPassword!)
const fewUserId = await upsertUser(fewEmail!, fewPassword!)

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
