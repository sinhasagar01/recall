import type { Confidence, Topic } from '@/lib/domain/types'

/**
 * The single definition of "never practiced", used by BOTH the practice-selection
 * bucket and the library's quick filter.
 *
 * It keys on confidence, not on last_practiced_at, because editing a topic can
 * set confidence directly — the two fields can disagree. DESIGN.md labels the
 * confidence value `new` as "Never practiced", so keying on confidence is what
 * keeps a card's meter and the filter from contradicting each other.
 */
export function isNeverPracticed(topic: Pick<Topic, 'confidence'>): boolean {
  return topic.confidence === 'new'
}

/**
 * The label for each confidence, defined once and imported by both the meter and
 * the filter options. DESIGN.md: "Never practiced", never "New".
 */
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  new: 'Never practiced',
  weak: 'Weak',
  okay: 'Okay',
  strong: 'Strong',
}

/**
 * A topic the weak-topics destination is about.
 *
 * The product spec fixes this: Weak Topics shows confidence = 'new' OR
 * confidence = 'weak'. One definition, used by the rail count, the library
 * subtitle, the weak page, the session summary and the mobile "Weak" chip.
 *
 * It lives here rather than in library.ts because search-filter.ts needs it, and
 * library.ts already imports search-filter — the other arrangement is a cycle.
 */
export function needsReview(topic: Pick<Topic, 'confidence'>): boolean {
  return topic.confidence === 'weak' || isNeverPracticed(topic)
}

/** The three answers the practice screen offers, in its own words. */
export type Grade = 'didnt-know' | 'partly' | 'knew-it'

export const GRADE_TO_CONFIDENCE: Record<Grade, Confidence> = {
  'didnt-know': 'weak',
  partly: 'okay',
  'knew-it': 'strong',
}

/**
 * Skipping is a real outcome with a real meaning, not the absence of one, so it
 * is a variant rather than a missing branch.
 *
 * `answered` is a quiz: no grade, because the grade is not an opinion. It shares
 * this type rather than getting its own update path so that `practice_count` and
 * `last_practiced_at` cannot drift between the two shapes.
 */
export type PracticeOutcome =
  | { kind: 'graded'; grade: Grade }
  | { kind: 'answered'; correct: boolean }
  | { kind: 'skipped' }

export interface TopicPracticeUpdate {
  confidence: Confidence
  practice_count: number
  last_practiced_at: string
}

/**
 * The state change one answer produces, or null when the answer was a skip.
 *
 * Null means "write nothing": no confidence change, no practice_count, no
 * timestamp. Callers persist this per answer, not at session end, so ending a
 * session early keeps everything already graded.
 */
export function practiceUpdateFor(
  topic: Pick<Topic, 'practice_count'>,
  outcome: PracticeOutcome,
  now: Date,
): TopicPracticeUpdate | null {
  if (outcome.kind === 'skipped') return null

  return {
    confidence:
      outcome.kind === 'graded' ? GRADE_TO_CONFIDENCE[outcome.grade] : gradeQuiz(outcome.correct),
    practice_count: topic.practice_count + 1,
    last_practiced_at: now.toISOString(),
  }
}

/**
 * How long a settled topic can go untouched before it stops counting as known.
 *
 * Separate from RECENT_WINDOW_DAYS, and deliberately at the other end of the
 * scale: that one answers "did this just happen", this one answers "was this so
 * long ago that you probably cannot do it any more". Sharing a constant between
 * the two would tie a 7-day question to a 60-day one.
 */
export const STALE_WINDOW_DAYS = 60

const STALE_WINDOW_MS = STALE_WINDOW_DAYS * 24 * 60 * 60 * 1000

/** Not on the weak page: graded, and graded better than weak. */
export function isSettled(topic: Pick<Topic, 'confidence'>): boolean {
  return !needsReview(topic)
}

/**
 * Settled once, and long enough ago that it is worth checking again.
 *
 * This exists because confidence does not decay — grading something "knew it"
 * removes it from the weak page for good, so a library that is entirely graded
 * has an empty weak page and nothing to say. Rather than expiring the grade,
 * which would be spaced repetition by another name and would make things
 * reappear because a clock moved, the grade stays honest and this asks a
 * different question alongside it.
 *
 * Only settled topics can be stale. Anything that still needs review is already
 * on that page, and listing it twice would be worse than not listing it.
 */
export function isStale(
  topic: Pick<Topic, 'confidence' | 'last_practiced_at'>,
  now: Date,
): boolean {
  if (!isSettled(topic)) return false

  /*
    No stamp is an infinite gap, not a zero one — the same reading
    orderForPractice gives it. Unreachable through the app today, since
    confidence only moves through grading and grading always stamps.
  */
  if (topic.last_practiced_at === null) return true

  const parsed = Date.parse(topic.last_practiced_at)
  if (Number.isNaN(parsed)) return true

  // Strictly greater: the boundary belongs to the settled side, mirroring
  // RECENT_WINDOW_DAYS where "recent" is `gap <= window`.
  return now.getTime() - parsed > STALE_WINDOW_MS
}

/**
 * Grading a quiz.
 *
 * Deliberately NOT `GRADE_TO_CONFIDENCE`. That map is for self-assessment, where
 * "partly" is a real and useful answer; a quiz is answered against a stored correct
 * option and there is no partly about it. Reusing the three-way map is exactly what
 * would make `'okay'` reachable for a quiz, so the two-outcome rule gets its own
 * function and its own test.
 *
 * This is the one thing quizzes do better than topics: the grade is not an opinion.
 */
export function gradeQuiz(correct: boolean): Confidence {
  return correct ? 'strong' : 'weak'
}
