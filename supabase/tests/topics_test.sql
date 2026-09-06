begin;
select plan(64);

-- ---------------------------------------------------------------------------
-- Local helpers.
--
-- Created inside this transaction and rolled back with it, so nothing
-- test-only ever reaches the production schema. No test-helper package is
-- installed as a migration.
--
-- Why the role switching matters: pgTAP runs as `postgres`, and on this stack
-- `postgres` has BYPASSRLS. A policy test that forgets to switch roles passes
-- whether or not the policy exists. Every RLS assertion below therefore runs
-- after tests_login_as(), which sets BOTH the role and request.jwt.claims, so
-- auth.uid() returns the impersonated user.
-- ---------------------------------------------------------------------------
create function tests_create_user(uid uuid, email text) returns uuid
language plpgsql as $$
begin
  insert into auth.users (id, email) values (uid, email);
  return uid;
end $$;

create function tests_login_as(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Returns the number of rows a statement actually touched. A data-modifying
-- CTE cannot live inside a subquery, and this is what "affected 0 rows" has to
-- be measured with. SECURITY INVOKER (the default) is essential: the statement
-- must run as whoever is logged in, so RLS applies.
create function tests_rows_affected(stmt text) returns int
language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

-- A signed-out caller. This is the real threat model: the publishable key is
-- public, so anyone can call PostgREST as `anon` with no JWT at all. No claims
-- are set, so auth.uid() is null.
create function tests_login_as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;

create function tests_logout() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Fixed ids keep the assertions readable; both users are created up front,
-- while we are still postgres and can write to auth.users.
select tests_create_user('00000000-0000-0000-0000-0000000000aa', 'a@recall.test');
select tests_create_user('00000000-0000-0000-0000-0000000000bb', 'b@recall.test');

-- ===========================================================================
-- Schema
-- ===========================================================================
select has_table('public'::name, 'topics'::name, 'topics table exists');

-- search_text is the one column here that is not in the brief. It is derived,
-- never written, and never read by the application: it exists so the trigram
-- index has something to index. The domain Topic type deliberately does not
-- carry it, and src/lib/data reads an explicit column list rather than *, so it
-- cannot leak into the client. See the 20260905143000 migration.
select columns_are('public'::name, 'topics'::name, ARRAY[
  'id', 'user_id', 'title', 'definition', 'mental_model',
  'mental_model_image_path', 'category', 'tags', 'difficulty', 'confidence',
  'practice_count', 'last_practiced_at', 'created_at', 'updated_at',
  'search_text',
  -- The quiz shape. See supabase/tests/quiz_shape_test.sql for what couples them.
  'kind', 'options', 'correct_option'
]::name[], 'topics has exactly the columns in the brief, plus search_text and the quiz shape');

select is(
  (select is_generated from information_schema.columns
    where table_schema = 'public' and table_name = 'topics' and column_name = 'search_text'),
  'ALWAYS',
  'search_text is generated, so it cannot be written directly'
);

select col_type_is('public'::name, 'topics'::name, 'id'::name, 'uuid'::text);
select col_type_is('public'::name, 'topics'::name, 'user_id'::name, 'uuid'::text);
select col_type_is('public'::name, 'topics'::name, 'title'::name, 'text'::text);
select col_type_is('public'::name, 'topics'::name, 'definition'::name, 'text'::text);
select col_type_is('public'::name, 'topics'::name, 'mental_model'::name, 'text'::text);
select col_type_is('public'::name, 'topics'::name, 'mental_model_image_path'::name, 'text'::text);
select col_type_is('public'::name, 'topics'::name, 'category'::name, 'text'::text);
select col_type_is('public'::name, 'topics'::name, 'tags'::name, 'text[]'::text);
select col_type_is('public'::name, 'topics'::name, 'difficulty'::name, 'text'::text);
select col_type_is('public'::name, 'topics'::name, 'confidence'::name, 'text'::text);
select col_type_is('public'::name, 'topics'::name, 'practice_count'::name, 'integer'::text);
select col_type_is('public'::name, 'topics'::name, 'last_practiced_at'::name, 'timestamp with time zone'::text);
select col_type_is('public'::name, 'topics'::name, 'created_at'::name, 'timestamp with time zone'::text);
select col_type_is('public'::name, 'topics'::name, 'updated_at'::name, 'timestamp with time zone'::text);

-- ===========================================================================
-- Constraints
-- ===========================================================================
select col_not_null('public'::name, 'topics'::name, 'user_id'::name);
select col_not_null('public'::name, 'topics'::name, 'title'::name);
/*
  definition is nullable as of the quiz migration: a quiz has no definition, its
  question is its title. The guarantee for TOPICS did not weaken — it moved into
  topics_shape_is_consistent, which quiz_shape_test.sql exercises in both
  directions. Asserted here so the move is visible from this file too.
*/
select col_is_null('public'::name, 'topics'::name, 'definition'::name);
select col_not_null('public'::name, 'topics'::name, 'practice_count'::name);
select col_not_null('public'::name, 'topics'::name, 'created_at'::name);
select col_not_null('public'::name, 'topics'::name, 'updated_at'::name);

select throws_ok(
  $$insert into public.topics (user_id, title, definition, difficulty)
    values ('00000000-0000-0000-0000-0000000000aa', 't', 'd', 'impossible')$$,
  '23514', null, 'difficulty rejects a value outside easy/medium/hard');

select throws_ok(
  $$insert into public.topics (user_id, title, definition, confidence)
    values ('00000000-0000-0000-0000-0000000000aa', 't', 'd', 'unsure')$$,
  '23514', null, 'confidence rejects a value outside new/weak/okay/strong');

-- A CHECK constraint passes on NULL, so `check (difficulty in (...))` never
-- stopped an explicit null. These three columns carry a default AND a NOT NULL;
-- the default covers an omitted value, the NOT NULL covers an explicit null.
select col_not_null('public'::name, 'topics'::name, 'difficulty'::name);
select col_not_null('public'::name, 'topics'::name, 'confidence'::name);
select col_not_null('public'::name, 'topics'::name, 'tags'::name);

select throws_ok(
  $$insert into public.topics (user_id, title, definition, difficulty)
    values ('00000000-0000-0000-0000-0000000000aa', 't', 'd', null)$$,
  '23502', null, 'difficulty rejects an explicit null');

select throws_ok(
  $$insert into public.topics (user_id, title, definition, confidence)
    values ('00000000-0000-0000-0000-0000000000aa', 't', 'd', null)$$,
  '23502', null, 'confidence rejects an explicit null');

select throws_ok(
  $$insert into public.topics (user_id, title, definition, tags)
    values ('00000000-0000-0000-0000-0000000000aa', 't', 'd', null)$$,
  '23502', null, 'tags rejects an explicit null');

-- ===========================================================================
-- Defaults — asserted behaviourally. Comparing the catalog's default *text*
-- is fragile for array and function defaults; inserting and reading back is
-- what the application will actually experience.
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000aa');

-- Note: no user_id in this insert. Clients must never send one; it comes from
-- the column default, which is auth.uid().
insert into public.topics (id, title, definition)
values ('00000000-0000-0000-0000-000000000a01', 'Defaults', 'row for default checks');

select is((select user_id from public.topics where id = '00000000-0000-0000-0000-000000000a01'),
  '00000000-0000-0000-0000-0000000000aa'::uuid,
  'user_id defaults to auth.uid() and stamps the authenticated user');
select is((select confidence from public.topics where id = '00000000-0000-0000-0000-000000000a01'),
  'new', 'confidence defaults to new');
select is((select difficulty from public.topics where id = '00000000-0000-0000-0000-000000000a01'),
  'medium', 'difficulty defaults to medium');
select is((select practice_count from public.topics where id = '00000000-0000-0000-0000-000000000a01'),
  0, 'practice_count defaults to 0');
select is((select tags from public.topics where id = '00000000-0000-0000-0000-000000000a01'),
  '{}'::text[], 'tags defaults to an empty array');
select is((select created_at from public.topics where id = '00000000-0000-0000-0000-000000000a01'),
  now(), 'created_at defaults to now()');
select is((select updated_at from public.topics where id = '00000000-0000-0000-0000-000000000a01'),
  now(), 'updated_at defaults to now()');
select is((select last_practiced_at from public.topics where id = '00000000-0000-0000-0000-000000000a01'),
  null::timestamptz, 'last_practiced_at starts null');

-- id is generated when the client omits it
insert into public.topics (title, definition) values ('Generated id', 'd');
select isnt((select id from public.topics where title = 'Generated id'), null::uuid,
  'id is generated by default');

select tests_logout();

-- The auth.uid() default is a trap: with no JWT claims, auth.uid() is null and
-- the not-null constraint fires. Asserted as postgres (BYPASSRLS) so this
-- isolates the constraint from the RLS with-check, which would also reject it.
select throws_ok(
  $$insert into public.topics (title, definition) values ('No claims', 'd')$$,
  '23502', null,
  'insert with no JWT claims fails: auth.uid() is null, not-null fires');

-- ===========================================================================
-- updated_at trigger
--
-- now() is fixed for the whole transaction, so an insert followed by an update
-- in the same transaction produces identical timestamps and would prove
-- nothing. The row is inserted backdated so the update has somewhere to move.
-- ===========================================================================
insert into public.topics (id, user_id, title, definition, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-0000000000aa',
        'Trigger', 'd', now() - interval '1 day', now() - interval '1 day');

update public.topics set title = 'Trigger touched'
where id = '00000000-0000-0000-0000-000000000a02';

select ok((select updated_at from public.topics where id = '00000000-0000-0000-0000-000000000a02') = now(),
  'updating a column moves updated_at forward to now()');
select ok((select created_at from public.topics where id = '00000000-0000-0000-0000-000000000a02')
          = now() - interval '1 day',
  'updating a column leaves created_at unchanged');

-- ===========================================================================
-- Indexes
-- ===========================================================================
select has_index('public'::name, 'topics'::name, 'topics_user_id_created_at_idx'::name,
  'index on (user_id, created_at desc) exists');
select has_index('public'::name, 'topics'::name, 'topics_user_id_confidence_idx'::name,
  'index on (user_id, confidence) exists');
select ok(
  (select pg_get_indexdef(c.oid) like '%created_at DESC%'
     from pg_class c where c.relname = 'topics_user_id_created_at_idx'),
  'the created_at index is actually descending');

-- ===========================================================================
-- Cascade
-- ===========================================================================
select is((select count(*)::int from public.topics
           where user_id = '00000000-0000-0000-0000-0000000000aa'), 3,
  'user A has 3 topics before the cascade');
delete from auth.users where id = '00000000-0000-0000-0000-0000000000aa';
select is((select count(*)::int from public.topics
           where user_id = '00000000-0000-0000-0000-0000000000aa'), 0,
  'deleting the auth user deletes their topics');

-- ===========================================================================
-- Table privileges
--
-- RLS and GRANT are two independent gates, and only one of them fails loudly.
-- Without the GRANT: "permission denied for table topics" — obvious. With the
-- GRANT but no policy: zero rows and no error — which reads like the data
-- vanished.
--
-- Everything below the RLS heading tests the second gate. This tests the first.
-- The local stack grants these through Supabase's default ACLs for new tables in
-- `public`, but a hosted project does not guarantee it — which is why
-- *_topics_grants.sql exists. Asserted so a fresh database fails here rather
-- than in production.
--
-- Asked per privilege rather than with table_privs_are(), which asserts an exact
-- set: pinning the full default ACL would make this fail on any platform change
-- that has nothing to do with what the app needs.
-- ===========================================================================
select ok(has_table_privilege('authenticated', 'public.topics', 'SELECT'),
  'authenticated may SELECT topics');
select ok(has_table_privilege('authenticated', 'public.topics', 'INSERT'),
  'authenticated may INSERT topics');
select ok(has_table_privilege('authenticated', 'public.topics', 'UPDATE'),
  'authenticated may UPDATE topics');
select ok(has_table_privilege('authenticated', 'public.topics', 'DELETE'),
  'authenticated may DELETE topics');

-- ===========================================================================
-- RLS
-- ===========================================================================
select ok((select relrowsecurity from pg_class
           where oid = 'public.topics'::regclass),
  'row level security is enabled on topics');

select policies_are('public'::name, 'topics'::name, ARRAY[
  'topics_select_own', 'topics_insert_own', 'topics_update_own', 'topics_delete_own'
]::name[], 'topics has exactly the four owner policies');

-- Re-create user A (the cascade test deleted them) and give them a row.
select tests_create_user('00000000-0000-0000-0000-0000000000aa', 'a2@recall.test');
insert into public.topics (id, user_id, title, definition)
values ('00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-0000000000aa',
        'A private topic', 'belongs to user A');

-- --- as user A: can see own row -------------------------------------------
select tests_login_as('00000000-0000-0000-0000-0000000000aa');
select is((select count(*)::int from public.topics
           where id = '00000000-0000-0000-0000-000000000a03'), 1,
  'user A can select their own row');
select tests_logout();

-- --- as user B: cannot see, change or remove user A's row -----------------
-- These are the assertions that would pass vacuously without role switching,
-- because postgres has BYPASSRLS.
select tests_login_as('00000000-0000-0000-0000-0000000000bb');

select is((select count(*)::int from public.topics
           where id = '00000000-0000-0000-0000-000000000a03'), 0,
  'user B cannot select user A''s row');

select is(tests_rows_affected(
    $$update public.topics set title = 'hacked'
      where id = '00000000-0000-0000-0000-000000000a03'$$), 0,
  'user B cannot update user A''s row');

select is(tests_rows_affected(
    $$delete from public.topics
      where id = '00000000-0000-0000-0000-000000000a03'$$), 0,
  'user B cannot delete user A''s row');

select throws_ok(
  $$insert into public.topics (user_id, title, definition)
    values ('00000000-0000-0000-0000-0000000000aa', 'forged', 'd')$$,
  '42501', null,
  'user B cannot insert a row owned by user A: the with-check rejects it');

select tests_logout();

-- --- as anon: signed out, sees and changes nothing -------------------------
select tests_login_as_anon();

select is((select count(*)::int from public.topics), 0,
  'anon cannot select any topic');

-- user_id is supplied explicitly on purpose. Without it the not-null
-- constraint would reject the insert on its own, and the assertion would pass
-- even with RLS disabled. With it, only RLS can do the rejecting.
select throws_ok(
  $$insert into public.topics (user_id, title, definition)
    values ('00000000-0000-0000-0000-0000000000aa', 'anon forged', 'd')$$,
  '42501', null,
  'anon cannot insert a topic');

select is(tests_rows_affected(
    $$update public.topics set title = 'hacked by anon'$$), 0,
  'anon cannot update any topic');

select is(tests_rows_affected(
    $$delete from public.topics$$), 0,
  'anon cannot delete any topic');

select tests_logout();

-- The row survived every attempt above.
select is((select title from public.topics where id = '00000000-0000-0000-0000-000000000a03'),
  'A private topic',
  'user A''s row is untouched after user B''s and anon''s attempts');

select * from finish();
rollback;
