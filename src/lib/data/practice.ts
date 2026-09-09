import 'server-only'
import { fail } from '@/lib/data/fail'

import { cache } from 'react'

import { toTopic, type TopicRow } from '@/lib/data/topic-mapping'
import { STALE_WINDOW_DAYS } from '@/lib/domain/confidence'
import { REVIEW_CONFIDENCES, SETTLED_CONFIDENCES } from '@/lib/domain/library-counts'
import { SERVER_PAGE_SIZE } from '@/lib/domain/library-paging'
import { BUCKET_SEQUENCE, PRACTICE_SESSION_SIZE } from '@/lib/domain/practice-selection'
import type { Confidence, Kind, Topic } from '@/lib/domain/types'
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
type OrderedRow = TopicRow & { bucket: number; staleness: string }

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
  topics: Topic[]
  nextCursor: WeakCursor | null
  total: number
  neverPracticed: number
  /** Settled topics that have gone quiet — see issue #13 and `isStale`. */
  stale: Topic[]
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

  const rows = page.data as unknown as OrderedRow[]
  const staleRows = stalePage.data as unknown as OrderedRow[]
  const summary = counts.data as unknown as {
    total: number
    neverPracticed: number
    stale: number
  }

  return {
    topics: rows.map(toTopic),
    nextCursor: rows.length === SERVER_PAGE_SIZE ? cursorOf(rows) : null,
    total: summary.total,
    neverPracticed: summary.neverPracticed,
    stale: staleRows.map(toTopic),
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
 * `kinds` is `?scope=quiz`. Left undefined the query returns both shapes, which
 * is what the default session is meant to do — see DESIGN.md: a quiz that could
 * not appear in the default session would be a permanent leak wearing
 * separation's clothes.
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
}: {
  seed: string
  weakOnly?: boolean
  kinds?: Kind[]
  ids?: string[]
}): Promise<Topic[]> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('practice_ordered_page', {
    p_bucket_order: BUCKETS,
    p_confidences: weakOnly ? REVIEW : undefined,
    p_kinds: kinds,
    p_ids: ids,
    p_seed: seed,
    p_limit: PRACTICE_SESSION_SIZE,
  })

  if (error) fail('Building your practice session', error)

  return (data as unknown as OrderedRow[]).map(toTopic)
}
