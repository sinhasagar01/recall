import { redirect } from 'next/navigation'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Where every emailed link lands — confirmation and password reset alike.
 *
 * The templates in supabase/templates point here with a token hash rather than at
 * Supabase's own verify endpoint, because only this route can write the session
 * cookie through the server client. `verifyOtp` exchanges the hash for a session;
 * the cookie is set by the same `setAll` the rest of the app uses.
 *
 * A token is single-use and expires, so an expired or reused link has to say so
 * rather than dumping someone on a page that silently does not work.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/library'

  if (!tokenHash || !type) redirect('/sign-in?error=link-invalid')

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error) redirect('/sign-in?error=link-expired')

  // Only ever a path on this app: `next` arrives from a URL and is not trusted.
  redirect(next.startsWith('/') ? next : '/library')
}
