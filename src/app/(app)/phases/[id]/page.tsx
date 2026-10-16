import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PhaseWorkspace } from '@/components/phases/phase-workspace'
import { ledgerByCapability } from '@/lib/data/ledger'
import { readCurrentPhaseId, readPhase } from '@/lib/data/phases'

export default async function PhasePage({ params }: PageProps<'/phases/[id]'>) {
  const { id } = await params
  const [view, current, ledger] = await Promise.all([readPhase(id), readCurrentPhaseId(), ledgerByCapability()])
  if (view === null) notFound()

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
