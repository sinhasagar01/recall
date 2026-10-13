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
