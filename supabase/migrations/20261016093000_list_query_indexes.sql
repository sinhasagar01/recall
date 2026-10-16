-- These private list queries always filter through auth.uid() under RLS.  The
-- composite indexes keep large source/capability collections index-backed.
create index topics_user_source_idx
  on public.topics (user_id, source_id)
  where source_id is not null;

create index topics_user_capability_idx
  on public.topics (user_id, capability_id)
  where capability_id is not null;
