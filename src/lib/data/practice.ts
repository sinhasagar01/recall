import 'server-only'
import { fail } from '@/lib/data/fail'

import { cache } from 'react'

import { toQueueTopic, type QueueRow } from '@/lib/data/topic-mapping'
import { UNCATEGORIZED } from '@/lib/domain/category-suggest'
import { categoryOptionsFromCounts } from '@/lib/domain/library'
import type { LibraryCounts } from '@/lib/domain/library-counts'
import { RECENT_WINDOW_DAYS } from '@/lib/domain/search-filter'
import { STALE_WINDOW_DAYS } from '@/lib/domain/confidence'
import { REVIEW_CONFIDENCES, SETTLED_CONFIDENCES } from '@/lib/domain/library-counts'
import { SERVER_PAGE_SIZE } from '@/lib/domain/library-paging'
import { BUCKET_SEQUENCE, PRACTICE_SESSION_SIZE } from '@/lib/domain/practice-selection'
import type { Confidence, Kind, QueueTopic } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/server'

/**
 * The reads behind the weak page and a practice session.
 *
 * Both used to be `listTopics()` — every topic the user owned, ordered in the
 * browser by `orderForPractice`. Confidence starts at `new` and `needsReview` is
 * `weak or new`, so a freshly imported library is entirely weak and both pages
 * loaded all of it.
 *
 * One SQL function serves both, differing only in whether a seed is passed. See
 * the 20260905160000 migration for why an md5 tie-break satisfies the same rule
 * `seededShuffle` does rather than replacing it.
 */

/** The rows come back with their sort key, which is what the cursor is made of. */
type OrderedRow = QueueRow & { bucket: number; staleness: string }

export interface WeakCursor {
  bucket: number
  staleness: string
  createdAt: string
  id: string
}

const BUCKETS = [...BUCKET_SEQUENCE]
const REVIEW = [...REVIEW_CONFIDENCES] as Confidence[]
const SETTLED = [...SETTLED_CONFIDENCES] as Confidence[]

/** The instant a settled topic stops counting as known. Mirrors `isStale`. */
function staleCutoff(readAt: string): string {
  return new Date(Date.parse(readAt) - STALE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * `weak_counts` returns jsonb, so the generated type is `Json` and something has
 * to narrow it. A cast is the wrong something.
 *
 * The recorded jsonb rule is that a column the database cannot see the inside of
 * is one the application has to see the inside of twice — and a `as unknown as`
 * sees it zero times. This is the second look: three numbers, checked, with a
 * readable failure naming the key rather than an `undefined` surfacing as `NaN`
 * in a rail badge three screens away.
 */
function parseCounts(raw: unknown): { total: number; neverPracticed: number; stale: number } {
  const shape = raw as Record<string, unknown> | null
  const read = (key: 'total' | 'neverPracticed' | 'stale'): number => {
    const value = shape?.[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(
        `Counting your weak topics returned no usable \`${key}\`. ` +
          'weak_counts and this reader have diverged.',
      )
    }
    return value
  }

  return { total: read('total'), neverPracticed: read('neverPracticed'), stale: read('stale') }
}

function cursorOf(rows: OrderedRow[]): WeakCursor | null {
  const last = rows.at(-1)
  if (!last) return null
  return {
    bucket: last.bucket,
    staleness: last.staleness,
    createdAt: last.created_at,
    id: last.id,
  }
}

export interface WeakPage {
  topics: QueueTopic[]
  nextCursor: WeakCursor | null
  total: number
  neverPracticed: number
  /** Settled topics that have gone quiet — see issue #13 and `isStale`. */
  stale: QueueTopic[]
  staleTotal: number
  staleCursor: WeakCursor | null
  /** Relative times are relative to the read, never to render. */
  readAt: string
}

/**
 * One page of the weak list, in the order the page has always shown.
 *
 * No seed: the tie-break falls through to `created_at desc, id desc`, which is
 * what `noShuffle` produced over `listTopics`' ordering. A list page that
 * reshuffled itself on every reload would be worse than one that did not.
 */
export const weakPage = cache(async (cursor: WeakCursor | null = null): Promise<WeakPage> => {
  const supabase = await createClient()
  const readAt = new Date().toISOString()

  const cutoff = staleCutoff(readAt)

  /*
    Three reads, one round trip each, in parallel: what needs review, what has
    settled and gone quiet, and the counts for both. The stale query is the same
    ordering with a different confidence set and a cutoff — see the
    20260905200000 migration for why it is the same function rather than a second.
  */
  const [page, stalePage, counts] = await Promise.all([
    supabase.rpc('practice_ordered_page', {
      p_bucket_order: BUCKETS,
      p_confidences: REVIEW,
      p_cursor_bucket: cursor?.bucket ?? undefined,
      p_cursor_staleness: cursor?.staleness ?? undefined,
      p_cursor_created_at: cursor?.createdAt ?? undefined,
      p_cursor_id: cursor?.id ?? undefined,
      p_limit: SERVER_PAGE_SIZE,
    }),
    supabase.rpc('practice_ordered_page', {
      p_bucket_order: BUCKETS,
      p_confidences: SETTLED,
      p_practised_before: cutoff,
      p_limit: SERVER_PAGE_SIZE,
    }),
    supabase.rpc('weak_counts', {
      p_confidences: REVIEW,
      p_settled_confidences: SETTLED,
      p_practised_before: cutoff,
    }),
  ])

  if (page.error) fail('Loading your weak topics', page.error)
  if (stalePage.error) fail('Loading your settled topics', stalePage.error)
  if (counts.error) fail('Counting your weak topics', counts.error)

  /*
    No `as unknown as`. The rows are what the function returns, and the type
    now says so — see issue #24: the cast asserted nine evidence columns that
    `practice_ordered_page` has never selected and is forbidden to.
  */
  const rows: OrderedRow[] = page.data ?? []
  const staleRows: OrderedRow[] = stalePage.data ?? []
  const summary = parseCounts(counts.data)

  return {
    topics: rows.map(toQueueTopic),
    nextCursor: rows.length === SERVER_PAGE_SIZE ? cursorOf(rows) : null,
    total: summary.total,
    neverPracticed: summary.neverPracticed,
    stale: staleRows.map(toQueueTopic),
    staleTotal: summary.stale,
    staleCursor: staleRows.length === SERVER_PAGE_SIZE ? cursorOf(staleRows) : null,
    readAt,
  }
})

/**
 * A practice session: the stalest topics in the weakest buckets, ties shuffled.
 *
 * `seed` is the read timestamp, so a session is reproducible for as long as the
 * page is being looked at and different next time — the same property
 * `seededShuffle(readAt)` had, and for the same reason.
 *
 * `weakOnly` is the `?scope=weak` entry point, which now takes the same
 * PRACTICE_SESSION_SIZE cap as every other session.
 *
 * `kinds` is the practice-mode boundary. The topic and quiz sessions share the
 * same ordering rule but never mix their two answer modes in one queue.
 *
 * `ids` restricts the queue to a chosen SET. It is deliberately generic: arc 6's
 * `?scope=source` resolves a source to topic ids elsewhere and hands them in, so
 * this module never learns what a source is and `sources-boundary.test.ts` stays
 * absolute rather than absolute-with-an-exception.
 */
export async function practiceQueue({
  seed,
  weakOnly = false,
  kinds,
  ids,
  category,
}: {
  seed: string
  weakOnly?: boolean
  kinds?: Kind[]
  ids?: string[]
  category?: string
}): Promise<QueueTopic[]> {
  const supabase = await createClient()

  /*
    `p_ids` is the queue's existing, deliberately generic chosen-set boundary.
    A category selection is another chosen set, so resolve it here instead of
    teaching the ordering RPC another UI concept or changing its long-lived API.
    The session ordering and cap still happen inside the RPC after this filter.
  */
  let selectedIds = ids
  if (category !== undefined) {
    let categories = supabase.from('topics').select('id')
    if (kinds !== undefined) categories = categories.in('kind', kinds)
    categories =
      category === UNCATEGORIZED ? categories.is('category', null) : categories.eq('category', category)

    const { data, error } = await categories
    if (error) fail('Finding your category for practice', error)
    selectedIds = data.map(({ id }) => id)
  }

  const { data, error } = await supabase.rpc('practice_ordered_page', {
    p_bucket_order: BUCKETS,
    p_confidences: weakOnly ? REVIEW : undefined,
    p_kinds: kinds,
    p_ids: selectedIds,
    p_seed: seed,
    p_limit: PRACTICE_SESSION_SIZE,
  })

  if (error) fail('Building your practice session', error)

  /*
    The other half of issue #24, and the same cast. This is the line the issue
    named; the paged read above had two more of it.
  */
  return (data ?? []).map(toQueueTopic)
}

/** The counts that make the practice setup truthful before a session starts. */
export async function practiceSetup(kind: Kind): Promise<{
  total: number
  needsPractice: number
  categories: Array<{ value: string; label: string; count: number; needsPractice: number }>
}> {
  const supabase = await createClient()
  const base = {
    p_now: new Date().toISOString(),
    p_recent_window_days: RECENT_WINDOW_DAYS,
    p_kinds: [kind],
  }

  const [all, review] = await Promise.all([
    supabase.rpc('library_counts', base),
    supabase.rpc('library_counts', { ...base, p_quick: ['needs-review'] }),
  ])

  if (all.error) fail('Counting your practice material', all.error)
  if (review.error) fail('Counting what needs practice', review.error)

  const allCounts = all.data as unknown as LibraryCounts
  const reviewCounts = review.data as unknown as LibraryCounts
  const reviewByCategory = new Map(reviewCounts.byCategory.map(({ category, count }) => [category, count]))

  return {
    total: allCounts.total,
    needsPractice: reviewCounts.matching,
    categories: categoryOptionsFromCounts(allCounts.byCategory, allCounts.total).map((option) => ({
      ...option,
      needsPractice: option.value === 'all' ? reviewCounts.matching : (reviewByCategory.get(option.value) ?? 0),
    })),
  }
}

/** The minimum-session gate counts the selected practice mode, never the other one. */
export async function practiceKindCount(kind: Kind): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase.from('topics').select('id', { count: 'exact', head: true }).eq('kind', kind)

  if (error) fail(`Counting your ${kind === 'topic' ? 'topics' : 'quizzes'} for practice`, error)
  return count ?? 0
}
