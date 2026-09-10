-- Issue #20 — keep what you wrote from memory.
--
-- The practice card asks you to write what you remember, shows it back for the
-- length of one screen, and throws it away. The topic detail page has a section
-- already called "Recall history" containing three scalars and no history.
--
-- The latest attempt, overwritten each time. Not an append-only array: the open
-- questions that shape carried — retention, what twenty of them look like on the
-- page, an unbounded document on a row the library reads — were the tell that
-- the history was carrying cost without a named use. Latest-only answers them by
-- not having them.

alter table public.topics
  add column last_recall text,
  add column last_recall_at timestamptz;

comment on column public.topics.last_recall is
  'What you wrote from memory in the practice card, most recent only. Overwritten on a graded attempt with text in it; never cleared by an empty one.';

comment on column public.topics.last_recall_at is
  'When last_recall was written. Its own column deliberately — see the migration header.';

/*
  ── Why two columns and not one ─────────────────────────────────────────────
  A single text field would take its date from `last_practiced_at`, which is
  written in the same UPDATE and would be the same instant.

  That is correct exactly while the two are always written together — and the
  rule this feature needs breaks that: an attempt with nothing in it does not
  overwrite a stored one, because an empty attempt is the absence of an
  explanation rather than a new one. From that moment `last_practiced_at` can
  belong to a later practice than the text beside it, and the page says "this is
  what you said last time" about something you said two times ago.

  Nothing would break. The date is real, the text is real, and only the pairing
  between them is false — which is why this is eight bytes rather than an
  argument.

  ── And no constraints, on purpose ──────────────────────────────────────────
  No length CHECK, and nothing coupling the two columns. Both are written in the
  same statement that moves confidence and `practice_count`, so a constraint the
  prose could violate is the one way a grade could be lost to an attempt. The
  text has no invariant worth a constraint: it is whatever you managed to
  remember, and being wrong is the point of keeping it.

  Any cap belongs in the client, where exceeding it is something you can see
  before you press rather than a rejected write afterwards.

  ── Not on the queue ────────────────────────────────────────────────────────
  `practice_ordered_page` declares its `returns table` as a list rather than
  `t.*`, so this column does not reach the queue by being added here, and the
  domain's `QueueTopic` does not carry it. A recall attempt is exactly what a
  future "you wrote nothing last time, show it sooner" ordering would reach for,
  and that would order the queue by something other than confidence.
*/
