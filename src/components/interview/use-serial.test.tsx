import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { useSerial } from '@/components/interview/use-serial'

/*
  The concurrency property, asserted directly.

  It cannot be reached through the room's UI: every caller there clears the
  answer box or carries `disabled`, so a second press is stopped by something
  else before the latch is consulted. A test driven through the screen would
  pass with the latch deleted — the guard-that-passes-for-the-wrong-reason shape
  recorded in ARCHITECTURE.md — which is exactly why the latch is extracted to a
  hook that can be called twice on purpose.
*/
function Harness({ run }: { run: () => Promise<void> }) {
  const serial = useSerial(run)
  /*
    The caller handles rejection, because `useSerial` re-throws rather than
    swallowing. In the room that caller is `say`'s own body, whose try/catch
    turns a failure into the sentence on screen — so `say()` itself never
    rejects and `sendAnswer` can fire and forget. A `useSerial` that ate errors
    would make that impossible to notice.
  */
  return (
    <button type="button" onClick={() => void serial().catch(() => {})}>
      Go
    </button>
  )
}

/** A promise the test resolves by hand, so "in flight" is a state we control. */
function deferred() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

describe('useSerial', () => {
  it('drops a call made while the first is in flight', async () => {
    const user = userEvent.setup()
    const gate = deferred()
    const run = vi.fn(() => gate.promise)

    render(<Harness run={run} />)
    const go = screen.getByRole('button', { name: 'Go' })

    await user.click(go)
    await user.click(go)
    await user.click(go)

    expect(run).toHaveBeenCalledTimes(1)

    gate.release()
  })

  it('runs again once the first has settled', async () => {
    const user = userEvent.setup()
    const run = vi.fn(async () => {})

    render(<Harness run={run} />)
    const go = screen.getByRole('button', { name: 'Go' })

    await user.click(go)
    await user.click(go)

    expect(run).toHaveBeenCalledTimes(2)
  })

  it('releases the latch when the call throws', async () => {
    /*
      `finally`, not a trailing statement. A rejected call that left the latch
      closed would disable the room permanently with nothing on screen to say
      why — the same failure `say` already had before it grew a `try/finally`,
      reintroduced one level up.
    */
    const user = userEvent.setup()
    const run = vi.fn(async () => {
      throw new Error('the room did not answer')
    })

    render(<Harness run={run} />)
    const go = screen.getByRole('button', { name: 'Go' })

    await user.click(go)
    await user.click(go)

    expect(run).toHaveBeenCalledTimes(2)
  })
})
