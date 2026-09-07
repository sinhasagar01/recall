'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { createPhase, savePhase } from '@/app/(app)/phases/actions'
import type { Phase } from '@/lib/domain/phases'

/**
 * Three fields, one required.
 *
 * "When" is free text and the hint says so. A date picker here would let the
 * product work out that you are behind, and it is not going to do that.
 */
export function PhaseSheet({ phase, onClose }: { phase?: Phase; onClose: () => void }) {
  const router = useRouter()
  const [name, setName] = useState(phase?.name ?? '')
  const [when, setWhen] = useState(phase?.when_text ?? '')
  const [sources, setSources] = useState(phase?.sources_text ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const submit = (formData: FormData) => {
    setError(null)
    startSaving(async () => {
      const result = phase ? await savePhase(phase.id, formData) : await createPhase(formData)

      if (result.error !== null) {
        setError(result.error)
        return
      }
      onClose()
      if (!phase && result.id) router.push(`/phases/${result.id}`)
    })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={phase ? 'Edit phase' : 'Add a phase'}
      footer={
        <>
          <Button type="submit" form="phase" variant="primary" size="lg" loading={isSaving} loadingLabel="Saving…">
            Save phase
          </Button>
          <span className="font-mono text-[11.5px] text-ink-3">Only the name is required</span>
        </>
      }
    >
      <form id="phase" action={submit}>
        {error ? (
          <p role="alert" className="mb-[18px] rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag">
            {error}
          </p>
        ) : null}

        <Field label="Name" name="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Field
          label="When"
          name="when_text"
          hint="optional · free text"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <Field
          label="Sources"
          name="sources_text"
          hint="optional · what you are learning from"
          value={sources}
          onChange={(e) => setSources(e.target.value)}
        />
        <p className="font-mono text-[11px] text-ink-3">
          “When” is free text, not a date. A date would let this tell you that you are behind.
        </p>
      </form>
    </Sheet>
  )
}
