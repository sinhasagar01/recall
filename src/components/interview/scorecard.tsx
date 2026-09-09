'use client'

import { useState } from 'react'
import { reask, scoreRewind } from '@/app/(interview)/interview/actions'
import { Button } from '@/components/ui/button'
import {
  canRewind,
  DIMENSIONS,
  offersFrom,
  scoreBand,
  type RewindResult,
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
 * ── Rewind writes NOTHING ───────────────────────────────────────────────────
 * Re-asking a question produces its own small result, which lives in the state
 * below and is written nowhere. The round row was inserted once, when the round
 * ended, and no path in the tree updates it — so a stored score cannot move
 * however many times a question is re-asked. Asserted by rewinding and comparing
 * the whole row byte for byte, and seen failing by putting an update on it.
 *
 * Three things stop a retry-until-it-improves, and only the last is a rule
 * anyone has to remember: the stored score cannot move, a question may be
 * re-asked once, and a round is never resumed — so this page does not exist
 * tomorrow.
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
  savedQuizzes,
  roundId,
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
  /** Questions kept as quizzes during the round. Titles only — the rows are real. */
  savedQuizzes: string[]
  /**
   * The row this scorecard was written from.
   *
   * Rendered as an attribute so a spec can read back **its own** round rather
   * than the newest one in the table. Three specs in `interview.spec.ts` finish
   * rounds and they do not run in one serial group, so "newest" is a channel
   * through which one test's round becomes another's assertion — the coupling
   * ARCHITECTURE.md warns about, arriving as a flake nobody could reproduce.
   */
  roundId: string | null
  onMarkWeak: (topicIds: string[]) => Promise<{ error: string | null; marked?: number }>
}) {
  /*
    Rewinds are keyed by the QUESTION's index, not the offer's. Offers are a
    filtered view — only questions carrying a topic id — so the two lists have
    different positions, and keying by the offer's would annotate the wrong row
    the moment a question came back without one.
  */
  const [rewinds, setRewinds] = useState<RewindResult[]>([])
  const rewound = new Set(rewinds.map((result) => result.questionIndex))

  /** The question currently being re-asked: its index, the new question, your reply. */
  const [asking, setAsking] = useState<{ index: number; question: string } | null>(null)
  const [reply, setReply] = useState('')
  const [rewinding, setRewinding] = useState(false)
  const [rewindError, setRewindError] = useState<string | null>(null)

  const beginRewind = async (index: number) => {
    const question = scorecard.questions[index]
    setRewinding(true)
    setRewindError(null)
    const result = await reask({ title: question.title, note: question.note })
    setRewinding(false)
    if (!result.ok) {
      setRewindError(result.reason)
      return
    }
    setReply('')
    setAsking({ index, question: result.question })
  }

  const finishRewind = async () => {
    if (asking === null) return
    setRewinding(true)
    const result = await scoreRewind({ question: asking.question, answer: reply })
    setRewinding(false)
    if (!result.ok) {
      setRewindError(result.reason)
      return
    }
    /*
      Straight into state, and nowhere else. There is no action that writes this
      and no column to write it to — which is the arc's hard rule, held
      structurally rather than by care.
    */
    setRewinds((current) => [
      ...current,
      {
        questionIndex: asking.index,
        question: asking.question,
        answer: reply,
        score: result.score,
        note: result.note,
      },
    ])
    setAsking(null)
  }

  const [offers, setOffers] = useState(() => offersFrom(scorecard))
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /*
    `ticked` is state — you may have changed it — but `rewound` is derived, so the
    two are merged rather than the offers being rebuilt. Rebuilding would throw
    away every checkbox you had touched the moment a rewind finished.
  */
  const shown = offers.map((offer, index) => ({
    ...offer,
    rewound: offersFrom(scorecard, rewound)[index]?.rewound ?? false,
  }))

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
    <main
      className="mx-auto max-w-[840px] px-6 py-8"
      data-testid="scorecard"
      data-round-id={roundId ?? undefined}
    >
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

      {scorecard.questions.length > 0 ? (
        <>
          <h2 className="mt-8 mb-3 font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
            Question by question
          </h2>
          <ul className="list-none rounded-lg border border-rule bg-surface px-4">
            {scorecard.questions.map((question, index) => {
              const again = rewinds.find((result) => result.questionIndex === index)

              return (
                <li
                  key={index}
                  data-testid="question-row"
                  className="border-b border-rule py-3.5 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-body font-medium">{question.title}</p>
                      <p className="mt-0.5 text-meta leading-[1.55] text-ink-2">{question.note}</p>
                      {/*
                        Said, not swallowed. A question the model could not tie to
                        a saved topic still scores — but it cannot appear in the
                        offers below, because there is no row to mark weak. A
                        question that vanishes from that list for a reason nobody
                        can see is worse than one that admits what it does not
                        know.
                      */}
                      {question.topicId === null ? (
                        <p
                          data-testid="unattributed"
                          className="mt-1 font-mono text-[11px] text-ink-3"
                        >
                          Couldn’t tell which of your topics this came from, so it isn’t offered below
                        </p>
                      ) : null}
                    </div>
                    <div className="h-1.5 w-[120px] flex-none overflow-hidden rounded-full bg-surface-2">
                      <i
                        className="block h-full rounded-full bg-[var(--volt)]"
                        style={{ width: `${question.score}%` }}
                      />
                    </div>
                    <span className="w-8 flex-none text-right font-display text-[18px] font-medium">
                      {question.score}
                    </span>

                    {/*
                      Removed, never disabled — DESIGN.md's rule that an option
                      stops being a button rather than becoming a dead one.
                      Offered below OFFER_BELOW, which is why the reference draws
                      Rewind on the 41 and the 33 and not on the 64.
                    */}
                    {canRewind(question.score, rewound.has(index)) && asking === null ? (
                      <Button
                        variant="ghost"
                        loading={rewinding}
                        loadingLabel="Asking…"
                        onClick={() => beginRewind(index)}
                        data-testid="rewind"
                      >
                        Rewind
                      </Button>
                    ) : null}
                  </div>

                  {asking?.index === index ? (
                    <div data-testid="rewind-room" className="mt-3 rounded-md border border-[var(--volt)] bg-[var(--volt-soft)] px-4 py-3">
                      <p className="text-body leading-[1.5] font-medium">{asking.question}</p>
                      <textarea
                        aria-label="Your answer"
                        value={reply}
                        onChange={(event) => setReply(event.target.value)}
                        rows={3}
                        className="mt-2.5 w-full rounded-md border border-rule-strong bg-surface px-3 py-2 text-meta leading-[1.6] text-ink focus:border-accent focus:outline-2 focus:outline-accent"
                      />
                      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
                        <Button
                          variant="primary"
                          loading={rewinding}
                          loadingLabel="Scoring…"
                          disabled={reply.trim() === ''}
                          onClick={finishRewind}
                          data-testid="rewind-answer"
                        >
                          Answer
                        </Button>
                        <Button variant="ghost" disabled={rewinding} onClick={() => setAsking(null)}>
                          Leave it
                        </Button>
                        <span className="font-mono text-[11px] text-ink-3">
                          This does not change your {scorecard.overall}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {again ? (
                    <p
                      data-testid="rewind-result"
                      className="mt-2.5 border-l-2 border-[var(--volt)] pl-3 text-meta leading-[1.55] text-ink-2"
                    >
                      <span className="font-mono text-[11px] text-[var(--volt-ink)]">
                        Rewound · {again.score} · not counted
                      </span>
                      <br />
                      {again.note}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>

          {rewindError ? (
            <p role="alert" className="mt-3 rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag">
              {rewindError}
            </p>
          ) : null}

          <p className="mt-2.5 text-meta leading-[1.6] text-ink-3">
            Rewind re-asks that one question now, while it is fresh. It produces its own small
            result and <strong className="font-medium text-ink-2">never changes the {scorecard.overall}</strong> — a score you
            can retry until it improves is not a score.
          </p>
        </>
      ) : null}

      {offers.length > 0 ? (
        <>
          <h2 className="mt-8 mb-3 font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
            What it wants to change — you decide
          </h2>

          <ul className="list-none rounded-lg border border-rule bg-surface px-4">
            {shown.map((offer, index) => (
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
                  {/*
                    A rewind is shown here and changes nothing here. The tick still
                    comes from the score the ROUND found; going back afterwards is
                    information you now have, and the decision stays yours.
                  */}
                  {offer.rewound ? (
                    <p data-testid="offer-rewound" className="mt-1 font-mono text-[11px] text-[var(--volt-ink)]">
                      You re-asked this one afterwards
                    </p>
                  ) : null}
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

      {savedQuizzes.length > 0 ? (
        <>
          <h2 className="mt-8 mb-3 font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
            Saved from the round
          </h2>
          <div
            data-testid="saved-from-round"
            className="rounded-lg border border-rule bg-surface p-5 text-meta leading-[1.7] text-ink-2"
          >
            <strong className="font-medium text-ink">
              {plural(savedQuizzes.length, 'quiz', 'quizzes')}
            </strong>{' '}
            — {savedQuizzes.map((title) => `"${title}"`).join(', ')}, saved during the round from a
            follow-up. {savedQuizzes.length === 1 ? 'It is' : 'They are'} in your library, linked to
            the topic {savedQuizzes.length === 1 ? 'it' : 'they'} came from, and already in the
            practice queue.
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
