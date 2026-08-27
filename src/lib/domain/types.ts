/**
 * Hand-written to match supabase/migrations/*_topics.sql exactly.
 *
 * Deliberately NOT generated from the database. See ARCHITECTURE.md,
 * "Why the Topic type is hand-written".
 */

export type Confidence = 'new' | 'weak' | 'okay' | 'strong'

export type Difficulty = 'easy' | 'medium' | 'hard'

/**
 * `difficulty`, `confidence` and `tags` are non-null: a later migration added the
 * NOT NULL the originals were missing. A CHECK constraint passes on NULL, so the
 * CHECK never stopped an explicit null and the domain layer was carrying a null
 * case that should not have existed. See ARCHITECTURE.md, "A CHECK constraint
 * does not imply NOT NULL".
 *
 * Timestamps are ISO-8601 strings, which is what the wire format is.
 */
export interface Topic {
  id: string
  user_id: string
  title: string
  definition: string
  mental_model: string | null
  mental_model_image_path: string | null
  category: string | null
  tags: string[]
  difficulty: Difficulty
  confidence: Confidence
  practice_count: number
  last_practiced_at: string | null
  created_at: string
  updated_at: string
}
