'use server'

import { weakPage, type WeakCursor, type WeakPage } from '@/lib/data/practice'

/**
 * The next page of weak topics, for the Load more button.
 *
 * The weak list is not filterable, so unlike the library there is no state to keep
 * in the URL — the accumulated pages are client state and this returns rows.
 */
export async function loadMoreWeak(
  cursor: WeakCursor,
  scope: 'weak' | 'stale' = 'weak',
): Promise<{ topics: WeakPage['topics']; nextCursor: WeakCursor | null }> {
  const page = await weakPage(cursor)

  return scope === 'stale'
    ? { topics: page.stale, nextCursor: page.staleCursor }
    : { topics: page.topics, nextCursor: page.nextCursor }
}
