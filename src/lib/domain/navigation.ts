/**
 * The Apprenticeship group's destinations, in one place because there are two of
 * them.
 *
 * ── Why this is a function and not two literal arrays ───────────────────────
 * The rail (desktop) and the More sheet (mobile) render the same group, and
 * until now each held its own copy of the list. That duplication is exactly how
 * arc 7 shipped interview mode with no way to reach it: a destination added to
 * one surface and not the other looks finished on whichever screen you happen to
 * be using. One list, consumed twice, makes that failure impossible rather than
 * unlikely.
 *
 * ── Absent, not disabled ────────────────────────────────────────────────────
 * Interview mode exists only when a model key does. `hasKey()` is read on the
 * server and arrives here as a boolean, so the entry is **not in the list at
 * all** when there is no key — not present-and-greyed, which would advertise a
 * feature you cannot have. The route already answers `notFound()` in the same
 * case; this is the other half of the same rule, and the half arc 7 never built.
 *
 * The key itself never reaches this module or either component. Only the
 * boolean does — see `ai-boundary.test.ts`, which asserts the key is named in
 * exactly one file.
 */
export interface Destination {
  href: string
  label: string
  /**
   * `null` renders as nothing rather than as a zero.
   *
   * Today uses it for the day you have not started — a day with nothing written
   * is not a day you are failing at. Interview uses it permanently: see below.
   */
  count: string | null
}

export function apprenticeshipNav(input: {
  /** Today's `done / written`, or null before the browser knows the local date. */
  today: string | null
  phases: string
  ledger: string
  sources: string
  /** Whether a model key is configured. No key, no entry. */
  interview: boolean
}): Destination[] {
  return [
    /*
      Today first: it is the only one you open every morning.
    */
    { href: '/today', label: 'Today', count: input.today },

    /*
      Phases above Sources: a phase is what you are trying to become able to do,
      and a source is the raw material you do it with. The reference draws them
      in that order for the same reason. Nothing is inserted between them.
    */
    { href: '/phases', label: 'Phases', count: input.phases },
    { href: '/ledger', label: 'Ledger', count: input.ledger },
    { href: '/sources', label: 'Sources', count: input.sources },

    /*
      Interview last, and it reads as the sequence's end: what I am doing now,
      what I am becoming, what I have done, what I learned it from — and then
      whether any of it holds up under pressure.

      No count, deliberately. Every other entry's number comes from a read the
      layout already performs; a rounds-sat figure would add a seventh query to
      every page in the group for a number nobody acts on. The count exists on
      the scorecard, beside the past rounds it is compared against, which is
      where it means something.
    */
    ...(input.interview
      ? [{ href: '/interview', label: 'Interview', count: null } as Destination]
      : []),
  ]
}
