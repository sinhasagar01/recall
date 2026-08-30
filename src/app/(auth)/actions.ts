'use server'

import { redirect } from 'next/navigation'
import { authFailureMessage } from '@/lib/domain/auth-errors'
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

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/sign-in')
}
