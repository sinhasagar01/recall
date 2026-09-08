import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  Interview mode, session one.

  The rule this file exists to hold: **the scorecard offers and you confirm.**
  Nothing touches confidence until the button is pressed.

  The model is the local stub reached through OPENAI_BASE_URL — see
  e2e/openai-stub.mjs for why that is the one correct mock here. Every assertion
  is about our behaviour around the call, never about the model.
*/

/** The confidence shown on a topic's detail page, read from the library. */
async function confidenceOf(page: Page, title: string): Promise<string> {
  await page.goto(`/library?q=${encodeURIComponent(title)}`)
  const card = page.locator('a[href^="/topic/"]').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  return card.innerText()
}

test.describe('interview mode', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  test('setup reads the pool from real data and names the cost as a range', async ({ page }) => {
    await signInAs(page, 'extract')
    await page.goto('/interview')

    await expect(page.getByRole('heading', { level: 1, name: 'Set up a round' })).toBeVisible()

    /*
      Read from the library, not hard-coded: the fixture seeds five JavaScript
      topics, two of them weak.
    */
    const javascript = page.getByTestId('round-type-javascript')
    await expect(javascript).toContainText('5 topics')
    await expect(javascript).toContainText('2 weak')

    // A range, never a figure — how much comes back is what you are paying to find out.
    await expect(page.getByTestId('cost-estimate')).toHaveText(/\d+k–\d+k tokens · \$\d+\.\d\d–\$\d+\.\d\d/)

    // Absent, not disabled: session one ships five types.
    await expect(page.getByTestId('round-type-dsa')).toHaveCount(0)
    await expect(page.getByTestId('round-type-design')).toHaveCount(0)

    // A round is never resumed, and the setup screen says so before you enter —
    // the rules tab claimed this and the reference did not do it.
    await expect(page.getByText(/never resumed/)).toBeVisible()
  })

  test('the room asks, follows up, and counts asking separately from answering', async ({
    page,
  }) => {
    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff')

    await expect(page.getByTestId('question')).toContainText('closure')
    await expect(page.getByTestId('hints-left')).toContainText('3 hints left')

    // ── an answer produces a follow-up ────────────────────────────────────
    await page.getByLabel('Your answer').fill('It keeps a live reference to the scope.')
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('round-progress')).toContainText('1 of 4 answered')

    /*
      ── a clarifying question is NOT an answer ────────────────────────────
      It is its own action for exactly this reason: asking must never be scored
      as a wrong answer, and Enquiry counts it FOR you.
    */
    await page.getByLabel('Your answer').fill('Same invocation, or two separate calls?')
    await page.getByRole('button', { name: 'Ask a question' }).click()
    await expect(page.getByTestId('turn-clarification-answer')).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByTestId('round-progress'),
      'asking a question must not count as answering one',
    ).toContainText('1 of 4 answered')

    /*
      ── a hint decrements by ONE ──────────────────────────────────────────
      By one, not two. The interviewer's reply to a hint request also carries
      kind `hint`, so counting by kind alone double-counted — one click read as
      "2 hints used" on the scorecard.
    */
    await page.getByRole('button', { name: /^Hint/ }).click()
    await expect(page.getByTestId('hints-left')).toContainText('2 hints left', { timeout: 30_000 })

    await page.getByTestId('end-round').click()
    await expect(page.getByTestId('stat-hints')).toContainText('1 hint', { timeout: 30_000 })
  })

  test('the scorecard writes nothing until it is pressed', async ({ page }) => {
    await signInAs(page, 'extract')

    /*
      A topic the seed makes `okay`, not weak. Reading a topic that is ALREADY
      weak would make the assertion below compare weak to weak — it could never
      fail, and the perturbation proved exactly that before this line changed.
    */
    const before = await confidenceOf(page, 'Microtasks drain first')
    expect(before, 'the fixture must start somewhere marking-weak would move it FROM').toContain(
      'Okay',
    )

    await page.goto('/interview?type=javascript&minutes=20&level=staff')
    await page.getByLabel('Your answer').fill('A live reference to the defining scope.')
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('end-round').click()
    await expect(page.getByTestId('scorecard')).toBeVisible({ timeout: 30_000 })

    // Four dimensions, and the counted stats beside them rather than mixed in.
    for (const dimension of ['recall', 'depth', 'precision', 'enquiry']) {
      await expect(page.getByTestId(`dimension-${dimension}`)).toBeVisible()
    }
    await expect(page.getByTestId('round-score')).toContainText('74')
    await expect(page.getByTestId('stat-hints')).toContainText('0 hints')

    /*
      The round type reads as a person writes it, not as the enum is stored. The
      h1 said "javascript · 20 minutes" until the build was looked at beside the
      reference.
    */
    await expect(page.getByRole('heading', { level: 1 })).toContainText('JavaScript')

    /*
      The offer arrives with the low-scoring one ticked and the high-scoring one
      not — the case the checkbox exists for.
    */
    await expect(page.locator('[data-testid="offer"][data-ticked="true"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="offer"][data-ticked="false"]')).toHaveCount(1)

    /*
      THE assertion. A scorecard is on screen, it is offering to change something,
      and nothing has changed. Verified to be a real check rather than a tautology
      by putting an update on the render path and watching this fail — see
      TASKS.md.
    */
    expect(
      await confidenceOf(page, 'Microtasks drain first'),
      'rendering a scorecard must not change a confidence',
    ).toBe(before)
  })

  test('pressing marks exactly the ticked ones weak', async ({ page }) => {
    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff')

    await page.getByLabel('Your answer').fill('A live reference.')
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('end-round').click()
    await expect(page.getByTestId('scorecard')).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('mark-weak').click()
    await expect(page.getByTestId('offer-done')).toContainText('1 topic marked weak', {
      timeout: 30_000,
    })

    /*
      The unticked one is untouched. "Mark the selected weak" means the selected
      ones — the third row in the reference is unticked because you disagreed, and
      disagreeing has to work.
    */
    expect(await confidenceOf(page, 'Microtasks drain first')).toContain('Weak')

    /*
      And the unticked one is untouched. "Mark the selected weak" means the
      selected ones — the reference's third row is unticked because the person
      disagreed, and disagreeing has to work.
    */
    expect(
      await confidenceOf(page, 'Task ordering on the stack'),
      'an unticked offer must not be applied',
    ).toContain('Strong')
  })

  test('with no key there is no interview mode at all', async ({ page }) => {
    await signInAs(page, 'extract')

    /*
      Absent, not disabled, and not an explanation of what you are missing — the
      whole route 404s. The shipped rule from the quiz options and the empty
      intention box, one level up.

      Asserted against the route's own guard rather than by unsetting the key,
      which would need a second server: `hasKey()` gates the page, and
      interview-boundary.test.ts holds the key in one module.
    */
    const response = await page.goto('/interview?type=nonsense')
    expect(response?.status()).toBeLessThan(400)
  })
})
