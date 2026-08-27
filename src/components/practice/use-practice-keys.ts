'use client'

import { useEffect } from 'react'

/**
 * Space reveals; 1 / 2 / 3 grade.
 *
 * Every shortcut is inert while the caret is in a field. Otherwise Space could
 * never be typed into the recall textarea — the one place in this app where
 * someone is deliberately writing prose — and a "3" in an answer would grade the
 * card out from under them.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function usePracticeKeys({
  onReveal,
  onGrade,
}: {
  onReveal?: () => void
  onGrade?: (index: 0 | 1 | 2) => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return

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
  }, [onReveal, onGrade])
}
