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

const missing = [
  ['NEXT_PUBLIC_SUPABASE_URL', url],
  ['SUPABASE_SECRET_KEY', secretKey],
  ['E2E_USER_EMAIL', email],
  ['E2E_USER_PASSWORD', password],
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

const found = existing.users.find((user) => user.email === email)

if (found) {
  const { error } = await admin.auth.admin.updateUserById(found.id, {
    password,
    email_confirm: true,
  })
  if (error) {
    console.error(`Could not reset the seeded user's password: ${error.message}`)
    process.exit(1)
  }
  console.log(`Seeded user already existed, password reset: ${email}`)
} else {
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    // Local email confirmation is off (supabase/config.toml, enable_confirmations
    // = false). Set explicitly anyway so the seed does not silently depend on it.
    email_confirm: true,
  })
  if (error) {
    console.error(`Could not create the seeded user: ${error.message}`)
    process.exit(1)
  }
  console.log(`Seeded user created: ${email}`)
}
