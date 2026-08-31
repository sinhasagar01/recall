import 'server-only'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * The only module in the app that uses admin privileges.
 *
 * Deleting an auth row is admin-only — Supabase does not expose self-deletion
 * through the client SDK, by design — so "delete my account" cannot be done with
 * the user's own session alone. This module exists to keep that privilege in one
 * small, obvious place rather than spread across the data layer.
 *
 * It does ONE thing. Everything else about account deletion — reading the topics,
 * removing the storage objects — runs under the user's own session in topics.ts,
 * because RLS and the storage policies already permit it. Admin privilege touches
 * exactly one call.
 *
 * The caller must have established WHO is being deleted from a trusted source
 * (`supabase.auth.getUser()` on the server), never from anything the browser sent.
 */
export async function deleteAuthUser(userId: string): Promise<void> {
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!secretKey) {
    // Loudly, and naming the fix: a silent no-op here would report a deleted
    // account that still exists.
    throw new Error(
      'SUPABASE_SECRET_KEY is not set, so the account could not be deleted. ' +
        'It is required on the server for this one operation.',
    )
  }

  const admin = createAdminClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error(`Deleting the account failed: ${error.message}`)
}
