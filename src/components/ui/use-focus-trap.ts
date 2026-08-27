'use client'

import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Shared by Sheet and Modal. One implementation on purpose: two focus traps are
 * how they drift apart, and a half-working trap is worse than none because it
 * looks correct until someone tabs.
 *
 * Handles, in order: remember what had focus, move focus in, wrap Tab at both
 * ends, close on Escape, and restore focus to the opener on close.
 */
export function useFocusTrap({ open, onClose }: { open: boolean; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const restoreToRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    const container = containerRef.current
    if (!container) return

    restoreToRef.current = document.activeElement as HTMLElement | null

    const focusable = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))

    /*
      Focus what the dialog is FOR.

      A dialog containing a form is there to be filled in, so focus its first form
      control rather than whatever happens to come first in the DOM — otherwise
      adding a Close button to the header silently moves the caret off the first
      field, and a keyboard user types their title into a button. (That is not
      hypothetical: it regressed exactly that way when Sheet gained its close
      control.)

      A dialog with no form control — the delete confirmation — falls back to the
      first focusable, which is its first action. And a dialog with nothing
      focusable at all falls back to the container, so the trap always has a
      subject.
    */
    const items = focusable()
    const firstField = items.find((element) =>
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName),
    )
    const initial = firstField ?? items[0] ?? container
    initial.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const items = focusable()
      if (items.length === 0) {
        event.preventDefault()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // The opener can be gone by now (a row that deleted itself, say), so only
      // restore to something still in the document.
      const restoreTo = restoreToRef.current
      if (restoreTo?.isConnected) restoreTo.focus()
    }
  }, [open, onClose])

  return containerRef
}
