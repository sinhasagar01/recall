'use client'

import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  /*
    Hidden inputs are inputs. They match `input:not([disabled])`, they cannot take
    focus, and `.focus()` on one silently does nothing — so before this exclusion
    the trap could pick one as its initial target and leave the caret nowhere, and
    Tab could stop on it. Latent until the topic sheet gained a hidden field ABOVE
    its first real one; the sheet had carried hidden inputs for tags and category
    since phase 3, but only ever below the field that was picked first.
  */
  'input:not([disabled]):not([type="hidden"])',
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

      Radios and checkboxes do not count as that first field. They are settings —
      a mode toggle, a marked answer — and a dialog is not there to be filled in by
      changing one. The topic sheet grew a Topic/Quiz toggle above its title field
      and the caret landed on it, which is the same regression the paragraph above
      describes, arriving through a different door. Skipping them keeps every
      existing dialog on exactly the control it already focused.

      A dialog with no form control — the delete confirmation — falls back to the
      first focusable, which is its first action. And a dialog with nothing
      focusable at all falls back to the container, so the trap always has a
      subject.
    */
    const items = focusable()
    const firstField = items.find(
      (element) =>
        ['TEXTAREA', 'SELECT'].includes(element.tagName) ||
        (element instanceof HTMLInputElement &&
          element.type !== 'radio' &&
          element.type !== 'checkbox'),
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
