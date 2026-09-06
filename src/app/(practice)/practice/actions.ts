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
    /*
      A quiz has no grade — its outcome is measured against a stored answer, not
      self-assessed. Refused here rather than trusted, because an action is a
      public endpoint and the union that keeps the components honest stops at the
      wire.
    */
    if (topic.kind !== 'topic') return { error: 'A quiz is answered, not graded.' }

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

/**
 * Answering a quiz.
 *
 * The client sends which option was picked, never whether it was right. The
 * correct index is already in the row, so the outcome is derived here rather
 * than believed from the browser — otherwise the confidence record would be
 * whatever a caller claimed. Same reason `gradeTopic` refuses a quiz: an action
 * is reachable by anything that can sign in.
 */
export async function answerQuiz(id: string, picked: number): Promise<GradeResult> {
  try {
    const quiz = await getTopic(id)
    if (quiz === null) return { error: 'That quiz is no longer in your library.' }
    if (quiz.kind !== 'quiz') return { error: 'A topic is graded, not answered.' }

    const update = practiceUpdateFor(
      quiz,
      { kind: 'answered', correct: picked === quiz.correct_option },
      new Date(),
    )
    if (update === null) return { error: null }

    await recordPractice(id, update)

    revalidatePath('/library')
    revalidatePath(`/topic/${id}`)

    return { error: null }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'That answer could not be saved.' }
  }
}
