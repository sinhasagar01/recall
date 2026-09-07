import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  Evidence on a topic.

  Four markers, three recordable. Recall is derived from confidence and is never
  editable here. The section exists only on topics — on a quiz it is ABSENT, not
  empty, which is asserted as absence for the reason recorded in ARCHITECTURE.md:
  "the element is empty" passes before and after and proves nothing.
*/

const ALL_THREE = 'Debouncing a scroll handler'
const ONE_MARKER = 'The backpack'
const QUIZ = 'Does a transform on a parent create a stacking context?'

const cardFor = (page: Page, title: string) =>
  page.getByRole('link').filter({ hasText: title })

async function openTopic(page: Page, title: string) {
  await page.goto(`/library?q=${encodeURIComponent(title)}`)
  await cardFor(page, title).first().click()
  await expect(page).toHaveURL(/\/topic\//)
}

test.describe('recording evidence', () => {
  test.describe.configure({ mode: 'serial' })

  test('a rebuild can be recorded with a date and a link, and it shows on the topic', async ({
    page,
  }) => {
    await signInAs(page, 'main')

    // A topic with nothing recorded yet, made for this test so the run is repeatable.
    const title = `Evidence target ${Date.now()}`
    await page.getByRole('button', { name: /Add topic/ }).first().click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('textbox', { name: 'Topic', exact: true }).fill(title)
    await sheet.getByLabel('Definition').fill('Something to hang evidence on.')
    await sheet.getByRole('button', { name: 'Save topic' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

    await openTopic(page, title)

    // The rule is on screen, above the row — never four ticks without a reason.
    await expect(
      page.getByText('Weak until you can explain it, implement a variant, and use it in a design decision.'),
    ).toBeVisible()
    await expect(page.getByText('Not yet').first()).toBeVisible()

    await page.getByRole('button', { name: 'Record rebuild' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('What you did').fill('once() from memory')
    await dialog.getByLabel('When').fill('2026-08-28')
    await dialog.getByLabel(/^Link/).fill('https://gist.github.com/example/once')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

    await expect(page.getByText('once() from memory')).toBeVisible()
    await expect(page.getByText('Aug 28')).toBeVisible()
    await expect(page.getByRole('link', { name: 'link' })).toHaveAttribute(
      'href',
      'https://gist.github.com/example/once',
    )

    // ── and it reaches the library card as a square ─────────────────────────
    await page.goto(`/library?q=${encodeURIComponent(title)}`)
    const card = cardFor(page, title).first()
    await expect(card.getByRole('img', { name: /Evidence: rebuild/ })).toBeVisible()

    /*
      The squares REPLACE Model ✓ rather than sitting beside it. The card foot's
      right slot holds one element.
    */
    await expect(card.getByText('Model ✓')).toHaveCount(0)

    // ── edit it ─────────────────────────────────────────────────────────────
    await openTopic(page, title)
    await page.getByRole('button', { name: 'Edit rebuild' }).click()
    await page.getByRole('dialog').getByLabel('What you did').fill('once() and memoize()')
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByText('once() and memoize()')).toBeVisible()

    // ── remove it ───────────────────────────────────────────────────────────
    await page.getByRole('button', { name: 'Edit rebuild' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
    await expect(page.getByText('once() and memoize()')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Record rebuild' })).toBeVisible()

    // With nothing recorded, the card falls back to Model ✓ — it has no squares.
    await page.goto(`/library?q=${encodeURIComponent(title)}`)
    await expect(cardFor(page, title).first().getByRole('img', { name: /Evidence/ })).toHaveCount(0)
  })

  test('a topic can read weak with all three recorded — the case the library could not show', async ({
    page,
  }) => {
    await signInAs(page, 'main')
    await page.goto(`/library?q=${encodeURIComponent(ALL_THREE)}`)

    const card = cardFor(page, ALL_THREE).first()
    await expect(card).toContainText('Weak')
    await expect(card.getByRole('img', { name: /rebuild, challenge, production/ })).toBeVisible()

    await openTopic(page, ALL_THREE)
    for (const note of [
      'debounce() from memory',
      'Stale search responses',
      'Search cancellation in the capstone',
    ]) {
      await expect(page.getByText(note)).toBeVisible()
    }

    // No badge, no celebration, no "complete" — four ticks are the whole signal.
    for (const word of ['Complete', 'Well done', 'Congratulations']) {
      await expect(page.getByText(word, { exact: true })).toHaveCount(0)
    }
  })

  test('Recall is derived — shown, never recordable', async ({ page }) => {
    await signInAs(page, 'main')
    await openTopic(page, ONE_MARKER)

    await expect(page.getByText('Recall', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Record recall/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Edit recall/i })).toHaveCount(0)
  })

  test('a quiz renders NO evidence section — absent, not empty', async ({ page }) => {
    await signInAs(page, 'main')
    await page.goto(`/library?q=${encodeURIComponent('stacking context')}`)
    await cardFor(page, QUIZ).first().click()
    await expect(page).toHaveURL(/\/topic\//)
    await expect(page.getByRole('heading', { level: 1, name: QUIZ })).toBeVisible()

    /*
      Absence, not emptiness. A quiz is a retrieval device, not a concept, and the
      shape constraint refuses it the columns outright — so there is nothing to
      render and no empty row to render it in.
    */
    await expect(page.getByText('Evidence', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Weak until you can explain it')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Record rebuild/i })).toHaveCount(0)

    // And no squares on its card.
    await page.goto(`/library?q=${encodeURIComponent('stacking context')}`)
    await expect(cardFor(page, QUIZ).first().getByRole('img', { name: /Evidence/ })).toHaveCount(0)
  })

  test('recording evidence changes nothing the queue shows', async ({ page }) => {
    /*
      The failure mode for this whole feature, asserted through the product.
      The source-level guard is src/lib/domain/evidence-boundary.test.ts; this is
      the same claim where a person would notice it.
    */
    await signInAs(page, 'main')

    /*
      Scoped to this topic, not to the rail's total.

      An earlier version compared the rail's "Weak topics" count before and after,
      which failed under the full suite for a reason that had nothing to do with
      evidence: several specs write to this fixture in parallel, so a global count
      moves on its own. The claim that matters is local anyway — recording
      evidence must not touch what the queue reads about THIS topic.

      The global version of the claim lives where it can be stated absolutely:
      src/lib/domain/evidence-boundary.test.ts reads the queue modules' source,
      and evidence_shape_test.sql asserts the ordering in SQL.
    */
    const confidenceBefore = await page
      .getByRole('link')
      .filter({ hasText: ONE_MARKER })
      .first()
      .innerText()

    await openTopic(page, ONE_MARKER)
    await page.getByRole('button', { name: 'Record challenge' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('What you did').fill('A constrained variant, for the queue test')
    await dialog.getByLabel('When').fill('2026-09-05')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

    await page.goto(`/library?q=${encodeURIComponent(ONE_MARKER)}`)
    const card = page.getByRole('link').filter({ hasText: ONE_MARKER }).first()
    // Same confidence, same practice count. Only the squares moved.
    expect((await card.innerText()).replace(/\s+/g, ' ')).toContain('Strong')
    expect(confidenceBefore.replace(/\s+/g, ' ')).toContain('Strong')

    // Clean up so the fixture invariant on this topic keeps holding.
    await openTopic(page, ONE_MARKER)
    await page.getByRole('button', { name: 'Edit challenge' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
  })
})
