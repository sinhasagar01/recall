import type { Quiz, TopicRecord } from '@/lib/domain/types'

/**
 * Test support, kept beside the layer it serves. Not domain logic: nothing in
 * src/lib/domain imports it outside a test.
 *
 * Every field has a fixed default so a test only states what it is actually
 * about. Nothing here reads the clock.
 */
export function makeTopic(overrides: Partial<TopicRecord> = {}): TopicRecord {
  return {
    kind: 'topic',
    options: null,
    correct_option: null,
    id: 'topic-1',
    user_id: 'user-1',
    title: 'A topic',
    definition: 'A definition',
    mental_model: null,
    mental_model_image_path: null,
    category: null,
    tags: [],
    difficulty: 'medium',
    confidence: 'new',
    practice_count: 0,
    last_practiced_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/**
 * The quiz arm.
 *
 * A separate builder rather than a `kind` override on `makeTopic`, because the two
 * shapes disagree about four fields — a topic's defaults are invalid for a quiz and
 * the union would reject the mix. Two builders make each one's shape obvious at the
 * call site.
 */
export function makeQuiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    kind: 'quiz',
    definition: null,
    mental_model_image_path: null,
    options: ['The right one', 'The wrong one'],
    correct_option: 0,
    id: 'quiz-1',
    user_id: 'user-1',
    title: 'A question?',
    mental_model: 'Because of the reason.',
    category: null,
    tags: [],
    difficulty: 'medium',
    confidence: 'new',
    practice_count: 0,
    last_practiced_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}
