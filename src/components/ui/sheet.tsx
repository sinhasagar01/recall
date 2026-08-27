'use client'

import { Kbd } from '@/components/ui/kbd'
import { Scrim } from '@/components/ui/scrim'
import { useFocusTrap } from '@/components/ui/use-focus-trap'

/** A right-hand panel. Add and edit topic live here on desktop. */
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
        className="w-full overflow-auto bg-surface px-5 pt-5 pb-10 shadow-pop md:w-[min(560px,100%)] md:border-l md:border-rule md:px-[30px] md:pt-[26px]"
      >
        <div className="mb-[22px] flex items-center justify-between gap-4">
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
        {children}
        {footer ? (
          <div className="mt-[26px] flex items-center gap-3 border-t border-rule pt-5">{footer}</div>
        ) : null}
      </div>
    </Scrim>
  )
}
