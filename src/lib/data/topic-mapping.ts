import type { Database } from '@/lib/database.types'
import type { Confidence, Difficulty, Topic } from '@/lib/domain/types'

/**
 * `search_text` is omitted deliberately.
 *
 * It is a generated column that exists only so the trigram index has something to
 * index — derived from columns the domain already has, never written, and never
 * read by the application. Letting it through would make the boundary assertion
 * below demand a field on the domain Topic that means nothing to the domain.
 *
 * Omitting it here is what keeps that assertion honest: every OTHER column
 * difference still fails the build.
 */
export type TopicRow = Omit<Database['public']['Tables']['topics']['Row'], 'search_text'>

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

/** Both directions, so neither side can gain, lose or re-nullable a column silently. */
export type TopicBoundaryIsSound = [
  Expect<Assignable<NarrowedRow, Topic>>,
  Expect<Assignable<Topic, NarrowedRow>>,
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

/** The only place a database row becomes a domain Topic. */
export function toTopic(row: TopicRow): Topic {
  return {
    ...row,
    confidence: narrow(CONFIDENCES, row.confidence, 'confidence', row.id),
    difficulty: narrow(DIFFICULTIES, row.difficulty, 'difficulty', row.id),
  }
}
