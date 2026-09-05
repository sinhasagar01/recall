import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'
import { LOCAL_MODE_MAX, SERVER_PAGE_SIZE } from '../src/lib/domain/library-paging'
import { PRACTICE_SESSION_SIZE } from '../src/lib/domain/practice-selection'

/*
  The library is read two ways, and which one you get depends only on how many
  topics you own. Both are exercised here against real fixture libraries: the
  `large` user holds LOCAL_MODE_MAX + 1 topics, which is the smallest library that
  is definitely past the threshold, and the `few` user is definitely under it.

  supabase/tests/library_parity_test.sql already proves the two implementations
  agree on rows and counts. What it cannot show is that the right one runs, that
  the page renders it, and that a count on screen still describes the list beside
  it. That is what these are for.
*/

const cards = (page: Page) => page.getByRole('link', { name: /Bulk topic/ })
// Matches e2e/search.spec.ts: the input is type="search", so its role is searchbox.
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search your knowledge' })

test.describe('a library past the local-mode threshold', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'large')
  })

  test('renders one page, not the whole library', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'My knowledge' })).toBeVisible()

    // The subtitle counts the whole library; the grid holds one page of it.
    await expect(page.getByText(`${LOCAL_MODE_MAX + 1} topics`)).toBeVisible()
    await expect(cards(page)).toHaveCount(SERVER_PAGE_SIZE)
  })

  test('Load more appends the next page without losing the first', async ({ page }) => {
    await expect(cards(page)).toHaveCount(SERVER_PAGE_SIZE)

    const firstTitle = await cards(page).first().innerText()

    await page.getByRole('button', { name: 'Load more' }).click()
    await expect(cards(page)).toHaveCount(SERVER_PAGE_SIZE * 2)

    // Appended, not replaced.
    await expect(cards(page).first()).toContainText(firstTitle.split('\n')[0])

    // And no row arrives twice: the keyset cursor has to break the created_at tie.
    const titles = await cards(page).allInnerTexts()
    const ids = titles.map((text) => text.split('\n')[0])
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('searching goes to the database and narrows the list', async ({ page }) => {
    await search(page).fill('Bulk topic 0007')

    // One round trip, debounced — so this waits rather than asserting immediately.
    await expect(cards(page)).toHaveCount(1)
    await expect(cards(page).first()).toContainText('Bulk topic 0007')
  })

  test('a count still describes the list beside it', async ({ page }) => {
    /*
      The rule phase 7 established, checked across the mode boundary: pick a filter,
      read the count its option advertises, apply it, and require the library to
      report exactly that many matches. A SQL count disagreeing with a SQL page is
      the failure this whole change had to avoid.
    */
    await page.getByRole('button', { name: /Any confidence/ }).click()
    const option = page.getByRole('option', { name: /^Weak/ })
    const advertised = Number((await option.innerText()).match(/(\d+)\s*$/)?.[1])
    expect(advertised).toBeGreaterThan(0)

    await option.click()

    await expect(page.getByText(`${advertised} of ${LOCAL_MODE_MAX + 1} topics match`)).toBeVisible()
  })
})

test('a library under the threshold still filters without a round trip', async ({ page }) => {
  await signInAs(page, 'few')

  /*
    Only requests for the library route itself count. Next prefetches the RSC
    payload for each visible topic card, and filtering changes which cards are
    visible, so counting every request would count prefetches for /topic/<id> and
    never be zero — a green that meant nothing.
  */
  await page.waitForLoadState('networkidle')

  let libraryRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/library') libraryRequests += 1
  })

  await search(page).fill('event')
  await expect(page.getByRole('link', { name: /The event loop/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Specificity/ })).toHaveCount(0)

  // Local mode is the whole point: narrowing must not ask the server for the list.
  expect(libraryRequests).toBe(0)
})

/*
  The weak page and a practice session, past the threshold.

  The `large` fixture holds 501 topics with confidence cycling through all four
  values, so roughly half need review — far more than one page or one session.
  Before #12 both routes read every topic the user owned to render.
*/
test.describe('the weak page and practice, on a large library', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'large')
  })

  test('the weak list paginates instead of rendering everything', async ({ page }) => {
    await page.goto('/weak')

    const rows = page.getByRole('listitem')
    await expect(rows).toHaveCount(SERVER_PAGE_SIZE)

    await page.getByRole('button', { name: 'Load more' }).click()
    await expect(rows).toHaveCount(SERVER_PAGE_SIZE * 2)

    // Each row appears once: the cursor carries bucket, staleness and id.
    const titles = await rows.allInnerTexts()
    const names = titles.map((text) => text.split('\n')[0])
    expect(new Set(names).size).toBe(names.length)
  })

  test('the practice button offers a session, not the whole backlog', async ({ page }) => {
    await page.goto('/weak')

    // More than a session is waiting, so the button stops claiming "all".
    const practice = page.getByRole('link', { name: /Practice \d+ of \d+/ })
    await expect(practice).toBeVisible()

    await practice.click()
    await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible()

    // Capped at a session, like every other entry point. The progress dots carry
    // the queue length as their accessible name.
    await expect(
      page.getByRole('img', { name: `Topic 1 of ${PRACTICE_SESSION_SIZE}` }),
    ).toBeVisible()
  })
})
