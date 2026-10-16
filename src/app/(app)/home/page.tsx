import Link from 'next/link'
import { readAppShellSummary } from '@/lib/data/app-shell'
import { readLatestLearningSource } from '@/lib/data/learning'

/**
 * The signed-in front door answers one question before showing a catalogue:
 * what is the most useful next action? Library remains the place to browse,
 * edit, and organise once a person chooses to go there.
 */
export default async function HomePage() {
  const [shell, lesson] = await Promise.all([readAppShellSummary(), readLatestLearningSource()])
  const nextLesson = lesson === null
    ? {
        eyebrow: 'Start learning',
        title: 'Turn one useful idea into a lesson.',
        body: 'Paste a transcript, article, or rough note. Keep the idea worth learning, then work through it actively.',
        href: '/learn',
        action: 'Start from a transcript →',
        detail: 'Lessons stay separate from your Library',
      }
    : {
        eyebrow: lesson.status === 'completed' ? 'Revisit a lesson' : 'Continue learning',
        title: lesson.lesson,
        body: lesson.status === 'completed'
          ? 'You completed this lesson once. Revisit it before the details become distant.'
          : 'Pick up where you left off: understand the idea, retrieve it, then use it in a new case.',
        href: `/learn/${lesson.id}`,
        action: lesson.status === 'completed' ? 'Review lesson →' : 'Continue lesson →',
        detail: lesson.status === 'completed' ? 'Completed lesson' : 'A guided lesson is waiting',
      }

  const practiceCopy = shell.rail.needsReview === 0
    ? 'Nothing is waiting for recall right now. Add a new idea or revisit a lesson when you are ready.'
    : `${shell.rail.needsReview} ${shell.rail.needsReview === 1 ? 'thing is' : 'things are'} ready for a recall.`

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-mono font-medium tracking-[0.14em] text-ink-3 uppercase">Home</p>
          <h1 className="mt-2 font-display text-detail-title font-medium tracking-[-0.03em]">Your next useful step.</h1>
          <p className="mt-1.5 max-w-[58ch] text-body text-ink-2">Choose one focused action, then get back to your day.</p>
        </div>
        <Link href="/library" className="mt-1 rounded-sm text-option text-accent-ink hover:text-ink">
          View library →
        </Link>
      </div>

      <section className="mt-8 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
        <article className="rounded-lg border border-accent/25 bg-accent-soft/50 p-6 shadow-card">
          <p className="font-mono text-mono font-medium tracking-[0.14em] text-accent-ink uppercase">{nextLesson.eyebrow}</p>
          <h2 className="mt-3 max-w-[24ch] font-display text-prompt leading-[1.12] font-medium tracking-[-0.03em]">{nextLesson.title}</h2>
          <p className="mt-3 max-w-[60ch] text-register leading-[1.55] text-ink-2">{nextLesson.body}</p>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
            <span className="font-mono text-mono-sm text-ink-3">{nextLesson.detail}</span>
            <Link href={nextLesson.href} className="inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-label font-medium text-white shadow-card hover:bg-accent-ink">
              {nextLesson.action}
            </Link>
          </div>
        </article>

        <article className="rounded-lg border border-rule bg-surface p-6 shadow-card">
          <p className="font-mono text-mono font-medium tracking-[0.14em] text-ink-3 uppercase">Ready now</p>
          <h2 className="mt-3 font-display text-[27px] leading-[1.12] font-medium tracking-[-0.025em]">Practice what needs another pass.</h2>
          <p className="mt-3 text-body leading-[1.55] text-ink-2">{practiceCopy}</p>
          <div className="mt-6 flex gap-1.5" aria-label={`${shell.rail.needsReview} prompts ready for practice`}>
            {Array.from({ length: Math.min(Math.max(shell.rail.needsReview, 1), 6) }, (_, index) => (
              <i key={index} className={`h-1.5 flex-1 rounded-full ${index < shell.rail.needsReview ? 'bg-ok' : 'bg-surface-3'}`} />
            ))}
          </div>
          <Link href="/practice" className="mt-6 inline-block rounded-sm text-option text-accent-ink hover:text-ink">Start practice →</Link>
        </article>
      </section>

      <section className="mt-9">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-mono font-medium tracking-[0.14em] text-ink-3 uppercase">Keep the thread going</p>
            <h2 className="mt-1 font-display text-card-title font-medium">The rest of your learning, at a glance.</h2>
          </div>
          <Link href="/sources" className="rounded-sm text-option text-accent-ink hover:text-ink">View sources →</Link>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Link href="/sources" className="rounded-lg border border-rule bg-surface p-5 shadow-card hover:border-rule-strong">
            <p className="font-mono text-mono text-ink-3 uppercase">Sources</p>
            <h3 className="mt-3 font-display text-card-title font-medium">{shell.sources} saved {shell.sources === 1 ? 'source' : 'sources'}</h3>
            <p className="mt-2 text-option text-ink-2">Bring in raw material when there is an idea worth keeping.</p>
          </Link>
          <Link href="/library?confidence=strong" className="rounded-lg border border-rule bg-surface p-5 shadow-card hover:border-rule-strong">
            <p className="font-mono text-mono text-ink-3 uppercase">Library</p>
            <h3 className="mt-3 font-display text-card-title font-medium">{Math.max(shell.rail.total - shell.rail.needsReview, 0)} holding up</h3>
            <p className="mt-2 text-option text-ink-2">Your settled ideas are still there when you need to use them.</p>
          </Link>
          <Link href="/phases" className="rounded-lg border border-rule bg-surface p-5 shadow-card hover:border-rule-strong">
            <p className="font-mono text-mono text-ink-3 uppercase">Phases</p>
            <h3 className="mt-3 font-display text-card-title font-medium">{shell.phases.demonstrated} of {shell.phases.total} demonstrated</h3>
            <p className="mt-2 text-option text-ink-2">Keep evidence of what you can actually do, not only what you read.</p>
          </Link>
        </div>
      </section>
    </>
  )
}
