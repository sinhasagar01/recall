'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { updateLearnSource } from '@/app/(app)/learn/actions'
import { Button } from '@/components/ui/button'

export function LearningSourceEditor({
  sourceId,
  initialLesson,
  initialTranscript,
}: {
  sourceId: string
  initialLesson: string
  initialTranscript: string
}) {
  const router = useRouter()
  const [lesson, setLesson] = useState(initialLesson)
  const [transcript, setTranscript] = useState(initialTranscript)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const transcriptChanged = transcript.trim() !== initialTranscript

  const save = () => {
    setError(null)
    startTransition(async () => {
      const result = await updateLearnSource(sourceId, lesson, transcript)
      if (result.error !== null) {
        setError(result.error)
        return
      }
      router.push(`/learn/${sourceId}`)
      router.refresh()
    })
  }

  return (
    <section className="rounded-lg border border-rule-strong bg-surface p-5 shadow-card md:p-7">
      <label className="block">
        <span className="font-mono text-mono-sm tracking-[.1em] text-ink-2 uppercase">Lesson name</span>
        <input
          value={lesson}
          onChange={(event) => setLesson(event.target.value)}
          required
          className="mt-1.5 min-h-11 w-full rounded-md border border-rule-strong bg-surface px-3 text-body text-ink outline-none placeholder:text-ink-3 focus:border-accent"
        />
      </label>

      <label className="mt-4 block">
        <span className="font-mono text-mono-sm tracking-[.1em] text-ink-2 uppercase">Transcript</span>
        <textarea
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          rows={16}
          required
          className="mt-1.5 w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body leading-[1.55] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
        />
      </label>

      {transcriptChanged ? (
        <p className="mt-3 rounded-md border border-accent/35 bg-accent-soft px-3 py-2 text-meta text-accent-ink">
          Updating the transcript will reset its generated lesson, so it can be shaped from the new material.
        </p>
      ) : null}
      {error ? <p role="alert" className="mt-3 rounded-md border border-flag bg-flag-soft px-3 py-2 text-meta text-flag">{error}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={save} loading={pending} loadingLabel="Saving changes…">Save changes</Button>
        <Link href={`/learn/${sourceId}`} className="inline-flex min-h-10 items-center px-2 text-label font-medium text-ink-2 hover:text-ink">Cancel</Link>
      </div>
    </section>
  )
}
