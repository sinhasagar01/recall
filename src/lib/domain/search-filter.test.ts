import { describe, expect, it } from 'vitest'
import { RECENT_WINDOW_DAYS, filterTopics, matchesQuery } from '@/lib/domain/search-filter'
import { makeTopic } from '@/lib/domain/topic-fixture'
import type { Topic } from '@/lib/domain/types'

const NOW = new Date('2026-06-15T12:00:00.000Z')

/** Days before NOW, as an ISO string. */
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString()

const titles = (topics: Topic[]) => topics.map((t) => t.title)

function topic(title: string, overrides: Partial<Topic> = {}) {
  return makeTopic({ id: title, title, ...overrides })
}

describe('matchesQuery', () => {
  const react = makeTopic({
    title: 'React reconciliation',
    definition: 'Comparing the previous and next element tree.',
    mental_model: 'Like an editor diffing two drafts.',
    category: 'React',
    tags: ['rendering', 'performance'],
  })

  it('matches a partial word inside the title', () => {
    // The case named in the brief: "recon" finds "React reconciliation".
    expect(matchesQuery(react, 'recon')).toBe(true)
  })

  it('is case insensitive', () => {
    expect(matchesQuery(react, 'RECON')).toBe(true)
    expect(matchesQuery(react, 'ReCoN')).toBe(true)
  })

  it('ignores leading and trailing whitespace', () => {
    expect(matchesQuery(react, '   recon   ')).toBe(true)
  })

  it('collapses internal whitespace on both sides', () => {
    expect(matchesQuery(react, 'React    reconciliation')).toBe(true)
  })

  it('matches in the definition', () => {
    expect(matchesQuery(react, 'element tree')).toBe(true)
  })

  it('matches only in the mental model', () => {
    const t = makeTopic({ title: 'x', definition: 'y', mental_model: 'a rope bridge', category: null, tags: [] })
    expect(matchesQuery(t, 'rope')).toBe(true)
  })

  it('matches only in the category', () => {
    const t = makeTopic({ title: 'x', definition: 'y', category: 'Web performance', tags: [] })
    expect(matchesQuery(t, 'perfor')).toBe(true)
  })

  it('matches only in the tags', () => {
    const t = makeTopic({ title: 'x', definition: 'y', mental_model: null, category: null, tags: ['hydration'] })
    expect(matchesQuery(t, 'hydra')).toBe(true)
  })

  it('does not match a string that is nowhere', () => {
    expect(matchesQuery(react, 'kubernetes')).toBe(false)
  })

  it('treats a blank query as matching everything', () => {
    expect(matchesQuery(react, '')).toBe(true)
    expect(matchesQuery(react, '    ')).toBe(true)
  })

  it('survives null mental_model, null category and empty tags', () => {
    const bare = makeTopic({ title: 'Bare', definition: 'd', mental_model: null, category: null, tags: [] })
    expect(matchesQuery(bare, 'bare')).toBe(true)
    expect(matchesQuery(bare, 'anything')).toBe(false)
  })
})

describe('filterTopics — an unset filter matches everything', () => {
  const topics = [topic('a'), topic('b', { confidence: 'weak', last_practiced_at: daysAgo(1) })]

  it('returns everything for an empty filter set', () => {
    expect(filterTopics(topics, {}, NOW)).toHaveLength(2)
  })

  it('returns everything when every filter is explicitly null', () => {
    const all = filterTopics(
      topics,
      { query: '', category: null, confidence: null, difficulty: null, quickFilters: [] },
      NOW,
    )
    expect(all).toHaveLength(2)
  })

  it('returns nothing for an empty library', () => {
    expect(filterTopics([], { query: 'anything' }, NOW)).toEqual([])
  })
})

describe('filterTopics — individual filters', () => {
  const topics = [
    topic('react-easy', { category: 'React', difficulty: 'easy', confidence: 'weak', last_practiced_at: daysAgo(1) }),
    topic('css-hard', { category: 'CSS', difficulty: 'hard', confidence: 'strong', last_practiced_at: daysAgo(40) }),
    topic('uncategorised', { category: null, difficulty: 'medium', confidence: 'new' }),
  ]

  it('filters by category', () => {
    expect(titles(filterTopics(topics, { category: 'React' }, NOW))).toEqual(['react-easy'])
  })

  it('filters by confidence', () => {
    expect(titles(filterTopics(topics, { confidence: 'strong' }, NOW))).toEqual(['css-hard'])
  })

  it('filters by difficulty', () => {
    expect(titles(filterTopics(topics, { difficulty: 'hard' }, NOW))).toEqual(['css-hard'])
  })

  it('filters by query', () => {
    expect(titles(filterTopics(topics, { query: 'css' }, NOW))).toEqual(['css-hard'])
  })
})

describe('filterTopics — quick filters', () => {
  it('exports one window constant shared by both recency filters', () => {
    expect(RECENT_WINDOW_DAYS).toBe(7)
  })

  const topics = [
    topic('never', { confidence: 'new', created_at: daysAgo(100), last_practiced_at: null }),
    topic('added-today', { confidence: 'okay', created_at: daysAgo(0), last_practiced_at: daysAgo(100) }),
    topic('practised-today', { confidence: 'okay', created_at: daysAgo(100), last_practiced_at: daysAgo(0) }),
    topic('old', { confidence: 'okay', created_at: daysAgo(100), last_practiced_at: daysAgo(100) }),
  ]

  it('finds never-practiced topics', () => {
    expect(titles(filterTopics(topics, { quickFilters: ['never-practiced'] }, NOW))).toEqual(['never'])
  })

  it('finds recently added topics', () => {
    expect(titles(filterTopics(topics, { quickFilters: ['recently-added'] }, NOW))).toEqual(['added-today'])
  })

  it('finds recently practiced topics', () => {
    expect(titles(filterTopics(topics, { quickFilters: ['recently-practiced'] }, NOW))).toEqual([
      'practised-today',
    ])
  })

  it('uses the same window for both recency filters', () => {
    const justInside = [
      topic('added', { confidence: 'okay', created_at: daysAgo(RECENT_WINDOW_DAYS - 1), last_practiced_at: daysAgo(100) }),
      topic('practised', { confidence: 'okay', created_at: daysAgo(100), last_practiced_at: daysAgo(RECENT_WINDOW_DAYS - 1) }),
    ]
    expect(filterTopics(justInside, { quickFilters: ['recently-added'] }, NOW)).toHaveLength(1)
    expect(filterTopics(justInside, { quickFilters: ['recently-practiced'] }, NOW)).toHaveLength(1)
  })

  it('excludes anything older than the window', () => {
    const outside = [
      topic('added', { confidence: 'okay', created_at: daysAgo(RECENT_WINDOW_DAYS + 1), last_practiced_at: daysAgo(100) }),
      topic('practised', { confidence: 'okay', created_at: daysAgo(100), last_practiced_at: daysAgo(RECENT_WINDOW_DAYS + 1) }),
    ]
    expect(filterTopics(outside, { quickFilters: ['recently-added'] }, NOW)).toEqual([])
    expect(filterTopics(outside, { quickFilters: ['recently-practiced'] }, NOW)).toEqual([])
  })

  it('never counts a topic with no last_practiced_at as recently practised', () => {
    const t = [topic('never', { confidence: 'new', created_at: daysAgo(0), last_practiced_at: null })]
    expect(filterTopics(t, { quickFilters: ['recently-practiced'] }, NOW)).toEqual([])
  })

  it('agrees with the practice-selection idea of never practiced', () => {
    // Both callers go through the same predicate, so a topic edited to weak
    // without ever being practised is NOT "never practiced" in either place.
    const edited = [topic('edited-weak', { confidence: 'weak', last_practiced_at: null })]
    expect(filterTopics(edited, { quickFilters: ['never-practiced'] }, NOW)).toEqual([])
  })
})

describe('filterTopics — composition', () => {
  const topics = [
    topic('react-easy', { category: 'React', difficulty: 'easy', confidence: 'weak', last_practiced_at: daysAgo(1) }),
    topic('react-hard', { category: 'React', difficulty: 'hard', confidence: 'strong', last_practiced_at: daysAgo(1) }),
    topic('css-easy', { category: 'CSS', difficulty: 'easy', confidence: 'weak', last_practiced_at: daysAgo(1) }),
  ]

  it('composes filters with AND', () => {
    expect(titles(filterTopics(topics, { category: 'React', difficulty: 'easy' }, NOW))).toEqual([
      'react-easy',
    ])
  })

  it('returns nothing when filters individually match but jointly do not', () => {
    // 'React' matches two, 'strong' matches one, 'easy' matches two — but no
    // single topic is all three.
    const none = filterTopics(topics, { category: 'React', confidence: 'strong', difficulty: 'easy' }, NOW)
    expect(none).toEqual([])
  })

  it('composes a query with the selects', () => {
    expect(titles(filterTopics(topics, { query: 'react', difficulty: 'hard' }, NOW))).toEqual(['react-hard'])
  })

  it('composes multiple quick filters with AND', () => {
    const t = [
      topic('both', { confidence: 'new', created_at: daysAgo(1), last_practiced_at: null }),
      topic('only-new', { confidence: 'new', created_at: daysAgo(90), last_practiced_at: null }),
    ]
    expect(titles(filterTopics(t, { quickFilters: ['never-practiced', 'recently-added'] }, NOW))).toEqual([
      'both',
    ])
  })

  it('preserves input order', () => {
    expect(titles(filterTopics(topics, { difficulty: 'easy' }, NOW))).toEqual(['react-easy', 'css-easy'])
  })

  it('does not mutate the array it was given', () => {
    const snapshot = titles(topics)
    filterTopics(topics, { category: 'CSS' }, NOW)
    expect(titles(topics)).toEqual(snapshot)
  })
})

describe('filterTopics — the Uncategorized case', () => {
  /*
    Phase 2 could not have seen this: it had no UI enumerating categories, so a
    topic with no category never needed to be selectable. `categoryOptions`
    (phase 5) introduced "Uncategorized" as a display label, and phase 7 is the
    first time that label has to round-trip back into a filter.
  */
  const topics = [
    topic('react', { category: 'React' }),
    topic('bare-a', { category: null }),
    topic('bare-b', { category: null }),
  ]

  it('selects the topics that have no category at all', () => {
    expect(titles(filterTopics(topics, { category: 'Uncategorized' }, NOW))).toEqual([
      'bare-a',
      'bare-b',
    ])
  })

  it('still treats a null filter as unset, not as a search for null', () => {
    expect(filterTopics(topics, { category: null }, NOW)).toHaveLength(3)
  })

  it('does not sweep uncategorised topics into a named category', () => {
    expect(titles(filterTopics(topics, { category: 'React' }, NOW))).toEqual(['react'])
  })
})
