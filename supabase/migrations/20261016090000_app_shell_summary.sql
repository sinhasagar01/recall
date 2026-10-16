-- The signed-in application shell is rendered on almost every private route.
-- One security-invoker RPC removes five PostgREST round trips from each render.
create function public.app_shell_summary(p_review_confidences text[])
  returns jsonb
  language sql
  stable
  security invoker
  parallel safe
  set search_path = ''
as $$
  with topic_counts as (
    select count(*)::int as total,
      count(*) filter (where confidence = any(p_review_confidences))::int as needs_review,
      count(*) filter (where mental_model_image_path is not null)::int as with_images
    from public.topics
  ), capability_counts as (
    select count(*)::int as total,
      count(*) filter (where exists (
        select 1 from public.topics recall
        where recall.capability_id = capability.id and recall.confidence in ('okay', 'strong')
      ) and exists (
        select 1 from public.topics evidence
        where evidence.capability_id = capability.id and evidence.kind = 'topic'
          and (evidence.rebuild_at is not null or evidence.challenge_at is not null or evidence.production_at is not null)
      ))::int as demonstrated
    from public.capabilities capability
  ), recent_days as (
    select day,
      ((explain_text is not null)::int + (rebuild_text is not null)::int + (apply_text is not null)::int) as written,
      (explain_done::int + rebuild_done::int + apply_done::int) as done
    from public.days
    order by day desc
    limit 7
  )
  select jsonb_build_object(
    'rail', jsonb_build_object('total', topic_counts.total, 'needsReview', topic_counts.needs_review, 'withImages', topic_counts.with_images),
    'sources', (select count(*)::int from public.sources),
    'phases', jsonb_build_object('total', capability_counts.total, 'demonstrated', capability_counts.demonstrated),
    'ledger', (select count(*)::int from public.project_items),
    'days', coalesce((select jsonb_agg(jsonb_build_object('day', day, 'done', done, 'written', written) order by day desc) from recent_days), '[]'::jsonb)
  )
  from topic_counts, capability_counts
$$;

grant execute on function public.app_shell_summary(text[]) to authenticated;
