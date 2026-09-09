import Link from 'next/link'
import { WeakList } from '@/components/topics/weak-list'
import { StateBlock } from '@/components/ui/state-block'
import { railCounts } from '@/lib/data/library'
import { weakPage, type WeakCursor } from '@/lib/data/practice'
import { STALE_WINDOW_DAYS } from '@/lib/domain/confidence'
import type { QueueTopic, Topic } from '@/lib/domain/types'
import { practiceWeakLabel } from '@/lib/domain/practice-selection'

/*
  A list and a button. No analytics, no charts, no streaks, no scoring.

  Membership and order both come from the query now. Membership is still
  `needsReview` — REVIEW_CONFIDENCES is derived from that predicate rather than
  listed again — and the order is still `orderForPractice`'s, asserted id-for-id
  against it in the parity suite. Passing no seed leaves the tie-break at
  `created_at desc, id desc`, so the page does not reorder itself on every reload.
*/
export default async function WeakPage() {
  /*
    Two counts, two different questions. `total` is how many need review; the
    library total is how many exist at all. Without the second, a library with no
    topics rendered "Every topic is at okay or better" — a sentence about topics
    that do not exist. The library page has always kept empty-library and
    no-results apart (DESIGN.md, "No-results offers"); this page had not.

    railCounts is cache()d and the layout called it for this same request, so the
    second read costs nothing.
  */
  const [{ topics, nextCursor, total, neverPracticed, stale, staleTotal, staleCursor, readAt }, library] = await Promise.all([
    weakPage(),
    railCounts(),
  ])

  const libraryIsEmpty = library.total === 0

  return (
    <>
      <div className="mb-[22px]">
        <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">Weak topics</h1>
        <p className="mt-1 font-mono text-[11.5px] text-ink-3">
          {libraryIsEmpty
            ? 'Nothing saved yet'
            : total === 0
              ? 'Nothing below okay'
              : /*
                  No noun. This page lists whatever needs review, and since arc 1
                  that includes quizzes — so "11 topics" was the same falsehood the
                  library header carried. The two counts stay: how many need
                  review and how many have never been practised are different
                  questions, which is the test the library's pair failed.
                */
                `${total} need review · ${neverPracticed} never practiced`}
        </p>
      </div>

      {libraryIsEmpty ? (
        /*
          No topics at all. Only one action: "Practice anyway" would offer a door
          into a screen that can only say "not enough to practice yet", and an
          empty library has nothing to practise anyway.
        */
        <StateBlock
          eyebrow="Empty library"
          title="Nothing to review yet"
          body="This page shows what you've saved but can't yet explain. Save something first — anything new starts here, because you haven't tried to recall it."
          action={
            <Link
              href="/library?add=1"
              className="inline-flex cursor-pointer items-center rounded-md border border-accent bg-accent px-3.5 py-2.5 text-label font-medium text-white hover:border-accent-ink hover:bg-accent-ink"
            >
              + Add your first topic
            </Link>
          }
        />
      ) : total === 0 ? (
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
              {/*
                `?add=1`, not `/library`. It said "+ Add topic" and delivered you
                to the library with no form open — the same mislabelling the
                practice page's empty state carried, found by the same search.
              */}
              <Link
                href="/library?add=1"
                className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-accent bg-accent px-3.5 py-2.5 text-label font-medium text-white hover:border-accent-ink hover:bg-accent-ink"
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
      ) : null}

      {total === 0 && !libraryIsEmpty ? (
        <div className="mt-9">
          <StaleSection topics={stale} cursor={staleCursor} total={staleTotal} readAt={readAt} />
        </div>
      ) : null}

      {total > 0 ? (
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
              {practiceWeakLabel(total)}
            </Link>
          </div>

          <WeakList
            initial={topics}
            initialCursor={nextCursor}
            total={total}
            readAt={readAt}
          />

          <StaleSection
            topics={stale}
            cursor={staleCursor}
            total={staleTotal}
            readAt={readAt}
          />
        </>
      ) : null}
    </>
  )
}

/**
 * Settled, and quiet for long enough that it is worth checking.
 *
 * Confidence does not decay — see issue #13. Grading something "knew it" removes
 * it from the list above for good, so a library that has been fully graded shows
 * an empty weak page and has nothing to say. This asks a second question beside
 * the first rather than expiring the grade, which would make things reappear
 * because a clock moved.
 *
 * No section-level practice button on purpose: the rows carry their own, and a
 * batch entry point would need a new session scope for a list you are meant to
 * browse rather than drill.
 */
function StaleSection({
  topics,
  cursor,
  total,
  readAt,
}: {
  topics: QueueTopic[]
  cursor: WeakCursor | null
  total: number
  readAt: string
}) {
  if (total === 0) return null

  return (
    <section className="mt-[38px]">
      <div className="mb-4 flex items-center gap-3">
        <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
          Settled, but quiet
        </span>
        <span className="h-px flex-1 bg-rule" />
      </div>

      <p className="mb-4 font-mono text-[11.5px] text-ink-3">
        {total} {total === 1 ? 'topic you knew' : 'topics you knew'} and haven&rsquo;t
        practiced in {STALE_WINDOW_DAYS} days. Still marked okay or strong — this is a
        question, not a verdict.
      </p>

      <WeakList
        scope="stale"
        initial={topics}
        initialCursor={cursor}
        total={total}
        readAt={readAt}
      />
    </section>
  )
}
