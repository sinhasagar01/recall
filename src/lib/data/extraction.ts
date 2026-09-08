import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import {
  coverageToRows,
  mergeCoverage,
  parseCoverage,
  type CoverageEntry,
  type ExtractedConcept,
} from '@/lib/domain/extraction'

/**
 * The reads extraction needs, and the one write it is allowed.
 *
 * Split from `lib/data/sources.ts` because the boundary guard asserts the extract
 * path cannot reach a database client at all — so the module that CAN must be a
 * different one, and being a different one is what makes that assertion
 * meaningful rather than a comment.
 */

function fail(action: string, error: { code?: string; message: string }): never {
  throw new Error(`${action} failed: ${error.code ?? 'unknown'} · ${error.message}`)
}

/**
 * The transcript, read on the server.
 *
 * The browser never uploads it. Arc 2 kept the body reachable server-side for
 * exactly this — *"both actions will send it to a model from the server, so it
 * must not exist only in browser state"* — and the payoff is that `extract`
 * takes an id, so a 61,000-word transcript never goes near the 1 MB server-action
 * body limit and never leaves the origin except to the vendor.
 */
export const readTranscript = cache(
  async (sourceId: string): Promise<{ transcript: string; words: number } | null> => {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('sources')
      .select('transcript, transcript_words')
      .eq('id', sourceId)
      .maybeSingle()

    if (error) fail('Reading the transcript', error)
    if (data === null || data.transcript === null) return null

    return { transcript: data.transcript, words: data.transcript_words ?? 0 }
  },
)

/**
 * Every topic title in the library, for duplicate detection.
 *
 * Titles only — no bodies, no joins. Library-wide rather than per-source,
 * because the harm the check exists to prevent ("two topics about hoisting and
 * no way to tell them apart") does not care which video each came from.
 */
export const readLibraryTitles = cache(async (): Promise<string[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase.from('topics').select('title')

  if (error) fail('Reading your library', error)

  return data.map((row) => row.title)
})

export const readCoverage = cache(async (sourceId: string): Promise<CoverageEntry[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sources')
    .select('coverage')
    .eq('id', sourceId)
    .maybeSingle()

  if (error) fail('Reading the coverage', error)

  return parseCoverage(data?.coverage)
})

/**
 * The one write in the arc, and it happens only when Save is pressed.
 *
 * ── One insert, not forty-seven ─────────────────────────────────────────────
 * Fourteen concepts with three questions each is 14 topics and 42 quizzes. A row
 * at a time would be 56 round trips inside one click.
 *
 * PostgREST **unions the keys across a bulk insert**: a column present on one
 * object only is sent as an explicit NULL for the others, which then fails a NOT
 * NULL. That cost arc 5 a debugging session, so every row here is built by the
 * same function and carries every key.
 *
 * ── Ordinary topics and quizzes ─────────────────────────────────────────────
 * Same table, same confidence, same queue, linked through arc 2's `source_id`.
 * `extracted` is the only thing that marks them, and it is a library filter and
 * nothing else — no effect on practice selection, the weak page, or confidence.
 *
 * `user_id` is deliberately absent: it comes from the column default and the RLS
 * with-check, never from the client.
 */
export async function saveExtracted(
  sourceId: string,
  concepts: ExtractedConcept[],
  coverage: CoverageEntry[],
): Promise<{ topics: number; quizzes: number }> {
  const supabase = await createClient()

  const rows = concepts.flatMap((concept) => [
    {
      title: concept.title,
      definition: concept.definition,
      mental_model: concept.mentalModel,
      category: null,
      tags: [] as string[],
      kind: 'topic' as const,
      source_id: sourceId,
      capability_id: null,
      options: null,
      correct_option: null,
      extracted: true,
    },
    ...concept.questions.map((question) => ({
      title: question.question,
      definition: null,
      /* A quiz's `mental_model` is its explanation — one field, one register. */
      mental_model: concept.definition,
      category: null,
      tags: [] as string[],
      kind: 'quiz' as const,
      source_id: sourceId,
      capability_id: null,
      options: question.options,
      correct_option: question.correctOption,
      extracted: true,
    })),
  ])

  if (rows.length > 0) {
    const { error } = await supabase.from('topics').insert(rows)
    if (error) fail('Saving what you kept', error)
  }

  /*
    Coverage is merged, never overwritten, and it is read INSIDE the save rather
    than passed in from the client — a second tab that saved a different pass
    between this page loading and Save being pressed would otherwise be erased by
    a stale copy of the list.
  */
  const existing = await readCoverage(sourceId)
  const merged = mergeCoverage(existing, coverage)

  const { error } = await supabase
    .from('sources')
    .update({ coverage: coverageToRows(merged) })
    .eq('id', sourceId)

  if (error) fail('Recording what the video covered', error)

  return {
    topics: rows.filter((row) => row.kind === 'topic').length,
    quizzes: rows.filter((row) => row.kind === 'quiz').length,
  }
}

/**
 * A source's topic ids, for `?scope=source`.
 *
 * This is the module that knows what a source is. `practice_ordered_page` takes
 * a generic `p_ids uuid[]` and never learns — which is what keeps
 * `sources-boundary.test.ts` absolute rather than absolute-with-an-exception.
 */
export const topicIdsForSource = cache(async (sourceId: string): Promise<string[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase.from('topics').select('id').eq('source_id', sourceId)

  if (error) fail('Finding what this source produced', error)

  return data.map((row) => row.id)
})
