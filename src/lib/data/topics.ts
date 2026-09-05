import 'server-only'

import { cache } from 'react'

import { toTopic } from '@/lib/data/topic-mapping'
import type { Confidence, Difficulty, Topic } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/server'

/**
 * The ONLY module that reads or writes topics. Everything above it works in
 * domain `Topic`s and never sees a database row. See ARCHITECTURE.md.
 *
 * Reads run in server components; writes run in Server Actions. Both carry the
 * user's JWT, so `auth.uid()` resolves and RLS applies either way.
 */

/**
 * What the add form may send.
 *
 * `user_id` is deliberately absent, and cannot be added: it comes from the column
 * default (`auth.uid()`), and the insert policy's with-check refuses anything
 * else. A client that sends one is a client trying to write someone else's row.
 */
export interface NewTopic {
  title: string
  definition: string
  mental_model: string | null
  category: string | null
  tags: string[]
  difficulty: Difficulty
}

/** Supabase errors carry a code worth showing — the mock's error state shows one. */
function fail(action: string, error: { code?: string; message: string }): never {
  throw new Error(`${action} failed: ${error.code ?? 'unknown'} · ${error.message}`)
}

export interface TopicsRead {
  topics: Topic[]
  /**
   * When the rows were read. Relative times ("2h ago", "Recently learned") are
   * relative to THIS, not to whenever a component happened to render — and
   * reading the clock here keeps it out of render, where it would be impure.
   */
  readAt: string
}

/*
  cache() dedupes within a single request, so callers within one request share a
  single query and one readAt instead of issuing the same select twice.

  ── This is the remaining unbounded read ────────────────────────────────────
  It loads every topic the user owns. The library page and the rail no longer use
  it (see src/lib/data/library.ts); the weak, practice and topic-detail pages
  still do. Each needs a different purpose-built query and they are tracked
  separately — see the follow-up to issue #4.

  The column list is explicit rather than `*` so the generated `search_text`
  column, which exists only for the trigram index, is never sent to the client.
*/
export const listTopics = cache(async (): Promise<TopicsRead> => {
  const supabase = await createClient()

  // RLS scopes this to the signed-in user; there is no user_id filter here on
  // purpose, because one would imply the policy might not be doing its job.
  const { data, error } = await supabase
    .from('topics')
    .select(
      'id, user_id, title, definition, mental_model, mental_model_image_path, category, tags, difficulty, confidence, practice_count, last_practiced_at, created_at, updated_at',
    )
    .order('created_at', { ascending: false })

  if (error) fail('Loading your topics', error)

  return { topics: data.map(toTopic), readAt: new Date().toISOString() }
})

/**
 * Inserts the row and returns it.
 *
 * It returns the created topic because saving with an image is three steps, not
 * one: insert the row, upload to `{user_id}/{topic_id}/{filename}`, then patch
 * `mental_model_image_path`. The upload needs the topic id, which only exists
 * after the insert. Phase 10 fills the middle step in; the shape is already here
 * so nothing has to be restructured for it.
 */
export async function insertTopic(input: NewTopic): Promise<Topic> {
  const supabase = await createClient()

  const { data, error } = await supabase.from('topics').insert(input).select().single()

  if (error) fail('Saving the topic', error)

  return toTopic(data)
}

/**
 * One topic, or null.
 *
 * `maybeSingle` rather than `single`: RLS returns zero rows both for an id that
 * does not exist AND for one belonging to somebody else, and those two must stay
 * indistinguishable. A branch that could tell them apart would leak which ids are
 * real. There is deliberately no user_id filter and no 403 path.
 */
export const getTopic = cache(async (id: string): Promise<Topic | null> => {
  const supabase = await createClient()

  const { data, error } = await supabase.from('topics').select('*').eq('id', id).maybeSingle()

  if (error) fail('Loading the topic', error)

  return data === null ? null : toTopic(data)
})

export type TopicEdit = NewTopic

export async function updateTopic(id: string, input: TopicEdit): Promise<Topic> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('topics')
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) fail('Saving your changes', error)

  return toTopic(data)
}

/**
 * Deletes the ROW only.
 *
 * Named `deleteTopicRow`, not `deleteTopic`, because the row is not the only
 * thing a topic owns. ARCHITECTURE.md: a mental-model image can only be removed
 * through the Storage API, and it must go FIRST — a failure there leaves the row
 * intact and the whole operation retryable, whereas deleting the row first
 * orphans an object that nothing references and nothing can find.
 *
 * The caller owns that order. See (app)/topic/[id]/actions.ts.
 */
export async function deleteTopicRow(id: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('topics').delete().eq('id', id)

  if (error) fail('Deleting the topic', error)
}

/** Writes one graded answer. The update itself is computed by the domain layer. */
export async function recordPractice(
  id: string,
  update: { confidence: Confidence; practice_count: number; last_practiced_at: string },
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('topics').update(update).eq('id', id)

  if (error) fail('Saving your grade', error)
}

const BUCKET = 'mental-models'
const SIGNED_URL_SECONDS = 60 * 60

/**
 * A signed URL for a private object, created during the server render — so it is in
 * the first paint and nothing has to resolve client-side. That is what keeps the
 * detail page from shifting while an image appears.
 *
 * Returns null rather than throwing: a missing or unreadable object should degrade
 * to "no visual", not take the whole topic page down.
 */
export async function signedImageUrl(path: string | null): Promise<string | null> {
  if (path === null) return null

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS)

  return error ? null : data.signedUrl
}

/**
 * Removes a storage object. The ONLY way one can be removed — no SQL statement or
 * trigger can, because storage.protect_objects_delete forbids it.
 */
export async function removeMentalModelImage(path: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) fail('Removing the image', error)
}

/**
 * Patches the path after an upload, and cleans up whatever it replaced.
 *
 * Returns whether the previous object survived: on a replace the new object is
 * already uploaded and the row already points at it, so a failed cleanup is an
 * orphan rather than a broken topic. An orphan is acceptable; leaking one silently
 * on every replace is not, so the caller is told and says so.
 */
export async function setMentalModelImagePath(
  id: string,
  path: string | null,
): Promise<{ orphanedPath: string | null }> {
  const supabase = await createClient()

  const existing = await getTopic(id)
  const previous = existing?.mental_model_image_path ?? null

  const { error } = await supabase.from('topics').update({ mental_model_image_path: path }).eq('id', id)
  if (error) fail('Saving the image', error)

  if (previous === null || previous === path) return { orphanedPath: null }

  const { error: removeError } = await supabase.storage.from(BUCKET).remove([previous])
  return { orphanedPath: removeError ? previous : null }
}

/**
 * Removes every mental-model image belonging to the signed-in user.
 *
 * Runs under the USER's own session, not an admin one: the phase 1 storage
 * policies already let someone delete objects under their own `{user_id}/`
 * prefix, so account deletion needs admin privilege for exactly one call — the
 * auth row — and not for this.
 */
export async function removeAllOwnImages(userId: string): Promise<number> {
  const supabase = await createClient()
  const paths: string[] = []

  const { data: topicFolders, error } = await supabase.storage.from(BUCKET).list(userId)
  if (error) fail('Listing your images', error)

  for (const folder of topicFolders ?? []) {
    if (folder.id !== null) continue // a file directly under the user prefix
    const { data: files } = await supabase.storage.from(BUCKET).list(`${userId}/${folder.name}`)
    for (const file of files ?? []) {
      if (file.id !== null) paths.push(`${userId}/${folder.name}/${file.name}`)
    }
  }

  if (paths.length === 0) return 0

  const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths)
  if (removeError) fail('Removing your images', removeError)

  return paths.length
}
