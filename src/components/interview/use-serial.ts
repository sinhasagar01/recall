'use client'

import { useCallback, useRef } from 'react'

/**
 * One at a time. A second call while the first is in flight does nothing.
 *
 * ── Why this exists as a function invariant and not a `disabled` attribute ──
 * `say()` in the room protected itself by setting `thinking` and trusting every
 * caller to render `disabled={thinking || …}`. That works exactly as long as
 * every way to call it is a button, and it is the same defect `ui/button.tsx`
 * already carries one level down: `disabled ?? loading` is a nullish fallback,
 * so a caller passing an explicit `false` defeats the loading guard entirely.
 *
 * A guard that lives on the callers is not a guard, it is a convention. The
 * room is about to grow two callers that are not buttons — a `⌘↵` chord and a
 * speech result — and neither can be given a `disabled` attribute.
 *
 * ── A ref, not the state flag ───────────────────────────────────────────────
 * `thinking` is React state, so two calls in the same tick both read the value
 * from the render they were created in — which is `false` for both. The latch
 * has to be readable and writable synchronously, which is what a ref is. The
 * room already does exactly this for leaving: `ending` is a ref for the same
 * reason.
 *
 * The state flag stays, because it is what the screen renders. This is the
 * invariant; that is the paint.
 *
 * ── What it does NOT do ─────────────────────────────────────────────────────
 * It does not queue. A dropped call is dropped, and that is right here: a second
 * send of the same answer is not work waiting to happen, it is a mistake. Queue
 * semantics would turn a double-press into two answers arriving in order, which
 * is the outcome this exists to prevent.
 */
export function useSerial<A extends unknown[]>(
  run: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
  const busy = useRef(false)

  return useCallback(
    async (...args: A) => {
      if (busy.current) return
      busy.current = true
      try {
        await run(...args)
      } finally {
        busy.current = false
      }
    },
    [run],
  )
}
