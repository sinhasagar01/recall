-- Settled topics that have gone quiet. Issue #13.
--
-- Confidence does not decay: grading something "knew it" removes it from the weak
-- page for good, so a library that has been fully graded has an empty weak page
-- and nothing to say. Rather than expiring the grade — spaced repetition by
-- another name, and things reappearing because a clock moved — the grade stays
-- honest and the weak page asks a second question beside it.
--
-- Both changes are additions to the EXISTING functions rather than new ones. The
-- ordering that #12 unified stays unified: a stale list is the same
-- bucket-then-staleness ordering with a different confidence set and a cutoff.
--
-- The new parameters carry defaults, so a caller that omits them behaves exactly
-- as before. That matters for the deploy: the migration lands before the code,
-- and the version of the app running in between calls these by name without the
-- new arguments.
--
-- The rule being reproduced is `isStale` in src/lib/domain/confidence.ts. It is
-- the specification; this matches it. Note in particular that a settled topic
-- with no `last_practiced_at` counts as stale — an absent stamp is an infinite
-- gap, which `staleness` already encodes as '-infinity'.

drop function if exists public.practice_ordered_page(
  text[], text[], text, int, timestamptz, timestamptz, uuid, int);

create function public.practice_ordered_page(
  p_bucket_order text[],
  p_confidences text[] default null,
  p_seed text default null,
  p_cursor_bucket int default null,
  p_cursor_staleness timestamptz default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit int default 60,
  -- When set, keep only rows last practised strictly before this instant. Null
  -- last_practiced_at survives the filter, because staleness coalesces it to
  -- '-infinity', which is before everything.
  p_practised_before timestamptz default null
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
    updated_at timestamptz,
    bucket int,
    staleness timestamptz
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
    where p_confidences is null or t.confidence = any(p_confidences)
  )
  select
    k.id, k.user_id, k.title, k.definition, k.mental_model, k.mental_model_image_path,
    k.category, k.tags, k.difficulty, k.confidence, k.practice_count,
    k.last_practiced_at, k.created_at, k.updated_at, k.bucket, k.staleness
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

-- The weak page's header numbers, plus the stale count, in one round trip.
drop function if exists public.weak_counts(text[]);

create function public.weak_counts(
  p_confidences text[],
  p_settled_confidences text[] default null,
  p_practised_before timestamptz default null
)
  returns jsonb
  language sql
  stable
  security invoker
  parallel safe
  set search_path = ''
as $$
  select jsonb_build_object(
    'total', count(*) filter (where confidence = any(p_confidences)),
    'neverPracticed', count(*) filter (
      where confidence = any(p_confidences) and last_practiced_at is null
    ),
    'stale', count(*) filter (
      where p_settled_confidences is not null
        and p_practised_before is not null
        and confidence = any(p_settled_confidences)
        and coalesce(last_practiced_at, '-infinity'::timestamptz) < p_practised_before
    )
  )
  from public.topics
$$;

grant execute on function
  public.practice_ordered_page(text[], text[], text, int, timestamptz, timestamptz, uuid, int, timestamptz),
  public.weak_counts(text[], text[], timestamptz)
  to authenticated;
