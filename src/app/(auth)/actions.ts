'use server'

import { redirect } from 'next/navigation'
import { authFailureMessage } from '@/lib/domain/auth-errors'
import { deleteAuthUser } from '@/lib/data/account'
import { removeAllOwnImages } from '@/lib/data/topics'
import { createClient } from '@/lib/supabase/server'

export type AuthState = { error: string | null }

/*
  Sign-in failures are classified in src/lib/domain/auth-errors.ts, which is pure
  and unit-tested. Collapsing every failure into the credentials line — as this
  did originally — meant an unreachable database told people their password was
  wrong, and sent them to reset a password that was never the problem.
*/

export async function signIn(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  })

  if (error) return { error: authFailureMessage(error) }

  redirect('/library')
}

export async function signUp(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  })

  // Supabase's sign-up messages are specific and actionable ("Password should be
  // at least 6 characters", "User already registered"), so they are shown as-is.
  if (error) return { error: error.message }

  redirect('/library')
}

/**
 * Deletes the signed-in account, everything in it, and the session.
 *
 * ── The ordering, which is the phase 1 constraint again ────────────────────
 * Storage objects first, then the auth row. A failure removing images leaves the
 * account intact and the whole operation retryable. The reverse orphans every
 * image the account owned, with nothing left pointing at them and no row
 * recording where they were — and no SQL statement or trigger can reach a storage
 * object to clean up afterwards.
 *
 * Topics are not deleted explicitly: `on delete cascade` on `topics.user_id`
 * removes them when the auth row goes. That cascade has never had any reach into
 * storage, which is the whole reason this action exists.
 */
export async function deleteAccount(): Promise<{ error: string } | void> {
  const supabase = await createClient()

  // From the server, never from the browser: this decides whose data dies.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Your session expired. Sign in and try again.' }

  try {
    await removeAllOwnImages(user.id)
    await deleteAuthUser(user.id)
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'The account could not be deleted.'
    return { error: `${reason} Your account is still here — try again.` }
  }

  // The row is gone; the cookie is not. Clearing it is what ends the session.
  await supabase.auth.signOut()
  redirect('/sign-in')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/sign-in')
}
