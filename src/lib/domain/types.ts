/**
 * Hand-written to match supabase/migrations/*_topics.sql exactly.
 *
 * Deliberately NOT generated from the database. See ARCHITECTURE.md,
 * "Why the Topic type is hand-written".
 */

export type Confidence = 'new' | 'weak' | 'okay' | 'strong'

export type Difficulty = 'easy' | 'medium' | 'hard'

export type Kind = 'topic' | 'quiz'

/**
 * What both shapes have, and what every shared rule reads.
 *
 * `isNeverPracticed`, `needsReview`, `orderForPractice` and `isStale` take
 * `Pick<…>` of fields from here, which is why none of them needed changing when
 * quizzes arrived: they were already written against what the two shapes share.
 */
interface TopicShared {
  id: string
  user_id: string
  /** A topic's name; a quiz's question. The card shows it either way. */
  title: string
  /** A topic's mental model; a quiz's explanation. One field, one register. */
  mental_model: string | null
  category: string | null
  tags: string[]
  difficulty: Difficulty
  confidence: Confidence
  practice_count: number
  last_practiced_at: string | null
  created_at: string
  updated_at: string

  /**
   * Written by hand, or extracted from a transcript by arc 6.
   *
   * Shown only as a library filter chip. It exists because of a risk that arc
   * records rather than designs around: a library of extracted topics is one you
   * have READ rather than written, and recognition reads as knowledge when
   * quizzed. The flag makes that visible and does nothing else — deliberately
   * not a factor in confidence, in the queue, or on the weak page.
   *
   * Unlike `source_id` and `capability_id` this one IS on the domain Topic, so
   * every read is obliged to return it. That obligation is the point: a filter
   * over a column half the reads omit is a filter that lies.
   */
  extracted: boolean

  /*
    ── Evidence ──────────────────────────────────────────────────────────────
    Three markers, each absent or present with a date, a required note and an
    optional URL. Nine scalars rather than a jsonb document, so that
    `TopicBoundaryIsSound` stays a real assertion: `supabase gen types` renders
    jsonb as `Json`, which every object satisfies, and the boundary would have
    gone quietly vacuous for exactly the columns being added.

    They sit on the SHARED interface because the row carries them on both arms —
    a quiz's are all null, and `topics_evidence_is_consistent` is what makes that
    true rather than a convention. The Quiz arm narrows them to null below.

    Recall is NOT here. It is derived from `confidence`, `practice_count` and
    `last_practiced_at` at render time, never stored, and never a second source
    of truth for what the confidence meter already says.
  */
  rebuild_at: string | null
  rebuild_note: string | null
  rebuild_url: string | null
  challenge_at: string | null
  challenge_note: string | null
  challenge_url: string | null
  production_at: string | null
  production_note: string | null
  production_url: string | null
}

/**
 * `difficulty`, `confidence` and `tags` are non-null: a later migration added the
 * NOT NULL the originals were missing. A CHECK constraint passes on NULL, so the
 * CHECK never stopped an explicit null and the domain layer was carrying a null
 * case that should not have existed. See ARCHITECTURE.md, "A CHECK constraint
 * does not imply NOT NULL".
 *
 * Timestamps are ISO-8601 strings, which is what the wire format is.
 */
export interface TopicRecord extends TopicShared {
  kind: 'topic'
  definition: string
  mental_model_image_path: string | null
  options: null
  correct_option: null
}

/**
 * A question with 2+ options, one correct, and an explanation.
 *
 * No `definition` — the question is the title. No image — "a quiz that needs a
 * diagram is a topic". `correct_option` indexes into `options`. All four of those
 * are enforced by `topics_shape_is_consistent`, so this type is a description of
 * what the database will actually store rather than a hope.
 */
export interface Quiz extends TopicShared {
  kind: 'quiz'
  definition: null
  mental_model_image_path: null
  options: string[]
  correct_option: number
}

/**
 * One table, two shapes, discriminated on `kind`.
 *
 * A union rather than a wide record with nullable extras, so reading `options`
 * without establishing the kind is a compile error instead of a runtime `null`.
 * That is the point: adding this discriminant turned every place that assumed one
 * shape into an error the compiler finds, rather than a null someone remembers.
 */
export type Topic = TopicRecord | Quiz

export function isQuiz(topic: Topic): topic is Quiz {
  return topic.kind === 'quiz'
}
