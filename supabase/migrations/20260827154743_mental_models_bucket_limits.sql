-- Server-side validation for mental-model images.
--
-- Phase 1 gave this bucket its four RLS policies, and RLS answers WHO may write,
-- never WHAT they may write. Nothing in the app could upload until phase 10, so the
-- shape of an acceptable upload had not come up. A browser `accept=` attribute and a
-- size check in JavaScript are affordances for the person using the form; these two
-- columns are the rule, applied by the storage service to every caller including one
-- that never loads our JavaScript.
--
-- Kept in step with MAX_IMAGE_BYTES and ALLOWED_IMAGE_TYPES in
-- src/lib/domain/mental-model-image.ts, and asserted against those values in
-- supabase/tests/storage_test.sql.

update storage.buckets
set
  file_size_limit = 5 * 1024 * 1024,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
where id = 'mental-models';
