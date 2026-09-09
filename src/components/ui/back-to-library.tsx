import { LinkButton } from '@/components/ui/link-button'
import type { ReactNode } from 'react'

/**
 * The way back to the library, everywhere there is one.
 *
 * ── Why a component rather than seven agreeing call sites ───────────────────
 * There were seven, found by search rather than by reading: settings, the topic
 * detail's breadcrumb, the topic not-found page, the practice page's five empty
 * states, the practice session's header and its completion screen. Six of them
 * repeated the same forty-character class string and two of them did not — the
 * two that read `← Library` in underlined text rather than as a control.
 *
 * Seven call sites that agree today are seven that can disagree tomorrow, and
 * two of them already did. More to the point, an eighth page gets one only if
 * somebody remembers; interview mode is the page that did not, and it shipped
 * with no way back at all.
 *
 * ── It reads as a button and it is a link ──────────────────────────────────
 * A destination change the user chooses reads as a button, like every other
 * action in this app. It cannot BE a `<Button>`: a button wrapping a link is
 * invalid markup and hands a screen reader two nested controls — the resolution
 * DESIGN.md records for the practise actions, and this is the same one. The
 * element is an anchor, so the browser gives it a real link's behaviour;
 * everything else is paint.
 *
 * ── The paint lives in `LinkButton` ────────────────────────────────────────
 * Including the 44px floor. This component is the DESTINATION and its reasoning;
 * the class string is shared with every other link-as-control so a third one
 * cannot arrive looking slightly different.
 */
export function BackToLibrary({
  /** The label. Defaults to the name of the destination, which is usually right. */
  children = 'Back to library',
  /** `primary` where it is the only thing to do — an empty state's one action. */
  variant = 'secondary',
  className = '',
}: {
  children?: ReactNode
  variant?: 'primary' | 'secondary'
  className?: string
}) {
  return (
    <LinkButton href="/library" data-testid="back-to-library" variant={variant} className={className}>
      {children}
    </LinkButton>
  )
}
