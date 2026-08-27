'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type AuthState = { error: string | null }

/*
  The copy is the mock's, verbatim. DESIGN.md: errors say what happened and what to
  do; they never apologise and are never vague. Supabase's own message
  ("Invalid login credentials") is neither, so it is not surfaced.
*/
const CREDENTIALS_REJECTED = "That email and password don't match an account."

export async function signIn(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  })

  if (error) return { error: CREDENTIALS_REJECTED }

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
