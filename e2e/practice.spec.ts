import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

const EMAIL = process.env.E2E_USER_EMAIL!
const FEW_EMAIL = process.env.E2E_FEW_USER_EMAIL!

const uniqueTitle = (label: string) =>
  `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/* Replays a session saved in global setup — see e2e/auth-state.ts. */
async function signIn(page: Page, email: string) {
  await signInAs(page, email === FEW_EMAIL ? 'few' : 'main')
  await expect(page).toHaveURL(/\/library/)
}

/** Returns the topic's id, so a spec can run a deliberate single-topic session. */
async function addTopic(page: Page, title: string, definition: string): Promise<string> {
  await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
  await page.getByRole('textbox', { name: 'Topic', exact: true }).fill(title)
  await page.getByLabel('Definition').fill(definition)
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog', { name: 'Add topic' })).not.toBeVisible()

  await page.getByRole('link', { name: new RegExp(title) }).click()
  await expect(page).toHaveURL(/\/topic\//)
  const id = page.url().split('/topic/')[1]
  return id
}

/** The three values a grade writes and a skip must not. */
async function recallHistory(page: Page, id: string) {
  await page.goto(`/topic/${id}`)
  return {
    confidence: await page.getByTestId('stat-confidence').innerText(),
    practiceCount: await page.getByTestId('stat-practice-count').innerText(),
    lastPracticed: await page.getByTestId('stat-last-practiced').innerText(),
  }
}

test('grading a topic records the new confidence, visible after a reload', async ({ page }) => {
  await signIn(page, EMAIL)
  const id = await addTopic(page, uniqueTitle('Graded'), 'A definition to recall.')

  await page.goto(`/practice?topic=${id}`)
  await page.getByRole('button', { name: 'Reveal answer' }).click()
  await page.getByRole('button', { name: /Partly knew it/ }).click()

  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()

  const after = await recallHistory(page, id)
  expect(after.confidence).toContain('Okay')
  expect(after.practiceCount).toContain('1')
  expect(after.lastPracticed).not.toContain('Never')
})

test('skipping writes nothing at all', async ({ page }) => {
  await signIn(page, EMAIL)
  const id = await addTopic(page, uniqueTitle('Skipped'), 'This one gets skipped.')

  /*
    Graded FIRST, on purpose. A fresh topic already reads new / 0 / Never, so
    asserting "unchanged" on one would pass whether or not skip wrote anything.
    Grading moves all three values away from their defaults, so if skip touches
    confidence, practice_count or last_practiced_at, this fails.
  */
  await page.goto(`/practice?topic=${id}`)
  await page.getByRole('button', { name: 'Reveal answer' }).click()
  await page.getByRole('button', { name: /Knew it/ }).click()
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()

  const before = await recallHistory(page, id)
  expect(before.confidence).toContain('Strong')
  expect(before.practiceCount).toContain('1')

  await page.goto(`/practice?topic=${id}`)
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()

  const after = await recallHistory(page, id)
  expect(after.confidence).toBe(before.confidence)
  expect(after.practiceCount).toBe(before.practiceCount)
  expect(after.lastPracticed).toBe(before.lastPracticed)
})

test('ending a session early keeps everything already graded', async ({ page }) => {
  await signIn(page, EMAIL)
  const id = await addTopic(page, uniqueTitle('Early exit'), 'Graded before walking away.')

  await page.goto(`/practice?topic=${id}`)
  await page.getByRole('button', { name: 'Reveal answer' }).click()
  await page.getByRole('button', { name: /Didn't know it/ }).click()

  // Leave without going through the completion screen's own actions.
  await page.goto('/library')

  const after = await recallHistory(page, id)
  expect(after.confidence).toContain('Weak')
  expect(after.practiceCount).toContain('1')
})

test('the typed answer is never persisted', async ({ page }) => {
  await signIn(page, EMAIL)
  const id = await addTopic(page, uniqueTitle('Ephemeral'), 'The answer is not stored.')
  const secret = `scratch-${Date.now()}`

  await page.goto(`/practice?topic=${id}`)
  await page.getByRole('textbox', { name: /what you remember/i }).fill(secret)
  await page.getByRole('button', { name: 'Reveal answer' }).click()
  await expect(page.getByText(secret)).toBeVisible()
  await page.getByRole('button', { name: /Knew it/ }).click()

  // It was shown back during the reveal, and it goes nowhere else.
  await page.goto(`/topic/${id}`)
  await expect(page.getByText(secret)).toHaveCount(0)
})

test('a library below the minimum offers the override, which starts a session anyway', async ({
  page,
}) => {
  await signIn(page, FEW_EMAIL)

  await page.goto('/practice')

  await expect(page.getByRole('heading', { name: 'Not enough to practice yet' })).toBeVisible()
  await expect(page.getByText('You have 2 topics saved')).toBeVisible()

  // A hard floor with no override is what makes a personal tool annoying.
  await page.getByRole('link', { name: 'Practice the 2 anyway' }).click()

  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible()
})

test('a deliberate single-topic session is not subject to the floor', async ({ page }) => {
  await signIn(page, FEW_EMAIL)

  await page.getByRole('link', { name: /The event loop/ }).click()
  await expect(page).toHaveURL(/\/topic\//)

  await page.getByRole('link', { name: 'Practice this' }).click()

  // Two topics is below the minimum, but this session was chosen, not selected.
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Not enough to practice yet' })).toHaveCount(0)
})

/*
  The session has no rail — deliberately, because a sidebar reading "Weak topics
  15" while you are trying to recall one of them gives the answer away. That makes
  the way out the only way out, and it used to be an underlined word at 11.5px
  after the counter.
*/
test('Escape leaves a practice session, and the exit says so', async ({ page }) => {
  await signInAs(page, 'main')
  await page.goto('/practice')

  /*
    Wait for the session, NOT for a topic card.

    This asserted `Reveal answer`, which only a TOPIC renders — a quiz shows its
    options instead. The default session ties every never-practised entry at
    `staleness = -infinity` and breaks the tie with `md5(p_seed || id)`, where the
    seed is the read timestamp: the first card is genuinely randomised among the
    ties on every request. The fixture holds eight never-practised topics and two
    quizzes, so this failed about one run in five.

    That is issue #23 — "one unreproduced failure per few full runs" — and it was
    unreproducible because re-running it usually passed. The card's shape was
    never what this test is about: it is about Escape leaving a session and the
    exit naming its shortcut.
  */
  await expect(page.getByRole('img', { name: /^Card 1 of/ })).toBeVisible()

  // The control names its own shortcut.
  await expect(page.getByRole('link', { name: /End session/ })).toBeVisible()

  /*
    And it names its destination.

    The href was always `/library` — this screen has no rail, so that control is
    the only way out and it always went to the right place. What it did not do
    was SAY so: a person scanning for the affordance every other screen has
    reads "End session" and concludes there is no way to the library. So the
    accessible name is the consequence here, not a proxy for one; the effect was
    already correct and the name was the whole defect.
  */
  await expect(page.getByTestId('back-to-library')).toContainText(/library/i)

  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/library/)
})
