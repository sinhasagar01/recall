'use client'

import { useRef } from 'react'

/**
 * The dimmed backdrop behind Sheet and Modal. Shared so the two cannot disagree
 * about what "clicking outside" means.
 *
 * It closes on CLICK, not mousedown, and only when the press *started* on the
 * scrim as well. Two reasons, both learned the hard way:
 *
 * - Closing on mousedown means the trailing click lands on an element that no
 *   longer exists, and the browser resets focus to <body> — undoing the focus
 *   restore the trap just performed.
 * - Requiring the press to start here too means a text selection dragged out of
 *   the dialog and released over the scrim does not close it.
 */
export function Scrim({
  onClose,
  className,
  children,
}: {
  onClose: () => void
  className: string
  children: React.ReactNode
}) {
  const pressStartedOnScrim = useRef(false)

  return (
    <div
      data-testid="scrim"
      onMouseDown={(event) => {
        pressStartedOnScrim.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (pressStartedOnScrim.current && event.target === event.currentTarget) onClose()
      }}
      className={className}
    >
      {children}
    </div>
  )
}
