-- Arc 7, session two-a — a quiz remembers the topic it came out of.
--
-- A follow-up you could not answer can be saved as a quiz during a round. The
-- reference says it lands in your library "linked to the same topic", and until
-- now there was nothing to link with: `topics` had three foreign keys and all of
-- them pointed at other entities — auth.users, sources, capabilities.
--
-- ── Why a column and not inheritance ────────────────────────────────────────
-- The first plan inherited the parent's category, source and tags and called
-- that the link. It is not one. It is a shelf position: it puts the quiz beside
-- the topic under the same filters, and answers "what else is in this category"
-- rather than "where did this come from". The question worth being able to ask
-- is the second one, and only a referent can answer it.
--
-- The inheritance stays as well. The two do different jobs: the column is the
-- provenance, the inherited fields are how it lands in the right filters.
--
-- ── ON DELETE SET NULL, and this direction is a decision ────────────────────
-- The first self-reference on this table, so the cascade could not be inherited
-- from a sibling and had to be chosen.
--
-- Deleting the topic a quiz came from KEEPS the quiz and drops the line. A quiz
-- is a thing you chose to save and can answer standing alone; the parent is
-- provenance, and provenance going stale is not a reason to destroy the thing it
-- describes. Cascade would make tidying your library silently delete questions
-- you had been practising — the same argument `capability_id` and `source_id`
-- already settled the same way, which is why this matches them rather than
-- introducing a third behaviour for a reader to keep track of.
--
-- ── Off the domain Topic ────────────────────────────────────────────────────
-- Like `source_id` and `capability_id` and unlike `extracted`. See
-- topic-mapping.ts, which carries the reasoning and states which kind of
-- omission it is.

alter table public.topics
  add column parent_topic_id uuid references public.topics (id) on delete set null;

/*
  No index.

  Deliberate, and stated so it is a decision rather than an oversight: nothing
  queries "every quiz whose parent is X" — the one read is a single lookup BY id
  of the parent, from a quiz that already holds it, which uses the primary key.
  An index here would be write cost for a query that does not exist. It becomes
  worth adding the day something lists a topic's derived quizzes.
*/

/*
  Not added to topics_shape_is_consistent.

  That constraint governs the topic/quiz content shape — definition, options,
  correct index, image. A parent is orthogonal: a topic may have one, a quiz may
  have one, and neither is required to. Folding it in would make one CASE report
  two unrelated rules, which is exactly what the evidence arc refused when it
  added a SIBLING constraint rather than editing this one.
*/
