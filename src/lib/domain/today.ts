import { plural } from '@/lib/domain/plural'

/**
 * Today.
 *
 * Three things you type each morning — one to explain, one to rebuild, one to
 * apply — plus a blocker. Free text, by hand. Nothing derived, nothing suggested,
 * nothing scheduled.
 *
 * The one derived thing on the page is the practice line, and every number on it
 * links through to what it counts. There is deliberately no carry count, no
 * streak and no completion rate — see `days_test.sql`, which asserts the exact
 * column set so none of them can be added quietly.
 */

/**
 * Every name that would put a day in front of the queue.
 *
 * Derived here rather than typed out in the test, so a rename cannot orphan
 * `today-boundary.test.ts`.
 *
 * Deliberately NOT the bare word `days`. It is ordinary English — the weak page
 * says "practiced in 60 days" — so a mention-guard on it reports a violation the
 * first time a sentence contains it. A guard that cries wolf is a guard someone
 * turns off, which is worse than not having one.
 *
 * These are the names a module would actually have to write to read a day's
 * contents: the table as it is addressed, and the columns that only exist here.
 */
export const TODAY_COLUMNS = [
  "from('days')",
  'public.days',
  'explain_done',
  'rebuild_done',
  'apply_done',
  'blocker_text',
  'blocker_resolved_at',
] as const

/** The three slots, in the order they are always shown. */
export const INTENTIONS = ['explain', 'rebuild', 'apply'] as const
export type Intention = (typeof INTENTIONS)[number]

/**
 * What each slot asks for.
 *
 * Three lines is the shape of a day whether or not you filled all three — an
 * empty slot keeps its place and its label, because collapsing to two would make
 * a missing decision invisible.
 */
export const INTENTION_LABEL: Record<Intention, string> = {
  explain: 'Explain',
  rebuild: 'Rebuild',
  apply: 'Apply',
}

export const INTENTION_PLACEHOLDER: Record<Intention, string> = {
  explain: 'What will you be able to explain by tonight?',
  rebuild: 'What will you write from memory?',
  apply: 'What decision will your capstone need?',
}

export interface Day {
  id: string
  user_id: string
  /** The user's LOCAL date as `YYYY-MM-DD`. Never derived on the server. */
  day: string
  explain_text: string | null
  explain_done: boolean
  rebuild_text: string | null
  rebuild_done: boolean
  apply_text: string | null
  apply_done: boolean
  blocker_text: string | null
  blocker_resolved_at: string | null
  created_at: string
  updated_at: string
}

export const textOf = (day: Day | null, slot: Intention): string | null =>
  day === null ? null : day[`${slot}_text` as const]

export const doneOf = (day: Day | null, slot: Intention): boolean =>
  day === null ? false : day[`${slot}_done` as const]

/**
 * Yesterday's unticked lines, as text to prefill today's inputs with.
 *
 * **Prefill, not carry.** These arrive as editable text with a Clear button and
 * are not written until you press Save. Automatic carry-forward is how a to-do
 * list grows a backlog you stop reading; prefilling makes you look at it once a
 * day and decide again.
 *
 * A ticked line contributes nothing — it is finished, and offering it back would
 * be asking you to do it twice. A day with no row contributes nothing either.
 *
 * Deliberately returns only the text. There is no count of how many days a line
 * has been carried, because there is no lineage stored to count and "2 days" is a
 * number whose only job is to say you are behind — which the free-text "When"
 * rule and the no-streak rule both refuse.
 */
export function prefillFrom(yesterday: Day | null): Record<Intention, string> {
  const empty = { explain: '', rebuild: '', apply: '' }
  if (yesterday === null) return empty

  return INTENTIONS.reduce((prefill, slot) => {
    const text = textOf(yesterday, slot)
    const unfinished = text !== null && !doneOf(yesterday, slot)
    return { ...prefill, [slot]: unfinished ? text : '' }
  }, empty)
}

/** How many of the written lines are ticked — the rail's "1 / 3". */
export function dayCounts(day: Day | null): { written: number; done: number } {
  const written = INTENTIONS.filter((slot) => textOf(day, slot) !== null)
  return {
    written: written.length,
    done: written.filter((slot) => doneOf(day, slot)).length,
  }
}

/**
 * Whether a day may still be edited.
 *
 * Earlier days are read-only. Ticking Thursday's box from Sunday's chair is
 * writing history rather than recording it, and the log is only worth reading if
 * it says what actually happened.
 *
 * Takes both dates as strings so nothing here reads a clock — the caller supplies
 * today, computed once in the browser by `localDateString`.
 */
export function isEditable(day: string, today: string): boolean {
  return day === today
}

/**
 * What the page says about a blocker carried from an earlier day.
 *
 * Domain copy, beside the other rules stated in words. The oldest open blocker is
 * the one shown, because a problem written on Friday and forgotten by Monday is
 * the failure the field exists to prevent — the oldest is the one most at risk.
 *
 * If more are open, the count is mentioned and not listed. Listing them would
 * rebuild the accumulating backlog the prefill rule already refuses.
 */
export function openBlockerCopy(writtenOn: string, othersOpen: number): string {
  const others =
    othersOpen === 0
      ? ''
      : ` · ${plural(othersOpen, 'other blocker', 'other blockers')} still open`
  return `Written ${writtenOn} · still open${others}`
}
