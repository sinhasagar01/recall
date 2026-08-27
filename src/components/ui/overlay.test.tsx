import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Modal } from '@/components/ui/modal'
import { Sheet } from '@/components/ui/sheet'

/**
 * Sheet and Modal share a focus trap, so they share a test suite. The harness
 * mounts a real opener button, because "focus is restored to whatever opened it"
 * cannot be tested without one.
 */
function Harness({ overlay }: { overlay: 'sheet' | 'modal' }) {
  const [open, setOpen] = useState(false)
  const body = (
    <>
      <button type="button">First</button>
      <button type="button">Second</button>
      <button type="button">Third</button>
    </>
  )

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {overlay === 'sheet' ? (
        <Sheet open={open} onClose={() => setOpen(false)} title="Add topic">
          {body}
        </Sheet>
      ) : (
        <Modal open={open} onClose={() => setOpen(false)} title="Delete topic">
          {body}
        </Modal>
      )}
    </>
  )
}

describe.each(['sheet', 'modal'] as const)('%s', (overlay) => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Open' }))
  }

  it('renders nothing while closed', () => {
    render(<Harness overlay={overlay} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is a modal dialog with an accessible name', async () => {
    const user = userEvent.setup()
    render(<Harness overlay={overlay} />)
    await open(user)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleName(overlay === 'sheet' ? 'Add topic' : 'Delete topic')
  })

  it('moves focus inside on open', async () => {
    const user = userEvent.setup()
    render(<Harness overlay={overlay} />)
    await open(user)

    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
  })

  it('traps Tab at the end and wraps to the start', async () => {
    const user = userEvent.setup()
    render(<Harness overlay={overlay} />)
    await open(user)

    const focusable = screen
      .getAllByRole('button')
      .filter((button) => screen.getByRole('dialog').contains(button))

    focusable[focusable.length - 1].focus()
    await user.tab()

    expect(focusable[0]).toHaveFocus()
  })

  it('traps Shift+Tab at the start and wraps to the end', async () => {
    const user = userEvent.setup()
    render(<Harness overlay={overlay} />)
    await open(user)

    const focusable = screen
      .getAllByRole('button')
      .filter((button) => screen.getByRole('dialog').contains(button))

    focusable[0].focus()
    await user.tab({ shift: true })

    expect(focusable[focusable.length - 1]).toHaveFocus()
  })

  it('closes on Escape and restores focus to the opener', async () => {
    const user = userEvent.setup()
    render(<Harness overlay={overlay} />)
    await open(user)

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
  })

  it('closes when the scrim is clicked', async () => {
    const user = userEvent.setup()
    render(<Harness overlay={overlay} />)
    await open(user)

    await user.click(screen.getByTestId('scrim'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
  })

  it('does not close when a click starts inside the dialog', async () => {
    const user = userEvent.setup()
    render(<Harness overlay={overlay} />)
    await open(user)

    await user.click(screen.getByRole('button', { name: 'Second' }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
