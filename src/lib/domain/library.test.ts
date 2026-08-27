import { describe, expect, it } from 'vitest'
import { filterTopics } from '@/lib/domain/search-filter'
import {
  categoryOptions,
  confidenceOptions,
  difficultyOptions,
  deletionSummary,
  formatRelativeTime,
  formatShortDate,
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
  /* Product spec: Weak Topics shows confidence = 'new' OR confidence = 'weak'. */
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

describe('formatShortDate', () => {
  it('reads as a short month and day', () => {
    expect(formatShortDate('2026-08-27T09:00:00.000Z')).toBe('Aug 27')
  })

  it('is stable regardless of the machine timezone', () => {
    // Formatted in UTC on purpose: a local-timezone format would make this test
    // pass in one place and fail in another.
    expect(formatShortDate('2026-01-01T23:30:00.000Z')).toBe('Jan 1')
  })

  it('has a word for never', () => {
    expect(formatShortDate(null)).toBe('Never')
  })
})

describe('deletionSummary', () => {
  /*
    DESIGN.md: the confirmation names what dies, including the practice count.
    The mock's copy lists "its attached diagram" unconditionally — but naming
    something that is not there is naming something that does not die, so the
    sentence is built from what the topic actually holds.
  */
  it('names only the topic when there is nothing else', () => {
    const topic = makeTopic({ mental_model: null, mental_model_image_path: null, practice_count: 0 })
    expect(deletionSummary(topic)).toBe(
      "This removes the topic. It hasn't been practiced yet. It can't be undone.",
    )
  })

  it('names the mental model when there is one', () => {
    const topic = makeTopic({ mental_model: 'A rope bridge.', practice_count: 0 })
    expect(deletionSummary(topic)).toContain('its mental model')
  })

  it('does not name a diagram when there is none', () => {
    const topic = makeTopic({ mental_model_image_path: null })
    expect(deletionSummary(topic)).not.toContain('diagram')
  })

  it('names the diagram when one is attached', () => {
    const topic = makeTopic({ mental_model_image_path: 'user/topic/a.png' })
    expect(deletionSummary(topic)).toContain('its attached diagram')
  })

  it('names the practice count, singular', () => {
    expect(deletionSummary(makeTopic({ practice_count: 1 }))).toContain('1 practice result')
  })

  it('names the practice count, plural', () => {
    expect(deletionSummary(makeTopic({ practice_count: 3 }))).toContain('3 practice results')
  })

  it('says so plainly when it has never been practiced', () => {
    expect(deletionSummary(makeTopic({ practice_count: 0 }))).toContain("hasn't been practiced yet")
  })

  it('always says it cannot be undone', () => {
    expect(deletionSummary(makeTopic())).toContain("can't be undone")
  })

  it('reads as one sentence with everything present', () => {
    const topic = makeTopic({
      mental_model: 'A rope bridge.',
      mental_model_image_path: 'user/topic/a.png',
      practice_count: 3,
    })
    expect(deletionSummary(topic)).toBe(
      'This removes the topic, its mental model, its attached diagram, and 3 practice results. ' +
        "It can't be undone.",
    )
  })
})

describe('confidenceOptions and difficultyOptions', () => {
  const topics = [
    makeTopic({ confidence: 'new', difficulty: 'easy' }),
    makeTopic({ confidence: 'weak', difficulty: 'hard' }),
    makeTopic({ confidence: 'weak', difficulty: 'hard' }),
    makeTopic({ confidence: 'strong', difficulty: 'medium' }),
  ]

  it('leads with Any, carrying the whole library', () => {
    expect(confidenceOptions(topics, NOW)[0]).toEqual({
      value: 'any',
      label: 'Any confidence',
      count: 4,
    })
    expect(difficultyOptions(topics, NOW)[0]).toMatchObject({ label: 'Any difficulty', count: 4 })
  })

  it('uses the shared confidence labels, so the select and the meter agree', () => {
    const labels = confidenceOptions(topics, NOW).map((option) => option.label)
    expect(labels).toEqual(['Any confidence', 'Never practiced', 'Weak', 'Okay', 'Strong'])
  })

  it('counts every option, including the empty ones', () => {
    const byValue = Object.fromEntries(
      confidenceOptions(topics, NOW).map((option) => [option.value, option.count]),
    )
    expect(byValue).toMatchObject({ new: 1, weak: 2, okay: 0, strong: 1 })
  })

  it('counts difficulty the same way', () => {
    const byValue = Object.fromEntries(
      difficultyOptions(topics, NOW).map((option) => [option.value, option.count]),
    )
    expect(byValue).toMatchObject({ easy: 1, medium: 1, hard: 2 })
  })

  it('a count is exactly what selecting that option yields', () => {
    // Guaranteed by construction — both go through filterTopics — and asserted
    // so it stays that way.
    for (const option of confidenceOptions(topics, NOW).slice(1)) {
      expect(option.count).toBe(
        filterTopics(topics, { confidence: option.value as 'new' }, NOW).length,
      )
    }
  })

  it('reports zeroes for an empty library', () => {
    expect(confidenceOptions([], NOW).every((option) => option.count === 0)).toBe(true)
  })
})
