import { GRADE_TO_CONFIDENCE, type Grade } from '@/lib/domain/confidence'
import { needsReview } from '@/lib/domain/library'
import type { Topic } from '@/lib/domain/types'

/** One graded answer. A skip produces no result at all, so it cannot appear here. */
export interface GradedResult {
  topic: Topic
  grade: Grade
}

export type Tally = Record<Grade, number> & { total: number }

export function sessionTally(results: GradedResult[]): Tally {
  const tally: Tally = { 'didnt-know': 0, partly: 0, 'knew-it': 0, total: results.length }
  for (const { grade } of results) tally[grade] += 1
  return tally
}

/**
 * What the session actually changed, in a sentence.
 *
 * Derived rather than written: the mock's copy names fixed numbers, and DESIGN.md
 * flags that kind of data-dependent copy as illustrative. "Moved out" and "moved
 * in" are measured with the same `needsReview` predicate the rail count and the
 * weak page use, so the three can never disagree.
 */
export function sessionSummary(results: GradedResult[]): string {
  if (results.length === 0) return 'Nothing was graded this time.'

  let out = 0
  let into = 0

  for (const { topic, grade } of results) {
    const before = needsReview(topic)
    const after = needsReview({ ...topic, confidence: GRADE_TO_CONFIDENCE[grade] })
    if (before && !after) out += 1
    if (!before && after) into += 1
  }

  const topics = (count: number) => `${count} ${count === 1 ? 'topic' : 'topics'}`

  if (out > 0 && into > 0) {
    return `${topics(out)} moved out of needing review. ${into} moved in — it'll come first next time.`
  }
  if (out > 0) return `${topics(out)} moved out of needing review.`
  if (into > 0) return `${topics(into)} moved in — it'll come first next time.`
  return 'Nothing changed category this time.'
}
