import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium, type FullConfig } from '@playwright/test'
import { CREDENTIALS, statePath, type Fixture } from './auth-state'
import { checkFixtureInvariants } from './fixture-invariants'

/**
 * Seeds the fixtures, checks they are the shape the specs assume, then signs each
 * fixture user in once and saves the session. See auth-state.ts for why the
 * sign-in caching matters.
 *
 * ── Why seeding lives here and not in an npm script ─────────────────────────
 * It used to be the first half of `npm run test:e2e`, which meant the suite was
 * only safe when run that way. `npx playwright test` — the command you actually
 * use while iterating on one spec — skipped it, and every run left roughly 52
 * topics behind on the general-purpose fixture. Past LOCAL_MODE_MAX the library
 * stops being read whole and page one no longer holds the seeded rows, at which
 * point specs that have nothing to do with each other start failing: at 785 rows,
 * thirteen of them across a11y, image, library and quiz.
 *
 * Two entry points and only one of them correct is the bug. Here there is one
 * door, so there is no invocation of Playwright that can skip it.
 *
 * **This deletes the fixture users' topics on every invocation, including
 * `npx playwright test -g "one test"`.** A topic you made by hand on the
 * general-purpose fixture does not survive running a single spec. That is the
 * price of the guarantee and it is stated in ARCHITECTURE.md rather than left to
 * be discovered.
 *
 * A subprocess rather than an import: the seed is a side-effecting script that
 * calls process.exit on failure, and this is the exact invocation the npm script
 * used, so there is one way to run it and its own error output survives.
 */
export default async function globalSetup(config: FullConfig) {
  execFileSync('node', ['scripts/seed-e2e-user.mts'], { stdio: 'inherit' })

  // Before any browser starts, so a broken fixture aborts the run with one
  // readable sentence rather than a dozen locator timeouts.
  await checkFixtureInvariants()

  const baseURL = config.projects[0]?.use.baseURL ?? 'http://localhost:3000'
  const browser = await chromium.launch()

  try {
    /*
      Derived from CREDENTIALS rather than listed again. It WAS listed again, and
      arc 6's sixth fixture was added to the type and to CREDENTIALS and not to
      this line — which fails as `ENOENT: e2e/.auth/extract.json` from inside
      signInAs, a message that says nothing about the list it came from.

      Two places to add a fixture and only one of them enforced is the same shape
      as every other single-source-of-truth failure in this repo.
    */
    for (const fixture of Object.keys(CREDENTIALS) as Fixture[]) {
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
