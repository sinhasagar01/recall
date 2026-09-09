import { fail } from '@/lib/data/fail'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { listLedger } from '@/lib/data/ledger'
import type { RoundCounts, RoundType, Scorecard, Level, Length } from '@/lib/domain/interview'
import type { ProjectItem } from '@/lib/domain/ledger'

/**
 * The reads a round needs, and the two writes it is allowed.
 *
 * ── Nothing here touches the practice queue ─────────────────────────────────
 * The interview reads topics to ask about them. It never calls `practiceQueue`,
 * never touches `practice_ordered_page`, and is not a practisable thing itself —
 * so the four queue-boundary guards stay absolute and literally true for the
 * reason they always were: no queue module has learned anything, because no queue
 * module is involved.
 */

/**
 * What a question needs, and nothing else.
 *
 * Deliberately NOT `listLibrary`, which is built for the library UI and carries
 * cursors, quick filters and two read modes — a pool needs none of that and would
 * inherit all of it. Bounded, because a round asks at most sixteen questions and
 * an unbounded read of a 500-topic library to pick eight is waste with a shape.
 */
const POOL_COLUMNS = 'id, title, definition, mental_model, category, confidence, kind'
const POOL_LIMIT = 300

export interface PoolTopic {
  id: string
  title: string
  definition: string | null
  mental_model: string | null
  category: string | null
  confidence: string
  kind: string
}

export const readTopicPool = cache(async (): Promise<PoolTopic[]> => {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('topics')
    .select(POOL_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(POOL_LIMIT)

  if (error) fail('Reading your library', error)

  return data as PoolTopic[]
})

/**
 * The behavioural pool, and it is `listLedger` unchanged.
 *
 * This is the reason session one builds two round shapes rather than one:
 * concepts draw from the library and behavioural draws from the **ledger**, so
 * the pool resolver is two-source from the start. Build concepts only and session
 * two discovers the queue was quietly topic-shaped.
 */
export const readLedgerPool = cache(async (): Promise<ProjectItem[]> => {
  const items = await listLedger()
  return items.filter((item) => item.kind === 'adr' || item.kind === 'incident')
})

/**
 * The one insert, at the end, with the scorecard.
 *
 * There is no in-flight row and nothing to orphan: the conversation lives in the
 * browser and dies with the tab, so a round you abandoned left nothing **by
 * construction rather than by cleanup**. Same shape as arc 5's "a day with
 * nothing typed has no row".
 *
 * `user_id` is deliberately absent — the column default and the RLS with-check
 * own it, never the client.
 *
 * Numbers only. The scorecard's summary, its per-dimension notes and its
 * per-question notes are model prose and are **not** written; they live in the
 * page that rendered them and nowhere else. `interview_test.sql` asserts there is
 * no column to put them in.
 */
export async function saveRound(input: {
  roundType: RoundType
  minutes: Length
  level: Level
  counts: RoundCounts
  elapsedSeconds: number
  overBySeconds: number
  scorecard: Scorecard
  topicIds: string[]
  /*
    DSA only. The one column in this table that is neither a count nor a score —
    it is what YOU wrote, which is the line the table draws. A problem statement
    is generated prose and has no column, like the summary and the notes.
  */
  code: string[]
}): Promise<string> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('interview_rounds')
    .insert({
      round_type: input.roundType,
      code: input.code,
      minutes: input.minutes,
      level: input.level,
      asked: input.counts.asked,
      answered: input.counts.answered,
      follow_ups_offered: input.counts.followUpsOffered,
      follow_ups_held: input.counts.followUpsHeld,
      questions_asked: input.counts.questionsAsked,
      hints_used: input.counts.hintsUsed,
      elapsed_seconds: input.elapsedSeconds,
      over_by_seconds: input.overBySeconds,
      recall: input.scorecard.scores.recall,
      depth: input.scorecard.scores.depth,
      precision: input.scorecard.scores.precision,
      enquiry: input.scorecard.scores.enquiry,
      overall: input.scorecard.overall,
      topic_ids: input.topicIds,
    })
    .select('id')
    .single()

  if (error) fail('Saving the round', error)
  return data.id
}

/**
 * The offer step's write, and the ONLY thing in this arc that touches confidence.
 *
 * The score is about the round, never about what you know. The scorecard offers
 * and you confirm — so this exists in its own function, called from one action,
 * and the scorecard's own render path holds no write and no client at all.
 * `interview-boundary.test.ts` asserts that, and it was seen failing by putting
 * an update on the render path.
 */
export async function markTopicsWeak(topicIds: string[]): Promise<number> {
  if (topicIds.length === 0) return 0

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('topics')
    .update({ confidence: 'weak' })
    .in('id', topicIds)
    .select('id')

  if (error) fail('Marking those weak', error)
  return data.length
}

/** This user's rounds of one type, newest first — the sparkline. */
export const pastRounds = cache(
  async (roundType: RoundType): Promise<{ overall: number; created_at: string }[]> => {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('interview_rounds')
      .select('overall, created_at')
      .eq('round_type', roundType)
      .order('created_at', { ascending: false })
      .limit(5)

    if (error) fail('Reading your past rounds', error)
    return data.reverse()
  },
)
