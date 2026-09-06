import { categoryOf } from '@/lib/domain/category-suggest'
import { needsReview } from '@/lib/domain/confidence'
import { filterTopics, type QuickFilter, type TopicFilters } from '@/lib/domain/search-filter'
import type { Confidence, Difficulty, Kind, Topic } from '@/lib/domain/types'

/**
 * Every number the library toolbar and the sidebar rail display.
 *
 * This shape is the contract between the two ways the library can be read. Under
 * the local-mode threshold the whole library is in memory and `libraryCounts`
 * below produces it; past that threshold `public.library_counts` in SQL produces
 * it. Both feed exactly the same rendering code, so the ONLY difference between
 * the two modes is where this object came from.
 *
 * supabase/tests/library_test.sql asserts the two agree over the same corpus the
 * Vitest suite uses. This file is the specification; the SQL is written to match
 * it, never the other way round.
 */
export interface CategoryCount {
  category: string
  count: number
}

export interface LibraryCounts {
  total: number
  /** The size of the current filtered result — the only figure that narrows. */
  matching: number
  needsReview: number
  lastPracticedAt: string | null
  byConfidence: Record<Confidence, number>
  byDifficulty: Record<Difficulty, number>
  quick: Record<QuickFilter, number>
  /** The type chips. `All` is `total`, so it is not repeated here. */
  byKind: Record<Kind, number>
  byCategory: CategoryCount[]
}

export const CONFIDENCE_VALUES: readonly Confidence[] = ['new', 'weak', 'okay', 'strong']
export const DIFFICULTY_VALUES: readonly Difficulty[] = ['easy', 'medium', 'hard']
export const KIND_VALUES: readonly Kind[] = ['topic', 'quiz']
export const QUICK_FILTER_VALUES: readonly QuickFilter[] = [
  'never-practiced',
  'needs-review',
  'recently-added',
  'recently-practiced',
]

/**
 * The confidence values that count as needing review, derived from the predicate
 * rather than listed again.
 *
 * The rail counts its review badge with a database filter and cannot call
 * needsReview per row. Writing `['weak', 'new']` there would be a second copy of
 * the rule, free to drift; deriving it here means changing needsReview changes the
 * query too.
 */
export const REVIEW_CONFIDENCES: readonly Confidence[] = CONFIDENCE_VALUES.filter((confidence) =>
  needsReview({ confidence }),
)

/**
 * The confidences that count as settled — the complement of REVIEW_CONFIDENCES,
 * derived the same way rather than listed. Together the two partition the
 * library, which is what lets the weak page show both halves without overlap.
 */
export const SETTLED_CONFIDENCES: readonly Confidence[] = CONFIDENCE_VALUES.filter(
  (confidence) => !needsReview({ confidence }),
)

/** The most recent practice stamp in the library, or null if nothing has been. */
export function latestPracticedAt(topics: Topic[]): string | null {
  let latest: string | null = null

  for (const topic of topics) {
    if (topic.last_practiced_at === null) continue
    if (latest === null || Date.parse(topic.last_practiced_at) > Date.parse(latest)) {
      latest = topic.last_practiced_at
    }
  }

  return latest
}

/**
 * Counts sorted by name, not by count.
 *
 * Display order is count-descending with a locale-aware tiebreak, and that lives
 * in `categoryOptionsFromCounts`. Deliberately not here: a database collation will
 * not reproduce `localeCompare`, and this object has to be comparable across the
 * two implementations. Sorting by name only makes the array deterministic.
 */
function categoryCounts(topics: Topic[]): CategoryCount[] {
  const counts = new Map<string, number>()

  for (const topic of topics) {
    const category = categoryOf(topic)
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : 0))
}

function countBy<T extends string>(
  topics: Topic[],
  now: Date,
  values: readonly T[],
  filterFor: (value: T) => TopicFilters,
): Record<T, number> {
  return Object.fromEntries(
    values.map((value) => [value, filterTopics(topics, filterFor(value), now).length]),
  ) as Record<T, number>
}

/**
 * Every count goes through `filterTopics`, never through a separate comparison.
 *
 * That is the rule phase 7 established: a count is by construction exactly what
 * selecting that option yields, so the two can never disagree. It costs a pass per
 * option over an array that is, by definition of local mode, small.
 *
 * Everything except `matching` is over the whole library rather than the filtered
 * set — DESIGN.md's rule, so a count still offers a way to narrow instead of
 * describing the result you are already looking at.
 */
export function libraryCounts(topics: Topic[], filters: TopicFilters, now: Date): LibraryCounts {
  return {
    total: topics.length,
    matching: filterTopics(topics, filters, now).length,
    needsReview: topics.filter(needsReview).length,
    lastPracticedAt: latestPracticedAt(topics),
    byConfidence: countBy(topics, now, CONFIDENCE_VALUES, (confidence) => ({ confidence })),
    byDifficulty: countBy(topics, now, DIFFICULTY_VALUES, (difficulty) => ({ difficulty })),
    quick: countBy(topics, now, QUICK_FILTER_VALUES, (quick) => ({ quickFilters: [quick] })),
    byKind: countBy(topics, now, KIND_VALUES, (kind) => ({ kind })),
    byCategory: categoryCounts(topics),
  }
}
