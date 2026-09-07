import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PhaseWorkspace } from '@/components/phases/phase-workspace'
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
  const all = await listPhases()
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
        capabilities={view.capabilities}
        isCurrent={view.phase.id === current}
      />
    </>
  )
}
