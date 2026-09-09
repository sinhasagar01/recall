import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  Arc 2.1 — a source is a lesson, inside a chapter, inside a course.

  Written against the `extract` fixture, whose purpose is being written to. Every
  other fixture has a shape these saves would break — see scripts/seed-e2e-user.mts
  for which and how, and ARCHITECTURE.md for why that is a fixture bug rather than
  an assertion bug.
*/

const COURSE = 'JavaScript: The Hard Parts'
const CHAPTER = 'Principles of JavaScript'
const SECOND_CHAPTER = 'Callbacks & Higher Order Functions'

const unique = (prefix: string) =>
  `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

async function openAddSheet(page: Page) {
  await page.goto('/sources')
  // `.first()`: the empty state renders the button in the head AND in the
  // StateBlock, so a bare locator is ambiguous for a user with no sources.
  await page.getByRole('button', { name: '+ Add a source' }).first().click()
  return page.getByRole('dialog')
}

test.describe('course, chapter and lesson', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  test('all three levels save, and the breadcrumb links at every one', async ({ page }) => {
    await signInAs(page, 'extract')

    const lesson = unique('Execution Context')
    const topicTitle = unique('The thread of execution')

    const sheet = await openAddSheet(page)
    await sheet.getByLabel(/^Course/).fill(COURSE)
    await sheet.getByLabel(/^Chapter/).fill(CHAPTER)
    await sheet.getByLabel('Lesson').fill(lesson)
    await sheet.getByLabel(/^Length/).fill('13m 23s')

    /*
      The live breadcrumb shows what will be stored BEFORE Save, which is what
      makes "90 means ninety minutes" safe rather than a guess you cannot see.
    */
    const crumb = sheet.getByTestId('form-breadcrumb')
    await expect(crumb).toContainText(COURSE)
    await expect(crumb).toContainText(CHAPTER)
    await expect(crumb).toContainText(lesson)
    await expect(crumb).toContainText('13m 23s')

    await sheet.getByRole('button', { name: 'Save source', exact: true }).click()
    await expect(page).toHaveURL(/\/sources\/[0-9a-f-]+$/, { timeout: 30_000 })

    // ── distil a topic from it, then read the breadcrumb on that topic ──────
    await page.getByRole('link', { name: '+ Distil a topic' }).click()
    const add = page.getByRole('dialog')
    await add.getByRole('textbox', { name: 'Topic', exact: true }).fill(topicTitle)
    await add.getByLabel('Definition').fill('The interpreter goes through code line by line.')
    await add.getByRole('button', { name: 'Save topic' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })

    await page.goto(`/library?q=${encodeURIComponent(topicTitle)}`)
    await page.locator(`a[href^="/topic/"]`).first().click()
    await expect(page).toHaveURL(/\/topic\//)

    /*
      Three crumbs, three links. Arc 2 rendered the lesson and course as flat
      text — "where did I learn this" was a fact you read rather than a place you
      could go.
    */
    const crumbs = page.getByTestId('source-crumb')
    await expect(crumbs).toHaveCount(3)
    await expect(crumbs.nth(0)).toHaveText(COURSE)
    await expect(crumbs.nth(1)).toHaveText(CHAPTER)
    await expect(crumbs.nth(2)).toHaveText(lesson)

    for (const index of [0, 1, 2]) {
      await expect(crumbs.nth(index)).toHaveAttribute('href', /.+/)
    }

    // The lesson crumb goes to its workspace.
    await crumbs.nth(2).click()
    await expect(page).toHaveURL(/\/sources\/[0-9a-f-]+$/)
  })

  test('a second lesson in the same chapter arrives prefilled', async ({ page }) => {
    await signInAs(page, 'extract')

    const sheet = await openAddSheet(page)

    /*
      Course offers what you have used. Picking it prefills the chapter from your
      last save in that course — you work through a chapter over several sittings,
      and retyping both ten times is the friction that kills the habit.
    */
    await sheet.getByLabel(/^Course/).fill('JavaScript')
    await sheet.getByTestId('combobox-option').filter({ hasText: COURSE }).first().click()

    await expect(sheet.getByLabel(/^Course/)).toHaveValue(COURSE)
    await expect(sheet.getByLabel(/^Chapter/)).toHaveValue(CHAPTER)

    await sheet.getByLabel('Lesson').fill(unique('Call Stack'))
    await sheet.getByRole('button', { name: 'Save source', exact: true }).click()
    await expect(page).toHaveURL(/\/sources\/[0-9a-f-]+$/, { timeout: 30_000 })
  })

  test('save and add the next lesson keeps the course and chapter, clears the rest', async ({
    page,
  }) => {
    await signInAs(page, 'extract')

    const sheet = await openAddSheet(page)
    await sheet.getByLabel(/^Course/).fill(COURSE)
    await sheet.getByLabel(/^Chapter/).fill(CHAPTER)
    await sheet.getByLabel('Lesson').fill(unique('Thread of Execution'))
    await sheet.getByLabel(/^Length/).fill('21m 40s')

    await sheet.getByRole('button', { name: 'Save and add the next lesson' }).click()

    // The sheet stays open. Course and chapter survive; everything else goes.
    await expect(sheet.getByLabel(/^Course/)).toHaveValue(COURSE, { timeout: 30_000 })
    await expect(sheet.getByLabel(/^Chapter/)).toHaveValue(CHAPTER)
    await expect(sheet.getByLabel('Lesson')).toHaveValue('')
    await expect(sheet.getByLabel(/^Length/)).toHaveValue('')

    // And the cursor is where the next thing you type goes.
    await expect(sheet.getByLabel('Lesson')).toBeFocused()
  })

  test('a lesson with no course groups under "No course", last', async ({ page }) => {
    await signInAs(page, 'extract')

    const lesson = unique('A conference talk')
    const sheet = await openAddSheet(page)
    await sheet.getByLabel('Lesson').fill(lesson)
    await sheet.getByRole('button', { name: 'Save source', exact: true }).click()
    await expect(page).toHaveURL(/\/sources\/[0-9a-f-]+$/, { timeout: 30_000 })

    await page.goto('/sources')

    const groups = page.getByTestId('course-group')
    await expect(groups.last()).toContainText('No course')
    await expect(groups.last()).toContainText(lesson)

    /*
      "No course" is the ABSENCE of a course, so the head must not count it as
      one. The mock's header read "2 courses" for exactly this shape.
    */
    await expect(page.getByText(/1 course · \d+ without one/)).toBeVisible()

    // And no progress bar anywhere: a bar needs a denominator the app does not
    // have. The count says what it counts.
    await expect(page.getByTestId('course-mined').first()).toContainText(/\d+ of \d+ mined/)
  })

  test('one chapter means one button, and the course session is its entries', async ({ page }) => {
    await signInAs(page, 'extract')
    await page.goto('/sources')

    const group = page.getByTestId('course-group').filter({ hasText: COURSE }).first()

    /*
      The collapse rule. This course has one chapter, so "practise this chapter"
      and "practise this course" would run over the same entries — two buttons
      producing an identical session. The chapter one is ABSENT, not disabled.
    */
    await expect(group.getByRole('link', { name: /^Practise this chapter/ })).toHaveCount(0)

    const courseAction = group.getByRole('link', { name: /^Practise this course/ })
    await expect(courseAction).toBeVisible()
    // The count sits beside the button, not inside its label.
    await expect(courseAction).toHaveText('Practise this course')
    await expect(group).toContainText(/\d+ entr(y|ies)/)

    await courseAction.click()
    await expect(page).toHaveURL(/scope=course/)
    await expect(page.getByRole('img', { name: 'Card 1 of 1' })).toBeVisible({ timeout: 30_000 })
  })

  test('a second chapter brings its own button back', async ({ page }) => {
    await signInAs(page, 'extract')

    // A lesson in a DIFFERENT chapter of the same course, with something distilled
    // from it — so the two scopes stop resolving to the same set.
    const lesson = unique('Callbacks')
    const sheet = await openAddSheet(page)
    await sheet.getByLabel(/^Course/).fill(COURSE)
    await sheet.getByLabel(/^Chapter/).fill(SECOND_CHAPTER)
    await sheet.getByLabel('Lesson').fill(lesson)
    await sheet.getByRole('button', { name: 'Save source', exact: true }).click()
    await expect(page).toHaveURL(/\/sources\/[0-9a-f-]+$/, { timeout: 30_000 })

    await page.getByRole('link', { name: '+ Distil a topic' }).click()
    const add = page.getByRole('dialog')
    await add.getByRole('textbox', { name: 'Topic', exact: true }).fill(unique('Higher order'))
    await add.getByLabel('Definition').fill('A function taking or returning a function.')
    await add.getByRole('button', { name: 'Save topic' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })

    await page.goto('/sources')
    const group = page.getByTestId('course-group').filter({ hasText: COURSE }).first()

    // Both scopes now run different sessions, so both buttons are there.
    await expect(group.getByRole('link', { name: /^Practise this course/ })).toBeVisible()

    const band = group.getByTestId('chapter-group').filter({ hasText: SECOND_CHAPTER }).first()

    /*
      The same rule one level DOWN, which is what it means for it to be general.
      This chapter has exactly one lesson, so "practise this lesson" and
      "practise this chapter" run over the same single entry. The narrower one
      goes — absent, not disabled.
    */
    await expect(band.getByRole('link', { name: /^Practise this lesson/ })).toHaveCount(0)

    await band.getByRole('link', { name: /^Practise this chapter/ }).click()

    await expect(page).toHaveURL(/scope=chapter/)
    await expect(page).toHaveURL(new RegExp(encodeURIComponent(SECOND_CHAPTER)))
    // Only that chapter's one entry — not the course's two.
    await expect(page.getByRole('img', { name: 'Card 1 of 1' })).toBeVisible({ timeout: 30_000 })
  })

  test('a second lesson in the chapter brings the lesson buttons with it', async ({ page }) => {
    /*
      The other side of the collapse, and the case that shows the lesson action
      exists at all. Two lessons in one chapter, each with its own entry: the
      chapter's session is both, each lesson's is one, and no two of the three
      scopes resolve to the same set. So all three actions are on screen.
    */
    await signInAs(page, 'extract')

    const second = unique('Function Stack')
    const sheet = await openAddSheet(page)
    await sheet.getByLabel(/^Course/).fill(COURSE)
    await sheet.getByLabel(/^Chapter/).fill(SECOND_CHAPTER)
    await sheet.getByLabel('Lesson').fill(second)
    await sheet.getByRole('button', { name: 'Save source', exact: true }).click()
    await expect(page).toHaveURL(/\/sources\/[0-9a-f-]+$/, { timeout: 30_000 })

    await page.getByRole('link', { name: '+ Distil a topic' }).click()
    const add = page.getByRole('dialog')
    await add.getByRole('textbox', { name: 'Topic', exact: true }).fill(unique('Call stack frame'))
    await add.getByLabel('Definition').fill('One frame per call, popped when the call returns.')
    await add.getByRole('button', { name: 'Save topic' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 30_000 })

    await page.goto('/sources')
    const group = page.getByTestId('course-group').filter({ hasText: COURSE }).first()
    const band = group.getByTestId('chapter-group').filter({ hasText: SECOND_CHAPTER }).first()

    const lessons = band.getByRole('link', { name: /^Practise this lesson/ })
    await expect(lessons).toHaveCount(2)
    await expect(band.getByRole('link', { name: /^Practise this chapter/ })).toBeVisible()

    /*
      And it starts THAT lesson's session, not the chapter's — one entry, via the
      `?scope=source` route arc 6 built and nothing on this page ever called.
    */
    await lessons.first().click()
    await expect(page).toHaveURL(/scope=source/)
    await expect(page.getByRole('img', { name: 'Card 1 of 1' })).toBeVisible({ timeout: 30_000 })
  })

  test('the lesson meter says its numbers in words', async ({ page }) => {
    await signInAs(page, 'extract')
    await page.goto('/sources')

    /*
      Colour is never the only signal — the squares are the glance and the label
      is the truth. A lesson with one entry that has never been practised is
      distilled but not settled, so: not "nothing distilled", not "finished".
    */
    const meters = page.getByTestId('lesson-meter')
    await expect(meters.first()).toHaveAttribute('aria-label', /at okay or better|nothing distilled/)
  })
})
