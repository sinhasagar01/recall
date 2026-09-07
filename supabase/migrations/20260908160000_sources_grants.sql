-- Make the table privilege explicit rather than inherited.
--
-- The same omission as 20260828052220_topics_grants.sql, and it reached production
-- the same way: Supabase's default ACLs grant this on the local stack, so every
-- local test — 42 pgTAP assertions, the e2e suite against a real Supabase — passed
-- against a schema the hosted project would refuse. `sources` was created by a
-- migration on a running project, where those defaults do not apply, and the app
-- answered "permission denied for table sources".
--
-- It took down every page in the (app) group rather than only /sources, because
-- countSources() runs in the shared layout. RLS is a separate gate and does not
-- replace this one: the policies were correct throughout and irrelevant, since
-- GRANT is checked first.
--
-- See ARCHITECTURE.md, "RLS and GRANT are two gates, and only one fails loudly",
-- and the has_table_privilege assertions in supabase/tests/sources_test.sql.

grant select, insert, update, delete on table public.sources to authenticated;
