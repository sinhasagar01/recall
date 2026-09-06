import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  A quiz has no definition. Its question is its title.

  These three assertions exist because `tsc` cannot make them. Adding `kind` to
  `Topic` turned two of the nine `.definition` reads into compile errors — the two
  that consume it as a `string`. The three that merely RENDER it stayed silent,
  because `definition` is `string | null` on the union and JSX renders null as
  nothing. See ARCHITECTURE.md, "A discriminated union only catches reads it makes
  type-incompatible".

  So each of those three sites gets an assertion here, and each asserts the element
  is ABSENT rather than empty. "The excerpt is empty" passes before and after the
  fix and proves nothing; "there is no excerpt" fails today and passes once the
  render narrows on kind.
*/

const TWO_OPTION = 'Does a transform on a parent create a stacking context?'
const THREE_OPTION = 'What runs first — a resolved promise or a zero-delay timeout?'

const cardFor = (page: Page, title: string) =>
  page.getByRole('link').filter({ hasText: title })

test.describe('a quiz renders as a quiz, not as a topic with holes', () => {
  test('the library card has no excerpt element at all', async ({ page }) => {
    await signInAs(page, 'main')

    const quiz = cardFor(page, TWO_OPTION).first()
    await expect(quiz).toBeVisible()

    /*
      `.line-clamp-2` is the excerpt's own identity — the card's other <p> is the
      path line. Asserting the element is missing, not that its text is blank.
    */
    await expect(quiz.locator('p.line-clamp-2')).toHaveCount(0)

    // A topic still has one, so this is not passing because the selector is wrong.
    const topic = cardFor(page, 'Bulk topic').first()
    if (await topic.count()) await expect(topic.locator('p.line-clamp-2')).toHaveCount(1)
  })

  test('the detail page renders no Definition section', async ({ page }) => {
    await signInAs(page, 'main')
    await cardFor(page, TWO_OPTION).first().click()

    await expect(page.getByRole('heading', { level: 1, name: TWO_OPTION })).toBeVisible()
    await expect(page.getByText('Definition', { exact: true })).toHaveCount(0)
  })

  test('the practice card renders no Definition register', async ({ page }) => {
    await signInAs(page, 'main')
    await page.goto('/practice?scope=quiz')

    /*
      Any quiz, not a named one. Which quiz a session puts first is decided by the
      ordering and the seed, and naming one made this fail whenever another test
      had added quizzes — the paged-list mistake recorded in ARCHITECTURE.md,
      in miniature. "Check answer" is what makes it a quiz card.
    */
    await expect(page.getByRole('button', { name: 'Check answer' })).toBeVisible()
    await expect(page.getByText('Definition', { exact: true })).toHaveCount(0)
  })
})

/*
  Answering a two-option quiz.

  Deliberately the two-option shape first. It is the one with no quiet third: after
  Check, BOTH options carry a mark, so the "only two are marked, everything else
  goes muted" rule has nothing left to grey out. If that rule were implemented as
  "mute all but the answer" it would look right here and wrong everywhere else — or
  the reverse — and this is the case where the mistake is invisible.
*/
const RIGHT = 'Yes — any transform other than none'
const WRONG = 'No — only position plus z-index'

const optionButton = (page: Page, text: string) =>
  page.getByRole('button').filter({ hasText: text })

/**
 * The two-option quiz on screen, deterministically.
 *
 * `?scope=quiz` builds a whole session and the two-option quiz is not reliably its
 * first card — these tests would then pass or fail on queue order rather than on
 * what they are about. `?topic=` is the existing "practice this one" entry point
 * and takes a single deliberately chosen card, which is exactly what is wanted
 * here. `?scope=quiz` itself is covered by the absence test above.
 */
async function openTwoOptionQuiz(page: Page) {
  await page.goto(`/library?q=${encodeURIComponent('stacking context')}`)
  const href = await cardFor(page, TWO_OPTION).first().getAttribute('href')
  await page.goto(`/practice?topic=${href!.split('/').pop()}`)
  await expect(page.getByText(TWO_OPTION)).toBeVisible()
}

/**
 * Wait for the answer to actually be written.
 *
 * The outcome sentence appears the instant Check is pressed — it is derived from
 * the pick in the browser, not from the response — so it is NOT a synchronisation
 * point, and an early version of these tests navigated to /weak while the write
 * was still in flight and failed about one run in six. The continue button is the
 * real one: it is disabled and reads "Saving…" until the action resolves.
 */
async function writeSettled(page: Page) {
  await expect(page.getByRole('button', { name: /Finish session|Next$/ })).toBeEnabled()
}

/** Everything the library card says about it — confidence, practice count, all of it. */
async function cardText(page: Page): Promise<string> {
  await page.goto(`/library?q=${encodeURIComponent('stacking context')}`)
  return cardFor(page, TWO_OPTION).first().innerText()
}

test.describe('answering a two-option quiz', () => {
  /*
    Serial, because these four share one seeded quiz and three of them write to it.
    Run in parallel, "a tap writes nothing" reads the card, another test answers
    the same quiz, and the comparison fails on someone else's write — which looks
    exactly like the bug it is there to catch. Answering is the only suite in the
    project that mutates a fixture the same file also reads.
  */
  test.describe.configure({ mode: 'serial' })

  test('selecting is not answering — a tap writes nothing', async ({ page }) => {
    await signInAs(page, 'main')

    const before = await cardText(page)

    await openTwoOptionQuiz(page)
    // Pick the wrong one, change your mind, then leave without checking.
    await optionButton(page, WRONG).click()
    await optionButton(page, RIGHT).click()

    /*
      The card says exactly what it said before — same confidence, same practice
      count. This is the assertion that would fail if selection wrote, and it is
      the whole reason Check exists as a second step: a mis-tap on a phone must not
      be able to mark something weak for good.

      Compared against the card's own earlier text rather than a fixed string, so
      it does not depend on which tests ran first.
    */
    expect(await cardText(page)).toBe(before)
  })

  test('after checking, both options are marked and neither is a button', async ({ page }) => {
    await signInAs(page, 'main')
    await openTwoOptionQuiz(page)

    await optionButton(page, WRONG).click()
    await page.getByRole('button', { name: 'Check answer' }).click()

    // Both marks, in words rather than only in colour.
    await expect(page.getByText('The answer', { exact: true })).toBeVisible()
    await expect(page.getByText('You picked this', { exact: true })).toBeVisible()

    // The outcome, announced.
    const outcome = page.getByRole('status')
    await expect(outcome).toContainText('Marked weak')
    await writeSettled(page)

    /*
      The options stop being controls. A disabled button still announces itself as
      a button, so these become plain elements — asserted by absence of the role,
      not by the disabled attribute.
    */
    await expect(optionButton(page, WRONG)).toHaveCount(0)
    await expect(optionButton(page, RIGHT)).toHaveCount(0)
  })

  test('the answer is what is recorded, and it is recorded as confidence', async ({ page }) => {
    await signInAs(page, 'main')

    await openTwoOptionQuiz(page)
    await optionButton(page, WRONG).click()
    await page.getByRole('button', { name: 'Check answer' }).click()
    await expect(page.getByRole('status')).toContainText('Marked weak')
    await writeSettled(page)

    /*
      Read back off the library card, not off the practice screen — the verdict
      there is derived in the browser and would still read "Marked weak" if the
      write had failed. This is the same confidence field, chip and vocabulary a
      topic uses, which is the claim: one confidence system, two shapes.

      Not asserted against /weak, deliberately. That page is ordered and paged at
      60 rows, and this fixture has 275 that need review, so a just-answered quiz
      sorts below the first page — absence there would mean nothing. That a quiz
      is not filtered out of the weak query at all is asserted in
      supabase/tests/quiz_shape_test.sql, where it can be proven rather than
      eyeballed.
    */
    expect(await cardText(page)).toContain('Weak')

    // Now get it right.
    await openTwoOptionQuiz(page)
    await optionButton(page, RIGHT).click()
    await page.getByRole('button', { name: 'Check answer' }).click()
    await expect(page.getByRole('status')).toContainText('Marked strong')
    await writeSettled(page)

    const after = await cardText(page)
    expect(after).toContain('Strong')
    expect(after).not.toContain('Weak')
  })

  test('the whole question is answerable from the keyboard', async ({ page }) => {
    await signInAs(page, 'main')
    await openTwoOptionQuiz(page)

    // Check is dead until something is picked.
    await expect(page.getByRole('button', { name: 'Check answer' })).toBeDisabled()

    /*
      1 and 2 are DISPLAYED positions, not stored indices — the options shuffle per
      session — so this presses a key, confirms it armed Check, and commits with
      Enter without assuming which of the two it landed on.
    */
    await page.keyboard.press('1')
    await expect(page.getByRole('button', { name: 'Check answer' })).toBeEnabled()

    await page.keyboard.press('Enter')
    await expect(page.getByRole('status')).toContainText(/Marked (weak|strong)/)
    await writeSettled(page)
  })
})

/*
  The three-option case exists for one assertion the two-option case cannot make.

  After Check, exactly two options are marked: the correct one, and your pick if it
  was wrong. Everything else goes muted — "painting every wrong option red buries
  the one that matters". With two options there is no quiet third, so both are
  marked and the muting rule has nothing to apply to: an implementation that
  painted every non-answer red would look completely correct there.

  This is that third option.
*/
const THREE_WRONG = 'The timeout — a zero delay is always immediate'
const THREE_UNPICKED = "Depends on the browser's scheduler"
const THREE_RIGHT = 'The promise — microtasks drain before the next macrotask'

/** #83858f — --color-ink-3, the muted ink. */
const MUTED = 'rgb(131, 133, 143)'
/** #b4325c — --color-flag, what "wrong" is painted in. */
const FLAG = 'rgb(180, 50, 92)'

test.describe('the option that was neither correct nor picked', () => {
  test.describe.configure({ mode: 'serial' })

  test('renders muted, not marked wrong', async ({ page }) => {
    await signInAs(page, 'main')

    await page.goto(`/library?q=${encodeURIComponent('runs first')}`)
    const href = await cardFor(page, THREE_OPTION).first().getAttribute('href')
    await page.goto(`/practice?topic=${href!.split('/').pop()}`)
    await expect(page.getByText(THREE_OPTION)).toBeVisible()

    await optionButton(page, THREE_WRONG).click()
    await page.getByRole('button', { name: 'Check answer' }).click()
    await writeSettled(page)

    // The element carrying both the state and the paint, so the two assertions
    // below are about the same node.
    const option = (text: string) => page.locator('[data-state]').filter({ hasText: text })

    // Exactly two marks on the whole card, and they are the two that should be.
    await expect(page.getByText('The answer', { exact: true })).toHaveCount(1)
    await expect(page.getByText('You picked this', { exact: true })).toHaveCount(1)
    await expect(option(THREE_RIGHT)).toHaveAttribute('data-state', 'correct')
    await expect(option(THREE_WRONG)).toHaveAttribute('data-state', 'wrong')

    /*
      The quiet third. It carries no tag, no glyph, and it is painted in muted ink
      rather than in the flag colour — asserted as a computed value, not as a
      class name, so the state attribute cannot say "muted" while the element is
      rendered red.
    */
    const quiet = option(THREE_UNPICKED)
    await expect(quiet).toHaveAttribute('data-state', 'muted')
    await expect(quiet).not.toContainText('You picked this')
    await expect(quiet).not.toContainText('The answer')
    await expect(quiet).toHaveCSS('color', MUTED)
    await expect(quiet).not.toHaveCSS('color', FLAG)

    // And the wrong one really is flag-coloured, so MUTED above is a difference
    // this page can actually express rather than a colour nothing uses.
    await expect(option(THREE_WRONG)).toHaveCSS('color', FLAG)
  })

  test('a right answer leaves the other two both muted', async ({ page }) => {
    await signInAs(page, 'main')

    await page.goto(`/library?q=${encodeURIComponent('runs first')}`)
    const href = await cardFor(page, THREE_OPTION).first().getAttribute('href')
    await page.goto(`/practice?topic=${href!.split('/').pop()}`)
    await expect(page.getByText(THREE_OPTION)).toBeVisible()

    await optionButton(page, THREE_RIGHT).click()
    await page.getByRole('button', { name: 'Check answer' }).click()
    await writeSettled(page)

    // One tag, not two — "Correct · you picked this" rather than a tick plus a
    // separate confirmation.
    await expect(page.getByText('Correct · you picked this', { exact: true })).toHaveCount(1)
    await expect(page.getByText('You picked this', { exact: true })).toHaveCount(0)

    const option = (text: string) => page.locator('[data-state]').filter({ hasText: text })
    await expect(option(THREE_WRONG)).toHaveAttribute('data-state', 'muted')
    await expect(option(THREE_UNPICKED)).toHaveAttribute('data-state', 'muted')
    await expect(page.getByRole('status')).toContainText('Marked strong')
  })
})

/*
  Authoring a quiz through the sheet, and the type chips over the result.

  Written against deltas rather than absolute counts, and on the `main` fixture
  rather than `empty`. An earlier version added its rows to the empty-library
  fixture, which is exactly the sort of test that passes once and then quietly
  breaks the fixture every other spec depends on. Counting the change instead of
  the total also means this cannot fail because some other test added a row.
*/
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

/** The number a type chip is currently claiming. */
async function chipCount(page: Page, label: string): Promise<number> {
  const text = await page.getByRole('button', { name: new RegExp(`^${label} \\d+$`) }).innerText()
  return Number(text.split(' ').pop())
}

test.describe('adding a quiz, and filtering by type', () => {
  test.describe.configure({ mode: 'serial' })

  test('the sheet writes a quiz, and the chips count it', async ({ page }) => {
    await signInAs(page, 'main')

    const question = `Which of these does not create a stacking context? ${unique()}`

    await page.getByRole('button', { name: '+ Add topic' }).click()

    /*
      Switching the toggle swaps the fields. Definition goes; Question, Options and
      Why arrive. Asserted as absence, for the reason recorded at the top of this
      file — a Definition still in the DOM would submit alongside the quiz.

      The label, not the input: Segmented's radios are `sr-only`, so the visible
      clickable thing is the label wrapping each one, which is what a person hits.
    */
    const sheet = page.getByRole('dialog')
    await sheet.getByText('Quiz', { exact: true }).click()
    await expect(sheet.getByRole('radio', { name: 'Quiz' })).toBeChecked()
    await expect(sheet.getByLabel('Definition')).toHaveCount(0)
    await expect(sheet.getByLabel('Question')).toBeVisible()
    await expect(sheet.getByLabel('Why')).toBeVisible()

    await sheet.getByLabel('Question').fill(question)
    await sheet.getByLabel('Option 1', { exact: true }).fill('position: relative alone')
    await sheet.getByLabel('Option 2', { exact: true }).fill('opacity below 1')

    // A third option is typing, not finding a button first.
    await sheet.getByLabel('Add another option').fill('transform: translateZ(0)')

    await sheet.getByLabel('Option 1 is the answer').check()
    await sheet.getByLabel('Why').fill('Positioning only matters once z-index joins it.')
    await sheet.getByRole('button', { name: 'Save quiz' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })

    // The card: the question as its title, the option count in the path line,
    // and no excerpt, because a quiz has no definition to excerpt.
    const card = cardFor(page, question).first()
    await expect(card).toBeVisible()
    await expect(card).toContainText('3 options')
    await expect(card.locator('p.line-clamp-2')).toHaveCount(0)

    /*
      The chips partition the library — asserted as an invariant rather than
      against fixture sizes, because another spec writing to this user at the same
      time would break exact numbers without breaking anything real. If `byKind`
      were computed differently from `total` this is where it would show.
    */
    const all = await chipCount(page, 'All')
    const topics = await chipCount(page, 'Topics')
    const quizzes = await chipCount(page, 'Quizzes')
    expect(topics + quizzes).toBe(all)
    expect(quizzes).toBeGreaterThan(0)

    // And what clicking each chip actually yields matches what it claims.
    await page.getByRole('button', { name: /^Quizzes \d+$/ }).click()
    await expect(cardFor(page, question)).toHaveCount(1)

    await page.getByRole('button', { name: /^Topics \d+$/ }).click()
    await expect(cardFor(page, question)).toHaveCount(0)

    // The filter is in the URL, so a filtered view survives a reload.
    await expect(page).toHaveURL(/kind=topic/)
    await page.reload()
    await expect(cardFor(page, question)).toHaveCount(0)

    /*
      Cleaned up, because this test WRITES to a shared fixture. Left behind, every
      run would add a quiz to `main` — and once there were more than a session's
      worth, `?scope=quiz` would stop putting a seeded quiz first and the specs
      above would start failing for a reason that had nothing to do with them.
      Deleting also exercises the delete flow against a quiz, which nothing else does.
    */
    await page.goto(`/library?kind=quiz&q=${encodeURIComponent(question)}`)
    await cardFor(page, question).first().click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete topic' }).click()
    await expect(page).toHaveURL(/\/library/)
    await expect(cardFor(page, question)).toHaveCount(0)
  })

  test('the sheet refuses a quiz with no marked answer', async ({ page }) => {
    await signInAs(page, 'main')

    await page.getByRole('button', { name: '+ Add topic' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByText('Quiz', { exact: true }).click()

    await sheet.getByLabel('Question').fill(`Does this save? ${unique()}`)
    await sheet.getByLabel('Option 1', { exact: true }).fill('It should not')
    await sheet.getByLabel('Option 2', { exact: true }).fill('It should not either')
    await sheet.getByLabel('Why').fill('Because nothing is marked.')

    /*
      Nothing is marked, and nothing is marked by DEFAULT either — that is the
      assertion. A first option pre-checked would let a distracted save record the
      wrong answer silently, and the quiz would look completely normal until it
      marked you wrong for being right.

      The radios carry `required`, so the browser refuses the submit. The same rule
      is enforced again server-side, where an empty `correct_option` would coerce
      to 0 through `Number('')` — covered by src/lib/domain/topic-form.test.ts,
      which can feed the action shapes a form cannot produce.
    */
    await expect(sheet.getByRole('radio', { name: 'Option 1 is the answer' })).not.toBeChecked()
    await expect(sheet.getByRole('radio', { name: 'Option 2 is the answer' })).not.toBeChecked()

    await sheet.getByRole('button', { name: 'Save quiz' }).click()
    await expect(sheet).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(1)
  })
})
