import { expect, test } from '@playwright/test'
import { signInAs } from './auth-state'

/*
  The claim the interview scale's scoping rests on, measured rather than asserted.

  `interview-boundary.test.ts` proves the scale is not NAMED outside the interview
  tree. That is a guard on the source, and a guard can only ever say "nobody has
  done this yet". This says something stronger and different: if somebody does,
  **nothing happens** — the element gets no colour rather than the wrong one.

  Both halves use the SAME class from the SAME stylesheet. `bg-[var(--volt)]` is
  compiled into the bundle because `app/(interview)/interview/page.tsx` uses it,
  so the class exists on every page. What differs is only whether the element is
  inside `[data-mode='interview']`, which is where `--volt` is defined.

  This is the test that would have caught the leak the reference could not show:
  `interview-reference.html` puts `:focus-visible{outline:2px solid var(--volt)}`
  at top level, invisible in a file where everything IS interview mode. See
  ARCHITECTURE.md.
*/

const VIOLET = 'rgb(79, 70, 229)'

/** What a browser reports for "no background colour was applied". */
const NOTHING = ['rgba(0, 0, 0, 0)', 'transparent']

test.describe('the interview scale is scoped by the cascade', () => {
  test('inside the interview subtree it resolves to the scale', async ({ page }) => {
    await signInAs(page, 'extract')
    await page.goto('/interview')

    /*
      Injected into the page's own `[data-mode='interview']` subtree rather than
      measured off a shipped element. Symmetric with the outside case below, and
      it means this test cannot break when a screen changes — it is about the
      cascade, not about any particular swatch.
    */
    const colour = await page.evaluate(() => {
      const host = document.querySelector('[data-mode="interview"]')
      if (host === null) return 'no interview subtree on the page'
      const el = document.createElement('div')
      el.className = 'bg-[var(--volt)]'
      host.appendChild(el)
      const measured = getComputedStyle(el).backgroundColor
      el.remove()
      return measured
    })

    expect(colour, 'inside the room, --volt is defined and the class paints violet').toBe(VIOLET)
  })

  test('outside it, the same class paints NOTHING rather than the wrong colour', async ({
    page,
  }) => {
    await signInAs(page, 'extract')
    await page.goto('/library')

    /*
      The identical class, on a page with no `data-mode`. If the scale were in
      `@theme` this would be violet, and a topic card could wear a 0–100 scale by
      typing eight characters.
    */
    const outside = await page.evaluate(() => {
      const el = document.createElement('div')
      el.className = 'bg-[var(--volt)]'
      document.body.appendChild(el)
      const colour = getComputedStyle(el).backgroundColor
      el.remove()
      return colour
    })

    expect(
      NOTHING,
      `outside the subtree --volt must not resolve; the browser reported ${outside}`,
    ).toContain(outside)

    /*
      And the class really is in the bundle — otherwise this test would pass by
      measuring an element with no rule at all, which is the vacuous-guard
      failure recorded in ARCHITECTURE.md. Proved by putting the SAME element
      inside a data-mode subtree on this very page and watching it turn violet.
    */
    const inside = await page.evaluate(() => {
      const host = document.createElement('div')
      host.setAttribute('data-mode', 'interview')
      const el = document.createElement('div')
      el.className = 'bg-[var(--volt)]'
      host.appendChild(el)
      document.body.appendChild(host)
      const colour = getComputedStyle(el).backgroundColor
      host.remove()
      return colour
    })

    expect(
      inside,
      'the rule exists in the bundle — so the transparent result above is scoping, not a missing class',
    ).toBe(VIOLET)
  })
})
