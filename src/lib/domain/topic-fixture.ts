import type { Topic } from '@/lib/domain/types'

/**
 * Test support, kept beside the layer it serves. Not domain logic: nothing in
 * src/lib/domain imports it outside a test.
 *
 * Every field has a fixed default so a test only states what it is actually
 * about. Nothing here reads the clock.
 */
export function makeTopic(overrides: Partial<Topic> = {}): Topic {
  return {
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
