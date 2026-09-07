import { plural } from '@/lib/domain/plural'

/**
 * The project ledger.
 *
 * A record of what the capstone produced — decisions, PRs, diagrams, incidents,
 * milestones. **Links, not documents.** The thing lives where you made it; this
 * knows its title, its kind, its status, and which capability it serves.
 *
 * The ledger never contributes to whether a capability is demonstrated. That
 * stays recall plus evidence, exactly as arc 3 defined it: the product cannot
 * know whether you shipped what a URL points at, and a rule satisfiable with a
 * bookmark is not a rule.
 */

/**
 * Every column that would put a ledger item in front of the queue.
 *
 * Derived here rather than typed out in the test, so a rename cannot orphan
 * `ledger-boundary.test.ts`. `capability_id` is deliberately absent: it is
 * already forbidden in queue modules by `PHASE_COLUMNS`, and listing it twice
 * would mean two places to update when it changes.
 */
export const LEDGER_COLUMNS = ['project_items', "from('project_items')"] as const

export const KINDS = ['adr', 'task', 'diagram', 'incident', 'milestone', 'scale_exercise'] as const
export type Kind = (typeof KINDS)[number]

export const STATUSES = ['open', 'settled', 'retired'] as const
export type Status = (typeof STATUSES)[number]

export interface ProjectItem {
  id: string
  user_id: string
  kind: Kind
  title: string
  link: string | null
  note: string | null
  status: Status
  capability_id: string | null
  created_at: string
  updated_at: string
}

/** What each kind is called in the form and the filter chips. */
export const KIND_LABEL: Record<Kind, string> = {
  adr: 'ADR',
  task: 'Task',
  diagram: 'Diagram',
  incident: 'Incident',
  milestone: 'Milestone',
  scale_exercise: 'Scale exercise',
}

/**
 * One stored enum, six vocabularies.
 *
 * `open | settled | retired` is what the database holds; an ADR is *Decided*, a
 * task is *Done*, an incident is *Closed*. Three states is enough for every kind
 * — six would be a workflow.
 *
 * **In the domain**, beside `missingHalf` and `deletePhaseCopy`, for the same
 * reason those are: it is a rule stated in words, and a component that knew
 * "settled means Decided for an ADR" would be a second place the vocabulary
 * lives. Two copies of a vocabulary drift.
 *
 * `ledger-reference.html` defines four of the six on its States tab. The two it
 * omits are settled here:
 *
 *   * **milestone** — Planned / Reached / Dropped. "Reached" rather than
 *     "Achieved", and **"Dropped" rather than "Missed"**, because a missed
 *     milestone is the product working out that you are behind — the thing the
 *     free-text "When" rule on a phase exists to refuse. A ledger records what
 *     happened; it does not grade you against a plan.
 *   * **scale_exercise** — Open / Done / Dropped. It is work, so it borrows the
 *     task vocabulary rather than inventing a fifth one.
 */
const VOCABULARY: Record<Kind, Record<Status, string>> = {
  adr: { open: 'Draft', settled: 'Decided', retired: 'Superseded' },
  task: { open: 'Open', settled: 'Done', retired: 'Dropped' },
  diagram: { open: 'Draft', settled: 'Done', retired: 'Superseded' },
  incident: { open: 'Open', settled: 'Closed', retired: 'Dropped' },
  milestone: { open: 'Planned', settled: 'Reached', retired: 'Dropped' },
  scale_exercise: { open: 'Open', settled: 'Done', retired: 'Dropped' },
}

export function statusLabel(kind: Kind, status: Status): string {
  return VOCABULARY[kind][status]
}

/** The three choices, in this kind's words, for the add and edit form. */
export function statusChoices(kind: Kind): { status: Status; label: string }[] {
  return STATUSES.map((status) => ({ status, label: statusLabel(kind, status) }))
}

/**
 * What the delete confirmation says.
 *
 * Its job is to name what is **not** deleted. A ledger of links is the one place
 * in this product where a delete is nearly free, and the sentence should say so
 * rather than borrowing the gravity of deleting a topic.
 *
 * The second clause names the kind's own noun, so deleting an ADR does not say
 * "the item stays in your repo" when it means the ADR.
 */
const AT_THE_LINK: Record<Kind, string> = {
  adr: 'the ADR stays where you wrote it',
  task: 'the pull request stays open',
  diagram: 'the diagram stays where you drew it',
  incident: 'the issue stays where you filed it',
  milestone: 'nothing you shipped is affected',
  scale_exercise: 'the work stays where you did it',
}

export function deleteItemCopy(kind: Kind, hasLink: boolean): string {
  if (!hasLink) {
    // Nothing to reassure about — there is no link to leave untouched.
    return 'This removes the ledger entry. It can’t be undone.'
  }
  return `This removes the ledger entry. Nothing at the link is touched — ${AT_THE_LINK[kind]}. It can’t be undone.`
}

/** The list subtitle: "9 items · 4 open · newest first". */
export function ledgerSummary(items: Pick<ProjectItem, 'status'>[]): string {
  const open = items.filter((item) => item.status === 'open').length
  return `${plural(items.length, 'item')} · ${open} open · newest first`
}

/**
 * The kind chips, derived from what is actually there.
 *
 * The reference draws five because its sample has five kinds. Deriving them means
 * a Scale exercise chip appears when one exists rather than a dead chip reading
 * zero — the shape `categoryOptionsFromCounts` already established for the
 * library's category filter.
 */
export function kindChips(items: Pick<ProjectItem, 'kind'>[]): { kind: Kind; label: string; count: number }[] {
  return KINDS.map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    count: items.filter((item) => item.kind === kind).length,
  })).filter((chip) => chip.count > 0)
}
