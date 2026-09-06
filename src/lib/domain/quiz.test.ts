import { describe, expect, it } from 'vitest'
import { gradeQuiz } from '@/lib/domain/confidence'
import { seededShuffle } from '@/lib/domain/practice-selection'
import { makeQuiz } from '@/lib/domain/topic-fixture'
import { matchesQuery } from '@/lib/domain/search-filter'

describe('gradeQuiz', () => {
  it('is strong when right and weak when wrong', () => {
    expect(gradeQuiz(true)).toBe('strong')
    expect(gradeQuiz(false)).toBe('weak')
  })

  it('can never land on okay', () => {
    /*
      The reason this is its own function rather than a reuse of
      GRADE_TO_CONFIDENCE. A quiz is answered against a stored correct option;
      "partly" is not an outcome that exists, and sharing the three-way map is what
      would quietly make it reachable.
    */
    for (const correct of [true, false]) {
      expect(gradeQuiz(correct)).not.toBe('okay')
    }
  })
})

describe('search over a quiz', () => {
  const quiz = makeQuiz({
    title: 'What runs first — a promise or a timeout?',
    options: ['The promise, microtasks drain first', 'The timeout, zero is immediate'],
    mental_model: 'The microtask queue empties between macrotasks.',
  })

  it('matches the question', () => {
    expect(matchesQuery(quiz, 'runs first')).toBe(true)
  })

  it('matches an option', () => {
    // The reference: search matches "a quiz's question, its options and its explanation".
    expect(matchesQuery(quiz, 'zero is immediate')).toBe(true)
  })

  it('matches the explanation', () => {
    expect(matchesQuery(quiz, 'macrotasks')).toBe(true)
  })

  it('does not match what is not there', () => {
    expect(matchesQuery(quiz, 'reconciliation')).toBe(false)
  })
})

describe('option order', () => {
  it('does not leave the answer in the same position across seeds', () => {
    /*
      Otherwise by the third round you are recalling "the second one" rather than
      the answer. Uses the existing seeded shuffle rather than a second one.
    */
    const options = ['a', 'b', 'c', 'd']
    const positions = new Set(
      ['seed-1', 'seed-2', 'seed-3', 'seed-4', 'seed-5', 'seed-6'].map((seed) =>
        seededShuffle(seed)(options).indexOf('a'),
      ),
    )

    expect(positions.size).toBeGreaterThan(1)
  })

  it('is stable for one seed, so a re-render does not reshuffle mid-question', () => {
    const options = ['a', 'b', 'c', 'd']
    expect(seededShuffle('seed-1')(options)).toEqual(seededShuffle('seed-1')(options))
  })
})
