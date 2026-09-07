import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'

/**
 * A display class passed to Button has to actually take effect.
 *
 * The regression for a shipped bug. `Button` hardcoded `inline-flex`, and Tailwind
 * resolves two utilities in the same group by stylesheet order rather than by the
 * order of the class attribute — so `className="hidden md:inline-flex"` on the
 * library page's `+ Add topic` was silently inert. The button rendered at every
 * width and made /library 106px wider than a 390px screen.
 *
 * The failure mode worth naming: nothing errored. The class was accepted, and the
 * only signal was a page that scrolled sideways on a phone.
 *
 * These assert the class list rather than a computed style, because jsdom has no
 * Tailwind stylesheet — the cascade is Tailwind's behaviour, not something a unit
 * test can observe. The rendered outcome is asserted at 390px in the e2e suite.
 */

const classesOf = (name: string) => screen.getByRole('button', { name }).className.split(/\s+/)

describe('Button and the caller"s display class', () => {
  it('stands its own display down when the caller supplies one', () => {
    render(<Button className="hidden md:inline-flex">Add topic</Button>)
    const classes = classesOf('Add topic')

    expect(classes, 'the hardcoded display must not survive').not.toContain('inline-flex')
    expect(classes, "the caller's display must") .toContain('hidden')
    expect(classes, 'and md:inline-flex still restores it at the breakpoint').toContain(
      'md:inline-flex',
    )
  })

  it('keeps its own display when the caller supplies none', () => {
    render(<Button className="mt-2">Save</Button>)
    const classes = classesOf('Save')

    expect(classes).toContain('inline-flex')
    expect(classes).toContain('mt-2')
  })

  it('keeps its own display for a variant-only override', () => {
    /*
      `md:hidden` alone means "inline-flex, except at md" — the base is still
      wanted, and the variant is emitted after it so it wins unaided. Standing the
      base down here would leave the button with no display at all below md.
    */
    render(<Button className="md:hidden">Sign out</Button>)

    expect(classesOf('Sign out')).toContain('inline-flex')
  })

  it('is not fooled by a display word inside another class', () => {
    // `flex-col` and `table-auto` are not display utilities.
    render(<Button className="flex-col table-auto">Filters</Button>)

    expect(classesOf('Filters')).toContain('inline-flex')
  })

  it('still carries its variant, size and block classes either way', () => {
    render(
      <Button variant="primary" size="lg" block className="hidden">
        Primary
      </Button>,
    )
    const classes = classesOf('Primary')

    expect(classes).not.toContain('inline-flex')
    expect(classes).toContain('bg-accent')
    expect(classes).toContain('w-full')
  })
})
