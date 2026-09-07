'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CapabilityRow } from '@/components/phases/capability-row'
import { PhaseSheet } from '@/components/phases/phase-sheet'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { addCapability, removePhase } from '@/app/(app)/phases/actions'
import { deletePhaseCopy, demonstrationOf } from '@/lib/domain/phases'
import type { ProjectItem } from '@/lib/domain/ledger'
import type { Capability, Phase } from '@/lib/domain/phases'
import { plural } from '@/lib/domain/plural'
import type { Topic } from '@/lib/domain/types'

export interface CapabilityView {
  capability: Capability
  entries: Topic[]
  /** Context only — see CapabilityRow. */
  ledger?: ProjectItem[]
}

/**
 * One phase and the handful of things you will be able to do at the end of it.
 *
 * There is no "mark complete" here, and no percentage, burn-down or week counter.
 * "2 of 4" is a count you can click through to, which is the only kind of number
 * this product carries.
 */
export function PhaseWorkspace({
  phase,
  capabilities,
  isCurrent,
}: {
  phase: Phase
  capabilities: CapabilityView[]
  isCurrent: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const demonstrated = capabilities.filter(
    (view) => demonstrationOf(view.entries).demonstrated,
  ).length

  const linkedTopics = capabilities.reduce((total, view) => total + view.entries.length, 0)
  const copy = deletePhaseCopy(capabilities.length, linkedTopics)

  const submitCapability = (formData: FormData) => {
    setError(null)
    startTransition(async () => {
      const result = await addCapability(phase.id, formData)
      if (result.error !== null) {
        setError(result.error)
        return
      }
      setName('')
      setAdding(false)
      router.refresh()
    })
  }

  return (
    <>
      <div className="mb-[22px] flex items-start justify-between gap-5">
        <div>
          <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">
            {phase.name}
          </h1>
          <p className="mt-1.5 font-mono text-[11.5px] text-ink-3">
            {phase.when_text ? `${phase.when_text} · ` : ''}
            {demonstrated} of {capabilities.length} demonstrated
            {isCurrent ? ' · current' : ''}
          </p>
          {phase.sources_text ? (
            <p className="mt-1 font-mono text-[11.5px] text-ink-3">{phase.sources_text}</p>
          ) : null}
        </div>
        <Button variant="ghost" onClick={() => setEditing(true)}>
          Edit phase
        </Button>
      </div>

      <div className="rounded-lg border border-rule bg-surface px-[17px] shadow-[0_1px_2px_rgba(18,19,26,.05)]">
        {capabilities.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-[26px] text-center">
            <h2 className="font-display text-[18px] font-medium">No capabilities yet</h2>
            <p className="max-w-[46ch] text-[13.5px] text-ink-2">
              What will you be able to do at the end of this phase? Write them as abilities.
            </p>
          </div>
        ) : (
          capabilities.map((view) => (
            <CapabilityRow
              key={view.capability.id}
              capability={view.capability}
              entries={view.entries}
              ledger={view.ledger}
            />
          ))
        )}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2.5">
        {adding ? null : (
          <Button onClick={() => setAdding(true)}>+ Add a capability</Button>
        )}
      </div>

      {adding ? (
        <form action={submitCapability} className="mt-3.5 max-w-[520px]">
          <label htmlFor="capability-name" className="mb-1.5 block text-label font-medium text-ink">
            What you will be able to do
          </label>
          <textarea
            id="capability-name"
            name="name"
            rows={2}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body leading-[1.6] text-ink outline-offset-[-1px] focus:border-accent focus:outline-2 focus:outline-accent"
          />
          <p className="mt-1.5 font-mono text-[11px] text-ink-3">
            Write it as an ability, not a subject. “Explain the event loop without notes”, not
            “Event loop”.
          </p>
          {error ? (
            <p role="alert" className="mt-2 text-meta text-flag">
              {error}
            </p>
          ) : null}
          <div className="mt-2.5 flex gap-2.5">
            <Button type="submit" variant="primary" loading={isPending} loadingLabel="Saving…">
              Save capability
            </Button>
            <Button variant="ghost" type="button" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {/*
        You never tick these. Stated on the screen, not only in the docs — the box
        above has no click handler and there is no column behind it.
      */}
      <div className="my-5 max-w-[74ch] rounded-md border border-l-[3px] border-accent bg-surface px-[18px] py-3.5">
        <p className="font-medium text-accent-ink">You never tick these</p>
        <p className="mt-1 text-[13.5px] text-ink-2">
          A capability is demonstrated when <strong>something linked to it is at okay or better
          on recall</strong> and <strong>something linked to it carries rebuild, challenge or
          production evidence</strong>. A course ending changes nothing here.
        </p>
      </div>

      <div className="mt-8 border-t border-rule pt-5">
        <Button variant="danger-quiet" onClick={() => setConfirming(true)}>
          Delete phase
        </Button>
      </div>

      {editing ? <PhaseSheet phase={phase} onClose={() => setEditing(false)} /> : null}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Delete “${phase.name}”?`}
        footer={
          <>
            <Button onClick={() => setConfirming(false)}>Keep it</Button>
            <Button
              variant="danger"
              loading={isPending}
              loadingLabel="Deleting…"
              onClick={() =>
                startTransition(async () => {
                  const result = await removePhase(phase.id)
                  if (result.error !== null) {
                    setError(result.error)
                    return
                  }
                  router.push('/phases')
                  router.refresh()
                })
              }
            >
              Delete phase
            </Button>
          </>
        }
      >
        {/*
          The confirmation names what dies and what does not, and the sentence is
          built in the domain so it agrees with its own counts — see
          deletePhaseCopy. The promise it makes is kept by the schema: cascade to
          capabilities, set null to topics.
        */}
        <p className="text-body leading-[1.6] text-ink-2">
          {copy.removes}.{' '}
          {copy.kept === '' ? null : (
            <>
              <strong className="font-medium text-ink">{copy.kept.split(' — ')[0]}</strong>
              {' — '}
              {copy.kept.split(' — ')[1]}.{' '}
            </>
          )}
          It can’t be undone.
        </p>
      </Modal>
    </>
  )
}

export function phaseSummary(capabilities: CapabilityView[]): string {
  const demonstrated = capabilities.filter(
    (view) => demonstrationOf(view.entries).demonstrated,
  ).length
  return `${demonstrated} of ${plural(capabilities.length, 'capability', 'capabilities')}`
}
