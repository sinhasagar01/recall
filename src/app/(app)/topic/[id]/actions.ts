'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { deleteTopicRow, getTopic, removeMentalModelImage, updateTopic } from '@/lib/data/topics'
import type { Difficulty } from '@/lib/domain/types'
import type { SaveTopicResult } from '@/app/(app)/library/actions'

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

export async function saveTopicEdits(id: string, formData: FormData): Promise<SaveTopicResult> {
  const title = String(formData.get('title') ?? '').trim()
  const definition = String(formData.get('definition') ?? '').trim()
  const mentalModel = String(formData.get('mental_model') ?? '').trim()
  const category = String(formData.get('category') ?? '').trim()
  const rawDifficulty = String(formData.get('difficulty') ?? 'medium')

  // Validated on the server too: `required` is a courtesy to the browser, not a
  // guarantee to the action.
  if (title === '') return { error: 'Give the topic a title so you can find it again.' }
  if (definition === '') return { error: 'A topic needs a definition. What is it?' }

  try {
    const topic = await updateTopic(id, {
      title,
      definition,
      mental_model: mentalModel === '' ? null : mentalModel,
      category: category === '' ? null : category,
      tags: formData.getAll('tags').map(String),
      difficulty: DIFFICULTIES.includes(rawDifficulty as Difficulty)
        ? (rawDifficulty as Difficulty)
        : 'medium',
    })

    // Both: the detail page shows the topic, the library shows its card.
    revalidatePath(`/topic/${id}`)
    revalidatePath('/library')

    return { error: null, title: topic.title, id: topic.id, userId: topic.user_id }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The changes could not be saved.' }
  }
}

export async function deleteTopic(id: string): Promise<{ error: string } | void> {
  try {
    const topic = await getTopic(id)
    /*
      ── Delete order, from ARCHITECTURE.md ───────────────────────────────────
      The object goes FIRST. A failure here leaves the row intact and the whole
      operation retryable. Deleting the row first would orphan an object that
      nothing references and nothing can find, because the only record of its
      path was the row just deleted.

      Storage objects cannot be removed by SQL or by a trigger, so this ordering
      is the application's job and cannot be delegated to the database.
    */
    if (topic?.mental_model_image_path) {
      await removeMentalModelImage(topic.mental_model_image_path)
    }

    await deleteTopicRow(id)
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'The topic could not be deleted.'
    // Said plainly: the topic is still here, and trying again is safe.
    return { error: `${reason} The topic was kept — try again.` }
  }

  revalidatePath('/library')
  // Outside the try: redirect() signals by throwing, and catching it here would
  // swallow the navigation and report a phantom failure.
  redirect('/library')
}
