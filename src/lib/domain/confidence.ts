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
 */
export type PracticeOutcome = { kind: 'graded'; grade: Grade } | { kind: 'skipped' }

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
    confidence: GRADE_TO_CONFIDENCE[outcome.grade],
    practice_count: topic.practice_count + 1,
    last_practiced_at: now.toISOString(),
  }
}
