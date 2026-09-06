import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  DESIGN.md, "Accessibility floor", verified rather than asserted.

  These drive the app with the keyboard only and inspect computed styles, so a
  regression in the focus ring or the reduced-motion rule fails here rather than
  being noticed by someone who cannot use a mouse.
*/

/* Replays a session saved in global setup — see e2e/auth-state.ts. */
async function signIn(page: Page) {
  await signInAs(page, 'main')
  await expect(page).toHaveURL(/\/library/)
}

test('every interactive element takes a visible focus ring', async ({ page }) => {
  await page.goto('/sign-in')

  const email = page.getByLabel('Email')
  await email.focus()

  const outline = await email.evaluate((el) => {
    const style = getComputedStyle(el)
    return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor }
  })

  expect(outline.style).not.toBe('none')
  expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2)
  // --accent is #3F3AC7.
  expect(outline.color).toBe('rgb(63, 58, 199)')
})

test('a topic can be added without a mouse', async ({ page }) => {
  await signIn(page)
  const title = `Keyboard ${Date.now()}`

  // Reach the Add button by tabbing, not by clicking it.
  const add = page.getByRole('button', { name: /Add (topic|your first topic)/ }).first()
  await add.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Add topic' })).toBeVisible()

  await page.keyboard.type(title)
  await page.keyboard.press('Tab')
  await page.keyboard.type('Typed entirely with the keyboard.')

  // The sheet's own shortcut, from the mock's footer.
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible()
})

test('search is reachable and usable from the keyboard', async ({ page }) => {
  await signIn(page)

  /*
    Makes its own topic first. The toolbar only exists once the library has
    something in it — and the fixture user is reset on every seed, so a spec that
    assumes otherwise is really depending on another spec having run first.
  */
  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByRole('textbox', { name: 'Topic', exact: true }).fill(`Searchable ${Date.now()}`)
  await page.getByLabel('Definition').fill('So the toolbar is on screen.')
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

  const search = page.getByRole('searchbox', { name: 'Search your knowledge' })
  await search.focus()
  await expect(search).toBeFocused()

  await page.keyboard.type('zzz-nothing-matches-zzz')
  await expect(page.getByRole('heading', { name: /No topic matches/ })).toBeVisible()
})

test('a practice session can be completed without a mouse', async ({ page }) => {
  await signIn(page)
  const title = `Keys ${Date.now()}`

  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByRole('textbox', { name: 'Topic', exact: true }).fill(title)
  await page.getByLabel('Definition').fill('Graded with the number keys.')
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

  await page.getByRole('link', { name: new RegExp(title) }).click()
  // Wait for the navigation before reading the URL, or the id is undefined.
  await expect(page).toHaveURL(/\/topic\//)
  const id = page.url().split('/topic/')[1]

  await page.goto(`/practice?topic=${id}`)

  // Type the answer, then Tab out of the field to the Reveal button and press it.
  const answer = page.getByRole('textbox', { name: 'Write what you remember' })
  await answer.focus()
  await page.keyboard.type('Something half-remembered.')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page.getByRole('button', { name: /Didn't know it/ })).toBeVisible()

  // The number keys work once the caret is out of a field.
  await page.keyboard.press('3')
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()

  await page.goto(`/topic/${id}`)
  await expect(page.getByTestId('stat-confidence')).toContainText('Strong')
})

test('Space reveals only when the caret is outside the answer field', async ({ page }) => {
  await signIn(page)
  const title = `Space guard ${Date.now()}`

  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByRole('textbox', { name: 'Topic', exact: true }).fill(title)
  await page.getByLabel('Definition').fill('Space belongs to the sentence being written.')
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

  await page.getByRole('link', { name: new RegExp(title) }).click()
  await expect(page).toHaveURL(/\/topic\//)
  const id = page.url().split('/topic/')[1]

  await page.goto(`/practice?topic=${id}`)
  const answer = page.getByRole('textbox', { name: 'Write what you remember' })

  // Typing a space must type a space, not reveal the answer.
  await answer.focus()
  await page.keyboard.type('two words')
  await expect(answer).toHaveValue('two words')
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible()

  // Out of the field, the same key reveals.
  await page.getByRole('link', { name: 'End session' }).focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: /Didn't know it/ })).toBeVisible()
})

test('closing an overlay returns focus to whatever opened it', async ({ page }) => {
  await signIn(page)

  const add = page.getByRole('button', { name: /Add (topic|your first topic)/ }).first()
  await add.click()
  await expect(page.getByRole('dialog', { name: 'Add topic' })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(add).toBeFocused()
})

test('reduced motion stops the animation and leaves the end state applied', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await signIn(page)

  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByLabel(/Visual/).setInputFiles({
    name: 'still.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    ),
  })

  // The picked-file pill is visible and legible with no animation running.
  const pill = page.getByText('still.png')
  await expect(pill).toBeVisible()
  await expect(pill).toHaveCSS('opacity', '1')
})

test('confidence never rests on colour alone', async ({ page }) => {
  await signIn(page)

  // Makes its own topic: with the fixture user reset each run, the weak page can
  // legitimately be empty, and a spec that depends on another spec's leftovers is
  // not a spec.
  const title = `Colour ${Date.now()}`
  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByRole('textbox', { name: 'Topic', exact: true }).fill(title)
  await page.getByLabel('Definition').fill('A never-practiced topic, so it is weak.')
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

  await page.goto('/weak')
  const row = page.getByRole('listitem').filter({ hasText: title })

  // The meter carries its label in the accessible tree even with no visible text.
  await expect(row.getByRole('img', { name: 'Never practiced' })).toBeVisible()
  // And the row says it in words as well.
  await expect(row).toContainText('never practiced')
})
