-- Private bucket for mental-model images, served through signed URLs.
--
-- Object path is {user_id}/{topic_id}/{filename}. user_id MUST be the first
-- segment: it is the only thing the policies below can key on. Because the
-- path needs a topic_id, saving with an image is three steps — insert the row,
-- upload, then patch mental_model_image_path.

insert into storage.buckets (id, name, public)
values ('mental-models', 'mental-models', false)
on conflict (id) do nothing;

-- All four names share the `recall_mental_models_` prefix. storage.objects is
-- shared infrastructure, so the test asserts the exact set of policies carrying
-- THIS prefix: a fifth permissive policy of ours fails the test, while a policy
-- Supabase adds to the platform does not.
--
-- (storage.foldername(name))[1] is the first path segment, i.e. the owner.
create policy recall_mental_models_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'mental-models'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy recall_mental_models_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'mental-models'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy recall_mental_models_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'mental-models'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'mental-models'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy recall_mental_models_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'mental-models'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
