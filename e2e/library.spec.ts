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
  await page.getByLabel('Topic', { exact: true }).fill(title)
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
  await page.getByLabel('Topic', { exact: true }).fill(title)
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
  await page.getByLabel('Topic', { exact: true }).fill(title)
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
  await page.getByLabel('Topic', { exact: true }).evaluate((el: HTMLInputElement) => el.removeAttribute('required'))
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

