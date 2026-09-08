-- Arc 6 — extraction.
--
-- A transcript goes to a model and comes back as concepts. Saved concepts are
-- ordinary topics and quizzes: same table, same confidence, same queue. Three
-- schema changes and one function signature, and nothing else in the database
-- knows a model was involved.

/*
  ── What the video contained, and what happened to each ─────────────────────
  Coverage is the ONE thing this arc persists beyond ordinary topics. It is the
  record of a DECISION — what was offered, what you kept, what you dropped and
  why — rather than a model response, which is why it is stored at all when the
  prose that produced it is not.

  jsonb rather than columns or a child table, and the arc 1 reason genuinely
  does not apply: `sources` has no generated-row boundary type, so there is no
  `TopicBoundaryIsSound` for `Json` to quietly satisfy. The arc 5 test applies
  instead — jsonb is safe exactly where no boundary assertion depends on the
  shape.

  The cost, stated: the database cannot see inside it. The CHECK below buys the
  one thing worth buying at this level — that it is an ARRAY, so a merge can
  never append to an object — and `parseCoverage` validates the rest on read,
  rendering a malformed column as empty rather than throwing.
*/
alter table public.sources
  add column coverage jsonb not null default '[]'::jsonb;

alter table public.sources
  add constraint sources_coverage_is_an_array check (jsonb_typeof(coverage) = 'array');

/*
  ── The five-item extraction checklist is gone ──────────────────────────────
  `caveat_noted` was the one manual tick of five, four of which were derived
  from linked entries. The checklist was a PROXY for whether you had mined the
  video; the source's own confidence summary — "12 topics · 4 never practised" —
  is the thing itself, and it is derived end to end with nothing left to tick.

  Dropped rather than left in place. A column no screen writes and no rule reads
  is one someone later reasons from.
*/
alter table public.sources drop column caveat_noted;

/*
  ── Extracted, or written ───────────────────────────────────────────────────
  One boolean, shown only as a library filter chip. It answers "which of these
  did I actually think about" months from now.

  It exists because of a risk this arc records rather than designs around: a
  library of extracted topics is one you have READ rather than written, and
  recognition reads as knowledge when quizzed. The flag makes that visible.
  Nothing else guards it, and nothing else should — it is deliberately not a
  factor in confidence, in the queue, or on the weak page.

  Unlike `source_id` and `capability_id`, this one IS on the domain Topic, so
  `TopicBoundaryIsSound` fails the build until `types.ts` gains it, and every
  read must return it. That obligation is the point: a filter over a column half
  the reads omit is a filter that lies.
*/
alter table public.topics
  add column extracted boolean not null default false;

/*
  ── A set of ids, which is not a set of sources ─────────────────────────────
  `?scope=source` needs a session of everything from one video. The obvious
  parameter is `p_source_id`, and it is the wrong one.

  `sources-boundary.test.ts` forbids every source column in this function and in
  the two modules that call it — the guard arc 2 built so that a transcript is
  never one join from something you are asked to recall. Adding `p_source_id`
  here would have required the first exception in five arcs of absolute
  boundary guards, carved into the module the guard exists to protect.

  So the queue takes IDS. `lib/data/sources.ts` resolves a source to topic ids;
  this function is handed a list and has no way to ask where they came from. The
  guard stays absolute AND literally true rather than true-with-a-footnote.
*/
drop function if exists public.practice_ordered_page(
  text[], text[], text, int, timestamptz, timestamptz, uuid, int, timestamptz, text[]);

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
  p_kinds text[] default null,
  -- `?scope=source`, and anything else that is a chosen SET. Null means no
  -- restriction. Deliberately generic: this function does not know what a
  -- source is, and must not learn.
  p_ids uuid[] default null
)
  returns table (
    id uuid, user_id uuid, title text, definition text, mental_model text,
    mental_model_image_path text, category text, tags text[], difficulty text,
    confidence text, practice_count integer, last_practiced_at timestamptz,
    created_at timestamptz, updated_at timestamptz,
    kind text, options text[], correct_option int, extracted boolean,
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
      and (p_ids is null or t.id = any(p_ids))
  )
  select
    k.id, k.user_id, k.title, k.definition, k.mental_model, k.mental_model_image_path,
    k.category, k.tags, k.difficulty, k.confidence, k.practice_count,
    k.last_practiced_at, k.created_at, k.updated_at,
    k.kind, k.options, k.correct_option, k.extracted, k.bucket, k.staleness
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

/*
  `library_page` returns the domain Topic's columns, so it gains `extracted`
  too. Omitting it here is what would make the filter chip lie: the library list
  is the one read the chip filters.

  The body below is the SHIPPED body with one column added to the select and one
  to the returns — copied from `pg_get_functiondef` rather than retyped. A
  first draft of this migration rewrote it from memory and silently replaced
  `topic_search_pattern` with an `ilike`, renamed all four quick filters, and
  moved the cursor guard from `p_cursor_created_at` to `p_cursor_id`. None of
  that would have failed to compile. `RETURNS TABLE` cannot change under
  `CREATE OR REPLACE`, so a drop is forced and the whole body has to be restated
  — which makes this the most dangerous kind of edit in the repo and the one
  place to copy rather than type.
*/
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
    kind text, options text[], correct_option int, extracted boolean,
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
    t.kind, t.options, t.correct_option, t.extracted,
    t.rebuild_at, t.rebuild_note, t.rebuild_url,
    t.challenge_at, t.challenge_note, t.challenge_url,
    t.production_at, t.production_note, t.production_url
  from public.topics t, bounds b
  where (b.pattern is null or t.search_text like b.pattern)
    and (p_kinds is null or t.kind = any(p_kinds))
    and (p_category is null or coalesce(t.category, 'Uncategorized') = p_category)
    and (p_confidence is null or t.confidence = p_confidence)
    and (p_difficulty is null or t.difficulty = p_difficulty)
    -- Arc 6's chip. "Which of these did I actually think about", months later.
    and (not ('extracted' = any(p_quick)) or t.extracted)
    and (not ('written' = any(p_quick)) or not t.extracted)
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

grant execute on function
  public.practice_ordered_page(
    text[], text[], text, int, timestamptz, timestamptz, uuid, int, timestamptz, text[], uuid[]),
  public.library_page(
    timestamptz, int, text, text, text, text, text[], timestamptz, uuid, int, text[])
  to authenticated;
