import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Next.js 16 renamed the `middleware` file convention to `proxy`, and the exported
 * function with it. `middleware.ts` still resolves but is deprecated, and the edge
 * runtime is not supported here — proxy always runs on nodejs.
 *
 * The session refresh itself lives in src/lib/supabase/middleware.ts, which keeps
 * every Supabase import inside src/lib/supabase per ARCHITECTURE.md.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  /*
    Everything except static assets. Without the exclusions the guard would run on
    CSS, JS and images and could redirect them, which breaks the page it is
    protecting. Image extensions are excluded explicitly for the same reason.
  */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}
