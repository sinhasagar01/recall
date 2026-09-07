'use client'

import Link from 'next/link'
import { useState } from 'react'
import { DeleteAccount } from '@/components/topics/delete-account'
import { Sheet } from '@/components/ui/sheet'
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
 */
export function MoreSheet({
  counts,
  account,
}: {
  counts: { phases: string; ledger: string; sources: string }
  account: { topics: number; images: number }
}) {
  const [open, setOpen] = useState(false)

  const destinations = [
    { href: '/phases', label: 'Phases', count: counts.phases },
    { href: '/ledger', label: 'Ledger', count: counts.ledger },
    { href: '/sources', label: 'Sources', count: counts.sources },
    { href: '/settings', label: 'Settings', count: null },
  ]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex-none cursor-pointer text-[13px] text-ink-2 underline hover:text-ink md:hidden"
      >
        More
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
