import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Lightbox } from '@/components/ui/lightbox'

/*
  The trap itself is already covered by overlay.test.tsx and is not retested here.
  What is specific to Lightbox: it has no visible title, so its accessible name
  has to come from the image, and the mock's Esc hint must be a real control.
*/
function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Lightbox open={open} onClose={() => setOpen(false)} src="/diagram.png" alt="tree-diff.png" />
    </>
  )
}

describe('Lightbox', () => {
  it('takes its accessible name from the image, having no visible title', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    expect(screen.getByRole('dialog')).toHaveAccessibleName('tree-diff.png')
    expect(screen.getByRole('img', { name: 'tree-diff.png' })).toHaveAttribute('src', '/diagram.png')
  })

  it('closes from the Esc chip, which is a real button and not just a hint', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Open' }))

    await user.click(screen.getByRole('button', { name: 'Close the image' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
  })
})
