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
 *
 * ── It arrives rather than appearing ────────────────────────────────────────
 * It had no animation of any kind: in the DOM one frame, painted the next. On
 * the bottom sheet, which covers most of a phone, that reads as the page having
 * been replaced rather than as a panel opening.
 *
 * The animation lives HERE rather than at the More sheet's call site, so all
 * five sheets inherit it — a side panel slides from the right, a bottom sheet
 * rises from the bottom, and the scrim fades over the same interval so the two
 * read as one movement. Keyframes rather than a transition, because this mounts
 * only when open and there is no prior state to transition from. See
 * globals.css for why the resting state is the keyframes' end.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  placement = 'side',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  /**
   * Where the panel comes from.
   *
   * `side` is the original and the default, so the four existing call sites are
   * untouched. `bottom` is the mobile More menu — a short sheet rising from the
   * bottom edge, which is where a thumb already is.
   *
   * A PROP rather than a second component, because the focus trap, the Escape
   * handling and the scrim-press rule are exactly the parts that must not
   * diverge. A second overlay primitive is how two overlays end up trapping focus
   * differently, and only one of them correctly.
   */
  placement?: 'side' | 'bottom'
}) {
  const containerRef = useFocusTrap({ open, onClose })

  if (!open) return null

  return (
    <Scrim
      onClose={onClose}
      className={`fixed inset-0 z-60 flex bg-ink/34 [animation:scrim-in_180ms_ease-out] ${
        placement === 'bottom' ? 'items-end justify-center' : 'justify-end'
      }`}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={
          placement === 'bottom'
            ? 'flex max-h-[80vh] w-full flex-col rounded-t-lg bg-surface shadow-pop [animation:sheet-up_260ms_cubic-bezier(0.22,1,0.36,1)] md:mb-6 md:w-[min(460px,100%)] md:rounded-lg'
            : 'flex h-full w-full flex-col bg-surface shadow-pop [animation:sheet-in_260ms_cubic-bezier(0.22,1,0.36,1)] md:w-[min(560px,100%)] md:border-l md:border-rule'
        }
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
