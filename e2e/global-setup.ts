import fs from 'node:fs'
import path from 'node:path'
import { chromium, type FullConfig } from '@playwright/test'
import { CREDENTIALS, statePath, type Fixture } from './auth-state'

/**
 * Signs each fixture user in once and saves the session, so the specs do not have
 * to. See auth-state.ts for why that matters.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000'
  const browser = await chromium.launch()

  try {
    for (const fixture of ['main', 'empty', 'few', 'strong', 'large'] as Fixture[]) {
      const { email, password } = CREDENTIALS[fixture]
      const context = await browser.newContext({ baseURL })
      const page = await context.newPage()

      await page.goto('/sign-in')
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password').fill(password)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL(/\/library/, { timeout: 30_000 })

      fs.mkdirSync(path.dirname(statePath(fixture)), { recursive: true })
      await context.storageState({ path: statePath(fixture) })
      await context.close()
    }
  } finally {
    await browser.close()
  }
}
