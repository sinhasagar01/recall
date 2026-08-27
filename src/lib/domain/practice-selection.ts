import type { Confidence, Topic } from '@/lib/domain/types'

export const PRACTICE_SESSION_SIZE = 10
export const PRACTICE_MINIMUM = 3

/** Enough topics for an ordinary session. */
export function meetsPracticeMinimum(topicCount: number): boolean {
  return topicCount >= PRACTICE_MINIMUM
}

/**
 * The override path: something to practise, but fewer than the minimum. Lets the
 * UI offer "Practice the N anyway" instead of a hard floor.
 */
export function canPracticeBelowMinimum(topicCount: number): boolean {
  return topicCount > 0 && topicCount < PRACTICE_MINIMUM
}

/** Randomness is injected so a session is reproducible in a test. */
export type Shuffle = <T>(items: T[]) => T[]

const BUCKET_ORDER: Record<Confidence, number> = {
  new: 0,
  weak: 1,
  okay: 2,
  strong: 3,
}

/**
 * Ordering position within a bucket. A topic with no last_practiced_at has an
 * infinitely long gap, so it sorts first — it is the stalest thing in the
 * bucket, not a tie to be shuffled. That case is reachable: editing a topic can
 * set confidence to weak without ever practising it.
 */
const NEVER = Number.NEGATIVE_INFINITY

function lastPracticedAt(topic: Topic): number {
  if (topic.last_practiced_at === null) return NEVER
  const parsed = Date.parse(topic.last_practiced_at)
  return Number.isNaN(parsed) ? NEVER : parsed
}

/** Explicit, because -Infinity minus -Infinity is NaN. */
function compare(a: number, b: number): number {
  if (a === b) return 0
  return a < b ? -1 : 1
}

/**
 * The session queue: never-practiced first, then weak, okay and strong, each by
 * longest gap since last practice, with the injected shuffle breaking exact ties.
 *
 * There is no clock parameter. Ordering by longest gap is identical to ordering
 * by oldest last_practiced_at — `now` is the same for every topic and cancels
 * out — so taking one would be a lie about what this depends on.
 */
export function selectPracticeSession(topics: Topic[], { shuffle }: { shuffle: Shuffle }): Topic[] {
  const ranked = topics.map((topic) => ({
    topic,
    bucket: BUCKET_ORDER[topic.confidence],
    practicedAt: lastPracticedAt(topic),
  }))

  ranked.sort((a, b) => compare(a.bucket, b.bucket) || compare(a.practicedAt, b.practicedAt))

  // Shuffle runs of exactly-equal keys. Randomness must not go inside the
  // comparator: that makes it non-transitive, and the sort result becomes
  // implementation-defined — it can reorder across buckets.
  const ordered: Topic[] = []
  let start = 0
  while (start < ranked.length) {
    let end = start + 1
    while (
      end < ranked.length &&
      ranked[end].bucket === ranked[start].bucket &&
      ranked[end].practicedAt === ranked[start].practicedAt
    ) {
      end += 1
    }

    const tied = ranked.slice(start, end).map((entry) => entry.topic)
    ordered.push(...(tied.length > 1 ? shuffle(tied) : tied))
    start = end
  }

  return ordered.slice(0, PRACTICE_SESSION_SIZE)
}
