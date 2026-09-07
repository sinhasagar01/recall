'use client'

import { useState } from 'react'
import { LedgerRow } from '@/components/ledger/ledger-row'
import { kindChips, ledgerSummary, type Kind, type ProjectItem } from '@/lib/domain/ledger'

/**
 * The list, newest first, with filter chips.
 *
 * ── The chips are local, and that is deliberate ──────────────────────────────
 * Kind and status are component state over an already-loaded list, not URL
 * filters. The ledger is a capstone's decisions, not an event stream, so it
 * arrives in one read and narrowing it needs no round trip.
 *
 * The ONE filter that reaches the server is `?capability=`, because it arrives as
 * a link from a capability and has to survive being shared and reloaded. That is
 * the whole reason an item knows about a capability at all — and it is the only
 * new filter this arc adds. Nothing here is added to the library's filters, and
 * no shared filtering module is introduced.
 */
export function LedgerList({
  items,
  capabilityNames,
}: {
  items: ProjectItem[]
  capabilityNames: Record<string, string>
}) {
  const [kind, setKind] = useState<Kind | 'all'>('all')
  const [openOnly, setOpenOnly] = useState(false)

  const shown = items.filter(
    (item) => (kind === 'all' || item.kind === kind) && (!openOnly || item.status === 'open'),
  )

  const chips = kindChips(items)
  const open = items.filter((item) => item.status === 'open').length

  const chipClass = (active: boolean) =>
    `cursor-pointer rounded-full border px-2.5 py-1 font-mono text-[11px] ${
      active ? 'border-ink bg-ink text-surface' : 'border-rule text-ink-3 hover:border-rule-strong hover:text-ink'
    }`

  return (
    <>
      <p className="mb-4 font-mono text-[11.5px] text-ink-3">{ledgerSummary(items)}</p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={kind === 'all' && !openOnly}
          onClick={() => {
            setKind('all')
            setOpenOnly(false)
          }}
          className={chipClass(kind === 'all' && !openOnly)}
        >
          All {items.length}
        </button>
        <button
          type="button"
          aria-pressed={openOnly}
          onClick={() => setOpenOnly((value) => !value)}
          className={chipClass(openOnly)}
        >
          Open {open}
        </button>
        {chips.map((chip) => (
          <button
            key={chip.kind}
            type="button"
            aria-pressed={kind === chip.kind}
            onClick={() => setKind((current) => (current === chip.kind ? 'all' : chip.kind))}
            className={chipClass(kind === chip.kind)}
          >
            {chip.label} {chip.count}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-rule bg-surface">
        {shown.map((item) => (
          <LedgerRow
            key={item.id}
            item={item}
            capabilityName={item.capability_id ? (capabilityNames[item.capability_id] ?? null) : null}
          />
        ))}
        {shown.length === 0 ? (
          <p className="px-[17px] py-6 text-center text-meta text-ink-2">
            Nothing matches those filters.
          </p>
        ) : null}
      </div>
    </>
  )
}
