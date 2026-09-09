'use client'

import Link from 'next/link'
import { useState } from 'react'
import { reask, scoreRewind } from '@/app/(interview)/interview/actions'
import { Button } from '@/components/ui/button'
import { BackToLibrary } from '@/components/ui/back-to-library'
import { NewInterview } from '@/components/interview/new-interview'
import {
  canRewind,
  clockOf,
  DIMENSIONS,
  METER_SEGMENTS,
  meterSegments,
  ROUND_LABEL,
  scoreTone,
  sparkLabel,
  offersFrom,
  scoreBand,
  type RewindResult,
  type Dimension,
  type Length,
  type Level,
  type RoundCounts,
  type RoundType,
  type Scorecard,
} from '@/lib/domain/interview'
import { plural } from '@/lib/domain/plural'

/**
 * One complete class string per dimension, so Tailwind's scanner sees a name it
 * can emit. Presentational, so it stays here rather than in `lib/domain` — that
 * file holds rules and no Tailwind.
 */
const HUE: Record<Dimension, string> = {
  recall: '[--h:var(--mint)] [--h2:var(--emerald)]',
  depth: '[--h:var(--rose)] [--h2:var(--pink)]',
  precision: '[--h:var(--volt)] [--h2:var(--indigo)]',
  enquiry: '[--h:var(--teal)] [--h2:var(--teal-2)]',
}

/** The 0–100 scale in three bands: emerald, violet, rose. */
const TONE = {
  hi: { bar: '[background:var(--g-hi)]', ink: 'text-[var(--mint)]' },
  mid: { bar: '[background:var(--g-mid)]', ink: 'text-[var(--volt)]' },
  lo: { bar: '[background:var(--g-lo)]', ink: 'text-[var(--rose)]' },
}

const LEVEL_WORDS: Record<Level, string> = {
  friendly: 'friendly senior',
  staff: 'staff, terse',
  skeptical: 'skeptical principal',
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
  code = [],
  minutes,
  level,
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
  /** DSA only: the solutions, index-aligned with the question rows. */
  code?: string[]
  minutes: Length
  /** Named in the eyebrow — the round is "JavaScript · 45 minutes · staff, terse". */
  level: Level
  elapsedSeconds: number
  /**
   * This round type's previous rounds, oldest first.
   *
   * The date comes with the score because the sparkline labels its columns —
   * `pastRounds` already selects `created_at` and the page was discarding it.
   */
  past: { overall: number; created_at: string }[]
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
  /** How many the press actually marked — 0 after "Change nothing". */
  const [marked, setMarked] = useState(0)
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

  /*
    Past rounds plus this one. `created_at` for the current round is stamped
    here rather than read back — the row was just written and re-reading it to
    label a column would be a query for a date we already know.
  */
  const today = new Date()
  const rounds = [...past, { overall: scorecard.overall, created_at: today.toISOString() }]

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
    setMarked(result.marked ?? 0)
    setDone(`${plural(result.marked ?? 0, 'topic')} marked weak.`)
  }

  return (
    <main
      className="mx-auto max-w-[1020px] px-[26px] pt-7 pb-20"
      data-testid="scorecard"
      data-round-id={roundId ?? undefined}
    >
      {/*
        ── The hero, and what it is NOT ───────────────────────────────────────
        No SVG and no conic gradient. A ring built from `conic-gradient` rendered
        as a black disc twice before; the figure here is a 116px numeral with a
        gradient clipped to its glyphs, over a twenty-segment meter. Both are
        ordinary boxes.
      */}
      <div className="relative overflow-hidden rounded-[22px] text-[var(--sc-ink)] [background:var(--sc-hero),var(--sc-base)] [box-shadow:var(--sc-shadow)]">
        {/* Two decorative layers, as elements — the repo uses no ::before utilities. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 [background:var(--sc-sheen)]" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-[140px] -right-[90px] size-[420px] rounded-full [background:var(--sc-blob)]"
        />

        <div className="relative z-[1] px-[34px] pt-[30px] pb-[26px]">
          <div className="flex flex-wrap items-center gap-3.5">
            <span
              data-testid="scorecard-eyebrow"
              className="font-mono text-[10px] tracking-[0.17em] text-[var(--sc-eyebrow)] uppercase"
            >
              {ROUND_LABEL[roundType]} <em className="text-[var(--sc-ink-3)] not-italic">·</em>{' '}
              {minutes} minutes <em className="text-[var(--sc-ink-3)] not-italic">·</em>{' '}
              {LEVEL_WORDS[level]} <em className="text-[var(--sc-ink-3)] not-italic">·</em>{' '}
              {sparkLabel(today.toISOString(), today) === 'today'
                ? `${today.getDate()} ${today.toLocaleString('en-GB', { month: 'short' })}`
                : ''}
            </span>
            <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-[var(--band-line)] bg-[var(--band-soft)] px-[13px] py-[5px] font-mono text-[10px] tracking-[0.14em] text-[var(--band)] uppercase">
              ◆ {scoreBand(scorecard.overall)}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-end gap-5">
            <span className="flex flex-none items-end gap-2.5">
              <span
                data-testid="round-score"
                className="bg-clip-text font-display text-[84px] leading-[0.82] font-semibold tracking-[-0.05em] text-transparent [background-image:var(--sc-num)] [filter:var(--sc-num-glow)] [-webkit-background-clip:text] md:text-[116px]"
              >
                {scorecard.overall}
              </span>
              <span className="pb-3.5 font-mono text-[12.5px] tracking-[0.06em] text-[var(--sc-ink-3)]">
                / 100
              </span>
            </span>

            <div className="min-w-[250px] flex-1 pb-1.5">
              <h1 className="font-display text-[26px] leading-[1.24] font-medium tracking-[-0.022em] text-white">
                {scorecard.verdict}
              </h1>
              {scorecard.summary ? (
                <p className="mt-2 max-w-[44ch] text-[14px] leading-[1.62] text-[var(--sc-ink-2)]">
                  {scorecard.summary}
                </p>
              ) : null}
            </div>
          </div>

          {/* Twenty segments, one per five points. The number beside it is the accessible value. */}
          <div className="mt-[26px] flex gap-[3px]" aria-hidden="true">
            {meterSegments(scorecard.overall).map((segment, index) => (
              <i
                key={index}
                data-lit={segment.on}
                className={`h-[9px] flex-1 rounded-[2px] ${
                  !segment.on
                    ? 'bg-[var(--sc-track)]'
                    : index < METER_SEGMENTS / 2
                      ? '[background:var(--meter-lo)]'
                      : '[background:var(--meter-hi)]'
                } ${segment.tip ? '[box-shadow:var(--meter-tip)]' : ''}`}
              />
            ))}
          </div>
          <div className="mt-2.5 flex justify-between font-mono text-[9.5px] tracking-[0.08em] text-[var(--sc-ink-3)]">
            <span>0</span>
            <span>
              <b className="font-medium text-[var(--sc-ink-2)]">{scorecard.overall}</b> this round
            </span>
            <span>100</span>
          </div>
        </div>

        {/*
          Counted, never judged — and the card's own foot rather than a line of
          prose under it. These come from `countRound` over the transcript; the
          four dimensions below come from the model. They sit apart so a wrong
          count is a visible disagreement rather than a silently different number.
        */}
        <div className="relative z-[1] flex flex-wrap border-t border-[var(--sc-stats-line)] bg-[var(--sc-stats-bg)] backdrop-blur-[14px]">
          {[
            { key: 'stat-answered', value: `${counts.answered}/${counts.asked}`, label: 'answered' },
            {
              key: 'stat-follow-ups',
              value: `${counts.followUpsHeld}/${counts.followUpsOffered}`,
              label: 'follow-ups held',
            },
            { key: 'stat-questions', value: String(counts.questionsAsked), label: 'questions asked' },
            {
              key: 'stat-hints',
              value: String(counts.hintsUsed),
              label: counts.hintsUsed === 1 ? 'hint used' : 'hints used',
            },
            /*
              Elapsed, drawn by `scoring-mock.html` and absent here until it was.

              It is the fifth cell the waiting screen can fill from the clock it
              was already running, and a cell that exists while waiting and not
              after would be the reflow that screen exists to avoid. `vs last`
              keeps its place as the sixth: the scoring mock's arrived strip is
              illustrating the transition rather than respecifying this one, and
              `interview-reference.html` draws `vs last JS` and argues for it.
              Both drawings are true with six cells and only one is with five.
            */
            { key: 'stat-elapsed', value: clockOf(elapsedSeconds), label: 'elapsed' },
            ...(past.length > 0
              ? [
                  {
                    key: 'versus-last',
                    value: `${scorecard.overall - past[past.length - 1].overall >= 0 ? '+' : ''}${scorecard.overall - past[past.length - 1].overall}`,
                    label: `vs last ${ROUND_LABEL[roundType]}`,
                    up: scorecard.overall - past[past.length - 1].overall >= 0,
                  },
                ]
              : []),
            ...(overBy > 0
              ? [{ key: 'stat-over', value: `${Math.round(overBy / 60)}`, label: 'min over' }]
              : []),
          ].map((stat) => (
            <div
              key={stat.key}
              data-testid={stat.key}
              className="flex-1 border-r border-[var(--sc-stat-rule)] px-[18px] py-4 last:border-r-0"
            >
              <b
                data-testid={`${stat.key}-value`}
                className={`block font-display text-[24px] leading-[1.1] font-medium tracking-[-0.015em] ${
                  'up' in stat ? (stat.up ? 'text-[var(--emerald-2)]' : 'text-[var(--coral)]') : 'text-white'
                }`}
              >
                {stat.value}
              </b>
              <span className="mt-[7px] block font-mono text-[9px] tracking-[0.13em] text-[var(--sc-stat-ink)] uppercase">
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mt-8 mb-3 font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
        Where the score came from
      </h2>
      {/*
        A fixed hue per dimension, in every round you ever run — Depth is always
        rose and Recall always emerald. That is what makes a scorecard readable
        at a glance rather than needing to be read: the shape of the four bars
        means something before the numbers do.
      */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(206px,1fr))] gap-3.5" data-testid="dimensions">
        {DIMENSIONS.map((dimension) => (
          <div
            key={dimension}
            data-testid={`dimension-${dimension}`}
            className={`${HUE[dimension]} relative overflow-hidden rounded-[14px] border border-rule bg-surface px-[19px] py-[17px] shadow-[0_1px_2px_rgba(18,19,26,0.05)]`}
          >
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-[var(--h)]" />
            <div className="font-mono text-[9.5px] tracking-[0.13em] text-ink-3 uppercase">
              {dimension}
            </div>
            <div className="mt-[9px] mb-3 font-display text-[34px] leading-none font-semibold text-[var(--h)]">
              {scorecard.scores[dimension]}
            </div>
            <div className="h-2 overflow-hidden rounded-[5px] border border-rule bg-surface-2">
              <i
                className="block h-full rounded-[5px] [background:linear-gradient(90deg,var(--h2),var(--h))]"
                style={{ width: `${scorecard.scores[dimension]}%` }}
              />
            </div>
            <p className="mt-[11px] text-[12.5px] leading-[1.5] text-ink-2">
              {scorecard.notes[dimension]}
            </p>
          </div>
        ))}
      </div>

      {scorecard.questions.length > 0 ? (
        <>
          <h2 className="mt-8 mb-3 font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
            Question by question
          </h2>
          <ul className="list-none overflow-hidden rounded-[14px] border border-rule bg-surface shadow-[0_1px_2px_rgba(18,19,26,0.05)]">
            {scorecard.questions.map((question, index) => {
              const again = rewinds.find((result) => result.questionIndex === index)

              return (
                <li
                  key={index}
                  data-testid="question-row"
                  className="border-b border-rule px-[19px] py-[15px] last:border-b-0 hover:bg-surface-2"
                >
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-body font-medium">{question.title}</p>
                      {/*
                        One line, which is the other half of the scoring screen's
                        promise: while waiting, this line is the follow-up count,
                        and a note that wrapped to two would grow every row the
                        moment the score landed. Clamped rather than truncated so
                        a long note still ends in an ellipsis rather than a cut.
                      */}
                      <p className="mt-0.5 line-clamp-1 text-meta leading-[1.55] text-ink-2">
                        {question.note}
                      </p>
                      {/*
                        Said, not swallowed. A question the model could not tie to
                        a saved topic still scores — but it cannot appear in the
                        offers below, because there is no row to mark weak. A
                        question that vanishes from that list for a reason nobody
                        can see is worse than one that admits what it does not
                        know.
                      */}
                      {/*
                        Two different absences, and they are not the same
                        sentence. A concept question with no topic is one the
                        model could not attribute. A DSA problem has no topic to
                        attribute — it was generated, it is not in your library,
                        and there is nothing to be uncertain about.

                        The reference asked for "the same words an unattributable
                        question already uses". Those words say the topic could
                        not be told, which would be false here, and they end
                        "so it isn't offered below" — but with every row
                        unattributed the offer block is absent entirely.
                      */}
                      {question.topicId === null ? (
                        <p
                          data-testid="unattributed"
                          className="mt-1 font-mono text-[11px] text-ink-3"
                        >
                          {roundType === 'dsa'
                            ? 'A problem is not a topic in your library, so there is nothing here to mark weak'
                            : 'Couldn’t tell which of your topics this came from, so it isn’t offered below'}
                        </p>
                      ) : null}

                      {/*
                        The code you wrote, collapsed. From client state — the
                        round that produced it is still open in this tab — and
                        the column it was also written to has no reader in this
                        arc, which the migration says out loud.
                      */}
                      {roundType === 'dsa' && (code[index] ?? '').trim() !== '' ? (
                        <details className="mt-2" data-testid="solution">
                          <summary className="cursor-pointer font-mono text-[11px] text-ink-3 hover:text-ink">
                            Your solution
                          </summary>
                          <pre className="mt-2 overflow-x-auto rounded-md border border-rule bg-surface-2 px-3 py-2.5 font-mono text-[12px] leading-[1.7] text-ink">
                            {code[index]}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                    {/*
                      The bar's band and the Rewind button read the SAME
                      thresholds — `scoreTone` is built from `scoreBand`'s 70 and
                      `OFFER_BELOW`. So a rose bar always has a Rewind beside it
                      because they are one rule, not two numbers that agree.
                    */}
                    <div className="h-[9px] w-[150px] flex-none overflow-hidden rounded-[5px] border border-rule bg-surface-2">
                      <i
                        className={`block h-full rounded-[5px] ${TONE[scoreTone(question.score)].bar}`}
                        style={{ width: `${question.score}%` }}
                      />
                    </div>
                    <span
                      className={`w-[34px] flex-none text-right font-mono text-[13px] font-semibold ${TONE[scoreTone(question.score)].ink}`}
                    >
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
              /*
                Confirmation, and only confirmation.

                "Practise what went weak" used to sit here, beside the sentence
                saying what was marked, on the argument that the action belongs
                where the question arises. It now sits with the other two exits
                at the foot. The cost is real and worth naming: pressing Mark no
                longer puts the next step under your cursor.

                What it buys is that the page has ONE place holding every way
                out, ranked, instead of a next step two thirds of the way up and
                the exits at the bottom. A scorecard is read downward — hero,
                dimensions, question by question — and the person who marks weak
                topics carries on reading rather than leaving mid-page. This
                stays the acknowledgement that something was written.
              */
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
          {/*
            ── Each column resolves against a definite height ─────────────────
            The column is a flex child of a 104px row, so it has one. The BAR's
            own height is the percentage, and the fill inside it is `h-full` of
            that. Nothing resolves a percentage against an implicit height, which
            is what collapsed the previous version to nothing — and the version
            before that clamped to `Math.max(4, value)` PIXELS, which made a
            4-point round and a 40-point round almost the same bar.
          */}
          <div className="rounded-lg border border-rule bg-surface p-4">
            <div data-testid="sparkline" className="flex h-[104px] items-stretch gap-2.5">
              {rounds.map((round, index) => {
                const now = index === rounds.length - 1
                return (
                  <div
                    key={index}
                    className="flex min-w-0 flex-1 flex-col justify-end gap-1.5"
                  >
                    <span
                      className={`text-center font-mono text-[11px] leading-none ${
                        now ? 'font-semibold text-[var(--mint)]' : 'text-ink-3'
                      }`}
                    >
                      {round.overall}
                    </span>
                    <div
                      data-testid="spark-bar"
                      className="relative w-full overflow-hidden rounded-t-[5px] rounded-b-[2px] border border-rule bg-surface-2"
                      style={{ height: `${Math.max(1, round.overall)}%` }}
                    >
                      <i
                        className={`absolute inset-x-0 bottom-0 h-full rounded-t-[4px] rounded-b-[1px] ${
                          now ? '[background:var(--spark-now)]' : '[background:var(--spark-bar)]'
                        }`}
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-2.5 flex gap-2.5 border-t border-rule pt-2.5">
              {rounds.map((round, index) => (
                <span
                  key={index}
                  className="min-w-0 flex-1 text-center font-mono text-[9.5px] text-ink-3"
                >
                  {sparkLabel(round.created_at, today)}
                </span>
              ))}
            </div>

            <p className="mt-3 text-meta text-ink-3">
              {plural(rounds.length, 'round')}, your own scores only. No benchmark, no percentile,
              nobody else. Bar height is the score out of 100, so a short bar is a low round rather
              than an old one.
            </p>
          </div>
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

      {/*
        The way onward, in the order a person wants it.

        The ROOM deliberately has no exits — it is a single focused card with
        nothing to click away to, and `End the round` is its way out — but a
        scorecard is a page you have finished reading, and finishing it left you
        nowhere. Three things follow it, ranked:

          1. **Practise what went weak**, primary and conditional. It is the
             action the page's own findings argue for, and it exists only in the
             state where something HAS been marked — press "Change nothing" and
             there is nothing to practise, so there is no link.
          2. **Start a new interview**, which overrules the reasoning that kept
             it off this page. That argument — nobody starts a second round on
             finishing the first — is true, and it is an argument against this
             being the PRIMARY action, not against it being reachable. Setup is
             three choices and a button; going there is not starting a round.
             See `new-interview.tsx`, which holds the full note.
          3. **← Library**, the general exit, last because it is the one you
             take when neither of the others is what you came for.

        The middle one was an underlined `Set up another round`, which is the
        plain-link shape this arc has been removing everywhere else, under a
        second name for one action.
      */}
      <div data-testid="scorecard-actions" className="mt-8 flex flex-wrap items-center gap-2.5">
        {marked > 0 ? (
          <Link
            href="/practice"
            data-testid="practise-marked"
            className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-accent bg-accent px-3.5 py-2.5 text-label font-medium text-white hover:border-accent-ink hover:bg-accent-ink"
          >
            Practise what went weak
          </Link>
        ) : null}
        <NewInterview />
        <BackToLibrary />
      </div>

      <p className="mt-8 border-t border-rule pt-4 text-meta leading-[1.7] text-ink-2">
        The score is about the round. {scorecard.overall} says how you did for {minutes} minutes on{' '}
        {plural(counts.asked, 'question')} — a real thing, worth improving. It is not a claim
        about what you know and it never writes to confidence; that still takes one press.
      </p>
    </main>
  )
}
