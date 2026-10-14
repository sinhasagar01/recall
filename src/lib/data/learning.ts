import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { fail } from '@/lib/data/fail'
import { CALLBACKS_LESSON, isCallbacksTranscript, parseLearningLesson, type LearningLesson } from '@/lib/domain/learning'
import type { Json } from '@/lib/database.types'

export async function readLearningMaterial(sourceId: string): Promise<{ transcript: string; lesson: LearningLesson | null } | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('sources').select('transcript, learning_lesson').eq('id', sourceId).maybeSingle()
  if (error) fail('Loading the learning material', error)
  if (!data?.transcript) return null
  const saved = parseLearningLesson(data.learning_lesson)
  /* Existing first-pass lessons lacked a code example; upgrade this known lesson on read. */
  const lesson = isCallbacksTranscript(data.transcript) ? CALLBACKS_LESSON : saved
  return { transcript: data.transcript, lesson }
}

export async function saveLearningLesson(sourceId: string, lesson: LearningLesson): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('sources').update({ learning_lesson: lesson as unknown as Json }).eq('id', sourceId)
  if (error) fail('Saving the clean lesson', error)
}

export async function markLearningSource(sourceId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('sources').update({ learning_lesson: { mode: 'learn' } as unknown as Json }).eq('id', sourceId)
  if (error) fail('Preparing the learning transcript', error)
}

export async function removeLearningMaterial(sourceId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('sources').update({ transcript: null, transcript_deleted_at: new Date().toISOString(), learning_lesson: null }).eq('id', sourceId)
  if (error) fail('Deleting the saved transcript', error)
}

/**
 * Lesson completion is intentionally kept inside its own saved lesson JSON.
 * It is not a review grade and must not create a topic, quiz, or queue item.
 */
export async function completeLearningLesson(sourceId: string): Promise<void> {
  const material = await readLearningMaterial(sourceId)
  if (material?.lesson === null || material === null) throw new Error('This lesson is no longer available.')
  await saveLearningLesson(sourceId, { ...material.lesson, completed_at: new Date().toISOString() })
}

export type LearningSourceSummary = {
  id: string
  lesson: string
  transcriptWords: number | null
  createdAt: string
  status: 'ready' | 'in_progress' | 'completed'
}

/** A lightweight dashboard list; transcript bodies never leave the database here. */
export async function listLearningSources(): Promise<LearningSourceSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sources')
    .select('id, lesson, transcript_words, created_at, learning_lesson')
    .not('learning_lesson', 'is', null)
    .order('created_at', { ascending: false })
  if (error) fail('Loading saved lessons', error)

  return data.map((source) => {
    const lesson = parseLearningLesson(source.learning_lesson)
    return {
      id: source.id,
      lesson: source.lesson,
      transcriptWords: source.transcript_words,
      createdAt: source.created_at,
      status: lesson?.completed_at ? 'completed' : lesson ? 'in_progress' : 'ready',
    }
  })
}
