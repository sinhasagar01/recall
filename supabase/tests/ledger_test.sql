-- The project ledger.
--
-- Links, not documents. The table's job is to know a title, a kind, a status and
-- which capability an item serves — and to know nothing else, which is why the
-- exact column set is asserted rather than a list of the columns that exist.
--
-- Written and run RED before the migration exists.

begin;
select plan(48);

create function tests_create_user(uid uuid, email text) returns uuid
language plpgsql as $fn$
begin
  insert into auth.users (id, email) values (uid, email);
  return uid;
end $fn$;

create function tests_login_as(uid uuid) returns void
language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $fn$;

-- How many rows a statement actually touched. A `using` failure affects zero rows
-- rather than raising; a `with check` failure DOES raise. Both shapes appear below.
create function tests_affected(stmt text) returns int
language plpgsql as $fn$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $fn$;

-- A signed-out caller. The publishable key is public, so anyone can call
-- PostgREST as `anon` with no JWT at all.
create function tests_login_as_anon() returns void
language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $fn$;

-- Hoisted above the first tests_login_as: `create function` needs privileges the
-- `authenticated` role does not have. Arc 2 learned this the hard way.
create function tests_queue_order() returns text
language sql as $fn$
  select string_agg(title, ',' order by rn)
  from (
    select title, row_number() over () as rn
    from public.practice_ordered_page(
      array['new','weak','okay','strong']::text[], null, null, null, null, null, null, 100)
    where title in ('Ledger topic', 'Unledgered')
  ) q
$fn$;

select tests_create_user('00000000-0000-0000-0000-0000000000f1', 'owner@recall.test');
select tests_create_user('00000000-0000-0000-0000-0000000000f2', 'other@recall.test');

-- ===========================================================================
-- The table, and the columns it deliberately does not have
-- ===========================================================================
select has_table('public'::name, 'project_items'::name, 'there is a project_items table');

select has_column('public'::name, 'project_items'::name, 'kind'::name, 'an item has a kind');
select has_column('public'::name, 'project_items'::name, 'title'::name, 'an item has a title');
select has_column('public'::name, 'project_items'::name, 'link'::name, 'an item has a link');
select has_column('public'::name, 'project_items'::name, 'note'::name, 'an item has a note');
select has_column('public'::name, 'project_items'::name, 'status'::name, 'an item has a status');
select has_column('public'::name, 'project_items'::name, 'capability_id'::name,
  'an item may serve a capability');

select col_not_null('public'::name, 'project_items'::name, 'kind'::name, 'kind is required');
select col_not_null('public'::name, 'project_items'::name, 'title'::name, 'title is required');
select col_not_null('public'::name, 'project_items'::name, 'status'::name,
  'status is required and defaults to open');
select col_is_null('public'::name, 'project_items'::name, 'link'::name,
  'a decision you have not written up yet is still a decision');
select col_is_null('public'::name, 'project_items'::name, 'note'::name, 'the note is optional');
select col_is_null('public'::name, 'project_items'::name, 'capability_id'::name,
  'most incidents and milestones serve no capability — this is why it is its own table');

/*
  ── No documents, and no back-dating ────────────────────────────────────────
  The exact column set. This is the assertion that keeps "links, not documents"
  structural: a `body`, `context`, `alternatives`, `consequences` or `image_path`
  column cannot be added without failing a test that says why. And no date
  column, so an item cannot be back-dated into a tidier story than the one that
  happened.
*/
select columns_are('public'::name, 'project_items'::name,
  array['id', 'user_id', 'kind', 'title', 'link', 'note', 'status', 'capability_id',
        'created_at', 'updated_at'],
  'project_items has exactly these columns — no document body, and no date field');

select hasnt_column('public'::name, 'project_items'::name, 'body'::name,
  'there is no room for an ADR body — that lives at the link, in a file you can diff');
select hasnt_column('public'::name, 'project_items'::name, 'occurred_at'::name,
  'no back-dating: the item is stamped when you add it');

-- ===========================================================================
-- Ownership is a default, never a client-supplied value
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000f1');

select lives_ok(
  $$insert into public.project_items (kind, title) values ('adr', 'Modular monolith over microfrontends')$$,
  'a kind and a title are enough'
);

select is(
  (select user_id from public.project_items where title = 'Modular monolith over microfrontends'),
  '00000000-0000-0000-0000-0000000000f1'::uuid,
  'user_id comes from the column default, never from the client'
);

select is(
  (select status from public.project_items where title = 'Modular monolith over microfrontends'),
  'open', 'status defaults to open'
);

select throws_ok(
  $$insert into public.project_items (user_id, kind, title)
    values ('00000000-0000-0000-0000-0000000000f2', 'task', 'Not mine')$$,
  '42501', null,
  'an item cannot be inserted on behalf of someone else'
);

/*
  The owner-reassignment update. Labelled for what it proves, not for what it
  looks like it proves: arc 3 showed by perturbation that relaxing the UPDATE
  policy's `with check` alone leaves this green, because Postgres applies the
  SELECT policy to the NEW row and the two predicates are the same expression.
  This asserts that the row cannot be moved to another owner, and is not evidence
  about the update policy's with-check clause specifically.
*/
select throws_ok(
  $$update public.project_items set user_id = '00000000-0000-0000-0000-0000000000f2'
    where title = 'Modular monolith over microfrontends'$$,
  '42501', null,
  'an item cannot be moved to another owner — the new row would not be yours to see'
);

-- ===========================================================================
-- Every CHECK bites
-- ===========================================================================
select throws_ok(
  $$insert into public.project_items (kind, title) values ('blog_post', 'Not a kind')$$,
  '23514', null, 'a kind outside the six is refused'
);

select throws_ok(
  $$insert into public.project_items (kind, title, status) values ('adr', 'Bad status', 'archived')$$,
  '23514', null, 'a status outside the three is refused — six would be a workflow'
);

select throws_ok(
  $$insert into public.project_items (kind, title) values ('adr', '   ')$$,
  '23514', null, 'a whitespace-only title is refused'
);

select throws_ok(
  $$insert into public.project_items (kind, title, link) values ('adr', 'T', '')$$,
  '23514', null, 'an empty link is refused — omit it instead'
);

select throws_ok(
  $$insert into public.project_items (kind, title, note) values ('adr', 'T', '  ')$$,
  '23514', null, 'a whitespace-only note is refused'
);

select throws_ok(
  $$insert into public.project_items (kind, title, capability_id)
    values ('adr', 'Dangling', '00000000-0000-0000-0000-00000000dead')$$,
  '23503', null, 'a capability_id must point at a capability that exists'
);

select lives_ok(
  $$insert into public.project_items (kind, title, link, note, status)
    values ('incident', 'New table shipped without a GRANT',
            'https://github.com/example/issues/23', 'Forty minutes down.', 'settled')$$,
  'an item with every field is accepted'
);

-- Every kind is accepted, including the two the reference never drew.
select lives_ok(
  $$insert into public.project_items (kind, title) values
    ('task', 'Request cancellation'), ('diagram', 'C4 context'),
    ('milestone', 'First real user'), ('scale_exercise', 'Ten million rows')$$,
  'all six kinds are accepted, milestone and scale_exercise included'
);

-- ===========================================================================
-- The capability link, and the chain a phase delete completes
-- ===========================================================================
insert into public.phases (name) values ('Senior and staff frontend');
insert into public.capabilities (phase_id, name)
select id, 'Design state boundaries' from public.phases where name = 'Senior and staff frontend';

insert into public.project_items (kind, title, capability_id)
select 'adr', 'Search state ownership: URL over client store', id
from public.capabilities where name = 'Design state boundaries';

insert into public.topics (user_id, title, definition, capability_id)
select '00000000-0000-0000-0000-0000000000f1', 'Ledger topic', 'Serves the capability.', id
from public.capabilities where name = 'Design state boundaries';

insert into public.topics (user_id, title, definition)
values ('00000000-0000-0000-0000-0000000000f1', 'Unledgered', 'Serves nothing.');

select is(
  (select count(*)::int from public.project_items where capability_id is not null),
  1, 'one item serves a capability'
);

-- Deleting the PHASE cascades to its capabilities, and each of those nulls both
-- its ledger items and its topics. The whole chain, in one delete.
delete from public.phases where name = 'Senior and staff frontend';

select is(
  (select count(*)::int from public.capabilities), 0,
  'deleting a phase deletes its capabilities'
);

/*
  Counted by title, not as a total.

  A total here would depend on how many of the throws_ok inserts above actually
  threw — so relaxing any unrelated CHECK would fail this assertion too, and the
  perturbation run would report two failures where one is real. An assertion
  should fail for its own reason.
*/
select is(
  (select count(*)::int from public.project_items
    where title = 'Search state ownership: URL over client store'),
  1, 'and keeps the ledger item that served it — a ledger that deletes what you reorganised is not a record'
);

select is(
  (select capability_id from public.project_items
    where title = 'Search state ownership: URL over client store'),
  null, 'the item loses only the line saying what it served'
);

select is(
  (select count(*)::int from public.topics where title in ('Ledger topic', 'Unledgered')),
  2, 'and keeps every topic, as arc 3 established'
);

-- ===========================================================================
-- The queue cannot see any of this
-- ===========================================================================
select set_config('tests.queue_before', coalesce(tests_queue_order(), ''), true);

insert into public.phases (name) values ('Queue check');
insert into public.capabilities (phase_id, name)
select id, 'Should not move the queue' from public.phases where name = 'Queue check';
insert into public.project_items (kind, title, capability_id)
select 'task', 'Should not move the queue either', id
from public.capabilities where name = 'Should not move the queue';
update public.topics set capability_id =
  (select id from public.capabilities where name = 'Should not move the queue')
where title = 'Ledger topic';

select is(
  tests_queue_order(),
  current_setting('tests.queue_before'),
  'adding ledger items does not change what practice queues, or in what order'
);

select isnt(
  current_setting('tests.queue_before'), '',
  'and the control is a real order rather than an empty string comparing equal to itself'
);

-- ===========================================================================
-- Cross-user isolation
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000f2');

select is(
  (select count(*)::int from public.project_items), 0,
  'another user sees none of your ledger'
);

select is(
  tests_affected($$update public.project_items set title = 'Stolen'$$), 0,
  'another user cannot retitle your item'
);

select is(
  tests_affected($$update public.project_items set status = 'retired'$$), 0,
  'another user cannot change your item''s status'
);

select is(
  tests_affected($$delete from public.project_items$$), 0,
  'another user cannot delete your item'
);

-- ===========================================================================
-- Signed out
-- ===========================================================================
select tests_login_as_anon();

select is(
  (select count(*)::int from public.project_items), 0,
  'a signed-out caller sees no ledger'
);

select throws_ok(
  $$insert into public.project_items (kind, title) values ('adr', 'Anonymous')$$,
  null, null,
  'a signed-out caller cannot add an item'
);

/*
  The stronger form of the same claim. The count above passes on the local stack
  because default ACLs happen to grant anon a SELECT it then finds no rows
  through; on a hosted project anon has no grant at all. Asserting that no POLICY
  admits anon is true in both, and is the thing actually intended.
*/
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'project_items'
      and roles::text <> '{authenticated}'),
  0, 'every policy is scoped to authenticated, never anon'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'project_items'),
  4, 'four policies, one per command'
);

-- ===========================================================================
-- Table privileges
--
-- Arc 2 shipped an outage because a new table had RLS and no grant. Arc 3 proved
-- these four cannot catch that: the local stack grants new public tables through
-- default ACLs whether or not any migration says so, so removing the grant leaves
-- this file green. They catch a fresh database. The guard for a forgotten grant
-- migration is src/lib/data/table-grants.test.ts, which reads the SQL.
-- ===========================================================================
select ok(has_table_privilege('authenticated', 'public.project_items', 'SELECT'),
  'authenticated may SELECT project_items');
select ok(has_table_privilege('authenticated', 'public.project_items', 'INSERT'),
  'authenticated may INSERT project_items');
select ok(has_table_privilege('authenticated', 'public.project_items', 'UPDATE'),
  'authenticated may UPDATE project_items');
select ok(has_table_privilege('authenticated', 'public.project_items', 'DELETE'),
  'authenticated may DELETE project_items');

select * from finish();
rollback;
