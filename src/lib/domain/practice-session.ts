import { needsReview } from '@/lib/domain/confidence'
import type { Confidence, Topic } from '@/lib/domain/types'

/**
 * One answered card. A skip produces no result at all, so it cannot appear here.
 *
 * Carries the resulting **confidence** rather than the grade, because a session
 * can hold both shapes and a quiz has no grade — its outcome is objective. The
 * grade was never extra information: `GRADE_TO_CONFIDENCE` maps the three grades
 * onto the three confidences one-to-one, so nothing is lost by recording the end
 * of that arrow instead of the start, and the summary reads one field for both
 * shapes rather than branching.
 */
export interface GradedResult {
  topic: Topic
  confidence: Confidence
}

/** `new` cannot be an outcome — nothing an answer produces lands there. */
export type Tally = Record<Exclude<Confidence, 'new'>, number> & { total: number }

export function sessionTally(results: GradedResult[]): Tally {
  const tally: Tally = { weak: 0, okay: 0, strong: 0, total: results.length }
  for (const { confidence } of results) tally[confidence === 'new' ? 'weak' : confidence] += 1
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

  const out: Topic[] = []
  const into: Topic[] = []

  for (const { topic, confidence } of results) {
    const before = needsReview(topic)
    const after = needsReview({ ...topic, confidence })
    if (before && !after) out.push(topic)
    if (!before && after) into.push(topic)
  }

  if (out.length > 0 && into.length > 0) {
    return `${named(out)} moved out of needing review. ${into.length} moved in — it'll come first next time.`
  }
  if (out.length > 0) return `${named(out)} moved out of needing review.`
  if (into.length > 0) return `${named(into)} moved in — it'll come first next time.`
  return 'Nothing changed category this time.'
}

/**
 * "2 topics", "1 quiz", "3 cards".
 *
 * Named from the moved set rather than the whole session, so a mixed session in
 * which only topics moved still says "topics". "Cards" is the fallback because it
 * is what the library already calls both shapes on screen.
 */
function named(moved: Topic[]): string {
  const kinds = new Set(moved.map((topic) => topic.kind))
  const one = kinds.size > 1 ? 'card' : kinds.has('quiz') ? 'quiz' : 'topic'
  const many = one === 'quiz' ? 'quizzes' : `${one}s`

  return `${moved.length} ${moved.length === 1 ? one : many}`
}
