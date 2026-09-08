import 'server-only'

import { cache } from 'react'

import type { Day } from '@/lib/domain/today'
import { createClient } from '@/lib/supabase/server'

/**
 * The only module that reads or writes days.
 *
 * RLS scopes every read. No hand-written `user_id` filter, for the reason the
 * rest of the data layer gives: writing one would imply the policy might not be
 * doing its job.
 *
 * ── Every function here is a READ ────────────────────────────────────────────
 * The writes live in app/(app)/today/actions.ts, behind explicit form submission.
 * Opening Today must not create a row, and `today-boundary.test.ts` asserts that
 * neither this module nor the page names a write — see "no write on the read
 * path" there.
 */

const COLUMNS =
  'id, user_id, day, explain_text, explain_done, rebuild_text, rebuild_done, apply_text, apply_done, blocker_text, blocker_resolved_at, created_at, updated_at'

function fail(action: string, error: { code?: string; message: string }): never {
  throw new Error(`${action} failed: ${error.code ?? 'unknown'} · ${error.message}`)
}

/**
 * The most recent days, newest first.
 *
 * Seven, because the SERVER CANNOT KNOW which day is today. `localDateString`
 * needs the browser's timezone, so the page fetches a window and the client picks
 * today's row and yesterday's out of it. Seven covers every offset with one read
 * and no round trip.
 */
export const readRecentDays = cache(async (): Promise<Day[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('days')
    .select(COLUMNS)
    .order('day', { ascending: false })
    .limit(7)

  if (error) fail('Loading your days', error)
  return data as unknown as Day[]
})

/**
 * Unresolved blockers, oldest first.
 *
 * Backed by `days_open_blocker_idx`, a partial index over exactly these rows — it
 * never touches a day that has no open blocker, however many days exist. The set
 * is tiny by construction: an unresolved blocker is something you have not dealt
 * with yet, and the page's whole purpose is to keep that number small.
 *
 * Bounded anyway. A read with no limit is a read that gets slower for the person
 * it is already failing.
 */
export const readOpenBlockers = cache(async (): Promise<Day[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('days')
    .select(COLUMNS)
    .not('blocker_text', 'is', null)
    .is('blocker_resolved_at', null)
    .order('day', { ascending: true })
    .limit(25)

  if (error) fail('Loading your open blockers', error)
  return data as unknown as Day[]
})

/** The whole log for Earlier days. Days with no row simply are not here. */
export const readAllDays = cache(async (): Promise<Day[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('days')
    .select(COLUMNS)
    .order('day', { ascending: false })

  if (error) fail('Loading your log', error)
  return data as unknown as Day[]
})

/**
 * The topic that has gone longest without practice, for the practice line.
 *
 * The reference's rule is that every number on that line links through to what it
 * counts, and "longest gap" is the only one without an obvious destination — so it
 * returns the topic itself, not just the number. If there is nothing to link to,
 * there is no number: the caller renders nothing rather than a dead figure.
 *
 * Never-practised topics are excluded on purpose. "Longest gap" is a gap between
 * two practices; a topic you have never opened has no gap, it has an absence, and
 * the weak page is where an absence belongs.
 */
export const readLongestGap = cache(
  async (): Promise<{ id: string; title: string; lastPracticedAt: string } | null> => {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('topics')
      .select('id, title, last_practiced_at')
      .not('last_practiced_at', 'is', null)
      .order('last_practiced_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) fail('Finding your longest gap', error)
    if (data === null) return null

    const row = data as { id: string; title: string; last_practiced_at: string }
    return { id: row.id, title: row.title, lastPracticedAt: row.last_practiced_at }
  },
)

/**
 * Per-day tick counts for the recent window, for the rail and the More sheet.
 *
 * Returns the counts rather than the rows: those two surfaces render on every
 * page in the group, and neither needs the text of what you wrote. Reusing
 * `readRecentDays` means one query per request however many surfaces ask.
 */
export const readRecentDayCounts = cache(
  async (): Promise<{ day: string; done: number; written: number }[]> => {
    const { dayCounts } = await import('@/lib/domain/today')
    return (await readRecentDays()).map((day) => ({ day: day.day, ...dayCounts(day) }))
  },
)
