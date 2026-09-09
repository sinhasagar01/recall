import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useRoomKeys } from '@/components/interview/use-room-keys'

function Harness({ onSend }: { onSend?: () => void }) {
  useRoomKeys({ onSend })
  return (
    <>
      <textarea aria-label="Your answer" />
      <button type="button">Somewhere else</button>
    </>
  )
}

const box = () => screen.getByRole('textbox', { name: 'Your answer' })

describe('useRoomKeys', () => {
  it('sends on ⌘↵ from inside the answer field', async () => {
    /*
      The only placement that matters. The chord exists so you do not have to
      leave the box you are typing in, so a test that presses it at the document
      would pass over a handler the typing guard makes unreachable — which is
      the bug this shape of test caught on the practice screen.
    */
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<Harness onSend={onSend} />)

    await user.click(box())
    await user.type(box(), 'A live reference to the defining scope.')
    await user.keyboard('{Meta>}{Enter}{/Meta}')

    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('takes Ctrl↵ too, for anyone not on a Mac', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<Harness onSend={onSend} />)

    await user.click(box())
    await user.keyboard('{Control>}{Enter}{/Control}')

    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('leaves a bare Enter alone, so the answer box can hold paragraphs', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<Harness onSend={onSend} />)

    await user.click(box())
    await user.keyboard('one{Enter}two')

    expect(onSend).not.toHaveBeenCalled()
    expect(box()).toHaveValue('one\ntwo')
  })

  it('stops listening once the room is gone', async () => {
    /*
      The listener is on `document`, so it outlives the component unless the
      effect cleans up. Leaving a round and pressing the chord on the scorecard
      would otherwise send an answer into a round that has ended.
    */
    const user = userEvent.setup()
    const onSend = vi.fn()
    const view = render(<Harness onSend={onSend} />)

    view.unmount()
    await user.keyboard('{Meta>}{Enter}{/Meta}')

    expect(onSend).not.toHaveBeenCalled()
  })
})
