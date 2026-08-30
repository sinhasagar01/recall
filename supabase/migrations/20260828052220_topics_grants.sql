-- Make the table privilege explicit rather than inherited.
--
-- Supabase's default ACLs already grant this on the local stack, so this migration
-- looks redundant there — it is not. A hosted project does not guarantee those
-- defaults apply to a table created by a migration, and without the grant the app
-- fails with "permission denied for table topics" against a schema that passes every
-- local test.
--
-- RLS is a separate gate and does not replace this one. See ARCHITECTURE.md,
-- "RLS and GRANT are two gates, and only one fails loudly", and the
-- has_table_privilege assertions in supabase/tests/topics_test.sql.

grant select, insert, update, delete on table public.topics to authenticated;
