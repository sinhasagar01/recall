import { LibraryView } from '@/components/topics/library-view'
import { listLibrary, railCounts } from '@/lib/data/library'
import { listSourceOptions } from '@/lib/data/sources'
import type { QuickFilter, TopicFilters } from '@/lib/domain/search-filter'
import type { Confidence, Difficulty, Kind } from '@/lib/domain/types'

/*
  A server component: the first paint carries the data, with no client waterfall
  and no loading flash. Writes go through the server action in ./actions.ts, which
  revalidates this path — which is how the list updates without a reload.

  `readAt` comes from the read rather than from render: a component calling
  Date.now() while rendering is impure, and would also drift between the rail and
  the page.

  The filters are read here as well as in the browser. Under the local-mode
  threshold they are only used to decide that the whole library can be sent; past
  it they become the SQL query. Either way the URL is the single source of what is
  being asked for.
*/

const QUICK_FILTERS: QuickFilter[] = [
  'never-practiced',
  'needs-review',
  'recently-added',
  'recently-practiced',
]

/** The toolbar's sentinels are absences, and an unknown value is no filter at all. */
function oneOf<T extends string>(allowed: readonly T[], value: string | undefined): T | null {
  return value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : null
}

function readFilters(params: Record<string, string | string[] | undefined>): TopicFilters {
  const one = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const quick = params.quick
  const requested = quick === undefined ? [] : Array.isArray(quick) ? quick : [quick]

  return {
    query: one('q') ?? '',
    category: one('category') ?? null,
    confidence: oneOf(['new', 'weak', 'okay', 'strong'] as const, one('confidence')) as Confidence | null,
    difficulty: oneOf(['easy', 'medium', 'hard'] as const, one('difficulty')) as Difficulty | null,
    // Through `oneOf` like the others, so `?kind=anything` is All rather than an
    // error or a filter that matches nothing.
    kind: oneOf(['topic', 'quiz'] as const, one('kind')) as Kind | null,
    quickFilters: QUICK_FILTERS.filter((value) => requested.includes(value)),
  }
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams

  // railCounts is cache()d and the layout has already called it this request, so
  // the account figures cost nothing extra here.
  const [data, account, sourceOptions] = await Promise.all([
    listLibrary(readFilters(params)),
    railCounts(),
    listSourceOptions(),
  ])

  return (
    <LibraryView
      data={data}
      account={{ topics: account.total, images: account.withImages }}
      sourceOptions={sourceOptions}
    />
  )
}
