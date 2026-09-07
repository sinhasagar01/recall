import { plural } from '@/lib/domain/plural'
import type { Topic } from '@/lib/domain/types'

/**
 * Phases and capabilities.
 *
 * A phase is a stretch of weeks and the handful of things you will be able to do
 * at the end of it. A capability is one of those things, written as an ability.
 *
 * A capability is **demonstrated by evidence, never by a tick.** Nothing in this
 * module writes a boolean, and there is no column for one to write to — see
 * supabase/tests/phases_test.sql, which asserts the exact column set of both
 * tables so a stored `demonstrated` cannot be added quietly.
 */

/**
 * Every column that would put a phase or a capability in front of the queue.
 *
 * Derived here rather than typed out in the test, so a rename cannot orphan
 * `phases-boundary.test.ts`. `capability_id` is on the `topics` row; `phase_id`
 * is how a capability finds its phase; the two table names are what a join would
 * have to say out loud.
 */
export const PHASE_COLUMNS = [
  'capability_id',
  'phase_id',
  "from('phases')",
  "from('capabilities')",
] as const

export interface Phase {
  id: string
  user_id: string
  name: string
  /** Free text — "Weeks 1-2". Never a date, and never parsed as one. */
  when_text: string | null
  /** Free text — what you are learning from. Not a course list. */
  sources_text: string | null
  created_at: string
  updated_at: string
}

export interface Capability {
  id: string
  user_id: string
  phase_id: string
  name: string
  created_at: string
  updated_at: string
}

/** Confidences that count as "okay or better" for the recall half. */
const RECALL_SUFFICIENT: ReadonlySet<string> = new Set(['okay', 'strong'])

export interface Demonstration {
  demonstrated: boolean
  /** Something linked is at okay or better on recall. */
  recall: boolean
  /** Something linked carries rebuild, challenge or production evidence. */
  evidence: boolean
  linked: number
  topics: number
  quizzes: number
  /** How many linked rows are at okay or better, for the evidence line. */
  atOkayOrBetter: number
  /** Which evidence markers appear across the linked topics, in fixed order. */
  markers: EvidenceMarker[]
}

export type EvidenceMarker = 'rebuild' | 'challenge' | 'production'

const MARKERS: readonly EvidenceMarker[] = ['rebuild', 'challenge', 'production']

/**
 * Whether a capability is demonstrated, and why or why not.
 *
 * **Two halves, both required.** Something linked is at okay or better on recall,
 * AND something linked carries rebuild, challenge or production evidence. That is
 * the rule: recall evidence plus a rebuild, challenge or capstone decision.
 *
 * ── The kind filter on the evidence half is load-bearing ────────────────────
 * A quiz is a row in `topics`, so it can be linked to a capability and can
 * satisfy the RECALL half. It can never satisfy the evidence half: `takesEvidence`
 * is `kind === 'topic'` and `topics_evidence_is_consistent` refuses those columns
 * on a quiz outright. Filtering here says that in the rule rather than depending
 * on a database constraint to make it accidentally true.
 *
 * Takes the already-loaded linked rows rather than querying, so the rule is a
 * pure function and the data layer decides how to fetch them — the shape
 * `extractionsFor` established in arc 2.
 */
export function demonstrationOf(linked: Topic[]): Demonstration {
  const topics = linked.filter((entry) => entry.kind === 'topic')
  const quizzes = linked.filter((entry) => entry.kind === 'quiz')

  const atOkayOrBetter = linked.filter((entry) => RECALL_SUFFICIENT.has(entry.confidence))

  /*
    `topics`, not `linked`, and that is the rule rather than an optimisation.

    A quiz IS a row in `topics`, so it can be linked to a capability and can
    satisfy the recall half above. It can never satisfy this half: `takesEvidence`
    is `kind === 'topic'`, and the `topics_evidence_is_consistent` constraint
    refuses rebuild/challenge/production on a quiz outright — a linked quiz's
    markers are always null.

    So filtering here changes no result today. It is here so the rule states its
    own condition instead of being accidentally true because of a constraint in
    another file, which the next reader cannot check without leaving this one. If
    that constraint is ever relaxed, this line is what keeps "you have built with
    it" meaning a thing you built.
  */
  const markers = MARKERS.filter((marker) =>
    topics.some((entry) => entry[`${marker}_at` as const] !== null),
  )

  const recall = atOkayOrBetter.length > 0
  const evidence = markers.length > 0

  return {
    demonstrated: recall && evidence,
    recall,
    evidence,
    linked: linked.length,
    topics: topics.length,
    quizzes: quizzes.length,
    atOkayOrBetter: atOkayOrBetter.length,
    markers,
  }
}

/**
 * Why a capability is not demonstrated, in the words of the rule.
 *
 * Domain copy rather than component copy, for the reason `deleteSourceCopy` is:
 * it is a rule stated in words, and the rule and the sentence must not drift.
 *
 * The two middle cases are the point of the whole screen — the same unchecked
 * box, two opposite reasons, and each names which half is missing. "You can say
 * it, but you have not built with it" and "You have built with it, but you cannot
 * say it cold" are opposite instructions, and a bare unchecked box gives neither.
 *
 * Returns null when demonstrated, and null when nothing is linked: an empty
 * capability has no diagnosis to offer, only an absence the evidence line already
 * shows.
 */
export function missingHalf(demonstration: Demonstration): string | null {
  const { demonstrated, recall, evidence, linked } = demonstration

  if (demonstrated || linked === 0) return null

  if (!recall && !evidence) {
    return 'Not demonstrated: nothing linked is at okay or better, and nothing carries evidence.'
  }
  if (recall) return 'Not demonstrated: you can say it, but you have not built with it.'
  return 'Not demonstrated: you have built with it, but you cannot say it cold.'
}

/**
 * The phase you are in.
 *
 * **The earliest phase not fully demonstrated.** Derived, never stored, and never
 * a date: it changes when evidence changes and at no other time, which is the
 * rule this whole screen exists to hold. Nothing here moves because a week
 * passed.
 *
 * Null when every phase is fully demonstrated — and null is a real state, not an
 * oversight. A phase with no capabilities counts as not-fully-demonstrated: you
 * have arrived and not yet written down what you are there to learn, which is
 * exactly when the marker is most useful.
 *
 * Takes phases in creation order; the caller supplies that ordering, because
 * "earliest" is the list's order and the list is what the reader sees.
 */
export function currentPhaseId(
  phasesInOrder: { id: string; capabilities: Demonstration[] }[],
): string | null {
  const unfinished = phasesInOrder.find(
    (phase) =>
      phase.capabilities.length === 0 ||
      phase.capabilities.some((capability) => !capability.demonstrated),
  )

  return unfinished?.id ?? null
}

/**
 * What the delete confirmation says.
 *
 * Two counts and a verb that has to agree with the second of them — the exact
 * defect arc 2 shipped ("The 1 entry you distilled from it stay in your
 * library"). Domain copy for the same reason as `deleteSourceCopy`: the sentence
 * makes a promise the schema keeps (`on delete cascade` to capabilities,
 * `on delete set null` to topics), and the two must not drift.
 *
 * Zero linked topics is not a smaller version of the sentence — "The 0 topics
 * linked to them stay in your library" is a claim about nothing — so it gets no
 * consequence clause at all.
 */
export function deletePhaseCopy(
  capabilityCount: number,
  topicCount: number,
): { removes: string; kept: string } {
  const removes =
    capabilityCount === 0
      ? 'This removes the phase. It has no capabilities yet'
      : `This removes the phase and its ${plural(capabilityCount, 'capability', 'capabilities')}`

  if (topicCount === 0) {
    return { removes, kept: '' }
  }

  const subject = topicCount === 1 ? 'It loses' : 'They lose'
  const possessive = topicCount === 1 ? 'it serves' : 'they serve'

  return {
    removes,
    kept: `The ${plural(topicCount, 'topic', 'topics')} linked to ${
      capabilityCount === 1 ? 'it' : 'them'
    } ${topicCount === 1 ? 'stays' : 'stay'} in your library — ${subject.toLowerCase()} the line saying which capability ${possessive}`,
  }
}
