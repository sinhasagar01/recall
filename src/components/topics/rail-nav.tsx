'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The rail's three destinations.
 *
 * A client component only because the active entry has to be derived from the
 * current route, and the layout that owns the rail is a server component.
 *
 * It exists because Library used to be a hardcoded `<span aria-current="page">`.
 * That had two consequences, and the second was the serious one:
 *
 *   * the rail told you — and told a screen reader — that you were on Library
 *     while you were reading /weak or a topic
 *   * Library was not a link, so on desktop /weak had no way back to the library
 *     at all. The loop's "see what's weak" step had no step after it, and getting
 *     back cost a detour through a topic or the browser's own back button
 *
 * `design-reference.html:990-992` had it right the whole time: on the weak screen
 * Library is a plain link and Weak topics carries `aria-current`. The build
 * copied the library screen's rail onto every screen.
 */
const ITEM =
  'flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-option text-ink-2'

interface Destination {
  href: string
  label: string
  count: string
  /** The flag colour is the weak count's, not a general "active" treatment. */
  countClass?: string
}

export function RailNav({
  total,
  queued,
  needsReview,
  sources,
  capabilities,
  demonstrated,
  ledger,
}: {
  total: number
  queued: number
  needsReview: number
  sources: number
  capabilities: number
  demonstrated: number
  ledger: number
}) {
  const pathname = usePathname()

  const destinations: Destination[] = [
    { href: '/library', label: 'Library', count: String(total) },
    { href: '/practice', label: 'Practice', count: `${queued} queued` },
    {
      href: '/weak',
      label: 'Weak topics',
      count: String(needsReview),
      countClass: 'text-flag',
    },
  ]

  /*
    Sources sits under its own group, below the three that matter. A source is
    raw material; putting it beside Library would let it compete with the library
    for the same attention, which is the same reason a source row is not a topic
    card.
  */
  /*
    Phases above Sources: a phase is what you are trying to become able to do,
    and a source is the raw material you do it with. The reference draws them in
    that order for the same reason.

    The count is `demonstrated / total capabilities` — the one number this
    section exists to show. Not a percentage, and not a week counter.
  */
  const apprenticeship: Destination[] = [
    { href: '/phases', label: 'Phases', count: `${demonstrated} / ${capabilities}` },
    { href: '/ledger', label: 'Ledger', count: String(ledger) },
    { href: '/sources', label: 'Sources', count: String(sources) },
  ]

  return (
    <nav className="flex flex-col gap-0.5">
      {destinations.map((destination) => {
        /*
          A topic belongs to the library: /topic/<id> is reached from it and its
          breadcrumb goes back to it, so the rail marks Library rather than
          nothing. The reference does the same on its detail screen (line 828).
        */
        const isCurrent =
          pathname === destination.href ||
          (destination.href === '/library' && pathname.startsWith('/topic'))

        return (
          <Link
            key={destination.href}
            href={destination.href}
            aria-current={isCurrent ? 'page' : undefined}
            className={`${ITEM} ${
              isCurrent ? 'bg-surface text-ink' : 'hover:bg-surface hover:text-ink'
            }`}
          >
            <span>{destination.label}</span>
            <span className={`font-mono text-mono-sm ${destination.countClass ?? 'text-ink-3'}`}>
              {destination.count}
            </span>
          </Link>
        )
      })}

      <span className="mt-5 mb-1.5 px-3 font-mono text-[9.5px] tracking-[0.14em] text-ink-3 uppercase">
        Apprenticeship
      </span>
      {apprenticeship.map((destination) => (
        <Link
          key={destination.href}
          href={destination.href}
          aria-current={pathname.startsWith(destination.href) ? 'page' : undefined}
          className={`${ITEM} ${
            pathname.startsWith(destination.href)
              ? 'bg-surface text-ink'
              : 'hover:bg-surface hover:text-ink'
          }`}
        >
          <span>{destination.label}</span>
          <span className="font-mono text-mono-sm text-ink-3">{destination.count}</span>
        </Link>
      ))}
    </nav>
  )
}
