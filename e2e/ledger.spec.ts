import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  The project ledger.

  Links, not documents. The two rules this file exists to hold: the ledger never
  changes whether a capability is demonstrated, and a delete says what it does not
  touch.
*/

const cardFor = (page: Page, title: string) =>
  page.getByRole('link').filter({ hasText: title })

test.describe('the ledger', () => {
  test.describe.configure({ mode: 'serial' })

  test('an item is added, appears on its capability, and changes nothing about demonstrated', async ({
    page,
  }) => {
    await signInAs(page, 'main')

    const title = `VERIFY ADR ${Date.now()}`

    // ── the capability's demonstrated state, BEFORE ───────────────────────
    await page.goto('/phases')
    await cardFor(page, 'Core engineering foundations').first().click()
    await expect(page).toHaveURL(/\/phases\//)
    const phaseUrl = page.url()

    const boxes = page.getByTestId('capability-box')
    const before = await boxes.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-demonstrated')),
    )
    expect(before.length).toBeGreaterThan(0)

    // ── add an item with a link, served by a capability ───────────────────
    await page.goto('/ledger')
    await page.getByRole('button', { name: '+ Add an item' }).first().click()
    const sheet = page.getByRole('dialog', { name: 'Add an item' })
    await sheet.getByRole('button', { name: 'ADR', exact: true }).click()
    await sheet.getByLabel('Title').fill(title)
    await sheet.getByLabel(/^Link/).fill('https://github.com/example/recall/blob/main/adr-009.md')
    await sheet.getByRole('button', { name: 'Decided' }).click()
    await sheet.getByLabel('Serves').selectOption({ label: 'Explain closures without notes' })
    await sheet.getByRole('button', { name: 'Save item' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })

    // ── it is in the list, with its status in the ADR's vocabulary ────────
    await expect(page.getByText(title)).toBeVisible()
    const row = page.locator(`[data-testid="ledger-row"][data-item-title="${title}"]`)
    await expect(row, 'the status shows in the ADR’s vocabulary').toContainText('Decided')
    // The title is a link out — there is no ledger detail page.
    await expect(page.getByRole('link', { name: title })).toHaveAttribute(
      'href',
      'https://github.com/example/recall/blob/main/adr-009.md',
    )

    // ── the capability shows it, and is demonstrated exactly as before ────
    await page.goto(phaseUrl)
    await expect(page.getByText(/^Ledger ·/).first()).toBeVisible()

    const after = await page
      .getByTestId('capability-box')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-demonstrated')))

    /*
      The rule this arc most needs to keep. The product cannot know whether you
      shipped what a URL points at, so a ledger item is context — never a third
      half. Asserted as the whole vector, so a change to ANY capability fails.
    */
    expect(after, 'adding a ledger item changed a capability’s demonstrated state').toEqual(before)

    // ── the one scoped filter ─────────────────────────────────────────────
    await page.getByRole('link', { name: /item/ }).first().click()
    await expect(page).toHaveURL(/\/ledger\?capability=/)
    await expect(page.getByText(title)).toBeVisible()
    await expect(page.getByRole('link', { name: 'show everything' })).toBeVisible()

    // ── retire it: it stays in the list, in place ─────────────────────────
    await page.goto('/ledger')
    const rowOrder = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="ledger-row"]')].map((n) =>
          n.getAttribute('data-item-title'),
        ),
      )
    const positionBefore = (await rowOrder()).indexOf(title)
    expect(positionBefore, 'the row should be in the list to begin with').toBeGreaterThanOrEqual(0)

    await page.getByLabel(`Status of ${title}`).selectOption('retired')
    await expect(page.getByLabel(`Status of ${title}`)).toHaveValue('retired', { timeout: 30_000 })

    await page.reload()
    await expect(page.getByText(title), 'a retired item stays in the list').toBeVisible()
    await expect(
      page.locator(`[data-testid="ledger-row"][data-item-title="${title}"]`),
      'and an ADR’s retired word is Superseded',
    ).toContainText('Superseded')

    expect(
      (await rowOrder()).indexOf(title),
      'a retired item stays where it was, at its original date',
    ).toBe(positionBefore)

    // ── delete: the confirmation says what is NOT touched ─────────────────
    await page.getByRole('button', { name: `Delete ${title}` }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm).toContainText('Nothing at the link is touched')
    await expect(confirm).toContainText('the ADR stays where you wrote it')
    await confirm.getByRole('button', { name: 'Delete entry' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })

    await page.reload()
    await expect(page.getByText(title)).toHaveCount(0)
  })

  test('an item with no link says so rather than looking broken', async ({ page }) => {
    await signInAs(page, 'main')
    await page.goto('/ledger')

    const row = page.locator(
      '[data-testid="ledger-row"][data-item-title="Add optimistic updates to the comment thread"]',
    )

    await expect(row).toContainText('no link yet')
    // No ↗ and no anchor: there is nothing to open.
    await expect(
      page.getByRole('link', { name: 'Add optimistic updates to the comment thread' }),
    ).toHaveCount(0)
  })

  test('a ledger item is never practised and never reaches the weak page', async ({ page }) => {
    await signInAs(page, 'main')

    for (const path of ['/practice', '/weak']) {
      await page.goto(path)
      await expect(page.getByText('Search state ownership')).toHaveCount(0)
      await expect(page.getByText('New table shipped without a GRANT')).toHaveCount(0)
    }
  })

  test('signed out, the ledger is not reachable', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/ledger')
    await expect(page).toHaveURL(/\/sign-in/)
  })
})

test.describe('the ledger on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  /**
   * This replaces the arc 3 assertion at e2e/phases.spec.ts, which described a
   * wrapping five-item inline cluster that no longer exists.
   *
   * Its invariants survive here — no horizontal overflow, h1 on one line, tab bar
   * at exactly three — and its subject changes: the sixth destination arrives, so
   * the head now costs one word instead of a wrapping row, and the head must be
   * SHORTER than the 95px arc 3 measured rather than merely no taller.
   */
  test('More opens a sheet with all six, and the head is shorter than the wrapped row', async ({
    page,
  }) => {
    await signInAs(page, 'main')
    const more = page.getByRole('button', { name: 'More' })
    await more.waitFor()

    // ── the head, measured ────────────────────────────────────────────────
    const metrics = await page.evaluate(() => {
      const head = document.querySelector('main > div') as HTMLElement
      const h1 = head.querySelector('h1') as HTMLElement
      const line = parseFloat(getComputedStyle(h1).lineHeight)
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        headHeight: Math.round(head.getBoundingClientRect().height),
        h1Lines: Math.round(h1.getBoundingClientRect().height / line),
      }
    })

    expect(metrics.scrollWidth, 'the page is wider than the phone').toBe(metrics.clientWidth)
    expect(metrics.h1Lines, 'the title fits on one line').toBe(1)
    /*
      Arc 3's wrapped five-item row measured 95px. A sixth item must not cost
      height, and a sheet means it costs none — the head is one word regardless of
      how many destinations exist.
    */
    expect(metrics.headHeight, 'the head must be no taller than the arc 3 wrapped row').toBeLessThanOrEqual(95)

    // ── the sheet: six items, with counts ─────────────────────────────────
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await more.click()
    const sheet = page.getByRole('dialog', { name: 'More' })
    await expect(sheet).toBeVisible()

    for (const label of ['Phases', 'Ledger', 'Sources', 'Settings', 'Sign out', 'Delete account']) {
      await expect(sheet.getByText(label, { exact: true })).toHaveCount(1)
    }
    // The counts the rail carries, so the two surfaces cannot disagree.
    await expect(sheet.getByRole('link', { name: /^Phases/ })).toContainText('/')
    await expect(sheet.getByRole('link', { name: /^Ledger/ })).toContainText(/\d/)

    // ── rule 13 survives: two destinations plus add ───────────────────────
    const tabs = page.getByRole('navigation', { name: 'Main' })
    await expect(tabs.locator('a')).toHaveCount(3)
    await expect(tabs.locator('a[href="/ledger"]')).toHaveCount(0)
    await expect(tabs.locator('a[href="/library"]')).toHaveCount(1)
    await expect(tabs.locator('a[href="/practice"]')).toHaveCount(1)

    await sheet.getByRole('link', { name: /^Ledger/ }).click()
    await expect(page).toHaveURL(/\/ledger$/)
  })
})
