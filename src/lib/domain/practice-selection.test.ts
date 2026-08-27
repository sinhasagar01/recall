import { describe, expect, it } from 'vitest'
import {
  PRACTICE_MINIMUM,
  PRACTICE_SESSION_SIZE,
  canPracticeBelowMinimum,
  meetsPracticeMinimum,
  selectPracticeSession,
} from '@/lib/domain/practice-selection'
import { makeTopic } from '@/lib/domain/topic-fixture'
import type { Topic } from '@/lib/domain/types'

/** Randomness is injected. `noShuffle` keeps ties in input order. */
const noShuffle = <T>(items: T[]): T[] => items
/** `reverseShuffle` proves a tie-break actually reached the shuffle. */
const reverseShuffle = <T>(items: T[]): T[] => [...items].reverse()

const titles = (topics: Topic[]) => topics.map((t) => t.title)

function topic(title: string, overrides: Partial<Topic> = {}) {
  return makeTopic({ id: title, title, ...overrides })
}

describe('practice thresholds', () => {
  it('names the session size and minimum as constants', () => {
    expect(PRACTICE_SESSION_SIZE).toBe(10)
    expect(PRACTICE_MINIMUM).toBe(3)
  })

  it.each([0, 1, 2])('%i topics does not meet the minimum', (count) => {
    expect(meetsPracticeMinimum(count)).toBe(false)
  })

  it.each([3, 4, 100])('%i topics meets the minimum', (count) => {
    expect(meetsPracticeMinimum(count)).toBe(true)
  })

  it('offers the override only when there is something to practise but not enough', () => {
    expect(canPracticeBelowMinimum(0)).toBe(false)
    expect(canPracticeBelowMinimum(1)).toBe(true)
    expect(canPracticeBelowMinimum(2)).toBe(true)
    expect(canPracticeBelowMinimum(3)).toBe(false)
  })
})

describe('selectPracticeSession — bucket order', () => {
  it('orders never-practiced, then weak, then okay, then strong', () => {
    const topics = [
      topic('strong', { confidence: 'strong', last_practiced_at: '2026-01-01T00:00:00.000Z' }),
      topic('okay', { confidence: 'okay', last_practiced_at: '2026-01-01T00:00:00.000Z' }),
      topic('new', { confidence: 'new' }),
      topic('weak', { confidence: 'weak', last_practiced_at: '2026-01-01T00:00:00.000Z' }),
    ]

    expect(titles(selectPracticeSession(topics, { shuffle: noShuffle }))).toEqual([
      'new',
      'weak',
      'okay',
      'strong',
    ])
  })
})

describe('selectPracticeSession — gap order within a bucket', () => {
  it('puts the longest gap first for weak, okay and strong alike', () => {
    const topics = [
      topic('okay-recent', { confidence: 'okay', last_practiced_at: '2026-06-01T00:00:00.000Z' }),
      topic('okay-stale', { confidence: 'okay', last_practiced_at: '2026-01-01T00:00:00.000Z' }),
      topic('weak-recent', { confidence: 'weak', last_practiced_at: '2026-06-01T00:00:00.000Z' }),
      topic('weak-stale', { confidence: 'weak', last_practiced_at: '2026-01-01T00:00:00.000Z' }),
      topic('strong-recent', { confidence: 'strong', last_practiced_at: '2026-06-01T00:00:00.000Z' }),
      topic('strong-stale', { confidence: 'strong', last_practiced_at: '2026-01-01T00:00:00.000Z' }),
    ]

    expect(titles(selectPracticeSession(topics, { shuffle: noShuffle }))).toEqual([
      'weak-stale',
      'weak-recent',
      'okay-stale',
      'okay-recent',
      'strong-stale',
      'strong-recent',
    ])
  })

  it('treats a null last_practiced_at as an infinite gap, sorting it first in its bucket', () => {
    // Editing a topic can set confidence without ever practising it, so a weak
    // topic can have no last_practiced_at at all. It is the stalest thing in
    // the bucket, not a tie to be shuffled.
    const topics = [
      topic('weak-march', { confidence: 'weak', last_practiced_at: '2026-03-01T00:00:00.000Z' }),
      topic('weak-never', { confidence: 'weak', last_practiced_at: null }),
    ]

    expect(titles(selectPracticeSession(topics, { shuffle: noShuffle }))).toEqual([
      'weak-never',
      'weak-march',
    ])
    // and the result must not depend on the shuffle, i.e. it never reached it
    expect(titles(selectPracticeSession(topics, { shuffle: reverseShuffle }))).toEqual([
      'weak-never',
      'weak-march',
    ])
  })

  it('compares timestamps as instants, not as strings', () => {
    // '2026-03-01T00:00:00+02:00' is EARLIER than '2026-03-01T00:00:00Z',
    // but sorts later lexicographically.
    const topics = [
      topic('zulu', { confidence: 'okay', last_practiced_at: '2026-03-01T00:00:00.000Z' }),
      topic('offset', { confidence: 'okay', last_practiced_at: '2026-03-01T00:00:00.000+02:00' }),
    ]
    expect(titles(selectPracticeSession(topics, { shuffle: noShuffle }))).toEqual(['offset', 'zulu'])
  })
})

describe('selectPracticeSession — ties go to the injected shuffle', () => {
  it('shuffles topics that tie on bucket and gap', () => {
    const topics = [
      topic('a', { confidence: 'okay', last_practiced_at: '2026-01-01T00:00:00.000Z' }),
      topic('b', { confidence: 'okay', last_practiced_at: '2026-01-01T00:00:00.000Z' }),
      topic('c', { confidence: 'okay', last_practiced_at: '2026-01-01T00:00:00.000Z' }),
    ]

    expect(titles(selectPracticeSession(topics, { shuffle: noShuffle }))).toEqual(['a', 'b', 'c'])
    expect(titles(selectPracticeSession(topics, { shuffle: reverseShuffle }))).toEqual(['c', 'b', 'a'])
  })

  it('shuffles never-practiced topics, which have no gap to compare', () => {
    const topics = [topic('a'), topic('b'), topic('c')]
    expect(titles(selectPracticeSession(topics, { shuffle: reverseShuffle }))).toEqual(['c', 'b', 'a'])
  })

  it('shuffles only within a tie, never across buckets', () => {
    const topics = [
      topic('new-a'),
      topic('new-b'),
      topic('weak', { confidence: 'weak', last_practiced_at: '2026-01-01T00:00:00.000Z' }),
    ]
    // Reversing the ties must not lift weak above the never-practiced pair.
    expect(titles(selectPracticeSession(topics, { shuffle: reverseShuffle }))).toEqual([
      'new-b',
      'new-a',
      'weak',
    ])
  })
})

describe('selectPracticeSession — session size', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      topic(`t${String(i).padStart(2, '0')}`, {
        confidence: 'okay',
        last_practiced_at: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      }),
    )

  it('returns nothing for an empty library', () => {
    expect(selectPracticeSession([], { shuffle: noShuffle })).toEqual([])
  })

  it.each([1, 2, 3, 9])('returns everything when there are only %i topics', (n) => {
    expect(selectPracticeSession(many(n), { shuffle: noShuffle })).toHaveLength(n)
  })

  it('returns exactly 10 when there are exactly 10', () => {
    expect(selectPracticeSession(many(10), { shuffle: noShuffle })).toHaveLength(10)
  })

  it('caps at 10 when there are more', () => {
    expect(selectPracticeSession(many(25), { shuffle: noShuffle })).toHaveLength(PRACTICE_SESSION_SIZE)
  })

  it('caps by taking the highest-priority 10, not an arbitrary 10', () => {
    const topics = many(25) // t00 is the stalest
    expect(titles(selectPracticeSession(topics, { shuffle: noShuffle }))).toEqual([
      't00', 't01', 't02', 't03', 't04', 't05', 't06', 't07', 't08', 't09',
    ])
  })
})

describe('selectPracticeSession — uniform libraries', () => {
  it('handles a library where nothing has been practised', () => {
    const topics = [topic('a'), topic('b'), topic('c')]
    expect(titles(selectPracticeSession(topics, { shuffle: noShuffle }))).toEqual(['a', 'b', 'c'])
  })

  it('handles a library where everything is strong', () => {
    const topics = [
      topic('a', { confidence: 'strong', last_practiced_at: '2026-05-01T00:00:00.000Z' }),
      topic('b', { confidence: 'strong', last_practiced_at: '2026-04-01T00:00:00.000Z' }),
    ]
    expect(titles(selectPracticeSession(topics, { shuffle: noShuffle }))).toEqual(['b', 'a'])
  })

  it('does not mutate or reorder the array it was given', () => {
    const topics = [
      topic('strong', { confidence: 'strong', last_practiced_at: '2026-01-01T00:00:00.000Z' }),
      topic('new'),
    ]
    const snapshot = titles(topics)
    selectPracticeSession(topics, { shuffle: reverseShuffle })
    expect(titles(topics)).toEqual(snapshot)
  })
})
