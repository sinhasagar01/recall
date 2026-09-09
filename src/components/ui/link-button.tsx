import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * A link that reads as a control. The one class string, in one place.
 *
 * ── Why this exists now and not earlier ─────────────────────────────────────
 * Two components already were this: `back-to-library.tsx` and
 * `new-interview.tsx`, each carrying its own copy of the same forty-character
 * class string. Two copies is a coincidence; the third is a pattern, and
 * "Earlier days" was about to be the third by copy-paste — which is precisely
 * how the six back-to-library links came to disagree in the first place.
 *
 * So the destination-specific components stay — they are what call sites use,
 * and they carry the reasoning for *their* control — but the paint moves here
 * and they cannot drift from each other any more.
 *
 * ── It is an anchor, always ─────────────────────────────────────────────────
 * A `<Button>` wrapping a `<Link>` is invalid markup and hands a screen reader
 * two nested controls. This is a link with a button's clothes; the browser
 * gives it a real link's behaviour and everything else is paint.
 *
 * ── 44px ────────────────────────────────────────────────────────────────────
 * `min-h-11`. Not a measured number standing in for something else — the touch
 * floor is a rule that stands on its own, and every control in this app meets it.
 */
export function LinkButton({
  href,
  children,
  /** `primary` where it is the only thing to do — an empty state's one action. */
  variant = 'secondary',
  className = '',
  ...rest
}: {
  href: string
  children: ReactNode
  variant?: 'primary' | 'secondary'
  className?: string
} & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  return (
    <Link
      {...rest}
      href={href}
      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3.5 py-2.5 text-label font-medium ${
        variant === 'primary'
          ? 'border-accent bg-accent text-white hover:border-accent-ink hover:bg-accent-ink'
          : 'border-rule-strong bg-surface text-ink hover:border-ink-3'
      } ${className}`}
    >
      {children}
    </Link>
  )
}
