import { describe, expect, it } from 'vitest'
import { GRADE_TO_CONFIDENCE, isNeverPracticed, practiceUpdateFor } from '@/lib/domain/confidence'
import { makeTopic } from '@/lib/domain/topic-fixture'

const NOW = new Date('2026-06-15T12:00:00.000Z')

describe('isNeverPracticed', () => {
  it('is true when confidence is new', () => {
    expect(isNeverPracticed(makeTopic({ confidence: 'new' }))).toBe(true)
  })

  it.each(['weak', 'okay', 'strong'] as const)('is false when confidence is %s', (confidence) => {
    expect(isNeverPracticed(makeTopic({ confidence }))).toBe(false)
  })

  it('keys on confidence, not on last_practiced_at', () => {
    // Editing a topic can set confidence directly, so the two fields can
    // disagree. The card's meter renders confidence, so the predicate must too,
    // or a card labelled "Weak" would show up under the "Never practiced" filter.
    expect(isNeverPracticed(makeTopic({ confidence: 'weak', last_practiced_at: null }))).toBe(false)
    expect(
      isNeverPracticed(makeTopic({ confidence: 'new', last_practiced_at: '2026-03-01T00:00:00.000Z' })),
    ).toBe(true)
  })
})

describe('GRADE_TO_CONFIDENCE', () => {
  it('maps the three grades the practice screen offers', () => {
    expect(GRADE_TO_CONFIDENCE).toEqual({
      'didnt-know': 'weak',
      partly: 'okay',
      'knew-it': 'strong',
    })
  })
})

describe('practiceUpdateFor', () => {
  it('sets confidence, increments practice_count and stamps the time', () => {
    const topic = makeTopic({ confidence: 'new', practice_count: 2, last_practiced_at: null })

    expect(practiceUpdateFor(topic, { kind: 'graded', grade: 'knew-it' }, NOW)).toEqual({
      confidence: 'strong',
      practice_count: 3,
      last_practiced_at: NOW.toISOString(),
    })
  })

  it.each([
    ['didnt-know', 'weak'],
    ['partly', 'okay'],
    ['knew-it', 'strong'],
  ] as const)('grade %s produces confidence %s', (grade, confidence) => {
    const update = practiceUpdateFor(makeTopic(), { kind: 'graded', grade }, NOW)
    expect(update?.confidence).toBe(confidence)
  })

  it('increments from whatever the count already was', () => {
    const topic = makeTopic({ practice_count: 41 })
    expect(practiceUpdateFor(topic, { kind: 'graded', grade: 'partly' }, NOW)?.practice_count).toBe(42)
  })

  it('can move confidence downwards', () => {
    const topic = makeTopic({ confidence: 'strong', practice_count: 5 })
    expect(practiceUpdateFor(topic, { kind: 'graded', grade: 'didnt-know' }, NOW)?.confidence).toBe('weak')
  })

  it('returns null for a skip, writing nothing at all', () => {
    // Skip is modelled as a value, not as a missing branch: no confidence
    // change, no count, no timestamp.
    const topic = makeTopic({ confidence: 'weak', practice_count: 3, last_practiced_at: null })
    expect(practiceUpdateFor(topic, { kind: 'skipped' }, NOW)).toBeNull()
  })

  it('does not mutate the topic it was given', () => {
    const topic = makeTopic({ practice_count: 1 })
    practiceUpdateFor(topic, { kind: 'graded', grade: 'knew-it' }, NOW)
    expect(topic).toEqual(makeTopic({ practice_count: 1 }))
  })

  it('takes the time as a parameter, so the same inputs always give the same output', () => {
    const topic = makeTopic()
    const a = practiceUpdateFor(topic, { kind: 'graded', grade: 'partly' }, new Date('2020-01-01T00:00:00.000Z'))
    expect(a?.last_practiced_at).toBe('2020-01-01T00:00:00.000Z')
  })
})
