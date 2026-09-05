/**
 * Reads the local mail catcher.
 *
 * Supabase's local stack runs Mailpit on :54324 and every email the auth server
 * sends lands there. So confirmation and reset flows are tested by fetching the
 * real message and following the real link — no stubbing, and no separate code
 * path that only exists for tests.
 */
import { expect, type Page } from '@playwright/test'

const MAILPIT = 'http://127.0.0.1:54324'

interface Summary {
  ID: string
  To: { Address: string }[]
  Subject: string
  Created: string
}

/** The most recent message sent to an address, waiting for it to arrive. */
export async function waitForEmail(to: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const response = await fetch(`${MAILPIT}/api/v1/messages?limit=200`)
    if (response.ok) {
      const { messages } = (await response.json()) as { messages: Summary[] }
      const match = messages.find((m) => m.To.some((t) => t.Address.toLowerCase() === to.toLowerCase()))

      if (match) {
        const full = await fetch(`${MAILPIT}/api/v1/message/${match.ID}`)
        const body = (await full.json()) as { HTML?: string; Text?: string }
        return body.HTML || body.Text || ''
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`No email arrived for ${to} within ${timeoutMs}ms`)
}

/**
 * The first link in the message, with entities decoded.
 *
 * Templates point at /auth/confirm, so this is the link the person would click.
 */
export function linkFrom(html: string): string {
  const match = html.match(/href="([^"]+)"/i) ?? html.match(/(https?:\/\/\S+)/)
  if (!match) throw new Error(`No link in the email: ${html.slice(0, 200)}`)
  return match[1].replaceAll('&amp;', '&')
}

/** Keeps one spec's assertions from seeing another spec's mail. */
export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' }).catch(() => {})
}

/**
 * Signs up and completes the confirmation round-trip, leaving the page on the
 * library with a usable session.
 *
 * Sign-up no longer signs you in, so every spec that used to open with three
 * lines and land on /library now needs the emailed link followed as well. That
 * belongs in one place: four copies of it would drift the moment the flow
 * changes again.
 */
export async function signUpConfirmed(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/sign-up')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible()

  await page.goto(linkFrom(await waitForEmail(email)))
  await expect(page).toHaveURL(/\/library/)
}
