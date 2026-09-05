-- The practice ordering, in SQL. Issue #12.
--
-- The weak page and the practice page both read every topic the user owned, then
-- ordered them in the browser with orderForPractice. Confidence starts at `new` and
-- needsReview is `weak or new`, so a freshly imported library is entirely weak — the
-- weak page loaded all of it, and the practice page loaded all of it to pick ten.
--
-- ── One ordering, two callers ───────────────────────────────────────────────
-- orderForPractice sorts by confidence bucket, then staleness, then breaks ties.
-- All three parts are here once, with the tie-break parameterised:
--
--   * the weak page passes no seed, so the md5 term is null for every row and the
--     order falls through to created_at desc, id desc — exactly what the page shows
--     today, since `noShuffle` preserves the order listTopics returned. Stable
--     across reloads, which a list page has to be.
--   * a practice session passes the read timestamp as the seed, so ties are
--     shuffled, and asks for PRACTICE_SESSION_SIZE rows.
--
-- ── Why an md5 tie-break is not a weaker rule ───────────────────────────────
-- `Shuffle` has been an injected parameter since phase 2:
-- selectPracticeSession(topics, { shuffle }). The domain specifies THAT ties are
-- broken, never WHICH permutation — noShuffle and seededShuffle are already two
-- implementations of it. md5(seed || id) is a third: deterministic, seeded from the
-- read, and uniform across a tie group. This is the injection point being used for
-- what it exists for.
--
-- Parity follows that split. The unseeded ordering is fully deterministic and is
-- asserted id-for-id against orderForPractice; the seeded selection is asserted
-- through properties. See supabase/tests/library_parity_test.sql and
-- src/lib/domain/practice-ordering.test.ts.
--
-- BUCKET_ORDER is passed in rather than written as a CASE here, so the domain keeps
-- the single definition of it — the same arrangement RECENT_WINDOW_DAYS has.

create or replace function public.practice_ordered_page(
  p_bucket_order text[],
  p_confidences text[] default null,
  p_seed text default null,
  p_cursor_bucket int default null,
  p_cursor_staleness timestamptz default null,
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
      /*
        NEVER is Number.NEGATIVE_INFINITY in the domain, and timestamptz has
        '-infinity'. A topic never practised has an infinitely long gap, so it is the
        stalest thing in its bucket rather than a tie with a practised one. Using the
        sentinel instead of `nulls first` also makes the keyset cursor below a plain
        comparison rather than null-juggling.
      */
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
    /*
      Mixed-direction keyset: bucket and staleness ascend while created_at and id
      descend, so this cannot be a single row comparison. Only the unseeded ordering
      paginates — a seeded session is one bounded page and passes no cursor.
    */
    p_cursor_id is null
    or (k.bucket, k.staleness) > (p_cursor_bucket, p_cursor_staleness)
    or (
      (k.bucket, k.staleness) = (p_cursor_bucket, p_cursor_staleness)
      and (k.created_at, k.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by
    k.bucket,
    k.staleness,
    case when p_seed is null then null else md5(p_seed || k.id::text) end,
    k.created_at desc,
    k.id desc
  limit p_limit
$$;

-- The weak page's header: how many need review, and how many of those have never
-- been practised. Both over the whole weak set, not the page.
create or replace function public.weak_counts(p_confidences text[])
  returns jsonb
  language sql
  stable
  security invoker
  parallel safe
  set search_path = ''
as $$
  select jsonb_build_object(
    'total', count(*),
    'neverPracticed', count(*) filter (where last_practiced_at is null)
  )
  from public.topics
  where confidence = any(p_confidences)
$$;

grant execute on function
  public.practice_ordered_page(text[], text[], text, int, timestamptz, timestamptz, uuid, int),
  public.weak_counts(text[])
  to authenticated;
