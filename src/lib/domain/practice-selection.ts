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
/** A shuffle that shuffles nothing, for callers wanting a stable order. */
export const noShuffle: Shuffle = (items) => items

/**
 * The full practice order: never-practiced first, then weak, okay and strong, each
 * by longest gap, with ties handed to the injected shuffle.
 *
 * Extracted so the weak-topics page can reuse the ordering without duplicating it.
 * `selectPracticeSession` could not serve that page directly: it caps at
 * PRACTICE_SESSION_SIZE, and a list page must show everything. Passing `noShuffle`
 * also keeps a list page from reordering itself on every reload.
 */
export function orderForPractice(topics: Topic[], { shuffle }: { shuffle: Shuffle }): Topic[] {
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

  return ordered
}

/** One session's worth of the practice order. */
/**
 * How many topics a session would hold, from the library size alone.
 *
 * The rail shows "N queued" on every page and used to get it by reading every
 * topic and calling selectPracticeSession. But that function orders the whole
 * library and takes the first PRACTICE_SESSION_SIZE, so its LENGTH never depended
 * on the ordering — only on how many topics exist. Counting rows is enough, and
 * none of the bucket ordering or shuffling has to exist in SQL.
 *
 * practice-selection.test.ts asserts this equals selectPracticeSession(...).length
 * for arbitrary libraries, so the shortcut cannot quietly stop being one.
 */
export function practiceQueueSize(total: number): number {
  return Math.min(total, PRACTICE_SESSION_SIZE)
}

export function selectPracticeSession(topics: Topic[], { shuffle }: { shuffle: Shuffle }): Topic[] {
  return orderForPractice(topics, { shuffle }).slice(0, PRACTICE_SESSION_SIZE)
}

/**
 * A deterministic shuffle, seeded from a string.
 *
 * Phase 2 injected the shuffle but never implemented one, because nothing
 * consumed it yet. The obvious implementation — Math.random — cannot be used
 * here: reading a random source during render is impure, on the server and
 * inside a `useState` initialiser alike, and the project's lint config rejects it.
 *
 * Seeding from data the request already carries (the `readAt` the data layer
 * returns) keeps this pure and unit-testable while still giving a different order
 * to every session.
 *
 * mulberry32 over an FNV-1a hash of the seed. Not cryptographic, and it does not
 * need to be — it is deciding the order of flashcards.
 */
export function seededShuffle(seed: string): Shuffle {
  return <T,>(items: T[]): T[] => {
    let hash = 2166136261
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }

    let state = hash >>> 0
    const random = () => {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    // Fisher-Yates, on a copy.
    const shuffled = [...items]
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1))
      ;[shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]]
    }
    return shuffled
  }
}
