import { TodayView } from '@/components/today/today-view'
import { railCounts } from '@/lib/data/library'
import { readLongestGap, readOpenBlockers, readRecentDays } from '@/lib/data/today'
import { practiceQueueSize } from '@/lib/domain/practice-selection'

/**
 * Today.
 *
 * ── This page reads and never writes ────────────────────────────────────────
 * Opening the app must not create a row. Every write in this arc lives in
 * ./actions.ts behind explicit form submission, and today-boundary.test.ts
 * asserts that this module and lib/data/today.ts name no write at all — proven by
 * adding an upsert here and watching that assertion fail.
 *
 * ── Why the date is not resolved here ───────────────────────────────────────
 * The server cannot know the user's local date: on a UTC host the calendar date is
 * wrong for a third of every day. So this fetches a WINDOW of recent days and the
 * client picks today's and yesterday's out of it, using localDateString — the same
 * helper and the same reason as evidence-section.tsx.
 */
export default async function TodayPage() {
  const [recent, openBlockers, counts, longestGap] = await Promise.all([
    readRecentDays(),
    readOpenBlockers(),
    railCounts(),
    readLongestGap(),
  ])

  return (
    <TodayView
      recent={recent}
      openBlockers={openBlockers}
      practice={{
        queued: practiceQueueSize(counts.total),
        needsReview: counts.needsReview,
        longestGap,
      }}
    />
  )
}
