-- The rail's three counts, in one round trip.
--
-- The sidebar renders on every page in the (app) group and was issuing three
-- separate PostgREST requests to do it: total, needs-review, and how many topics
-- carry an image. Each is sub-millisecond against one user's rows — the cost was
-- never the database, it was three round trips on every navigation.
--
-- The review rule is passed in rather than written here, the same arrangement
-- RECENT_WINDOW_DAYS and the practice bucket order have: REVIEW_CONFIDENCES in
-- src/lib/domain/library-counts.ts is derived from needsReview itself, so the
-- predicate has one definition and this query cannot hold a stale copy of it.
--
-- SECURITY INVOKER, so RLS scopes it to the caller.

create or replace function public.rail_counts(p_review_confidences text[])
  returns jsonb
  language sql
  stable
  security invoker
  parallel safe
  set search_path = ''
as $$
  select jsonb_build_object(
    'total', count(*),
    'needsReview', count(*) filter (where confidence = any(p_review_confidences)),
    'withImages', count(*) filter (where mental_model_image_path is not null)
  )
  from public.topics
$$;

grant execute on function public.rail_counts(text[]) to authenticated;
