-- A clean lesson belongs to its source, but is never a library entry.
-- It is learning material, not a scheduled retrieval unit.
alter table public.sources
  add column learning_lesson jsonb;

alter table public.sources
  add constraint sources_learning_lesson_is_object
  check (learning_lesson is null or jsonb_typeof(learning_lesson) = 'object');
