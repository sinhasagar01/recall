import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /*
    The dev-tools overlay is a fixed element in the lower-left corner — exactly
    where the rail's "Sign out" sits — and it intercepts pointer events, so
    Playwright cannot click through it. It exists only in `next dev`, which is
    what the e2e suite runs against. Compile and runtime errors are still surfaced.
  */
  devIndicators: false,
}

export default nextConfig
