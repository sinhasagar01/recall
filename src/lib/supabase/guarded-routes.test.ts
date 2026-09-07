import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GUARDED } from '@/lib/supabase/middleware'

/**
 * Every route behind sign-in is actually guarded.
 *
 * `GUARDED` is a hand-written list, and a hand-written list of routes rots the
 * moment someone adds a route. It did: `/sources` shipped to production absent
 * from it and answered a 500 to a signed-out request instead of redirecting,
 * because the proxy waved it through and the page then rendered with no session.
 * `/export` is the deliberate exception, and is listed as one below.
 *
 * So the list is held to the route tree rather than to memory. This is the same
 * shape as the boundary tests: assert on the SOURCE, so the failure arrives when
 * the route is created rather than when someone signed out happens to visit it.
 *
 * Deliberately a unit test and not an e2e one. An e2e check would have to know
 * which routes exist to visit them — which is the very list being questioned.
 */

const APP = join(process.cwd(), 'src', 'app')

/** The route groups whose contents are private. `(auth)` is deliberately not one. */
const PRIVATE_GROUPS = ['(app)', '(practice)']

/**
 * Private, but guarded by itself rather than by the proxy — with the reason.
 *
 * `/export` is a route handler that answers a file. A proxy redirect would send a
 * 307 to `/sign-in` and the browser would save the sign-in page's HTML under the
 * name of a zip; the handler returns **401** instead, which `export.spec.ts`
 * asserts. Guarding it here as well would turn that 401 into a redirect and break
 * it, which is exactly what happened when this list was first widened.
 *
 * An entry here is a claim that the route guards itself, so each one names how.
 */
const SELF_GUARDED = ['/export']

function routesIn(group: string): string[] {
  return readdirSync(join(APP, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    // A dynamic segment is reached through its parent, which is itself listed.
    .filter((entry) => !entry.name.startsWith('[') && !entry.name.startsWith('('))
    .map((entry) => `/${entry.name}`)
}

describe('the proxy guards every private route', () => {
  it('has an entry for each route in the private groups', () => {
    const routes = PRIVATE_GROUPS.flatMap(routesIn)

    // Guard the guard: an empty read would make the assertion below vacuous.
    expect(routes.length).toBeGreaterThan(4)

    expect(
      routes.filter((route) => !GUARDED.includes(route) && !SELF_GUARDED.includes(route)),
    ).toEqual([])
  })

  it('has no entry for a route that no longer exists', () => {
    const routes = PRIVATE_GROUPS.flatMap(routesIn)

    /*
      The other direction. A stale prefix is not a security problem, but it is a
      claim the tree stopped supporting — and `startsWithAny` matches on prefix,
      so a leftover `/source` would quietly guard `/sources` and mask its absence.
    */
    expect(GUARDED.filter((route) => !routes.includes(route))).toEqual([])
  })
})
