import 'server-only'

import { cache } from 'react'

import { toTopic, type TopicRow } from '@/lib/data/topic-mapping'
import { REVIEW_CONFIDENCES } from '@/lib/domain/library-counts'
import { SERVER_PAGE_SIZE } from '@/lib/domain/library-paging'
import { BUCKET_SEQUENCE, PRACTICE_SESSION_SIZE } from '@/lib/domain/practice-selection'
import type { Confidence, Topic } from '@/lib/domain/types'
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

function fail(action: string, error: { code?: string; message: string }): never {
  throw new Error(`${action} failed: ${error.code ?? 'unknown'} · ${error.message}`)
}

const BUCKETS = [...BUCKET_SEQUENCE]
const REVIEW = [...REVIEW_CONFIDENCES] as Confidence[]

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

  const [page, counts] = await Promise.all([
    supabase.rpc('practice_ordered_page', {
      p_bucket_order: BUCKETS,
      p_confidences: REVIEW,
      p_cursor_bucket: cursor?.bucket ?? undefined,
      p_cursor_staleness: cursor?.staleness ?? undefined,
      p_cursor_created_at: cursor?.createdAt ?? undefined,
      p_cursor_id: cursor?.id ?? undefined,
      p_limit: SERVER_PAGE_SIZE,
    }),
    supabase.rpc('weak_counts', { p_confidences: REVIEW }),
  ])

  if (page.error) fail('Loading your weak topics', page.error)
  if (counts.error) fail('Counting your weak topics', counts.error)

  const rows = page.data as unknown as OrderedRow[]
  const summary = counts.data as unknown as { total: number; neverPracticed: number }

  return {
    topics: rows.map(toTopic),
    nextCursor: rows.length === SERVER_PAGE_SIZE ? cursorOf(rows) : null,
    total: summary.total,
    neverPracticed: summary.neverPracticed,
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
 */
export async function practiceQueue({
  seed,
  weakOnly = false,
}: {
  seed: string
  weakOnly?: boolean
}): Promise<Topic[]> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('practice_ordered_page', {
    p_bucket_order: BUCKETS,
    p_confidences: weakOnly ? REVIEW : undefined,
    p_seed: seed,
    p_limit: PRACTICE_SESSION_SIZE,
  })

  if (error) fail('Building your practice session', error)

  return (data as unknown as OrderedRow[]).map(toTopic)
}
