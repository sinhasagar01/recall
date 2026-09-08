'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DIMENSIONS,
  offersFrom,
  scoreBand,
  type Length,
  type RoundCounts,
  type RoundType,
  type Scorecard,
} from '@/lib/domain/interview'
import { plural } from '@/lib/domain/plural'

/*
  The round's name as a person writes it. The stored value is a lowercase enum,
  and rendering it raw put "javascript · 20 minutes" in an h1 — caught by looking
  at the page beside the reference, which says "JavaScript · 45 minutes".
*/
const ROUND_LABEL: Record<RoundType, string> = {
  javascript: 'JavaScript',
  react: 'React',
  typescript: 'TypeScript',
  behavioural: 'Behavioural',
  mixed: 'Mixed',
}

/**
 * The scorecard. **It offers; you confirm.**
 *
 * ── Nothing here writes ─────────────────────────────────────────────────────
 * This component renders from a value it was handed and holds no database
 * client. The only write in the arc is `markWeak`, passed in and called when the
 * button is pressed — which is why "nothing touches confidence without a press"
 * is structural rather than careful, and why an assertion over this path can
 * prove it. Seen failing by putting an update on it.
 *
 * ── Counted beside judged, never mixed ──────────────────────────────────────
 * The four dimensions are the model's judgement of what was said. The stats row
 * is counted by `countRound` from the transcript. They sit next to each other
 * rather than being combined, so a wrong count is a visible disagreement rather
 * than a silently different number.
 *
 * ── The colour is a SCALE ───────────────────────────────────────────────────
 * `var(--volt)` and friends resolve only inside `[data-mode='interview']`. On any
 * other page these same classes paint nothing — measured, not assumed, in
 * `e2e/interview-scale.spec.ts`.
 */
export function Scorecard({
  scorecard,
  counts,
  roundType,
  minutes,
  elapsedSeconds,
  past,
  poolSize,
  onMarkWeak,
}: {
  scorecard: Scorecard
  counts: RoundCounts
  roundType: RoundType
  minutes: Length
  elapsedSeconds: number
  /** This round type's previous scores, oldest first. Numbers only — see below. */
  past: number[]
  /** How many topics the pool held, so the round can say what it did NOT ask. */
  poolSize: number
  onMarkWeak: (topicIds: string[]) => Promise<{ error: string | null; marked?: number }>
}) {
  const [offers, setOffers] = useState(() => offersFrom(scorecard))
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const ticked = offers.filter((offer) => offer.ticked)
  const overBy = Math.max(0, elapsedSeconds - minutes * 60)

  const press = async () => {
    setSaving(true)
    const result = await onMarkWeak(ticked.map((offer) => offer.topicId))
    setSaving(false)

    if (result.error !== null) {
      setError(result.error)
      return
    }
    setDone(`${plural(result.marked ?? 0, 'topic')} marked weak.`)
  }

  return (
    <main className="mx-auto max-w-[840px] px-6 py-8" data-testid="scorecard">
      <div className="flex flex-wrap items-center gap-6 rounded-xl border border-rule bg-surface p-6">
        <div
          data-testid="round-score"
          className="grid size-[104px] flex-none place-items-center rounded-full border-4 border-[var(--volt)] text-[var(--volt-ink)]"
        >
          <span className="font-display text-[32px] font-medium">{scorecard.overall}</span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-[var(--volt-ink)]">{scoreBand(scorecard.overall)}</p>
          <h1 className="mt-1 font-display text-[24px] font-medium">
            {ROUND_LABEL[roundType]} · {minutes} minutes
          </h1>
          <p className="mt-1.5 text-meta leading-[1.6] text-ink-2">{scorecard.summary}</p>

          {/* Counted, not judged. */}
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-3">
            <span data-testid="stat-answered">
              {counts.answered}/{counts.asked} answered
            </span>
            <span>
              {counts.followUpsHeld}/{counts.followUpsOffered} follow-ups held
            </span>
            <span>{plural(counts.questionsAsked, 'question')} asked</span>
            <span data-testid="stat-hints">{plural(counts.hintsUsed, 'hint')} used</span>
            {/* The clock's teeth: advisory during the round, recorded after it. */}
            {overBy > 0 ? (
              <span data-testid="stat-over">{Math.round(overBy / 60)} min over</span>
            ) : null}
          </p>
        </div>
      </div>

      <h2 className="mt-8 mb-3 font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
        Where the score came from
      </h2>
      <div className="grid gap-3 sm:grid-cols-2" data-testid="dimensions">
        {DIMENSIONS.map((dimension) => (
          <div
            key={dimension}
            data-testid={`dimension-${dimension}`}
            className="rounded-lg border border-rule bg-surface p-4"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-label font-medium capitalize">{dimension}</span>
              <span className="font-display text-[20px] font-medium">
                {scorecard.scores[dimension]}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <i
                className="block h-full rounded-full bg-[var(--volt)]"
                style={{ width: `${scorecard.scores[dimension]}%` }}
              />
            </div>
            <p className="mt-2 text-meta leading-[1.55] text-ink-2">{scorecard.notes[dimension]}</p>
          </div>
        ))}
      </div>

      {offers.length > 0 ? (
        <>
          <h2 className="mt-8 mb-3 font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
            What it wants to change — you decide
          </h2>

          <ul className="list-none rounded-lg border border-rule bg-surface px-4">
            {offers.map((offer, index) => (
              <li
                key={offer.topicId}
                data-testid="offer"
                data-ticked={offer.ticked}
                className="flex items-start gap-3.5 border-b border-rule py-3.5 last:border-b-0"
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={offer.ticked}
                  aria-label={`Mark ${offer.title} weak`}
                  onClick={() =>
                    setOffers((current) =>
                      current.map((item, position) =>
                        position === index ? { ...item, ticked: !item.ticked } : item,
                      ),
                    )
                  }
                  className="-m-[13px] mt-[-11px] grid size-[44px] flex-none cursor-pointer place-items-center rounded"
                >
                  <span
                    className={`grid size-[18px] place-items-center rounded border text-[10px] ${
                      offer.ticked ? 'border-ink bg-ink text-surface' : 'border-rule-strong'
                    }`}
                  >
                    {offer.ticked ? '✓' : ''}
                  </span>
                </button>

                <div className="min-w-0 flex-1">
                  <p className="text-body font-medium">{offer.title}</p>
                  <p className="mt-0.5 text-meta leading-[1.55] text-ink-2">{offer.note}</p>
                </div>
                <span className="flex-none font-mono text-[10.5px] text-ink-3">→ mark weak</span>
              </li>
            ))}
          </ul>

          {error ? (
            <p role="alert" className="mt-3 rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag">
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {done === null ? (
              <>
                <Button
                  variant="primary"
                  size="lg"
                  loading={saving}
                  loadingLabel="Marking…"
                  disabled={ticked.length === 0}
                  onClick={press}
                  data-testid="mark-weak"
                >
                  Mark the {ticked.length} selected weak
                </Button>
                <Button variant="ghost" onClick={() => setDone('Nothing was changed.')}>
                  Change nothing
                </Button>
                <span className="ml-auto font-mono text-[11px] text-ink-3">
                  Nothing is written until you press this
                </span>
              </>
            ) : (
              <p data-testid="offer-done" className="font-mono text-[11.5px] text-ink-2">
                {done}
              </p>
            )}
          </div>
        </>
      ) : null}

      {past.length > 0 ? (
        <>
          <h2 className="mt-8 mb-3 font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
            Your {ROUND_LABEL[roundType]} rounds
          </h2>
          {/*
            Numbers only, and that is the whole of what a past round keeps.

            The scorecard's prose — this summary, the dimension notes, the
            per-question notes — is model output rendered once and never written.
            A past round gives you its numbers, not its narrative, which is the
            price of not building the second library this product has refused for
            seven arcs. See the migration header.

            Your own scores. No benchmark, no percentile, nobody else.
          */}
          <div
            data-testid="sparkline"
            className="flex items-end gap-2 rounded-lg border border-rule bg-surface p-4"
          >
            {[...past, scorecard.overall].map((value, index, all) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-1.5">
                <i
                  className={`block w-full rounded-t ${
                    index === all.length - 1 ? 'bg-[var(--volt)]' : 'bg-[var(--volt-soft)]'
                  }`}
                  style={{ height: `${Math.max(4, value)}px` }}
                />
                <span className="font-mono text-[10px] text-ink-3">{value}</span>
              </div>
            ))}
          </div>
          {past.length > 0 ? (
            <p className="mt-2 font-mono text-[11px] text-ink-3" data-testid="versus-last">
              {scorecard.overall - past[past.length - 1] >= 0 ? '+' : ''}
              {scorecard.overall - past[past.length - 1]} vs last {ROUND_LABEL[roundType]}
            </p>
          ) : null}
        </>
      ) : null}

      {/*
        What it did NOT ask. Without this line, a score reads as a verdict on your
        JavaScript rather than on the questions that were actually asked.
      */}
      {poolSize > counts.asked ? (
        <p className="mt-8 rounded-lg border border-rule bg-surface px-4 py-3 text-meta text-ink-2" data-testid="not-asked">
          {plural(poolSize - counts.asked, 'topic')} were not reached in {minutes} minutes. A round
          is a sample, and {scorecard.overall} is a score for this round rather than for what you
          know.
        </p>
      ) : null}

      <p className="mt-8 border-t border-rule pt-4 text-meta leading-[1.7] text-ink-2">
        The score is about the round. {scorecard.overall} says how you did for {minutes} minutes on{' '}
        {plural(counts.asked, 'question')} — a real thing, worth improving. It is not a claim
        about what you know and it never writes to confidence; that still takes one press.
      </p>
    </main>
  )
}
