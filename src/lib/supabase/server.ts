import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import { cookies } from 'next/headers'
import { cache } from 'react'

/**
 * Server client, for server components, server actions and route handlers.
 *
 * One client per REQUEST, deduped with React's `cache()` — never shared across
 * requests, per the package's own warning, but never duplicated within one either.
 *
 * That second half matters more than it looks. Supabase refresh tokens are
 * single-use: if two clients in the same request both find an expired cookie, they
 * both try to refresh, the second refresh fails because the first consumed the
 * token, and it comes back with no user. The symptom is a page that renders while
 * `getUser()` returns null — the rail showing an empty email on a signed-in user.
 * It only appears under concurrent load, which is why the full parallel suite found
 * it and nine phases of per-phase specs did not.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server components cannot set cookies. That is fine, and expected:
            // proxy.ts refreshes the session on every matched request, so the
            // write this call would have made has already happened there.
            // Swallowing it here is only safe BECAUSE the proxy exists.
          }
        },
      },
    },
  )
})
