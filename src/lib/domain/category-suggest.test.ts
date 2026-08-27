import { describe, expect, it } from 'vitest'
import {
  SUGGESTABLE_CATEGORIES,
  UNCATEGORIZED,
  suggestCategory,
} from '@/lib/domain/category-suggest'

describe('SUGGESTABLE_CATEGORIES', () => {
  it('is the vocabulary the design reference uses', () => {
    expect([...SUGGESTABLE_CATEGORIES]).toEqual([
      'React',
      'Next.js',
      'TypeScript',
      'JavaScript',
      'CSS',
      'Browser',
      'Web performance',
      'Frontend architecture',
    ])
  })

  it('does not include the fallback', () => {
    expect(SUGGESTABLE_CATEGORIES).not.toContain(UNCATEGORIZED)
    expect(UNCATEGORIZED).toBe('Uncategorized')
  })
})

describe('suggestCategory', () => {
  it('suggests from the title', () => {
    expect(suggestCategory('React reconciliation', 'Comparing two element trees.')).toBe('React')
  })

  it('suggests from the definition when the title is generic', () => {
    expect(suggestCategory('The cascade', 'Specificity decides which selector wins.')).toBe('CSS')
  })

  it('matches case insensitively', () => {
    expect(suggestCategory('REACT HOOKS', '')).toBe('React')
  })

  it('matches a keyword inside a longer sentence', () => {
    expect(suggestCategory('How hydration works', 'The server sends HTML and the client hydrates it.')).toBe(
      'React',
    )
  })

  it.each([
    ['Next.js app router', '', 'Next.js'],
    ['Discriminated unions', 'A TypeScript pattern for narrowing.', 'TypeScript'],
    ['The event loop', 'Microtasks drain before the next macrotask in JavaScript.', 'JavaScript'],
    ['Flexbox alignment', 'CSS lays out items along the main axis.', 'CSS'],
    ['CORS preflight', 'The browser sends an OPTIONS request first.', 'Browser'],
    ['INP replaces FID', 'A Core Web Vitals metric for responsiveness.', 'Web performance'],
    ['Container components', 'A frontend architecture pattern for separating concerns.', 'Frontend architecture'],
  ])('suggests %s -> %s', (title, definition, expected) => {
    expect(suggestCategory(title, definition)).toBe(expected)
  })

  it('lets the title win when title and definition disagree', () => {
    // "React" in the title outweighs "CSS" in the definition.
    expect(suggestCategory('React server components', 'Unrelated CSS specificity notes.')).toBe('React')
  })

  it('falls back to the definition when the title matches nothing', () => {
    expect(suggestCategory('Some notes', 'A CSS specificity rule.')).toBe('CSS')
  })

  it('returns Uncategorized when nothing matches', () => {
    expect(suggestCategory('Sourdough starter', 'Feed it flour and water every day.')).toBe(UNCATEGORIZED)
  })

  it('returns Uncategorized for empty input', () => {
    expect(suggestCategory('', '')).toBe(UNCATEGORIZED)
    expect(suggestCategory('   ', '   ')).toBe(UNCATEGORIZED)
  })

  it('is deterministic for the same input', () => {
    const args = ['React and CSS', 'CSS and React'] as const
    expect(suggestCategory(...args)).toBe(suggestCategory(...args))
  })

  it('does not match a keyword that is only part of an unrelated word', () => {
    // "scss" should not trigger CSS via a bare substring match.
    expect(suggestCategory('Discussion notes', 'Nothing technical here.')).toBe(UNCATEGORIZED)
  })
})
