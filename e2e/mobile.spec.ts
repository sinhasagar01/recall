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
  await page.getByRole('textbox', { name: 'Topic', exact: true }).fill(title)
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

/*
  The add sheet at phone size: Save is reachable on arrival.

  It was not. At 390x844 the sheet's content is 951px tall, so the footer — which
  used to sit at the bottom of one scrolling box — put Save at y=862 against an
  844px viewport. The primary action of the primary form opened 18px below the
  fold, before a single character was typed.

  Asserted as "in the viewport", not as "visible": Playwright's toBeVisible() is
  satisfied by a rendered element with a box, whether or not it is on screen, and
  would have passed throughout.
*/
test.describe('the add sheet on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Save is in the viewport when the sheet opens, with every field present', async ({ page }) => {
    await signInAs(page, 'main')
    await page.goto('/library?add=1')

    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()

    // Nothing was removed to achieve this. Every field the desktop sheet has.
    await expect(sheet.getByRole('textbox', { name: 'Topic', exact: true })).toBeVisible()
    await expect(sheet.getByLabel('Definition')).toBeVisible()
    await expect(sheet.getByLabel(/Mental model/)).toHaveCount(1)
    await expect(sheet.getByText('Category', { exact: true })).toHaveCount(1)
    await expect(sheet.getByText(/^Tags/)).toHaveCount(1)
    await expect(sheet.getByText(/^Visual/)).toHaveCount(1)

    const save = sheet.getByRole('button', { name: 'Save topic' })
    const box = await save.boundingBox()
    const viewport = page.viewportSize()!.height
    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport)

    /*
      And it stays there once the body scrolls, which is the actual fix — the
      footer is pinned rather than the content being made to fit.
    */
    await page.mouse.move(195, 400)
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(300)
    const after = await save.boundingBox()
    expect(after!.y + after!.height).toBeLessThanOrEqual(viewport)

    // It is a real control at that position, not merely a box in the layout.
    await sheet.getByRole('textbox', { name: 'Topic', exact: true }).fill(`Pinned footer ${Date.now()}`)
    await sheet.getByLabel('Definition').fill('Saved without scrolling to find the button.')
    await save.click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
  })
})
