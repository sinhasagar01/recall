import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PhaseWorkspace } from '@/components/phases/phase-workspace'
import { ledgerByCapability } from '@/lib/data/ledger'
import { listPhases, readPhase } from '@/lib/data/phases'
import { currentPhaseId, demonstrationOf } from '@/lib/domain/phases'

export default async function PhasePage({ params }: PageProps<'/phases/[id]'>) {
  const { id } = await params
  const view = await readPhase(id)
  if (view === null) notFound()

  /*
    "Current" is a property of the whole list, not of one phase — the earliest
    not fully demonstrated. So the detail page asks the list, rather than
    inventing a second definition that could disagree with the one on /phases.
  */
  // One query for the whole page, grouped in the data layer — not one per
  // capability. The shape arcs 2 and 3 both use.
  const [all, ledger] = await Promise.all([listPhases(), ledgerByCapability()])
  const current = currentPhaseId(
    all.map((phase) => ({
      id: phase.phase.id,
      capabilities: phase.capabilities.map((c) => demonstrationOf(c.entries)),
    })),
  )

  return (
    <>
      <p className="mb-2 font-mono text-mono">
        <Link href="/phases" className="text-accent-ink underline hover:text-ink">
          ← Phases
        </Link>
      </p>
      <PhaseWorkspace
        phase={view.phase}
        capabilities={view.capabilities.map((c) => ({
          ...c,
          ledger: ledger.get(c.capability.id) ?? [],
        }))}
        isCurrent={view.phase.id === current}
      />
    </>
  )
}
