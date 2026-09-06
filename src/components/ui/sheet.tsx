'use client'

import { Kbd } from '@/components/ui/kbd'
import { Scrim } from '@/components/ui/scrim'
import { useFocusTrap } from '@/components/ui/use-focus-trap'

/**
 * A right-hand panel. Add and edit topic live here on desktop.
 *
 * ── Three rows, and only the middle one scrolls ─────────────────────────────
 * The panel used to be one `overflow-auto` box with the footer at the bottom of
 * the flow, which meant the footer scrolled with everything else. On a 390x844
 * phone the add sheet's content is 951px tall, so **Save opened 18px below the
 * fold before a single character was typed** — the primary action of the primary
 * form, out of sight on arrival.
 *
 * Now the dialog is a flex column: header and footer are `shrink-0`, the children
 * take the remaining height and scroll inside it. `min-h-0` on that middle row is
 * load-bearing — a flex item's default `min-height: auto` refuses to shrink below
 * its content, so without it the row grows to fit and pushes the footer back off
 * the bottom, which looks exactly like having changed nothing.
 *
 * The footer's bottom padding clears the iOS home indicator. It is pinned to the
 * bottom edge now, so it is the first thing that would sit under it.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const containerRef = useFocusTrap({ open, onClose })

  if (!open) return null

  return (
    <Scrim onClose={onClose} className="fixed inset-0 z-60 flex justify-end bg-ink/34">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="flex h-full w-full flex-col bg-surface shadow-pop md:w-[min(560px,100%)] md:border-l md:border-rule"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-5 pb-[22px] md:px-[30px] md:pt-[26px]">
          <h2 className="font-display text-[19px] font-medium tracking-[-0.02em] md:text-[23px]">
            {title}
          </h2>
          {/*
            Escape and the scrim already close this, but neither is an affordance —
            and a phone has no Escape key at all.
          */}
          <button
            type="button"
            onClick={onClose}
            className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-label text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            Close
            <span className="hidden md:inline">
              <Kbd>Esc</Kbd>
            </span>
          </button>
        </div>
        {/* min-h-0: see the note above. Without it this row will not shrink. */}
        <div className="min-h-0 flex-1 overflow-auto px-5 pb-8 md:px-[30px]">{children}</div>

        {footer ? (
          <div className="flex shrink-0 items-center gap-3 border-t border-rule px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-[30px]">
            {footer}
          </div>
        ) : null}
      </div>
    </Scrim>
  )
}
