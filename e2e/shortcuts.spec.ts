import { expect, test } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  The rail has advertised N, / and P since phase 4 and nothing implemented them,
  so the sidebar spent the whole build promising three things the app did not do.
  These are the promise, checked.

  Every one of them must also be inert while typing — a shortcut that fires while
  someone is writing a topic title is worse than no shortcut.
*/

test('N opens the add sheet, from the library and from elsewhere', async ({ page }) => {
  await signInAs(page, 'main')

  // Retried, for the hydration reason spelled out in the slash test below.
  await expect(async () => {
    await page.keyboard.press('n')
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 500 })
  }).toPass()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  // And from a page that has no add button of its own.
  await page.goto('/weak')
  await page.keyboard.press('n')
  await expect(page).toHaveURL(/\/library/)
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('slash focuses search, and brings you to it from another page', async ({ page }) => {
  await signInAs(page, 'main')

  const search = page.getByRole('searchbox', { name: 'Search your knowledge' })

  /*
    Retried rather than pressed once. A key handler is client-side, so it does
    not exist until React hydrates — a keystroke landing before that is genuinely
    ignored, by the app and not just by the test. `toPass` waits for the page to
    become interactive instead of asserting against a race.
  */
  await expect(async () => {
    await page.keyboard.press('/')
    await expect(search).toBeFocused({ timeout: 500 })
  }).toPass()

  await page.goto('/weak')
  await expect(async () => {
    await page.keyboard.press('/')
    await expect(page).toHaveURL(/\/library/, { timeout: 1000 })
  }).toPass()
  await expect(search).toBeFocused()

  // The param is consumed, so a reload does not steal focus again.
  await expect(page).not.toHaveURL(/focus=search/)
})

test('P starts practice', async ({ page }) => {
  await signInAs(page, 'main')

  /*
    Retried, like the slash test. Pressing once passed for months and then started
    failing about one full-suite run in three when the quiz specs were added — not
    because anything about P changed, but because more tests running alongside it
    made hydration lose a race it had always been in. A single press asserts that
    the page happened to be interactive, which is not what this test is about.
  */
  await expect(async () => {
    await page.keyboard.press('p')
    await expect(page).toHaveURL(/\/practice/, { timeout: 1000 })
  }).toPass()
})

test('the shortcuts are inert while typing', async ({ page }) => {
  await signInAs(page, 'main')

  const search = page.getByRole('searchbox', { name: 'Search your knowledge' })
  await search.click()
  await search.type('np/')

  // The characters land in the field; nothing navigates, nothing opens.
  await expect(search).toHaveValue('np/')
  await expect(page).toHaveURL(/\/library/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
