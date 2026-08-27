import { expect, test, type Page } from '@playwright/test'

const EMAIL = process.env.E2E_USER_EMAIL!
const PASSWORD = process.env.E2E_USER_PASSWORD!

const uniqueTitle = (label: string) =>
  `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/*
  A real 1x1 PNG, built in memory. No binary fixtures in the repo, and every spec
  gets its own file name — objects live at {user_id}/{topic_id}/{filename} and the
  topic id is a fresh uuid per spec, so two runs can never collide.
*/
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG_1X1 })

async function signIn(page: Page) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/library/)
}

async function addTopic(
  page: Page,
  title: string,
  file?: { name: string; mimeType: string; buffer: Buffer },
): Promise<string> {
  await page.goto('/library')
  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByLabel('Topic', { exact: true }).fill(title)
  await page.getByLabel('Definition').fill('A topic with a diagram.')
  if (file) await page.getByLabel(/Visual/).setInputFiles(file)
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

  await page.getByRole('link', { name: new RegExp(title) }).click()
  await expect(page).toHaveURL(/\/topic\//)
  return page.url().split('/topic/')[1]
}

test('an uploaded image appears on the detail page', async ({ page }) => {
  await signIn(page)
  const title = uniqueTitle('With diagram')

  await addTopic(page, title, png('tree-diff.png'))

  await expect(page.getByText('Visual', { exact: true })).toBeVisible()
  const figure = page.getByRole('img', { name: /tree-diff\.png/ })
  await expect(figure).toBeVisible()
  await expect(figure).toHaveAttribute('src', /token=/)
})

test('the image opens in a lightbox and Escape closes it', async ({ page }) => {
  await signIn(page)
  await addTopic(page, uniqueTitle('Zoomable'), png('zoom-me.png'))

  await page.getByRole('button', { name: /enlarge/i }).click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('replacing swaps the image for the new one', async ({ page }) => {
  await signIn(page)
  await addTopic(page, uniqueTitle('Replaceable'), png('first.png'))
  await expect(page.getByRole('img', { name: /first\.png/ })).toBeVisible()

  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel(/Visual/).setInputFiles(png('second.png'))
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

  await expect(page.getByRole('img', { name: /second\.png/ })).toBeVisible()
  await expect(page.getByRole('img', { name: /first\.png/ })).toHaveCount(0)
})

test('removing the image makes the Visual section disappear', async ({ page }) => {
  await signIn(page)
  await addTopic(page, uniqueTitle('Removable'), png('goes-away.png'))
  await expect(page.getByText('Visual', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

  await expect(page.getByText('Visual', { exact: true })).toHaveCount(0)
})

test('an oversized file leaves the topic saved and names the real reason', async ({ page }) => {
  await signIn(page)
  const title = uniqueTitle('Too big')

  await page.goto('/library')
  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByLabel('Topic', { exact: true }).fill(title)
  await page.getByLabel('Definition').fill('The image will not make it.')
  await page.getByLabel(/Visual/).setInputFiles({
    name: 'enormous.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(6 * 1024 * 1024, 1),
  })
  await page.getByRole('button', { name: 'Save topic' }).click()

  // Scoped to the dialog: Next's route announcer is also role="alert".
  // The real reason, with the actual size and the actual limit — never generic.
  const banner = page.getByRole('dialog', { name: 'Add topic' }).getByRole('alert')
  await expect(banner).toContainText(/The topic saved\. The image didn.t\./)
  await expect(banner).toContainText('6 MB')
  await expect(banner).toContainText('5 MB')

  // And the topic itself is NOT rolled back.
  await page.goto('/library')
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible()
})

test('a wrong file type leaves the topic saved and names the real reason', async ({ page }) => {
  await signIn(page)
  const title = uniqueTitle('Wrong type')

  await page.goto('/library')
  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByLabel('Topic', { exact: true }).fill(title)
  await page.getByLabel('Definition').fill('A PDF is not a diagram we accept.')
  await page.getByLabel(/Visual/).setInputFiles({
    name: 'notes.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4'),
  })
  await page.getByRole('button', { name: 'Save topic' }).click()

  const banner = page.getByRole('dialog', { name: 'Add topic' }).getByRole('alert')
  await expect(banner).toContainText(/The topic saved\. The image didn.t\./)
  await expect(banner).toContainText(/png|jpeg|webp/i)

  await page.goto('/library')
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible()
})

test('deleting a topic removes its image too', async ({ page }) => {
  await signIn(page)
  const title = uniqueTitle('Doomed with art')
  await addTopic(page, title, png('dies-too.png'))

  const src = await page.getByRole('img', { name: /dies-too\.png/ }).getAttribute('src')
  expect(src).toBeTruthy()

  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete topic' }).click()
  await expect(page).toHaveURL(/\/library/)

  // The object is gone, not merely unreferenced: its signed URL no longer resolves.
  const response = await page.request.get(src!)
  expect(response.ok()).toBe(false)
})
