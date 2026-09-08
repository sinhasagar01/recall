-- Arc 2.1b, step three of three: contract.
--
-- By the time this runs, the live build reads and writes only `lesson` — that was
-- step two. Nothing references `title` any more, so it can go.

/*
  The mirror existed to protect the writes of a build that no longer exists. It
  was the whole safety of the expand phase and it is dead weight now: a trigger
  firing on every insert and update to copy a column nothing writes.

  Dropped before the re-backfill, so nothing can slip in behind it.
*/
drop trigger if exists sources_mirror_title on public.sources;
drop function if exists public.sources_mirror_title_to_lesson();

/*
  The re-backfill, and it is not belt-and-braces.

  It covers exactly one case: a row written during the expand window by the old
  build, if the mirror had somehow not fired. It should find nothing — and if it
  finds something, that is the window doing what the sequence was built for
  rather than a footnote.

  Run BEFORE the NOT NULL below, because that is what SET NOT NULL would fail on.
*/
update public.sources set lesson = title where lesson is null and title is not null;

alter table public.sources drop column title;

alter table public.sources alter column lesson set not null;

/*
  Blank is not a value — the rule every text column on this table follows, now on
  the one that replaced `title`. `sources_title_is_not_blank` went with its
  column above; this is its successor rather than a new idea.
*/
alter table public.sources
  add constraint sources_lesson_is_not_blank check (length(btrim(lesson)) > 0);
