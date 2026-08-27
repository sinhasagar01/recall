import 'server-only'

import { cache } from 'react'

import { toTopic } from '@/lib/data/topic-mapping'
import type { Difficulty, Topic } from '@/lib/domain/types'
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
  cache() dedupes within a single request, so the rail and the page share one
  query and one readAt instead of issuing the same select twice.
*/
export const listTopics = cache(async (): Promise<TopicsRead> => {
  const supabase = await createClient()

  // RLS scopes this to the signed-in user; there is no user_id filter here on
  // purpose, because one would imply the policy might not be doing its job.
  const { data, error } = await supabase
    .from('topics')
    .select('*')
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
