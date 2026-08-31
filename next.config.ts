import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /*
    The dev-tools overlay is a fixed element in the lower-left corner — exactly
    where the rail's "Sign out" sits — and it intercepts pointer events, so
    Playwright cannot click through it. It exists only in `next dev`, which is
    what the e2e suite runs against. Compile and runtime errors are still surfaced.
  */
  devIndicators: false,

  /*
    Every one of these routes renders one person's private data, so none of them
    should ever be held by a cache that serves more than one person. That is true
    on its own merits — but it also closes a real gap: @supabase/ssr passes
    `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0` to
    `setAll` when it refreshes a session, and Next replaces it with its own
    `no-cache, must-revalidate`. Verified in phase 11 by lowering `jwt_expiry` and
    driving a real refresh: `Expires` and `Pragma` arrived intact, `Cache-Control`
    did not.

    The result was a response that could not be served stale, but was missing
    `private` and `no-store` — fine behind Vercel, where responses are per-user
    anyway, and not fine behind a shared cache. Setting it here does not depend on
    a refresh having happened, which is the other reason to prefer it.
  */
  async headers() {
    return [
      {
        source: '/:path(library|practice|weak|topic)/:rest*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0, must-revalidate' },
        ],
      },
    ]
  },
}

export default nextConfig
