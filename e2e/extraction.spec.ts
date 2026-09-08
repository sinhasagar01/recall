import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  Extraction.

  The rule this file exists to hold: **nothing is saved until Save is pressed.**
  Extraction produces a review screen and nothing else.

  The model is a local stub reached through OPENAI_BASE_URL — see
  e2e/openai-stub.mjs for why that is the one correct mock in this suite. Every
  assertion here is about our behaviour around the call, never about the model.
*/

const unique = (prefix: string) => `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

/** A source with a transcript, which is what makes Extract appear at all. */
async function sourceWithTranscript(page: Page, transcript: string): Promise<string> {
  const title = unique('Extraction source')

  await page.goto('/sources')
  /*
    `.first()`, because the empty state renders the button twice — once in the
    head and once in the StateBlock — and `few` starts with no sources. As
    `main` there is only ever one, so the strict-mode violation appears only for
    a user whose list is empty.
  */
  await page.getByRole('button', { name: '+ Add a source' }).first().click()

  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Lesson').fill(title)
  await sheet.getByLabel(/^Transcript/).fill(transcript)
  await sheet.getByRole('button', { name: 'Save source' }).click()

  await expect(page).toHaveURL(/\/sources\/[0-9a-f-]+$/, { timeout: 30_000 })
  return page.url()
}

/*
  Its OWN fixture user, and it took two wrong answers to get there.

  This spec saves topics and quizzes as part of what it asserts, and a saved quiz
  is `new`, so it sorts to the front of a default practice session. As `main`
  that made practice.spec.ts's first card a quiz and "Reveal answer" vanished. As
  `few` it lifted a two-topic library over the practice minimum, so the override
  test had nothing to override. Both failures were in specs this arc never
  touched.

  `extract` exists to be written to. See scripts/seed-e2e-user.mts for the full
  list of why each other fixture was wrong — the shapes are the fixtures' whole
  purpose, so "just save somewhere else" was never going to work.
*/
test.describe('extraction', () => {
  test.describe.configure({ mode: 'serial' })
  // Two extractions plus four navigations in the first test.
  test.setTimeout(90_000)

  test('review creates nothing, and only Save writes', async ({ page }) => {
    await signInAs(page, 'extract')
    const source = await sourceWithTranscript(page, 'A lesson about closures and scope.')

    await expect(page.getByTestId('source-progress')).toHaveText('nothing extracted yet')

    // ── the send box names what leaves, before it leaves ──────────────────
    await expect(page.getByText(/sends the transcript ·/)).toBeVisible()
    await expect(page.getByText(/tokens in/)).toBeVisible()
    /*
      A RANGE, never a single figure — how much comes back is the thing being
      paid to find out. `$0.01–$0.02`, not `about $0.02`.
    */
    await expect(page.getByTestId('cost-estimate')).toHaveText(/about \$\d+\.\d\d–\$\d+\.\d\d/)
    await expect(page.getByText('Nothing is saved until you review it')).toBeVisible()

    // ── extract, and land on a review screen ──────────────────────────────
    await page.getByRole('button', { name: 'Extract' }).click()
    await expect(page.getByTestId('review-screen')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('review-row')).toHaveCount(3)

    // ── the duplicate arrived unticked, and the others ticked ─────────────
    await expect(page.getByTestId('already-saved')).toHaveCount(1)
    await expect(page.locator('[data-testid="review-row"][data-keep="true"]')).toHaveCount(2)

    /*
      THE assertion. A review screen exists with three concepts on it, and the
      source has still produced nothing. Verified to be a real check rather than
      a tautology by adding an insert to the extract path and watching it fail —
      see TASKS.md.
    */
    expect(
      await producedBy(page, source),
      'extracting wrote to the library before Save was pressed',
    ).toBe('nothing extracted yet')

    /*
      `producedBy` above navigated to the source, which threw the review away —
      which is itself the guarantee working: the result lives in this tab's
      memory and nowhere else, so leaving the page loses it. Extract again.
    */
    // ── untick one, then save exactly what is ticked ──────────────────────
    await page.getByRole('button', { name: 'Extract' }).click()
    await expect(page.getByTestId('review-screen')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('checkbox', { name: /^Keep The temporal dead zone/ }).click()
    await expect(page.locator('[data-testid="review-row"][data-keep="true"]')).toHaveCount(1)

    await page.getByRole('button', { name: /^Save 1 topic and 2 questions/ }).click()
    await expect(page.getByTestId('review-screen')).toHaveCount(0, { timeout: 30_000 })

    // Exactly the ticked one: one topic and its two questions, all brand new.
    expect(await producedBy(page, source)).toBe('1 topic · 2 quizzes · 3 never practised')
  })

  test('with no transcript there is no Extract button at all', async ({ page }) => {
    await signInAs(page, 'extract')

    await page.goto('/sources')
    await page.getByRole('button', { name: '+ Add a source' }).first().click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('Lesson').fill(unique('No transcript'))
    await sheet.getByRole('button', { name: 'Save source' }).click()
    await expect(page).toHaveURL(/\/sources\/[0-9a-f-]+$/, { timeout: 30_000 })

    /*
      Absent, not disabled. DESIGN.md's quiz rule — the options stop being
      buttons rather than becoming disabled buttons, because a disabled button
      still says button. The same shape holds for a missing key.
    */
    await expect(page.getByRole('button', { name: 'Extract' })).toHaveCount(0)

    // And the manual path is untouched, which is the point of it being a path.
    await expect(page.getByRole('link', { name: '+ Distil a topic' })).toBeVisible()
  })

  test('a partial result is offered rather than thrown away', async ({ page }) => {
    await signInAs(page, 'extract')
    const source = await sourceWithTranscript(page, 'PARTIAL-RUN a lesson cut off part way.')

    await page.getByRole('button', { name: 'Extract' }).click()
    await expect(page.getByTestId('review-screen')).toBeVisible({ timeout: 30_000 })

    // The complete elements survived; the fragment did not.
    await expect(page.getByTestId('review-row')).toHaveCount(1)
    await expect(page.getByText(/The model stopped after 1 concept/)).toBeVisible()

    // Still nothing written — a partial result is not a partial save.
    expect(await producedBy(page, source)).toBe('nothing extracted yet')
  })

  test('an unreadable response is a readable error, and saves nothing', async ({ page }) => {
    await signInAs(page, 'extract')
    const source = await sourceWithTranscript(page, 'BROKEN-RUN comes back as prose not JSON.')

    await page.getByRole('button', { name: 'Extract' }).click()
    /*
      By test id, not by role. Next's route announcer is also `role="alert"` and
      carries the page title, so a role locator resolves to two elements and
      matches the wrong one — see ARCHITECTURE.md, "`role=\"alert\"` is not
      unique".
    */
    await expect(page.getByTestId('extract-error')).toContainText(
      /not readable as JSON|No concepts found/,
      { timeout: 30_000 },
    )

    await expect(page.getByTestId('review-screen')).toHaveCount(0)
    expect(await producedBy(page, source)).toBe('nothing extracted yet')
  })
})

/**
 * What THIS source has produced, read off its own workspace.
 *
 * Deliberately not a library-wide count. Several specs add topics as the same
 * fixture user in parallel, so a library total would be a number another test
 * could move underneath this one — the arc 5 failure, where two describes wrote
 * the same user's day and whichever ran first decided the result. A source only
 * this test created is state only this test can change.
 */
async function producedBy(page: Page, sourceUrl: string): Promise<string> {
  await page.goto(sourceUrl)
  return page.getByTestId('source-progress').innerText()
}
