'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  draftQuizFromFollowUp,
  finish,
  markWeak,
  saveQuizFromRound,
  speak,
} from '@/app/(interview)/interview/actions'
import { Scorecard as ScorecardView } from '@/components/interview/scorecard'
import { Button } from '@/components/ui/button'
import { VoltButton } from '@/components/interview/volt-button'
import {
  HINTS_PER_ROUND,
  countRound,
  followUpTag,
  ROUND_LABEL,
  pipState,
  questionCount,
  type Length,
  type Level,
  type QuizDraft,
  type RoundType,
  type Scorecard,
  type Turn,
} from '@/lib/domain/interview'
import { plural } from '@/lib/domain/plural'

/**
 * The room, and the whole round's state.
 *
 * ── The conversation lives HERE and nowhere else ────────────────────────────
 * `useState<Turn[]>`, posted to a server action each turn and never written to
 * the database. "The conversation is not stored" is therefore structurally true
 * rather than maintained — the same mechanism arc 6 used for "nothing is saved
 * until Save" — and an abandoned round leaves nothing **by construction**: there
 * is no in-flight row to orphan, because the round's only insert happens at the
 * end, with the scorecard.
 *
 * A refresh loses the round. That is what the reference specifies, and the setup
 * screen says so before you enter.
 *
 * ── The clock is advisory ───────────────────────────────────────────────────
 * The question count ends the round; the clock counts past zero and turns rose
 * under ten minutes. A hard stop can destroy an answer mid-sentence in a round
 * that cannot be resumed. Its teeth are in the record: elapsed and over-run are
 * stored and shown against past rounds.
 */
export function Round({
  roundType,
  minutes,
  level,
  opening,
  openingTopicId,
  openingTopicTitle,
  openingTopicWeak,
  past,
  poolSize,
}: {
  roundType: RoundType
  minutes: Length
  level: Level
  /** The first question, asked on the server so the room opens with something in it. */
  opening: string
  /** Which topic that first question is about. Null if the model named none. */
  openingTopicId: string | null
  openingTopicTitle: string | null
  openingTopicWeak: boolean
  /** Read before the round, so the scorecard has them without a second load. */
  past: { overall: number; created_at: string }[]
  poolSize: number
}) {
  const target = questionCount(minutes)

  const [turns, setTurns] = useState<Turn[]>([
    { speaker: 'interviewer', text: opening, topicId: openingTopicId, kind: 'question' },
  ])
  const [answer, setAnswer] = useState('')
  /*
    ── `thinking` is not `busy`, and that distinction is the whole fix ────────
    One shared flag disabled the actions AND the exit, so while an answer was in
    flight `End the round` carried the native `disabled` attribute and the
    browser never dispatched the click. It was not slow and it was not swallowed:
    it was inert, with its normal label on, which reads as a button that does
    nothing.

    An interviewer you cannot walk out on is a trap, not a simulation. So the
    exit reads no in-flight state at all.
  */
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** You pressed End. You are out of the room from that instant. */
  const [left, setLeft] = useState(false)
  const [endError, setEndError] = useState<string | null>(null)
  /** Re-entry guard for `end`, in a ref — a second press must not open a second round. */
  const ending = useRef(false)
  /** Whether a reply was still in flight at the moment you pressed. */
  const [abandoned, setAbandoned] = useState(false)

  /*
    Title and weak-flag per topic, accumulated as the interviewer names them.
    The room never holds the pool — the tag needs two fields about one topic, and
    shipping three hundred rows so the client can look up one is the wrong trade.
  */
  const [topicMeta, setTopicMeta] = useState<Record<string, { title: string; weak: boolean }>>(() =>
    openingTopicId !== null && openingTopicTitle !== null
      ? { [openingTopicId]: { title: openingTopicTitle, weak: openingTopicWeak } }
      : {},
  )
  const [scorecard, setScorecard] = useState<Scorecard | null>(null)
  /* The row `finish` wrote. Carried so the scorecard can name what it is about. */
  const [roundId, setRoundId] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const started = useRef(Date.now())

  /*
    ── Save a follow-up as a quiz ────────────────────────────────────────────
    Two states, because drafting and saving are two acts. The reference asked for
    one tap; arc 6's rule is that a thing you have not looked at is not a thing
    you chose. So pressing drafts, the bar expands in place to show what was
    drafted, and a second press saves it. No navigation either way.

    `saved` is titles only, for the scorecard's "Saved from the round" panel. It
    is state, like everything else in this room, and dies with the page — the
    quizzes themselves are ordinary rows in the library by then.
  */
  const [draft, setDraft] = useState<QuizDraft | null>(null)
  const [drafting, setDrafting] = useState(false)
  const [saved, setSaved] = useState<string[]>([])
  /* Which follow-ups already produced one, so the bar cannot save the same twice. */
  const [savedFor, setSavedFor] = useState<string[]>([])
  const [quizError, setQuizError] = useState<string | null>(null)

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  /*
    The topic under discussion: the most recent one the interviewer named. Your
    turns inherit it, so an answer belongs to the question it answers rather than
    to nothing. Before issue #25 every turn carried null and this could not exist.
  */
  const currentTopicId =
    [...turns].reverse().find((turn) => turn.topicId !== null)?.topicId ?? null

  const counts = countRound(turns)
  const hintsLeft = HINTS_PER_ROUND - counts.hintsUsed
  const remaining = minutes * 60 - elapsed
  const clock = `${Math.floor(Math.abs(remaining) / 60)}:${String(Math.abs(remaining) % 60).padStart(2, '0')}`

  const say = async (turn: Turn, intent: 'follow' | 'hint' | 'clarify' | 'ask') => {
    setThinking(true)
    setError(null)
    const next = [...turns, turn]
    setTurns(next)
    setAnswer('')

    /*
      `finally`, not a trailing statement. The first version cleared the flag on
      the resolved path only, so a rejected server action left the room disabled
      forever with nothing on screen to say why — which is exactly how a round
      was lost in production when the scorecard insert threw.
    */
    try {
      const result = await speak({ roundType, level, turns: next, intent })

      if (!result.ok) {
        setError(result.reason)
        return
      }

      setTurns([
      ...next,
      {
        speaker: 'interviewer',
        text: result.text,
        /*
          The model names the topic when it is asking and null when it is
          hinting or answering a clarification — so a reply that names none
          falls back to the one already under discussion rather than blanking it.
        */
        topicId: result.topicId ?? currentTopicId,
        kind:
          intent === 'clarify'
            ? 'clarification-answer'
            : intent === 'hint'
              ? 'hint'
              : /* Moving on gets a fresh QUESTION, not a follow-up on the one you left. */
                intent === 'ask'
                ? 'question'
                : 'follow-up',
        },
      ])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The room did not answer. Try again.')
    } finally {
      setThinking(false)
    }
  }

  /**
   * Leave. **Synchronous up to the point you are out.**
   *
   * There is no `await` before `setLeft(true)`, so pressing this cannot wait on
   * anything — not on the scoring call it starts, and certainly not on an answer
   * already in flight. The scorecard resolves into the screen you land on, or an
   * error does; either way you are already out of the room.
   *
   * Re-entry is guarded by a ref rather than by disabling the control, because a
   * disabled escape hatch is the bug this function exists to fix.
   */
  const end = () => {
    if (ending.current) return
    ending.current = true
    setAbandoned(thinking)
    setLeft(true)

    void (async () => {
      try {
        const result = await finish({ roundType, minutes, level, turns, elapsedSeconds: elapsed })
        if (!result.ok) {
          setEndError(result.reason)
          return
        }
        setScorecard(result.scorecard)
        setRoundId(result.roundId)
      } catch (cause) {
        setEndError(
          cause instanceof Error ? cause.message : 'The scorecard did not arrive. Nothing was saved.',
        )
      }
    })()
  }

  /*
    ── You are out ───────────────────────────────────────────────────────────
    Rendered the instant End is pressed, before the scoring call has been made,
    let alone answered. Leaving and scoring are two acts and only the second one
    can be slow.
  */
  if (left && scorecard === null) {
    return (
      <main className="mx-auto max-w-[620px] px-6 py-16" data-testid="left-room">
        <h1 className="font-display text-[26px] leading-[1.3] font-medium">
          {endError === null ? 'Scoring what you said' : 'The round ended without a scorecard'}
        </h1>

        {endError === null ? (
          <p className="mt-3 text-meta leading-[1.7] text-ink-2">
            You are out of the room. This takes a few seconds, and the scorecard replaces this
            page when it arrives.
          </p>
        ) : (
          <p
            role="alert"
            className="mt-3 rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag"
          >
            {endError}
          </p>
        )}

        {/*
          Abandoned, not aborted — and it says so rather than implying a stop.
          A server action is one round trip with no client-reachable abort: there
          is no AbortController on this path and `chat()` passes no signal. The
          honest sentence is that the request finishes and its answer is thrown
          away, which is the same wording the extraction panel uses for the same
          reason.
        */}
        {abandoned ? (
          <p className="mt-4 max-w-[58ch] border-t border-rule pt-4 font-mono text-[11px] leading-[1.8] text-ink-3">
            A reply was still on its way when you left. It cannot be called back — the request
            finishes on the server and its answer is discarded. Leaving stops you waiting for it,
            not the work.
          </p>
        ) : null}

        <p className="mt-6 text-meta">
          <Link href="/interview" className="text-accent-ink underline">
            Set up another round
          </Link>
        </p>
      </main>
    )
  }

  if (scorecard) {
    return (
      <ScorecardView
        scorecard={scorecard}
        counts={counts}
        roundType={roundType}
        minutes={minutes}
        elapsedSeconds={elapsed}
        past={past}
        level={level}
        poolSize={poolSize}
        savedQuizzes={saved}
        roundId={roundId}
        onMarkWeak={markWeak}
      />
    )
  }

  const last = turns[turns.length - 1]

  /*
    The bar is offered on any follow-up, and the copy does not claim you failed.

    The reference read "You did not get this one. Keep the follow-up as a quiz?"
    — but ROOM_RULES forbid this surface from grading, scoring or saying how you
    are doing, so it cannot know. Recorded in TASKS.md as the eighth way a
    reference can be wrong, and corrected in the reference itself.
  */
  /*
    The follow-up still standing: the most recent one you have not answered yet.

    The first version asked whether the LAST turn was a follow-up, which is too
    narrow — take a hint or ask a clarifying question and the bar vanished, even
    though the follow-up is exactly as unanswered as it was a second ago. Those
    are the moments you are most likely to want to keep the question.
  */
  const lastFollowUpIndex = turns.map((turn) => turn.kind).lastIndexOf('follow-up')
  const answeredSince =
    lastFollowUpIndex >= 0 &&
    turns.slice(lastFollowUpIndex + 1).some((turn) => turn.kind === 'answer' || turn.kind === 'skip')
  const openFollowUp =
    lastFollowUpIndex >= 0 && !answeredSince ? turns[lastFollowUpIndex].text : null
  /* What you said just before it — the draft needs to see the gap it is filling. */
  const answeredBefore =
    [...turns].reverse().find((turn) => turn.speaker === 'you' && turn.kind === 'answer')?.text ?? ''

  const startDraft = async () => {
    if (openFollowUp === null) return
    setDrafting(true)
    setQuizError(null)
    const result = await draftQuizFromFollowUp({
      roundType,
      followUp: openFollowUp,
      answer: answeredBefore,
    })
    setDrafting(false)
    if (!result.ok) {
      setQuizError(result.reason)
      return
    }
    setDraft(result.draft)
  }

  const keepDraft = async () => {
    if (draft === null) return
    setDrafting(true)
    const result = await saveQuizFromRound({ draft })
    setDrafting(false)
    if (result.error !== null) {
      setQuizError(result.error)
      return
    }
    setSaved((current) => [...current, draft.question])
    if (openFollowUp !== null) setSavedFor((current) => [...current, openFollowUp])
    setDraft(null)
  }

  /* The question under discussion — the last thing the interviewer ASKED. */
  const currentQuestion =
    [...turns].reverse().find((turn) => turn.speaker === 'interviewer' && turn.kind === 'question')
      ?.text ?? opening
  const meta = currentTopicId === null ? null : (topicMeta[currentTopicId] ?? null)
  const followUp = followUpTag(level, turns)

  const TAG = 'rounded-full border px-[9px] py-[3px] font-mono text-[10.5px]'

  return (
    <div className="bg-bg px-6 pt-6 pb-[70px]">
      <main
        data-testid="room"
        className="relative mx-auto max-w-[790px] overflow-hidden rounded-[20px] border border-rule bg-surface px-[30px] pt-[27px] pb-[30px] [box-shadow:var(--room-shadow)]"
      >
        {/* The room's one flourish: a 4px spectrum across the top of the card. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 [background:var(--room-rule)]"
        />

        <div className="flex flex-wrap items-center justify-between gap-3.5 border-b border-rule pb-[15px]">
          {/*
            The pips fill BEHIND you and do not grade you. The reference colours
            them green, amber and rose — which is the room scoring you question by
            question, and ROOM_RULES forbid this surface from doing that. Done,
            now, or not yet.
          */}
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: target }, (_, index) => {
              const state = pipState(index, counts.answered)
              return (
                <i
                  key={index}
                  data-pip={state}
                  className={`h-[5px] rounded-[3px] ${
                    state === 'now'
                      ? 'w-7 [background:var(--pip-now)] [box-shadow:var(--pip-glow)]'
                      : state === 'done'
                        ? 'w-5 bg-[var(--volt)]'
                        : 'w-5 bg-rule'
                  }`}
                />
              )
            })}
          </div>
          {/* The pips are decorative, so the count is said in words for a screen reader. */}
          <span className="sr-only" data-testid="round-progress">
            {counts.answered} of {target} answered
          </span>

          <span className={`${TAG} border-ink-3 bg-surface text-ink-2`}>
            {level === 'friendly' ? 'Friendly senior' : level === 'staff' ? 'Staff, terse' : 'Skeptical principal'}
          </span>
          <span
            data-testid="hints-left"
            className={`${TAG} border-[var(--gold)] bg-[var(--gold-soft)] text-[var(--gold-ink)]`}
          >
            {hintsLeft} hints left
          </span>

          <span
            className={`ml-auto flex items-center gap-2 font-mono text-[13.5px] ${
              remaining < 600 ? 'text-[var(--rose)]' : 'text-ink-2'
            }`}
          >
            <i
              aria-hidden="true"
              className={`size-[7px] rounded-full ${
                remaining < 600 ? 'animate-pulse bg-[var(--rose)]' : 'bg-[var(--mint)]'
              }`}
            />
            {remaining < 0 ? '+' : ''}
            {clock}
          </span>
        </div>

        {error ? (
          <p
            role="alert"
            data-testid="room-error"
            className="mt-4 rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag"
          >
            {error}
          </p>
        ) : null}

        {/*
          What this exchange is about, read from your library. The topic tag and
          the weak flag are why issue #25 had to be closed first — before it, the
          room could not name the thing it was asking about.
        */}
        <div className="mt-[22px] flex flex-wrap items-center gap-2">
          <span data-testid="qtag-topic" className={`${TAG} border-rule bg-surface-2 text-ink-2`}>
            {ROUND_LABEL[roundType]}
            {meta ? ` · ${meta.title}` : ''}
          </span>
          {meta?.weak ? (
            <span
              data-testid="qtag-weak"
              className={`${TAG} border-[var(--rose)] bg-[var(--rose-soft)] text-[var(--rose-ink)]`}
            >
              you grade this weak
            </span>
          ) : null}
          {followUp ? (
            <span
              data-testid="qtag-followup"
              className={`${TAG} border-[var(--volt)] bg-[var(--volt-soft)] text-[var(--volt-ink)]`}
            >
              {followUp}
            </span>
          ) : null}
        </div>

        <h1
          data-testid="question"
          className="mt-[13px] mb-1.5 font-display text-[28px] leading-[1.28] font-medium tracking-[-0.022em]"
        >
          {currentQuestion}
        </h1>

        {/*
          Four kinds of turn, four treatments. They are different KINDS of thing —
          what you said, a push, a hint you spent, an answer to your question —
          and one style for all four made the room a wall of identical boxes.
        */}
        {turns.map((turn, index) => {
          if (turn.kind === 'question') return null

          if (turn.speaker === 'you') {
            /*
              Asking for a hint is a CONTROL, not something you said. The
              reference draws the hint and never the request for it, and it is
              right to: "Can I have a hint?" is noise in a transcript you are
              reading back to see what you argued.
            */
            if (turn.kind === 'hint') return null

            /* Leaving a question is worth a line, so the thread does not jump. */
            if (turn.kind === 'skip') {
              return (
                <p
                  key={index}
                  data-testid="turn-skip"
                  className="my-4 font-mono text-[10.5px] tracking-[0.06em] text-ink-3 uppercase"
                >
                  You moved on
                </p>
              )
            }

            /*
              A clarifying question gets its own treatment — teal, dashed, and
              labelled "You asked". It is not an answer and must never read like
              a weak one; Enquiry counts it FOR you, and the room should look
              like it agrees.
            */
            if (turn.kind === 'clarification') {
              return (
                <div
                  key={index}
                  data-testid="turn-clarification"
                  className="my-4 rounded-[14px] border border-dashed border-l-[3px] border-[var(--teal-line)] border-l-[var(--teal)] border-l-solid bg-[var(--teal-soft)] px-[18px] py-[15px] text-[14.5px] leading-[1.62] text-[var(--teal-ink)]"
                >
                  <span className="mb-1.5 block font-mono text-[9.5px] tracking-[0.14em] text-[var(--teal)] uppercase">
                    You asked
                  </span>
                  {turn.text}
                </div>
              )
            }

            return (
              <p
                key={index}
                data-testid={`turn-${turn.kind}`}
                className="my-4 border-l-2 border-rule-strong py-1 pl-[17px] text-body leading-[1.72] text-ink-2"
              >
                {turn.text}
              </p>
            )
          }

          if (turn.kind === 'hint') {
            return (
              <div
                key={index}
                data-testid="turn-hint"
                className="my-4 rounded-[14px] border border-l-[3px] border-[var(--gold-line)] border-l-[var(--gold)] px-[18px] py-[15px] text-[14.5px] leading-[1.62] text-[var(--gold-ink)] [background:var(--hint-bg)]"
              >
                <span className="mb-1.5 block font-mono text-[9.5px] tracking-[0.14em] uppercase opacity-90">
                  Hint · {counts.hintsUsed} of {HINTS_PER_ROUND} used
                </span>
                {turn.text}
              </div>
            )
          }

          const answered = turn.kind === 'clarification-answer'
          return (
            <div
              key={index}
              data-testid={`turn-${turn.kind}`}
              className="my-4 rounded-[14px] border border-l-[3px] border-[var(--volt-line)] border-l-[var(--volt)] px-[19px] py-4 text-[15.5px] leading-[1.66] text-[var(--volt-ink)] [background:var(--follow-bg)]"
            >
              <span className="mb-1.5 flex items-center gap-2 font-mono text-[9.5px] tracking-[0.14em] uppercase opacity-85">
                {answered ? (
                  'Answered'
                ) : (
                  <>
                    <span className="rounded-full px-2 py-0.5 text-[9px] text-white [background:var(--volt-grad)]">
                      follow-up
                    </span>
                    going deeper
                  </>
                )}
              </span>
              {turn.text}
            </div>
          )
        })}

      <textarea
        aria-label="Your answer"
        placeholder="Keep going…"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={4}
        className="mt-5 w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body leading-[1.6] text-ink outline-offset-[-1px] focus:border-accent focus:outline-2 focus:outline-accent"
      />

      <div className="mt-[15px] flex flex-wrap items-center gap-2.5">
        <VoltButton
          loading={thinking}
          loadingLabel="Thinking…"
          /*
            `thinking` is in here explicitly. Button resolves `disabled ?? loading`,
            so an explicit `false` — which `answer.trim() !== ''` produces — defeats
            the loading fallback entirely and leaves the control live mid-request.
            Typing during a call would re-arm it and fire a second `say` over a
            stale `turns`.
          */
          disabled={thinking || answer.trim() === ''}
          onClick={() =>
            say({ speaker: 'you', text: answer, topicId: currentTopicId, kind: 'answer' }, 'follow')
          }
        >
          Answer
        </VoltButton>

        {/*
          Its own action, so a clarifying question is NEVER scored as a wrong
          answer — `countRound` counts it as `questionsAsked`, and Enquiry is a
          dimension that counts asking FOR you.
        */}
        <Button
          disabled={thinking || answer.trim() === ''}
          onClick={() =>
            say({ speaker: 'you', text: answer, topicId: currentTopicId, kind: 'clarification' }, 'clarify')
          }
        >
          Ask a question
        </Button>

        {hintsLeft > 0 ? (
          <Button
            variant="ghost"
            disabled={thinking}
            onClick={() =>
              say({ speaker: 'you', text: 'Can I have a hint?', topicId: currentTopicId, kind: 'hint' }, 'hint')
            }
          >
            Hint · {hintsLeft} left
          </Button>
        ) : null}

        {/*
          Leave the question, not the round. Its own kind so `countRound` does
          not read it as an answer — moving on is a real move and it is not a
          wrong answer either.
        */}
        <Button
          variant="ghost"
          disabled={thinking}
          onClick={() => say({ speaker: 'you', text: 'Move on.', topicId: currentTopicId, kind: 'skip' }, 'ask')}
          data-testid="move-on"
        >
          Move on
        </Button>

        {/*
          No `disabled`, no `loading`. Not "enabled sooner" — never disabled, by
          anything. This is the only escape from a stuck exchange, and a stuck
          exchange is precisely when it is needed.
        */}
        <Button variant="ghost" onClick={end} data-testid="end-round">
          {counts.answered >= target ? 'See the scorecard' : 'End the round'}
        </Button>

        <span className="ml-auto font-mono text-[11.5px] text-ink-3">⌘↵ to send</span>
      </div>

      {/*
        The only thing in a round that feeds the LIBRARY rather than the
        scorecard. It writes a row — and it does not touch the
        no-write-until-pressed guarantee, which is about confidence and the
        scorecard. A saved quiz arrives at confidence `new` from the column
        default, exactly as a hand-made one does.
      */}
      {openFollowUp !== null && !savedFor.includes(openFollowUp) ? (
        <div
          data-testid="save-quiz"
          className="mt-3.5 rounded-[14px] border border-l-[3px] border-[var(--mint-line)] border-l-[var(--mint)] px-[17px] py-[13px] text-[13.5px] text-[var(--mint-ink)] [background:var(--saveq-bg)]"
        >
          {draft === null ? (
            <div className="flex flex-wrap items-center gap-3">
              <span>Keep this follow-up as a quiz?</span>
              <Button
                loading={drafting}
                loadingLabel="Drafting…"
                disabled={thinking || drafting}
                onClick={startDraft}
                data-testid="draft-quiz"
                className="ml-auto"
              >
                Save as a quiz
              </Button>
            </div>
          ) : (
            /*
              Two presses, not one. The distractors are model-written and you
              have not seen them yet — arc 6's rule, which beats the drawing.
            */
            <div data-testid="quiz-draft">
              <p className="text-label font-medium">{draft.question}</p>
              <ul className="mt-2.5 list-none space-y-1">
                {draft.options.map((option, index) => (
                  <li
                    key={index}
                    data-testid="draft-option"
                    data-correct={index === draft.correctOption}
                    className="flex items-start gap-2 text-meta text-ink-2"
                  >
                    <span className="font-mono text-[11px] text-ink-3">
                      {index === draft.correctOption ? '✓' : '·'}
                    </span>
                    {option}
                  </li>
                ))}
              </ul>
              {draft.explanation !== '' ? (
                <p className="mt-2.5 text-meta leading-[1.6] text-ink-3">{draft.explanation}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <Button
                  variant="primary"
                  loading={drafting}
                  loadingLabel="Saving…"
                  onClick={keepDraft}
                  data-testid="keep-quiz"
                >
                  Save to my library
                </Button>
                <Button variant="ghost" disabled={drafting} onClick={() => setDraft(null)}>
                  Discard
                </Button>
              </div>
            </div>
          )}

          {quizError ? (
            <p role="alert" className="mt-2.5 text-meta text-flag">
              {quizError}
            </p>
          ) : null}
        </div>
      ) : null}

        {saved.length > 0 ? (
          <p data-testid="saved-count" className="mt-3 font-mono text-[11px] text-ink-3">
            {plural(saved.length, 'quiz', 'quizzes')} saved from this round
          </p>
        ) : null}
      </main>
    </div>
  )
}
