'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { removeLearningSource } from '@/app/(app)/learn/actions'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { LearningSourceSummary } from '@/lib/data/learning'

const STATUS = {
  ready: { label: 'Ready to shape', className: 'border-rule-strong bg-surface-2 text-ink-2', action: 'Create lesson →' },
  in_progress: { label: 'In progress', className: 'border-accent/35 bg-accent-soft text-accent-ink', action: 'Resume →' },
  completed: { label: 'Completed', className: 'border-[#c8e8d5] bg-ok-soft text-ok', action: 'Revisit →' },
} as const

export function SavedLessons({ lessons }: { lessons: LearningSourceSummary[] }) {
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<LearningSourceSummary | null>(null)
  const [pending, startTransition] = useTransition()

  const remove = (lesson: LearningSourceSummary) => {
    setError(null)
    setRemoving(lesson.id)
    startTransition(async () => {
      const result = await removeLearningSource(lesson.id)
      if (result.error) {
        setError(result.error)
        setRemoving(null)
      }
    })
  }

  return (
    <div className="mt-4">
      {error ? <p role="alert" className="mb-3 rounded-md border border-flag bg-flag-soft px-3 py-2 text-meta text-flag">{error}</p> : null}
      <ul className="grid gap-3">
        {lessons.map((lesson) => {
          const status = STATUS[lesson.status]
          const isRemoving = pending && removing === lesson.id
          return <li key={lesson.id} className="group flex flex-wrap items-center justify-between gap-4 rounded-lg border border-rule bg-surface px-5 py-5 transition hover:border-accent/45 hover:shadow-card">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-display text-card-title font-semibold tracking-[-.02em] text-ink">{lesson.lesson}</p>
                <span className={`rounded-full border px-2 py-1 font-mono text-[10px] tracking-[.08em] uppercase ${status.className}`}>{status.label}</span>
              </div>
              <p className="mt-1.5 font-mono text-mono-sm text-ink-3">{lesson.transcriptWords === null ? 'No transcript' : `${lesson.transcriptWords.toLocaleString()} words`} · saved {new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(lesson.createdAt))}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/learn/${lesson.id}`} className="inline-flex min-h-10 items-center rounded-md border border-rule-strong px-3 text-label font-medium text-ink hover:border-ink-3">{status.action}</Link>
              <Link href={`/learn/${lesson.id}/edit`} className="inline-flex min-h-10 items-center rounded-md border border-transparent px-3 text-label font-medium text-ink-2 hover:border-rule hover:bg-surface-2 hover:text-ink">Edit</Link>
              <Button variant="danger-quiet" disabled={isRemoving} loading={isRemoving} loadingLabel="Deleting…" aria-label={`Delete ${lesson.lesson}`} onClick={() => setConfirming(lesson)}>Delete</Button>
            </div>
          </li>
        })}
      </ul>
      <Modal
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Delete this saved lesson?"
        footer={<><Button variant="ghost" onClick={() => setConfirming(null)}>Cancel</Button><Button variant="danger" loading={pending && removing === confirming?.id} loadingLabel="Deleting…" onClick={() => { if (confirming) { remove(confirming); setConfirming(null) } }}>Delete lesson</Button></>}
      >
        This removes the transcript and its clean lesson. Any Library cards made from this source will stay in your Library.
      </Modal>
    </div>
  )
}
