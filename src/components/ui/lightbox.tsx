'use client'

import { Kbd } from '@/components/ui/kbd'
import { Scrim } from '@/components/ui/scrim'
import { useFocusTrap } from '@/components/ui/use-focus-trap'

/**
 * The full-bleed image view. Same trap and same scrim as Sheet and Modal — there
 * is exactly one focus trap in this codebase.
 *
 * The mock shows only an "Esc" hint. A hint is not an affordance, so the chip
 * lives inside a real close button: pointer users get something to click and
 * screen-reader users get a named control.
 */
export function Lightbox({
  open,
  onClose,
  src,
  alt,
}: {
  open: boolean
  onClose: () => void
  src: string
  alt: string
}) {
  const containerRef = useFocusTrap({ open, onClose })

  if (!open) return null

  return (
    <Scrim onClose={onClose} className="fixed inset-0 z-60 grid place-items-center bg-ink/86 p-10">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        tabIndex={-1}
        className="grid w-full max-w-[900px] gap-3"
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the image"
            className="cursor-pointer rounded-sm"
          >
            <Kbd>Esc</Kbd>
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, not a static asset */}
        <img src={src} alt={alt} className="w-full rounded-md bg-surface object-contain" />
      </div>
    </Scrim>
  )
}
