import Link from 'next/link'
import { EarlierDays } from '@/components/today/earlier-days'
import { StateBlock } from '@/components/ui/state-block'
import { readAllDays } from '@/lib/data/today'

/**
 * Earlier days — a log you read, deliberately not a chart.
 *
 * No calendar grid, no heatmap, no streak, no completion rate over time. The one
 * thing worth looking back for is a blocker — "what was I stuck on last Tuesday,
 * and did I ever resolve it?" — and the way to answer that is to read the words.
 *
 * Days with no row do not appear. A day you never opened the app is not a record
 * of anything, and an empty row would imply a failure that did not happen.
 */
export default async function EarlierDaysPage() {
  const days = await readAllDays()

  const header = (
    <div className="mb-[22px]">
      <p className="mb-2 font-mono text-mono">
        <Link href="/today" className="text-accent-ink underline hover:text-ink">
          ← Today
        </Link>
      </p>
      <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">Earlier days</h1>
      <p className="mt-1.5 font-mono text-[11.5px] text-ink-3">
        {days.length === 0
          ? 'Nothing recorded yet'
          : `${days.length} ${days.length === 1 ? 'day' : 'days'} recorded · newest first`}
      </p>
    </div>
  )

  if (days.length === 0) {
    return (
      <>
        {header}
        <StateBlock
          eyebrow="Earlier days"
          title="Nothing recorded yet"
          body="Days you write on show up here, newest first. A day you never opened the app is not a record of anything and gets no row."
        />
      </>
    )
  }

  return (
    <>
      {header}
      <EarlierDays days={days} />
    </>
  )
}
