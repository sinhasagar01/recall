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

/**
 * Groups a signed-out person may see. Everything else is private.
 *
 * ── Why this is inverted ────────────────────────────────────────────────────
 * This was `PRIVATE_GROUPS = ['(app)', '(practice)']` — a hand-written list of
 * where to look, guarding against a hand-written list of what to check. Arc 7
 * added `(interview)` and the invariant did not notice, because a group it was
 * never told about contributes no routes and therefore no failures. The suite
 * stayed green and simply tested less, which is the exact failure this file's
 * own header describes and was written to prevent, one level up.
 *
 * It is the second instance of arc 5's `/today/earlier` finding: a derived
 * invariant is only as complete as the list it walks.
 *
 * So the default is inverted. A new route group is private — and covered —
 * unless it is named here, which makes escaping this check a deliberate act
 * with a reason attached rather than the automatic consequence of `mkdir`.
 */
const PUBLIC_GROUPS = ['(auth)']

/** Every group that is not public, read off the tree rather than remembered. */
const PRIVATE_GROUPS = readdirSync(APP, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() && entry.name.startsWith('(') && !PUBLIC_GROUPS.includes(entry.name),
  )
  .map((entry) => entry.name)
  .sort()

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

    /*
      Guard the guard — and this is the clause that had to change, not just the
      derivation above it.

      `routes.length > 4` was cleared by `(app)` and `(practice)` alone, so it
      went on passing while a whole group was invisible: the threshold measured
      that SOMETHING was found, never that everything was. A count cannot detect
      a missing group, because the group that is missing contributes nothing to
      the count.

      What replaces it is per-group: every private group must contribute at
      least one route. A group that derives to nothing is now a failure with the
      group's name in it, whatever the total happens to be.

      Stated precisely, because the two halves do different work: the inverted
      default above is what makes `(interview)` visible at all, and this clause
      is what stops a group being walked and yielding nothing. Neither alone is
      enough, and the count was never either.
    */
    expect(PRIVATE_GROUPS, 'the group derivation found nothing').not.toEqual([])
    expect(PRIVATE_GROUPS, 'the sign-in screens are public and must stay out').not.toContain(
      '(auth)',
    )
    for (const group of PRIVATE_GROUPS) {
      expect(routesIn(group), `${group} contributed no routes — it is not being checked`).not.toEqual(
        [],
      )
    }

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
