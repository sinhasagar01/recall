import { expect, test } from '@playwright/test'

// Deliberately asserts nothing about page content: phase 5 replaces the
// scaffolded landing page, and this spec must survive that.
test('the dev server renders the app shell', async ({ page }) => {
  const response = await page.goto('/')

  expect(response?.status()).toBe(200)
  await expect(page.locator('body')).toBeAttached()
})
