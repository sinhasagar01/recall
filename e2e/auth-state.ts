import fs from 'node:fs'
import path from 'node:path'
import type { BrowserContext, Page } from '@playwright/test'

/**
 * Reusable signed-in sessions.
 *
 * The suite used to sign in once per spec — around 57 times a run. Supabase's local
 * auth allows 30 sign-ins per five minutes per IP, and that limit is NOT adjustable
 * through config.toml in CLI 2.116 (the auth container exposes no
 * GOTRUE_RATE_LIMIT env var for it). Past the limit every sign-in fails and the
 * browser simply sits on /sign-in, which presents as whole spec files failing at
 * random — flaky-looking, but entirely deterministic once you know the cause.
 *
 * So each fixture user signs in ONCE in global setup and the cookies are replayed
 * here. Four sign-ins a run instead of fifty-seven.
 *
 * auth.spec.ts and journey.spec.ts still sign in through the form, because signing
 * in is the thing they are testing.
 */
export type Fixture = 'main' | 'empty' | 'few' | 'strong'

export const CREDENTIALS: Record<Fixture, { email: string; password: string }> = {
  main: { email: process.env.E2E_USER_EMAIL!, password: process.env.E2E_USER_PASSWORD! },
  empty: {
    email: process.env.E2E_EMPTY_USER_EMAIL!,
    password: process.env.E2E_EMPTY_USER_PASSWORD!,
  },
  few: { email: process.env.E2E_FEW_USER_EMAIL!, password: process.env.E2E_FEW_USER_PASSWORD! },
  strong: {
    email: process.env.E2E_STRONG_USER_EMAIL!,
    password: process.env.E2E_STRONG_USER_PASSWORD!,
  },
}

export const statePath = (fixture: Fixture) =>
  path.join(process.cwd(), 'e2e', '.auth', `${fixture}.json`)

type SavedCookies = Parameters<BrowserContext['addCookies']>[0]

/** Puts the page in a signed-in session without touching the sign-in form. */
export async function signInAs(page: Page, fixture: Fixture) {
  const state = JSON.parse(fs.readFileSync(statePath(fixture), 'utf8')) as {
    cookies: SavedCookies
  }
  await page.context().clearCookies()
  await page.context().addCookies(state.cookies)
  await page.goto('/library')
}
