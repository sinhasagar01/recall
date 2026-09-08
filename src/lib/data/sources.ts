import 'server-only'

import { cache } from 'react'

import { toTopic, type TopicRow } from '@/lib/data/topic-mapping'
import type { Source, SourceSummary } from '@/lib/domain/sources'
import { parseCoverage } from '@/lib/domain/extraction'
import type { Topic } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/server'

/**
 * The only module that reads or writes sources.
 *
 * RLS scopes every read here. There is no `user_id` filter written by hand, for
 * the reason the rest of the data layer gives: writing one would imply the policy
 * might not be doing its job.
 */

/*
  The list NEVER selects the transcript.

  Six sources at 14,000 words each is half a megabyte the list has no use for —
  it shows a word count, and `transcript_words` is a generated column precisely
  so that number is available without reading the body.
*/
const SUMMARY_COLUMNS =
  'id, user_id, title, lesson, course, chapter, url, duration_seconds, transcript_words, transcript_deleted_at, coverage, created_at, updated_at'

function fail(action: string, error: { code?: string; message: string }): never {
  throw new Error(`${action} failed: ${error.code ?? 'unknown'} · ${error.message}`)
}

/**
 * A row into a `Source`, with `coverage` PARSED rather than cast.
 *
 * The row's `coverage` is `Json` — the database cannot see inside a jsonb column
 * and neither can the generated types. Casting the row to `Source` would claim
 * `CoverageEntry[]` over whatever is actually stored, and every read of
 * `entry.pass` would be `undefined` with nothing raising anywhere.
 *
 * That is the shape of issue #24, which is a double cast asserting nine columns
 * a query does not return. The lesson applied rather than repeated: where a type
 * says more than the row can promise, the gap gets a function, not a cast.
 */
function toSource(row: {
  id: string
  user_id: string
  /*
    ── Arc 2.1a only ─────────────────────────────────────────────────────────
    `title` is still selected and still read here, for exactly one deploy.

    The rename is expand → migrate → contract: 2.1a added `lesson` NULLABLE and
    backfilled it, this build reads and writes `lesson`, and 2.1b drops `title`
    and makes `lesson` NOT NULL. Until then a row CAN carry a null `lesson` —
    one written by the previous build in the minutes before this one went live,
    if the mirror trigger were ever missing — so the domain's `lesson: string`
    is honoured here rather than asserted.

    THIS IS THE ONLY FALLBACK. 2.1b deletes `title` from the select list above,
    the two fields below, and the `?? row.title` on the next line. Four lines,
    one file, no search.
  */
  title: string
  lesson: string | null
  course: string | null
  chapter: string | null
  duration_seconds: number | null
  url: string | null
  transcript_words: number | null
  transcript_deleted_at: string | null
  coverage: unknown
  created_at: string
  updated_at: string
}): SourceSummary {
  return {
    id: row.id,
    user_id: row.user_id,
    lesson: row.lesson ?? row.title,
    course: row.course,
    chapter: row.chapter,
    duration_seconds: row.duration_seconds,
    url: row.url,
    transcript_words: row.transcript_words,
    transcript_deleted_at: row.transcript_deleted_at,
    coverage: parseCoverage(row.coverage),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export interface SourceWithEntries {
  source: SourceSummary
  /** Its topics and quizzes, for the progress summary and the derived list. */
  entries: Topic[]
}

/**
 * The sources list.
 *
 * Two reads rather than a join, because the entries are needed per source for the
 * five extractions and PostgREST's embedded selects would drag the whole topic
 * row through a nested shape the domain does not use. Both are bounded by RLS to
 * one person's library.
 */
export const listSources = cache(async (): Promise<SourceWithEntries[]> => {
  const supabase = await createClient()

  const [sources, entries] = await Promise.all([
    supabase.from('sources').select(SUMMARY_COLUMNS).order('created_at', { ascending: false }),
    supabase.from('topics').select(`${ENTRY_COLUMNS}, source_id`).not('source_id', 'is', null),
  ])

  if (sources.error) fail('Loading your sources', sources.error)
  if (entries.error) fail('Loading what you distilled', entries.error)

  const bySource = new Map<string, Topic[]>()
  for (const row of entries.data as (TopicRow & { source_id: string })[]) {
    const list = bySource.get(row.source_id) ?? []
    list.push(toTopic(row))
    bySource.set(row.source_id, list)
  }

  return sources.data.map((row) => ({
    source: toSource(row),
    entries: bySource.get(row.id) ?? [],
  }))
})

/*
  What an entry needs to appear in a derived list: enough to render a row, plus
  the challenge marker the third extraction reads. Not `*` — the point of an
  explicit list is that adding a column to `topics` does not silently widen every
  read in the application.
*/
const ENTRY_COLUMNS =
  'id, user_id, title, definition, mental_model, mental_model_image_path, category, tags, difficulty, confidence, practice_count, last_practiced_at, created_at, updated_at, kind, options, correct_option, rebuild_at, rebuild_note, rebuild_url, challenge_at, challenge_note, challenge_url, production_at, production_note, production_url'

/** One source with its transcript — the workspace, and the only read that takes the body. */
export const readSource = cache(
  async (id: string): Promise<{ source: Source; entries: Topic[] } | null> => {
    const supabase = await createClient()

    const [source, entries] = await Promise.all([
      supabase.from('sources').select('*').eq('id', id).maybeSingle(),
      supabase.from('topics').select(ENTRY_COLUMNS).eq('source_id', id),
    ])

    if (source.error) fail('Loading the source', source.error)
    if (entries.error) fail('Loading what you distilled', entries.error)
    if (source.data === null) return null

    return {
      source: { ...toSource(source.data), transcript: source.data.transcript },
      entries: (entries.data as TopicRow[]).map(toTopic),
    }
  },
)

/**
 * The source a topic came from, for the "Where this came from" line.
 *
 * A separate read because `source_id` is deliberately not on the domain `Topic` —
 * see topic-mapping.ts. One extra query on one page, in exchange for a queue that
 * has no way to name a source.
 */
export const readTopicSource = cache(
  async (topicId: string): Promise<{ source: SourceSummary; siblings: number } | null> => {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('topics')
      .select(`source_id, sources ( ${SUMMARY_COLUMNS} )`)
      .eq('id', topicId)
      .maybeSingle()

    if (error) fail('Loading where this came from', error)

    const row = data as { source_id: string | null; sources: SourceSummary | null } | null
    if (row?.sources == null || row.source_id === null) return null

    const { count, error: countError } = await supabase
      .from('topics')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', row.source_id)
      .neq('id', topicId)

    if (countError) fail('Counting the other entries', countError)

    return { source: row.sources, siblings: count ?? 0 }
  },
)

/** Every source, name-only, for the edit sheet's optional field. */
export async function listSourceOptions(): Promise<{ id: string; lesson: string }[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sources')
    .select('id, lesson, title')
    .order('created_at', { ascending: false })

  if (error) fail('Loading your sources', error)
  // `?? title` for the same one-deploy reason as toSource — see above.
  return data.map((row) => ({ id: row.id, lesson: row.lesson ?? row.title }))
}

/**
 * How many sources, for the rail. A count rather than the rows: this runs on
 * every page in the group, and the rail loading a library is the mistake the
 * three topic counts were written to avoid.
 */
export const countSources = cache(async (): Promise<number> => {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('sources')
    .select('id', { count: 'exact', head: true })

  if (error) fail('Counting your sources', error)
  return count ?? 0
})

export interface NewSource {
  lesson: string
  course: string | null
  chapter: string | null
  duration_seconds: number | null
  url: string | null
  transcript: string | null
}

/**
 * ── Arc 2.1a writes BOTH columns, and it has to ─────────────────────────────
 * `sources.title` is still `not null` until 2.1b drops it, so an insert naming
 * only `lesson` fails with 23502. The mirror trigger fills `lesson` from
 * `title`, never the other way round — it exists to protect the OLD build's
 * writes, not this one's.
 *
 * So this build writes `title: input.lesson` alongside. 2.1b deletes that line
 * and this comment with it.
 */
const withLegacyTitle = (input: NewSource) => ({ ...input, title: input.lesson })

export async function insertSource(input: NewSource): Promise<SourceSummary> {
  const supabase = await createClient()

  // No user_id: it comes from the column default and the insert policy's
  // with-check refuses anything else.
  const { data, error } = await supabase
    .from('sources')
    .insert(withLegacyTitle(input))
    .select(SUMMARY_COLUMNS)
    .single()

  if (error) fail('Saving the source', error)
  return toSource(data)
}

export async function updateSource(id: string, input: NewSource): Promise<SourceSummary> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sources')
    .update({ ...withLegacyTitle(input), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(SUMMARY_COLUMNS)
    .single()

  if (error) fail('Saving your changes', error)
  return toSource(data)
}

/**
 * Deleting the transcript, and only the transcript.
 *
 * The source record survives — title, course and link are kept — and
 * `transcript_deleted_at` is what lets the workspace say "deleted" rather than
 * "there never was one". The delete is not recoverable, and the confirmation says
 * so.
 */
export async function deleteTranscript(id: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('sources')
    .update({ transcript: null, transcript_deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) fail('Deleting the transcript', error)
}

/**
 * Deletes the source row only.
 *
 * Its topics survive: `source_id` is `on delete set null`, so the entries stay and
 * lose the line saying where they came from. That is a guarantee of the schema
 * rather than of this function, which is why there is no cleanup here — see
 * supabase/tests/sources_test.sql.
 */
export async function deleteSource(id: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('sources').delete().eq('id', id)

  if (error) fail('Deleting the source', error)
}

/** Attaches or detaches a topic's source. Used by the edit sheet and by distilling. */
export async function setTopicSource(topicId: string, sourceId: string | null): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('topics').update({ source_id: sourceId }).eq('id', topicId)

  if (error) fail('Linking the source', error)
}

/**
 * The topic ids a course or a chapter produced, for `?scope=course` / `?scope=chapter`.
 *
 * The same shape arc 6 established for `?scope=source`, one and two levels up:
 * this module knows what a source is, resolves the set here, and hands the queue
 * a plain list of topic ids. `practice_ordered_page` takes a generic
 * `p_ids uuid[]` and never learns that courses exist.
 *
 * That is what keeps `sources-boundary.test.ts` absolute AND literally true
 * rather than true-with-an-exception: the practice modules still name none of
 * `source_id`, `transcript` or `from('sources')`, because they never touch a
 * source at all.
 *
 * Two reads rather than a join, for the same reason `listSources` uses two: a
 * PostgREST embedded select would drag whole topic rows through a nested shape
 * to produce a list of ids.
 */
async function topicIdsForSources(sourceIds: string[]): Promise<string[]> {
  if (sourceIds.length === 0) return []

  const supabase = await createClient()
  const { data, error } = await supabase.from('topics').select('id').in('source_id', sourceIds)

  if (error) fail('Finding what this produced', error)
  return data.map((row) => row.id)
}

export const topicIdsForCourse = cache(async (course: string): Promise<string[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('sources').select('id').eq('course', course)

  if (error) fail('Finding this course', error)
  return topicIdsForSources(data.map((row) => row.id))
})

export const topicIdsForChapter = cache(
  async (course: string, chapter: string): Promise<string[]> => {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('sources')
      .select('id')
      .eq('course', course)
      .eq('chapter', chapter)

    if (error) fail('Finding this chapter', error)
    return topicIdsForSources(data.map((row) => row.id))
  },
)
