'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppIcon, type AppIconName } from '@/components/ui/app-icon'
import { apprenticeshipNav } from '@/lib/domain/navigation'
import { useLocalToday } from '@/lib/domain/use-local-today'

/**
 * The rail's main destinations.
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
  'relative flex items-center justify-between gap-2 px-3 py-2.5 text-option text-ink-2'

const ACTIVE_ITEM =
  'bg-accent-soft text-ink before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-accent'

interface Destination {
  href: string
  label: string
  count: string
  /** The flag colour is the weak count's, not a general "active" treatment. */
  countClass?: string
}

function iconFor(href: string): AppIconName {
  if (href === '/home') return 'home'
  if (href === '/library') return 'library'
  if (href === '/practice') return 'brain'
  if (href === '/weak') return 'weak'
  if (href === '/learn') return 'sparkles'
  if (href === '/sources') return 'layers'
  if (href === '/today') return 'today'
  if (href === '/phases') return 'target'
  if (href === '/ledger') return 'chart'
  return 'brain'
}

export function RailNav({
  total,
  queued,
  needsReview,
  sources,
  capabilities,
  demonstrated,
  ledger,
  today,
  interview,
}: {
  total: number
  queued: number
  needsReview: number
  sources: number
  capabilities: number
  demonstrated: number
  ledger: number
  /**
   * Per-day counts for the recent window. The rail picks today's out of it,
   * because only the browser knows which day that is.
   */
  today: { day: string; done: number; written: number }[]
  /**
   * Whether a model key is configured, resolved on the server by the layout.
   *
   * A boolean, never the key: `ai-boundary.test.ts` asserts the key is named in
   * exactly one module and never inside a client component, and this file is a
   * client component.
   */
  interview: boolean
}) {
  const pathname = usePathname()
  const localToday = useLocalToday()
  const todayRow = localToday === null ? null : today.find((d) => d.day === localToday)
  const todayCount = todayRow ? `${todayRow.done} / ${todayRow.written}` : null

  const destinations: Destination[] = [
    { href: '/home', label: 'Home', count: '' },
    { href: '/library', label: 'Library', count: String(total) },
    { href: '/practice', label: 'Practice', count: `${queued} queued` },
    { href: '/learn', label: 'Learn', count: '' },
    { href: '/sources', label: 'Sources', count: String(sources) },
  ]

  const apprenticeship = apprenticeshipNav({
    today: todayCount,
    phases: `${demonstrated} / ${capabilities}`,
    ledger: String(ledger),
    sources: String(sources),
    interview,
  })

  const progress: Destination[] = [
    {
      href: '/weak',
      label: 'Weak topics',
      count: String(needsReview),
      countClass: 'text-flag',
    },
    ...apprenticeship
      .filter((destination) => destination.href !== '/learn' && destination.href !== '/sources')
      .map((destination) => ({ ...destination, count: destination.count ?? '' })),
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
              isCurrent
                ? ACTIVE_ITEM
                : 'hover:bg-surface hover:text-ink'
            }`}
          >
            <span className="flex items-center gap-2.5"><AppIcon name={iconFor(destination.href)} className="size-[15px]" />{destination.label}</span>
            <span className={`font-mono text-mono-sm ${destination.countClass ?? 'text-ink-3'}`}>
              {destination.count}
            </span>
          </Link>
        )
      })}

      <span className="mt-5 mb-1.5 px-3 font-mono text-[9.5px] tracking-[0.14em] text-ink-3 uppercase">
        Progress
      </span>
      {progress.map((destination) => (
        <Link
          key={destination.href}
          href={destination.href}
          aria-current={pathname.startsWith(destination.href) ? 'page' : undefined}
          className={`${ITEM} ${
            pathname.startsWith(destination.href)
              ? ACTIVE_ITEM
              : 'hover:bg-surface hover:text-ink'
          }`}
        >
          <span className="flex items-center gap-2.5"><AppIcon name={iconFor(destination.href)} className="size-[15px]" />{destination.label}</span>
          <span className="font-mono text-mono-sm text-ink-3">{destination.count ?? ''}</span>
        </Link>
      ))}
    </nav>
  )
}
