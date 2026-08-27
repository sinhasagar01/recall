import { CONFIDENCE_LABEL, isNeverPracticed } from '@/lib/domain/confidence'
import { categoryOf } from '@/lib/domain/category-suggest'
import { filterTopics } from '@/lib/domain/search-filter'
import type { Difficulty, Topic } from '@/lib/domain/types'

/**
 * A topic the weak-topics destination is about.
 *
 * The product spec fixes this: Weak Topics shows confidence = 'new' OR
 * confidence = 'weak'. One definition, used by the rail count, the library
 * subtitle and (phase 9) the weak page itself.
 */
export function needsReview(topic: Topic): boolean {
  return topic.confidence === 'weak' || isNeverPracticed(topic)
}

/** The card's path line: "React · rendering". */
export function topicPath(topic: Topic): string {
  const category = categoryOf(topic)
  const firstTag = topic.tags[0]
  return firstTag ? `${category} · ${firstTag}` : category
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

  const sorted = [...counts.entries()]
    .sort(([aLabel, aCount], [bLabel, bCount]) => bCount - aCount || aLabel.localeCompare(bLabel))
    .map(([label, count]) => ({ value: label, label, count }))

  return [{ value: 'all', label: 'All categories', count: topics.length }, ...sorted]
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
