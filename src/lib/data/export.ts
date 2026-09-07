import 'server-only'

import { toTopic, type TopicRow } from '@/lib/data/topic-mapping'
import type { Topic } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/server'

/**
 * Reading a whole library, for export.
 *
 * The one place in the application that deliberately reads every row a user
 * owns. Issues #4 and #12 removed unbounded reads everywhere else because a page
 * only needs a screenful — but an export that returned a screenful would be a
 * broken export, so this pages through the lot.
 *
 * ── Why there is no admin client here ───────────────────────────────────────
 * This uses the ordinary session client, so **RLS is what scopes it**. The
 * secret key would read across users, and `src/lib/data/account.ts` is the only
 * module in the codebase allowed to hold it — `export-boundary.test.ts` asserts
 * that stays true, because "the export returned someone else's rows" is the one
 * way this feature could be genuinely dangerous.
 */

/** Big enough that a normal library is one round trip, small enough to be a page. */
const PAGE = 1000

const COLUMNS =
  'id, user_id, title, definition, mental_model, mental_model_image_path, category, tags, difficulty, confidence, practice_count, last_practiced_at, created_at, updated_at, kind, options, correct_option, rebuild_at, rebuild_note, rebuild_url, challenge_at, challenge_note, challenge_url, production_at, production_note, production_url'

function fail(action: string, error: { code?: string; message: string }): never {
  throw new Error(`${action} failed: ${error.code ?? 'unknown'} · ${error.message}`)
}

/**
 * Every topic the caller owns, newest first — the library's own order, so the
 * export reads in the order the product presents.
 */
export async function readEntireLibrary(): Promise<Topic[]> {
  const supabase = await createClient()
  const topics: Topic[] = []

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('topics')
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1)

    if (error) fail('Reading your library', error)

    topics.push(...(data as TopicRow[]).map(toTopic))
    if (data.length < PAGE) return topics
  }
}

export interface FetchedImage {
  path: string
  bytes: Uint8Array
}

/**
 * Downloads one image, or reports it missing.
 *
 * A row can point at an object storage no longer holds — a failed replace, a
 * swept orphan, a restore that missed the bucket. One dead path must not cost
 * the whole export, so this returns null and the caller records it. Silence
 * would be worse than the failure: you would get a zip that looks complete.
 *
 * Also the session client, so a caller cannot reach another user's folder even
 * by supplying its path.
 */
export async function fetchImage(path: string): Promise<FetchedImage | null> {
  const supabase = await createClient()

  const { data, error } = await supabase.storage.from('mental-models').download(path)
  if (error || !data) return null

  return { path, bytes: new Uint8Array(await data.arrayBuffer()) }
}
