import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

const EMAIL = process.env.E2E_USER_EMAIL!
const EMPTY_EMAIL = process.env.E2E_EMPTY_USER_EMAIL!

/**
 * Every spec asserts on a title it generated itself, never on a global count, so
 * the four Playwright workers cannot interfere with each other. The empty-library
 * spec uses a separate seeded user that no spec ever writes to.
 */
const uniqueTitle = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/* Replays a session saved in global setup — see e2e/auth-state.ts. */
async function signIn(page: Page, email: string) {
  await signInAs(page, email === EMPTY_EMAIL ? 'empty' : 'main')
  await expect(page).toHaveURL(/\/library/)
}

async function openAddSheet(page: Page) {
  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await expect(page.getByRole('dialog', { name: 'Add topic' })).toBeVisible()
}

test('a topic saved with only a title and definition appears without a reload', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('Event loop')

  await openAddSheet(page)
  await page.getByRole('textbox', { name: 'Topic', exact: true }).fill(title)
  await page.getByLabel('Definition').fill('Microtasks drain before the next macrotask.')
  await page.getByRole('button', { name: 'Save topic' }).click()

  // No reload, no navigation: the server action revalidates and the list updates.
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Add topic' })).not.toBeVisible()
  await expect(page.getByText(`Saved — ${title}`)).toBeVisible()
})

test('a topic with a mental model shows Model ✓ on its card', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('Reconciliation')

  await openAddSheet(page)
  await page.getByRole('textbox', { name: 'Topic', exact: true }).fill(title)
  await page.getByLabel('Definition').fill('Comparing the previous and next element tree.')
  await page.getByLabel(/Mental model/).fill('Like an editor diffing two drafts.')
  await page.getByRole('button', { name: 'Save topic' }).click()

  const card = page.getByRole('link', { name: new RegExp(title) })
  await expect(card).toBeVisible()
  await expect(card.getByText('Model ✓')).toBeVisible()
})

test('a topic without a mental model does not show Model ✓', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('No model')

  await openAddSheet(page)
  await page.getByRole('textbox', { name: 'Topic', exact: true }).fill(title)
  await page.getByLabel('Definition').fill('A definition and nothing more.')
  await page.getByRole('button', { name: 'Save topic' }).click()

  const card = page.getByRole('link', { name: new RegExp(title) })
  await expect(card).toBeVisible()
  await expect(card.getByText('Model ✓')).toHaveCount(0)
})

test('a user with no topics sees the empty state', async ({ page }) => {
  await signIn(page, EMPTY_EMAIL)

  await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible()
  await expect(page.getByText('Nothing saved yet')).toBeVisible()
  await expect(page.getByRole('button', { name: '+ Add your first topic' })).toBeVisible()
})

test('a save that fails surfaces the reason instead of failing silently', async ({ page }) => {
  await signIn(page, EMAIL)
  await openAddSheet(page)

  /*
    The reachable failure is server-side validation. `required` is stripped so the
    browser lets a blank form through — which is exactly what any client that is
    not this form would do. The server action must reject it and the sheet must
    say so.
  */
  await page.getByRole('textbox', { name: 'Topic', exact: true }).evaluate((el: HTMLInputElement) => el.removeAttribute('required'))
  await page
    .getByLabel('Definition')
    .evaluate((el: HTMLTextAreaElement) => el.removeAttribute('required'))

  await page.getByRole('button', { name: 'Save topic' }).click()

  // Scoped to the dialog: Next's route announcer is also role="alert".
  await expect(
    page.getByRole('dialog', { name: 'Add topic' }).getByRole('alert'),
  ).toContainText('Give the topic a title')
  await expect(page.getByRole('dialog', { name: 'Add topic' })).toBeVisible()
})


/*
  One list, newest first.

  The library used to render two visually identical grids — everything else, then
  a "Recently learned" divider, then what arrived this week. On a 29-topic library
  a topic saved five seconds earlier sat at position 24, which reads as "my new
  topic is at the bottom" rather than as a section.

  Asserted as FIRST, not as present. Every existing spec here asserts presence,
  and presence was true at position 24 — which is why this survived.

  Runs against `main`, which carries two backdated topics for exactly this reason.
  On a fixture whose rows were all created seconds ago the split never manifests
  at all — everything is "recent", the first grid is empty, and the assertion
  would pass before the change and prove nothing. `few` is backdated too but is
  the wrong home: export.spec.ts asserts it holds exactly two topics, and a spec
  that saves would break it. See ARCHITECTURE.md, "A fixture with no spread on a
  dimension cannot test that dimension".
*/
test('a topic you just saved is the first card, not merely present', async ({ page }) => {
  await signInAs(page, 'main')
  const title = `Newest first ${Date.now()}`

  const cards = page.locator('a[href^="/topic/"]')
  // The backdated pair guarantees the pre-change layout has a first grid to fill.
  await expect(cards.filter({ hasText: 'Cascade layers' })).toHaveCount(1)

  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByRole('textbox', { name: 'Topic', exact: true }).fill(title)
  await page.getByLabel('Definition').fill('Saved last, shown first.')
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

  /*
    ── Position, not presence ─────────────────────────────────────────────────
    "Is it there" was true at position 24, which is the whole reason this bug
    survived. So the claim is about where it sits.

    Not a literal `cards.first()`: the suite is fullyParallel and several specs
    save to this fixture, so another test's topic can legitimately land at index 0
    mid-run and that is not a failure. The property that actually separates the
    two implementations is stronger and race-proof — **nothing older than a week
    may precede a topic saved seconds ago**. Under the old layout the entire
    non-recent block did.

    A card carries a relative timestamp only while it is inside
    RECENT_WINDOW_DAYS, so "has a timestamp" is exactly "is recent".
  */
  /*
    This retrying assertion is the synchronisation point. `allInnerTexts()` below
    is a one-shot read with no auto-retry, and the list re-renders asynchronously
    after the sheet closes — reading straight into it found the card missing about
    one full-suite run in four. The dialog closing is not evidence the list has
    caught up.
  */
  await expect(cards.filter({ hasText: title })).toHaveCount(1)

  const order = await cards.allInnerTexts()
  const mine = order.findIndex((row) => row.includes(title))
  expect(mine).toBeGreaterThanOrEqual(0)

  const stamped = (row: string) => /ago|just now/.test(row)
  expect(order.slice(0, mine).filter((row) => !stamped(row))).toEqual([])

  // And the backdated pair — the rows that made the old first grid — is below it.
  expect(order.findIndex((row) => row.includes('Cascade layers'))).toBeGreaterThan(mine)
  expect(order.findIndex((row) => row.includes('The paint holding timeout'))).toBeGreaterThan(mine)
})

test('the library is one grid — no "Recently learned" section remains', async ({ page }) => {
  await signInAs(page, 'main')

  /*
    A topic has to be saved first or this proves nothing: with no recent topic the
    old code rendered a single grid too, because the second one was conditional on
    there being something to put in it.
  */
  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByRole('textbox', { name: 'Topic', exact: true }).fill(`One grid ${Date.now()}`)
  await page.getByLabel('Definition').fill('Saved so the second grid would have had a row.')
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

  await expect(page.getByText('Recently learned')).toHaveCount(0)

  /*
    One grid, not two. The divider was a span rather than a heading, so its
    absence is not enough on its own — two grids with nothing between them would
    still order the library old-block-then-new-block.
  */
  const grids = page.locator('main div[class*="grid-cols-1"]')
  await expect(grids).toHaveCount(1)
})
