'use server'

import { revalidatePath } from 'next/cache'
import { insertTopic } from '@/lib/data/topics'
import type { Difficulty } from '@/lib/domain/types'

export type CreateTopicResult = { error: string; title?: undefined } | { error: null; title: string }

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

export async function createTopic(formData: FormData): Promise<CreateTopicResult> {
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
      ── The image seam ──────────────────────────────────────────────────────
      insertTopic RETURNS the row, because saving with an image is three steps:
      insert, upload to {user_id}/{topic.id}/{filename}, then patch
      mental_model_image_path. The upload needs the id, which only exists now.

      Phase 10 slots in between these two lines. A failed upload must leave the
      topic saved and report the real reason — so the insert stays committed and
      only the patch is retried. Nothing here assumes one atomic write.
    */
    const topic = await insertTopic({
      title,
      definition,
      mental_model: mentalModel === '' ? null : mentalModel,
      category: category === '' ? null : category,
      tags: formData.getAll('tags').map(String),
      difficulty,
    })

    // PHASE 10: upload the image, then patch topic.mental_model_image_path.

    revalidatePath('/library')

    return { error: null, title: topic.title }
  } catch (cause) {
    // The real reason, never a generic message. DESIGN.md section 5.
    return { error: cause instanceof Error ? cause.message : 'The topic could not be saved.' }
  }
}
