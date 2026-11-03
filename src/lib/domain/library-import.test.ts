import { describe, expect, it } from 'vitest'
import { parseLibraryImport } from '@/lib/domain/library-import'

const topic = { id: 'a', kind: 'topic', title: 'Callbacks', definition: 'Use **a callback**.', mental_model: null, mental_model_image_path: null, category: 'JavaScript', tags: ['functions'], difficulty: 'medium', confidence: 'strong', practice_count: 2, last_practiced_at: null, extracted: false, last_recall: null, last_recall_at: null, rebuild_at: null, rebuild_note: null, rebuild_url: null, challenge_at: null, challenge_note: null, challenge_url: null, production_at: null, production_note: null, production_url: null, options: null, correct_option: null }

describe('library import', () => {
  it('keeps rich text while reading a Recall export', () => {
    const result = parseLibraryImport({ topics: [topic] })
    expect('topics' in result && result.topics[0].definition).toBe('Use **a callback**.')
  })

  it('rejects a quiz whose answer no longer points at an option', () => {
    const result = parseLibraryImport({ topics: [{ ...topic, kind: 'quiz', definition: null, mental_model: 'Because.', options: ['A', 'B'], correct_option: 3 }] })
    expect(result).toEqual({ error: 'Entry 1: has no valid correct answer.' })
  })
})
