'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createLearnSource } from '@/app/(app)/learn/actions'
import { Button } from '@/components/ui/button'

export function LearnStart() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const result = await createLearnSource(title, transcript)
      if (result.error !== null || result.id === undefined) {
        setError(result.error ?? 'The transcript could not be saved.')
        return
      }
      router.push(`/learn/${result.id}`)
    })
  }

  return (
    <section className="rounded-lg border border-rule bg-surface p-6 shadow-card">
      <div className="mb-6 border-b border-rule pb-5">
        <p className="font-mono text-mono-xs tracking-[0.14em] text-accent-ink uppercase">Start a lesson</p>
        <h2 className="mt-2 font-display text-[25px] leading-[1.15] font-medium tracking-[-0.018em]">Turn raw material into one idea worth keeping.</h2>
        <p className="mt-2 max-w-[68ch] text-meta leading-[1.6] text-ink-2">Paste a transcript, your notes, or an article. Recall turns it into a focused active-learning lesson without adding anything to your Library.</p>
      </div>
      <label className="block">
        <span className="text-label font-medium text-ink">Lesson name <span className="font-normal text-ink-3">(optional)</span></span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. JavaScript: The Hard Parts"
          className="mt-1.5 min-h-11 w-full rounded-md border border-rule-strong bg-surface px-3 text-body text-ink outline-none placeholder:text-ink-3 focus:border-accent"
        />
      </label>
      <label className="mt-4 block">
        <span className="text-label font-medium text-ink">Transcript</span>
        <textarea
          value={transcript}
          onChange={(event) => setTranscript(event.target.value)}
          rows={14}
          placeholder="Paste a video transcript, notes, or an article here…"
          className="mt-1.5 w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body leading-[1.55] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
        />
      </label>
      {error ? <p role="alert" className="mt-3 rounded-md border border-flag bg-flag-soft px-3 py-2 text-meta text-flag">{error}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={submit} loading={pending} loadingLabel="Saving transcript…">
          Create clean lesson →
        </Button>
        <p className="font-mono text-mono-sm text-ink-3">Nothing is extracted or added to your library yet</p>
      </div>
    </section>
  )
}
