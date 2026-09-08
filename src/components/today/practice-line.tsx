import Link from 'next/link'
import { plural } from '@/lib/domain/plural'

/**
 * The one derived thing on this page.
 *
 * Every number links through to what it counts — the product review's rule: *if a
 * number here cannot be clicked through to what it counts, it does not belong
 * here.* Queued goes to the session, needs-review to the weak page, and the
 * longest gap to the topic that has it.
 *
 * **A number with no destination is not shown.** If nothing has ever been
 * practised there is no gap to report, so the phrase is omitted rather than
 * rendered as a dead figure — which is the same rule as "a topic with no source
 * omits the section", applied to a number.
 *
 * No weak-topic list here. That is the weak page's job, and duplicating it is how
 * this page becomes a dashboard.
 */
export function PracticeLine({
  queued,
  needsReview,
  longestGap,
}: {
  queued: number
  needsReview: number
  longestGap: { id: string; title: string; days: number } | null
}) {
  return (
    <div className="mt-3.5 flex items-center gap-3.5 rounded-lg border border-rule bg-surface px-[18px] py-4">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium">
          <Link href="/practice" className="text-ink hover:underline">
            {plural(queued, 'topic')} queued for practice
          </Link>
        </p>
        <p className="mt-[3px] flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-ink-3">
          <Link href="/weak" className="underline hover:text-ink">
            {needsReview} need review
          </Link>
          {longestGap ? (
            <>
              <span aria-hidden="true">·</span>
              <Link href={`/topic/${longestGap.id}`} className="underline hover:text-ink">
                longest gap {plural(longestGap.days, 'day')}
              </Link>
            </>
          ) : null}
        </p>
      </div>

      {/*
        A Link styled as a button, matching weak-list.tsx:70. A <Button> wrapping
        an <a> is invalid markup and gives a screen reader two nested controls.
      */}
      <Link
        href="/practice"
        className="inline-flex shrink-0 cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2.5 text-label font-medium text-ink hover:border-ink-3"
      >
        Practice
      </Link>
    </div>
  )
}
