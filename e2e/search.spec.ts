import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  Search runs over the whole library, and the other specs are adding topics to the
  same user concurrently. So every spec here searches for a token unique to itself
  and asserts on what that token matches — never on a total.
*/
const token = () => `zq${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/* Replays a session saved in global setup — see e2e/auth-state.ts. */
async function signIn(page: Page) {
  await signInAs(page, 'main')
  await expect(page).toHaveURL(/\/library/)
}

async function addTopic(
  page: Page,
  fields: { title: string; definition: string; mentalModel?: string; tag?: string },
) {
  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByLabel('Topic', { exact: true }).fill(fields.title)
  await page.getByLabel('Definition').fill(fields.definition)
  if (fields.mentalModel) await page.getByLabel(/Mental model/).fill(fields.mentalModel)
  if (fields.tag) await page.getByLabel(/Tags/).fill(`${fields.tag}\n`)
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog', { name: 'Add topic' })).not.toBeVisible()
}

const search = (page: Page) => page.getByRole('searchbox', { name: 'Search your knowledge' })
const cards = (page: Page) => page.getByRole('link', { name: /./ }).filter({ has: page.locator('h3') })

test('a partial term narrows the list, case-insensitively', async ({ page }) => {
  await signIn(page)
  const mark = token()
  const title = `${mark} reconciliation`

  await addTopic(page, { title, definition: 'Comparing two element trees.' })
  await addTopic(page, { title: `${mark} hydration`, definition: 'Server and client must agree.' })

  // The case from the brief: a partial word, in the middle, in the wrong case.
  await search(page).fill(`${mark.toUpperCase()} RECON`)

  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible()
  await expect(cards(page)).toHaveCount(1)
})

test('a term that appears only in a tag still finds the topic', async ({ page }) => {
  await signIn(page)
  const mark = token()

  await addTopic(page, {
    title: `${mark} tagged`,
    definition: 'Nothing in here matches the tag.',
    tag: `${mark}tag`,
  })

  await search(page).fill(`${mark}tag`)

  await expect(page.getByRole('link', { name: new RegExp(`${mark} tagged`) })).toBeVisible()
  await expect(cards(page)).toHaveCount(1)
})

test('a term that appears only in the mental model still finds the topic', async ({ page }) => {
  await signIn(page)
  const mark = token()

  await addTopic(page, {
    title: `${mark} modelled`,
    definition: 'Nothing in here matches.',
    mentalModel: `Like a ${mark}bridge swaying underfoot.`,
  })

  await search(page).fill(`${mark}bridge`)

  await expect(page.getByRole('link', { name: new RegExp(`${mark} modelled`) })).toBeVisible()
  await expect(cards(page)).toHaveCount(1)
})

test('a search that matches nothing shows no-results, not the empty library', async ({ page }) => {
  await signIn(page)
  const mark = token()
  await addTopic(page, { title: `${mark} present`, definition: 'This library is not empty.' })

  await search(page).fill(`${mark}nothingmatchesthis`)

  // The distinction that matters: the library has topics, this search has none.
  await expect(page.getByRole('heading', { name: /No topic matches/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Search all \d+ topics/ })).toBeVisible()
})

test('a filter combination that matches nothing also shows no-results', async ({ page }) => {
  await signIn(page)
  const mark = token()
  await addTopic(page, { title: `${mark} easyish`, definition: 'Saved as medium difficulty.' })

  await search(page).fill(mark)
  await expect(cards(page)).toHaveCount(1)

  // Individually each matches something; together they match nothing.
  await page.getByRole('button', { name: /Difficulty/ }).click()
  await page.getByRole('option', { name: /Hard/ }).click()

  await expect(page.getByRole('heading', { name: /No topic matches/ })).toBeVisible()
})

test('"+ Add" from the no-results state opens the sheet with the title prefilled', async ({ page }) => {
  await signIn(page)
  const mark = token()
  await addTopic(page, { title: `${mark} present`, definition: 'So the library is not empty.' })

  const missing = `${mark}webrtc`
  await search(page).fill(missing)

  await page.getByRole('button', { name: `+ Add “${missing}”` }).click()

  // The moment you most want to save the thing you failed to find.
  await expect(page.getByRole('dialog', { name: 'Add topic' })).toBeVisible()
  await expect(page.getByLabel('Topic', { exact: true })).toHaveValue(missing)
})

test('Clear resets the search and the filters', async ({ page }) => {
  await signIn(page)
  const mark = token()
  await addTopic(page, { title: `${mark} clearable`, definition: 'Still here after Clear.' })

  await search(page).fill(mark)
  await page.getByRole('button', { name: /Difficulty/ }).click()
  await page.getByRole('option', { name: /Hard/ }).click()
  await expect(page.getByRole('heading', { name: /No topic matches/ })).toBeVisible()

  await page.getByRole('button', { name: 'Clear' }).click()

  await expect(search(page)).toHaveValue('')
  await expect(page.getByRole('link', { name: new RegExp(`${mark} clearable`) })).toBeVisible()
})

test('the filtered view is shareable — the URL carries the query', async ({ page }) => {
  await signIn(page)
  const mark = token()
  await addTopic(page, { title: `${mark} shared`, definition: 'Reachable from a link.' })

  await search(page).fill(mark)
  await expect(cards(page)).toHaveCount(1)

  const url = page.url()
  expect(url).toContain(`q=${mark}`)

  await page.goto(url)
  await expect(search(page)).toHaveValue(mark)
  await expect(cards(page)).toHaveCount(1)
})
