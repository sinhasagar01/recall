'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { deleteTopicRow, getTopic, removeMentalModelImage, updateTopic } from '@/lib/data/topics'
import type { Difficulty } from '@/lib/domain/types'
import { parseTopicForm } from '@/lib/domain/topic-form'
import { readTopicForm } from '@/lib/data/topic-form-data'
import type { SaveTopicResult } from '@/app/(app)/library/actions'

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

export async function saveTopicEdits(id: string, formData: FormData): Promise<SaveTopicResult> {
  const rawDifficulty = String(formData.get('difficulty') ?? 'medium')

  // The same parser the add action uses, so the two cannot disagree about what a
  // quiz needs. `required` is a courtesy to the browser, not a guarantee here.
  const parsed = parseTopicForm(readTopicForm(formData))
  if (parsed.error !== undefined) return { error: parsed.error }

  try {
    /*
      An edit can change the KIND. `parsed.value` always carries both shapes'
      columns, one side nulled, so switching clears what no longer applies —
      without that the shape CHECK would reject the update.
    */
    const topic = await updateTopic(id, {
      ...parsed.value,
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
