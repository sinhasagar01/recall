-- Arc 2.1b, step one of three: let go of `title` without letting go of it.
--
-- The contract phase of a rename has the same hazard as the expand phase, in the
-- other direction. `20260914093000` drops `sources.title` — and the build that
-- is live right now still SELECTs it (`SUMMARY_COLUMNS`, `listSourceOptions`)
-- and still WRITES it, because `title` is `not null`. Dropping the column while
-- that build is serving is a 42703 on every source page, which is the window the
-- expand phase spent an extra deploy closing.
--
-- So contract is three steps, not one:
--
--   1. this file  — `title` becomes nullable. The live build still writes it, so
--                   nothing changes for it, and nothing breaks.
--   2. deploy     — code that reads and writes ONLY `lesson`. Safe now: an
--                   insert omitting `title` no longer violates a NOT NULL.
--   3. contract   — drop the mirror trigger, re-backfill, drop `title`, make
--                   `lesson` NOT NULL, add its not-blank CHECK.
--
-- The general rule, recorded in ARCHITECTURE.md: **a column must stop being used
-- by the running build before it is removed.** Expand adds then migrates;
-- contract migrates then removes. Both halves are ordered by what is live, not by
-- what is convenient.

alter table public.sources alter column title drop not null;

/*
  `sources_title_is_not_blank` stays for now. It reads
  `length(btrim(title)) > 0`, which a CHECK evaluates as unknown-therefore-passing
  when the value is null — so a nullable column with this constraint accepts null
  and rejects ''. That is exactly what is wanted for one deploy, and the whole
  constraint goes with the column in step three.

  (This is the same "a CHECK constraint does not imply NOT NULL" property recorded
  in ARCHITECTURE.md, relied on deliberately rather than tripped over.)
*/
