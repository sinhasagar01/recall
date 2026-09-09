import { expect, test } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  The mock draws these at 390pt. --breakpoint-md is 860px, so everything flips at
  once: below it the rail is gone and the tab bar is the navigation.
*/
test.use({ viewport: { width: 390, height: 844 } })

const uniqueTitle = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function seedTopic(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('link', { name: 'Add topic' }).click()
  await page.getByRole('textbox', { name: 'Topic', exact: true }).fill(title)
  await page.getByLabel('Definition').fill('A topic to see on a phone.')
  await page.getByRole('button', { name: 'Save topic' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
}

test('the rail is gone and the tab bar replaces it', async ({ page }) => {
  await signInAs(page, 'main')

  await expect(page.locator('aside')).toBeHidden()

  const tabbar = page.getByRole('navigation', { name: 'Main' })
  await expect(tabbar.getByRole('link', { name: 'Library' })).toBeVisible()
  await expect(tabbar.getByRole('link', { name: 'Practice' })).toBeVisible()
  await expect(tabbar.getByRole('link', { name: 'Add topic' })).toBeVisible()

  // Two destinations plus the FAB — Weak is a filter chip, not a third tab.
  await expect(tabbar.getByRole('link')).toHaveCount(3)
})

test('every destination is reachable on a phone', async ({ page }) => {
  await signInAs(page, 'main')
  await seedTopic(page, uniqueTitle('Phone'))

  // Practice, from the tab bar.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Practice' }).click()
  await expect(page).toHaveURL(/\/practice/)

  // Practice has no tab bar by design, so leaving it uses the screen's own exit.
  await page.getByRole('link', { name: /End session/ }).click()
  await expect(page).toHaveURL(/\/library/)

  // Weak — a filter chip on Library, per DESIGN.md, not a destination.
  await page.getByRole('button', { name: /^Weak/ }).click()
  await expect(page).toHaveURL(/quick=needs-review/)

  // Sign out — now inside the More sheet, since arc 4 replaced the inline
  // cluster with one link. The destination is the same; the route to it changed.
  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
})

test('the FAB opens the add sheet, full screen', async ({ page }) => {
  await signInAs(page, 'main')

  await page.getByRole('link', { name: 'Add topic' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add topic' })
  await expect(sheet).toBeVisible()

  // Full screen, not a side panel: it spans the viewport width.
  /*
    Polled, not measured once. The sheet slides in from the right edge now, so a
    single boundingBox() taken the moment it is visible reads a position it is
    still travelling through — this asserted `x <= 1` and got 133.

    What the test is about is unchanged: at 390px the panel is the full width of
    the screen, flush to the left edge. That is a claim about where it COMES TO
    REST, and polling is how you assert a resting position on something that
    moves.
  */
  await expect
    .poll(async () => Math.round((await sheet.boundingBox())!.x))
    .toBeLessThanOrEqual(1)

  const box = await sheet.boundingBox()
  expect(box!.width).toBeGreaterThanOrEqual(390 - 1)
})

test('the three selects collapse behind one Filters chip', async ({ page }) => {
  await signInAs(page, 'main')
  await seedTopic(page, uniqueTitle('Filterable'))

  // Three popovers side by side do not fit at 390pt, so they are not there.
  await expect(page.getByRole('button', { name: /^Category:/ })).toBeHidden()

  await page.getByRole('button', { name: 'Filters' }).click()
  const sheet = page.getByRole('dialog', { name: 'Filters' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: /^Category:/ })).toBeVisible()
  await expect(sheet.getByRole('button', { name: /^Confidence:/ })).toBeVisible()
  await expect(sheet.getByRole('button', { name: /^Difficulty:/ })).toBeVisible()
})

test('practice hides the tab bar entirely', async ({ page }) => {
  await signInAs(page, 'main')
  await seedTopic(page, uniqueTitle('Focus'))

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Practice' }).click()
  await expect(page).toHaveURL(/\/practice/)

  // The one distraction-free screen.
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
})

test('signing out works from a phone', async ({ page }) => {
  await signInAs(page, 'main')

  /*
    Through the More sheet. Arc 4 replaced the wrapping account cluster with a
    single link, so this is the same assertion — signing out works from a phone —
    reached the way a person now reaches it.
  */
  await page.getByRole('button', { name: 'More' }).click()
  const sheet = page.getByRole('dialog', { name: 'More' })
  await sheet.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/sign-in/)
})

test('focus and keyboard behaviour hold at mobile width', async ({ page }) => {
  await signInAs(page, 'main')

  const fab = page.getByRole('link', { name: 'Add topic' })
  await fab.click()
  await expect(page.getByRole('dialog', { name: 'Add topic' })).toBeVisible()

  // The sheet has a real close control now, not just Escape.
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

/*
  The add sheet at phone size: Save is reachable on arrival.

  It was not. At 390x844 the sheet's content is 951px tall, so the footer — which
  used to sit at the bottom of one scrolling box — put Save at y=862 against an
  844px viewport. The primary action of the primary form opened 18px below the
  fold, before a single character was typed.

  Asserted as "in the viewport", not as "visible": Playwright's toBeVisible() is
  satisfied by a rendered element with a box, whether or not it is on screen, and
  would have passed throughout.
*/
test.describe('the add sheet on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Save is in the viewport when the sheet opens, with every field present', async ({ page }) => {
    await signInAs(page, 'main')
    await page.goto('/library?add=1')

    const sheet = page.getByRole('dialog')
    await expect(sheet).toBeVisible()

    // Nothing was removed to achieve this. Every field the desktop sheet has.
    await expect(sheet.getByRole('textbox', { name: 'Topic', exact: true })).toBeVisible()
    await expect(sheet.getByLabel('Definition')).toBeVisible()
    await expect(sheet.getByLabel(/Mental model/)).toHaveCount(1)
    await expect(sheet.getByText('Category', { exact: true })).toHaveCount(1)
    await expect(sheet.getByText(/^Tags/)).toHaveCount(1)
    await expect(sheet.getByText(/^Visual/)).toHaveCount(1)

    const save = sheet.getByRole('button', { name: 'Save topic' })
    const box = await save.boundingBox()
    const viewport = page.viewportSize()!.height
    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport)

    /*
      And it stays there once the body scrolls, which is the actual fix — the
      footer is pinned rather than the content being made to fit.
    */
    await page.mouse.move(195, 400)
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(300)
    const after = await save.boundingBox()
    expect(after!.y + after!.height).toBeLessThanOrEqual(viewport)

    // It is a real control at that position, not merely a box in the layout.
    await sheet.getByRole('textbox', { name: 'Topic', exact: true }).fill(`Pinned footer ${Date.now()}`)
    await sheet.getByLabel('Definition').fill('Saved without scrolling to find the button.')
    await save.click()
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15_000 })
  })
})

test('the library does not scroll sideways on a phone', async ({ page }) => {
  /*
    The regression for a shipped bug. `+ Add topic` carries `hidden md:inline-flex`,
    but `Button` hardcoded `inline-flex` and Tailwind resolves two utilities in the
    same group by stylesheet order rather than class-attribute order — so the class
    was silently inert, the button rendered at every width, and /library was 106px
    wider than a 390px screen.

    Asserted on the document rather than on the button, because the symptom is what
    a person experiences: a page that slides under the thumb. A later change that
    reintroduces the overflow by some other route should fail here too.
  */
  await signInAs(page, 'main')
  // The head's account surface is one More link since arc 4.
  await page.getByRole('button', { name: 'More' }).waitFor()

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))

  expect(scrollWidth, 'the library page is wider than the phone it is on').toBe(clientWidth)

  // And the desktop-only action really is absent, not merely off-screen.
  await expect(page.getByRole('button', { name: '+ Add topic' })).toHaveCount(0)
})

test.describe('the phone knows which tab you are on', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  /*
    The tab bar had no selected state: Library and Practice rendered identically
    whichever one you were on, so the only navigation a phone has could not
    answer "where am I". The rail has said this since phase 12.
  */
  test('exactly one tab is selected, and it is the one you are on', async ({ page }) => {
    await signInAs(page, 'few')

    await page.goto('/library')
    await expect(page.getByTestId('tab-bar')).toBeVisible()

    /*
      EXACTLY one. "At least one" passes for a bar that marks every tab, which
      carries the same amount of information as marking none.
    */
    const selected = page.locator('[data-testid="tab-bar"] [data-current="true"]')
    await expect(selected).toHaveCount(1)
    await expect(selected).toContainText('Library')

    // The indicator is the signal that is not colour, so it is asserted apart.
    await expect(page.getByTestId('tab-indicator')).toHaveCount(1)
    // And this is the only one a screen reader gets.
    await expect(page.locator('[data-testid="tab-bar"] [aria-current="page"]')).toHaveCount(1)
  })

  test('and marks nothing on a page that is not a tab', async ({ page }) => {
    /*
      The other half, and the one that stops "mark everything" from passing.
      /phases is in the group so the bar renders, and it is not a tab
      destination — so the correct number of selected tabs there is zero.

      Note what this cannot check: /practice is in its own route group and
      renders no tab bar at all, by the decision recorded in the layout — that
      screen is meant to have nothing to glance at. So the Practice tab can never
      show as current. The bar answers "am I on Library" rather than "which of
      the two am I on", and that is a consequence of the group split rather than
      of this change.
    */
    await signInAs(page, 'few')
    await page.goto('/phases')

    await expect(page.getByTestId('tab-bar')).toBeVisible()
    await expect(page.locator('[data-testid="tab-bar"] [data-current="true"]')).toHaveCount(0)
    await expect(page.getByTestId('tab-indicator')).toHaveCount(0)
  })

  test('a topic counts as the library, the way the rail already says it does', async ({ page }) => {
    await signInAs(page, 'few')
    const first = page.locator('a[href^="/topic/"]').first()
    await first.waitFor()
    await first.click()
    await expect(page).toHaveURL(/\/topic\//)

    const selected = page.locator('[data-testid="tab-bar"] [data-current="true"]')
    await expect(selected).toHaveCount(1)
    await expect(selected).toContainText('Library')
  })
})

test.describe('the More sheet arrives without moving the page', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  /*
    The sheet had no animation of any kind — in the DOM one frame, painted the
    next. It has one now, and an animation that slides is exactly the kind that
    can push the document sideways for 260ms: a full-width panel translated in
    from an edge, inside a scrim that does not clip.

    So this measures the page across the whole animation rather than after it.
  */
  test('no horizontal overflow and no vertical shift while it opens', async ({ page }) => {
    await signInAs(page, 'few')

    const metrics = () =>
      page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        scrollY: window.scrollY,
        headingTop: Math.round(document.querySelector('h1')!.getBoundingClientRect().top),
      }))

    const before = await metrics()
    expect(before.overflow, 'the page must not scroll sideways to begin with').toBeLessThanOrEqual(0)

    await page.getByTestId('more-trigger').click()

    /*
      Sampled DURING the 260ms, not after it. A slide that overflows has usually
      finished by the time an assertion that waits for the dialog runs.
    */
    for (let i = 0; i < 5; i += 1) {
      const during = await metrics()
      expect(during.overflow, `frame ${i}: the sheet pushed the page sideways`).toBeLessThanOrEqual(0)
      expect(during.scrollY, `frame ${i}: the page scrolled`).toBe(before.scrollY)
      expect(during.headingTop, `frame ${i}: the page moved under the sheet`).toBe(before.headingTop)
      await page.waitForTimeout(60)
    }

    await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible()
    expect(await metrics()).toEqual(before)
  })
})
