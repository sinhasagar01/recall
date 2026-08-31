import { defineConfig, devices } from '@playwright/test'

// The specs sign in as the seeded user, whose credentials live in .env.local.
// Next loads that file for the dev server itself; this process needs it too.
try {
  process.loadEnvFile('.env.local')
} catch {
  // Absent in CI, where the variables are set directly.
}

const baseURL = 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  // Signs the fixture users in once; see e2e/auth-state.ts.
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  /*
    Production output, not `next dev`.

    `next dev` compiles routes on demand in a single process, so the first request
    to each route pays for compilation. That made a cold run take 1.5-1.9m against
    ~30s warm, and the failures clustered in the cold runs — a red result meant
    either a real bug or a slow compile, which is the worst thing a test suite can
    mean. `test:e2e` builds first and this serves the built output.

    `reuseExistingServer: false` on purpose: silently reusing whatever is already on
    :3000 — a stale dev server, say — is exactly the ambiguity this change removes.
    If the port is busy, failing loudly is the correct outcome.
  */
  webServer: {
    command: 'npm run start',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
