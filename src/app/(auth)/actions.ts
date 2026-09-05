'use server'

import { redirect } from 'next/navigation'
import { authFailureMessage } from '@/lib/domain/auth-errors'
import { deleteAuthUser } from '@/lib/data/account'
import { removeAllOwnImages } from '@/lib/data/topics'
import { createClient } from '@/lib/supabase/server'

/*
  `email` is echoed back so a rejected form can refill it. React resets an
  uncontrolled form once its action resolves, so without this a mistyped password
  also clears an address that was correct, and the whole form is retyped to fix
  one field. The password is deliberately never echoed.
*/
export type AuthState = { error: string | null; email?: string }

export type SignUpState = { error: string | null; pendingFor: string | null; email?: string }

/*
  Sign-in failures are classified in src/lib/domain/auth-errors.ts, which is pure
  and unit-tested. Collapsing every failure into the credentials line — as this
  did originally — meant an unreachable database told people their password was
  wrong, and sent them to reset a password that was never the problem.
*/

export async function signIn(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '')
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: String(formData.get('password') ?? ''),
  })

  if (error) return { error: authFailureMessage(error), email }

  redirect('/library')
}

export type ResetState = { error: string | null; sentTo: string | null }

/**
 * Sends a password-reset link.
 *
 * It reports the same thing whether or not the address has an account. A
 * different response would turn this form into a way to discover which addresses
 * are registered, and Supabase deliberately does not distinguish either.
 */
export async function requestPasswordReset(
  _previous: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = String(formData.get('email') ?? '').trim()

  if (email === '') return { error: 'Enter the email address you signed up with.', sentTo: null }

  const supabase = await createClient()

  /*
    No redirectTo. The recovery template in supabase/templates already builds the
    link from {{ .SiteURL }} and carries `next=/reset-password/update`, so passing
    one here only risks disagreeing with it — and an empty or relative value is
    rejected outright as not being in the allow-list.
  */
  const { error } = await supabase.auth.resetPasswordForEmail(email)

  /*
    Only genuine send failures surface. "No such user" does not reach here —
    Supabase does not report it — and if it ever did, saying so would leak exactly
    what this deliberately hides.
  */
  if (error && error.status !== 400) {
    return { error: authFailureMessage(error), sentTo: null }
  }

  return { error: null, sentTo: email }
}

/** Changes the password of whoever the reset link signed in. */
export async function setNewPassword(
  _previous: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get('password') ?? '')

  if (password.length < 8) return { error: 'Use at least 8 characters.' }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The link establishes the session. Without one, it expired or was already used.
  if (!user) return { error: 'That link has expired. Ask for a new one.' }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }

  redirect('/library')
}

export async function signUp(
  _previous: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const email = String(formData.get('email') ?? '').trim()
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password: String(formData.get('password') ?? ''),
  })

  // Supabase's sign-up messages are specific and actionable ("Password should be
  // at least 6 characters", "User already registered"), so they are shown as-is.
  if (error) return { error: error.message, pendingFor: null, email }

  /*
    With confirmation required, signUp returns a user but NO session. Branching on
    the session rather than on config means this is correct in both environments:
    confirmation on, and confirmation off where it signs straight in.
  */
  if (data.session === null) return { error: null, pendingFor: email }

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
