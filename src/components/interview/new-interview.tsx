import { LinkButton } from '@/components/ui/link-button'

/**
 * "Start a new interview" — the way back to setup, wherever a round has ended.
 *
 * ── Why a component for two call sites ──────────────────────────────────────
 * The two are the scorecard and the room's abandoned state, and before this
 * they were two underlined links both reading "Set up another round". That is
 * one action wearing one name in two places, which is fine until the third
 * place spells it differently — the shape `back-to-library.tsx` exists to stop.
 * Making it a component now costs nothing and removes the drift by
 * construction rather than by everyone remembering.
 *
 * ── Why it overrules the reasoning that kept it off the scorecard ───────────
 * `scorecard.tsx` argued against "another round" as the scorecard's next
 * action, and that argument was RIGHT and still stands: a round is twenty to
 * forty-five minutes of continuous attention, nobody starts a second one on
 * finishing the first, and pushing one is the same mistake as resuming one.
 *
 * What it argued against is this being the PRIMARY action — the thing the page
 * steers you toward. It is not an argument for the round being unreachable, and
 * the two got conflated. Setup is also not a round: it is a page with three
 * choices and an `Enter the room` button, so arriving there commits to nothing
 * and costs nothing. A person who does want another one — tomorrow, or after a
 * coffee — should not have to go to the library and find their way back in.
 *
 * So it exists and it is secondary, sitting after "Practise what went weak",
 * which is the action the scorecard's own findings argue for.
 */
export function NewInterview() {
  return (
    <LinkButton href="/interview" data-testid="new-interview">
      Start a new interview
    </LinkButton>
  )
}
