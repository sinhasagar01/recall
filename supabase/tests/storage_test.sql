begin;
select plan(17);

-- ---------------------------------------------------------------------------
-- Local helpers, same discipline as topics_test.sql: created inside this
-- transaction, rolled back with it, never shipped in a migration.
--
-- storage.objects is owned by supabase_storage_admin and already has RLS
-- enabled, but pgTAP runs as `postgres`, which has BYPASSRLS. Without the role
-- switch below, every isolation assertion here would pass with no policies at
-- all.
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

select tests_create_user('00000000-0000-0000-0000-0000000000aa', 'a@recall.test');
select tests_create_user('00000000-0000-0000-0000-0000000000bb', 'b@recall.test');

-- ===========================================================================
-- Bucket
-- ===========================================================================
select is((select count(*)::int from storage.buckets where id = 'mental-models'), 1,
  'the mental-models bucket exists');
select is((select public from storage.buckets where id = 'mental-models'), false,
  'the mental-models bucket is private');

-- ===========================================================================
-- Policies
--
-- storage.objects is shared Supabase infrastructure, so policies_are() over the
-- whole table would fail whenever the platform adds a policy of its own — which
-- says nothing about our work. Instead this asserts the EXACT set of policies
-- carrying our `recall_mental_models_` prefix. A fifth permissive policy of ours
-- in a later migration fails this test; a platform policy does not.
-- ===========================================================================
select is(
  (select string_agg(policyname || ':' || cmd, ', ' order by policyname)
     from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'recall\_mental\_models\_%'),
  'recall_mental_models_delete_own:DELETE, recall_mental_models_insert_own:INSERT, '
  || 'recall_mental_models_select_own:SELECT, recall_mental_models_update_own:UPDATE',
  'storage.objects carries our four mental-models policies, one per command');

-- ===========================================================================
-- Path ownership. The object path is {user_id}/{topic_id}/{filename}, so the
-- first path segment is what the policies key on.
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000aa');

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('mental-models',
            '00000000-0000-0000-0000-0000000000aa/00000000-0000-0000-0000-000000000a01/model.png')$$,
  'user A can upload under their own user_id folder');

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('mental-models',
            '00000000-0000-0000-0000-0000000000bb/00000000-0000-0000-0000-000000000b01/model.png')$$,
  '42501', null,
  'user A cannot upload into user B''s folder');

select is((select count(*)::int from storage.objects
           where bucket_id = 'mental-models'), 1,
  'user A can select their own object');

select tests_logout();

-- ---------------------------------------------------------------------------
-- storage.protect_objects_delete is a BEFORE DELETE *statement* trigger that
-- refuses direct SQL deletes unless storage.allow_delete_query is set — and
-- being statement-level, it fires even when RLS matches zero rows. Setting the
-- GUC is what the Storage API itself does. It is a plain custom parameter, not
-- a privilege: RLS stays fully in force, so the delete assertions below still
-- measure the policy and nothing else.
-- ---------------------------------------------------------------------------
select set_config('storage.allow_delete_query', 'true', true);

-- ===========================================================================
-- Cross-user isolation
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000bb');

select is((select count(*)::int from storage.objects
           where bucket_id = 'mental-models'), 0,
  'user B cannot select user A''s object');

select is(tests_rows_affected(
    $$update storage.objects set name = name || '.hacked'
      where bucket_id = 'mental-models'$$), 0,
  'user B cannot update user A''s object');

select is(tests_rows_affected(
    $$delete from storage.objects where bucket_id = 'mental-models'$$), 0,
  'user B cannot delete user A''s object');

select tests_logout();

-- --- as anon: signed out, sees and changes nothing -------------------------
select tests_login_as_anon();

select is((select count(*)::int from storage.objects
           where bucket_id = 'mental-models'), 0,
  'anon cannot select any object');

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('mental-models',
            '00000000-0000-0000-0000-0000000000aa/00000000-0000-0000-0000-000000000a01/forged.png')$$,
  '42501', null,
  'anon cannot upload an object');

select is(tests_rows_affected(
    $$update storage.objects set name = name || '.hacked'
      where bucket_id = 'mental-models'$$), 0,
  'anon cannot update any object');

select is(tests_rows_affected(
    $$delete from storage.objects where bucket_id = 'mental-models'$$), 0,
  'anon cannot delete any object');

select tests_logout();

select is((select count(*)::int from storage.objects where bucket_id = 'mental-models'), 1,
  'user A''s object is untouched after user B''s and anon''s attempts');

-- ===========================================================================
-- User A can manage their own object
-- ===========================================================================
select tests_login_as('00000000-0000-0000-0000-0000000000aa');

select is(tests_rows_affected(
    $$update storage.objects set updated_at = now()
      where bucket_id = 'mental-models'$$), 1,
  'user A can update their own object');

select is(tests_rows_affected(
    $$delete from storage.objects where bucket_id = 'mental-models'$$), 1,
  'user A can delete their own object');

select tests_logout();

-- ===========================================================================
-- Final state
-- ===========================================================================
select is((select count(*)::int from storage.objects where bucket_id = 'mental-models'), 0,
  'no mental-models objects remain after user A deleted their own');

select * from finish();
rollback;
