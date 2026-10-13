import Link from 'next/link'
import { LearnStart } from '@/components/learn/learn-start'
import { StateBlock } from '@/components/ui/state-block'
import { listSources } from '@/lib/data/sources'

export default async function LearnPage() {
  const sources = await listSources()

  return (
    <>
      <div className="mb-[26px]">
        <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">Learn</h1>
        <p className="mt-1.5 text-meta text-ink-2">
          Paste raw material, turn it into one clean lesson, then learn it actively.
        </p>
      </div>

      <LearnStart />

      <section className="mt-9">
        <h2 className="font-display text-card-title font-medium">Continue from a saved transcript</h2>
        {sources.length === 0 ? (
          <StateBlock
            eyebrow="Learn"
            title="Your next lesson starts above"
            body="Paste a transcript and choose the ideas you want to keep."
          />
        ) : (
          <ul className="mt-3 divide-y divide-rule rounded-lg border border-rule bg-surface">
            {sources.map(({ source }) => (
              <li key={source.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
                <div>
                  <p className="text-body font-medium text-ink">{source.lesson}</p>
              <p className="mt-0.5 font-mono text-mono-sm text-ink-3">{source.transcript_words === null ? 'No transcript' : `${source.transcript_words.toLocaleString()} words`}</p>
                </div>
                <Link href={`/learn/${source.id}`} className="inline-flex min-h-11 items-center rounded-md border border-rule-strong px-3 text-label font-medium text-ink hover:border-ink-3">Open →</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
