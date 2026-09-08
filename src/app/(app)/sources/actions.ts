'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  deleteSource,
  deleteTranscript,
  insertSource,
  setTopicSource,
  updateSource,
} from '@/lib/data/sources'
import { parseSourceForm } from '@/lib/domain/source-form'

export type SourceResult = { error: string | null; id?: string }

function read(formData: FormData) {
  return {
    course: String(formData.get('course') ?? ''),
    lesson: String(formData.get('lesson') ?? ''),
    chapter: String(formData.get('chapter') ?? ''),
    length: String(formData.get('length') ?? ''),
    url: String(formData.get('url') ?? ''),
    transcript: String(formData.get('transcript') ?? ''),
  }
}

export async function createSource(formData: FormData): Promise<SourceResult> {
  const parsed = parseSourceForm(read(formData))
  if (parsed.error !== undefined) return { error: parsed.error }

  try {
    const source = await insertSource(parsed.value)
    revalidatePath('/sources')
    return { error: null, id: source.id }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The source could not be saved.' }
  }
}

export async function saveSource(id: string, formData: FormData): Promise<SourceResult> {
  const parsed = parseSourceForm(read(formData))
  if (parsed.error !== undefined) return { error: parsed.error }

  try {
    await updateSource(id, parsed.value)
    revalidatePath('/sources')
    revalidatePath(`/sources/${id}`)
    return { error: null, id }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The changes could not be saved.' }
  }
}

/**
 * The transcript goes; the source stays.
 *
 * Not recoverable, and deliberately not automatic — the reference is explicit
 * that the delete stays a deliberate act rather than something distilling does
 * for you. Arc 6 will need the transcript server-side, and a flow that deleted it
 * on distil would have made that impossible.
 */
export async function removeTranscript(id: string): Promise<SourceResult> {
  try {
    await deleteTranscript(id)
    revalidatePath(`/sources/${id}`)
    revalidatePath('/sources')
    return { error: null, id }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The transcript could not be deleted.' }
  }
}


/** Attach or detach a topic's source, from the edit sheet. */
export async function linkTopicSource(
  topicId: string,
  sourceId: string | null,
): Promise<SourceResult> {
  try {
    await setTopicSource(topicId, sourceId)
    revalidatePath(`/topic/${topicId}`)
    revalidatePath('/sources')
    return { error: null }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The source could not be linked.' }
  }
}

export async function removeSource(id: string): Promise<{ error: string } | void> {
  try {
    /*
      No cleanup of the topics. `source_id` is ON DELETE SET NULL, so the entries
      stay and lose the line saying where they came from — a guarantee of the
      schema rather than of this function. That is the sentence the confirmation
      makes, and supabase/tests/sources_test.sql is what keeps it true.
    */
    await deleteSource(id)
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'The source could not be deleted.'
    return { error: `${reason} The source was kept — try again.` }
  }

  revalidatePath('/sources')
  revalidatePath('/library')
  // Outside the try: redirect signals by throwing.
  redirect('/sources')
}
