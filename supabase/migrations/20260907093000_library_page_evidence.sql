-- library_page must return the evidence columns.
--
-- Found by a Playwright failure that looked nothing like this: a card showed
-- evidence squares for a topic whose row was empty. The library takes the SQL
-- path whenever a filter is set, `?q=` included, and this function's RETURNS
-- TABLE had no evidence columns — so they arrived as `undefined`, and
-- `undefined !== null` made every filtered card claim evidence it did not have.
--
-- This is the blind spot recorded in ARCHITECTURE.md, "adding fields to a shared
-- interface catches construction, and only construction": nine columns landed on
-- the domain type, `tsc` returned five errors and all five were fixtures, and the
-- SQL contract that also had to change is invisible to it.
--
-- practice_ordered_page is deliberately NOT changed. Evidence is never an input
-- to the queue, the weak page renders rows rather than cards, and
-- src/lib/domain/evidence-boundary.test.ts fails on the mere mention of one of
-- these column names in that migration.

-- Dropped and recreated, not `create or replace`: Postgres refuses to change a
-- function's return type in place, and the failure is a migration error rather
-- than a silent no-op. The parameter list is unchanged, so no caller moves.
drop function if exists public.library_page(
  timestamptz, int, text, text, text, text, text[], timestamptz, uuid, int, text[]);

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
    kind text, options text[], correct_option int,
    rebuild_at date, rebuild_note text, rebuild_url text,
    challenge_at date, challenge_note text, challenge_url text,
    production_at date, production_note text, production_url text
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
    t.kind, t.options, t.correct_option,
    t.rebuild_at, t.rebuild_note, t.rebuild_url,
    t.challenge_at, t.challenge_note, t.challenge_url,
    t.production_at, t.production_note, t.production_url
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
