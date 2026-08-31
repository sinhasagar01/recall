import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

const EMAIL = process.env.E2E_USER_EMAIL!
const EMPTY_EMAIL = process.env.E2E_EMPTY_USER_EMAIL!

const uniqueTitle = (label: string) =>
  `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/* Replays a session saved in global setup — see e2e/auth-state.ts. */
async function signIn(page: Page, email: string) {
  await signInAs(page, email === EMPTY_EMAIL ? 'empty' : 'main')
  await expect(page).toHaveURL(/\/library/)
}

/** Every spec makes its own topic, so the workers never contend over one row. */
async function addTopic(
  page: Page,
  fields: { title: string; definition: string; mentalModel?: string },
) {
  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByLabel('Topic', { exact: true }).fill(fields.title)
  await page.getByLabel('Definition').fill(fields.definition)
  if (fields.mentalModel) await page.getByLabel(/Mental model/).fill(fields.mentalModel)
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog', { name: 'Add topic' })).not.toBeVisible()
}

async function openTopic(page: Page, title: string) {
  await page.getByRole('link', { name: new RegExp(title) }).click()
  await expect(page).toHaveURL(/\/topic\//)
}

test('a topic opens from the library and shows both registers', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('Reconciliation')

  await addTopic(page, {
    title,
    definition: 'Comparing the previous and next element tree.',
    mentalModel: 'Like an editor diffing two drafts.',
  })
  await openTopic(page, title)

  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
  await expect(page.getByText('Comparing the previous and next element tree.')).toBeVisible()
  await expect(page.getByText('Like an editor diffing two drafts.')).toBeVisible()
  // The two registers are the product: both eyebrows must be present.
  await expect(page.getByText('Definition', { exact: true })).toBeVisible()
  await expect(page.getByText('Mental model', { exact: true })).toBeVisible()
})

test('the visual section is absent when the topic has no image', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('No visual')

  await addTopic(page, { title, definition: 'Nothing attached to this one.' })
  await openTopic(page, title)

  await expect(page.getByText('Visual', { exact: true })).toHaveCount(0)
})

test('editing the title changes it on the detail page and in the library', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('Before edit')
  const edited = uniqueTitle('After edit')

  await addTopic(page, { title, definition: 'A definition to keep.' })
  await openTopic(page, title)

  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit topic' })).toBeVisible()
  await page.getByLabel('Topic', { exact: true }).fill(edited)
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByRole('heading', { name: edited, level: 1 })).toBeVisible()

  await page.getByRole('link', { name: '← Library' }).click()
  await expect(page.getByRole('link', { name: new RegExp(edited) })).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0)
})

test('deleting names what dies, then removes it for good', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('Doomed')

  await addTopic(page, { title, definition: 'This one is going away.' })
  await openTopic(page, title)
  const url = page.url()

  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  const modal = page.getByRole('dialog', { name: new RegExp(`Delete .${title}.\\?`) })
  await expect(modal).toBeVisible()
  // DESIGN.md: the confirmation names what dies, including the practice count.
  await expect(modal).toContainText("hasn't been practiced yet")
  await expect(modal).toContainText("can't be undone")

  await modal.getByRole('button', { name: 'Delete topic' }).click()

  await expect(page).toHaveURL(/\/library/)
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0)

  // Gone for good, not just gone from this render.
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Topic not found' })).toBeVisible()
})

test('backing out of the delete keeps the topic', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('Spared')

  await addTopic(page, { title, definition: 'This one survives.' })
  await openTopic(page, title)

  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Keep it' }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
})

test('an id that does not exist renders not-found', async ({ page }) => {
  await signIn(page, EMAIL)

  await page.goto('/topic/00000000-0000-0000-0000-0000000000ff')

  await expect(page.getByRole('heading', { name: 'Topic not found' })).toBeVisible()
})

test("another user's topic is indistinguishable from one that does not exist", async ({ page }) => {
  /*
    The leak this prevents: a 403 that means "exists, but not yours" tells an
    attacker which ids are real. RLS returns zero rows either way, so both paths
    must render the identical page.
  */
  await signIn(page, EMAIL)
  const title = uniqueTitle('Private')
  await addTopic(page, { title, definition: 'Belongs to the first user.' })
  await openTopic(page, title)
  const foreignUrl = page.url()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
  await signIn(page, EMPTY_EMAIL)

  await page.goto(foreignUrl)
  await expect(page.getByRole('heading', { name: 'Topic not found' })).toBeVisible()
  await expect(page.getByText(title)).toHaveCount(0)

  await page.goto('/topic/00000000-0000-0000-0000-0000000000ff')
  await expect(page.getByRole('heading', { name: 'Topic not found' })).toBeVisible()
})
