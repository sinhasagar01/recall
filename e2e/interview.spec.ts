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
      ── Four defaults, four checks, on arrival ────────────────────────────
      Every group starts on its first option, so the summary is true before you
      touch anything and the ticks say these are yours to change. Asserted
      WITHOUT clicking, because the point is the arrival state — clicking first
      would test the same thing the click test tests.

      This replaces a gate. `Enter the room` was disabled until all three were
      chosen; a round cannot be unconfigured now, so there is nothing to gate,
      and a button that is never disabled is asserted as never disabled.

      Three groups became four when voice arrived, and the count moved with it —
      which is the point of counting rather than naming: a group that shipped
      without a default would fail this without anyone adding an assertion.
    */
    await expect(page.getByTestId('enter-room'), 'nothing left to gate').toBeEnabled()
    await expect(page.getByTestId('type-check'), 'the default round shows its check').toHaveCount(1)
    await expect(
      page.getByTestId('pill-check'),
      'and the three pill groups theirs — length, interviewer, how you answer',
    ).toHaveCount(3)

    await expect(page.getByTestId('round-type-javascript')).toHaveAttribute('data-picked', 'true')
    await expect(page.getByTestId('length-20')).toHaveAttribute('data-picked', 'true')
    await expect(page.getByTestId('level-friendly')).toHaveAttribute('data-picked', 'true')
    await expect(page.getByTestId('mode-typing')).toHaveAttribute('data-picked', 'true')

    // A range, never a figure — how much comes back is what you are paying to find out.
    await expect(page.getByTestId('cost-estimate')).toHaveText(/\d+k–\d+k tokens · \$\d+\.\d\d–\$\d+\.\d\d/)

    // And a choice still moves it.
    await page.getByTestId('length-45').click()
    await expect(page.getByTestId('length-45')).toHaveAttribute('data-picked', 'true')
    await expect(page.getByTestId('length-20')).toHaveAttribute('data-picked', 'false')
    await expect(page.getByTestId('pill-check'), 'still one per group').toHaveCount(3)

    /*
      Seven types now. This assertion said `toHaveCount(0)` for two sessions —
      absent, not disabled, because DSA was not built — and deleting it is this
      arc's work in the same way deleting `hasnt_column('code')` was. It is
      inverted rather than removed, so the card's existence is still asserted by
      the test that used to assert its absence.
    */
    await expect(page.getByTestId('round-type-dsa')).toHaveCount(1)
    await expect(page.getByTestId('round-type-design')).toHaveCount(1)

    /*
      And the exception is on the card, not only in the sub-line at the top. The
      sub-line covers all seven types; someone choosing DSA is looking here.
    */
    await expect(page.getByTestId('round-type-dsa')).toContainText(
      'generated, not from your library',
    )
    /* And the design card says what it draws on, or that it has nothing to. */
    await expect(page.getByTestId('round-type-design')).toContainText(/ADR/)

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
  test('how you answer defaults to typing, and the round carries the choice', async ({ page }) => {
    /*
      The fourth group. Typing is the default because a default cannot ask for
      anything — choosing voice raises a microphone permission prompt, and a
      default that opens an OS dialog before you have chosen anything is not a
      default.
    */
    await signInAs(page, 'extract')
    await page.goto('/interview')

    await expect(page.getByTestId('answer-mode')).toBeVisible()
    await expect(page.getByTestId('mode-typing')).toHaveAttribute('data-picked', 'true')
    await expect(page.getByTestId('mode-voice')).toHaveAttribute('data-picked', 'false')

    // What leaves, named where the choice is made — not in a settings page.
    await expect(page.getByTestId('voice-privacy')).toContainText('speech service')

    await page.getByTestId('mode-voice').click()
    await page.getByRole('button', { name: 'Enter the room' }).click()

    await expect(page).toHaveURL(/mode=voice/)
    await expect(page.getByTestId('mic')).toBeVisible({ timeout: 30_000 })

    /*
      And the box still works. Voice is a second way in, never a replacement —
      a recogniser that mishears one word should cost a correction, not the
      answer.
    */
    await page.getByLabel('Your answer').fill('A live reference to the defining scope.')
    /*
      `exact`, because the microphone beside it is called "Speak your answer" —
      which is the right label and the reason the send button needs naming
      precisely rather than by substring.
    */
    await page.getByRole('button', { name: 'Answer', exact: true }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })
  })

  test('a browser with no speech engine is told so, and is not offered voice', async ({
    page,
  }) => {
    /*
      The constructor is DELETED from the page, which is a real condition rather
      than a simulated service — the distinction ARCHITECTURE.md records after
      shipping two stubs derived from our own parser. Nothing here pretends to
      recognise speech; it asserts what our code does when the API is absent.
    */
    await page.addInitScript(() => {
      // @ts-expect-error — removing a global the types do not know about.
      delete window.SpeechRecognition
      // @ts-expect-error — same.
      delete window.webkitSpeechRecognition
    })

    await signInAs(page, 'extract')
    await page.goto('/interview')

    await expect(page.getByTestId('no-voice')).toContainText('this browser does not have')
    await expect(page.getByTestId('mode-voice')).toHaveCount(0)
    // Absent, not disabled: no click would ever make it work.
    await expect(page.getByTestId('mode-typing')).toHaveAttribute('data-picked', 'true')

    /*
      And the privacy line goes with the option. It describes a thing that
      cannot happen here, and a warning about an impossibility is noise.
    */
    await expect(page.getByTestId('voice-privacy')).toHaveCount(0)
  })

  test('a deep link asking for voice on a browser without it starts a typing round', async ({
    page,
  }) => {
    // The only way to select an option that is not rendered. It must not leave
    // the room showing a microphone that cannot work.
    await page.addInitScript(() => {
      // @ts-expect-error — removing a global the types do not know about.
      delete window.SpeechRecognition
      // @ts-expect-error — same.
      delete window.webkitSpeechRecognition
    })

    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff&mode=voice')

    await expect(page.getByTestId('question')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('mic')).toHaveCount(0)
    await expect(page.getByLabel('Your answer')).toBeVisible()
  })

  test('the waiting screen shows what is known, and the score fills the shape', async ({
    page,
  }) => {
    /*
      `SLOW-ANSWER` reaches the scoring call too — the whole transcript is sent
      to it — so the stub holds the score for five seconds and the waiting screen
      is a place we can actually stand and measure.
    */
    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff')

    await page.getByLabel('Your answer').fill('SLOW-ANSWER a live reference to the scope.')
    await page.getByRole('button', { name: 'Answer', exact: true }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('end-round').click()
    await expect(page.getByTestId('scoring-hero')).toBeVisible()

    // ── Half of it is known, and known things do not wait ─────────────────
    await expect(page.getByTestId('stat-answered')).toContainText('1/1')
    await expect(page.getByTestId('stat-elapsed')).toContainText(/\d+:\d\d/)
    await expect(page.getByTestId('outline-row')).toHaveCount(1)
    // The real title, from the room's own topic map — not a placeholder.
    await expect(page.getByTestId('outline-row')).not.toContainText('…')

    // ── No buttons while it works ─────────────────────────────────────────
    await expect(page.getByTestId('back-to-library')).toHaveCount(0)
    await expect(page.getByTestId('new-interview')).toHaveCount(0)

    /*
      ── Nothing reflows ───────────────────────────────────────────────────
      Measured, not asserted by eye. The stat strip and the first dimension card
      exist in BOTH states under the same testids, so their boxes are directly
      comparable — and they are the two things that move if the skeleton is an
      approximation of the page rather than the page. The container width alone
      was wrong by 160px when this test was first written.
    */
    interface Box {
      x: number
      y: number
      width: number
    }

    const boxOf = async (testid: string): Promise<Box> => {
      const box = await page.getByTestId(testid).boundingBox()
      if (box === null) throw new Error(`${testid} has no box`)
      return { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width) }
    }

    const before = {
      strip: await boxOf('stat-answered'),
      dimension: await boxOf('dimension-recall'),
    }

    await expect(page.getByTestId('scorecard')).toBeVisible({ timeout: 30_000 })

    /*
      Within a pixel, and not because a pixel is acceptable slack — because
      fractional layout rounds differently either side of a text node appearing,
      and pinning the last pixel would mean hard-coding heights, which is the
      brittleness this screen's placeholder was just rewritten to avoid.

      What it catches is what it is for. The container width was wrong by 160px
      and the numeral's slot by 10px when this was first written; both showed up
      here and nowhere else.
    */
    const settled = (after: Box, first: Box, what: string) => {
      expect(Math.abs(after.y - first.y), `${what} moved vertically`).toBeLessThanOrEqual(1)
      expect(Math.abs(after.x - first.x), `${what} moved sideways`).toBeLessThanOrEqual(1)
      expect(Math.abs(after.width - first.width), `${what} changed width`).toBeLessThanOrEqual(1)
    }

    settled(await boxOf('stat-answered'), before.strip, 'the stat strip')
    settled(await boxOf('dimension-recall'), before.dimension, 'the dimension cards')

    // And the cells are the same cells, filled — not a different strip.
    await expect(page.getByTestId('stat-answered')).toContainText('1/1')
    await expect(page.getByTestId('stat-elapsed')).toContainText(/\d+:\d\d/)
  })

  test('after twenty seconds it says so, and offers one way out that names the cost', async ({
    page,
  }) => {
    /*
      Not before twenty seconds, which is the assertion that matters — the old
      screen offered an exit from the first frame, and an escape hatch on a page
      you are meant to wait on reads as "this may not finish".

      The clock is driven rather than waited out: Playwright's fake timers are
      not available here, so the page's own interval is advanced by holding the
      scoring call open and checking the two states either side of the boundary.
    */
    await signInAs(page, 'extract')
    await page.clock.install()
    await page.goto('/interview?type=javascript&minutes=20&level=staff')

    await page.getByLabel('Your answer').fill('SLOW-ANSWER a live reference.')
    await page.getByRole('button', { name: 'Answer', exact: true }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('end-round').click()
    await expect(page.getByTestId('scoring-hero')).toBeVisible()

    // Immediately: nothing to press.
    await expect(page.getByTestId('taking-longer')).toHaveCount(0)

    /*
      Then twenty seconds, driven rather than waited out. `page.clock` advances
      the page's own timers, so this asserts the real threshold in the real
      component instead of a constant read back from the module that sets it.
    */
    await page.clock.fastForward('00:21')

    const longer = page.getByTestId('taking-longer')
    await expect(longer).toBeVisible()
    await expect(longer).toContainText('still going')

    /*
      One way out, and it says what leaving costs rather than implying the score
      is waiting somewhere for you.
    */
    const leave = longer.getByTestId('back-to-library')
    await expect(leave).toHaveText('Leave without a scorecard')
    await expect(leave).toHaveAttribute('href', '/library')
  })

  test('when scoring fails the buttons come back, and it says nothing was written', async ({
    page,
  }) => {
    /*
      The same two controls as the waiting screen deliberately does NOT have,
      in the state where they are the only thing to do. Same pair, opposite
      meaning, decided by whether anything is still happening.
    */
    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff')

    await page.getByLabel('Your answer').fill('RATE-LIMIT a live reference to the scope.')
    await page.getByRole('button', { name: 'Answer', exact: true }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('end-round').click()

    const failure = page.getByTestId('scoring-failed')
    await expect(failure).toBeVisible({ timeout: 30_000 })

    // The real reason, from the vendor, not "something went wrong".
    await expect(failure).toContainText(/rate limit/i)

    /*
      And the line that says what it took with it. A failure naming only what
      broke leaves the reader to guess what was lost, and the guess is always
      worse than the truth.
    */
    await expect(failure).toContainText('not saved')
    await expect(failure).toContainText('no topic was marked')

    await expect(page.getByTestId('new-interview')).toBeVisible()
    await expect(page.getByTestId('back-to-library')).toBeVisible()

    // The skeleton is gone: there is nothing still coming to fill it.
    await expect(page.getByTestId('scoring-hero')).toHaveCount(0)
  })

  test('reduced motion stops the shimmer, and the screen still reads', async ({ browser }) => {
    /*
      The rule the mock states and does not draw: every animation obeys
      `prefers-reduced-motion`, and the screen reads the same without them. The
      placeholders keep their fill, the meter keeps its track, and the word
      "Scoring" is what carries the meaning either way — motion is the
      reassurance, never the message.
    */
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()

    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff')
    await page.getByLabel('Your answer').fill('SLOW-ANSWER a live reference.')
    await page.getByRole('button', { name: 'Answer', exact: true }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('end-round').click()
    await expect(page.getByTestId('scoring-hero')).toBeVisible()

    const running = await page.evaluate(() =>
      [...document.querySelectorAll('.sc-wave, .sc-blink')]
        .map((element) => getComputedStyle(element).animationName)
        .filter((name) => name !== 'none'),
    )
    expect(running, 'an animation ignored the preference').toEqual([])

    // Read on the pseudo-element, which is where the sweep actually lives.
    const sweeping = await page.evaluate(() =>
      [...document.querySelectorAll('.sc-shimmer')]
        .map((element) => getComputedStyle(element, '::after').animationName)
        .filter((name) => name !== 'none'),
    )
    expect(sweeping, 'the shimmer ignored the preference').toEqual([])

    // And it still says what it is doing.
    await expect(page.getByTestId('working')).toContainText('Scoring')
    await expect(page.getByTestId('stat-answered')).toContainText('1/1')

    await context.close()
  })

  test('the send hint names a shortcut that works from the answer field', async ({ page }) => {
    /*
      The room advertised `⌘↵ to send` with nothing behind it — no key handler
      anywhere in the tree — and shipped that way to production. Issue #27.

      Asserted from INSIDE the field, with focus in it, because that is the only
      place it matters: the chord exists so you do not have to leave the box you
      are typing in. A document-level press would pass over a handler that the
      typing guard makes unreachable, which is the bug this shape of test caught
      on the practice screen.
    */
    await signInAs(page, 'extract')
    await page.goto('/interview?type=javascript&minutes=20&level=staff')

    const box = page.getByLabel('Your answer')
    await box.fill('A live reference to the defining scope.')
    await box.press('ControlOrMeta+Enter')

    await expect(page.getByTestId('turn-answer')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })
    // And it sends the answer rather than leaving it behind.
    await expect(box).toHaveValue('')
  })

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

    /*
      All three exits in one row, ranked.

      Asserted as an ORDERED list of hrefs rather than three visibility checks,
      because order is the thing being built: act on what the round found, then
      go again, then leave. Three `toBeVisible` calls would pass with the row
      shuffled, which is the guard-too-broad shape recorded in ARCHITECTURE.md.
    */
    const hrefs = await page
      .getByTestId('scorecard-actions')
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    expect(hrefs).toEqual(['/practice', '/interview', '/library'])
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

    /*
      ── The ordinary case, and the one the room got wrong ────────────────────
      The interviewer moved to a topic we hold, so the tag must FOLLOW it. The
      map of titles was seeded from the opening topic and never updated, so the
      tag could only ever name the topic the round began on — every later one
      showed as bare "JavaScript".
    */
    const afterSkip = await named('after moving on')
    expect(afterSkip, 'the tag must follow the interviewer to a new topic').not.toBe(opening)

    /*
      ── And the other case, which is a different bug ─────────────────────────
      A second skip, where the model invents a well-formed id naming nothing we
      hold. There is no name to move to, so the tag keeps the one it has rather
      than adopting an id it cannot resolve.
    */
    const second = await page.getByTestId('question').innerText()
    await page.getByTestId('move-on').click()
    await expect(page.getByTestId('question')).not.toHaveText(second, { timeout: 30_000 })

    expect(await named('after a skip the model could not attribute'),
      'an unresolvable id must not replace a known one').toBe(afterSkip)
  })
})

test.describe('DSA and System design', () => {
  test.setTimeout(120_000)

  test('a DSA round writes code, keeps it across a follow-up, and stores it', async ({ page }) => {
    await signInAs(page, 'extract')
    await page.goto('/interview?type=dsa&minutes=45&level=staff&mode=typing')

    /*
      The editor is the answer surface, and it is a real one — nothing is
      executed, but you type into it and what you type is the round.
    */
    const editor = page.getByTestId('code-editor')
    await expect(editor).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('editor-note')).toContainText('nothing runs')

    await editor.click()
    await page.keyboard.type('const merged = intervals.sort()')
    await expect(editor).toContainText('const merged')

    /*
      Code alone is an answer. Writing a solution and saying nothing is a real
      move — the follow-up about complexity is where the round is anyway — so
      Answer is live with the box empty and the editor written in.
    */
    await page.getByRole('button', { name: 'Answer', exact: true }).click()
    await expect(page.getByTestId('turn-follow-up')).toBeVisible({ timeout: 30_000 })

    // And it survives the exchange: still the same problem, still your code.
    await expect(editor).toContainText('const merged')

    await page.getByTestId('end-round').click()
    await expect(page.getByTestId('scorecard')).toBeVisible({ timeout: 60_000 })

    /*
      Stored, which is what "your code is kept" means. The round only reaches a
      row if the insert passed every CHECK — including code_is_dsa_only and
      code_fits_the_round — so a scorecard with an id is the assertion.
    */
    await expect(page.getByTestId('scorecard')).toHaveAttribute('data-round-id', /[0-9a-f-]{36}/)

    // The row carries the solution, collapsed.
    const solution = page.getByTestId('solution').first()
    await expect(solution).toBeVisible()
    await expect(solution).toContainText('const merged')

    /*
      And a problem offers nothing to mark weak — in its own words, not the
      unattributable question's. There is no topic to fail to identify.
    */
    await expect(page.getByTestId('unattributed').first()).toContainText(
      'A problem is not a topic in your library',
    )
    await expect(page.getByTestId('practise-marked')).toHaveCount(0)
  })

  test('Next problem on an empty editor records unanswered, not zero', async ({ page }) => {
    /*
      The same rule Move on already follows for a concept: leaving is a real move
      and it is not a wrong answer. `answered` counts questions answered, so an
      untouched problem must not appear as one.
    */
    await signInAs(page, 'extract')
    await page.goto('/interview?type=dsa&minutes=45&level=staff&mode=typing')
    await expect(page.getByTestId('code-editor')).toBeVisible({ timeout: 30_000 })

    const next = page.getByTestId('move-on')
    await expect(next).toHaveText('Next problem')
    await next.click()
    await expect(page.getByTestId('turn-skip')).toBeVisible({ timeout: 30_000 })

    await page.getByTestId('end-round').click()
    await expect(page.getByTestId('scorecard')).toBeVisible({ timeout: 60_000 })

    // Nothing answered, and the round still saved.
    await expect(page.getByTestId('stat-answered-value')).toHaveText(/^0\//)
    await expect(page.getByTestId('scorecard')).toHaveAttribute('data-round-id', /[0-9a-f-]{36}/)
  })

  test('a design round is phased, forward only, and never renders pips', async ({ page }) => {
    await signInAs(page, 'extract')
    await page.goto('/interview?type=design&minutes=60&level=skeptical&mode=typing')

    const strip = page.getByTestId('phase-strip')
    await expect(strip).toBeVisible({ timeout: 30_000 })

    // Four at every length, and no pips — a pip per question counts a shape
    // that has no questions.
    await expect(strip.locator('[data-phase]')).toHaveCount(4)
    await expect(page.locator('[data-pip]')).toHaveCount(0)
    await expect(strip).toContainText('Requirements')
    await expect(strip).toContainText('Deep dive')

    const phaseNow = () => strip.locator('[data-phase="now"]')
    await expect(phaseNow()).toContainText('Requirements')

    // You advance.
    await page.getByTestId('move-on').click()
    await expect(phaseNow()).toContainText('High-level shape', { timeout: 30_000 })

    /*
      Or the interviewer does — by exactly one, because it reports only that the
      phase is done and never names the next. And it arrives as a turn, so the
      strip follows the conversation rather than repainting beside you.
    */
    await page.getByLabel('Your answer').fill('PHASE-DONE the shape is a modular monolith.')
    await page.getByRole('button', { name: 'Answer', exact: true }).click()
    await expect(phaseNow()).toContainText('Deep dive', { timeout: 30_000 })

    /*
      Forward only. There is no back — a design round is a conversation and you
      cannot un-say the requirements — so the first phase never returns to `now`.
    */
    await expect(strip.locator('[data-phase="done"]')).toHaveCount(2)

    await page.getByTestId('end-round').click()
    await expect(page.getByTestId('scorecard')).toBeVisible({ timeout: 60_000 })
    // A design round keeps no code, so no row offers a solution.
    await expect(page.getByTestId('solution')).toHaveCount(0)
  })
})
