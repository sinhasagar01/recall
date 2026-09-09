'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The phone's tab bar. Two destinations plus add, per DESIGN.md.
 *
 * ── It had no selected state at all ─────────────────────────────────────────
 * Library and Practice rendered identically whichever one you were on, so the
 * one control that is supposed to answer "where am I" answered nothing. The rail
 * has said this since phase 12 — `aria-current` and a filled row — and the tab
 * bar, which is the *only* navigation on a phone, never did.
 *
 * ── Three signals, and only one of them is colour ───────────────────────────
 * Colour alone fails for the obvious reason and for a subtler one: at 9.5px, on
 * a phone, in daylight, an accent and an `ink-3` are close enough to be a guess.
 * So:
 *
 *   1. **A 2px bar across the top of the active tab.** Position and shape, which
 *      survive any rendering — the strongest of the three, and the same idiom the
 *      interview room uses for its top edge.
 *   2. **Weight and ink on the label**, medium and full ink against regular and
 *      `ink-3`.
 *   3. **`aria-current="page"`**, which is the only one a screen reader gets.
 *
 * A client component because the answer depends on the route, and the layout
 * that owns the bar is a server component — the same reason `RailNav` is one.
 */
export function TabBar() {
  const pathname = usePathname()

  /*
    A topic belongs to the library: /topic/<id> is reached from it and its
    breadcrumb returns there, so the bar marks Library rather than nothing.
    The rail already does exactly this.
  */
  const on = (href: string) =>
    pathname === href || (href === '/library' && pathname.startsWith('/topic'))

  return (
    <nav
      aria-label="Main"
      data-testid="tab-bar"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around gap-1.5 border-t border-rule bg-surface px-3 pt-2.5 pb-4 md:hidden"
    >
      <TabItem href="/library" label="Library" current={on('/library')}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 5h7v14H4zM13 5h7v14h-7z" />
        </svg>
      </TabItem>

      <Link
        href="/library?add=1"
        aria-label="Add topic"
        className="-mt-[22px] grid size-[46px] shrink-0 place-items-center rounded-full border-[3px] border-surface bg-accent text-white"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>

      <TabItem href="/practice" label="Practice" current={on('/practice')}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M12 4a8 8 0 1 0 8 8" />
          <path d="M12 8v4l3 2" />
        </svg>
      </TabItem>
    </nav>
  )
}

function TabItem({
  href,
  label,
  current,
  children,
}: {
  href: string
  label: string
  current: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      data-current={current}
      className={`relative flex min-h-11 flex-col items-center justify-center gap-1 px-4 font-mono text-[9.5px] tracking-[0.06em] uppercase ${
        current ? 'font-medium text-ink' : 'text-ink-3'
      }`}
    >
      {/* Signal one: position, which no rendering condition can wash out. */}
      {current ? (
        <span
          aria-hidden="true"
          data-testid="tab-indicator"
          className="absolute -top-2.5 h-0.5 w-8 rounded-full bg-accent"
        />
      ) : null}
      {children}
      {label}
    </Link>
  )
}
