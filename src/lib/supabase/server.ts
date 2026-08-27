import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import { cookies } from 'next/headers'

/**
 * Server client, for server components, server actions and route handlers.
 *
 * A new client per request — never shared across requests, per the package's own
 * warning.
 */
export async function createClient() {
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
}
