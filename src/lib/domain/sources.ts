import type { Topic } from '@/lib/domain/types'

/**
 * Sources: the video or article a topic came from.
 *
 * A source is genuinely not a topic — no confidence, never practised, and it dies
 * without taking its children with it. That is why arc 2 is the first new table
 * since the schema was built rather than a third `kind`.
 *
 * The transcript is **scratch**: you paste it, distil out of it, and delete it.
 * The source record outlives the transcript, and a topic outlives its source.
 */

/**
 * Every column that would put a source in front of the queue.
 *
 * Derived here rather than typed out in the test, so a rename cannot orphan
 * `sources-boundary.test.ts`. `source_id` is on the `topics` row; `transcript`
 * and the table name are what a join would have to name.
 */
export const SOURCE_COLUMNS = ['source_id', 'transcript', "from('sources')"] as const

export interface Source {
  id: string
  user_id: string
  title: string
  course: string | null
  url: string | null
  transcript: string | null
  transcript_words: number | null
  transcript_deleted_at: string | null
  caveat_noted: boolean
  created_at: string
  updated_at: string
}

/** What the list needs, which is everything except the body. */
export type SourceSummary = Omit<Source, 'transcript'>

/** A source and what has been distilled from it — the unit the list renders. */
export interface SourceWithEntriesView {
  source: SourceSummary
  entries: Topic[]
}

/**
 * The three states a transcript can be in, which read differently on screen.
 *
 * "Deleted" and "never had one" are the same absence in the data and different
 * sentences in the product — *"Deleted. The title, course and link are kept"*
 * versus *"No transcript. Distil from your own notes."* — which is the whole
 * reason `transcript_deleted_at` exists.
 */
export type TranscriptState = 'present' | 'deleted' | 'none'

export function transcriptState(source: Pick<Source, 'transcript_words' | 'transcript_deleted_at'>): TranscriptState {
  if (source.transcript_words !== null) return 'present'
  return source.transcript_deleted_at === null ? 'none' : 'deleted'
}

/** The five extractions, in the order the checklist shows them. */
export const EXTRACTION_KINDS = [
  'definition',
  'mental-model',
  'challenge',
  'retrieval',
  'caveat',
] as const
export type ExtractionKind = (typeof EXTRACTION_KINDS)[number]

/** Three quizzes is what "retrieval questions" means. */
export const RETRIEVAL_TARGET = 3

/**
 * A source that has taught you nothing after a fortnight.
 *
 * Its own constant. `RECENT_WINDOW_DAYS` is 7 and answers "did this just happen";
 * `STALE_WINDOW_DAYS` is 60 and answers "was this so long ago you probably cannot
 * do it any more". Neither is this question, and sharing a number between three
 * different questions is how one of them silently changes.
 */
export const UNDISTILLED_WINDOW_DAYS = 14

export interface Extraction {
  kind: ExtractionKind
  label: string
  /** What the checklist shows on the right: a count, a hint, or a prompt. */
  detail: string
  done: boolean
  /** True for the one item that is a tick rather than a derivation. */
  manual: boolean
}

/**
 * The five extractions for one source.
 *
 * **Four are derived and one is ticked.** Derived means it cannot be gamed: you
 * cannot claim three retrieval questions with two quizzes written, in the same
 * way you cannot claim a capability by finishing a video. Only "when not to use
 * it" is stored, because nothing in the data distinguishes that topic from any
 * other — and the UI labels it as the exception.
 *
 * Takes the linked entries rather than querying, so the rule is a pure function
 * and the data layer decides how to fetch them.
 */
export function extractionsFor(
  source: Pick<Source, 'caveat_noted'>,
  linked: Topic[],
): Extraction[] {
  const topics = linked.filter((entry) => entry.kind === 'topic')
  const quizzes = linked.filter((entry) => entry.kind === 'quiz')
  const withModel = topics.filter(
    (entry) => entry.mental_model !== null && entry.mental_model.trim() !== '',
  )
  // Arc 1's challenge evidence, on any linked topic.
  const challenged = topics.filter((entry) => entry.challenge_at !== null)

  return [
    {
      kind: 'definition',
      label: 'A definition',
      detail: topics.length === 0 ? 'no topics yet' : `${topics.length} topics`,
      done: topics.length > 0,
      manual: false,
    },
    {
      kind: 'mental-model',
      label: 'A mental model',
      detail: topics.length === 0 ? '—' : `${withModel.length} of ${topics.length}`,
      done: withModel.length > 0,
      manual: false,
    },
    {
      kind: 'challenge',
      label: 'A challenge, attempted',
      detail: challenged.length === 0 ? 'no evidence yet' : `${challenged.length} recorded`,
      done: challenged.length > 0,
      manual: false,
    },
    {
      kind: 'retrieval',
      label: `${RETRIEVAL_TARGET} retrieval questions`,
      detail: `${quizzes.length} of ${RETRIEVAL_TARGET} quizzes`,
      done: quizzes.length >= RETRIEVAL_TARGET,
      manual: false,
    },
    {
      kind: 'caveat',
      label: 'When not to use it',
      detail: source.caveat_noted ? 'noted' : 'tick when written',
      done: source.caveat_noted,
      manual: true,
    },
  ]
}

/** How many of the five a source has, for the dots and the "3 of 5" line. */
export function extractionCount(source: Pick<Source, 'caveat_noted'>, linked: Topic[]): number {
  return extractionsFor(source, linked).filter((extraction) => extraction.done).length
}

/**
 * A source that has produced nothing, for long enough to say so.
 *
 * The one place this product says something uncomfortable. It is a fact about
 * you rather than an error, which is why only the yield LABEL takes the alarm
 * colour and the row stays neutral — see DESIGN.md.
 */
export function isUndistilled(
  source: Pick<Source, 'created_at'>,
  linkedCount: number,
  now: Date,
): boolean {
  if (linkedCount > 0) return false

  const age = now.getTime() - Date.parse(source.created_at)
  return age >= UNDISTILLED_WINDOW_DAYS * 24 * 60 * 60 * 1000
}

/**
 * What selecting transcript text produces.
 *
 * It fills the **definition** and never the mental model. Someone else's words
 * are fine for the fact; the model is the correction only you can write, and a
 * prefilled one would be a quotation pretending to be understanding. The return
 * type is the whole enforcement — there is no field here to put a model in.
 */
export function definitionFromSelection(selection: string): { definition: string } {
  return { definition: selection.trim().replace(/\s+/g, ' ') }
}
