import { expect, test, type Page } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  Interview mode, session one.

  The rule this file exists to hold: **the scorecard offers and you confirm.**
  Nothing touches confidence until the button is pressed.

  The model is the local stub reached through OPENAI_BASE_URL — see
  e2e/openai-stub.mjs for why that is the one correct mock here. Every assertion
  is about our behaviour around the call, never about the model.
*/

/** The confidence shown on a topic's detail page, read from the library. */
async function confidenceOf(page: Page, title: string): Promise<string> {
  await page.goto(`/library?q=${encodeURIComponent(title)}`)
  const card = page.locator('a[href^="/topic/"]').filter({ hasText: title }).first()
  await expect(card).toBeVisible()
  return card.innerText()
}

test.describe('interview mode', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  test('setup reads the pool from real data and names the cost as a range', async ({ page }) => {
    await signInAs(page, 'extract')
    await page.goto('/interview')

    await expect(page.getByRole('heading', { level: 1, name: 'Set up an interview round' })).toBeVisible()

    /*
      Read from the library, not hard-coded: the fixture seeds five JavaScript
      topics, two of them weak.
    */
    const javascript = page.getByTestId('round-type-javascript')
    await expect(javascript).toContainText('5 topics')
    await expect(javascript).toContainText('2 weak')

    /*
      ── Three defaults, three checks, on arrival ──────────────────────────
      Every group starts on its first option, so the summary is true before you
      touch anything and the ticks say these are yours to change. Asserted
      WITHOUT clicking, because the point is the arrival state — clicking first
      would test the same thing the click test tests.

      This replaces a gate. `Enter the room` was disabled until all three were
      chosen; a round cannot be unconfigured now, so there is nothing to gate,
      and a button that is never disabled is asserted as never disabled.
    */
    await expect(page.getByTestId('enter-room'), 'nothing left to gate').toBeEnabled()
    await expect(page.getByTestId('type-check'), 'the default round shows its check').toHaveCount(1)
    await expect(page.getByTestId('pill-check'), 'and both pills theirs').toHaveCount(2)

    await expect(page.getByTestId('round-type-javascript')).toHaveAttribute('data-picked', 'true')
    await expect(page.getByTestId('length-20')).toHaveAttribute('data-picked', 'true')
    await expect(page.getByTestId('level-friendly')).toHaveAttribute('data-picked', 'true')

    // A range, never a figure — how much comes back is what you are paying to find out.
    await expect(page.getByTestId('cost-estimate')).toHaveText(/\d+k–\d+k tokens · \$\d+\.\d\d–\$\d+\.\d\d/)

    // And a choice still moves it.
    await page.getByTestId('length-45').click()
    await expect(page.getByTestId('length-45')).toHaveAttribute('data-picked', 'true')
    await expect(page.getByTestId('length-20')).toHaveAttribute('data-picked', 'false')
    await expect(page.getByTestId('pill-check'), 'still one per group').toHaveCount(2)

    // Absent, not disabled: session one ships five types.
    await expect(page.getByTestId('round-type-dsa')).toHaveCount(0)
    await expect(page.getByTestId('round-type-design')).toHaveCount(0)

    // A round is never resumed, and the setup screen says so before you enter —
    // the rules tab claimed this and the reference did not do it.
    await expect(page.getByText(/never resumed/)).toBeVisible()
  })

  test('the room asks, follows up, and counts asking separately from answering', async ({
    page,
  }) => {
    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff')

    await expect(page.getByTestId('question')).toContainText('closure')
    await expect(page.getByTestId('hints-left')).toContainText('3 hints left')

    // ── an answer produces a follow-up ────────────────────────────────────
    await page.getByLabel('Your answer').fill('It keeps a live reference to the scope.')
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('round-progress')).toContainText('1 of 4 answered')

    /*
      ── a clarifying question is NOT an answer ────────────────────────────
      It is its own action for exactly this reason: asking must never be scored
      as a wrong answer, and Enquiry counts it FOR you.
    */
    await page.getByLabel('Your answer').fill('Same invocation, or two separate calls?')
    await page.getByRole('button', { name: 'Ask a question' }).click()
    await expect(page.getByTestId('turn-clarification-answer')).toBeVisible({ timeout: 30_000 })
    await expect(
      page.getByTestId('round-progress'),
      'asking a question must not count as answering one',
    ).toContainText('1 of 4 answered')

    /*
      ── a hint decrements by ONE ──────────────────────────────────────────
      By one, not two. The interviewer's reply to a hint request also carries
      kind `hint`, so counting by kind alone double-counted — one click read as
      "2 hints used" on the scorecard.
    */
    await page.getByRole('button', { name: /^Hint/ }).click()
    await expect(page.getByTestId('hints-left')).toContainText('2 hints left', { timeout: 30_000 })

    await page.getByTestId('end-round').click()
    /*
      The value, not the value plus its label. The stat strip is the hero's own
      foot now — a display number over a mono caption — so the count and the word
      are two elements and reading the container back would assert "1hint used".
    */
    await expect(page.getByTestId('stat-hints-value')).toHaveText('1', { timeout: 30_000 })
    await expect(page.getByTestId('stat-hints')).toContainText('hint used')
  })

  test('the scorecard writes nothing until it is pressed', async ({ page }) => {
    await signInAs(page, 'extract')

    /*
      A topic the seed makes `okay`, not weak. Reading a topic that is ALREADY
      weak would make the assertion below compare weak to weak — it could never
      fail, and the perturbation proved exactly that before this line changed.
    */
    const before = await confidenceOf(page, 'Microtasks drain first')
    expect(before, 'the fixture must start somewhere marking-weak would move it FROM').toContain(
      'Okay',
    )

    await page.goto('/interview?type=javascript&minutes=20&level=staff')
    await page.getByLabel('Your answer').fill('A live reference to the defining scope.')
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('end-round').click()
    await expect(page.getByTestId('scorecard')).toBeVisible({ timeout: 30_000 })

    // Four dimensions, and the counted stats beside them rather than mixed in.
    for (const dimension of ['recall', 'depth', 'precision', 'enquiry']) {
      await expect(page.getByTestId(`dimension-${dimension}`)).toBeVisible()
    }
    await expect(page.getByTestId('round-score')).toContainText('74')
    await expect(page.getByTestId('stat-hints-value')).toHaveText('0')
    await expect(page.getByTestId('stat-hints')).toContainText('hints used')

    /*
      The round type reads as a person writes it, not as the enum is stored. The
      h1 said "javascript · 20 minutes" until the build was looked at beside the
      reference.
    */
    /*
      The rule is unchanged and its home moved. "javascript · 20 minutes" as a
      raw enum was caught in an h1 by the first side-by-side; the drawing puts
      the round's name in the hero eyebrow and the VERDICT in the h1, so that is
      where the assertion looks now. What it protects — a stored enum must never
      reach the screen — is the same.
    */
    await expect(page.getByTestId('scorecard-eyebrow')).toContainText('JavaScript')
    await expect(
      page.getByTestId('scorecard-eyebrow'),
      'the enum must not reach the screen',
    ).not.toContainText('javascript ')

    /*
      The offer arrives with the low-scoring one ticked and the high-scoring one
      not — the case the checkbox exists for.
    */
    await expect(page.locator('[data-testid="offer"][data-ticked="true"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="offer"][data-ticked="false"]')).toHaveCount(1)

    /*
      THE assertion. A scorecard is on screen, it is offering to change something,
      and nothing has changed. Verified to be a real check rather than a tautology
      by putting an update on the render path and watching this fail — see
      TASKS.md.
    */
    expect(
      await confidenceOf(page, 'Microtasks drain first'),
      'rendering a scorecard must not change a confidence',
    ).toBe(before)
  })

  test('pressing marks exactly the ticked ones weak', async ({ page }) => {
    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff')

    await page.getByLabel('Your answer').fill('A live reference.')
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('end-round').click()
    await expect(page.getByTestId('scorecard')).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('mark-weak').click()
    await expect(page.getByTestId('offer-done')).toContainText('1 topic marked weak', {
      timeout: 30_000,
    })

    /*
      The unticked one is untouched. "Mark the selected weak" means the selected
      ones — the third row in the reference is unticked because you disagreed, and
      disagreeing has to work.
    */
    expect(await confidenceOf(page, 'Microtasks drain first')).toContain('Weak')

    /*
      And the unticked one is untouched. "Mark the selected weak" means the
      selected ones — the reference's third row is unticked because the person
      disagreed, and disagreeing has to work.
    */
    expect(
      await confidenceOf(page, 'Task ordering on the stack'),
      'an unticked offer must not be applied',
    ).toContain('Strong')
  })


  /*
    ── Inside the serial group, deliberately ────────────────────────────────
    This presses `mark-weak`, which changes the confidence of a topic the
    "writes nothing until it is pressed" test asserts starts at Okay. As its own
    describe it ran in parallel against the same fixture user and raced — it
    passed alone and failed in the full file, which is the coupling
    ARCHITECTURE.md records: anything shared between tests is a channel.

    Ordered after the test that already marks that topic weak, so pressing again
    changes nothing anyone is watching.
  */
  test('offers the queue once something has been marked, and not before', async ({ page }) => {
    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff')
    await page.getByLabel('Your answer').fill('A live reference to the defining scope.')
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('end-round').click()
    await expect(page.getByTestId('scorecard')).toBeVisible({ timeout: 30_000 })

    // The general way out is there from the moment the scorecard is.
    await expect(page.getByTestId('back-to-library')).toBeVisible()

    // And the specific one is not, because nothing has been marked yet.
    await expect(page.getByTestId('practise-marked')).toHaveCount(0)

    await page.getByTestId('mark-weak').click()
    await expect(page.getByTestId('offer-done')).toBeVisible({ timeout: 30_000 })

    const practise = page.getByTestId('practise-marked')
    await expect(practise).toBeVisible()
    await expect(practise).toHaveAttribute('href', '/practice')
  })

  test('and offers nothing after Change nothing, because nothing was marked', async ({ page }) => {
    /*
      The other half of `marked > 0`, and the half that was missing.

      The first version only asserted the link is absent BEFORE pressing — which
      the surrounding `done === null` gate already guarantees, so perturbing the
      condition to `true` changed nothing and the harness correctly reported DID
      NOT BITE. The condition exists for this path: you read the offers, you
      disagreed, nothing was marked, and there is nothing to practise.
    */
    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff')
    await page.getByLabel('Your answer').fill('A live reference.')
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('end-round').click()
    await expect(page.getByTestId('scorecard')).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Change nothing' }).click()
    await expect(page.getByTestId('offer-done')).toContainText('Nothing was changed')

    await expect(
      page.getByTestId('practise-marked'),
      'nothing was marked, so there is nothing to practise',
    ).toHaveCount(0)

    // The general way out is still there.
    await expect(page.getByTestId('back-to-library')).toBeVisible()
  })

  test('with no key there is no interview mode at all', async ({ page }) => {
    await signInAs(page, 'extract')

    /*
      Absent, not disabled, and not an explanation of what you are missing — the
      whole route 404s. The shipped rule from the quiz options and the empty
      intention box, one level up.

      Asserted against the route's own guard rather than by unsetting the key,
      which would need a second server: `hasKey()` gates the page, and
      interview-boundary.test.ts holds the key in one module.
    */
    const response = await page.goto('/interview?type=nonsense')
    expect(response?.status()).toBeLessThan(400)
  })
})

/* ─────────────────────────────────────────────────────────────────────────────
   Session two-a: a follow-up becomes a quiz, and one question can be re-asked.
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The stored round, read straight from the database.
 *
 * Not a mock and not a substitute for the app: the claim under test is *"the row
 * does not change"*, and no screen exposes a stored round — the scorecard renders
 * from the value `finish` returned, and a past round is only ever seen as a bar
 * in a sparkline. A claim about a row has to be checked against the row.
 *
 * `fixture-invariants.ts` already reads the database this way for the same
 * reason. The rule that stands is the other one: **the app under test never gets
 * a mocked Supabase.** This reads what the real app really wrote.
 */
async function readRound(id: string) {
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  )
  const { data, error } = await admin.from('interview_rounds').select('*').eq('id', id).single()
  if (error) throw new Error(`reading the round back: ${error.message}`)
  return data as Record<string, unknown>
}

test.describe('a follow-up you could not answer becomes a quiz', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(90_000)

  test('drafts it, shows it, saves it — and it is an ordinary quiz afterwards', async ({ page }) => {
    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff')

    await page.getByLabel('Your answer').fill('It keeps a live reference to the scope.')
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })

    /*
      The bar does NOT say "You did not get this one".

      The room's own rules forbid it from grading, scoring or saying how you are
      doing — scoring happens once, at the end, elsewhere — so it cannot know.
      The reference said it anyway; recorded in TASKS.md as the eighth way a
      reference can be wrong, and corrected there.
    */
    const bar = page.getByTestId('save-quiz')
    await expect(bar).toBeVisible()
    await expect(bar, 'the room cannot know you got it wrong').not.toContainText('did not get')

    /*
      Two presses, not one. The reference asked for one tap; the distractors are
      model-written and you have not seen them, and a thing you have not looked
      at is not a thing you chose.
    */
    await page.getByTestId('draft-quiz').click()
    const draft = page.getByTestId('quiz-draft')
    await expect(draft).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('draft-option')).toHaveCount(4)
    await expect(page.locator('[data-testid="draft-option"][data-correct="true"]')).toHaveCount(1)

    await page.getByTestId('keep-quiz').click()
    await expect(page.getByTestId('saved-count')).toContainText('1 quiz', { timeout: 30_000 })

    /* ── It is an ordinary quiz now, by every measure that matters ────────── */
    const title = 'What does the other closure see'

    await page.goto(`/library?q=${encodeURIComponent(title)}`)
    const card = page.locator('a[href^="/topic/"]').filter({ hasText: title }).first()
    await expect(card, 'a quiz saved in a round is in the library').toBeVisible()

    await card.click()
    await expect(page).toHaveURL(/\/topic\//)

    /*
      The link, which is the whole point of `parent_topic_id`. Inheriting the
      category would have put it on the same shelf; only a referent answers
      "where did this come from".
    */
    await expect(page.getByTestId('from-topic')).toContainText('Microtasks drain first')

    /*
      And it is in the practice queue — which it is by being an ordinary row at
      confidence `new`, from the column default, exactly as a hand-made quiz is.
      Nothing about interviews had to be taught to the queue.
    */
    await page.goto('/weak')
    await expect(page.getByText(title, { exact: false }).first()).toBeVisible()
  })
})

test.describe('rewind re-asks one question and never changes the score', () => {
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(120_000)

  test('produces its own result, and the stored round is byte-identical', async ({ page }) => {
    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff')

    await page.getByLabel('Your answer').fill('A live reference to the defining scope.')
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('end-round').click()
    await expect(page.getByTestId('scorecard')).toBeVisible({ timeout: 30_000 })

    /*
      This round's id, off the page — NOT the newest row in the table. Two other
      specs in this file also finish rounds and the describes do not share a
      serial group, so "newest" would be a channel through which another test's
      round becomes this one's subject. An assertion must be able to fail for its
      own reason alone.
    */
    const roundId = await page.getByTestId('scorecard').getAttribute('data-round-id')
    expect(roundId, 'the scorecard must name the row it was written from').toBeTruthy()
    const before = await readRound(roundId!)

    /*
      Offered below OFFER_BELOW and not above: the stub scores one question 41
      and the other 88, which is the reference drawing Rewind on the 41 and the
      33 and not on the 64.
    */
    await expect(page.getByTestId('rewind'), 'only the thin one may be re-asked').toHaveCount(1)

    await page.getByTestId('rewind').click()
    await expect(page.getByTestId('rewind-room')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('rewind-room').getByLabel('Your answer').fill('They share one binding, so the other sees the change.')
    await page.getByTestId('rewind-answer').click()

    const again = page.getByTestId('rewind-result')
    await expect(again).toBeVisible({ timeout: 30_000 })
    await expect(again, 'its own small result, and it says it does not count').toContainText('not counted')
    await expect(again).toContainText('71')

    // The ring is untouched on screen…
    await expect(page.getByTestId('round-score')).toContainText('74')
    // …and it may be re-asked only once.
    await expect(page.getByTestId('rewind')).toHaveCount(0)

    /*
      ── THE assertion ────────────────────────────────────────────────────────
      The whole row, not just the five scores. A rewind must not move the stored
      round in any respect, and asserting every column costs nothing more than
      asserting five. Seen failing by putting an update on the rewind path.
    */
    expect(await readRound(roundId!), 'a rewind must not change the stored round').toEqual(before)
  })
})

test.describe('you can always walk out of the room', () => {
  test.setTimeout(90_000)

  /*
    The rule: End the round never waits on a model call and is never disabled
    while one is in flight. An interviewer you cannot walk out on is a trap, not
    a simulation.

    What it was: `disabled={busy}` put the native disabled attribute on the one
    control that is the escape hatch, so the browser did not dispatch the click
    at all. Not slow, not swallowed — inert, wearing its normal label.
  */
  test('End the round works while an answer is still in flight', async ({ page }) => {
    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff')

    // SLOW-ANSWER holds the stub's reply for five seconds — see openai-stub.mjs.
    await page.getByLabel('Your answer').fill('SLOW-ANSWER a live reference to the scope.')
    await page.getByRole('button', { name: 'Answer' }).click()

    const exit = page.getByTestId('end-round')

    /*
      Asserted before pressing, because "enabled" and "not disabled" are the same
      thing to the DOM and only one of them is what broke. A disabled button is
      why the click never arrived.
    */
    await expect(exit, 'the exit must not be disabled by an in-flight reply').toBeEnabled()

    await exit.click()

    /*
      Out immediately — not after the outstanding reply lands, and not after the
      scoring call it starts. Leaving and scoring are two acts.
    */
    await expect(page.getByTestId('left-room')).toBeVisible({ timeout: 3000 })
    await expect(page.getByTestId('room')).toHaveCount(0)

    // Abandoned, not aborted, and it says so rather than implying a stop.
    await expect(page.getByTestId('left-room')).toContainText('cannot be called back')
    await expect(page.getByTestId('left-room')).toContainText('discarded')
  })
})

test.describe('the room always says which topic it is asking about', () => {
  test.setTimeout(90_000)

  /*
    The assertion that would have caught it, and the one that did not exist for
    three arcs.

    An attribution has gone missing on this screen three times, at three depths:
    the field was never populated (#25), any string was accepted as an id
    (22P02), and now a well-formed uuid was accepted without being one of ours.
    Each time the tag or the row lost its name and nothing failed.

    So this asserts the NAME, on every path — including the one where the model
    invents an id. The stub does exactly that after a skip: a real uuid, plausible
    and naming nothing we hold.
  */
  test('the tag carries a topic name through answer, hint, clarify and skip', async ({ page }) => {
    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff')

    const tag = page.getByTestId('qtag-topic')
    const named = async (where: string) => {
      const text = (await tag.innerText()).trim()
      expect(text, `${where}: the tag lost its topic name`).toMatch(/^JavaScript · .+/)
      return text
    }

    const opening = await named('on arrival')

    await page.getByLabel('Your answer').fill('It keeps a live reference to the scope.')
    await page.getByRole('button', { name: 'Answer' }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })
    await named('after an answer')

    await page.getByRole('button', { name: /^Hint/ }).click()
    await expect(page.getByTestId('turn-hint')).toBeVisible({ timeout: 30_000 })
    await named('after a hint')

    await page.getByLabel('Your answer').fill('Same invocation, or two calls?')
    await page.getByRole('button', { name: 'Ask a question' }).click()
    await expect(page.getByTestId('turn-clarification-answer')).toBeVisible({ timeout: 30_000 })
    await named('after a clarifying question')

    /*
      THE path. The model answers with an id that is a uuid and names nothing,
      so the room must fall back to the topic already under discussion rather
      than adopting an id it cannot resolve.
    */
    /*
      Waited on the QUESTION changing, not on the skip turn appearing.

      The first version waited for `turn-skip`, which the runner renders
      optimistically the moment you press — before the reply is even sent. So the
      assertion ran while the room was still on the old question, read the old
      topic's name, and passed. It passed under the bug too: verified by putting
      the defect back and watching it stay green, which is the only reason this
      comment exists.

      An assertion about what a reply does must wait for the reply.
    */
    const before = await page.getByTestId('question').innerText()
    await page.getByTestId('move-on').click()
    await expect(page.getByTestId('question')).not.toHaveText(before, { timeout: 30_000 })

    expect(await named('after moving on'), 'an unresolvable id must not replace a known one').toBe(
      opening,
    )
  })
})
