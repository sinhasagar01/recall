import { expect, test } from '@playwright/test'
import { linkFrom, waitForEmail } from './mailbox'

/*
  Both flows are tested by fetching the real email and following the real link.
  Anything less would test a code path that only exists for tests.

  Serial: they share the local mail catcher, and a parallel spec's message could
  otherwise be mistaken for this one's.
*/
test.describe.configure({ mode: 'serial' })

const account = () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return { email: `confirm-${stamp}@recall.test`, password: 'a-long-enough-password' }
}

test('signing up asks you to confirm, and does not sign you in', async ({ page }) => {
  const { email, password } = account()

  await page.goto('/sign-up')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()

  // Not into the library — an unconfirmed address is not yet an account you can use.
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()
  await expect(page).not.toHaveURL(/\/library/)
})

test('following the emailed link confirms the account and signs you in', async ({ page }) => {
  const { email, password } = account()

  await page.goto('/sign-up')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()

  const link = linkFrom(await waitForEmail(email))
  await page.goto(link)

  await expect(page).toHaveURL(/\/library/)
  await expect(page.getByTestId('signed-in-as')).toHaveText(email)
})

test('an unconfirmed account cannot sign in, and is told why', async ({ page }) => {
  const { email, password } = account()

  await page.goto('/sign-up')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  // Named for what it is, not "wrong password" — they would reset a fine password.
  await expect(page.getByRole('alert').first()).toContainText('Confirm your email')
  await expect(page).toHaveURL(/\/sign-in/)
})

test('a forgotten password can be reset from the emailed link', async ({ page }) => {
  const { email, password } = account()
  const newPassword = 'a-different-long-password'

  // An account that exists and is confirmed.
  await page.goto('/sign-up')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.goto(linkFrom(await waitForEmail(email)))
  await expect(page).toHaveURL(/\/library/)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)

  // Ask for a reset.
  await page.getByRole('link', { name: 'Forgotten your password?' }).click()
  // Client-side navigation: without this the fill below lands on sign-in's own
  // Email field and is thrown away when /reset-password mounts.
  await expect(page).toHaveURL(/\/reset-password/)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()

  // Follow it and choose a new one.
  await page.goto(linkFrom(await waitForEmail(email)))
  await expect(page).toHaveURL(/\/reset-password\/update/)
  await page.getByLabel('New password').fill(newPassword)
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(page).toHaveURL(/\/library/)

  // The new one works and the old one does not.
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert').first()).toContainText("don't match an account")

  // The rejected attempt re-rendered the form, so both fields go in again.
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(newPassword)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/library/)
})

test('asking to reset an unknown address says the same thing as a known one', async ({ page }) => {
  /*
    Deliberate: a different response for an unknown address turns this form into a
    way to discover which addresses have accounts.
  */
  await page.goto('/reset-password')
  await page.getByLabel('Email').fill(`nobody-${Date.now()}@recall.test`)
  await page.getByRole('button', { name: 'Send reset link' }).click()

  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()
})
