import 'server-only'

import { cache } from 'react'

import { toTopic, type TopicRow } from '@/lib/data/topic-mapping'
import { REVIEW_CONFIDENCES, type LibraryCounts } from '@/lib/domain/library-counts'
import { LOCAL_MODE_MAX, SERVER_PAGE_SIZE } from '@/lib/domain/library-paging'
import { RECENT_WINDOW_DAYS, type TopicFilters } from '@/lib/domain/search-filter'
import type { Topic } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/server'

/**
 * How the library is read.
 *
 * Two modes, and the type is what keeps them apart.
 *
 * `local` carries the whole library and no counts: the client filters and counts
 * it with the domain functions, exactly as it did before any of this existed.
 * `server` carries one filtered page and the counts that go with it, both from
 * SQL. Neither shape lets a caller pair a locally filtered list with a
 * SQL-derived count, because neither shape contains both halves — that is a
 * compile error rather than a rule someone has to remember.
 *
 * Why it matters: phase 7 established that a count and the list it describes come
 * from the same computation, so clicking a count that reads 12 cannot yield 11
 * rows. A hybrid puts that at risk, and this is what removes the risk.
 */
export type LibraryData =
  | { mode: 'local'; topics: Topic[]; readAt: string }
  | {
      mode: 'server'
      topics: Topic[]
      counts: LibraryCounts
      nextCursor: Cursor | null
      readAt: string
    }

export interface Cursor {
  createdAt: string
  id: string
}

/* The columns of a Topic, explicitly. Never `*`: that would ship search_text. */
const TOPIC_COLUMNS =
  'id, user_id, title, definition, mental_model, mental_model_image_path, category, tags, difficulty, confidence, practice_count, last_practiced_at, created_at, updated_at'

function fail(action: string, error: { code?: string; message: string }): never {
  throw new Error(`${action} failed: ${error.code ?? 'unknown'} · ${error.message}`)
}

function hasFilters(filters: TopicFilters): boolean {
  return (
    (filters.query ?? '') !== '' ||
    (filters.category ?? null) !== null ||
    (filters.confidence ?? null) !== null ||
    (filters.difficulty ?? null) !== null ||
    (filters.quickFilters ?? []).length > 0
  )
}

/*
  Optional RPC arguments are omitted rather than sent as null. PostgREST types a
  parameter with a DEFAULT as optional, and omitting it applies that default,
  which is null — the same thing, and the only spelling the generated types allow.
*/
function rpcArgs(filters: TopicFilters, readAt: string) {
  return {
    p_now: readAt,
    p_recent_window_days: RECENT_WINDOW_DAYS,
    p_query: filters.query ?? '',
    p_category: filters.category ?? undefined,
    p_confidence: filters.confidence ?? undefined,
    p_difficulty: filters.difficulty ?? undefined,
    p_quick: filters.quickFilters ?? [],
  }
}

/**
 * Reads the library, choosing the mode.
 *
 * With no filters and no cursor it asks for one row more than local mode allows.
 * Getting fewer back proves the whole library is in hand, and it is returned
 * whole — one query, and the client behaves as it always did. Getting the extra
 * row proves it is not, and the read is done again through SQL.
 *
 * The second read is the cost of not knowing the size up front. It only happens
 * for libraries too big for local mode, which is exactly the case where sending
 * everything was the more expensive mistake.
 */
export const listLibrary = cache(
  async (filters: TopicFilters = {}, cursor: Cursor | null = null): Promise<LibraryData> => {
    const supabase = await createClient()
    const readAt = new Date().toISOString()

    if (cursor === null && !hasFilters(filters)) {
      // RLS scopes this to the signed-in user; no user_id filter here on purpose,
      // because one would imply the policy might not be doing its job.
      const { data, error } = await supabase
        .from('topics')
        .select(TOPIC_COLUMNS)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(LOCAL_MODE_MAX + 1)

      if (error) fail('Loading your topics', error)

      if (data.length <= LOCAL_MODE_MAX) {
        return { mode: 'local', topics: (data as TopicRow[]).map(toTopic), readAt }
      }
    }

    const args = rpcArgs(filters, readAt)

    const [page, counts] = await Promise.all([
      supabase.rpc('library_page', {
        ...args,
        p_cursor_created_at: cursor?.createdAt ?? undefined,
        p_cursor_id: cursor?.id ?? undefined,
        p_limit: SERVER_PAGE_SIZE,
      }),
      supabase.rpc('library_counts', args),
    ])

    if (page.error) fail('Loading your topics', page.error)
    if (counts.error) fail('Counting your topics', counts.error)

    const topics = (page.data as TopicRow[]).map(toTopic)
    const last = topics.at(-1)

    return {
      mode: 'server',
      topics,
      counts: counts.data as unknown as LibraryCounts,
      /*
        A full page means there may be more. A short one means there is not, so no
        "Load more" is offered for a page that would come back empty. A full final
        page costs one extra request that returns nothing, which is the ordinary
        price of not running a count for every page.
      */
      nextCursor:
        topics.length === SERVER_PAGE_SIZE && last
          ? { createdAt: last.created_at, id: last.id }
          : null,
      readAt,
    }
  },
)

/**
 * The unfiltered counts, for surfaces that need the tallies but not the library.
 *
 * Named to avoid colliding with the domain's `libraryCounts`, which computes the
 * same shape from an array in local mode. Topic detail uses this for the edit
 * sheet's category select, which is the only reason it used to read every topic.
 */
export const libraryTotals = cache(async (): Promise<LibraryCounts> => {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('library_counts', {
    p_now: new Date().toISOString(),
    p_recent_window_days: RECENT_WINDOW_DAYS,
  })

  if (error) fail('Counting your topics', error)

  return data as unknown as LibraryCounts
})

export interface RailCounts {
  total: number
  needsReview: number
  /** For the account-deletion confirmation, which names the images that die. */
  withImages: number
}

/**
 * The two numbers the sidebar rail needs, on every page in the (app) group.
 *
 * This used to be `listTopics()` — the entire library read on every navigation,
 * so paginating the library page alone would have changed nothing.
 *
 * The practice queue is deliberately absent: its size is
 * `min(total, PRACTICE_SESSION_SIZE)` and `practiceQueueSize` in the domain
 * derives it from `total`. None of selectPracticeSession's bucket ordering or
 * shuffling has to be reproduced in SQL to count it.
 */
export const railCounts = cache(async (): Promise<RailCounts> => {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('rail_counts', {
    p_review_confidences: [...REVIEW_CONFIDENCES],
  })

  if (error) fail('Counting your topics', error)

  return data as unknown as RailCounts
})
