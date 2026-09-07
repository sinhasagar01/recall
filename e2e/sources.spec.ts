import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  Sources: where a topic came from.

  A source outlives its transcript, and a topic outlives its source. Those two
  sentences are the arc, and they are what this file asserts end to end.
*/

const SEEDED = 'Closures, in depth'
const STALE = 'Database indexing internals'

const cardFor = (page: Page, title: string) =>
  page.getByRole('link').filter({ hasText: title })

test.describe('sources', () => {
  test.describe.configure({ mode: 'serial' })

  test('a source is added, distilled from, and shows on the topic it produced', async ({
    page,
  }) => {
    await signInAs(page, 'main')

    const title = `Rendering patterns ${Date.now()}`
    const topicTitle = `Hydration mismatch ${Date.now()}`

    // ── add a source with a transcript ────────────────────────────────────
    await page.goto('/sources')
    await page.getByRole('button', { name: '+ Add a source' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('Title').fill(title)
    await sheet.getByLabel('Course').fill('Frontend Masters')
    await sheet.getByLabel(/^URL/).fill('https://example.com/rendering')
    await sheet
      .getByLabel(/^Transcript/)
      .fill(
        'Hydration attaches listeners to markup the server already sent.\nA mismatch means the client rendered something different from the server.',
      )
    await sheet.getByRole('button', { name: 'Save source' }).click()

    // Saving a new source opens its workspace.
    await expect(page).toHaveURL(/\/sources\/[0-9a-f-]+$/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(page.getByText(/words · 0 of 5 extracted/)).toBeVisible()

    // Nothing distilled yet: all five unticked.
    await expect(page.getByText('no topics yet')).toBeVisible()
    await expect(page.getByText('0 of 3 quizzes')).toBeVisible()

    // ── distil a topic from it ────────────────────────────────────────────
    await page.getByRole('link', { name: '+ Distil a topic' }).click()
    const add = page.getByRole('dialog')
    await add.getByRole('textbox', { name: 'Topic', exact: true }).fill(topicTitle)
    await add.getByLabel('Definition').fill('The client rendered something the server did not.')
    await add.getByLabel(/Mental model/).fill('Two people describing the same room from different doors.')

    // Linked automatically — the sheet arrives with the source already chosen.
    await expect(add.getByLabel('Source')).toHaveValue(/[0-9a-f-]{36}/)
    await add.getByRole('button', { name: 'Save topic' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })

    // ── the source line on the topic ──────────────────────────────────────
    await page.goto(`/library?q=${encodeURIComponent(topicTitle)}`)
    await cardFor(page, topicTitle).first().click()
    await expect(page).toHaveURL(/\/topic\//)

    await expect(page.getByText('Where this came from')).toBeVisible()
    await expect(page.getByRole('link', { name: title })).toBeVisible()
    await expect(page.getByText('Frontend Masters', { exact: false })).toBeVisible()

    // ── and the entry in the source's derived list ────────────────────────
    await page.getByRole('link', { name: title }).click()
    await expect(page).toHaveURL(/\/sources\//)
    await expect(page.getByRole('link', { name: new RegExp(topicTitle) })).toBeVisible()
    // Singular. "1 topics" shipped to production; the domain owns the agreement
    // now, and sources.test.ts covers nothing/one/many.
    await expect(page.getByText('1 topic', { exact: true })).toBeVisible()
    await expect(page.getByText('1 topics')).toHaveCount(0)
    await expect(page.getByText(/1 of 5|2 of 5/)).toBeVisible()

    // ── delete the transcript: the source and its entries survive ─────────
    await page.getByRole('button', { name: 'Delete transcript' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete transcript' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })

    await expect(page.getByText('Deleted. The title, course and link are kept.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(topicTitle) })).toBeVisible()

    // ── delete the source: the topic survives, with no source line ────────
    await page.getByRole('button', { name: 'Delete source' }).click()
    const confirm = page.getByRole('dialog')
    // The confirmation names what actually dies and what does not.
    /*
      One entry at this point, so the whole sentence has to agree — noun, verb and
      pronoun. It used to read "The 1 entry ... stay ... they lose", which is what
      deleteSourceCopy now owns.
    */
    await expect(confirm).toContainText('The 1 entry you distilled from it stays in your library')
    await expect(confirm).toContainText('it loses the line saying where it came from')
    await confirm.getByRole('button', { name: 'Delete source' }).click()
    await expect(page).toHaveURL(/\/sources$/, { timeout: 30_000 })

    await page.goto(`/library?q=${encodeURIComponent(topicTitle)}`)
    await cardFor(page, topicTitle).first().click()
    await expect(page).toHaveURL(/\/topic\//)
    await expect(page.getByRole('heading', { level: 1, name: topicTitle })).toBeVisible()
    await expect(page.getByText('Where this came from')).toHaveCount(0)
  })

  test('selecting transcript text fills the definition and never the mental model', async ({
    page,
  }) => {
    await signInAs(page, 'main')
    await page.goto('/sources')
    await cardFor(page, SEEDED).first().click()
    await expect(page).toHaveURL(/\/sources\//)

    // Select a paragraph of the transcript.
    const line = page.getByText('Some people call this the backpack', { exact: false })
    await line.click({ clickCount: 3 })
    await expect(page.getByTestId('use-as-definition')).toBeVisible()

    await page.getByRole('link', { name: '+ Distil a topic' }).click()
    const add = page.getByRole('dialog')

    /*
      The rule the whole arc turns on. Someone else's words are fine for the fact;
      the mental model is the correction only you can write, and a prefilled one
      would be a quotation pretending to be understanding.
    */
    await expect(add.getByLabel('Definition')).not.toHaveValue('')
    await expect(add.getByLabel(/Mental model/)).toHaveValue('')
  })

  test('a source that has taught nothing says so, and only the label is crimson', async ({
    page,
  }) => {
    await signInAs(page, 'main')
    await page.goto('/sources')

    const row = cardFor(page, STALE).first()
    const yieldLabel = row.getByText(/Nothing · \d+ days/)
    await expect(yieldLabel).toBeVisible()

    // The label carries the alarm colour; the row does not. A crimson row would
    // read as an error, and a stale source is a fact rather than an error.
    await expect(yieldLabel).toHaveClass(/text-flag/)
    await expect(row).not.toHaveClass(/text-flag|border-flag|bg-flag/)
  })

  test('a transcript is searched in its own workspace and never in the library', async ({
    page,
  }) => {
    await signInAs(page, 'main')

    /*
      "backpack" appears in the seeded transcript. Library search must not find
      the SOURCE by it — a transcript matching a word would bury the topic you
      wrote about it under the paragraph that taught you it.
    */
    await page.goto(`/library?q=${encodeURIComponent('lexical environment')}`)
    await expect(cardFor(page, SEEDED)).toHaveCount(0)

    await page.goto('/sources')
    await cardFor(page, SEEDED).first().click()
    await page.getByRole('searchbox', { name: 'Search this transcript' }).fill('lexical environment')
    await expect(page.getByText('A closure is the combination', { exact: false })).toBeVisible()
    await expect(page.getByText('Some people call this the backpack', { exact: false })).toHaveCount(0)
  })

  test('a source never reaches the queue or the weak page', async ({ page }) => {
    await signInAs(page, 'main')

    for (const path of ['/practice', '/weak']) {
      await page.goto(path)
      await expect(page.getByText(SEEDED)).toHaveCount(0)
      await expect(page.getByText(STALE)).toHaveCount(0)
    }
  })
})

test('signed out, sources is not reachable', async ({ page }) => {
  /*
    It answered a 500 in production rather than redirecting: the proxy's GUARDED
    list is hand-written and this route was not in it, so a signed-out request
    reached the server component and rendered with no session. The structural
    regression is src/lib/supabase/guarded-routes.test.ts, which holds that list
    to the route tree; this is the same rule stated end to end, matching the shape
    settings.spec.ts already uses.
  */
  await page.context().clearCookies()
  await page.goto('/sources')
  await expect(page).toHaveURL(/\/sign-in/)
})

test.describe('sources on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('is reached from the account foot, and the transcript is collapsed', async ({ page }) => {
    await signInAs(page, 'main')

    /*
      Not a fourth tab-bar entry. The tab bar stays two destinations plus add —
      DESIGN.md rule 13 — and Sources follows the precedent Settings set.
      sources-reference.html drew the mobile screens without showing the route in;
      that gap is corrected in the file.
    */
    const tabs = page.getByRole('navigation').last()
    await expect(tabs.getByRole('link', { name: 'Sources' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Sources' }).click()
    await expect(page).toHaveURL(/\/sources$/)

    await cardFor(page, SEEDED).first().click()
    await expect(page).toHaveURL(/\/sources\//)

    // Collapsed behind Show: reading a transcript and writing beside it does not
    // fit on a phone.
    const show = page.getByRole('button', { name: 'Show' })
    await expect(show).toBeVisible()
    await expect(show).toHaveAttribute('aria-expanded', 'false')

    // And select-to-fill is absent — text selection on a touch screen fights the
    // browser's own selection UI, so on mobile you read and type.
    await show.click()
    await expect(page.getByRole('searchbox', { name: 'Search this transcript' })).toBeVisible()
    await expect(page.getByTestId('use-as-definition')).toBeHidden()
  })
})
