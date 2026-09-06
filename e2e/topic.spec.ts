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
  /*
    By role, not by label. Since the type toggle arrived the sheet has two controls
    accessibly named "Topic" — the toggle's radio and the title field. A person is
    not confused, because the toggle sits inside a fieldset legended "Type"; a
    label lookup has no such context and matches both.
  */
  await page.getByRole('textbox', { name: 'Topic', exact: true }).fill(fields.title)
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
  await page.getByRole('textbox', { name: 'Topic', exact: true }).fill(edited)
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

/*
  Difficulty is set from the edit sheet, never at capture — issue #14.

  Nothing reads it when choosing what to practise: the practice queue orders by
  confidence bucket then staleness, and `difficulty` appears nowhere in
  practice-selection.ts. So asking for it while saving charged a decision at the
  moment that most needs to be cheap, for a field the product then ignored.

  It is still a real field: it filters, and it can be set deliberately once you
  have met the topic and have an opinion worth recording.
*/
test('adding a topic does not ask for difficulty, and it defaults to medium', async ({ page }) => {
  await signIn(page, EMAIL)

  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()

  const sheet = page.getByRole('dialog')
  // The fieldset, by role — `getByText('Difficulty')` matches more than one node.
  await expect(sheet.getByRole('group', { name: 'Difficulty' })).toHaveCount(0)
  // The fields that do belong at capture are all still there.
  await expect(sheet.getByRole('textbox', { name: 'Topic', exact: true })).toBeVisible()
  await expect(sheet.getByLabel('Definition')).toBeVisible()
  await expect(sheet.getByText('Category')).toBeVisible()

  const title = uniqueTitle('Defaulted difficulty')
  await sheet.getByRole('textbox', { name: 'Topic', exact: true }).fill(title)
  await sheet.getByLabel('Definition').fill('Saved without being asked.')
  await sheet.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

  // The column default, not a value the form sent.
  await page.getByRole('link', { name: new RegExp(title) }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await expect(page.getByText('Medium', { exact: true })).toBeVisible()
})

test('editing a topic can set its difficulty, and it sticks', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('Set difficulty later')
  await addTopic(page, { title, definition: 'Difficulty comes later.' })
  await openTopic(page, title)

  await page.getByRole('button', { name: 'Edit' }).click()
  const sheet = page.getByRole('dialog')

  // Present here, where the decision is a considered one.
  await expect(sheet.getByRole('group', { name: 'Difficulty' })).toBeVisible()
  /*
    The label, not the input. Segmented's radios are `sr-only` — the visible,
    clickable thing is the label wrapping each one, which is also what a user
    hits. Clicking the input directly waits forever for a hidden element.
  */
  await sheet.getByText('Hard', { exact: true }).click()
  await expect(sheet.getByRole('radio', { name: 'Hard' })).toBeChecked()
  await sheet.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

  await expect(page.getByText('Hard', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Hard', { exact: true })).toBeVisible()
})

test('the category opens on the suggestion the app already made', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('Debouncing a scroll handler')

  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  const sheet = page.getByRole('dialog')
  const category = sheet.getByRole('button', { name: /Category/ })

  // Nothing typed yet, so there is nothing to suggest from.
  await expect(category).toContainText('Uncategorized')

  await sheet.getByRole('textbox', { name: 'Topic', exact: true }).fill(title)
  await sheet
    .getByLabel('Definition')
    .fill('Wait until events stop arriving before running the callback. setTimeout and clearTimeout in a closure.')

  /*
    The heuristic has read that and decided. It always did — the select labels the
    result "Suggested from your topic" and puts it first — but the field opened on
    Uncategorized anyway, so saving with a category cost two extra actions to pick
    the option the app itself had nominated.

    Asserted on the closed control, not inside the open dropdown: the suggestion
    was already IN the dropdown before this change.
  */
  await expect(category).toContainText('JavaScript')

  // Saving takes it, without the select ever being opened.
  await sheet.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole('link', { name: new RegExp(title) })).toContainText('JavaScript')
})

test('choosing a category overrules the suggestion and stops it moving', async ({ page }) => {
  await signIn(page, EMAIL)
  const title = uniqueTitle('Overruled')

  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  const sheet = page.getByRole('dialog')
  await sheet.getByRole('textbox', { name: 'Topic', exact: true }).fill(title)
  await sheet.getByLabel('Definition').fill('A closure over setTimeout, which the heuristic reads as JavaScript.')
  await expect(sheet.getByRole('button', { name: /Category/ })).toContainText('JavaScript')

  /*
    Overruled back to Uncategorized — the case that matters most, because it is
    the one the old behaviour gave away for free. "No category" has to stay
    reachable and has to stick, or the suggestion has stopped being a suggestion.

    The listbox renders outside the dialog, so it is addressed from the page.
  */
  await sheet.getByRole('button', { name: /Category/ }).click()
  await page.getByRole('option', { name: /^Uncategorized/ }).first().click()
  await expect(sheet.getByRole('button', { name: /Category/ })).toContainText('Uncategorized')

  /*
    Typing more must not move it back. A field that keeps re-deciding after you
    have decided is worse than one that never decides.
  */
  await sheet.getByLabel('Definition').fill('More about closures and setTimeout, still JavaScript to the heuristic.')
  await expect(sheet.getByRole('button', { name: /Category/ })).toContainText('Uncategorized')

  // And the save honours it rather than the heuristic.
  await sheet.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByRole('link', { name: new RegExp(title) })).toContainText('Uncategorized')
})
