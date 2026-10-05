import 'server-only'
import { fail } from '@/lib/data/fail'

import { cache } from 'react'

import { toTopic } from '@/lib/data/topic-mapping'
import { evidenceColumns, type EvidenceKind } from '@/lib/domain/evidence'
import type { Confidence, Difficulty, Topic } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/server'
import type { TopicPracticeUpdate } from '@/lib/domain/confidence'

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
interface NewShared {
  title: string
  mental_model: string | null
  category: string | null
  tags: string[]
  /*
    Where it came from. On the WRITE shape, not on the domain `Topic` — the two
    are different types for exactly this reason. See topic-mapping.ts for why the
    domain type must not carry it.
  */
  source_id: string | null
  capability_id: string | null
}

/**
 * A union, like `Topic` itself, and for a sharper reason here.
 *
 * Every field of the other shape is written **explicitly null** rather than
 * omitted. On an insert that is merely tidy; on an update it is the whole point —
 * switching an existing topic to a quiz has to clear `definition`, and switching
 * back has to clear `options` and `correct_option`, or `topics_shape_is_consistent`
 * rejects the write. Omitting a field leaves the old value in place, so "omit what
 * does not apply" would make the toggle work in the add sheet and fail in the edit
 * sheet, which is the kind of difference nobody notices until it is in the way.
 */
export type NewTopic =
  | (NewShared & { kind: 'topic'; definition: string; options: null; correct_option: null })
  | (NewShared & {
      kind: 'quiz'
      definition: null
      options: string[]
      correct_option: number
    })

/** Supabase errors carry a code worth showing — the mock's error state shows one. */
/*
  There is deliberately no "read every topic" function here any more.

  listTopics used to be it, and every page reached for it because it was the easy
  thing to reach for. Issues #4 and #12 replaced the last of its callers with
  purpose-built queries — a keyset page for the library, an ordered page for the
  weak list and a practice session, and counts for the rail and the category
  select. Adding it back would give the next page an unbounded read to find.
*/

/**
 * Flattens the union into the row the client writes.
 *
 * Written out field by field rather than spread, because the point of the union is
 * that **both shapes' columns are always sent** — a spread of a narrowed arm would
 * type-check while omitting exactly the fields an update has to clear.
 */
function rowFor(input: NewTopic) {
  return {
    title: input.title,
    mental_model: input.mental_model,
    category: input.category,
    tags: input.tags,
    kind: input.kind,
    source_id: input.source_id,
    capability_id: input.capability_id,
    definition: input.definition,
    options: input.options,
    correct_option: input.correct_option,
  }
}

/**
 * Where a topic came from, on the INSERT only.
 *
 * ── Why this is a second argument and not a field on `NewShared` ────────────
 * `rowFor` is shared with `updateTopic`, and `TopicEdit` is `NewTopic` plus a
 * difficulty — so a field added to `NewShared` is a field every EDIT sends. The
 * edit sheet has no idea a quiz has a parent, so it would send `null`, and
 * **editing a quiz's wording would silently cut it loose from the topic it came
 * from.** The same shape would have happened to `extracted` had it been added
 * there, un-marking extracted topics on their first edit.
 *
 * Provenance is set once, when the thing is made. Expressing that as a separate
 * argument to the insert is what stops the update path from being able to change
 * it at all.
 */
export interface Provenance {
  /** The topic a quiz was saved out of. Null for everything made by hand. */
  parent_topic_id?: string | null
}

export async function insertTopic(input: NewTopic, provenance: Provenance = {}): Promise<Topic> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('topics')
    .insert({ ...rowFor(input), parent_topic_id: provenance.parent_topic_id ?? null })
    .select()
    .single()

  if (error) fail('Saving the topic', error)

  return toTopic(data)
}

/**
 * The topic a quiz came out of, or null.
 *
 * Its own query, because `parent_topic_id` is deliberately off the domain
 * `Topic` — see topic-mapping.ts for why, and for the cost this function is.
 * `maybeSingle`, so a parent that was deleted (the link is `on delete set
 * null`) and a parent belonging to somebody else both read as "no parent"
 * rather than as an error.
 */
export const parentTopicOf = cache(
  async (id: string): Promise<{ id: string; title: string } | null> => {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('topics')
      .select('parent_topic_id')
      .eq('id', id)
      .maybeSingle()

    if (error) fail('Reading where this came from', error)
    if (!data?.parent_topic_id) return null

    const { data: parent, error: parentError } = await supabase
      .from('topics')
      .select('id, title')
      .eq('id', data.parent_topic_id)
      .maybeSingle()

    if (parentError) fail('Reading where this came from', parentError)
    return parent ?? null
  },
)

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

/**
 * Editing can set difficulty; adding cannot — issue #14.
 *
 * The field is never read by practice selection, so asking for it at capture
 * charged a decision at the moment that most needs to be cheap. A new topic
 * takes the column default and difficulty becomes something you set later, once
 * you have met the topic and have an opinion worth recording.
 *
 * Expressed in the type rather than by remembering: `NewTopic` has no
 * `difficulty`, so the add path cannot send one even by accident.
 */
export type TopicEdit = NewTopic & { difficulty: Difficulty }

export async function updateTopic(id: string, input: TopicEdit): Promise<Topic> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('topics')
    .update({ ...rowFor(input), difficulty: input.difficulty })
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
  await deleteTopicRows([id])
}

/**
 * Deletes exactly the supplied rows.
 *
 * Image objects deliberately remain the caller's responsibility: storage must be
 * cleaned first, while the rows still tell us which objects belong to them.
 */
export async function deleteTopicRows(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  const supabase = await createClient()

  const { error } = await supabase.from('topics').delete().in('id', ids)

  if (error) fail('Deleting the selected library entries', error)
}

/**
 * The rows a destructive library operation needs before it can delete them.
 * This is purpose-built for cleanup, not a general unbounded library reader.
 */
export async function topicsForDeletion(ids: string[] | null): Promise<{ id: string; imagePath: string | null }[]> {
  if (ids !== null && ids.length === 0) return []

  const supabase = await createClient()
  let query = supabase.from('topics').select('id, mental_model_image_path')
  if (ids !== null) query = query.in('id', ids)

  const { data, error } = await query
  if (error) fail('Preparing the selected library entries for deletion', error)

  return (data ?? []).map((topic) => ({ id: topic.id, imagePath: topic.mental_model_image_path }))
}

/** Writes one graded answer. The update itself is computed by the domain layer. */
export async function recordPractice(id: string, update: TopicPracticeUpdate): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('topics').update(update).eq('id', id)

  if (error) fail('Saving your grade', error)
}

/**
 * Records or clears one evidence marker.
 *
 * Writes only that marker's three columns — the other two markers and everything
 * else on the row are untouched, so recording a challenge cannot disturb a
 * rebuild. `null` clears all three together, which is what
 * `topics_evidence_is_consistent` requires: a date without a note is rejected, so
 * a partial clear is not a state the database will hold.
 *
 * RLS scopes it. No user_id filter here, for the reason the rest of this module
 * gives: writing one would imply the policy might not be doing its job.
 */
export async function writeEvidence(
  id: string,
  kind: EvidenceKind,
  entry: { at: string; note: string; url: string | null } | null,
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('topics').update(evidenceColumns(kind, entry)).eq('id', id)

  if (error) fail(entry === null ? 'Removing that evidence' : 'Saving that evidence', error)
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
  await removeMentalModelImages([path])
}

/** Removes a known set of topic-owned objects before their rows are removed. */
export async function removeMentalModelImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return

  const supabase = await createClient()
  const { error } = await supabase.storage.from(BUCKET).remove(paths)
  if (error) fail('Removing the selected images', error)
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
