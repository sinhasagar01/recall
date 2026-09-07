-- Sources. The first new table since the schema was built.
--
-- ── Why this is a table and not another `kind` ──────────────────────────────
-- `kind` discriminates topic from quiz, and those two are the SAME kind of
-- thing: a practisable retrieval unit. They share confidence, practice_count,
-- last_practiced_at and difficulty, and topics_shape_is_consistent couples them
-- into one shape with two arms.
--
-- A source has none of that. It is never practised, has no confidence, and dies
-- without taking its children with it. As a third `kind` it would need a third
-- arm on the shape CHECK nulling a dozen columns to describe a row that is
-- mostly absence; a third arm on the domain union that is not a Topic; and —
-- the decisive one — the queue would silently include it, because `p_kinds`
-- defaults to null meaning BOTH shapes, so practice_ordered_page, library_page
-- and library_counts would each have to learn to exclude it and forgetting one
-- puts a transcript in the practice queue.
--
-- Seventeen phases at one table held because everything in it was a practisable
-- unit. The rule was never "one table forever"; it was "do not invent an entity
-- for something that is already a topic". This is the first thing that is not.

create table public.sources (
  id                     uuid primary key default gen_random_uuid(),
  -- Never client-supplied. Same arrangement as topics: the default provides it
  -- and the insert policy's with-check refuses anything else.
  user_id                uuid not null default auth.uid() references auth.users(id) on delete cascade,

  title                  text not null,
  course                 text,
  url                    text,

  /*
    The transcript is SCRATCH.

    Deletable, and the delete is not recoverable. The source record survives it,
    and a source with no transcript is a normal supported state rather than a
    broken one — a lesson you took notes on from paper still deserves a record.

    It lives here and never on `topics`, which is what keeps it out of
    `search_text` (a generated column on that table) and out of every library
    read. A transcript matching "closure" would bury the topic you wrote about
    closures under the paragraph that taught you it.
  */
  transcript             text,

  /*
    Generated, so the count cannot drift from the text it counts — and so the
    sources LIST can show "8,400 words" without ever selecting the body. Six
    sources at 14,000 words each is half a megabyte the list has no use for.

    Null rather than zero when there is no transcript: the list needs to tell
    "no transcript" from "an empty one", and null is the honest answer.
  */
  transcript_words       int generated always as (
    case
      when transcript is null or btrim(transcript) = '' then null
      else array_length(regexp_split_to_array(btrim(transcript), '\s+'), 1)
    end
  ) stored,

  /*
    Distinguishes the two empty states, which carry different sentences:
    "Deleted. The title, course and link are kept" versus "No transcript.
    Distil from your own notes." Without this they are indistinguishable.
  */
  transcript_deleted_at  timestamptz,

  /*
    The one manual extraction. Four of the five are derived from linked entries
    and cannot be gamed; nothing in the data distinguishes a "when not to use it"
    topic from any other, so this one is a tick and is labelled as the exception.
  */
  caveat_noted           boolean not null default false,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint sources_title_is_not_blank check (length(btrim(title)) > 0),
  -- An empty string is a lie the rest of the system then has to believe.
  constraint sources_course_is_not_blank check (course is null or length(btrim(course)) > 0),
  constraint sources_url_is_not_blank check (url is null or length(btrim(url)) > 0)
);

create index sources_user_created_idx on public.sources (user_id, created_at desc);

alter table public.sources enable row level security;

-- Four policies, one per command. `(select auth.uid())` rather than a bare call
-- so the planner evaluates it once per statement instead of per row.
create policy sources_select_own on public.sources
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy sources_insert_own on public.sources
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy sources_update_own on public.sources
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy sources_delete_own on public.sources
  for delete to authenticated
  using ((select auth.uid()) = user_id);

/*
  ── The link, and the rule the whole arc turns on ───────────────────────────
  A column rather than a join table: a topic has at most one source, and a join
  table would model a many-to-many the product does not have and the UI cannot
  express.

  ON DELETE SET NULL is the requirement stated as a constraint. Deleting a
  source keeps its topics — the entries stay and lose the line saying where they
  came from. That is the sentence the delete confirmation makes, so it has to be
  true of the database rather than of the application.

  `source_id` is deliberately NOT added to library_page or practice_ordered_page,
  and is omitted from the domain Topic in src/lib/data/topic-mapping.ts. That is
  what lets src/lib/domain/sources-boundary.test.ts forbid EVERY source column in
  a queue module with no exception — if the domain Topic carried it,
  TopicBoundaryIsSound would demand every read return it, including the queue's.
*/
alter table public.topics
  add column source_id uuid references public.sources(id) on delete set null;

create index topics_source_idx on public.topics (source_id) where source_id is not null;

/*
  Deliberately absent from this migration:

  - No change to `search_text` or its trigram index. The transcript is not on
    `topics`, so there is nothing to regenerate.
  - No change to library_page or practice_ordered_page. Their RETURNS TABLE
    contracts are untouched, which also avoids the drop-and-recreate the evidence
    arc needed and the silent-undefined bug that arc found the hard way.
  - No source-level confidence, no practice, no scheduling. A transcript is a
    document and is never practised.
*/
