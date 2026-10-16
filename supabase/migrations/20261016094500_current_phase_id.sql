-- The Phase list is paged, but "current" is defined across every phase. Keep
-- that decision in the database so rendering a page never needs to transfer the
-- rest of a user's phase evidence just to decorate one card.
create function public.current_phase_id()
  returns uuid
  language sql
  stable
  security invoker
  parallel safe
  set search_path = ''
as $$
  select phase.id
  from public.phases phase
  where not exists (
    select 1
    from public.capabilities capability
    where capability.phase_id = phase.id
  )
  or exists (
    select 1
    from public.capabilities capability
    where capability.phase_id = phase.id
      and not (
        exists (
          select 1
          from public.topics recall
          where recall.capability_id = capability.id
            and recall.confidence in ('okay', 'strong')
        )
        and exists (
          select 1
          from public.topics evidence
          where evidence.capability_id = capability.id
            and evidence.kind = 'topic'
            and (
              evidence.rebuild_at is not null
              or evidence.challenge_at is not null
              or evidence.production_at is not null
            )
        )
      )
  )
  order by phase.created_at asc
  limit 1
$$;

grant execute on function public.current_phase_id() to authenticated;
