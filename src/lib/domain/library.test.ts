import { describe, expect, it } from 'vitest'
import {
  categoryOptions,
  formatRelativeTime,
  libraryStats,
  needsReview,
  topicPath,
} from '@/lib/domain/library'
import { makeTopic } from '@/lib/domain/topic-fixture'

const NOW = new Date('2026-06-15T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('needsReview', () => {
  /*
    The reference fixes this rule rather than leaving it to taste: its confidence
    select reads "Never practiced 4" and "Weak 7", and its weak-topics page reads
    "11 topics · 4 never practiced". 7 + 4 = 11, so the weak destination counts
    weak AND never-practiced.
  */
  it.each([
    ['new', true],
    ['weak', true],
    ['okay', false],
    ['strong', false],
  ] as const)('%s needs review: %s', (confidence, expected) => {
    expect(needsReview(makeTopic({ confidence }))).toBe(expected)
  })
})

describe('topicPath', () => {
  it('reads category then first tag', () => {
    expect(topicPath(makeTopic({ category: 'React', tags: ['rendering', 'performance'] }))).toBe(
      'React · rendering',
    )
  })

  it('falls back to Uncategorized when there is no category', () => {
    expect(topicPath(makeTopic({ category: null, tags: ['rendering'] }))).toBe(
      'Uncategorized · rendering',
    )
  })

  it('shows the category alone when there are no tags', () => {
    expect(topicPath(makeTopic({ category: 'CSS', tags: [] }))).toBe('CSS')
  })

  it('survives no category and no tags', () => {
    expect(topicPath(makeTopic({ category: null, tags: [] }))).toBe('Uncategorized')
  })
})

describe('libraryStats', () => {
  it('reports zeroes for an empty library', () => {
    expect(libraryStats([])).toEqual({ total: 0, needsReview: 0, lastPracticedAt: null })
  })

  it('counts topics and the ones needing review', () => {
    const topics = [
      makeTopic({ confidence: 'new' }),
      makeTopic({ confidence: 'weak', last_practiced_at: ago(2 * DAY) }),
      makeTopic({ confidence: 'okay', last_practiced_at: ago(9 * DAY) }),
      makeTopic({ confidence: 'strong', last_practiced_at: ago(30 * DAY) }),
    ]

    expect(libraryStats(topics)).toEqual({
      total: 4,
      needsReview: 2,
      lastPracticedAt: ago(2 * DAY),
    })
  })

  it('reports no last-practiced when nothing has been practised', () => {
    const topics = [makeTopic({ confidence: 'new' }), makeTopic({ confidence: 'new' })]
    expect(libraryStats(topics).lastPracticedAt).toBeNull()
  })

  it('takes the most recent practice, not the first it finds', () => {
    const topics = [
      makeTopic({ confidence: 'okay', last_practiced_at: ago(30 * DAY) }),
      makeTopic({ confidence: 'okay', last_practiced_at: ago(1 * DAY) }),
      makeTopic({ confidence: 'okay', last_practiced_at: ago(10 * DAY) }),
    ]
    expect(libraryStats(topics).lastPracticedAt).toBe(ago(1 * DAY))
  })
})

describe('formatRelativeTime', () => {
  it.each([
    [30_000, 'just now'],
    [5 * MINUTE, '5m ago'],
    [2 * HOUR, '2h ago'],
    [1 * DAY, 'Yesterday'],
    [2 * DAY, '2 days ago'],
    [12 * DAY, '12 days ago'],
  ])('%i ms ago reads "%s"', (elapsed, expected) => {
    expect(formatRelativeTime(ago(elapsed), NOW)).toBe(expected)
  })

  it('has a word for never', () => {
    expect(formatRelativeTime(null, NOW)).toBe('never')
  })

  it('does not read the clock itself', () => {
    // Same input, different injected now, different answer — proves the time
    // comes from the parameter.
    const stamp = ago(2 * HOUR)
    expect(formatRelativeTime(stamp, NOW)).toBe('2h ago')
    expect(formatRelativeTime(stamp, new Date(NOW.getTime() + 3 * DAY))).toBe('3 days ago')
  })
})

describe('categoryOptions', () => {
  const topics = [
    makeTopic({ category: 'React' }),
    makeTopic({ category: 'React' }),
    makeTopic({ category: 'React' }),
    makeTopic({ category: 'CSS' }),
    makeTopic({ category: 'CSS' }),
    makeTopic({ category: 'TypeScript' }),
    makeTopic({ category: null }),
  ]

  it('leads with an All option carrying the total', () => {
    const [first] = categoryOptions(topics)
    expect(first).toMatchObject({ value: 'all', label: 'All categories', count: 7 })
  })

  it('counts each category, with no category counted as Uncategorized', () => {
    const options = categoryOptions(topics)
    expect(options.find((o) => o.value === 'React')?.count).toBe(3)
    expect(options.find((o) => o.value === 'CSS')?.count).toBe(2)
    expect(options.find((o) => o.value === 'Uncategorized')?.count).toBe(1)
  })

  it('orders by count, so the most used come first', () => {
    const values = categoryOptions(topics)
      .slice(1)
      .map((o) => o.value)
    expect(values).toEqual(['React', 'CSS', 'TypeScript', 'Uncategorized'])
  })

  it('returns just the All option for an empty library', () => {
    expect(categoryOptions([])).toEqual([
      { value: 'all', label: 'All categories', count: 0 },
    ])
  })
})
