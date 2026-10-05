'use server'

import { revalidatePath } from 'next/cache'
import { listLibrary, type Cursor } from '@/lib/data/library'
import {
  deleteTopicRows,
  insertTopic,
  removeMentalModelImages,
  setMentalModelImagePath,
  topicsForDeletion,
} from '@/lib/data/topics'
import { parseTopicForm } from '@/lib/domain/topic-form'
import { readTopicForm } from '@/lib/data/topic-form-data'
import type { TopicFilters } from '@/lib/domain/search-filter'
import type { Topic } from '@/lib/domain/types'

export type SaveTopicResult =
  | { error: string; title?: undefined; id?: undefined; userId?: undefined }
  | { error: null; title: string; id: string; userId: string }

export type DeleteLibraryItemsInput =
  | { scope: 'all' }
  | { scope: 'selected'; ids: string[] }

/**
 * Deletes either every entry in the caller's library or an explicit selection.
 * RLS remains the authority boundary: arbitrary ids from a forged client simply
 * do not appear in `topicsForDeletion` and cannot be removed.
 */
export async function deleteLibraryItems(
  input: DeleteLibraryItemsInput,
): Promise<{ error: string | null; deleted: number }> {
  try {
    const targets = await topicsForDeletion(input.scope === 'all' ? null : input.ids)
    if (targets.length === 0) return { error: null, deleted: 0 }

    /*
      Same ordering as the single-entry action: objects first, then rows. If
      storage rejects the removal, the records remain and the operation is safe
      to retry. The query above is intentionally limited to this destructive
      operation; no library page receives an unbounded read.
    */
    await removeMentalModelImages(targets.flatMap((topic) => (topic.imagePath ? [topic.imagePath] : [])))
    await deleteTopicRows(targets.map((topic) => topic.id))

    revalidatePath('/library')
    return { error: null, deleted: targets.length }
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : 'The selected library entries could not be deleted.',
      deleted: 0,
    }
  }
}

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


export async function createTopic(formData: FormData): Promise<SaveTopicResult> {
  /*
    Validated here as well as in the browser, through the same domain parser the
    edit action uses. `required` on an input is a convenience for the user, not a
    guarantee to the server — anything can POST to a server action.
  */
  const parsed = parseTopicForm(readTopicForm(formData))
  if (parsed.error !== undefined) return { error: parsed.error }

  /*
    No difficulty. It is not asked for at capture any more (issue #14) — nothing
    reads it when choosing what to practise, so it was charging a decision at the
    moment that most needs to be cheap. The column default applies, and it is set
    later from the edit sheet if it is worth setting at all.
  */
  try {
    /*
      Step one of three. The upload runs in the browser once this returns the id,
      then attachMentalModelImage patches the path. A failed upload leaves the row
      exactly as saved — there is no rollback path, by design.
    */
    const topic = await insertTopic(parsed.value)

    revalidatePath('/library')

    // The id the upload needs only exists now, which is why this is three steps.
    return { error: null, title: topic.title, id: topic.id, userId: topic.user_id }
  } catch (cause) {
    // The real reason, never a generic message. DESIGN.md, "Copy rules".
    return { error: cause instanceof Error ? cause.message : 'It could not be saved.' }
  }
}

/**
 * The next keyset page, for the "Load more" button.
 *
 * Only reachable in server mode: under the local-mode threshold the client already
 * has every topic and there is nothing to load. Filters stay in the URL, so a
 * filtered view is still shareable; the accumulated pages are client state, which
 * is why this returns rows instead of revalidating the page.
 */
export async function loadMoreTopics(
  filters: TopicFilters,
  cursor: Cursor,
): Promise<{ topics: Topic[]; nextCursor: Cursor | null }> {
  const data = await listLibrary(filters, cursor)

  // listLibrary only returns local mode for an unfiltered first read, and this
  // always passes a cursor. The branch is here because the type demands it.
  if (data.mode === 'local') return { topics: data.topics, nextCursor: null }

  return { topics: data.topics, nextCursor: data.nextCursor }
}
