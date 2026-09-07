import { expect, test } from '@playwright/test'
import { CREDENTIALS, signInAs } from './auth-state'

/*
  Two things and nothing else.

  The page is reachable from the account foot rather than from the nav: the
  mobile tab bar is two destinations plus the add button and stays that way
  (DESIGN.md, "Mobile has two destinations plus add"). So it is asserted where it actually lives — the rail
  foot on desktop, the library head on a phone — not as a fourth nav entry.

  Its way back to the library is covered by e2e/wayfinding.spec.ts, which
  enumerates the route group rather than naming screens.
*/

test.describe('reaching settings', () => {
  test('from the rail foot on desktop, not from the nav', async ({ page }) => {
    await signInAs(page, 'main')

    const rail = page.getByRole('complementary')
    await expect(rail.getByRole('link', { name: 'Settings' })).toBeVisible()

    /*
      Still the same three destinations, and Settings is not one of them.

      Asserted by naming them rather than counting, for the reason the mobile half
      of this file already gives: a count says nothing about which links are there.
      It also stopped meaning what it claimed once the rail gained its
      Apprenticeship group — Sources is a fourth link in the same <nav> and a
      deliberate one, while the rule this test protects is about the mobile TAB
      BAR's shape, which Sources does not touch.
    */
    const nav = rail.getByRole('navigation')
    for (const href of ['/library', '/practice', '/weak']) {
      await expect(nav.locator(`a[href="${href}"]`)).toHaveCount(1)
    }
    await expect(nav.locator('a[href="/settings"]')).toHaveCount(0)

    // Sources is in the rail, below its own group heading — not among the three.
    await expect(nav.locator('a[href="/sources"]')).toHaveCount(1)
    await expect(rail.getByText('Apprenticeship')).toBeVisible()

    await rail.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings/)
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  })

  test('from the More sheet on a phone, where there is no rail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signInAs(page, 'main')

    /*
      Arc 4 replaced the wrapping account cluster with one More link opening a
      sheet. Settings is still not a tab entry — that is the invariant — and this
      asserts it from where it now lives.
    */
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings/)

    /*
      Two destinations plus the add button — which is itself a link to
      /library?add=1, so counting links would read 3 and mean nothing. The
      invariant is which destinations are there, and that Settings is not one.
    */
    const tabbar = page.locator('nav').last()
    await expect(tabbar.locator('a[href="/library"]')).toHaveCount(1)
    await expect(tabbar.locator('a[href="/practice"]')).toHaveCount(1)
    await expect(tabbar.locator('a[href="/settings"]')).toHaveCount(0)
    await expect(tabbar.locator('a[href="/weak"]')).toHaveCount(0)
  })

  test('holds two things, and no placeholders for anything else', async ({ page }) => {
    await signInAs(page, 'main')
    await page.goto('/settings')

    await expect(page.getByText('Password', { exact: true })).toBeVisible()
    await expect(page.getByText('Export', { exact: true })).toBeVisible()

    // Not built, and not hinted at either.
    for (const absent of ['Theme', 'Dark', 'Profile', 'Notifications', 'Coming soon']) {
      await expect(page.getByText(absent, { exact: false })).toHaveCount(0)
    }
  })

  test('signed out, it is not reachable', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/sign-in/)
  })
})

test.describe('changing the password', () => {
  /*
    Uses the empty-library fixture. No spec signs that user in through the form —
    the two that name its address only use it to pick a saved session — and this
    changes the password back before it finishes, so it leaves nothing altered
    for a parallel worker to trip over.
  */
  test('requires the current one', async ({ page }) => {
    await signInAs(page, 'empty')
    await page.goto('/settings')

    await page.getByLabel('Current password').fill('not-the-current-password')
    await page.getByLabel('New password').fill('a-brand-new-password')
    await page.getByRole('button', { name: 'Change password' }).click()

    /*
      Supabase would have accepted this on session validity alone. Requiring the
      current password is what stops an unlocked laptop being an account
      takeover rather than a nuisance.
    */
    // Not getByRole('alert'): Next renders a route announcer with that role, so
    // it is never unique. See ARCHITECTURE.md.
    await expect(page.getByText("isn't your current password")).toBeVisible()
    await expect(page.getByText('Password changed')).toHaveCount(0)
  })

  test('changes it, and says so, when the current one is right', async ({ page }) => {
    const { password } = CREDENTIALS.empty
    const temporary = `${password}-rotated`

    await signInAs(page, 'empty')
    await page.goto('/settings')

    await page.getByLabel('Current password').fill(password)
    await page.getByLabel('New password').fill(temporary)
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('Password changed')).toBeVisible()

    // And the new one is really in force: change it back using it.
    await page.reload()
    await page.getByLabel('Current password').fill(temporary)
    await page.getByLabel('New password').fill(password)
    await page.getByRole('button', { name: 'Change password' }).click()
    await expect(page.getByText('Password changed')).toBeVisible()
  })
})

test('the export button downloads the zip', async ({ page }) => {
  await signInAs(page, 'few')
  await page.goto('/settings')

  const button = page.getByRole('button', { name: 'Export my library' })
  await expect(button).toBeVisible()

  const download = page.waitForEvent('download')
  await button.click()

  // The name the server chose, so its date is the server's.
  expect((await download).suggestedFilename()).toMatch(/^recall-\d{4}-\d{2}-\d{2}\.zip$/)
})
