'use server'

import { revalidatePath } from 'next/cache'
import { insertTopic, setMentalModelImagePath } from '@/lib/data/topics'
import type { Difficulty } from '@/lib/domain/types'

export type SaveTopicResult =
  | { error: string; title?: undefined; id?: undefined; userId?: undefined }
  | { error: null; title: string; id: string; userId: string }

/**
 * Step three of insert -> upload -> patch.
 *
 * Separate from createTopic on purpose: the upload happens in the browser between
 * them, and a failed upload must leave the row exactly as it was saved. Nothing here
 * can roll a topic back.
 */
export async function attachMentalModelImage(
  id: string,
  path: string | null,
): Promise<{ error: string | null; orphanedPath: string | null }> {
  try {
    const { orphanedPath } = await setMentalModelImagePath(id, path)
    revalidatePath(`/topic/${id}`)
    revalidatePath('/library')
    return { error: null, orphanedPath }
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : 'The image could not be attached.',
      orphanedPath: null,
    }
  }
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

export async function createTopic(formData: FormData): Promise<SaveTopicResult> {
  const title = String(formData.get('title') ?? '').trim()
  const definition = String(formData.get('definition') ?? '').trim()
  const mentalModel = String(formData.get('mental_model') ?? '').trim()
  const category = String(formData.get('category') ?? '').trim()
  const rawDifficulty = String(formData.get('difficulty') ?? 'medium')

  /*
    Validated here as well as in the browser. `required` on an input is a
    convenience for the user, not a guarantee to the server — anything can POST
    to a server action.
  */
  if (title === '') return { error: 'Give the topic a title so you can find it again.' }
  if (definition === '') return { error: 'A topic needs a definition. What is it?' }

  const difficulty = DIFFICULTIES.includes(rawDifficulty as Difficulty)
    ? (rawDifficulty as Difficulty)
    : 'medium'

  try {
    /*
      Step one of three. The upload runs in the browser once this returns the id,
      then attachMentalModelImage patches the path. A failed upload leaves the row
      exactly as saved — there is no rollback path, by design.
    */
    const topic = await insertTopic({
      title,
      definition,
      mental_model: mentalModel === '' ? null : mentalModel,
      category: category === '' ? null : category,
      tags: formData.getAll('tags').map(String),
      difficulty,
    })

    revalidatePath('/library')

    // The id the upload needs only exists now, which is why this is three steps.
    return { error: null, title: topic.title, id: topic.id, userId: topic.user_id }
  } catch (cause) {
    // The real reason, never a generic message. DESIGN.md section 5.
    return { error: cause instanceof Error ? cause.message : 'The topic could not be saved.' }
  }
}
