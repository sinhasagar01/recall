'use client'

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
        className="w-[min(560px,100%)] overflow-auto border-l border-rule bg-surface px-[30px] pt-[26px] pb-10 shadow-pop"
      >
        <div className="mb-[22px] flex items-center justify-between">
          <h2 className="font-display text-[23px] font-medium tracking-[-0.02em]">{title}</h2>
        </div>
        {children}
        {footer ? (
          <div className="mt-[26px] flex items-center gap-3 border-t border-rule pt-5">{footer}</div>
        ) : null}
      </div>
    </Scrim>
  )
}
