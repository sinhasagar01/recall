import type { Database } from '@/lib/database.types'
import type { Confidence, Difficulty, Quiz, Topic, TopicRecord } from '@/lib/domain/types'

/**
 * Four columns are omitted deliberately, for two different reasons.
 *
 * **`search_text`** is a generated column that exists only so the trigram index
 * has something to index — derived from columns the domain already has, never
 * written, and never read by the application. Letting it through would make the
 * boundary assertion below demand a field on the domain Topic that means nothing
 * to the domain.
 *
 * **`source_id`** is real, written, and read — just never through `Topic`. It is
 * omitted so that the queue *cannot* see it: if the domain Topic carried it,
 * `TopicBoundaryIsSound` would oblige every read to return it, including
 * `practice_ordered_page`, and `sources-boundary.test.ts` could no longer forbid
 * every source column in a queue module without carving out an exception for the
 * one module it most needs to cover. A source is never practised, and the
 * cheapest way to guarantee that is for the practice path to have no way to name
 * it.
 *
 * **`capability_id`** is omitted for the same reason as `source_id`, and the
 * reason bears repeating rather than being inherited by proximity: a capability
 * is never practised either. If the domain Topic carried it,
 * `phases-boundary.test.ts` would have to permit the one column it exists to
 * forbid, in the one module that matters most.
 *
 * The cost, stated: the topic detail page reads its source and its capability
 * with their own queries, and the edit sheet takes each as a prop rather than
 * reading them off the topic. Props, in exchange for two boundaries with no
 * exception in either.
 *
 * **`parent_topic_id`** is the `source_id` kind of omission, not the
 * `search_text` kind — **load-bearing, not merely tidy.** Plenty will read it:
 * a quiz saved from an interview follow-up points at the topic that follow-up
 * came from, and the quiz's detail page says so. The practice path must not.
 *
 * The hazard is concrete rather than theoretical. A parent link is exactly what
 * a future "practise the parent, then the quiz it produced" ordering would reach
 * for, and that would make the queue order by **provenance** instead of by
 * confidence — the one thing seven arcs have kept it from doing. Omitting it
 * means the practice path has no way to name it.
 *
 * It also extends the rule rather than merely obeying it. The rule was written
 * as *"when a new TABLE links to topics, its foreign key goes on the row and
 * stays off the domain type"*, and this is the first **self**-link, pointing at
 * no new entity at all. The protection was never about what the key points at;
 * it is about what the queue can name. So: **any foreign key on `topics` stays
 * off the domain type, whatever its target.**
 *
 * The cost is the one the other two already pay, and it is paid the same way:
 * the quiz's detail page reads its parent with its own query rather than off the
 * topic. One more prop, in exchange for a boundary with no exception in it.
 *
 * Omitting exactly these four is what keeps the assertion honest: every OTHER
 * column difference still fails the build — as `capability_id` itself did, the
 * moment the migration landed and before this line was written.
 */
export type TopicRow = Omit<
  Database['public']['Tables']['topics']['Row'],
  'search_text' | 'source_id' | 'capability_id' | 'parent_topic_id'
>

/*
  ── The boundary rule ───────────────────────────────────────────────────────
  The generated row and the hand-written domain Topic must be the SAME SHAPE,
  except that `confidence` and `difficulty` are narrowed from `string` to their
  unions. A CHECK constraint does not narrow into TypeScript, so `supabase gen
  types` widens both to `string`; narrowing them is the only work this boundary
  does.

  The two assertions below are checked by `tsc --noEmit`, which runs first in
  `npm run verify`. A column added to the migration, a column renamed, or a
  nullability change on either side fails the build here rather than surfacing as
  an undefined at runtime three phases later.
*/
type NarrowedRow = Omit<TopicRow, 'confidence' | 'difficulty'> & {
  confidence: Confidence
  difficulty: Difficulty
}

type Expect<T extends true> = T
type Assignable<A, B> = A extends B ? true : false

/*
  Both directions, per arm.

  A flat row is not assignable to a discriminated union — narrowing is exactly what
  `toTopic` does — so the old "row is assignable to Topic" half no longer type-checks
  and would have to be deleted rather than fixed. Deleting it would remove the only
  compile-time guard against schema drift, so it is restated per shape instead:
  every arm must still account for every column the row carries.
*/
export type TopicBoundaryIsSound = [
  Expect<Assignable<TopicRecord, NarrowedRow>>,
  Expect<Assignable<Quiz, NarrowedRow>>,
  // And nothing on the row is missing from the union: a new column fails here.
  Expect<Assignable<keyof NarrowedRow, keyof TopicRecord>>,
  Expect<Assignable<keyof NarrowedRow, keyof Quiz>>,
]

const CONFIDENCES = ['new', 'weak', 'okay', 'strong'] as const
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const

function narrow<T extends string>(
  allowed: readonly T[],
  value: string,
  column: string,
  rowId: string,
): T {
  if ((allowed as readonly string[]).includes(value)) return value as T

  // Unreachable while the CHECK constraint holds. If it fires, the migration and
  // the domain have diverged — that is worth a crash, not a silent coercion to a
  // default that would quietly misfile the topic.
  throw new Error(
    `Topic ${rowId} has ${column} "${value}", which is not one of: ${allowed.join(', ')}. ` +
      'The database schema and src/lib/domain/types.ts have diverged.',
  )
}

/**
 * The only place a database row becomes a domain Topic.
 *
 * Now a real narrowing: the row is one flat shape and the domain is a union, so
 * this is where a `kind` string becomes a discriminant and the nullable columns
 * become the non-nullable ones each arm promises. `topics_shape_is_consistent`
 * guarantees the row satisfies exactly one arm; if it does not, the schema and the
 * domain have diverged and that is worth a crash rather than a half-built object.
 */
export function toTopic(row: TopicRow): Topic {
  const shared = {
    ...row,
    confidence: narrow(CONFIDENCES, row.confidence, 'confidence', row.id),
    difficulty: narrow(DIFFICULTIES, row.difficulty, 'difficulty', row.id),
  }

  if (row.kind === 'quiz') {
    if (row.options === null || row.correct_option === null) {
      throw new Error(
        `Quiz ${row.id} is missing options or correct_option. ` +
          'topics_shape_is_consistent should have made this unreachable.',
      )
    }

    return {
      ...shared,
      kind: 'quiz',
      definition: null,
      mental_model_image_path: null,
      options: row.options,
      correct_option: row.correct_option,
    }
  }

  if (row.kind !== 'topic') {
    throw new Error(
      `Topic ${row.id} has kind "${row.kind}", which is neither topic nor quiz. ` +
        'The database schema and src/lib/domain/types.ts have diverged.',
    )
  }

  if (row.definition === null) {
    throw new Error(
      `Topic ${row.id} has no definition. ` +
        'topics_shape_is_consistent should have made this unreachable.',
    )
  }

  return {
    ...shared,
    kind: 'topic',
    definition: row.definition,
    options: null,
    correct_option: null,
  }
}
