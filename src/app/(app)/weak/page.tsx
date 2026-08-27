import Link from 'next/link'
import { ConfidenceMeter } from '@/components/ui/confidence-meter'
import { StateBlock } from '@/components/ui/state-block'
import { listTopics } from '@/lib/data/topics'
import { lastPracticedLabel, needsReview, topicPath } from '@/lib/domain/library'
import { noShuffle, orderForPractice } from '@/lib/domain/practice-selection'

/*
  A list and a button. No analytics, no charts, no streaks, no scoring.

  Membership goes through `needsReview` — the same predicate as the rail count and
  the session summary — and the order through `orderForPractice`, which is the
  ordering `selectPracticeSession` uses, minus its session cap. `noShuffle` keeps
  a list page from reordering itself on every reload.
*/
export default async function WeakPage() {
  const { topics, readAt } = await listTopics()
  const at = new Date(readAt)

  const weak = orderForPractice(topics.filter(needsReview), { shuffle: noShuffle })
  const neverPracticed = weak.filter((topic) => topic.last_practiced_at === null).length

  return (
    <>
      <div className="mb-[22px]">
        <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">Weak topics</h1>
        <p className="mt-1 font-mono text-[11.5px] text-ink-3">
          {weak.length === 0
            ? 'Nothing below okay'
            : `${weak.length} ${weak.length === 1 ? 'topic' : 'topics'} · ${neverPracticed} never practiced`}
        </p>
      </div>

      {weak.length === 0 ? (
        <StateBlock
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="m5 13 4 4L19 7" />
            </svg>
          }
          title="Nothing needs review"
          body="Every topic is at okay or better. Keep adding — the gaps show up on their own."
          action={
            <>
              <Link
                href="/library"
                className="inline-flex cursor-pointer items-center rounded-md border border-accent bg-accent px-3.5 py-2.5 text-label font-medium text-white hover:border-accent-ink hover:bg-accent-ink"
              >
                + Add topic
              </Link>
              {/* Nothing is weak, but practising anyway is allowed. */}
              <Link
                href="/practice?all=1"
                className="inline-flex cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2.5 text-label font-medium text-ink hover:border-ink-3"
              >
                Practice anyway
              </Link>
            </>
          }
        />
      ) : (
        <>
          <div className="mb-5 flex items-center gap-4 rounded-lg border border-accent bg-accent-soft px-5 py-4">
            <div className="flex-1">
              <div className="font-medium text-accent-ink">
                Start with what you&rsquo;ve never recalled
              </div>
              <div className="font-mono text-[11.5px] text-accent-ink opacity-80">
                Never-practiced first, then weak by longest gap
              </div>
            </div>
            {/*
              A chosen set, so the three-topic floor does not apply — the same
              reasoning as "Practice this" from a topic's detail page.
            */}
            <Link
              href="/practice?scope=weak"
              className="inline-flex shrink-0 cursor-pointer items-center rounded-md border border-accent bg-accent px-3.5 py-2.5 text-label font-medium text-white hover:border-accent-ink hover:bg-accent-ink"
            >
              Practice all {weak.length}
            </Link>
          </div>

          <ul className="overflow-hidden rounded-lg border border-rule bg-surface">
            {weak.map((topic) => (
              <li
                key={topic.id}
                className="flex items-center gap-4 border-b border-rule px-[18px] py-[15px] last:border-b-0 hover:bg-surface-2"
              >
                <ConfidenceMeter confidence={topic.confidence} />

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/topic/${topic.id}`}
                    className="block font-display text-[16.5px] font-medium hover:underline"
                  >
                    {topic.title}
                  </Link>
                  <div className="font-mono text-mono-sm text-ink-3">
                    {topicPath(topic)} — {lastPracticedLabel(topic, at)}
                  </div>
                </div>

                <Link
                  href={`/practice?topic=${topic.id}`}
                  aria-label={`Practice ${topic.title}`}
                  className="inline-flex shrink-0 cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2.5 text-label font-medium text-ink hover:border-ink-3"
                >
                  Practice
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
