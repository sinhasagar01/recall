'use client'

import { Scrim } from '@/components/ui/scrim'
import { useFocusTrap } from '@/components/ui/use-focus-trap'

/** A centred dialog. The delete confirmation and the image lightbox use this. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children?: React.ReactNode
  footer?: React.ReactNode
}) {
  const containerRef = useFocusTrap({ open, onClose })

  if (!open) return null

  return (
    <Scrim onClose={onClose} className="fixed inset-0 z-60 grid place-items-center bg-ink/38 p-6">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="w-[min(460px,100%)] rounded-lg border border-rule-strong bg-surface p-6 shadow-pop"
      >
        <p className="mb-2 font-mono text-mono-xs tracking-[0.14em] text-accent-ink uppercase">Confirm action</p>
        <h2 className="mb-2 font-display text-[23px] font-medium tracking-[-0.02em]">{title}</h2>
        {children ? <div className="mb-5 text-[14px] text-ink-2">{children}</div> : null}
        {footer ? <div className="flex justify-end gap-2.5">{footer}</div> : null}
      </div>
    </Scrim>
  )
}
