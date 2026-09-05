import { expect, test } from '@playwright/test'
import { signUpConfirmed } from './mailbox'

/*
  The definition of done.

  Every assertion here is covered by a per-phase spec somewhere. That is the point:
  those specs prove each phase works, and this one proves the phases COMPOSE — that a
  topic created in phase 5, found in phase 7, opened in phase 6, graded in phase 8 and
  reviewed in phase 9 is the same topic the whole way through, and survives signing
  out and back in.

  It runs on its own freshly signed-up account, so it cannot race the other specs and
  starts from a genuinely empty library.
*/
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('the whole product, end to end, as one person', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `journey-${stamp}@recall.test`
  const password = 'a-long-enough-password'
  const title = `Reconciliation ${stamp}`

  // ── sign up ───────────────────────────────────────────────────────────────
  await signUpConfirmed(page, email, password)

  // A brand new account starts empty, and says so.
  await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible()

  // ── add a topic with a mental model and an image ──────────────────────────
  await page.getByRole('button', { name: '+ Add your first topic' }).click()
  await page.getByLabel('Topic', { exact: true }).fill(title)
  await page
    .getByLabel('Definition')
    .fill('React compares the previous and next element tree, then commits only what changed.')
  await page.getByLabel(/Mental model/).fill('Like an editor diffing two drafts.')
  await page.getByLabel(/Visual/).setInputFiles({
    name: 'tree-diff.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  })
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByText(`Saved — ${title}`)).toBeVisible()

  // ── find it by partial search ─────────────────────────────────────────────
  // "recon" finds "Reconciliation" — the case the brief named from the start.
  await page.getByRole('searchbox', { name: 'Search your knowledge' }).fill('recon')
  const card = page.getByRole('link', { name: new RegExp(title) })
  await expect(card).toBeVisible()
  await expect(card).toContainText('Model ✓')

  // ── open it: both registers and the visual ────────────────────────────────
  await card.click()
  await expect(page).toHaveURL(/\/topic\//)
  const topicUrl = page.url()

  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
  await expect(page.getByText('Definition', { exact: true })).toBeVisible()
  await expect(page.getByText('Mental model', { exact: true })).toBeVisible()
  await expect(page.getByText('Visual', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: /tree-diff\.png/ })).toBeVisible()
  await expect(page.getByTestId('stat-confidence')).toContainText('Never practiced')

  // ── practice it ───────────────────────────────────────────────────────────
  await page.getByRole('link', { name: 'Practice this' }).click()
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()

  await page
    .getByRole('textbox', { name: 'Write what you remember' })
    .fill('It diffs the trees and only updates what changed.')
  await page.getByRole('button', { name: 'Reveal answer' }).click()

  // The reveal shows what you wrote, then the answer in both registers.
  await expect(page.getByText('It diffs the trees and only updates what changed.')).toBeVisible()
  await expect(page.getByText('Like an editor diffing two drafts.')).toBeVisible()

  await page.getByRole('button', { name: /Didn't know it/ }).click()
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()

  // ── the grade persisted ───────────────────────────────────────────────────
  await page.goto(topicUrl)
  await expect(page.getByTestId('stat-confidence')).toContainText('Weak')
  await expect(page.getByTestId('stat-practice-count')).toContainText('1')

  // ── it shows up on the weak page, and can be practised from there ─────────
  await page.getByRole('link', { name: '← Library' }).click()
  await page.getByRole('link', { name: /Weak topics/ }).click()
  await expect(page).toHaveURL(/\/weak/)

  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row).toBeVisible()
  await row.getByRole('link', { name: 'Practice' }).click()

  await page.getByRole('button', { name: 'Reveal answer' }).click()
  await page.getByRole('button', { name: /Knew it/ }).click()
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()

  // ── sign out, sign back in, everything survived ───────────────────────────
  await page.goto('/library')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)

  // The guard is closed again.
  await page.goto('/library')
  await expect(page).toHaveURL(/\/sign-in/)

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/library/)

  await page.goto(topicUrl)
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
  await expect(page.getByText('Like an editor diffing two drafts.')).toBeVisible()
  await expect(page.getByRole('img', { name: /tree-diff\.png/ })).toBeVisible()
  // Two sessions: "Didn't know" then "Knew it".
  await expect(page.getByTestId('stat-confidence')).toContainText('Strong')
  await expect(page.getByTestId('stat-practice-count')).toContainText('2')

  // And it has left the weak page.
  await page.goto('/weak')
  await expect(page.getByRole('listitem').filter({ hasText: title })).toHaveCount(0)
})
