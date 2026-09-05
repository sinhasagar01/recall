import { expect, test } from '@playwright/test'
import { signUpConfirmed } from './mailbox'

/*
  Account deletion destroys the account it runs against, so this spec creates its
  own throwaway one rather than borrowing a fixture user. Nothing else in the
  suite is affected.
*/
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('deleting an account removes its topics and its images, for good', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `doomed-${stamp}@recall.test`
  const password = 'a-long-enough-password'
  const title = `Doomed account topic ${stamp}`

  await signUpConfirmed(page, email, password)

  // Something to destroy: a topic, and an image belonging to it.
  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByLabel('Topic', { exact: true }).fill(title)
  await page.getByLabel('Definition').fill('This account is about to be deleted.')
  await page.getByLabel(/Visual/).setInputFiles({
    name: 'goes-with-it.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  })
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

  await page.getByRole('link', { name: new RegExp(title) }).click()
  await expect(page).toHaveURL(/\/topic\//)
  const imageUrl = await page.getByRole('img', { name: /goes-with-it\.png/ }).getAttribute('src')
  expect(imageUrl).toBeTruthy()

  // The confirmation has to name what actually dies.
  await page.goto('/library')
  await page.getByRole('button', { name: 'Delete account' }).click()
  const modal = page.getByRole('dialog', { name: /Delete your account/ })
  await expect(modal).toBeVisible()
  await expect(modal).toContainText('1 topic')
  await expect(modal).toContainText('1 image')
  await expect(modal).toContainText("can't be undone")

  await modal.getByRole('button', { name: 'Delete everything' }).click()
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 20_000 })

  // The image is gone from storage, not merely unreferenced.
  const response = await page.request.get(imageUrl!)
  expect(response.ok()).toBe(false)

  // And the account itself no longer exists.
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert').first()).toContainText("don't match an account")
  await expect(page).toHaveURL(/\/sign-in/)
})

test('backing out of account deletion changes nothing', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const email = `spared-${stamp}@recall.test`
  const password = 'a-long-enough-password'

  await signUpConfirmed(page, email, password)

  await page.getByRole('button', { name: 'Delete account' }).click()
  await page.getByRole('button', { name: 'Keep my account' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/library/)

  // Still signed in, still works.
  await page.reload()
  await expect(page.getByTestId('signed-in-as')).toHaveText(email)
})
