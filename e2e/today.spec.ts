import { expect, test } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  Today.

  Three things typed by hand each morning, plus a blocker. The two rules this file
  exists to hold: opening the app writes nothing, and yesterday's unticked lines
  are PREFILLED rather than carried.
*/

/** The user's local date, computed the way the app computes it. */
const localDay = (offset = 0) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const settle = (page: import('@playwright/test').Page) =>
  page.getByRole('heading', { level: 1, name: 'Today' }).waitFor()

test.describe('Today', () => {
  test.describe.configure({ mode: 'serial' })

  test('opening it writes nothing, prefills yesterday, and saves what you type', async ({
    page,
  }) => {
    await signInAs(page, 'main')

    // ── opening the app must not create a row ─────────────────────────────
    await page.goto('/today')
    await settle(page)
    await page.reload()
    await settle(page)

    await page.goto('/today/earlier')
    await expect(page.getByRole('heading', { level: 1, name: 'Earlier days' })).toBeVisible()

    /*
      The assertion that matters, and it is a real one: EarlierDays renders every
      row readAllDays returns and filters nothing on emptiness, so a row created
      by merely opening Today WOULD appear here. Verified by adding an upsert to
      the page module and watching this fail — see TASKS.md.
    */
    await expect(
      page.locator(`[data-testid="log-row"][data-day="${localDay(0)}"]`),
      'opening Today created a row — a day you never typed on is not a day you failed',
    ).toHaveCount(0)

    // Yesterday is there, which proves the locator above can find a row at all.
    await expect(
      page.locator(`[data-testid="log-row"][data-day="${localDay(-1)}"]`),
    ).toHaveCount(1)

    // ── yesterday's unticked line is prefilled, the ticked one is not ──────
    await page.goto('/today')
    await settle(page)

    await expect(page.getByLabel('Rebuild')).toHaveValue('Write once() from memory, no notes')
    await expect(
      page.getByLabel('Explain'),
      'a ticked line is finished — offering it back would be asking you to do it twice',
    ).toHaveValue('')

    // ── clearing a prefilled line works, in one action ────────────────────
    await page.getByRole('button', { name: 'Clear' }).first().click()
    await expect(page.getByLabel('Rebuild')).toHaveValue('')

    // ── type three and save ───────────────────────────────────────────────
    await page.getByLabel('Explain').fill('Explain hydration without notes')
    await page.getByLabel('Rebuild').fill('Rebuild once() from memory')
    await page.getByLabel('Apply').fill('Decide where search state lives')
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    /*
      exact: true, because "Save" is a prefix of "Save blocker" and a non-exact
      name matches both. The failure looks like the wrong element responding
      rather than an ambiguous locator — see ARCHITECTURE.md.
    */
    await expect(page.getByTestId('intention-box')).toHaveCount(3, { timeout: 30_000 })

    // ── tick one, reload, and it persisted ────────────────────────────────
    const boxes = page.getByTestId('intention-box')
    await expect(boxes.first()).toHaveAttribute('data-done', 'false')
    await boxes.first().click()
    await expect(boxes.first()).toHaveAttribute('data-done', 'true', { timeout: 30_000 })

    await page.reload()
    await settle(page)
    await expect(page.getByTestId('intention-box').first()).toHaveAttribute('data-done', 'true')
    await expect(page.getByText('1 of 3 ticked')).toBeVisible()
  })

  test('a blocker outlives its day until it is resolved', async ({ page }) => {
    await signInAs(page, 'main')
    await page.goto('/today')
    await settle(page)

    // Written two days ago, unresolved — so it is still here.
    await expect(page.getByText('Debounced search still fires after unmount', { exact: false })).toBeVisible()
    await expect(page.getByText('still open', { exact: false })).toBeVisible()

    // The resolved one from three days ago does not appear.
    await expect(
      page.getByText('audit writes belong in the same transaction', { exact: false }),
    ).toHaveCount(0)

    await page.getByRole('button', { name: 'Mark resolved' }).click()
    await expect(
      page.getByText('Debounced search still fires after unmount', { exact: false }),
      'resolving stops it showing on Today',
    ).toHaveCount(0, { timeout: 30_000 })

    /*
      But it is not deleted. Resolving keeps the text and stamps the date — the
      log is a record, and a record that erases what you were stuck on is not one.
    */
    await page.goto('/today/earlier')
    await expect(
      page.getByText('Debounced search still fires after unmount', { exact: false }),
    ).toBeVisible()
  })

  test('an earlier day is read-only', async ({ page }) => {
    await signInAs(page, 'main')
    await page.goto('/today/earlier')

    const yesterday = page.locator(`[data-testid="log-row"][data-day="${localDay(-1)}"]`)
    await expect(yesterday).toHaveCount(1)

    /*
      Not a disabled control — no control at all. Ticking Thursday's box from
      Sunday's chair is writing history rather than recording it.
    */
    await expect(yesterday.getByRole('checkbox')).toHaveCount(0)
    await expect(yesterday.getByRole('button')).toHaveCount(0)
    await expect(yesterday.getByRole('textbox')).toHaveCount(0)
  })

  test('a day is never practised and never reaches the weak page', async ({ page }) => {
    await signInAs(page, 'main')

    for (const path of ['/practice', '/weak']) {
      await page.goto(path)
      await expect(page.getByText('Write once() from memory, no notes')).toHaveCount(0)
      await expect(page.getByText('Debounced search still fires', { exact: false })).toHaveCount(0)
    }
  })

  test('signed out, Today is not reachable', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/today')
    await expect(page).toHaveURL(/\/sign-in/)
  })
})

test.describe('Today on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  /*
    A DIFFERENT fixture user, deliberately.

    This describe runs in parallel with the one above, and both would otherwise
    write the same user's "today" — so whichever ran first decided whether
    "opening Today writes nothing" could still be true. A test that passes only in
    a particular order fails later for a reason nobody can reproduce.

    `few` owns no seeded days, so this test makes its own state from nothing.
  */
  test('the More sheet has seven items and the boxes are 44px targets', async ({ page }) => {
    await signInAs(page, 'few')

    const more = page.getByRole('button', { name: 'More' })
    await more.waitFor()
    await more.click()
    const sheet = page.getByRole('dialog', { name: 'More' })

    for (const label of [
      'Today',
      'Phases',
      'Ledger',
      'Sources',
      'Settings',
      'Sign out',
      'Delete account',
    ]) {
      await expect(sheet.getByText(label, { exact: true })).toHaveCount(1)
    }

    // Rule 13 survives a seventh: none of these is a destination you bounce between.
    const tabs = page.getByRole('navigation', { name: 'Main' })
    await expect(tabs.locator('a')).toHaveCount(3)

    await sheet.getByRole('link', { name: /^Today/ }).click()
    await expect(page).toHaveURL(/\/today$/)
    await page.getByRole('heading', { level: 1, name: 'Today' }).waitFor()

    /*
      This describe runs in parallel with the one above, so today may or may not
      have been written yet. Make our own state rather than depending on another
      test's — a test that passes only in a particular order is a test that will
      fail for a reason nobody can reproduce.
    */
    if ((await page.getByLabel('Explain').count()) > 0) {
      await page.getByLabel('Explain').fill('Something to tick from a phone')
      await page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(page.getByTestId('intention-box')).toHaveCount(3, { timeout: 30_000 })
    }

    /*
      Ticking on a phone is the most likely thing anyone does here, so the 18px
      box keeps its size inside a 44px tap target. An unwritten slot's box is not
      a control at all, so it stays 18px and is never a target.
    */
    const measured = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('[data-testid="intention-box"]')]
      return {
        controls: boxes
          .filter((b) => b.getAttribute('data-control') === 'true')
          .map((b) => {
            const r = b.getBoundingClientRect()
            return { w: Math.round(r.width), h: Math.round(r.height), tag: b.tagName }
          }),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })

    expect(measured.overflow, 'the page is wider than the phone').toBe(0)
    expect(measured.controls.length, 'there should be something to tick').toBeGreaterThan(0)
    for (const box of measured.controls) {
      expect(box.tag).toBe('BUTTON')
      expect(box.w).toBeGreaterThanOrEqual(44)
      expect(box.h).toBeGreaterThanOrEqual(44)
    }
  })
})
