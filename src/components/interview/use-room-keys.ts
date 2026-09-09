'use client'

import { useEffect } from 'react'

/**
 * `⌘↵` sends the answer. That is the whole keyboard surface of the room.
 *
 * ── It was advertised for a whole arc with nothing behind it ────────────────
 * The room rendered `⌘↵ to send` beside the actions and had no key handling at
 * all — no listener, no `metaKey`, nothing. It shipped to production that way.
 * See issue #27: a label promising what its target does not do, which is the
 * same class as the practice page's `+ Add a topic` pointing at bare `/library`,
 * and the same reason no test caught it — every check asserted the button works.
 *
 * ── Copied from `usePracticeKeys`, including the part that matters ──────────
 * The chord is checked with no typing guard in front of it, because the caret is
 * *supposed* to be in the answer box. That is the whole point of the shortcut:
 * the alternative is reaching for the mouse after every answer in a twenty
 * minute round. A modifier chord cannot be typed by accident the way Space can,
 * so it is safe where a bare key would not be.
 *
 * The room has no other shortcut on purpose. Escape is not bound: on the
 * practice screen Escape leaves, and binding it here would mean a keystroke
 * abandons a round — the one action in this app that costs twenty minutes and
 * cannot be resumed. Leaving stays a deliberate press of `End the round`.
 */
export function useRoomKeys({ onSend }: { onSend?: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && onSend) {
        event.preventDefault()
        onSend()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onSend])
}
