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

const APP_ROUTES = ['/library', '/weak'] as const

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
