-- Query-plan regression checks for the two list relationships that grow with a
-- library. The data set is deliberately much larger than a hand-written
-- fixture: a sequential scan can look cheap with ten rows and expensive only
-- after a real learning library has grown.

begin;
select plan(4);

create function tests_plan_text(statement text) returns text
language plpgsql as $fn$
declare plan json;
begin
  execute format('explain (format json, costs off) %s', statement) into plan;
  return plan::text;
end $fn$;

insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000f01', 'plans@recall.test');

insert into public.sources (id, user_id, lesson)
values ('00000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-000000000f01', 'Indexed source');

insert into public.phases (id, user_id, name)
values ('00000000-0000-0000-0000-000000000f03', '00000000-0000-0000-0000-000000000f01', 'Indexed phase');

insert into public.capabilities (id, user_id, phase_id, name)
values (
  '00000000-0000-0000-0000-000000000f04',
  '00000000-0000-0000-0000-000000000f01',
  '00000000-0000-0000-0000-000000000f03',
  'Indexed capability'
);

-- 3,000 ordinary entries are a small but representative library. The two
-- linked rows are the exact shapes Sources and Phases request after paging.
insert into public.topics (user_id, title, definition)
select '00000000-0000-0000-0000-000000000f01', 'Unlinked entry ' || n, 'd'
from generate_series(1, 3000) as n;

insert into public.topics (user_id, title, definition, source_id, capability_id)
values (
  '00000000-0000-0000-0000-000000000f01',
  'Linked entry',
  'd',
  '00000000-0000-0000-0000-000000000f02',
  '00000000-0000-0000-0000-000000000f04'
);

analyze public.topics;

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000f01', 'role', 'authenticated')::text, true);
set local role authenticated;

select has_index('public'::name, 'topics'::name, 'topics_user_source_idx'::name,
  'the source relationship has a private composite index');
select has_index('public'::name, 'topics'::name, 'topics_user_capability_idx'::name,
  'the capability relationship has a private composite index');

select ok(
  position('topics_user_source_idx' in tests_plan_text($$
    select id, kind, confidence, practice_count, source_id
    from public.topics
    where source_id = '00000000-0000-0000-0000-000000000f02'
  $$)) > 0,
  'a source summary lookup uses the source index at a realistic library size'
);

select ok(
  position('topics_user_capability_idx' in tests_plan_text($$
    select id, capability_id, kind, confidence, rebuild_at, challenge_at, production_at
    from public.topics
    where capability_id = '00000000-0000-0000-0000-000000000f04'
  $$)) > 0,
  'a phase evidence lookup uses the capability index at a realistic library size'
);

select * from finish();
rollback;
