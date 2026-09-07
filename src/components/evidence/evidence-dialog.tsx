'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Segmented } from '@/components/ui/segmented'
import { EVIDENCE_COPY, EVIDENCE_KINDS, type EvidenceEntry, type EvidenceKind } from '@/lib/domain/evidence'
import { recordEvidence, removeEvidence } from '@/app/(app)/topic/[id]/evidence-actions'

/**
 * Recording one marker. Three fields, one required.
 *
 * `today` is a PROP, never `new Date()` read in here. The date defaults to today
 * because you record this when you do it, and computing it inside the component
 * would be both untestable and wrong: `toISOString()` is UTC, so just after
 * midnight east of Greenwich it offers yesterday. `localDateString` does the
 * formatting and is unit-tested at both boundaries.
 *
 * `askKind` is the mobile path — below the breakpoint the per-cell buttons are
 * unreachable by touch, so one button opens this and it asks which kind first.
 */
export function EvidenceDialog({
  topicId,
  kind,
  existing,
  today,
  askKind,
  onClose,
}: {
  topicId: string
  kind: EvidenceKind
  existing: EvidenceEntry | null
  today: string
  askKind: boolean
  onClose: () => void
}) {
  const [chosen, setChosen] = useState<EvidenceKind>(kind)
  const [note, setNote] = useState(existing?.note ?? '')
  const [at, setAt] = useState(existing?.at ?? today)
  const [url, setUrl] = useState(existing?.url ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const copy = EVIDENCE_COPY[chosen]

  const submit = (formData: FormData) => {
    setError(null)
    startSaving(async () => {
      const result = await recordEvidence(topicId, chosen, formData)
      if (result.error !== null) {
        setError(result.error)
        return
      }
      onClose()
    })
  }

  const remove = () => {
    setError(null)
    startSaving(async () => {
      const result = await removeEvidence(topicId, chosen)
      if (result.error !== null) {
        setError(result.error)
        return
      }
      onClose()
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? `Edit ${copy.label.toLowerCase()}` : `Record a ${copy.label.toLowerCase()}`}
      footer={
        <>
          <Button type="submit" form="evidence" variant="primary" loading={isSaving} loadingLabel="Saving…">
            Save
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {/* Editing an existing entry offers Remove in the footer. */}
          {existing ? (
            <Button variant="danger-quiet" onClick={remove} className="ml-auto">
              Remove
            </Button>
          ) : null}
        </>
      }
    >
      <form id="evidence" action={submit}>
        {error ? (
          <p
            role="alert"
            className="mb-[18px] rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag"
          >
            {error}
          </p>
        ) : null}

        {askKind ? (
          <div className="mb-[18px]">
            <Segmented
              legend="Which kind"
              name="kind"
              options={EVIDENCE_KINDS.map((value) => ({ value, label: EVIDENCE_COPY[value].label }))}
              value={chosen}
              onChange={(next) => setChosen(next as EvidenceKind)}
            />
          </div>
        ) : null}

        <p className="mb-[18px] text-meta text-ink-2">{copy.prompt}</p>

        <div className="mb-[18px]">
          <label htmlFor="note" className="mb-1.5 block text-label font-medium text-ink">
            What you did
          </label>
          <textarea
            id="note"
            name="note"
            required
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body leading-[1.5] text-ink outline-offset-[-1px] focus:border-accent focus:outline-2 focus:outline-accent"
          />
        </div>

        <div className="mb-[18px]">
          <label htmlFor="at" className="mb-1.5 block text-label font-medium text-ink">
            When
          </label>
          <input
            id="at"
            name="at"
            type="date"
            required
            value={at}
            onChange={(event) => setAt(event.target.value)}
            className="rounded-md border border-rule-strong bg-surface px-3 py-2.5 font-mono text-[13px] text-ink outline-offset-[-1px] focus:border-accent focus:outline-2 focus:outline-accent"
          />
        </div>

        <div className="mb-[18px]">
          <label htmlFor="url" className="mb-1.5 block text-label font-medium text-ink">
            Link
            <span className="ml-1.5 font-mono text-mono font-normal text-ink-3">
              optional — a PR, gist, ADR
            </span>
          </label>
          <input
            id="url"
            name="url"
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body text-ink outline-offset-[-1px] placeholder:text-ink-3 focus:border-accent focus:outline-2 focus:outline-accent"
          />
        </div>
      </form>
    </Modal>
  )
}
