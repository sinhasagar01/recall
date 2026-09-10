import type { QuickFilter, TopicFilters } from '@/lib/domain/search-filter'
import type { Confidence, Difficulty, Quiz, Topic, TopicRecord } from '@/lib/domain/types'

/**
 * The shared corpus behind the local/server parity harness.
 *
 * `scripts/gen-library-parity.mts` reads this file, runs the domain functions over
 * it, and generates supabase/tests/library_parity_test.sql from the results. The
 * Vitest suite asserts the domain still produces the committed expectations; pgTAP
 * asserts the SQL produces the same ones. Neither side can drift without a red run.
 *
 * Everything here exists because it can break parity:
 *
 *   * whitespace that JavaScript's \s collapses — NBSP, thin space, ideographic
 *     space, line separator, narrow NBSP, tab, vertical tab, form feed
 *   * zero-width space, which neither engine treats as whitespace
 *   * case folding that is not a simple per-character map — Turkish dotted capital
 *     I, Greek final sigma, the sharp s
 *   * the three LIKE metacharacters, which must match literally
 *   * a title ending where the next field begins, so a needle spanning two fields
 *     fails — matchesQuery tests fields separately and a naive concatenation would
 *     match here
 *   * null category and mental_model, and empty tags
 *   * timestamps exactly on the recency boundary, on both sides of it
 *   * two rows sharing a created_at, so the keyset cursor's id tiebreak is exercised
 *   * quizzes — a null definition, options carrying the query needle, and the
 *     search-only-in-options case a topic cannot produce
 */
export const CORPUS_USER_ID = '00000000-0000-0000-0000-0000000000aa'

/** Fixed clock. Every timestamp below is derived from it. */
export const CORPUS_NOW = '2026-09-05T12:00:00.000Z'

const NOW_MS = Date.parse(CORPUS_NOW)
const DAY_MS = 24 * 60 * 60 * 1000

/** `n` days before the fixed clock, offset by `ms` for boundary cases. */
function ago(days: number, ms = 0): string {
  return new Date(NOW_MS - days * DAY_MS - ms).toISOString()
}

let seq = 0

function nextId(): string {
  seq += 1
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`
}

function topic(
  overrides: Partial<TopicRecord> & Pick<TopicRecord, 'title' | 'definition'>,
): TopicRecord {
  const id = nextId()

  return {
    kind: 'topic',
    options: null,
    correct_option: null,
    id,
    user_id: CORPUS_USER_ID,
    mental_model: null,
    mental_model_image_path: null,
    category: null,
    tags: [],
    difficulty: 'medium',
    confidence: 'okay',
    practice_count: 0,
    last_practiced_at: null,
    extracted: false,
    rebuild_at: null,
    rebuild_note: null,
    rebuild_url: null,
    challenge_at: null,
    challenge_note: null,
    challenge_url: null,
    production_at: null,
    production_note: null,
    production_url: null,
    last_recall: null,
    last_recall_at: null,
    created_at: ago(30 + seq),
    updated_at: ago(30 + seq),
    ...overrides,
  }
}

function quiz(
  overrides: Partial<Quiz> & Pick<Quiz, 'title' | 'options' | 'correct_option'>,
): Quiz {
  const id = nextId()

  return {
    kind: 'quiz',
    definition: null,
    mental_model_image_path: null,
    id,
    user_id: CORPUS_USER_ID,
    mental_model: null,
    category: null,
    tags: [],
    difficulty: 'medium',
    confidence: 'okay',
    practice_count: 0,
    last_practiced_at: null,
    extracted: false,
    rebuild_at: null,
    rebuild_note: null,
    rebuild_url: null,
    challenge_at: null,
    challenge_note: null,
    challenge_url: null,
    production_at: null,
    production_note: null,
    production_url: null,
    last_recall: null,
    last_recall_at: null,
    created_at: ago(30 + seq),
    updated_at: ago(30 + seq),
    ...overrides,
  }
}

export const CORPUS: Topic[] = [
  // ── whitespace forms JavaScript collapses ────────────────────────────────
  topic({ title: 'React  reconciliation', definition: 'Two spaces in the title.' }),
  topic({ title: 'NBSP separated', definition: 'Non-breaking space.' }),
  topic({ title: 'thin space', definition: 'Thin space.' }),
  topic({ title: 'ideo　graphic', definition: 'Ideographic space.' }),
  topic({ title: 'line separator', definition: 'Line separator.' }),
  topic({ title: 'narrow nbsp', definition: 'Narrow no-break space.' }),
  topic({ title: 'tab\tdelimited', definition: 'Horizontal tab.' }),
  topic({ title: 'verticaltab', definition: 'Vertical tab.' }),
  topic({ title: 'formfeed', definition: 'Form feed.' }),
  topic({ title: '  padded  ', definition: 'Leading and trailing whitespace.' }),

  // ── zero width space: whitespace to neither engine ───────────────────────
  topic({ title: 'zwsp​joined', definition: 'Zero-width space is not whitespace.' }),

  // ── case folding that is not a per-character map ─────────────────────────
  topic({ title: 'İstanbul', definition: 'Turkish dotted capital I.' }),
  topic({ title: 'Straße', definition: 'Sharp s.' }),
  topic({ title: 'STRASSE', definition: 'The uppercase spelling, which is a different word.' }),
  topic({ title: 'ΣΣ', definition: 'Greek sigmas; the second lowercases to a final form.' }),
  topic({ title: 'CAFÉ', definition: 'Accented uppercase.' }),

  // ── LIKE metacharacters, which must match literally ──────────────────────
  topic({ title: '100% coverage', definition: 'A literal percent sign.' }),
  topic({ title: 'snake_case_name', definition: 'A literal underscore.' }),
  topic({ title: 'back\\slash', definition: 'A literal backslash.' }),

  // ── a needle spanning two fields must not match ──────────────────────────
  topic({ title: 'ends with alpha', definition: 'beta begins the definition' }),

  // ── each searchable field carries a unique needle ────────────────────────
  topic({ title: 'Findable by title', definition: 'Nothing else matches.', category: 'Systems' }),
  topic({ title: 'Plain', definition: 'Findable by definitionword.' }),
  topic({ title: 'Plain two', definition: 'Nothing.', mental_model: 'Findable by mentalmodelword.' }),
  topic({ title: 'Plain three', definition: 'Nothing.', category: 'Findablecategory' }),
  topic({ title: 'Plain four', definition: 'Nothing.', tags: ['findabletag', 'other'] }),

  // ── null and empty shapes ────────────────────────────────────────────────
  topic({ title: 'No category', definition: 'Category is null.', category: null, tags: [] }),
  topic({ title: 'Explicitly uncategorized', definition: 'Category is the literal label.', category: 'Uncategorized' }),

  // ── confidence, difficulty ───────────────────────────────────────────────
  ...(['new', 'weak', 'okay', 'strong'] as Confidence[]).flatMap((confidence) =>
    (['easy', 'medium', 'hard'] as Difficulty[]).map((difficulty) =>
      topic({
        title: `Grid ${confidence} ${difficulty}`,
        definition: 'One per confidence and difficulty pair.',
        confidence,
        difficulty,
        category: confidence === 'new' ? null : 'Grid',
      }),
    ),
  ),

  // ── recency boundaries, created_at ───────────────────────────────────────
  topic({ title: 'Added just inside', definition: 'Seven days ago exactly.', created_at: ago(7) }),
  topic({ title: 'Added just outside', definition: 'A millisecond past seven days.', created_at: ago(7, 1) }),
  topic({ title: 'Added today', definition: 'An hour ago.', created_at: ago(0, 60 * 60 * 1000) }),

  // ── recency boundaries, last_practiced_at ────────────────────────────────
  topic({
    title: 'Practiced just inside',
    definition: 'Seven days ago exactly.',
    confidence: 'strong',
    practice_count: 3,
    last_practiced_at: ago(7),
  }),
  topic({
    title: 'Practiced just outside',
    definition: 'A millisecond past seven days.',
    confidence: 'strong',
    practice_count: 2,
    last_practiced_at: ago(7, 1),
  }),
  topic({
    title: 'Practiced most recently',
    definition: 'The maximum last_practiced_at in the corpus.',
    confidence: 'okay',
    practice_count: 9,
    last_practiced_at: ago(0, 30 * 60 * 1000),
  }),

  // ── the staleness boundary, for issue #13 ───────────────────────────────
  // Settled topics on both sides of STALE_WINDOW_DAYS, plus the case the app
  // cannot currently reach: settled with no practice stamp at all.
  topic({
    title: 'Settled just inside the stale window',
    definition: 'Practised exactly sixty days ago.',
    confidence: 'strong',
    practice_count: 4,
    last_practiced_at: ago(60),
  }),
  topic({
    title: 'Settled just outside the stale window',
    definition: 'A millisecond past sixty days.',
    confidence: 'strong',
    practice_count: 4,
    last_practiced_at: ago(60, 1),
  }),
  topic({
    title: 'Okay and long gone',
    definition: 'Half known, and not looked at in months.',
    confidence: 'okay',
    practice_count: 1,
    last_practiced_at: ago(200),
  }),
  topic({
    title: 'Settled but never practised',
    definition: 'Unreachable through the app; an absent stamp is an infinite gap.',
    confidence: 'strong',
    practice_count: 0,
    last_practiced_at: null,
  }),

  // ── a shared created_at, so the keyset cursor needs its id tiebreak ──────
  topic({ title: 'Tie one', definition: 'Same created_at as the next row.', created_at: ago(3) }),
  topic({ title: 'Tie two', definition: 'Same created_at as the previous row.', created_at: ago(3) }),

  // ── quizzes ──────────────────────────────────────────────────────────────
  quiz({
    title: 'Does a transform create a stacking context?',
    options: ['Yes, any transform other than none', 'No, only position with z-index'],
    correct_option: 0,
    mental_model: 'A z-index that should work stops working once a parent is transformed.',
    category: 'CSS',
    tags: ['layout'],
    confidence: 'new',
  }),
  quiz({
    /*
      The needle is ONLY in an option — not in the title, the explanation, the
      category or the tags. A search implementation that forgot options would
      return this row for nothing, and no topic in the corpus can produce that
      case because a topic has no options at all.
    */
    title: 'Which of these is not a hook rule?',
    options: ['Call them at the top level', 'Call them from a plain function', 'Call them from a component'],
    correct_option: 1,
    mental_model: 'The linter enforces it; the reason is the call order the renderer relies on.',
    confidence: 'weak',
    practice_count: 2,
    last_practiced_at: ago(4),
  }),
  quiz({
    // A quiz with no explanation, no category and no tags — the sparse shape.
    title: 'Sparse quiz',
    options: ['a', 'b'],
    correct_option: 1,
    difficulty: 'hard',
    confidence: 'strong',
  }),
]

/**
 * The filter combinations both sides are checked against.
 *
 * Each control alone, several compositions, and the query cases the corpus above
 * exists to catch.
 */
export interface Combination {
  name: string
  filters: TopicFilters
}

const QUICKS: QuickFilter[] = [
  'never-practiced',
  'needs-review',
  'recently-added',
  'recently-practiced',
]

export const COMBINATIONS: Combination[] = [
  { name: 'unfiltered', filters: {} },

  // Query: whitespace, case and Unicode.
  { name: 'query collapses double space', filters: { query: 'react reconciliation' } },
  { name: 'query is case insensitive', filters: { query: 'REACT RECONCILIATION' } },
  { name: 'query is trimmed', filters: { query: '   react   ' } },
  { name: 'query matches across nbsp', filters: { query: 'nbsp separated' } },
  { name: 'query matches across thin space', filters: { query: 'thin space' } },
  { name: 'query matches across ideographic space', filters: { query: 'ideo graphic' } },
  { name: 'query matches across line separator', filters: { query: 'line separator' } },
  { name: 'query matches across narrow nbsp', filters: { query: 'narrow nbsp' } },
  { name: 'query matches across tab', filters: { query: 'tab delimited' } },
  { name: 'query matches across vertical tab', filters: { query: 'vertical tab' } },
  { name: 'query matches across form feed', filters: { query: 'form feed' } },
  { name: 'query does not split zero width space', filters: { query: 'zwsp joined' } },
  { name: 'query matches zero width space intact', filters: { query: 'zwsp​joined' } },
  { name: 'query folds turkish capital i', filters: { query: 'İstanbul' } },
  { name: 'query folds sharp s', filters: { query: 'straße' } },
  { name: 'query folds final sigma', filters: { query: 'σς' } },
  { name: 'query folds accented capital', filters: { query: 'café' } },

  // Query: LIKE metacharacters must be literal.
  { name: 'percent is literal', filters: { query: '100%' } },
  { name: 'underscore is literal', filters: { query: 'snake_case' } },
  { name: 'underscore does not act as a wildcard', filters: { query: 'snakexcase' } },
  { name: 'backslash is literal', filters: { query: 'back\\slash' } },
  { name: 'a bare percent matches nothing extra', filters: { query: '%' } },

  // Query: field boundaries and the searchable fields.
  { name: 'a needle may not span two fields', filters: { query: 'alpha beta' } },
  { name: 'matches in title', filters: { query: 'findable by title' } },
  { name: 'matches in definition', filters: { query: 'definitionword' } },
  { name: 'matches in mental model', filters: { query: 'mentalmodelword' } },
  { name: 'matches in category', filters: { query: 'findablecategory' } },
  { name: 'matches in a tag', filters: { query: 'findabletag' } },
  { name: 'matches nothing', filters: { query: 'zzzznothingmatchesthis' } },
  { name: 'single character needle', filters: { query: 'a' } },
  { name: 'two character needle', filters: { query: 'st' } },

  // Category, including the null mapping.
  { name: 'category uncategorized covers nulls', filters: { category: 'Uncategorized' } },
  { name: 'category grid', filters: { category: 'Grid' } },
  { name: 'category systems', filters: { category: 'Systems' } },

  // Confidence and difficulty.
  ...(['new', 'weak', 'okay', 'strong'] as Confidence[]).map((confidence) => ({
    name: `confidence ${confidence}`,
    filters: { confidence } as TopicFilters,
  })),
  ...(['easy', 'medium', 'hard'] as Difficulty[]).map((difficulty) => ({
    name: `difficulty ${difficulty}`,
    filters: { difficulty } as TopicFilters,
  })),

  // Quick filters, alone and combined.
  ...QUICKS.map((quick) => ({
    name: `quick ${quick}`,
    filters: { quickFilters: [quick] } as TopicFilters,
  })),
  { name: 'quick never-practiced and needs-review', filters: { quickFilters: ['never-practiced', 'needs-review'] } },
  { name: 'quick recently-added and recently-practiced', filters: { quickFilters: ['recently-added', 'recently-practiced'] } },

  // Compositions.
  { name: 'query and confidence', filters: { query: 'grid', confidence: 'weak' } },
  { name: 'category and difficulty', filters: { category: 'Grid', difficulty: 'hard' } },
  { name: 'query and category and quick', filters: { query: 'grid', category: 'Grid', quickFilters: ['needs-review'] } },
  {
    name: 'every control at once',
    filters: {
      query: 'grid',
      category: 'Grid',
      confidence: 'weak',
      difficulty: 'easy',
      quickFilters: ['needs-review'],
    },
  },
  { name: 'composition matching nothing', filters: { query: 'grid', category: 'Systems' } },

  // The type chips, and the search cases only a quiz can produce.
  { name: 'kind topic', filters: { kind: 'topic' } },
  { name: 'kind quiz', filters: { kind: 'quiz' } },
  { name: 'query matches only an option', filters: { query: 'plain function' } },
  { name: 'query matches a question', filters: { query: 'stacking context' } },
  { name: 'query matches a quiz explanation', filters: { query: 'call order the renderer' } },
  { name: 'kind and confidence', filters: { kind: 'quiz', confidence: 'weak' } },
  { name: 'kind and query', filters: { kind: 'quiz', query: 'hook rule' } },
  { name: 'kind quiz excludes a matching topic', filters: { kind: 'quiz', query: 'grid' } },
]
