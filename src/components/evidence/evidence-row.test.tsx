import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EvidenceRow } from '@/components/evidence/evidence-row'
import { makeTopic } from '@/lib/domain/topic-fixture'

/**
 * The Record button is invisible until hover — and must still be reachable.
 *
 * A form is not an interaction model and gets no component test. *"Reachable by
 * keyboard while invisible"* is one, and it is the class of defect the phase 14
 * focus-trap bug was: an accessibility property that held for eleven phases
 * because nothing had been positioned to break it, then broke silently the moment
 * something was.
 *
 * The button is hidden with `opacity: 0` plus `:hover`/`:focus-within`,
 * deliberately — `visibility: hidden` or `display: none` would remove it from the
 * tab order and still look right in a screenshot. jsdom applies no CSS hover, so
 * these assertions run in exactly the state a keyboard user starts in: nothing
 * hovered, nothing revealed.
 */
describe('the Record button', () => {
  it('is reachable and activatable by keyboard, with no pointer event at all', async () => {
    const onRecord = vi.fn()
    const user = userEvent.setup()

    render(<EvidenceRow topic={makeTopic({})} onRecord={onRecord} />)

    const record = screen.getByRole('button', { name: /Record challenge/i })

    // Focus it the way a keyboard user does. Never hovered, never clicked.
    record.focus()
    expect(record).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(onRecord).toHaveBeenCalledWith('challenge')
  })

  it('is in the tab order rather than merely present in the DOM', async () => {
    const user = userEvent.setup()
    render(<EvidenceRow topic={makeTopic({})} onRecord={vi.fn()} />)

    /*
      Tabbing from the top must eventually land on it. `display: none` and
      `visibility: hidden` both fail here while leaving the element queryable,
      which is the trap.
    */
    const reached: string[] = []
    for (let press = 0; press < 6; press += 1) {
      await user.tab()
      const active = document.activeElement
      if (active instanceof HTMLElement) reached.push(active.textContent ?? '')
    }

    expect(reached.join(' ')).toMatch(/Record/i)
  })

  it('offers Edit rather than Record once a marker exists', () => {
    render(
      <EvidenceRow
        topic={makeTopic({ rebuild_at: '2026-08-28', rebuild_note: 'once() from memory' })}
        onRecord={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Edit rebuild/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Record rebuild/i })).not.toBeInTheDocument()
  })

  it('states the rule above the row, so it is never four ticks without a reason', () => {
    render(<EvidenceRow topic={makeTopic({})} onRecord={vi.fn()} />)
    expect(
      screen.getByText(/Weak until you can explain it, implement a variant/),
    ).toBeInTheDocument()
  })

  it('never renders Recall as recordable — it is derived', () => {
    render(<EvidenceRow topic={makeTopic({ confidence: 'strong' })} onRecord={vi.fn()} />)

    expect(screen.getByText('Recall')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Record recall/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit recall/i })).not.toBeInTheDocument()
  })
})
