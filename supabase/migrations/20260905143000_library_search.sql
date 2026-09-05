-- Server-side search, filtering and keyset pagination for the library. Issue #4.
--
-- Until now `listTopics` read every row the user owns and `filterTopics` did the work
-- in the browser. That is fine at a few hundred topics and unusable at twenty thousand.
--
-- The rules being reproduced here are NOT defined here. They live in src/lib/domain —
-- matchesQuery, filterTopics, isNeverPracticed, needsReview, categoryOf — and this SQL
-- is written to match them. supabase/tests/library_test.sql asserts the agreement
-- against the same corpus the Vitest suite uses, so the two cannot drift silently.
--
-- Two things are deliberately NOT reproduced in SQL:
--
--   * Ordering and labelling of the filter options. categoryOptions sorts with
--     localeCompare, which a database collation will not reproduce. These functions
--     return raw counts and the domain layer does all sorting and labelling, so the
--     only thing SQL has to agree about is integers.
--   * The recency window. RECENT_WINDOW_DAYS is a domain constant and is passed in as
--     a parameter rather than written as a literal 7 here, so there is one definition
--     of it rather than two that can drift.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Normalisation: the exact counterpart of normaliseText in
-- src/lib/domain/search-filter.ts — trim, collapse internal whitespace, lowercase.
--
-- Verified equal to JavaScript's on both the local stack and the hosted project
-- (PostgreSQL 17.6, en_US.UTF-8, ICU provider) across NBSP, thin and ideographic
-- spaces, line separator, narrow NBSP, vertical tab, form feed, zero-width space
-- (correctly NOT collapsed by either), Turkish dotted capital I, final sigma, and
-- the sharp s. That equality depends on the collation and provider matching; see
-- ARCHITECTURE.md.
-- ---------------------------------------------------------------------------
create or replace function public.topic_search_normalise(p_value text)
  returns text
  language sql
  immutable
  parallel safe
as $$
  select lower(regexp_replace(btrim(coalesce(p_value, '')), '\s+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------------
-- The searchable projection of a topic.
--
-- matchesQuery tests each field separately with `.some()`, so a needle must never
-- match across a field boundary. Fields are joined with a newline, and since each
-- field has already had its own newlines collapsed to spaces by the normaliser, the
-- only newlines present are the separators. A needle is normalised the same way and
-- therefore cannot contain one.
--
-- IMMUTABLE is a deliberate and load-bearing claim. array_to_string is only marked
-- STABLE because output functions for arbitrary element types may not be immutable;
-- for text[] it is deterministic. Postgres rejects a generated column outright
-- without this, and the claim is sound for the one type used here.
-- ---------------------------------------------------------------------------
create or replace function public.topic_search_text(
  p_title text,
  p_definition text,
  p_mental_model text,
  p_category text,
  p_tags text[]
)
  returns text
  language sql
  immutable
  parallel safe
as $$
  select concat_ws(
    E'\n',
    public.topic_search_normalise(p_title),
    public.topic_search_normalise(p_definition),
    public.topic_search_normalise(p_mental_model),
    public.topic_search_normalise(p_category),
    (
      select string_agg(public.topic_search_normalise(tag), E'\n')
      from unnest(coalesce(p_tags, '{}'::text[])) as tag
    )
  )
$$;

alter table public.topics
  add column search_text text
  generated always as (
    public.topic_search_text(title, definition, mental_model, category, tags)
  ) stored;

create index topics_search_text_trgm_idx
  on public.topics
  using gin (search_text extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- The needle, as a LIKE pattern.
--
-- Returns null for an empty query, which the callers read as "matches everything" —
-- the same thing matchesQuery does when the needle normalises to ''.
--
-- The three LIKE metacharacters are escaped with the default escape character, so a
-- user searching for "100%" or "snake_case" gets a literal match rather than a
-- wildcard.
-- ---------------------------------------------------------------------------
create or replace function public.topic_search_pattern(p_query text)
  returns text
  language sql
  immutable
  parallel safe
as $$
  select case public.topic_search_normalise(p_query)
    when '' then null
    else '%' || replace(
                  replace(
                    replace(public.topic_search_normalise(p_query), '\', '\\'),
                  '%', '\%'),
                '_', '\_') || '%'
  end
$$;

-- ---------------------------------------------------------------------------
-- One page of the library.
--
-- SECURITY INVOKER (the default, stated here because it is load-bearing): the row
-- level security policies on public.topics are what scope this to the caller. A
-- SECURITY DEFINER function here would silently defeat every policy that
-- supabase/tests/topics_test.sql asserts.
--
-- The keyset cursor is (created_at, id). created_at alone is not unique, so a cursor
-- on it can skip or repeat rows across a page boundary; id breaks the tie. The same
-- ordering is used when the whole library is read in one page, so both modes see
-- rows in the same order.
--
-- p_query goes through search_text, which carries the GIN trigram index. A needle of
-- one or two characters cannot use a trigram index and falls back to a scan — bounded
-- by one user's rows under RLS.
-- ---------------------------------------------------------------------------
create or replace function public.library_page(
  p_now timestamptz,
  p_recent_window_days int,
  p_query text default '',
  p_category text default null,
  p_confidence text default null,
  p_difficulty text default null,
  p_quick text[] default '{}'::text[],
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 60
)
  returns table (
    id uuid,
    user_id uuid,
    title text,
    definition text,
    mental_model text,
    mental_model_image_path text,
    category text,
    tags text[],
    difficulty text,
    confidence text,
    practice_count integer,
    last_practiced_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
  )
  language sql
  stable
  security invoker
  parallel safe
  set search_path = ''
as $$
  with bounds as (
    select
      public.topic_search_pattern(p_query) as pattern,
      p_now - make_interval(days => p_recent_window_days) as recent_after
  )
  select
    t.id, t.user_id, t.title, t.definition, t.mental_model, t.mental_model_image_path,
    t.category, t.tags, t.difficulty, t.confidence, t.practice_count,
    t.last_practiced_at, t.created_at, t.updated_at
  from public.topics t, bounds b
  where (b.pattern is null or t.search_text like b.pattern)
    and (p_category is null or coalesce(t.category, 'Uncategorized') = p_category)
    and (p_confidence is null or t.confidence = p_confidence)
    and (p_difficulty is null or t.difficulty = p_difficulty)
    and (not ('never-practiced' = any(p_quick)) or t.confidence = 'new')
    and (not ('needs-review' = any(p_quick)) or t.confidence in ('weak', 'new'))
    and (not ('recently-added' = any(p_quick)) or t.created_at >= b.recent_after)
    and (
      not ('recently-practiced' = any(p_quick))
      or (t.last_practiced_at is not null and t.last_practiced_at >= b.recent_after)
    )
    and (
      p_cursor_created_at is null
      or (t.created_at, t.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by t.created_at desc, t.id desc
  limit p_limit
$$;

-- ---------------------------------------------------------------------------
-- Every count the toolbar and the rail need, in one round trip.
--
-- All of them are over the WHOLE library except `matching`, which is the size of the
-- current filtered result. That asymmetry is the rule from DESIGN.md: with a query
-- matching nothing and a category selected, the category select still reads the full
-- tally. A count that changed with the filters would be describing the result rather
-- than offering a way to narrow.
--
-- Returns raw numbers. Ordering and labels are the domain layer's job.
-- ---------------------------------------------------------------------------
create or replace function public.library_counts(
  p_now timestamptz,
  p_recent_window_days int,
  p_query text default '',
  p_category text default null,
  p_confidence text default null,
  p_difficulty text default null,
  p_quick text[] default '{}'::text[]
)
  returns jsonb
  language sql
  stable
  security invoker
  parallel safe
  set search_path = ''
as $$
  with bounds as (
    select
      public.topic_search_pattern(p_query) as pattern,
      p_now - make_interval(days => p_recent_window_days) as recent_after
  ),
  scoped as (
    select t.*, b.recent_after,
      (b.pattern is null or t.search_text like b.pattern)
      and (p_category is null or coalesce(t.category, 'Uncategorized') = p_category)
      and (p_confidence is null or t.confidence = p_confidence)
      and (p_difficulty is null or t.difficulty = p_difficulty)
      and (not ('never-practiced' = any(p_quick)) or t.confidence = 'new')
      and (not ('needs-review' = any(p_quick)) or t.confidence in ('weak', 'new'))
      and (not ('recently-added' = any(p_quick)) or t.created_at >= b.recent_after)
      and (
        not ('recently-practiced' = any(p_quick))
        or (t.last_practiced_at is not null and t.last_practiced_at >= b.recent_after)
      ) as is_match
    from public.topics t, bounds b
  )
  select jsonb_build_object(
    'total', count(*),
    'matching', count(*) filter (where is_match),
    'needsReview', count(*) filter (where confidence in ('weak', 'new')),
    'lastPracticedAt', max(last_practiced_at),
    'byConfidence', jsonb_build_object(
      'new', count(*) filter (where confidence = 'new'),
      'weak', count(*) filter (where confidence = 'weak'),
      'okay', count(*) filter (where confidence = 'okay'),
      'strong', count(*) filter (where confidence = 'strong')
    ),
    'byDifficulty', jsonb_build_object(
      'easy', count(*) filter (where difficulty = 'easy'),
      'medium', count(*) filter (where difficulty = 'medium'),
      'hard', count(*) filter (where difficulty = 'hard')
    ),
    'quick', jsonb_build_object(
      'never-practiced', count(*) filter (where confidence = 'new'),
      'needs-review', count(*) filter (where confidence in ('weak', 'new')),
      'recently-added', count(*) filter (where created_at >= recent_after),
      'recently-practiced', count(*) filter (
        where last_practiced_at is not null and last_practiced_at >= recent_after
      )
    ),
    'byCategory', coalesce(
      (
        select jsonb_agg(jsonb_build_object('category', category, 'count', n))
        from (
          select coalesce(category, 'Uncategorized') as category, count(*) as n
          from scoped
          group by 1
        ) c
      ),
      '[]'::jsonb
    )
  )
  from scoped
$$;

grant execute on function
  public.topic_search_normalise(text),
  public.topic_search_text(text, text, text, text, text[]),
  public.topic_search_pattern(text),
  public.library_page(timestamptz, int, text, text, text, text, text[], timestamptz, uuid, int),
  public.library_counts(timestamptz, int, text, text, text, text, text[])
  to authenticated;
