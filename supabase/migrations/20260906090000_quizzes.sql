-- Quizzes: a second shape in the same table.
--
-- A quiz is a question with 2+ options, one correct, and an explanation. It shares
-- confidence, the weak page, practice ordering, search and export with topics, which
-- is the whole reason it is a second SHAPE rather than a second table — one
-- implementation of each of those rather than two that can disagree.
--
-- The constraints here are the feature. supabase/tests/quiz_shape_test.sql was
-- written and run red before this existed.
--
-- ── The sharp edge: definition ──────────────────────────────────────────────
-- `definition` was NOT NULL and a quiz has none — its question is its title, which
-- is what quiz-reference.html specifies ("the card shows the question as its
-- title", and switching the type toggle to Topic "restores the definition,
-- mental-model and image fields").
--
-- So the NOT NULL is dropped and the guarantee moves into the shape constraint
-- below. A topic still cannot be saved without a definition; the rule stops being a
-- column modifier and becomes one of the kind rules, beside the others.
--
-- Storing '' instead was the alternative and is worse: an empty string is a lie the
-- rest of the system then has to believe. Search would index it, the card excerpt
-- would render a blank line, and export would print an empty Definition heading.
--
-- ARCHITECTURE.md records that a CHECK passes on NULL. This constraint walked into
-- exactly that: `array_length` of an empty array is NULL rather than 0, so an
-- `options = '{}'` quiz made the whole CASE null and slipped through. The coalesce
-- below is the fix, and the test that caught it was written before the migration.

alter table public.topics
  add column kind text not null default 'topic' check (kind in ('topic', 'quiz')),
  add column options text[],
  add column correct_option int;

-- Every row that already existed takes 'topic' from the default. That is the
-- backfill; quiz_shape_test asserts none escaped it.
alter table public.topics alter column definition drop not null;

alter table public.topics add constraint topics_shape_is_consistent check (
  case kind
    when 'quiz' then
      definition is null
      and options is not null
      -- coalesce, because array_length of an EMPTY array is NULL, not 0. Without
      -- it the whole CASE evaluates to NULL for `options = '{}'` and the CHECK
      -- passes — the exact trap ARCHITECTURE.md records under "a CHECK constraint
      -- does not imply NOT NULL". quiz_shape_test caught it on the first green run.
      and coalesce(array_length(options, 1), 0) >= 2
      and correct_option is not null
      and correct_option between 0 and coalesce(array_length(options, 1), 0) - 1
      -- "A quiz that needs a diagram is a topic." The domain type says a quiz has
      -- no image; without this the type would be lying about what is storable.
      and mental_model_image_path is null
    else
      definition is not null
      and options is null
      and correct_option is null
  end
);

-- ---------------------------------------------------------------------------
-- Search has to reach a quiz's options.
--
-- `search_text` is a stored generated column, and past LOCAL_MODE_MAX the library
-- searches through it in SQL rather than in the browser — so options must be folded
-- in there, not only into matchesQuery.
--
-- This overload DELEGATES to the five-argument version rather than restating the
-- normalisation, so there is still exactly one definition of what normalising means.
-- ---------------------------------------------------------------------------
create or replace function public.topic_search_text(
  p_title text,
  p_definition text,
  p_mental_model text,
  p_category text,
  p_tags text[],
  p_options text[]
)
  returns text
  language sql
  immutable
  parallel safe
as $$
  select public.topic_search_text(p_title, p_definition, p_mental_model, p_category, p_tags)
    || coalesce(
         E'\n' || (
           select string_agg(public.topic_search_normalise(option), E'\n')
           from unnest(p_options) as option
         ),
         ''
       )
$$;

/*
  PostgreSQL 17's ALTER COLUMN ... SET EXPRESSION. It rewrites the table, and the
  trigram index survives — both verified in a rolled-back transaction before this
  migration was written, because the alternative (drop and re-add the column) would
  have dropped topics_search_text_trgm_idx with it.
*/
alter table public.topics
  alter column search_text set expression as (
    public.topic_search_text(title, definition, mental_model, category, tags, options)
  );

-- ---------------------------------------------------------------------------
-- Three reads gain a kind filter.
--
-- Each new parameter is defaulted, so a caller that omits it behaves exactly as
-- before. That matters for the deploy: the migration lands before the code, and the
-- version running in between calls these by name without the new argument.
-- ---------------------------------------------------------------------------
drop function if exists public.library_page(
  timestamptz, int, text, text, text, text, text[], timestamptz, uuid, int);

create function public.library_page(
  p_now timestamptz,
  p_recent_window_days int,
  p_query text default '',
  p_category text default null,
  p_confidence text default null,
  p_difficulty text default null,
  p_quick text[] default '{}'::text[],
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 60,
  p_kinds text[] default null
)
  returns table (
    id uuid, user_id uuid, title text, definition text, mental_model text,
    mental_model_image_path text, category text, tags text[], difficulty text,
    confidence text, practice_count integer, last_practiced_at timestamptz,
    created_at timestamptz, updated_at timestamptz,
    kind text, options text[], correct_option int
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
    t.last_practiced_at, t.created_at, t.updated_at,
    t.kind, t.options, t.correct_option
  from public.topics t, bounds b
  where (b.pattern is null or t.search_text like b.pattern)
    and (p_kinds is null or t.kind = any(p_kinds))
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

drop function if exists public.library_counts(
  timestamptz, int, text, text, text, text, text[]);

create function public.library_counts(
  p_now timestamptz,
  p_recent_window_days int,
  p_query text default '',
  p_category text default null,
  p_confidence text default null,
  p_difficulty text default null,
  p_quick text[] default '{}'::text[],
  p_kinds text[] default null
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
      and (p_kinds is null or t.kind = any(p_kinds))
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
    -- The type chips. Counted the same way every other count is, so a chip can
    -- never disagree with what clicking it yields.
    'byKind', jsonb_build_object(
      'topic', count(*) filter (where kind = 'topic'),
      'quiz', count(*) filter (where kind = 'quiz')
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

drop function if exists public.practice_ordered_page(
  text[], text[], text, int, timestamptz, timestamptz, uuid, int, timestamptz);

create function public.practice_ordered_page(
  p_bucket_order text[],
  p_confidences text[] default null,
  p_seed text default null,
  p_cursor_bucket int default null,
  p_cursor_staleness timestamptz default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 60,
  p_practised_before timestamptz default null,
  -- `?scope=quiz`. Null means both shapes, which is what the weak page and the
  -- default session want: a weak quiz and a weak topic sit in the same list.
  p_kinds text[] default null
)
  returns table (
    id uuid, user_id uuid, title text, definition text, mental_model text,
    mental_model_image_path text, category text, tags text[], difficulty text,
    confidence text, practice_count integer, last_practiced_at timestamptz,
    created_at timestamptz, updated_at timestamptz,
    kind text, options text[], correct_option int,
    bucket int, staleness timestamptz
  )
  language sql
  stable
  security invoker
  parallel safe
  set search_path = ''
as $$
  with keyed as (
    select t.*,
      array_position(p_bucket_order, t.confidence) as bucket,
      coalesce(t.last_practiced_at, '-infinity'::timestamptz) as staleness
    from public.topics t
    where (p_confidences is null or t.confidence = any(p_confidences))
      and (p_kinds is null or t.kind = any(p_kinds))
  )
  select
    k.id, k.user_id, k.title, k.definition, k.mental_model, k.mental_model_image_path,
    k.category, k.tags, k.difficulty, k.confidence, k.practice_count,
    k.last_practiced_at, k.created_at, k.updated_at,
    k.kind, k.options, k.correct_option, k.bucket, k.staleness
  from keyed k
  where
    (p_practised_before is null or k.staleness < p_practised_before)
    and (
      p_cursor_id is null
      or (k.bucket, k.staleness) > (p_cursor_bucket, p_cursor_staleness)
      or (
        (k.bucket, k.staleness) = (p_cursor_bucket, p_cursor_staleness)
        and (k.created_at, k.id) < (p_cursor_created_at, p_cursor_id)
      )
    )
  order by
    k.bucket,
    k.staleness,
    case when p_seed is null then null else md5(p_seed || k.id::text) end,
    k.created_at desc,
    k.id desc
  limit p_limit
$$;

grant execute on function
  public.topic_search_text(text, text, text, text, text[], text[]),
  public.library_page(timestamptz, int, text, text, text, text, text[], timestamptz, uuid, int, text[]),
  public.library_counts(timestamptz, int, text, text, text, text, text[], text[]),
  public.practice_ordered_page(text[], text[], text, int, timestamptz, timestamptz, uuid, int, timestamptz, text[])
  to authenticated;
