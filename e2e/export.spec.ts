import { unzipSync } from 'fflate'
import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  The way out. One request, one zip, two documents and the images.

  The assertion that matters most is isolation: this is the only read in the
  application that deliberately returns every row a user owns, so "it returned
  someone else's" is the way it could be genuinely dangerous. `secret-key-boundary`
  guards that structurally — only account.ts may hold the admin key — and this
  guards it behaviourally, with two users whose libraries are known and disjoint.
*/

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const uniqueTitle = (label: string) =>
  `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/** Fetches the export with the page's cookies and unpacks it. */
async function downloadExport(page: Page) {
  const response = await page.request.get('/export')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/zip')

  const disposition = response.headers()['content-disposition'] ?? ''
  const files = unzipSync(new Uint8Array(await response.body()))
  const text = (name: string) => new TextDecoder().decode(files[name])

  return {
    disposition,
    names: Object.keys(files),
    markdown: text('library.md'),
    json: JSON.parse(text('library.json')) as {
      exportedAt: string
      topicCount: number
      images: { exported: number; missing: string[] }
      topics: { title: string; mental_model: string | null; mental_model_image_path: string | null }[]
    },
    files,
  }
}

test('the zip is named for the day it was taken', async ({ page }) => {
  await signInAs(page, 'few')
  const { disposition } = await downloadExport(page)

  // Dated, because two exports otherwise collide in a downloads folder.
  expect(disposition).toMatch(/attachment; filename="recall-\d{4}-\d{2}-\d{2}\.zip"/)
})

test('it carries both documents, and they agree', async ({ page }) => {
  await signInAs(page, 'few')
  const { names, markdown, json } = await downloadExport(page)

  expect(names).toContain('library.md')
  expect(names).toContain('library.json')

  // The `few` fixture owns exactly these two, on every run.
  expect(json.topicCount).toBe(2)
  expect(json.topics.map((t) => t.title).sort()).toEqual(['Specificity', 'The event loop'])
  expect(markdown).toContain('# The event loop')
  expect(markdown).toContain('# Specificity')
  expect(markdown).toContain('2 topics')

  // Every column, not a summary.
  expect(json.topics[0]).toHaveProperty('confidence')
  expect(json.topics[0]).toHaveProperty('practice_count')
  expect(json.topics[0]).toHaveProperty('last_practiced_at')
})

test('it never returns another user"s rows', async ({ page }) => {
  /*
    Two fixtures with known, disjoint libraries. If RLS were bypassed — an admin
    client, a hand-written filter that missed — this is the assertion that fails.
  */
  await signInAs(page, 'few')
  const mine = await downloadExport(page)

  await signInAs(page, 'strong')
  const theirs = await downloadExport(page)

  const titles = (x: typeof mine) => x.json.topics.map((t) => t.title)

  expect(titles(mine).sort()).toEqual(['Specificity', 'The event loop'])
  expect(titles(theirs).sort()).toEqual(['Flexbox main axis', 'Stacking contexts'])

  // Disjoint, in both directions and in both files.
  for (const title of titles(theirs)) {
    expect(titles(mine)).not.toContain(title)
    expect(mine.markdown).not.toContain(title)
  }
  for (const title of titles(mine)) {
    expect(theirs.markdown).not.toContain(title)
  }
})

test('signed out, it refuses rather than returning an empty library', async ({ page }) => {
  await page.context().clearCookies()
  const response = await page.request.get('/export')

  // An empty zip would read as "your library is empty", which is a lie.
  expect(response.status()).toBe(401)
})

/*
  The three shapes most likely to produce a broken line or a dangling reference.
  Driven through the real UI so the row is exactly what the app would have saved.
*/
test('a topic with an image, one without, and one with no mental model all survive', async ({
  page,
}) => {
  await signInAs(page, 'main')

  const withImage = uniqueTitle('Export with image')
  const withoutImage = uniqueTitle('Export without image')

  const add = async (title: string, mentalModel: string | null, file: boolean) => {
    await page.goto('/library')
    await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
    await page.getByLabel('Topic', { exact: true }).fill(title)
    await page.getByLabel('Definition').fill('Exported.')
    if (mentalModel) await page.getByLabel(/Mental model/).fill(mentalModel)
    if (file) {
      await page
        .getByLabel(/Visual/)
        .setInputFiles({ name: 'diagram.png', mimeType: 'image/png', buffer: PNG_1X1 })
    }
    await page.getByRole('button', { name: 'Save topic' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
  }

  await add(withImage, 'A picture is attached.', true)
  await add(withoutImage, null, false)

  const { markdown, json, names } = await downloadExport(page)

  const imaged = json.topics.find((t) => t.title === withImage)!
  const plain = json.topics.find((t) => t.title === withoutImage)!

  // JSON keeps every field, including the nulls.
  expect(imaged.mental_model_image_path).not.toBeNull()
  expect(plain.mental_model_image_path).toBeNull()
  expect(plain.mental_model).toBeNull()

  // Markdown renders all three shapes without a broken section.
  expect(markdown).toContain(`# ${withImage}`)
  expect(markdown).toContain(`# ${withoutImage}`)

  // The two halves of the zip connect: the reference resolves to a real entry.
  const reference = markdown.match(new RegExp(`!\\[${withImage}\\]\\((images/[^)]+)\\)`))
  expect(reference, 'the imaged topic must reference a file').not.toBeNull()
  expect(names).toContain(reference![1])
  expect(json.images.exported).toBeGreaterThan(0)
  expect(json.images.missing).toEqual([])

  // The topic without one says nothing about an image at all.
  const section = markdown.slice(markdown.indexOf(`# ${withoutImage}`))
  expect(section.split('---')[0]).not.toContain('images/')
})
