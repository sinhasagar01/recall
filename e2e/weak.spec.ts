import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

const EMAIL = process.env.E2E_USER_EMAIL!
const STRONG_EMAIL = process.env.E2E_STRONG_USER_EMAIL!

const uniqueTitle = (label: string) =>
  `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/* Replays a session saved in global setup — see e2e/auth-state.ts. */
async function signIn(page: Page, email: string) {
  await signInAs(page, email === STRONG_EMAIL ? 'strong' : 'main')
  await expect(page).toHaveURL(/\/library/)
}

async function addTopic(page: Page, title: string): Promise<string> {
  await page.goto('/library')
  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByLabel('Topic', { exact: true }).fill(title)
  await page.getByLabel('Definition').fill('A definition for the weak list.')
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog', { name: 'Add topic' })).not.toBeVisible()

  await page.getByRole('link', { name: new RegExp(title) }).click()
  await expect(page).toHaveURL(/\/topic\//)
  return page.url().split('/topic/')[1]
}

async function gradeKnewIt(page: Page, id: string) {
  await page.goto(`/practice?topic=${id}`)
  await page.getByRole('button', { name: 'Reveal answer' }).click()
  await page.getByRole('button', { name: /Knew it/ }).click()
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()
}

test('the page lists new and weak topics and excludes okay and strong', async ({ page }) => {
  await signIn(page, EMAIL)

  // Asserted on two topics this spec owns, never on a total — other specs are
  // adding topics to the same user in parallel.
  const stillNew = uniqueTitle('Never recalled')
  const nowStrong = uniqueTitle('Known cold')

  await addTopic(page, stillNew)
  const strongId = await addTopic(page, nowStrong)
  await gradeKnewIt(page, strongId)

  await page.goto('/weak')

  // By row: the per-row Practice link is aria-labelled with the title too, which
  // is right for a screen reader and ambiguous for a bare link selector.
  await expect(page.getByRole('listitem').filter({ hasText: stillNew })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: nowStrong })).toHaveCount(0)
})

test('a topic graded strong leaves the page after a reload', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('Leaving weak')
  const id = await addTopic(page, title)

  await page.goto('/weak')
  await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible()

  await gradeKnewIt(page, id)

  await page.goto('/weak')
  await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(0)
})

test('a row says never practiced until it has been', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('Untouched')
  await addTopic(page, title)

  await page.goto('/weak')

  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row).toContainText('never practiced')
})

test('the empty state shows when every topic is okay or better', async ({ page }) => {
  await signIn(page, STRONG_EMAIL)

  await page.goto('/weak')

  await expect(page.getByRole('heading', { name: 'Nothing needs review' })).toBeVisible()
  await expect(page.getByText('Nothing below okay')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Practice anyway' })).toBeVisible()
})

test('Practice all starts a session over the weak topics', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('Queued from weak')
  await addTopic(page, title)

  await page.goto('/weak')
  /*
    The button says what it does. It only claims "all" while the backlog fits a
    session; past that it reads "Practice 10 of N", because the session is capped
    like every other one.
  */
  await page.getByRole('link', { name: /Practice (all \d+|\d+ of \d+)/ }).click()

  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible()
  // A chosen set, so the three-topic floor does not apply to it.
  await expect(page.getByRole('heading', { name: 'Not enough to practice yet' })).toHaveCount(0)
})

test('a per-row Practice button opens that one topic', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('One from the row')
  const id = await addTopic(page, title)

  await page.goto('/weak')
  await page.getByRole('listitem').filter({ hasText: title }).getByRole('link', { name: 'Practice' }).click()

  await expect(page).toHaveURL(new RegExp(`topic=${id}`))
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
})

test('the rail links to weak topics', async ({ page }) => {
  await signIn(page, EMAIL)

  await page.getByRole('link', { name: /Weak topics/ }).click()

  await expect(page).toHaveURL(/\/weak/)
  await expect(page.getByRole('heading', { name: 'Weak topics', level: 1 })).toBeVisible()
})
