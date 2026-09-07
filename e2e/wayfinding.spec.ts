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
const APP_ROUTES = readdirSync(join(process.cwd(), 'src', 'app', '(app)'), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('['))
  .filter((entry) =>
    existsSync(join(process.cwd(), 'src', 'app', '(app)', entry.name, 'page.tsx')),
  )
  .map((entry) => `/${entry.name}`)
  .sort()

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

    await signInAs(page, 'few')

    for (const route of APP_ROUTES) {
      await page.goto(route)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const back = await visibleLibraryLinks(page)
      expect(back.length, `${route} offers no visible link to /library`).toBeGreaterThan(0)
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
