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

test('Practice opens a topic-or-quiz choice, and topic practice retains its minimum', async ({ page }) => {
  await signIn(page, FEW_EMAIL)

  await page.goto('/practice')

  await expect(page.getByRole('heading', { name: 'Choose a practice type' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Practice topics' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Practice quizzes' })).toBeVisible()

  await page.getByRole('link', { name: 'Practice topics' }).click()

  await expect(page.getByRole('heading', { name: 'Not enough to practice yet' })).toBeVisible()
  await expect(page.getByText('You have 2 topics saved')).toBeVisible()
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
test('Escape ends a practice session and shows its summary', async ({ page }) => {
  await signInAs(page, 'main')
  await page.goto('/practice?scope=topic')

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

  await expect(page.getByRole('button', { name: /End session/ })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible()
  await expect(page.getByTestId('back-to-library')).toBeVisible()
})

test.describe('what you wrote from memory', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  const TOPIC = `From memory ${Date.now()}`

  test('is kept, and shown on the topic under Recall history', async ({ page }) => {
    await signInAs(page, 'extract')

    await page.getByRole('button', { name: /Add (topic|your first topic)/ }).first().click()
    const add = page.getByRole('dialog')
    await add.getByRole('textbox', { name: 'Topic', exact: true }).fill(TOPIC)
    await add.getByLabel('Definition').fill('A live reference to the defining scope, not a copy.')
    await add.getByRole('button', { name: 'Save topic' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })

    await page.getByRole('link', { name: new RegExp(TOPIC) }).click()
    await expect(page).toHaveURL(/\/topic\//)
    const id = page.url().split('/topic/')[1]

    // Nothing yet, and it says so rather than rendering an empty box.
    await expect(page.getByTestId('no-memory')).toBeVisible()
    await expect(page.getByTestId('from-memory')).toHaveCount(0)

    await page.goto(`/practice?topic=${id}`)
    await page.getByLabel('Write what you remember').fill('something about the scope staying alive')
    await page.getByRole('button', { name: /Explain it|Reveal/ }).first().click().catch(() => {})
    await page.keyboard.press('ControlOrMeta+Enter')
    await page.getByRole('button', { name: /Didn't know it/ }).click()
    /*
      Wait for the session to finish before navigating. The click returns before
      the server action does, and reading the topic page in between races the
      write — which fails as "nothing was stored" rather than as a race.
    */
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible({
      timeout: 30_000,
    })

    await page.goto(`/topic/${id}`)
    const quoted = page.getByTestId('from-memory')
    await expect(quoted).toBeVisible()
    await expect(quoted).toContainText('something about the scope staying alive')
    // Its own label and its own date, inside the section already named for it.
    await expect(quoted).toContainText('From memory')
  })

  test('an empty attempt is the absence of an explanation, not a new one', async ({ page }) => {
    /*
      The behaviour a reasonable implementation gets wrong by default.

      Revealing without typing reaches the SAME write a real attempt does, so
      unless the empty value is dropped before the update, grading after a blank
      textarea overwrites what you wrote last time with ''. Driven by actually
      sending the empty value — reveal, grade, nothing typed — rather than by
      asserting the domain rule a second time.
    */
    await signInAs(page, 'extract')

    await page.getByRole('link', { name: new RegExp(TOPIC) }).click()
    await expect(page).toHaveURL(/\/topic\//)
    const id = page.url().split('/topic/')[1]

    const before = await page.getByTestId('from-memory').textContent()

    await page.goto(`/practice?topic=${id}`)
    /*
      Click into the box and type nothing — which is what "revealed without
      typing" actually is. Asserting the value without focusing left the chord
      firing at the document, and the card never revealed.
    */
    const box = page.getByLabel('Write what you remember')
    await expect(box).toHaveValue('')
    await box.click()
    await page.keyboard.press('ControlOrMeta+Enter')
    await page.getByRole('button', { name: /Didn't know it/ }).click()
    await expect(page.getByRole('heading', { name: 'Session complete' })).toBeVisible({
      timeout: 30_000,
    })

    await page.goto(`/topic/${id}`)
    await expect(page.getByTestId('from-memory')).toBeVisible()
    await expect(
      page.getByTestId('from-memory'),
      'grading with an empty box overwrote what was written before',
    ).toHaveText(before ?? '')
  })
})
