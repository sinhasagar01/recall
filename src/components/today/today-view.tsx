'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { IntentionRow } from '@/components/today/intention-row'
import { PracticeLine } from '@/components/today/practice-line'
import { Button } from '@/components/ui/button'
import { resolveBlocker, saveBlocker, saveDay, setDone } from '@/app/(app)/today/actions'
import { localDateString } from '@/lib/domain/evidence'
import { formatShortDate } from '@/lib/domain/library'
import {
  INTENTIONS,
  INTENTION_LABEL,
  INTENTION_PLACEHOLDER,
  dayCounts,
  doneOf,
  openBlockerCopy,
  prefillFrom,
  textOf,
  type Day,
  type Intention,
} from '@/lib/domain/today'

/**
 * The Today shell, which exists to answer one question the server cannot: what
 * day is it where you are?
 *
 * `localDateString` needs the browser's timezone — on a UTC host the calendar
 * date is wrong for a third of every day. Computing it during render would
 * hydrate the server's date and then swap it, a visible wrong-day flash on the
 * one page whose entire content is keyed by the date. So it resolves after mount.
 */
export function TodayView({
  recent,
  openBlockers,
  practice,
}: {
  recent: Day[]
  openBlockers: Day[]
  practice: {
    queued: number
    needsReview: number
    longestGap: { id: string; title: string; lastPracticedAt: string } | null
  }
}) {
  const [today, setToday] = useState<string | null>(null)

  useEffect(() => {
    setToday(localDateString(new Date()))
  }, [])

  if (today === null) {
    return (
      <>
        <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">Today</h1>
        <p className="mt-1.5 font-mono text-[11.5px] text-ink-3">Working out what day it is…</p>
      </>
    )
  }

  return (
    <TodayBoard today={today} recent={recent} openBlockers={openBlockers} practice={practice} />
  )
}

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

function TodayBoard({
  today,
  recent,
  openBlockers,
  practice,
}: {
  today: string
  recent: Day[]
  openBlockers: Day[]
  practice: {
    queued: number
    needsReview: number
    longestGap: { id: string; title: string; lastPracticedAt: string } | null
  }
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const row = recent.find((day) => day.day === today) ?? null

  /*
    Yesterday specifically, not "the most recent day". A line you left unticked
    three weeks ago is not something to hand back this morning — prefill is about
    continuing yesterday, and anything older belongs in Earlier days.
  */
  const yesterdayKey = (() => {
    const date = new Date(`${today}T12:00:00`)
    date.setDate(date.getDate() - 1)
    return localDateString(date)
  })()
  const yesterday = recent.find((day) => day.day === yesterdayKey) ?? null
  const prefill = prefillFrom(yesterday)

  const counts = dayCounts(row)
  const written = INTENTIONS.some((slot) => textOf(row, slot) !== null)

  /*
    The oldest unresolved blocker from an EARLIER day. Today's own blocker is the
    editable field below; this is the one that outlived its day.
  */
  const carried = openBlockers.filter((day) => day.day < today)
  const oldest = carried[0] ?? null

  const longestGap = practice.longestGap
    ? {
        ...practice.longestGap,
        days: Math.max(
          0,
          Math.round(
            (Date.parse(`${today}T12:00:00`) -
              Date.parse(practice.longestGap.lastPracticedAt)) /
              86_400_000,
          ),
        ),
      }
    : null

  const run = (action: () => Promise<{ error: string | null }>) =>
    startTransition(async () => {
      const result = await action()
      if (result.error !== null) {
        setError(result.error)
        return
      }
      setError(null)
      router.refresh()
    })

  return (
    <>
      <div className="mb-[22px] flex items-start justify-between gap-5">
        <div>
          <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">Today</h1>
          <p className="mt-1.5 font-mono text-[11.5px] text-ink-3">{dayLabel(today)}</p>
        </div>
        <Link
          href="/today/earlier"
          className="flex-none pt-3 font-mono text-mono text-accent-ink underline hover:text-ink"
        >
          Earlier days
        </Link>
      </div>

      {error ? (
        <p role="alert" className="mb-4 rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag">
          {error}
        </p>
      ) : null}

      {written ? (
        <>
          <div className="rounded-lg border border-rule bg-surface px-[17px]">
            {INTENTIONS.map((slot) => (
              <IntentionRow
                key={slot}
                slot={slot}
                text={textOf(row, slot)}
                done={doneOf(row, slot)}
                editable
                onToggle={(next) => run(() => setDone(today, slot, next))}
              />
            ))}
          </div>
          <p className="mt-2 font-mono text-[11px] text-ink-3">
            {counts.done} of {counts.written} ticked
          </p>
        </>
      ) : (
        /*
          The three inputs render straight away. An empty state that makes you
          click to reach a text field is a door in front of a door.
        */
        <form
          action={(formData) => run(() => saveDay(today, formData))}
          className="rounded-lg border border-rule bg-surface px-[17px]"
        >
          {INTENTIONS.map((slot) => (
            <div key={slot} className="flex items-start gap-3.5 border-b border-rule py-3.5 last:border-b-0">
              <span
                aria-hidden="true"
                className="mt-px size-[18px] flex-none rounded border border-rule-strong opacity-40"
              />
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={slot}
                  className="block font-mono text-[9.5px] tracking-[0.14em] text-ink-3 uppercase"
                >
                  {INTENTION_LABEL[slot]}
                </label>
                <input
                  id={slot}
                  name={slot}
                  defaultValue={prefill[slot]}
                  placeholder={INTENTION_PLACEHOLDER[slot]}
                  className="mt-0.5 w-full border-0 bg-transparent p-0 text-body text-ink outline-none placeholder:text-ink-3"
                />
              </div>
              {prefill[slot] !== '' ? (
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById(slot) as HTMLInputElement | null
                    if (input) input.value = ''
                  }}
                  className="flex-none cursor-pointer rounded-md px-2 py-1 font-mono text-[11px] text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  Clear
                </button>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2.5 py-3.5">
            <Button type="submit" variant="primary" loading={isPending} loadingLabel="Saving…">
              Save
            </Button>
            {Object.values(prefill).some((value) => value !== '') ? (
              <span className="font-mono text-[11px] text-ink-3">
                Yesterday&rsquo;s unfinished lines are already filled in — clear any that today is
                different
              </span>
            ) : null}
          </div>
        </form>
      )}

      <PracticeLine
        queued={practice.queued}
        needsReview={practice.needsReview}
        longestGap={longestGap}
      />

      <div className="mt-8">
        <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
          Blocker
        </span>

        {oldest ? (
          <div className="mt-2.5">
            <p className="rounded-r-md border-l-2 border-rule-strong bg-surface-2 px-4 py-3 text-body leading-[1.6] text-ink-2">
              {oldest.blocker_text}
            </p>
            <p className="mt-1.5 font-mono text-[11px] text-ink-3">
              {openBlockerCopy(formatShortDate(`${oldest.day}T12:00:00`), carried.length - 1)} ·{' '}
              <button
                type="button"
                onClick={() => run(() => resolveBlocker(oldest.id))}
                className="cursor-pointer text-accent-ink underline hover:text-ink"
              >
                Mark resolved
              </button>
            </p>
          </div>
        ) : null}

        <form
          action={(formData) => run(() => saveBlocker(today, String(formData.get('blocker') ?? '')))}
          className="mt-2.5"
        >
          <label htmlFor="blocker" className="sr-only">
            Where the reasoning broke
          </label>
          <textarea
            id="blocker"
            name="blocker"
            rows={3}
            defaultValue={row?.blocker_text ?? ''}
            placeholder="Where the reasoning broke — the lesson, your explanation, and the exact point it stopped making sense…"
            className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body leading-[1.6] text-ink outline-offset-[-1px] focus:border-accent focus:outline-2 focus:outline-accent"
          />
          <Button type="submit" className="mt-2" loading={isPending} loadingLabel="Saving…">
            Save blocker
          </Button>
        </form>
      </div>
    </>
  )
}
