BEGIN;
SELECT plan(1);

-- Smoke test only. It proves the pgTAP harness can reach the local database and
-- report a result. Real schema, constraint, trigger and RLS tests arrive in
-- phase 1, and are written before the objects they cover.
SELECT ok(
  (SELECT count(*) FROM pg_extension WHERE extname = 'pgtap') = 1,
  'pgTAP is installed on the local stack'
);

SELECT * FROM finish();
ROLLBACK;
