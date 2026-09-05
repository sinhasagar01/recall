/**
 * Builds the local/server parity test from one corpus.
 *
 * The library can be read two ways: under the local-mode threshold the whole
 * library is in memory and the domain functions filter and count it; past that
 * threshold public.library_page and public.library_counts do the same work in SQL.
 * Two implementations of one specification is exactly the arrangement that drifts,
 * so neither is trusted — both are checked against the same corpus.
 *
 * This module runs the DOMAIN over library-corpus.ts and renders what it produced
 * as literal expectations in a pgTAP file. Two things then consume it:
 *
 *   * scripts/gen-library-parity.mts writes it to disk
 *   * library-parity.test.ts asserts the committed file still matches, which is
 *     what catches the domain drifting away from the expectations
 *
 * The domain is the specification. If this output changes, the domain's behaviour
 * changed, and that is the thing to look at first.
 */
import {
  COMBINATIONS,
  CORPUS,
  CORPUS_NOW,
  CORPUS_USER_ID,
} from '@/lib/domain/__fixtures__/library-corpus'
import {
  CONFIDENCE_VALUES,
  DIFFICULTY_VALUES,
  QUICK_FILTER_VALUES,
  libraryCounts,
} from '@/lib/domain/library-counts'
import { needsReview } from '@/lib/domain/confidence'
import {
  BUCKET_SEQUENCE,
  noShuffle,
  orderForPractice,
} from '@/lib/domain/practice-selection'
import { RECENT_WINDOW_DAYS, filterTopics } from '@/lib/domain/search-filter'
import type { Topic } from '@/lib/domain/types'

export const PARITY_SQL_PATH = 'supabase/tests/library_parity_test.sql'
const NOW = new Date(CORPUS_NOW)

/*
  The order library_page returns rows in, applied to the corpus before the domain
  sees it. filterTopics preserves input order, so feeding it the same order the SQL
  orders by is what makes the two id lists comparable.
*/
const ORDERED: Topic[] = [...CORPUS].sort((a, b) => {
  const byCreated = Date.parse(b.created_at) - Date.parse(a.created_at)
  return byCreated !== 0 ? byCreated : (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
})

/** A SQL text literal for an arbitrary string, code point by code point. */
function lit(value: string): string {
  const body = [...value]
    .map((ch) => {
      const cp = ch.codePointAt(0) as number
      if (cp > 0xffff) return '\\+' + cp.toString(16).padStart(6, '0')
      if (cp < 32 || cp > 126 || ch === '\\' || ch === "'") {
        return '\\' + cp.toString(16).padStart(4, '0')
      }
      return ch
    })
    .join('')
  return `U&'${body}'`
}

function nullableLit(value: string | null): string {
  return value === null ? 'null' : lit(value)
}

function arrayLit(values: string[]): string {
  if (values.length === 0) return `'{}'::text[]`
  return `array[${values.map(lit).join(', ')}]::text[]`
}

/**
 * The canonical rendering of a LibraryCounts, mirrored by tests_counts_canon in
 * the generated SQL. Every field appears, so comparing the two strings is as
 * strong as comparing the objects field by field — and it keeps the generated
 * file to two assertions per combination instead of fifteen.
 */
function canon(counts: ReturnType<typeof libraryCounts>): string {
  const pairs = (record: Record<string, number>, keys: readonly string[]) =>
    keys.map((key) => `${key}:${record[key]}`).join(',')

  return [
    `total=${counts.total}`,
    `matching=${counts.matching}`,
    `needsReview=${counts.needsReview}`,
    `lastPracticed=${counts.lastPracticedAt === null ? '-' : Date.parse(counts.lastPracticedAt)}`,
    `conf=${pairs(counts.byConfidence, CONFIDENCE_VALUES)}`,
    `diff=${pairs(counts.byDifficulty, DIFFICULTY_VALUES)}`,
    `quick=${pairs(counts.quick, QUICK_FILTER_VALUES)}`,
    `cat=${counts.byCategory.map((entry) => `${entry.category}:${entry.count}`).join(';')}`,
  ].join('|')
}

/** The RPC argument list shared by both functions, in declaration order. */
function rpcArgs(filters: (typeof COMBINATIONS)[number]['filters']): string {
  const quick = filters.quickFilters ?? []
  return [
    lit(CORPUS_NOW) + '::timestamptz',
    String(RECENT_WINDOW_DAYS),
    lit(filters.query ?? ''),
    nullableLit(filters.category ?? null),
    nullableLit(filters.confidence ?? null),
    nullableLit(filters.difficulty ?? null),
    arrayLit(quick),
  ].join(', ')
}

const rows = ORDERED.map(
  (t) =>
    `  (${[
      lit(t.id) + '::uuid',
      lit(t.user_id) + '::uuid',
      lit(t.title),
      lit(t.definition),
      nullableLit(t.mental_model),
      nullableLit(t.mental_model_image_path),
      nullableLit(t.category),
      arrayLit(t.tags),
      lit(t.difficulty),
      lit(t.confidence),
      String(t.practice_count),
      t.last_practiced_at === null ? 'null' : lit(t.last_practiced_at) + '::timestamptz',
      lit(t.created_at) + '::timestamptz',
      lit(t.updated_at) + '::timestamptz',
    ].join(', ')})`,
)

const assertions = COMBINATIONS.flatMap((combination) => {
  const expectedIds = filterTopics(ORDERED, combination.filters, NOW)
    .map((topic) => topic.id)
    .join(',')
  const expectedCounts = canon(libraryCounts(ORDERED, combination.filters, NOW))
  const args = rpcArgs(combination.filters)

  return [
    `-- ${combination.name}`,
    `select is(
  (
    with page as (
      select id, row_number() over () as rn
      from public.library_page(${args}, null, null, 1000)
    )
    select coalesce(string_agg(id::text, ',' order by rn), '') from page
  ),
  ${lit(expectedIds)},
  ${lit(`${combination.name}: rows`)}
);`,
    `select is(
  tests_counts_canon(public.library_counts(${args})),
  ${lit(expectedCounts)},
  ${lit(`${combination.name}: counts`)}
);`,
    '',
  ]
})

// Keyset pagination, walked a page at a time over the unfiltered corpus. Page
// size 7 does not divide the corpus, and the corpus contains two rows sharing a
// created_at, so a cursor that ignored the id tiebreak would skip or repeat one.
const allIds = ORDERED.map((topic) => topic.id).join(',')

/*
  The weak list's ordering, asserted id-for-id.

  With no seed the query's tie-break falls through to `created_at desc, id desc`,
  which is the order `noShuffle` preserved when the page read the whole library —
  so the SQL is fully deterministic here and can be compared exactly, rather than
  through properties. The seeded selection is a different matter and is covered by
  supabase/tests/practice_ordering_test.sql.

  This is the case that carries the never-practised rule: `staleness` uses
  '-infinity' where `last_practiced_at` is null, so a topic never practised is the
  stalest in its bucket rather than tied with a practised one.
*/
const weakOrderedIds = orderForPractice(
  ORDERED.filter(needsReview),
  { shuffle: noShuffle },
)
  .map((topic) => topic.id)
  .join(',')

const bucketOrderLit = `array[${BUCKET_SEQUENCE.map(lit).join(', ')}]::text[]`
const reviewLit = `array[${BUCKET_SEQUENCE.filter((c) => needsReview({ confidence: c })).map(lit).join(', ')}]::text[]`

const plan = COMBINATIONS.length * 2 + 3

export const PARITY_SQL = `-- GENERATED by scripts/gen-library-parity.mts — do not edit by hand.
-- Regenerate with: npm run gen:parity
--
-- Asserts that public.library_page and public.library_counts reproduce exactly what
-- filterTopics and libraryCounts produce over the same corpus. The expectations
-- below were computed by running the domain functions; the domain is the
-- specification and this SQL is checked against it.
--
-- A failure here means local mode and server mode would disagree — the library
-- would show one thing and its counts another, which is what phase 7 removed.

begin;
select plan(${plan});

create function tests_create_user(uid uuid, email text) returns uuid
language plpgsql as $fn$
begin
  insert into auth.users (id, email) values (uid, email);
  return uid;
end $fn$;

create function tests_login_as(uid uuid) returns void
language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $fn$;

-- Mirrors canon() in scripts/gen-library-parity.mts. Category order is by code
-- point (collate "C"), not the database's locale ordering, because the JavaScript
-- side sorts with < on the raw string. Display ordering is a separate concern and
-- lives in the domain layer.
create function tests_counts_canon(j jsonb) returns text
language sql as $fn$
  select concat_ws('|',
    'total=' || (j->>'total'),
    'matching=' || (j->>'matching'),
    'needsReview=' || (j->>'needsReview'),
    'lastPracticed=' || coalesce(
      (extract(epoch from (j->>'lastPracticedAt')::timestamptz) * 1000)::bigint::text, '-'),
    'conf=' || ${CONFIDENCE_VALUES.map((v) => `'${v}:' || (j->'byConfidence'->>'${v}')`).join(` || ',' || `)},
    'diff=' || ${DIFFICULTY_VALUES.map((v) => `'${v}:' || (j->'byDifficulty'->>'${v}')`).join(` || ',' || `)},
    'quick=' || ${QUICK_FILTER_VALUES.map((v) => `'${v}:' || (j->'quick'->>'${v}')`).join(` || ',' || `)},
    'cat=' || coalesce((
      select string_agg((e->>'category') || ':' || (e->>'count'), ';'
                        order by (e->>'category') collate "C")
      from jsonb_array_elements(j->'byCategory') e
    ), '')
  )
$fn$;

select tests_create_user(${lit(CORPUS_USER_ID)}::uuid, 'corpus@recall.test');

insert into public.topics (
  id, user_id, title, definition, mental_model, mental_model_image_path,
  category, tags, difficulty, confidence, practice_count, last_practiced_at,
  created_at, updated_at
) values
${rows.join(',\n')};

-- Everything below runs as the corpus user. pgTAP runs as postgres, which has
-- BYPASSRLS, so an assertion made before this line would pass whether or not the
-- policies scope these functions at all.
select tests_login_as(${lit(CORPUS_USER_ID)}::uuid);

select is(
  (select count(*)::int from public.topics),
  ${CORPUS.length},
  'the corpus loaded, and RLS scopes it to its owner'
);

${assertions.join('\n')}
-- Keyset pagination walks the whole corpus exactly once. Page size 7 does not
-- divide ${CORPUS.length}, and two rows share a created_at, so a cursor missing its
-- id tiebreak would drop or repeat one of them.
select is(
  (
    with recursive walk as (
      select id, created_at, 1 as page
      from public.library_page(${lit(CORPUS_NOW)}::timestamptz, ${RECENT_WINDOW_DAYS},
                               '', null, null, null, '{}'::text[], null, null, 7)
      union all
      select next.id, next.created_at, walk.page + 1
      from walk
      cross join lateral (
        select p.id, p.created_at
        from public.library_page(${lit(CORPUS_NOW)}::timestamptz, ${RECENT_WINDOW_DAYS},
                                 '', null, null, null, '{}'::text[],
                                 walk.created_at, walk.id, 1) p
      ) next
      where walk.page < ${CORPUS.length}
    )
    select coalesce(string_agg(distinct id::text, ',' order by id::text), '') from walk
  ),
  (select coalesce(string_agg(distinct id::text, ',' order by id::text), '')
     from unnest(string_to_array(${lit(allIds)}, ',')) as id),
  'keyset pagination reaches every row exactly once'
);

-- The weak list's ordering: bucket, then staleness, then the unseeded tie-break.
select is(
  (
    with page as (
      select id, row_number() over () as rn
      from public.practice_ordered_page(
        ${bucketOrderLit}, ${reviewLit}, null, null, null, null, null, 1000)
    )
    select coalesce(string_agg(id::text, ',' order by rn), '') from page
  ),
  ${lit(weakOrderedIds)},
  'the weak list ordering matches orderForPractice with noShuffle, id for id'
);

select * from finish();
rollback;
`

