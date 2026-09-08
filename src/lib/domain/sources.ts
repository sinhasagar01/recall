import { isNeverPracticed, needsReview } from '@/lib/domain/confidence'
import type { CoverageEntry } from '@/lib/domain/extraction'
import { plural } from '@/lib/domain/plural'
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
  /**
   * A source IS a lesson, inside a chapter, inside a course.
   *
   * Arc 2 called this `title` and put an unexplained `course` beneath it, which
   * is why neither read as what it is. Renamed in arc 2.1 — in the schema too,
   * across two migrations, because a rename lands while the previous build is
   * still serving. See ARCHITECTURE.md.
   */
  lesson: string
  course: string | null
  /** Between course and lesson. Text, not a table — see the 2.1a migration. */
  chapter: string | null
  /** Whole seconds. Entered as free text; see lib/domain/duration.ts. */
  duration_seconds: number | null
  url: string | null
  transcript: string | null
  transcript_words: number | null
  transcript_deleted_at: string | null
  /** What the video contained and what happened to each — see lib/domain/extraction.ts. */
  coverage: CoverageEntry[]
  created_at: string
  updated_at: string
}

/**
 * Course › chapter › lesson, with the levels that are absent left out.
 *
 * One function, because this string appears on the topic detail page, in the
 * form's live breadcrumb and twice in the export — and four copies of "join the
 * levels that exist" is four chances for them to disagree about a lesson with a
 * course but no chapter.
 *
 * Returned as an ARRAY rather than a joined string: the topic page makes every
 * level a separate link, and a component cannot un-join a string.
 */
export function sourceCrumbs(
  source: Pick<Source, 'lesson' | 'course' | 'chapter'>,
): string[] {
  return [source.course, source.chapter, source.lesson].filter(
    (level): level is string => level !== null && level !== '',
  )
}

export function sourceBreadcrumb(source: Pick<Source, 'lesson' | 'course' | 'chapter'>): string {
  return sourceCrumbs(source).join(' › ')
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
 * sentences in the product — *"Deleted. The lesson, course and link are kept"*
 * versus *"No transcript. Distil from your own notes."* — which is the whole
 * reason `transcript_deleted_at` exists.
 */
export type TranscriptState = 'present' | 'deleted' | 'none'

export function transcriptState(source: Pick<Source, 'transcript_words' | 'transcript_deleted_at'>): TranscriptState {
  if (source.transcript_words !== null) return 'present'
  return source.transcript_deleted_at === null ? 'none' : 'deleted'
}

/**
 * A source that has taught you nothing after a fortnight.
 *
 * Its own constant. `RECENT_WINDOW_DAYS` is 7 and answers "did this just happen";
 * `STALE_WINDOW_DAYS` is 60 and answers "was this so long ago you probably cannot
 * do it any more". Neither is this question, and sharing a number between three
 * different questions is how one of them silently changes.
 */
export const UNDISTILLED_WINDOW_DAYS = 14

/**
 * What a source has produced, and how well you know it.
 *
 * ── What this replaced, and why ─────────────────────────────────────────────
 * Arc 2 shipped a five-item extraction checklist: a definition, a mental model,
 * a challenge attempted, three retrieval questions, and a ticked "when not to
 * use it". Four were derived and one was stored, and the whole thing was a
 * **proxy** for the question you actually have — *have I mined this video?*
 *
 * Arc 6 answers that question directly, because extraction makes it answerable:
 * the entries exist, so their confidence is the measure. Nothing here is ticked,
 * which means there is nothing left to game — the property arc 2 valued about
 * the four derived items now holds for all of it.
 *
 * `isNeverPracticed` and `needsReview` are reused rather than restated. A second
 * definition of "weak" is how two screens come to disagree about the same topic.
 */
export interface SourceProgress {
  topics: number
  quizzes: number
  neverPractised: number
  weak: number
  /** Every entry okay or better, and at least one entry. */
  done: boolean
}

export function sourceProgress(linked: Topic[]): SourceProgress {
  const neverPractised = linked.filter(isNeverPracticed)
  const weak = linked.filter((entry) => needsReview(entry) && !isNeverPracticed(entry))

  return {
    topics: linked.filter((entry) => entry.kind === 'topic').length,
    quizzes: linked.filter((entry) => entry.kind === 'quiz').length,
    neverPractised: neverPractised.length,
    weak: weak.length,
    /*
      "When the list is all ticks and the confidences are okay or better, the
      video is finished with you rather than the other way round." Zero entries
      is not done — it is not started.
    */
    done: linked.length > 0 && linked.every((entry) => !needsReview(entry)),
  }
}

/**
 * The summary line, in one place.
 *
 * Every noun agrees with its number here rather than at the call site, which is
 * the lesson from "1 topics" reaching production: pluralising the first noun
 * inline is exactly what makes the second and third easy to miss.
 *
 * A clause is **omitted** rather than shown at zero. "0 weak" is a claim about
 * nothing, and a summary that lists what is fine alongside what is not stops
 * being a summary.
 */
export function sourceProgressCopy(progress: SourceProgress): string {
  if (progress.topics === 0 && progress.quizzes === 0) return 'nothing extracted yet'

  const parts: string[] = []
  if (progress.topics > 0) parts.push(plural(progress.topics, 'topic'))
  if (progress.quizzes > 0) parts.push(plural(progress.quizzes, 'quiz', 'quizzes'))
  if (progress.neverPractised > 0) parts.push(`${progress.neverPractised} never practised`)
  if (progress.weak > 0) parts.push(`${progress.weak} weak`)

  return parts.join(' · ')
}

/*
  ── Two counts that are three characters apart, and were not ────────────────
  "1 of 1 mined" and "0 of 1 mined out" appeared on the same screen meaning
  different things: one is *produced something*, the other is *every entry okay
  or better*. Two phrases that close cannot carry two meanings — a reader takes
  the second for a typo of the first.

  So they are named apart, and both are derived HERE rather than by two
  similar-looking inline expressions in two components. The words:

    MINED     the lesson produced at least one entry. About extraction: did I
              get anything out of this video.
    FINISHED  every entry it produced is okay or better. About confidence: is
              this video done with me. See §7 — "when the list is all ticks and
              the confidences are okay or better, the video is finished with you
              rather than the other way round".

  A lesson is mined long before it is finished, and can never be finished
  without being mined.
*/

/** Did this lesson produce anything at all? */
export function isMined(entries: Topic[]): boolean {
  return entries.length > 0
}

/** Is this lesson done with you — every entry okay or better? */
export function isFinished(entries: Topic[]): boolean {
  return sourceProgress(entries).done
}

export function minedCount(views: { entries: Topic[] }[]): number {
  return views.filter((view) => isMined(view.entries)).length
}

export function finishedCount(views: { entries: Topic[] }[]): number {
  return views.filter((view) => isFinished(view.entries)).length
}

/** "3 of 5 mined" — the extraction count. */
export function minedCopy(mined: number, total: number): string {
  return `${mined} of ${total} mined`
}

/** "2 of 7 finished" — the confidence count. Deliberately not "mined out". */
export function finishedCopy(finished: number, total: number): string {
  return `${finished} of ${total} finished`
}

/*
  ── The lesson meter ────────────────────────────────────────────────────────
  Five squares, filled by entries at okay or better over entries from this
  lesson. It replaces the single dot that replaced arc 2's five extraction dots:
  the dot was binary and, on a row already carrying four numbers, too quiet to
  read at all.

  Five and not three because five is the shape that was already there and the
  granularity is free. NOT a bar: a bar reads as a percentage, and this app has
  refused percentages since the first spec — five discrete marks say "some of
  it" without implying a precision the number does not have.
*/
export const METER_SQUARES = 5

export interface LessonMeter {
  /** Squares filled, 0…METER_SQUARES. */
  filled: number
  /** Entries at okay or better. */
  settled: number
  total: number
  /** Nothing distilled yet — drawn dashed and empty, not as a zero. */
  none: boolean
}

/** Entries you can actually recall: okay or better, which is `!needsReview`. */
export function settledCount(entries: Topic[]): number {
  return entries.filter((entry) => !needsReview(entry)).length
}

export function lessonMeter(entries: Topic[]): LessonMeter {
  const total = entries.length
  const settled = settledCount(entries)

  /*
    Floor, with a floor of its own: any progress at all shows one square, so a
    lesson with 3 of 21 settled does not read as untouched. And five squares
    means ALL of them — `floor(ratio * 5)` reaches 5 only at a ratio of exactly
    1, so "full" and "finished" are the same statement rather than two that
    nearly agree.
  */
  const filled =
    total === 0 || settled === 0
      ? 0
      : Math.max(1, Math.floor((settled / total) * METER_SQUARES))

  return { filled, settled, total, none: total === 0 }
}

/**
 * The exact numbers, for the tooltip and the aria-label.
 *
 * Colour is never the only signal — the marks are a glance and this is the
 * truth. DESIGN.md's accessibility floor, applied to a control that is
 * otherwise five coloured squares.
 */
export function meterLabel(meter: LessonMeter): string {
  if (meter.none) return 'nothing distilled'
  if (meter.settled === meter.total) return `finished — all ${meter.total} at okay or better`
  return `${meter.settled} of ${meter.total} at okay or better`
}

/**
 * What sits beside a practise button: how much, not what it does.
 *
 * The button carries the verb and the meta carries the size, so the label stays
 * the same length whatever the count is.
 */
export function practiseMeta(entries: Topic[]): string {
  const never = entries.filter(isNeverPracticed).length
  const parts = [plural(entries.length, 'entry', 'entries')]
  if (never > 0) parts.push(`${never} never practised`)
  return parts.join(' · ')
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
 * What the delete confirmation says, and why it is derived rather than written
 * inline.
 *
 * The sentence has three things that have to agree with the count — the noun, the
 * verb, and the pronoun — and only the noun was doing so: at one entry it read
 * *"The 1 entry you distilled from it stay in your library — they lose the line
 * saying where they came from."* Pluralising the noun at the call site is what
 * makes the other two easy to miss, so the whole clause lives here and is tested
 * at nothing, one and many.
 *
 * Zero is not a smaller version of the same sentence. "The 0 entries stay in your
 * library" is a claim about nothing, so it gets its own wording and no
 * consequence clause — there is nothing to lose a line.
 */
export function deleteSourceCopy(entryCount: number): { kept: string; lost: string } {
  if (entryCount === 0) {
    return { kept: 'Nothing has been distilled from it yet', lost: '' }
  }

  const subject = entryCount === 1 ? 'it loses' : 'they lose'
  const possessive = entryCount === 1 ? 'it came' : 'they came'

  return {
    kept: `The ${plural(entryCount, 'entry', 'entries')} you distilled from it ${
      entryCount === 1 ? 'stays' : 'stay'
    } in your library`,
    lost: `${subject} the line saying where ${possessive} from`,
  }
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
