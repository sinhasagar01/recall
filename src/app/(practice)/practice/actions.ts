'use server'

import { revalidatePath } from 'next/cache'
import { recordPractice } from '@/lib/data/topics'
import { practiceUpdateFor, type Grade } from '@/lib/domain/confidence'
import { getTopic } from '@/lib/data/topics'

export type GradeResult = { error: string | null }

/*
  There is deliberately NO skip action.

  Skip must write nothing — no confidence, no practice_count, no
  last_practiced_at — and the strongest way to guarantee that is to leave no code
  path that could. Skipping advances the queue in the browser and never reaches
  the server at all.
*/
export async function gradeTopic(id: string, grade: Grade): Promise<GradeResult> {
  try {
    const topic = await getTopic(id)
    if (topic === null) return { error: 'That topic is no longer in your library.' }

    // The rule itself lives in the domain layer and was tested in phase 2.
    const update = practiceUpdateFor(topic, { kind: 'graded', grade }, new Date())
    if (update === null) return { error: null }

    await recordPractice(id, update)

    /*
      Neither of these is /practice, so nothing re-renders mid-session. They mark
      the library and this topic's page stale, so arriving there after the session
      shows the new confidence and the corrected rail counts without anyone having
      to reload during practice.
    */
    revalidatePath('/library')
    revalidatePath(`/topic/${id}`)

    return { error: null }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'That grade could not be saved.' }
  }
}
