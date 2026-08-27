import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { usePracticeKeys } from '@/components/practice/use-practice-keys'

function Harness({
  onReveal,
  onGrade,
}: {
  onReveal?: () => void
  onGrade?: (index: 0 | 1 | 2) => void
}) {
  usePracticeKeys({ onReveal, onGrade })
  return (
    <>
      <textarea aria-label="Write what you remember" />
      <button type="button">Somewhere else</button>
    </>
  )
}

const elsewhere = () => screen.getByRole('button', { name: 'Somewhere else' })
const box = () => screen.getByRole('textbox', { name: 'Write what you remember' })

describe('usePracticeKeys', () => {
  it('reveals on Space', async () => {
    const user = userEvent.setup()
    const onReveal = vi.fn()
    render(<Harness onReveal={onReveal} />)

    await user.click(elsewhere())
    await user.keyboard(' ')

    expect(onReveal).toHaveBeenCalledOnce()
  })

  it.each([
    ['1', 0],
    ['2', 1],
    ['3', 2],
  ])('grades with %s', async (key, index) => {
    const user = userEvent.setup()
    const onGrade = vi.fn()
    render(<Harness onGrade={onGrade} />)

    await user.click(elsewhere())
    await user.keyboard(key)

    expect(onGrade).toHaveBeenCalledExactlyOnceWith(index)
  })

  it('does not reveal on Space while the textarea has focus', async () => {
    const user = userEvent.setup()
    const onReveal = vi.fn()
    render(<Harness onReveal={onReveal} />)

    await user.click(box())
    await user.keyboard('a b')

    // The space belongs to the sentence being written, not to the shortcut.
    expect(onReveal).not.toHaveBeenCalled()
    expect(box()).toHaveValue('a b')
  })

  it('does not grade on 1/2/3 while the textarea has focus', async () => {
    const user = userEvent.setup()
    const onGrade = vi.fn()
    render(<Harness onGrade={onGrade} />)

    await user.click(box())
    await user.keyboard('there are 3 phases')

    expect(onGrade).not.toHaveBeenCalled()
    expect(box()).toHaveValue('there are 3 phases')
  })

  it('ignores a shortcut held with a modifier', async () => {
    const user = userEvent.setup()
    const onGrade = vi.fn()
    render(<Harness onGrade={onGrade} />)

    await user.click(elsewhere())
    await user.keyboard('{Meta>}1{/Meta}')

    expect(onGrade).not.toHaveBeenCalled()
  })

  it('stays silent for a handler that was not given', async () => {
    const user = userEvent.setup()
    const onGrade = vi.fn()
    render(<Harness onGrade={onGrade} />)

    await user.click(elsewhere())
    await user.keyboard(' ')

    expect(onGrade).not.toHaveBeenCalled()
  })
})
