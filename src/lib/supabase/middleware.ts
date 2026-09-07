import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/database.types'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Routes that require a session.
 *
 * Exported so `guarded-routes.test.ts` can hold it to the route tree. A route
 * missing here does not leak — RLS scopes every read, so a signed-out request
 * returns nothing — but it renders a server component with no session and answers
 * **500 instead of redirecting to sign-in**. That is how `/sources` shipped, and
 * `/export` had been in the same state before it.
 */
export const GUARDED = [
  '/library',
  '/topic',
  '/practice',
  '/weak',
  '/settings',
  '/sources',
  '/phases',
]

/** Routes a signed-in user has no reason to see. */
const AUTH_ROUTES = ['/sign-in', '/sign-up']

const startsWithAny = (pathname: string, prefixes: string[]) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

/**
 * Refreshes the session cookie and guards the app routes.
 *
 * This is the module where the standard failure mode lives: auth works in the
 * browser, then the session vanishes on reload or is invisible to server
 * components. Two rules keep that from happening, and both are load-bearing.
 *
 * 1. ONE response object. `setAll` rebuilds it so the current render sees the
 *    refreshed cookies on `request`, and immediately re-applies every cookie to
 *    the new response. Any code path that creates a fresh response afterwards
 *    without copying the cookies across drops the refreshed session — and only on
 *    that path, which is why it presents as an intermittent logout.
 *
 * 2. `setAll` takes a SECOND argument in @supabase/ssr 0.12.5: cache headers that
 *    must be written onto the response, so a CDN cannot serve one user's session
 *    cookie to another. Omitting it still typechecks. This is the API change the
 *    package's own types document, and the reason not to copy an older snippet.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }

          supabaseResponse = NextResponse.next({ request })

          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options)
          }

          // Cache-Control: private, no-store, ... — see rule 2 above.
          for (const [key, value] of Object.entries(headers)) {
            supabaseResponse.headers.set(key, value)
          }
        },
      },
    },
  )

  // Triggers the refresh. Must run before any redirect decision, or the guard
  // reads a session that is about to be replaced.
  const { data } = await supabase.auth.getClaims()
  const isSignedIn = Boolean(data?.claims)

  const { pathname } = request.nextUrl

  /** Carries the refreshed cookies and cache headers onto a redirect. */
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone()
    url.pathname = path
    url.search = ''

    const redirect = NextResponse.redirect(url)

    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirect.cookies.set(cookie)
    }
    for (const [key, value] of supabaseResponse.headers.entries()) {
      if (key.toLowerCase() !== 'set-cookie') redirect.headers.set(key, value)
    }

    return redirect
  }

  if (!isSignedIn && startsWithAny(pathname, GUARDED)) {
    return redirectTo('/sign-in')
  }

  if (isSignedIn && startsWithAny(pathname, AUTH_ROUTES)) {
    return redirectTo('/library')
  }

  return supabaseResponse
}
