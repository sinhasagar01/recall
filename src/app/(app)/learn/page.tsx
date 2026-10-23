import { LearnStart } from '@/components/learn/learn-start'
import { SavedLessons } from '@/components/learn/saved-lessons'
import { StateBlock } from '@/components/ui/state-block'
import { PageHeader } from '@/components/ui/page-header'
import { listLearningSources } from '@/lib/data/learning'

export default async function LearnPage() {
  const lessons = await listLearningSources()
  const completed = lessons.filter((lesson) => lesson.status === 'completed').length
  const inProgress = lessons.filter((lesson) => lesson.status === 'in_progress').length

  return (
    <>
      <PageHeader
        eyebrow="Guided learning"
        title="Learn"
        summary="Paste raw material, turn it into one clean lesson, then learn it actively."
      />

      <LearnStart />

      <section className="mt-10 rounded-lg border border-rule bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-mono-sm tracking-[.14em] text-accent-ink uppercase">Your lesson shelf</p>
            <h2 className="mt-1 font-display text-[24px] leading-[1.15] font-medium">Continue from a saved transcript</h2>
          </div>
          {lessons.length > 0 ? <div className="flex gap-2 font-mono text-mono-sm"><span className="rounded-full border border-rule bg-surface px-2.5 py-1.5 text-ink-2">{inProgress} active</span><span className="rounded-full border border-ok/45 bg-ok-soft px-2.5 py-1.5 text-ok">{completed} complete</span></div> : null}
        </div>
        <p className="mt-2 text-meta text-ink-2">Lessons are separate from your Library. Continue one, revisit a finished lesson, or remove a transcript you no longer need.</p>
        {lessons.length === 0 ? (
          <StateBlock
            eyebrow="Learn"
            title="Your next lesson starts above"
            body="Paste a transcript, turn it into a clean lesson, then work through it actively."
          />
        ) : (
          <SavedLessons lessons={lessons} />
        )}
      </section>
    </>
  )
}
