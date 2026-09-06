import { CONFIDENCE_LABEL, needsReview } from '@/lib/domain/confidence'
import {
  CONFIDENCE_VALUES,
  DIFFICULTY_VALUES,
  type CategoryCount,
  type LibraryCounts,
} from '@/lib/domain/library-counts'

// Re-exported so existing callers keep their import path.
export { needsReview }
import { categoryOf } from '@/lib/domain/category-suggest'
import { filterTopics } from '@/lib/domain/search-filter'
import type { Confidence, Difficulty, Topic } from '@/lib/domain/types'

/** The card's path line: "React · rendering". */
export function topicPath(topic: Topic): string {
  const category = categoryOf(topic)
  const firstTag = topic.tags[0]
  const base = firstTag ? `${category} · ${firstTag}` : category

  /*
    A quiz's path line carries how many options it has — the reference's
    "CSS · layout · 2 options". It stands in for the excerpt a quiz does not have,
    and it is the one number that changes how the question feels to answer.
  */
  if (topic.kind === 'quiz') {
    const count = topic.options.length
    return `${base} · ${count} ${count === 1 ? 'option' : 'options'}`
  }

  return base
}

export interface LibraryStats {
  total: number
  needsReview: number
  lastPracticedAt: string | null
}

/**
 * No clock parameter: the last-practiced stamp is a maximum over the rows, and
 * the counts do not depend on the time. Same rule as selectPracticeSession — an
 * unused parameter is a lie about what a function depends on.
 */
export function libraryStats(topics: Topic[]): LibraryStats {
  let lastPracticedAt: string | null = null

  for (const topic of topics) {
    if (topic.last_practiced_at === null) continue
    if (lastPracticedAt === null || Date.parse(topic.last_practiced_at) > Date.parse(lastPracticedAt)) {
      lastPracticedAt = topic.last_practiced_at
    }
  }

  return {
    total: topics.length,
    needsReview: topics.filter(needsReview).length,
    lastPracticedAt,
  }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Time is a parameter, never read from the clock. */
export function formatRelativeTime(timestamp: string | null, now: Date): string {
  if (timestamp === null) return 'never'

  const elapsed = now.getTime() - Date.parse(timestamp)

  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`

  const days = Math.floor(elapsed / DAY)
  return days === 1 ? 'Yesterday' : `${days} days ago`
}

export interface CategoryOption {
  value: string
  label: string
  count: number
}

/**
 * Category options with counts from the user's own data — the counts are the
 * reason Select is not a native select. Ordered by count, so the most used lead.
 */
export function categoryOptions(topics: Topic[]): CategoryOption[] {
  const counts = new Map<string, number>()

  for (const topic of topics) {
    const category = categoryOf(topic)
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }

  return categoryOptionsFromCounts(
    [...counts.entries()].map(([category, count]) => ({ category, count })),
    topics.length,
  )
}

/*
  ── Where counting stops and presentation begins ────────────────────────────
  The four *FromCounts functions below turn a LibraryCounts into what the toolbar
  renders. They are the shared half of the two reading modes: local mode counts
  with filterTopics, server mode counts in SQL, and from here on the two are the
  same code.

  Ordering and labels deliberately stay on this side. categoryOptions sorts with
  localeCompare, which a database collation will not reproduce, so asking SQL to
  return options in display order would add a difference between the modes that
  no amount of testing could remove. SQL returns integers; sorting happens here.
*/

/** Display order: most used first, ties broken by label. */
export function categoryOptionsFromCounts(
  byCategory: CategoryCount[],
  total: number,
): CategoryOption[] {
  const sorted = [...byCategory]
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
    .map(({ category, count }) => ({ value: category, label: category, count }))

  return [{ value: 'all', label: 'All categories', count: total }, ...sorted]
}

export function confidenceOptionsFromCounts(
  byConfidence: Record<Confidence, number>,
  total: number,
): CategoryOption[] {
  return [
    { value: ANY, label: 'Any confidence', count: total },
    ...CONFIDENCE_VALUES.map((value) => ({
      value,
      label: CONFIDENCE_LABEL[value],
      count: byConfidence[value],
    })),
  ]
}

export function difficultyOptionsFromCounts(
  byDifficulty: Record<Difficulty, number>,
  total: number,
): CategoryOption[] {
  return [
    { value: ANY, label: 'Any difficulty', count: total },
    ...DIFFICULTY_VALUES.map((value) => ({
      value,
      label: DIFFICULTY_LABEL[value],
      count: byDifficulty[value],
    })),
  ]
}

export function libraryStatsFromCounts(counts: LibraryCounts): LibraryStats {
  return {
    total: counts.total,
    needsReview: counts.needsReview,
    lastPracticedAt: counts.lastPracticedAt,
  }
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
}

/** UTC on purpose: a local format would render differently per machine. */
const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export function formatShortDate(timestamp: string | null): string {
  if (timestamp === null) return 'Never'
  return SHORT_DATE.format(new Date(timestamp))
}

/**
 * What a delete actually destroys, named.
 *
 * DESIGN.md requires the confirmation to name what dies, including the practice
 * count. The mock's copy lists "its attached diagram" unconditionally; naming
 * something that is not there names something that does not die, so the sentence
 * is assembled from what the topic actually holds.
 */
export function deletionSummary(topic: Topic): string {
  const parts = ['the topic']
  if (topic.mental_model) parts.push('its mental model')
  if (topic.mental_model_image_path) parts.push('its attached diagram')

  if (topic.practice_count > 0) {
    parts.push(`${topic.practice_count} practice result${topic.practice_count === 1 ? '' : 's'}`)
  }

  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`

  const practiced = topic.practice_count > 0 ? '' : " It hasn't been practiced yet."

  return `This removes ${list}.${practiced} It can't be undone.`
}

/*
  Option lists with counts for the confidence and difficulty selects.

  They exist because DESIGN.md requires per-option counts and counting in a
  component would be a comparison in a component. Both delegate to filterTopics,
  so they introduce no matching logic: a count is, by construction, exactly what
  selecting that option yields.
*/
export const ANY = 'any'

function optionsFor<T extends string>(
  topics: Topic[],
  now: Date,
  anyLabel: string,
  values: readonly T[],
  label: (value: T) => string,
  filterKey: 'confidence' | 'difficulty',
): CategoryOption[] {
  return [
    { value: ANY, label: anyLabel, count: topics.length },
    ...values.map((value) => ({
      value,
      label: label(value),
      count: filterTopics(topics, { [filterKey]: value }, now).length,
    })),
  ]
}

export function confidenceOptions(topics: Topic[], now: Date): CategoryOption[] {
  return optionsFor(
    topics,
    now,
    'Any confidence',
    ['new', 'weak', 'okay', 'strong'] as const,
    (value) => CONFIDENCE_LABEL[value],
    'confidence',
  )
}

export function difficultyOptions(topics: Topic[], now: Date): CategoryOption[] {
  return optionsFor(
    topics,
    now,
    'Any difficulty',
    ['easy', 'medium', 'hard'] as const,
    (value) => DIFFICULTY_LABEL[value],
    'difficulty',
  )
}

/**
 * The weak-list row's tail: "never practiced" or "last practiced 12 days ago".
 *
 * It lives here rather than in the row because deciding which of the two applies
 * is a comparison, and comparisons do not go in components.
 */
export function lastPracticedLabel(topic: Topic, now: Date): string {
  if (topic.last_practiced_at === null) return 'never practiced'
  return `last practiced ${formatRelativeTime(topic.last_practiced_at, now)}`
}
