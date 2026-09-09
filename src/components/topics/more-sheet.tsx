'use client'

import Link from 'next/link'
import { useState } from 'react'
import { DeleteAccount } from '@/components/topics/delete-account'
import { Sheet } from '@/components/ui/sheet'
import { apprenticeshipNav } from '@/lib/domain/navigation'
import { useLocalToday } from '@/lib/domain/use-local-today'
import { signOut } from '@/app/(auth)/actions'

/**
 * The mobile account surface, as a sheet.
 *
 * ── Why this replaced a wrapping row ────────────────────────────────────────
 * Arc 3 shipped these as inline links and recorded, as an open question, that the
 * cluster was at five items and becoming a menu. Ledger is the sixth. The arc 3
 * measurement is the argument rather than a change of mind: five inline
 * overflowed 390px by 51px, five wrapped cost the head a second line, and six
 * would wrap to three.
 *
 * ── Why not a fourth tab ────────────────────────────────────────────────────
 * DESIGN.md rule 13 — mobile has two destinations plus add — survives untouched,
 * because none of these six is a destination you bounce between. They are places
 * you go deliberately, once. The head now costs one word at any number of them.
 *
 * The sheet is the existing `Sheet` at `placement="bottom"`, so the focus trap,
 * Escape and scrim-press behaviour are inherited rather than reimplemented.
 *
 * Interview is the sixth destination and it cost the head nothing, which is the
 * argument the sheet was built on rather than a happy accident.
 */
export function MoreSheet({
  counts,
  account,
}: {
  counts: {
    today: { day: string; done: number; written: number }[]
    phases: string
    ledger: string
    sources: string
    /**
     * Whether a model key is configured, resolved on the server by the page.
     *
     * A boolean, never the key — this is a client component, and
     * `ai-boundary.test.ts` asserts no client component names the key.
     */
    interview: boolean
  }
  account: { topics: number; images: number }
}) {
  const [open, setOpen] = useState(false)
  const localToday = useLocalToday()
  const todayRow = localToday === null ? null : counts.today.find((d) => d.day === localToday)

  /*
    The same list the rail renders, from the same function.

    These were two hand-written arrays until interview mode shipped an entry in
    neither of them. A destination that exists on one surface and not the other
    reads as finished from whichever screen you happen to be on, which is why
    the list is now built once — see `lib/domain/navigation.ts`.

    Settings is appended rather than shared: it is an account surface, not an
    apprenticeship destination, and on desktop it lives in the rail's foot
    beside Sign out rather than in this group at all.
  */
  const destinations = [
    ...apprenticeshipNav({
      today: todayRow ? `${todayRow.done} / ${todayRow.written}` : null,
      phases: counts.phases,
      ledger: counts.ledger,
      sources: counts.sources,
      interview: counts.interview,
    }),
    { href: '/settings', label: 'Settings', count: null },
  ]

  return (
    <>
      {/*
        ── A burger, not an underlined word ──────────────────────────────────
        It was a 13px text link doing a navigation menu's job: it read as prose
        rather than as a control, and at that size it was well under the 44px
        floor the rest of this app keeps.

        The accessible name stays "More" — the sheet it opens is titled More, and
        an icon-only control with no name is worse than the word was. `size-11`
        is the floor exactly, and the glyph sits at its visual size inside it,
        which is the same arrangement the confidence boxes use.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="More"
        data-testid="more-trigger"
        className="grid size-11 flex-none cursor-pointer place-items-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink md:hidden"
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {open ? (
        <Sheet open onClose={() => setOpen(false)} title="More" placement="bottom">
          <div className="-mx-5 -mt-2">
            {destinations.map((destination) => (
              <Link
                key={destination.href}
                href={destination.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between border-b border-rule px-5 py-3.5 text-[14.5px] text-ink hover:bg-surface-2"
              >
                <span>{destination.label}</span>
                {destination.count ? (
                  <span className="font-mono text-[11.5px] text-ink-3">{destination.count}</span>
                ) : null}
              </Link>
            ))}

            <form action={signOut}>
              <button
                type="submit"
                className="flex w-full cursor-pointer items-center justify-between border-b border-rule px-5 py-3.5 text-left text-[14.5px] text-ink hover:bg-surface-2"
              >
                Sign out
              </button>
            </form>

            {/*
              Last, and the only item in --flag: a destructive action, which is one
              of the three things that colour is for.
            */}
            <div className="px-5 py-3.5">
              <DeleteAccount topics={account.topics} images={account.images} />
            </div>
          </div>
        </Sheet>
      ) : null}
    </>
  )
}
