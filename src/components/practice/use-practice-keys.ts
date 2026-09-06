'use client'

import { useEffect } from 'react'
import { isTyping } from '@/components/ui/is-typing'

/**
 * ⌘↵ reveals; Space also reveals; 1 / 2 / 3 grade; Escape leaves.
 *
 * Escape is not guarded by `onGrade` or `onReveal` — you can always leave, at any
 * point in a session, including mid-answer. An exit that is conditional on state
 * is an exit people stop trusting.
 *
 * Every shortcut is inert while the caret is in a field. Otherwise Space could
 * never be typed into the recall textarea — the one place in this app where
 * someone is deliberately writing prose — and a "3" in an answer would grade the
 * card out from under them.
 *
 * ── Which is why ⌘↵ exists ──────────────────────────────────────────────────
 * That guard is right, and it made the advertised shortcut unreachable for anyone
 * who did what the card asks. The screen says "Explain it in your own words before
 * revealing" and then offered a reveal key that stops working the moment you
 * start explaining: the caret is in the textarea, so Space types a space. The
 * shortcut was only ever available to people who skipped the step.
 *
 * ⌘↵ is checked BEFORE the typing guard, so it fires from inside the textarea.
 * It cannot collide with prose the way Space does — a modifier chord is not
 * something you type by accident — and it is already this app's "I am done with
 * this form" chord, from the add sheet's footer.
 */

export function usePracticeKeys({
  onReveal,
  onGrade,
  onExit,
}: {
  onReveal?: () => void
  onGrade?: (index: 0 | 1 | 2) => void
  onExit?: () => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      /*
        Deliberately above the typing guard. This is the one shortcut that has to
        work while the caret is in the recall box, because that is exactly where
        the card asks you to put it.
      */
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && onReveal) {
        event.preventDefault()
        onReveal()
        return
      }

      if (isTyping(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === 'Escape' && onExit) {
        event.preventDefault()
        onExit()
        return
      }

      if (event.key === ' ' && onReveal) {
        event.preventDefault()
        onReveal()
        return
      }

      if (!onGrade) return
      const index = ['1', '2', '3'].indexOf(event.key)
      if (index !== -1) {
        event.preventDefault()
        onGrade(index as 0 | 1 | 2)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onReveal, onGrade, onExit])
}
