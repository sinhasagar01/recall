-- Arc 2.1a — expand.
--
-- A source is a lesson, inside a chapter, inside a course. Arc 2 gave it a
-- `title` and a `course` and nothing said which was which.
--
-- ── Why this is two migrations and two deploys ──────────────────────────────
-- `alter table … rename column title to lesson` would break the running app the
-- moment it landed. Pushing IS deploying, so the migration is applied while the
-- previous build is still serving — and that build selects `title`. Worse than
-- it sounds: `countSources()` runs in the shared (app) layout, so every page in
-- the group 500s, not just /sources. That is precisely the arc 2 outage, and
-- choosing it deliberately is not better than causing it accidentally.
--
-- ARCHITECTURE.md's migrate-first rule covers ADDITIVE migrations. A rename is
-- the case it does not reach, so the sequence is:
--
--   2.1a  add `lesson` nullable, backfill it, and mirror `title` into it on
--         write so the still-live build's inserts are not lost.  ← this file
--         Then deploy the code that reads and writes `lesson`.
--   2.1b  drop the trigger, re-backfill anything the window missed, drop
--         `title`, set `lesson` NOT NULL, add its not-blank CHECK.
--
-- `lesson` is nullable for exactly one deploy. That is the price of there being
-- no window in either direction, and `toSource` reads `row.lesson ?? row.title`
-- until 2.1b removes the fallback.

alter table public.sources
  add column lesson text,
  /*
    Between course and lesson, matching how a course is actually laid out.

    Text, not a table. A chapter has no properties of its own, nothing links to
    it, and it is never read except as a string to group by — a table would need
    its own RLS, four policies, a cascade, columns_are and a pgTAP file for a
    label. This resolves the opposite way to arc 3's "why a capability is a table
    and not a text[]", and the distinction is whether the thing has state of its
    own: a capability is demonstrated or not and topics link to it; a chapter is
    a name.

    The cost, stated rather than discovered: renaming a course means updating
    every row carrying the string, and nothing stops two spellings of one course.
  */
  add column chapter text,
  /*
    Entered as free text — "13m 23s", "1:12:04", "90" — and stored as seconds so
    lengths can be summed across a chapter and a course. The parse lives in
    src/lib/domain/duration.ts and the form echoes it back in the breadcrumb
    before you save, so a misread is visible rather than silent.
  */
  add column duration_seconds integer;

/* Every row that exists now. The trigger below covers every row written next. */
update public.sources set lesson = title where lesson is null;

/*
  ── The mirror, and why it is a trigger rather than a default ───────────────
  For the minutes between this migration landing and the new build going live,
  the running app inserts a source naming `title` and nothing else. Without this,
  those rows carry a null `lesson`, and 2.1b then either fails on SET NOT NULL or
  quietly backfills an empty string over a real lesson someone typed.

  A DEFAULT cannot do this: a default is a constant expression and cannot read
  another column of the row being written.

  `coalesce(new.lesson, new.title)` and not the other way round — the new build
  writes `lesson` explicitly, and the trigger must fill a gap rather than
  overwrite an intent. Both directions are asserted in sources_test.sql.

  Safe against what is already on the table: `sources` has no other triggers, and
  `transcript_words` is GENERATED ALWAYS … STORED, which Postgres computes AFTER
  before-row triggers.

  Dropped in 2.1b. It exists only for the length of one deploy.
*/
create function public.sources_mirror_title_to_lesson()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.lesson := coalesce(new.lesson, new.title);
  return new;
end;
$$;

create trigger sources_mirror_title
  before insert or update on public.sources
  for each row
  execute function public.sources_mirror_title_to_lesson();

/*
  Blank is not a value — the rule arc 2 established for course and url, applied
  to the two new columns. An empty string is a lie the rest of the system then
  has to believe: a chapter of '' would render as a real group in the list.

  Zero is refused for the same reason and one more: a length that silently
  becomes zero is worse than one left empty, because it is then summed into a
  course total as a lesson that took no time. A failed parse stores nothing.
*/
alter table public.sources
  add constraint sources_chapter_is_not_blank
    check (chapter is null or length(btrim(chapter)) > 0),
  add constraint sources_duration_is_positive
    check (duration_seconds is null or duration_seconds > 0);

/*
  No new table, so no new GRANT — `table-grants.test.ts` derives what it checks
  from `create table`, and stays green here for the right reason rather than by
  luck. New COLUMNS on a granted table inherit the table's privileges.
*/
