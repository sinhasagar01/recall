import { isNeverPracticed } from '@/lib/domain/confidence'
import { UNCATEGORIZED } from '@/lib/domain/category-suggest'
import type { Topic } from '@/lib/domain/types'

/**
 * A topic the weak-topics destination is about.
 *
 * The reference fixes this rule rather than leaving it to taste: its confidence
 * select reads "Never practiced 4" and "Weak 7", and its weak-topics page reads
 * "11 topics · 4 never practiced". 7 + 4 = 11, so the count is weak OR never
 * practiced. One definition, used by the rail count, the page subtitle and
 * (phase 9) the weak page itself.
 */
export function needsReview(topic: Topic): boolean {
  return topic.confidence === 'weak' || isNeverPracticed(topic)
}

/** The card's path line: "React · rendering". */
export function topicPath(topic: Topic): string {
  const category = topic.category ?? UNCATEGORIZED
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
    const category = topic.category ?? UNCATEGORIZED
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }

  const sorted = [...counts.entries()]
    .sort(([aLabel, aCount], [bLabel, bCount]) => bCount - aCount || aLabel.localeCompare(bLabel))
    .map(([label, count]) => ({ value: label, label, count }))

  return [{ value: 'all', label: 'All categories', count: topics.length }, ...sorted]
}
