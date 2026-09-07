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
 * A phase delete touches **three** things, and the sentence has to cover all
 * three: the phase and its capabilities die, and both the linked topics and the
 * linked ledger entries survive, each losing the line saying which capability it
 * served. An earlier version named only the topics — true, but incomplete once
 * the ledger arrived, and an incomplete reassurance is the kind that gets found
 * out the first time someone checks.
 *
 * Domain copy for the reason `missingHalf` and `deleteItemCopy` are: the sentence
 * makes a promise the schema keeps (`on delete cascade` to capabilities, `on
 * delete set null` to both the topics and the ledger entries), and the two must
 * not drift.
 *
 * Note the wording: "ledger entries", not the table's name. `ledger-boundary.test.ts`
 * forbids this module from naming that table at all, and caught the first draft of
 * this comment doing it. A mention-guard is blunt on purpose — "it is only a
 * comment" is how the first real reference arrives.
 *
 * ── The zero cases, which are the whole difficulty ──────────────────────────
 * Each half disappears independently. "The 0 topics stay in your library" is a
 * claim about nothing, and so is its ledger twin — so a count of zero contributes
 * no clause at all, and zero of both contributes no sentence. That means
 * 1 topic / 0 items and 0 topics / 1 item are different sentences, not the same
 * sentence with a number swapped.
 *
 * Agreement is over the TOTAL that survives, not over either count: one topic and
 * one entry is two things, and two things stay rather than stays.
 */
export function deletePhaseCopy(
  capabilityCount: number,
  topicCount: number,
  itemCount: number = 0,
): { removes: string; kept: string } {
  const removes =
    capabilityCount === 0
      ? 'This removes the phase. It has no capabilities yet'
      : `This removes the phase and its ${plural(capabilityCount, 'capability', 'capabilities')}`

  const surviving = topicCount + itemCount
  if (surviving === 0) {
    return { removes, kept: '' }
  }

  const parts: string[] = []
  const places: string[] = []
  if (topicCount > 0) {
    parts.push(plural(topicCount, 'topic'))
    places.push('library')
  }
  if (itemCount > 0) {
    parts.push(plural(itemCount, 'ledger entry', 'ledger entries'))
    places.push('ledger')
  }

  const one = surviving === 1
  const kept =
    `The ${parts.join(' and ')} linked to ${capabilityCount === 1 ? 'it' : 'them'} ` +
    `${one ? 'stays' : 'stay'} in your ${places.join(' and ')} — ` +
    `${one ? 'it loses' : 'they lose'} the line saying which capability ` +
    `${one ? 'it serves' : 'they serve'}`

  return { removes, kept }
}
