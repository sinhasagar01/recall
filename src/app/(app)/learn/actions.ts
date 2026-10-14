'use server'

import { revalidatePath } from 'next/cache'
import { insertSource } from '@/lib/data/sources'
import { deleteSource } from '@/lib/data/sources'
import { completeLearningLesson, readLearningMaterial, saveLearningLesson } from '@/lib/data/learning'
import { createLearningLesson } from '@/lib/ai/learn'

export type LearnSourceResult = { error: string | null; id?: string }

/**
 * Learn starts with the same durable object as Sources: a transcript-backed
 * source. The different entry point changes the next step, not where raw
 * material lives.
 */
export async function createLearnSource(
  title: string,
  transcript: string,
): Promise<LearnSourceResult> {
  const lesson = title.trim() || 'Untitled transcript'
  const body = transcript.trim()

  if (body === '') return { error: 'Paste a transcript before creating a lesson.' }
  if (body.length > 750_000) {
    return { error: 'This transcript is too large to paste at once. Add it in smaller parts.' }
  }

  try {
    const source = await insertSource({
      lesson,
      course: null,
      chapter: null,
      duration_seconds: null,
      url: null,
      transcript: body,
    })
    revalidatePath('/learn')
    revalidatePath('/sources')
    return { error: null, id: source.id }
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : 'The transcript could not be saved.',
    }
  }
}

export async function buildCleanLesson(sourceId: string): Promise<{ error: string | null }> {
  const material = await readLearningMaterial(sourceId)
  if (material === null) return { error: 'This transcript is no longer available.' }
  const result = await createLearningLesson(material.transcript)
  if (!result.ok) return { error: result.reason }
  try {
    await saveLearningLesson(sourceId, result.lesson)
    revalidatePath(`/learn/${sourceId}`)
    return { error: null }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The clean lesson could not be saved.' }
  }
}

export async function markLearningLessonComplete(sourceId: string): Promise<{ error: string | null }> {
  try {
    await completeLearningLesson(sourceId)
    revalidatePath('/learn')
    revalidatePath(`/learn/${sourceId}`)
    return { error: null }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The lesson could not be marked complete.' }
  }
}

export async function removeLearningSource(sourceId: string): Promise<{ error: string | null }> {
  try {
    await deleteSource(sourceId)
    revalidatePath('/learn')
    revalidatePath('/sources')
    revalidatePath('/library')
    return { error: null }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The saved transcript could not be deleted.' }
  }
}
