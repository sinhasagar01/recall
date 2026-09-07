import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  Phases and capabilities.

  A capability is demonstrated by evidence, never by a tick. The box has no click
  handler and no column behind it, so the only way it can ever check itself is by
  the rule being true — which is what the central test here drives end to end.
*/

const cardFor = (page: Page, title: string) =>
  page.getByRole('link').filter({ hasText: title })

const rowFor = (page: Page, capability: string) =>
  page.locator('div').filter({ hasText: capability }).last()

test.describe('phases', () => {
  test.describe.configure({ mode: 'serial' })

  test('the box checks itself when evidence arrives, and says why until it does', async ({
    page,
  }) => {
    await signInAs(page, 'main')

    const phaseName = `Verify phase ${Date.now()}`
    const capabilityName = `Explain hydration without notes ${Date.now()}`
    const topicTitle = `Hydration ${Date.now()}`

    // ── a phase ───────────────────────────────────────────────────────────
    await page.goto('/phases')
    await page.getByRole('button', { name: '+ Add a phase' }).first().click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('Name').fill(phaseName)
    await sheet.getByLabel(/^When/).fill('Weeks 9-10')
    await sheet.getByRole('button', { name: 'Save phase' }).click()

    await expect(page).toHaveURL(/\/phases\/[0-9a-f-]+$/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { level: 1, name: phaseName })).toBeVisible()
    const phaseUrl = page.url()

    // ── a capability ──────────────────────────────────────────────────────
    await page.getByRole('button', { name: '+ Add a capability' }).click()
    await page.getByLabel('What you will be able to do').fill(capabilityName)
    await page.getByRole('button', { name: 'Save capability' }).click()
    await expect(page.getByText(capabilityName)).toBeVisible({ timeout: 30_000 })

    const box = page.getByTestId('capability-box')
    await expect(box).toHaveAttribute('data-demonstrated', 'false')
    // Nothing linked: an absence, so no diagnosis — the evidence line says it.
    await expect(page.getByText('nothing linked')).toBeVisible()
    await expect(page.getByTestId('capability-reason')).toHaveCount(0)

    // ── link a topic ──────────────────────────────────────────────────────
    await page.goto('/library?add=1')
    const add = page.getByRole('dialog')
    await add.getByRole('textbox', { name: 'Topic', exact: true }).fill(topicTitle)
    await add.getByLabel('Definition').fill('The client rendered something the server did not.')
    await add.getByLabel('Capability').selectOption({ label: capabilityName })
    await add.getByRole('button', { name: 'Save topic' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })

    /*
      Still unchecked, and this is the assertion that matters: the REASON, not
      just the state. A bare unchecked box gives no instruction; naming the
      missing half tells you whether to practise it or go build with it. An
      assertion on the box alone would pass for a screen that says nothing.
    */
    await page.goto(phaseUrl)
    await expect(page.getByTestId('capability-box')).toHaveAttribute('data-demonstrated', 'false')
    await expect(page.getByTestId('capability-reason')).toHaveText(
      'Not demonstrated: nothing linked is at okay or better, and nothing carries evidence.',
    )

    // ── the recall half only ──────────────────────────────────────────────
    await page.goto(`/library?q=${encodeURIComponent(topicTitle)}`)
    await cardFor(page, topicTitle).first().click()
    await expect(page).toHaveURL(/\/topic\//)
    const topicUrl = page.url()

    /*
      Confidence is earned by practising, never set on the topic page — so the
      recall half is reached the way a person reaches it. "Knew it" grades strong.
    */
    await page.getByRole('link', { name: 'Practice this' }).click()
    await page.getByRole('button', { name: 'Reveal answer' }).click()
    await page.getByRole('button', { name: /Knew it/ }).click()
    // The grade is written as the session completes — navigating sooner races it.
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()

    await page.goto(topicUrl)
    await expect(page.getByTestId('stat-confidence')).toContainText('Strong', { timeout: 30_000 })

    await page.goto(phaseUrl)
    await expect(page.getByTestId('capability-box')).toHaveAttribute('data-demonstrated', 'false')
    // The opposite reason from before — same box, different instruction.
    await expect(page.getByTestId('capability-reason')).toHaveText(
      'Not demonstrated: you can say it, but you have not built with it.',
    )

    // ── record evidence, and watch it check itself ────────────────────────
    await page.goto(topicUrl)
    await page.getByRole('button', { name: 'Record rebuild' }).click()
    const evidence = page.getByRole('dialog')
    await evidence.getByLabel('What you did').fill('Rebuilt the hydration mismatch from memory')
    await evidence.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })

    /*
      Nothing on the phase screen was clicked. The box changed because the rule
      became true.
    */
    await page.goto(phaseUrl)
    await expect(page.getByTestId('capability-box')).toHaveAttribute('data-demonstrated', 'true')
    await expect(page.getByTestId('capability-reason')).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: phaseName })).toBeVisible()

    // ── the topic says what it is for ─────────────────────────────────────
    await page.goto(topicUrl)
    await expect(page.getByText('What this is for')).toBeVisible()
    await expect(page.getByRole('link', { name: capabilityName })).toBeVisible()

    // ── delete the phase: the topic survives, with no capability line ─────
    await page.goto(phaseUrl)
    await page.getByRole('button', { name: 'Delete phase' }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm).toContainText('The 1 topic linked to it stays in your library')
    await expect(confirm).toContainText('it loses the line saying which capability it serves')
    await confirm.getByRole('button', { name: 'Delete phase' }).click()
    await expect(page).toHaveURL(/\/phases$/, { timeout: 30_000 })

    await page.goto(topicUrl)
    await expect(page.getByRole('heading', { level: 1, name: topicTitle })).toBeVisible()
    await expect(page.getByText('What this is for')).toHaveCount(0)
  })

  test('the box cannot be clicked, because it is not a control', async ({ page }) => {
    await signInAs(page, 'main')
    await page.goto('/phases')
    await cardFor(page, 'Core engineering foundations').first().click()

    // No checkbox anywhere on the screen: there is nothing to tick.
    await expect(page.getByRole('checkbox')).toHaveCount(0)

    const box = page.getByTestId('capability-box').first()
    await expect(box).toBeVisible()
    await expect(box).toHaveAttribute('aria-hidden', 'true')
  })

  test('the two opposite middle states appear together, each naming its half', async ({
    page,
  }) => {
    await signInAs(page, 'main')
    await page.goto('/phases')
    await cardFor(page, 'Core engineering foundations').first().click()

    /*
      The seeded fixture carries both: one capability with recall and no evidence,
      one with evidence and no recall. The point of the whole screen is that these
      are the same box with opposite instructions.
    */
    await expect(
      page.getByText('Not demonstrated: you can say it, but you have not built with it.'),
    ).toBeVisible()
    await expect(
      page.getByText('Not demonstrated: you have built with it, but you cannot say it cold.'),
    ).toBeVisible()
  })

  test('a phase is never practised and never reaches the weak page', async ({ page }) => {
    await signInAs(page, 'main')

    for (const path of ['/practice', '/weak']) {
      await page.goto(path)
      await expect(page.getByText('Core engineering foundations')).toHaveCount(0)
      await expect(page.getByText('Explain closures without notes')).toHaveCount(0)
    }
  })

  test('current is the earliest phase not fully demonstrated, and never a date', async ({
    page,
  }) => {
    await signInAs(page, 'main')
    await page.goto('/phases')

    const current = page.getByText('Current', { exact: true })
    await expect(current).toHaveCount(1)

    // The earliest of the two seeded phases, not the most recent.
    const first = cardFor(page, 'Core engineering foundations').first()
    await expect(first).toContainText('Current')

    // Nothing on this screen is a percentage, a week counter or a burn-down.
    await expect(page.getByText('%')).toHaveCount(0)
  })

  test('signed out, phases is not reachable', async ({ page }) => {
    // The arc 2 regression: /sources shipped absent from the proxy's GUARDED list
    // and answered 500 instead of redirecting.
    await page.context().clearCookies()
    await page.goto('/phases')
    await expect(page).toHaveURL(/\/sign-in/)
  })
})

/*
  ── The arc 3 mobile assertion moved, it was not deleted ────────────────────

  Arc 3 asserted a wrapping five-item inline cluster in the library head, with
  measurements to match. Arc 4 replaced that cluster with a single More link
  opening a sheet, because Ledger is the sixth destination and six inline items
  wrap to three lines.

  Leaving the old test would have been worse than deleting it: it located the
  cluster by `filter({ has: a[href="/phases"] })`, which now matches nothing, so
  it would have passed by asserting over an empty set while appearing to guard the
  mobile head.

  Its invariants live in e2e/ledger.spec.ts, "More opens a sheet with all six, and
  the head is shorter than the wrapped row": no horizontal overflow, h1 on one
  line, the tab bar at exactly three, and the head measured against the 95px this
  arc recorded. What remains here is the part that is about phases rather than
  about the head — that /phases is reachable from a phone at all.
*/
test.describe('phases on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('is reachable from the More sheet', async ({ page }) => {
    await signInAs(page, 'main')

    await page.getByRole('button', { name: 'More' }).click()
    const sheet = page.getByRole('dialog', { name: 'More' })
    await sheet.getByRole('link', { name: /^Phases/ }).click()

    await expect(page).toHaveURL(/\/phases$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Phases' })).toBeVisible()
  })
})
