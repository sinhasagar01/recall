import { describe, expect, it } from 'vitest'
import { toTopic, type TopicRow } from '@/lib/data/topic-mapping'

const row: TopicRow = {
  kind: 'topic',
  options: null,
  correct_option: null,
  id: 'topic-1',
  user_id: 'user-1',
  title: 'React reconciliation',
  definition: 'Comparing two element trees.',
  mental_model: null,
  mental_model_image_path: null,
  category: 'React',
  tags: ['rendering'],
  difficulty: 'medium',
  confidence: 'weak',
  practice_count: 3,
  last_practiced_at: '2026-06-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
}

describe('toTopic', () => {
  it('carries every column across unchanged', () => {
    expect(toTopic(row)).toEqual(row)
  })

  it('narrows confidence and difficulty from string to their unions', () => {
    // The generated Row types both as `string`: a CHECK constraint does not
    // narrow into TypeScript. Narrowing them is the boundary's whole job.
    const topic = toTopic(row)
    expect(topic.confidence).toBe('weak')
    expect(topic.difficulty).toBe('medium')
  })

  it.each(['new', 'weak', 'okay', 'strong'])('accepts confidence %s', (confidence) => {
    expect(toTopic({ ...row, confidence }).confidence).toBe(confidence)
  })

  it.each(['easy', 'medium', 'hard'])('accepts difficulty %s', (difficulty) => {
    expect(toTopic({ ...row, difficulty }).difficulty).toBe(difficulty)
  })

  it('throws, naming the row, when confidence is outside the union', () => {
    // Unreachable while the CHECK constraint holds. If it ever fires, the
    // migration and the domain have diverged and that must be loud, not coerced.
    expect(() => toTopic({ ...row, confidence: 'unsure' })).toThrowError(/topic-1.*confidence.*unsure/)
  })

  it('throws, naming the row, when difficulty is outside the union', () => {
    expect(() => toTopic({ ...row, difficulty: 'impossible' })).toThrowError(
      /topic-1.*difficulty.*impossible/,
    )
  })
})
