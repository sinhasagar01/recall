'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { createSource, saveSource } from '@/app/(app)/sources/actions'
import type { Source } from '@/lib/domain/sources'

/**
 * Four fields, one required.
 *
 * The transcript is optional — a source is useful with just a title and a URL,
 * and a lesson you took notes from on paper still deserves a record. Nothing is
 * summarised, extracted or generated for you.
 */
export function SourceSheet({
  source,
  onClose,
}: {
  source?: Source
  onClose: () => void
}) {
  const router = useRouter()
  const [title, setTitle] = useState(source?.title ?? '')
  const [course, setCourse] = useState(source?.course ?? '')
  const [url, setUrl] = useState(source?.url ?? '')
  const [transcript, setTranscript] = useState(source?.transcript ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const submit = (formData: FormData) => {
    setError(null)
    startSaving(async () => {
      const result = source
        ? await saveSource(source.id, formData)
        : await createSource(formData)

      if (result.error !== null) {
        setError(result.error)
        return
      }
      onClose()
      if (!source && result.id) router.push(`/sources/${result.id}`)
    })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={source ? 'Edit source' : 'Add a source'}
      footer={
        <>
          <Button type="submit" form="source" variant="primary" size="lg" loading={isSaving} loadingLabel="Saving…">
            Save source
          </Button>
          <span className="font-mono text-[11.5px] text-ink-3">Only the title is required</span>
        </>
      }
    >
      <form id="source" action={submit}>
        {error ? (
          <p role="alert" className="mb-[18px] rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag">
            {error}
          </p>
        ) : null}

        <Field label="Title" name="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <Field label="Course" name="course" hint="optional" value={course} onChange={(e) => setCourse(e.target.value)} />
        <Field
          label="URL"
          name="url"
          hint="optional — so you can go back to it"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <div className="mb-[18px]">
          <label htmlFor="transcript" className="mb-1.5 block text-label font-medium text-ink">
            Transcript
            <span className="ml-1.5 font-mono text-mono font-normal text-ink-3">
              optional · scratch, deletable
            </span>
          </label>
          <textarea
            id="transcript"
            name="transcript"
            rows={8}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body leading-[1.6] text-ink outline-offset-[-1px] focus:border-accent focus:outline-2 focus:outline-accent"
          />
        </div>
      </form>
    </Sheet>
  )
}
