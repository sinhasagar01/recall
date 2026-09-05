import { expect, test } from '@playwright/test'

const EMAIL = process.env.E2E_USER_EMAIL ?? ''
const PASSWORD = process.env.E2E_USER_PASSWORD ?? ''

test.beforeAll(() => {
  if (!EMAIL || !PASSWORD) {
    throw new Error('E2E_USER_EMAIL and E2E_USER_PASSWORD must be set. Run: npm run seed:e2e')
  }
})

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('a signed-out request to a guarded route lands on sign-in', async ({ page }) => {
  await page.goto('/library')
  await expect(page).toHaveURL(/\/sign-in/)
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('the seeded user can sign in', async ({ page }) => {
  await signIn(page, EMAIL, PASSWORD)
  await expect(page).toHaveURL(/\/library/)
})

test('a wrong password shows the error and stays on the page', async ({ page }) => {
  await signIn(page, EMAIL, 'definitely-not-the-password')

  // The exact copy from design-reference.html.
  await expect(page.getByText("That email and password don't match an account.")).toBeVisible()
  await expect(page).toHaveURL(/\/sign-in/)
})

/*
  Sign-up itself is covered by email-auth.spec.ts, which asserts the whole
  confirmation round-trip: that creating an account does NOT sign you in, that
  the emailed link does, and that an unconfirmed account is told why it cannot.
  A test here that only checked "lands on the library" would be a strict subset
  of those, and would have to be kept in step with them for nothing.
*/

test('a signed-in user visiting sign-in is sent to the library', async ({ page }) => {
  await signIn(page, EMAIL, PASSWORD)
  await expect(page).toHaveURL(/\/library/)

  await page.goto('/sign-in')
  await expect(page).toHaveURL(/\/library/)
})

/**
 * The failure mode this phase exists to prevent: auth looks fine in the browser,
 * then the session vanishes on refresh or is invisible to the server, because the
 * proxy did not refresh the cookie or the response lost its Set-Cookie headers.
 *
 * The email below is rendered by a SERVER component reading the user, so this
 * asserts both halves at once: the cookie survived a full reload, and the server
 * can see it.
 */
test('the session survives a full reload and a server component can read the user', async ({ page }) => {
  await signIn(page, EMAIL, PASSWORD)
  await expect(page).toHaveURL(/\/library/)

  await page.reload({ waitUntil: 'load' })

  await expect(page).toHaveURL(/\/library/)
  await expect(page.getByTestId('signed-in-as')).toHaveText(EMAIL)
})

test('signing out returns to sign-in and the guarded route is closed again', async ({ page }) => {
  await signIn(page, EMAIL, PASSWORD)
  await page.getByRole('button', { name: 'Sign out' }).click()

  await expect(page).toHaveURL(/\/sign-in/)

  await page.goto('/library')
  await expect(page).toHaveURL(/\/sign-in/)
})
