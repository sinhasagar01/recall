'use client'

import { useEffect, useState } from 'react'
import { BackToLibrary } from '@/components/ui/back-to-library'
import { NewInterview } from '@/components/interview/new-interview'
import { Button } from '@/components/ui/button'
import {
  clockOf,
  DIMENSIONS,
  ROUND_LABEL,
  type Length,
  type Level,
  type QuestionOutline,
  type RoundCounts,
  type RoundType,
} from '@/lib/domain/interview'

/**
 * The screen between pressing End and the scorecard arriving.
 *
 * ── What was wrong with it ──────────────────────────────────────────────────
 * It was a heading, a sentence and two buttons. It showed **nothing it already
 * knew**, offered an escape from a process that was working, and gave the reader
 * no way to tell waiting from broken. Half the scorecard exists the instant End
 * is pressed: answered, follow-ups held, questions asked, hints used and elapsed
 * are all counted in code from the transcript and wait on nothing.
 *
 * ── The skeleton is the real geometry ───────────────────────────────────────
 * Same hero, same stat strip, same four dimension cards, same question rows in
 * the same order with their real titles and their real follow-up counts. The
 * arriving score fills the shape rather than replacing a different one, which is
 * the difference between a page settling and a page jumping.
 *
 * Two places where that promise needed work rather than assertion:
 *
 * - **The fifth stat.** The scorecard's strip ends in `vs last <type>`, which
 *   only exists when there is a previous round. The room already has `past`, so
 *   this screen knows at wait time exactly which cells the arrived card will
 *   have and renders that many. The count cannot change under it.
 * - **The question row's second line.** Here it is the follow-up count, there it
 *   is the model's note. Both are clamped to one line so the row is the same
 *   height in both states — see `scorecard.tsx`, where the clamp is the other
 *   half of this.
 *
 * ── Indeterminate, never fake progress ──────────────────────────────────────
 * A sweep and a slow wave. It is one round trip with no stages, and a bar that
 * fills to 80% and waits is a lie about a request that either returns or does
 * not. All of it stops under `prefers-reduced-motion`; the screen reads the same
 * without it, because the word "Scoring" carries the meaning and the animation
 * only carries the reassurance.
 *
 * ── No buttons while it works ───────────────────────────────────────────────
 * An escape hatch on a screen you are meant to wait on reads as *this may not
 * finish*, which is the message the old screen sent by accident. After twenty
 * seconds the wait has become unusual, so one honest sentence appears with one
 * way out that says what leaving costs. On failure the two controls come back,
 * because there is then nothing else to do — the same pair, the opposite
 * meaning, decided by whether anything is still happening.
 */
export function Scoring({
  roundType,
  minutes,
  level,
  counts,
  elapsedSeconds,
  outline,
  topicMeta,
  hasPast,
  endError,
  abandoned,
}: {
  roundType: RoundType
  minutes: Length
  level: Level
  counts: RoundCounts
  elapsedSeconds: number
  outline: QuestionOutline[]
  topicMeta: Record<string, { title: string; weak: boolean }>
  /** Whether the arrived strip will carry a `vs last` cell. Geometry, not data. */
  hasPast: boolean
  endError: string | null
  abandoned: boolean
}) {
  const failed = endError !== null

  /*
    Twenty seconds, measured from mount rather than from the press, because
    mount IS the press — this screen renders synchronously when End is hit.
  */
  const [slow, setSlow] = useState(false)
  const [waited, setWaited] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const tick = setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000)
      setWaited(seconds)
      if (seconds >= 20) setSlow(true)
    }, 1000)
    return () => clearInterval(tick)
  }, [])

  if (failed) {
    return (
      <main className="mx-auto max-w-[1020px] px-[26px] pt-7 pb-20" data-testid="left-room">
        <h1 className="font-display text-[29px] leading-[1.24] font-medium tracking-[-0.022em]">
          The scoring did not come back
        </h1>

        <div
          role="alert"
          data-testid="scoring-failed"
          className="mt-[18px] rounded-lg border border-flag border-l-[3px] bg-flag-soft px-[19px] py-[15px]"
        >
          <b className="font-medium text-flag">{endError}</b>
          {/*
            The explicit line that nothing was written. A failure that says only
            what broke leaves the reader to guess what it took with it, and the
            guess is always worse than the truth.
          */}
          <p className="mt-1.5 text-meta leading-[1.7] text-ink-2">
            Your round is not saved and there is no scorecard for it. Nothing else changed — no
            topic was marked, and your library is exactly as you left it.
          </p>
        </div>

        {abandoned ? <Abandoned /> : null}

        <div className="mt-[18px] flex flex-wrap items-center gap-2.5">
          <NewInterview />
          <BackToLibrary />
        </div>
      </main>
    )
  }

  /*
    The scorecard's own container, to the pixel: `max-w-[1020px] px-[26px] pt-7
    pb-20`. Copied rather than chosen — this started at `max-w-[860px]`, and
    every element on the page would have slid sideways the moment the score
    arrived. Precisely the failure this screen exists to prevent, and precisely
    the kind that looks fine until something measures it.
  */
  return (
    <main className="mx-auto max-w-[1020px] px-[26px] pt-7 pb-20" data-testid="left-room">
      <section
        data-testid="scoring-hero"
        className="relative overflow-hidden rounded-[22px] text-[var(--sc-ink)] [background:var(--sc-hero),var(--sc-base)] [box-shadow:var(--sc-shadow)]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background:var(--sc-sheen)]"
        />
        <div className="relative z-[1] px-[34px] pt-[30px] pb-[26px]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-[10px] tracking-[0.14em] text-[var(--sc-eyebrow)] uppercase">
              {ROUND_LABEL[roundType]} · {minutes} minutes · {LEVEL[level]}
            </span>
            <span
              data-testid="working"
              className="ml-auto inline-flex items-center gap-[9px] rounded-full border border-white/[0.18] bg-white/[0.07] px-[13px] py-[5px] font-mono text-[10px] tracking-[0.14em] text-[var(--sc-stat-ink)] uppercase"
            >
              <span aria-hidden="true" className="inline-flex gap-[3px]">
                <i className="sc-blink size-1 rounded-full bg-[#a5b4fc]" />
                <i className="sc-blink size-1 rounded-full bg-[#a5b4fc] [animation-delay:0.16s]" />
                <i className="sc-blink size-1 rounded-full bg-[#a5b4fc] [animation-delay:0.32s]" />
              </span>
              Scoring{slow ? ` · ${waited}s` : ''}
            </span>
          </div>

          {/*
            The numeral's slot is the numeral's own line box, not a rectangle
            that looks about right.

            A fixed 92px height was 10px short and the whole page stepped down
            when the score landed — caught by measuring, invisible to the eye.
            Guessing better numbers would only be right until the type scale
            moved, so the placeholder is built from the SAME markup as the
            figure it stands in for, with `invisible` glyphs holding the box
            open: same font, same size, same leading, same `/ 100` beside it.
            The box cannot drift because it is computed from the same rules.
          */}
          <div className="mt-6 flex flex-wrap items-end gap-5">
            <span className="relative flex flex-none items-end gap-2.5">
              <span
                aria-hidden="true"
                className="invisible font-display text-[84px] leading-[0.82] font-semibold tracking-[-0.05em] md:text-[116px]"
              >
                00
              </span>
              <span aria-hidden="true" className="invisible pb-3.5 font-mono text-[12.5px] tracking-[0.06em]">
                / 100
              </span>
              <span className="sc-shimmer sc-shimmer--dark absolute inset-0 overflow-hidden rounded-xl bg-[var(--sk-dark)]" />
            </span>

            <div className="min-w-[250px] flex-1 pb-1.5">
              <Line width="76%" height={13} />
              <Line width="92%" height={10} />
              <Line width="58%" height={10} />
            </div>
          </div>

          {/* Twenty segments, the meter's real count, waving rather than filling. */}
          <div className="mt-[26px] flex gap-[3px]" aria-hidden="true">
            {Array.from({ length: 20 }, (_, index) => (
              <i
                key={index}
                className="sc-wave h-[9px] flex-1 rounded-[2px] bg-[var(--sk-wait)]"
                style={{ animationDelay: `${index * 0.05}s` }}
              />
            ))}
          </div>
          <div className="mt-[9px] flex justify-between font-mono text-[9.5px] text-[var(--sc-ink-3)]">
            <span>0</span>
            <span>reading your answers</span>
            <span>100</span>
          </div>
        </div>

        {/*
          Every number here is counted in code, not judged by a model. None of it
          waits on the request, so none of it waits on screen.
        */}
        <div className="relative z-[1] flex flex-wrap border-t border-[var(--sc-stats-line)] bg-[var(--sc-stats-bg)] backdrop-blur-[14px]">
          <Stat value={`${counts.answered}/${counts.asked}`} label="answered" testid="stat-answered" />
          <Stat
            value={`${counts.followUpsHeld}/${counts.followUpsOffered}`}
            label="follow-ups held"
            testid="stat-follow-ups"
          />
          <Stat value={String(counts.questionsAsked)} label="questions asked" testid="stat-questions" />
          <Stat
            value={String(counts.hintsUsed)}
            label={counts.hintsUsed === 1 ? 'hint used' : 'hints used'}
            testid="stat-hints"
          />
          <Stat value={clockOf(elapsedSeconds)} label="elapsed" testid="stat-elapsed" />
          {/*
            The cell whose VALUE is pending but whose existence is not. `past` is
            in the room already, so the strip is the right length before the
            score arrives rather than growing a cell when it does.
          */}
          {hasPast ? (
            <div
              data-testid="versus-last"
              className="flex-1 border-r border-[var(--sc-stat-rule)] px-[18px] py-4 last:border-r-0"
            >
              <span
                aria-hidden="true"
                className="relative inline-block font-display text-[24px] leading-[1.1] font-medium tracking-[-0.015em]"
              >
                <span className="invisible">+00</span>
                <span className="sc-shimmer sc-shimmer--dark absolute inset-0 overflow-hidden rounded-md bg-[var(--sk-dark)]" />
              </span>
              <span className="mt-[7px] block font-mono text-[9px] tracking-[0.13em] text-[var(--sc-stat-ink)] uppercase">
                vs last {ROUND_LABEL[roundType]}
              </span>
            </div>
          ) : null}

          {/*
            The seventh cell, and the last one that could have appeared out of
            nowhere. The scorecard adds "min over" when the round ran past its
            length — which the clock on this screen already knows, so it is here
            too rather than arriving as a jolt.
          */}
          {elapsedSeconds > minutes * 60 ? (
            <Stat
              value={String(Math.round((elapsedSeconds - minutes * 60) / 60))}
              label="min over"
              testid="stat-over"
            />
          ) : null}
        </div>
      </section>

      {slow ? (
        <div
          data-testid="taking-longer"
          className="mt-4 flex flex-wrap items-center gap-3.5 rounded-xl border border-rule border-l-[3px] border-l-[var(--gold)] bg-[#FEF9EF] px-[18px] py-[15px] text-meta text-[#7A4A0B]"
        >
          <span>This is slower than usual — it is still going, and nothing is lost if you wait.</span>
          {/*
            One way out, appearing because the wait has become unusual rather
            than because leaving is expected — and it says what leaving costs
            instead of pretending it is free. A plain link to the library: there
            is no cancel to press, only a departure.
          */}
          <BackToLibrary className="ml-auto">Leave without a scorecard</BackToLibrary>
        </div>
      ) : null}

      <h2 className="mt-8 mb-3 font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
        Where the score came from
      </h2>
      {/*
        `minmax(206px,1fr)` and `gap-3.5`, which is what the scorecard uses. The
        mock draws 200px and 13px; the arrived card is the thing this must not
        move against, so the shipped values win over the drawing here.
      */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(206px,1fr))] gap-3.5" data-testid="dimensions">
        {DIMENSIONS.map((dimension) => (
          <div
            key={dimension}
            data-testid={`dimension-${dimension}`}
            className="relative overflow-hidden rounded-[14px] border border-rule bg-surface px-[19px] py-[17px] shadow-[0_1px_2px_rgba(18,19,26,0.05)]"
          >
            {/*
              The same testid the arrived card carries, because it IS the same
              card in its unfilled state. A test that finds four dimension cards
              before and after has asserted the geometry rather than two
              coincidentally similar lists.
            */}
            <div className="font-mono text-[9.5px] tracking-[0.13em] text-ink-3 uppercase">
              {dimension}
            </div>
            <Sk className="my-[9px] mb-3 h-[34px] w-14" />
            <Sk className="h-2" />
            <Sk className="mt-[11px] h-[11px] w-[88%]" />
          </div>
        ))}
      </div>

      {outline.length > 0 ? (
        <>
          <h2 className="mt-8 mb-3 font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
            Question by question
          </h2>
          <ul className="list-none overflow-hidden rounded-[14px] border border-rule bg-surface">
            {outline.map((question, index) => {
              const named = question.topicId === null ? null : topicMeta[question.topicId]
              return (
                <li
                  key={index}
                  data-testid="outline-row"
                  className="flex flex-wrap items-center gap-4 border-b border-rule px-[19px] py-[15px] last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    {/*
                      The real title, from the room's own topic map — not the
                      model's phrasing of the question, which does not exist yet.
                      One line in both states, so the row does not grow when the
                      note replaces this.
                    */}
                    <p className="truncate text-body font-medium">
                      {named?.title ?? ROUND_LABEL[roundType]}
                    </p>
                    <p className="mt-1 truncate text-meta text-ink-3">
                      {question.followUpsOffered === 0
                        ? 'no follow-ups'
                        : `${question.followUpsOffered} follow-ups · ${question.followUpsHeld} held`}
                    </p>
                  </div>
                  <Sk className="h-[9px] w-[150px]" />
                  <Sk className="h-[15px] w-[30px]" />
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      {abandoned ? <Abandoned /> : null}
    </main>
  )
}

const LEVEL: Record<Level, string> = {
  friendly: 'friendly senior',
  staff: 'staff, terse',
  skeptical: 'skeptical principal',
}

function Stat({ value, label, testid }: { value: string; label: string; testid: string }) {
  return (
    <div
      data-testid={testid}
      className="flex-1 border-r border-[var(--sc-stat-rule)] px-[18px] py-4 last:border-r-0"
    >
      <b className="block font-display text-[24px] leading-[1.1] font-medium tracking-[-0.015em] text-white">
        {value}
      </b>
      <span className="mt-[7px] block font-mono text-[9px] tracking-[0.13em] text-[var(--sc-stat-ink)] uppercase">
        {label}
      </span>
    </div>
  )
}

/** A placeholder on the light ground — the cards and the rows. */
function Sk({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`sc-shimmer sc-shimmer--light relative block overflow-hidden rounded-md bg-surface-3 ${className}`}
    />
  )
}

/** A placeholder on the hero's dark ground — the verdict's lines. */
function Line({ width, height }: { width: string; height: number }) {
  return (
    <span
      aria-hidden="true"
      className="sc-shimmer sc-shimmer--dark relative block overflow-hidden rounded-[5px] bg-[var(--sk-dark)] not-first:mt-2.5"
      style={{ width, height }}
    />
  )
}

/*
  Abandoned, not aborted, and it says so rather than implying a stop. A server
  action is one round trip with no client-reachable abort. Unchanged wording
  from the screen this replaces.
*/
function Abandoned() {
  return (
    <p className="mt-4 max-w-[58ch] border-t border-rule pt-4 font-mono text-[11px] leading-[1.8] text-ink-3">
      A reply was still on its way when you left. It cannot be called back — the request finishes
      on the server and its answer is discarded. Leaving stops you waiting for it, not the work.
    </p>
  )
}
