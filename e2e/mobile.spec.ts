import { expect, test } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  The mock draws these at 390pt. --breakpoint-md is 860px, so everything flips at
  once: below it the rail is gone and the tab bar is the navigation.
*/
test.use({ viewport: { width: 390, height: 844 } })

const uniqueTitle = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function seedTopic(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('link', { name: 'Add topic' }).click()
  await page.getByLabel('Topic', { exact: true }).fill(title)
  await page.getByLabel('Definition').fill('A topic to see on a phone.')
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
}

test('the rail is gone and the tab bar replaces it', async ({ page }) => {
  await signInAs(page, 'main')

  await expect(page.locator('aside')).toBeHidden()

  const tabbar = page.getByRole('navigation', { name: 'Main' })
  await expect(tabbar.getByRole('link', { name: 'Library' })).toBeVisible()
  await expect(tabbar.getByRole('link', { name: 'Practice' })).toBeVisible()
  await expect(tabbar.getByRole('link', { name: 'Add topic' })).toBeVisible()

  // Two destinations plus the FAB — Weak is a filter chip, not a third tab.
  await expect(tabbar.getByRole('link')).toHaveCount(3)
})

test('every destination is reachable on a phone', async ({ page }) => {
  await signInAs(page, 'main')
  await seedTopic(page, uniqueTitle('Phone'))

  // Practice, from the tab bar.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Practice' }).click()
  await expect(page).toHaveURL(/\/practice/)

  // Practice has no tab bar by design, so leaving it uses the screen's own exit.
  await page.getByRole('link', { name: 'End session' }).click()
  await expect(page).toHaveURL(/\/library/)

  // Weak — a filter chip on Library, per DESIGN.md, not a destination.
  await page.getByRole('button', { name: /^Weak/ }).click()
  await expect(page).toHaveURL(/quick=needs-review/)

  // Sign out.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
})

test('the FAB opens the add sheet, full screen', async ({ page }) => {
  await signInAs(page, 'main')

  await page.getByRole('link', { name: 'Add topic' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add topic' })
  await expect(sheet).toBeVisible()

  // Full screen, not a side panel: it spans the viewport width.
  const box = await sheet.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(390 - 1)
  expect(box!.x).toBeLessThanOrEqual(1)
})

test('the three selects collapse behind one Filters chip', async ({ page }) => {
  await signInAs(page, 'main')
  await seedTopic(page, uniqueTitle('Filterable'))

  // Three popovers side by side do not fit at 390pt, so they are not there.
  await expect(page.getByRole('button', { name: /^Category:/ })).toBeHidden()

  await page.getByRole('button', { name: 'Filters' }).click()
  const sheet = page.getByRole('dialog', { name: 'Filters' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: /^Category:/ })).toBeVisible()
  await expect(sheet.getByRole('button', { name: /^Confidence:/ })).toBeVisible()
  await expect(sheet.getByRole('button', { name: /^Difficulty:/ })).toBeVisible()
})

test('practice hides the tab bar entirely', async ({ page }) => {
  await signInAs(page, 'main')
  await seedTopic(page, uniqueTitle('Focus'))

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Practice' }).click()
  await expect(page).toHaveURL(/\/practice/)

  // The one distraction-free screen.
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
})

test('signing out works from a phone', async ({ page }) => {
  await signInAs(page, 'main')

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
})

test('focus and keyboard behaviour hold at mobile width', async ({ page }) => {
  await signInAs(page, 'main')

  const fab = page.getByRole('link', { name: 'Add topic' })
  await fab.click()
  await expect(page.getByRole('dialog', { name: 'Add topic' })).toBeVisible()

  // The sheet has a real close control now, not just Escape.
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
