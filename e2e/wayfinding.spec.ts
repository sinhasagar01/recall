import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  You can always get back to the library, from every route in the (app) group.

  This is the regression for a defect twelve phases missed: the rail's Library
  entry was a hardcoded `<span aria-current="page">`, so on desktop /weak had NO
  control that returned you to the library — the loop's "see what's weak" step had
  no step after it — and the rail told every screen reader you were on Library
  while you were somewhere else.

  Nothing caught it because every existing spec either asserted a specific link it
  already knew about, or ran a flow that happened to start from the library. The
  assertion that was missing is the general one: whatever route you are on, a
  visible way back exists. So that is what this asserts, by enumerating the group
  rather than by naming the screens someone remembered.
*/

/**
 * Derived from the route tree, never hand-maintained.
 *
 * This list went stale twice, one arc apart, in this same file: `/sources` was
 * missing until arc 2 noticed, and `/phases` shipped uncovered because arc 3's
 * plan said it would be added here and the commit never touched the file. A
 * hand-written list of routes rots the moment someone adds a route, and nothing
 * fails when it does — the suite stays green and simply tests less.
 *
 * So it is read off the filesystem, the way `guarded-routes.test.ts` derives
 * GUARDED. The rule is mechanical: **a directory under (app) with its own
 * page.tsx is a static route this invariant covers.** That excludes `export`
 * (a route handler answering a file, with no page) and `topic` (dynamic only —
 * covered by its own test below), with no exception list to maintain.
 */
/*
  Every page in the group, at any depth.

  This read one level and stopped, so `/today/earlier` — a real page with a real
  route — was never walked. Nothing declared it missing; it simply was not in the
  list, which is the failure mode of every derived list that derives too little.

  Dynamic segments are excluded because a `[id]` route needs a real id to visit
  and the topic case has its own test above.
*/
function pagesUnder(dir: string, prefix: string): string[] {
  const routes: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('[') || entry.name.startsWith('(')) continue
    const here = join(dir, entry.name)
    const route = `${prefix}/${entry.name}`
    if (existsSync(join(here, 'page.tsx'))) routes.push(route)
    routes.push(...pagesUnder(here, route))
  }
  return routes
}

const APP_ROUTES = pagesUnder(join(process.cwd(), 'src', 'app', '(app)'), '').sort()

/** Visible, not merely present: the mobile tab bar is in the DOM at desktop width. */
async function visibleLibraryLinks(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('a[href="/library"], a[href^="/library?"]')]
      .filter((a) => {
        const rect = a.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      .map((a) => (a.textContent || '').trim().replace(/\s+/g, ' ')),
  )
}

test.describe('every route in the app group can reach the library', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('the static routes each offer a visible way back', async ({ page }) => {
    /*
      Guard the guard: an empty or shrunken derivation would make the loop below
      pass by testing nothing, which is the failure mode this derivation replaced.
    */
    expect(APP_ROUTES.length, 'the route derivation found nothing').toBeGreaterThanOrEqual(6)
    expect(APP_ROUTES).toContain('/phases')
    expect(APP_ROUTES).toContain('/ledger')
    expect(APP_ROUTES, 'export answers a file, not a page').not.toContain('/export')
    expect(APP_ROUTES, 'topic is dynamic and has its own test').not.toContain('/topic')
    /*
      And it reaches past the first level. This derivation read one directory
      deep for four arcs, so `/today/earlier` was a page in this group that no
      walk ever visited — not declared missing, simply not in the list. Named
      explicitly rather than counted, because a count is what let it hide.
    */
    expect(APP_ROUTES, 'the derivation stops at the first level again').toContain(
      '/today/earlier',
    )

    await signInAs(page, 'few')

    for (const route of APP_ROUTES) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const back = await visibleLibraryLinks(page)
      expect(back.length, `${route} offers no visible link to /library`).toBeGreaterThan(0)
    }
  })

  /*
    The same rule, past the (app) group.

    It only ever walked (app), so /practice and /interview — the two groups with
    no rail, and therefore the two that need it most — were never checked. Both
    shipped with no way back: practice had one in five empty states and none in
    a session, and interview had none anywhere.
  */
  test('the rail-less groups offer one too', async ({ page }) => {
    await signInAs(page, 'few')

    const railLess = DESTINATIONS.filter((route) => !APP_ROUTES.includes(route))
    expect(railLess, 'the derivation must reach past (app)').toEqual(['/interview', '/practice'])

    for (const route of railLess) {
      await page.goto(route)
      await expect(page.getByTestId('back-to-library').first()).toBeVisible()
    }
  })

  test('a topic offers a visible way back', async ({ page }) => {
    // `few` owns exactly two topics on every run; the general-purpose user is
    // cleared to zero by the seed and would have nothing to open.
    await signInAs(page, 'few')

    const firstTopic = page.locator('a[href^="/topic/"]').first()
    await firstTopic.waitFor()
    await firstTopic.click()
    await expect(page).toHaveURL(/\/topic\//)

    const back = await visibleLibraryLinks(page)
    expect(back.length, 'a topic offers no visible link to /library').toBeGreaterThan(0)
  })
})

test.describe('the rail says where you are', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  /*
    design-reference.html:990-992 is the specification: on the weak screen Library
    is a plain link and Weak topics carries aria-current. The build had it the
    other way round on every screen.
  */
  test('aria-current follows the route', async ({ page }) => {
    await signInAs(page, 'few')

    const current = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[aria-current="page"]')].map((e) =>
          (e.textContent || '').trim().replace(/\s+/g, ' ').replace(/\d+.*$/, '').trim(),
        ),
      )

    await page.goto('/library')
    expect(await current()).toContain('Library')

    await page.goto('/weak')
    expect(await current()).toContain('Weak topics')
    expect(await current()).not.toContain('Library')
  })

  test('a topic counts as the library, and says so', async ({ page }) => {
    await signInAs(page, 'few')

    const firstTopic = page.locator('a[href^="/topic/"]').first()
    await firstTopic.waitFor()
    await firstTopic.click()
    await expect(page).toHaveURL(/\/topic\//)

    // A topic is reached from the library and its breadcrumb returns there, so
    // the rail marks Library rather than nothing. The reference does the same.
    const marked = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-current="page"]')].map((e) =>
        (e.textContent || '').trim().replace(/\s+/g, ' '),
      ),
    )
    expect(marked.join(' ')).toMatch(/Library/)
  })
})

test.describe('the rail stays put', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  /*
    The rail used to scroll away with the page, so on a long library the three
    destinations, sign out and the keyboard hints were all somewhere above you.
    It is sticky from `md` up now.

    Scrolling is done by scrolling the LAST card into view rather than by a
    programmatic window.scrollTo: Next restores scroll position once a navigation
    settles, and a scroll issued before that lands is quietly undone — scrollY
    reads 0 and the assertion passes for the wrong reason.
  */
  test('the rail is still visible at the bottom of a long library', async ({ page }) => {
    await signInAs(page, 'large')

    const rail = page.getByRole('complementary')
    await expect(rail).toBeVisible()
    const before = await rail.boundingBox()

    const cards = page.locator('a[href^="/topic/"]')
    await expect(cards.nth(20)).toBeAttached()
    await cards.last().scrollIntoViewIfNeeded()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400)

    // Still on screen, and in the same place on screen rather than dragged up.
    await expect(rail).toBeInViewport()
    await expect(page.getByRole('link', { name: /^Library/ })).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeInViewport()

    const after = await rail.boundingBox()
    expect(Math.round(after!.y)).toBe(Math.round(before!.y))
  })

  test('below the breakpoint nothing about the rail changes', async ({ page }) => {
    // The rail is display:none on a phone, and the tab bar was already fixed.
    await page.setViewportSize({ width: 390, height: 844 })
    await signInAs(page, 'large')

    await expect(page.getByRole('complementary')).toBeHidden()

    const cards = page.locator('a[href^="/topic/"]')
    await expect(cards.nth(20)).toBeAttached()
    await cards.last().scrollIntoViewIfNeeded()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400)

    await expect(page.getByRole('link', { name: 'Library' }).last()).toBeInViewport()
  })
})

/*
  ── The other direction: a way IN ───────────────────────────────────────────

  Everything above asserts that a route you are already on offers a way back.
  Nothing asserted that anything offered a way *in*, and arc 7 shipped the
  consequence: `/interview` existed, was guarded by a key check, rendered
  correctly and was reachable only by typing the URL. The suite was green, the
  production walk passed — because the walk navigated straight to the address —
  and the feature was invisible to the person it was built for.

  The plan said "no entry point anywhere when there is no key". That sentence is
  satisfied completely by a route that answers `notFound()`, so nothing was ever
  false. A requirement stated only as a negative does not say what exists in the
  positive case, and no test derived from it can.

  So this asserts the positive: from a cold start, every private destination can
  be reached by clicking.
*/

const APP_DIR = join(process.cwd(), 'src', 'app')

/**
 * Groups a signed-out person may see. Everything else must be reachable.
 *
 * Note the direction, because it is the whole point of writing it this way: a
 * NEW route group is covered by default and has to be named here to escape.
 * `guarded-routes.test.ts` had the opposite default — a hand-written list of
 * private groups — and `(interview)` slipped past it by simply existing.
 */
const PUBLIC_GROUPS = ['(auth)']

/**
 * Every static page route behind sign-in, across every group.
 *
 * Same mechanical rule as APP_ROUTES above — a directory with its own page.tsx —
 * but walked across the route groups rather than inside one, which is what
 * `/practice` and `/interview` need to be seen at all.
 */
const DESTINATIONS = readdirSync(APP_DIR, { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() && entry.name.startsWith('(') && !PUBLIC_GROUPS.includes(entry.name),
  )
  .flatMap((group) =>
    readdirSync(join(APP_DIR, group.name), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('['))
      .filter((entry) => existsSync(join(APP_DIR, group.name, entry.name, 'page.tsx')))
      .map((entry) => `/${entry.name}`),
  )
  .sort()

test.describe('every destination can be reached without typing a URL', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test('the desktop rail offers a way in to each of them', async ({ page }) => {
    /*
      Guard the guard, and specifically against the shape that let this defect
      through: a derivation that walks one group would find eight of these and
      report a clean run while the ninth was unreachable.
    */
    expect(DESTINATIONS.length, 'the destination derivation found too little').toBeGreaterThanOrEqual(9)
    expect(DESTINATIONS, 'the walk must cross route groups').toContain('/practice')
    expect(DESTINATIONS, 'the route this test exists for').toContain('/interview')

    await signInAs(page, 'few')

    // The cold start is the root, not a route: whatever the app opens on.
    await page.goto('/')
    await expect(page).toHaveURL(/\/library/)

    const landing = async () => {
      // Back by history, never by the address bar — typing is the thing on trial.
      while (new URL(page.url()).pathname !== '/library') await page.goBack()
    }

    for (const route of DESTINATIONS) {
      await landing()

      const link = page.locator(`a[href="${route}"]:visible`).first()
      await expect(
        link,
        `nothing you can click leads to ${route} — it exists but cannot be found`,
      ).toBeVisible()

      await link.click()
      await expect(page).toHaveURL(new RegExp(`${route}(\\?|$)`))
    }
  })
})

test.describe('the rail offers the action the drawing puts in it', () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  /*
    design-reference.html:439 draws a full-width `+ Add topic` below the rail's
    nav. The build never had it: phase 3 created the layout with a comment saying
    it belonged to "Phase 4/5", phase 5 built the nav and rewrote the file, and
    the comment recording the obligation went with it.

    Asserted from a page that is NOT the library, because the library's own
    header has a second one and a check that cannot tell them apart would pass on
    the wrong button.
  */
  test('+ Add topic is in the rail, from every page in the group', async ({ page }) => {
    await signInAs(page, 'few')
    await page.goto('/phases')

    const rail = page.getByRole('complementary')
    const add = rail.getByRole('link', { name: '+ Add topic' })

    await expect(add).toBeVisible()
    await expect(add, 'it opens the form rather than merely landing on the library').toHaveAttribute(
      'href',
      '/library?add=1',
    )

    await add.click()
    await expect(page).toHaveURL(/\/library\?add=1/)
  })
})

test.describe('the More sheet is the same list on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  /*
    The rail is display:none below the breakpoint, so on a phone the sheet is the
    ONLY way in to this group. Both surfaces render `apprenticeshipNav()` now,
    which is why they cannot drift again — but "cannot drift" is a claim about
    one function, and this is the claim about the screen.
  */
  test('offers Interview, and clicking it opens the round setup', async ({ page }) => {
    await signInAs(page, 'few')
    await page.goto('/')

    await expect(page.getByRole('complementary'), 'the rail must be gone here').toBeHidden()

    await page.getByRole('button', { name: 'More' }).click()
    const link = page.getByRole('link', { name: 'Interview' })
    await expect(link).toBeVisible()

    await link.click()
    await expect(page).toHaveURL(/\/interview/)
    await expect(page.getByRole('heading', { level: 1, name: 'Set up an interview round' })).toBeVisible()
  })
})
