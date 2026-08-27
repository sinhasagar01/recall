import { categoryOf } from '@/lib/domain/category-suggest'
import { isNeverPracticed, needsReview } from '@/lib/domain/confidence'
import type { Confidence, Difficulty, Topic } from '@/lib/domain/types'

/**
 * One window, shared by both recency filters. Two constants would drift, and
 * "recently added" and "recently practiced" would quietly stop meaning the same
 * kind of recent.
 */
export const RECENT_WINDOW_DAYS = 7

const RECENT_WINDOW_MS = RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000

/** Lowercase, trimmed, internal runs of whitespace collapsed. */
export function normaliseText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Partial, case-insensitive match across every field worth searching. Substring
 * rather than word-prefix on purpose: "recon" has to find "React reconciliation".
 */
export function matchesQuery(topic: Topic, query: string): boolean {
  const needle = normaliseText(query)
  if (needle === '') return true

  const fields: (string | null)[] = [
    topic.title,
    topic.definition,
    topic.mental_model,
    topic.category,
    ...topic.tags,
  ]

  return fields.some((field) => field !== null && normaliseText(field).includes(needle))
}

export type QuickFilter =
  | 'never-practiced'
  | 'needs-review'
  | 'recently-added'
  | 'recently-practiced'

export interface TopicFilters {
  query?: string
  category?: string | null
  confidence?: Confidence | null
  difficulty?: Difficulty | null
  quickFilters?: QuickFilter[]
}

function isRecent(timestamp: string | null, now: Date): boolean {
  if (timestamp === null) return false
  const parsed = Date.parse(timestamp)
  if (Number.isNaN(parsed)) return false
  return now.getTime() - parsed <= RECENT_WINDOW_MS
}

const QUICK_FILTERS: Record<QuickFilter, (topic: Topic, now: Date) => boolean> = {
  // Goes through the same predicate as the practice-selection bucket, so the
  // two can never disagree about what "never practiced" means.
  'never-practiced': (topic) => isNeverPracticed(topic),
  /*
    The mobile chip row's "Weak" — which means the weak-topics membership rule, not
    `confidence = 'weak'`. It reuses `needsReview`, so this adds a way to ask for a
    rule that already exists rather than a second copy of it.
  */
  'needs-review': (topic) => needsReview(topic),
  'recently-added': (topic, now) => isRecent(topic.created_at, now),
  'recently-practiced': (topic, now) => isRecent(topic.last_practiced_at, now),
}

/**
 * Every filter composes with AND. An unset filter — absent, null, or an empty
 * quick-filter list — matches everything. Input order is preserved.
 */
export function filterTopics(topics: Topic[], filters: TopicFilters, now: Date): Topic[] {
  const {
    query = '',
    category = null,
    confidence = null,
    difficulty = null,
    quickFilters = [],
  } = filters

  return topics.filter((topic) => {
    if (!matchesQuery(topic, query)) return false
    if (category !== null && categoryOf(topic) !== category) return false
    if (confidence !== null && topic.confidence !== confidence) return false
    if (difficulty !== null && topic.difficulty !== difficulty) return false
    return quickFilters.every((quick) => QUICK_FILTERS[quick](topic, now))
  })
}
