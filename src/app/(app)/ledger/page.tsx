import Link from 'next/link'
import { AddItemButton } from '@/components/ledger/add-item-button'
import { LedgerList } from '@/components/ledger/ledger-list'
import { StateBlock } from '@/components/ui/state-block'
import { listLedger } from '@/lib/data/ledger'
import { listCapabilityOptions } from '@/lib/data/phases'
import { BackToLibrary } from '@/components/ui/back-to-library'

/**
 * The ledger. One list, newest first.
 *
 * No board, no columns, no drag, no burn-down. The only thing this page knows
 * that a folder of links does not is which capability an item serves.
 */
export default async function LedgerPage({ searchParams }: PageProps<'/ledger'>) {
  const params = await searchParams
  const capabilityId = typeof params.capability === 'string' ? params.capability : undefined

  const [items, capabilityOptions] = await Promise.all([
    listLedger(capabilityId),
    listCapabilityOptions(),
  ])

  const capabilityNames: Record<string, string> = {}
  for (const group of capabilityOptions) {
    for (const option of group.options) capabilityNames[option.id] = option.name
  }

  /*
    The heading stays when the list is empty. Every route in the (app) group
    carries an h1 and wayfinding.spec.ts holds them to it — the arc 2 regression.
  */
  const header = (
    <div className="mb-[20px] flex items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">Ledger</h1>
        {capabilityId ? (
          <p className="mt-1.5 font-mono text-[11.5px] text-ink-3">
            {capabilityNames[capabilityId] ?? 'One capability'} ·{' '}
            <Link href="/ledger" className="underline hover:text-ink">
              show everything
            </Link>
          </p>
        ) : null}
      </div>
      <AddItemButton label="+ Add an item" capabilityOptions={capabilityOptions} />
    </div>
  )

  if (items.length === 0) {
    return (
      <>
        {header}
        <StateBlock
          eyebrow="Ledger"
          title={capabilityId ? 'Nothing for this capability yet' : 'Nothing here yet'}
          body="Record the decisions, PRs, diagrams and incidents your capstone produces. Each one is a title and a link — the thing itself lives where you made it."
          action={<AddItemButton label="+ Add an item" capabilityOptions={capabilityOptions} />}
        />
        <div className="mt-9 border-t border-rule pt-5">
          <BackToLibrary />
        </div>
      </>
    )
  }

  return (
    <>
      {header}
      <LedgerList items={items} capabilityNames={capabilityNames} />
      <div className="mt-9 border-t border-rule pt-5">
        <BackToLibrary />
      </div>
    </>
  )
}
