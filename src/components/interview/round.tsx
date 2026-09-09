'use client'

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
import {
  HINTS_PER_ROUND,
  countRound,
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
  past,
  poolSize,
}: {
  roundType: RoundType
  minutes: Length
  level: Level
  /** The first question, asked on the server so the room opens with something in it. */
  opening: string
  /** Read before the round, so the scorecard has them without a second load. */
  past: number[]
  poolSize: number
}) {
  const target = questionCount(minutes)

  const [turns, setTurns] = useState<Turn[]>([
    { speaker: 'interviewer', text: opening, topicId: null, kind: 'question' },
  ])
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  const counts = countRound(turns)
  const hintsLeft = HINTS_PER_ROUND - counts.hintsUsed
  const remaining = minutes * 60 - elapsed
  const clock = `${Math.floor(Math.abs(remaining) / 60)}:${String(Math.abs(remaining) % 60).padStart(2, '0')}`

  const say = async (turn: Turn, intent: 'follow' | 'hint' | 'clarify' | 'ask') => {
    setBusy(true)
    setError(null)
    const next = [...turns, turn]
    setTurns(next)
    setAnswer('')

    const result = await speak({ roundType, level, turns: next, intent })
    setBusy(false)

    if (!result.ok) {
      setError(result.reason)
      return
    }

    setTurns([
      ...next,
      {
        speaker: 'interviewer',
        text: result.text,
        topicId: null,
        kind: intent === 'clarify' ? 'clarification-answer' : intent === 'hint' ? 'hint' : 'follow-up',
      },
    ])
  }

  const end = async () => {
    setBusy(true)
    setError(null)
    const result = await finish({ roundType, minutes, level, turns, elapsedSeconds: elapsed })
    setBusy(false)

    if (!result.ok) {
      setError(result.reason)
      return
    }
    setScorecard(result.scorecard)
    setRoundId(result.roundId)
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
  const openFollowUp =
    last?.speaker === 'interviewer' && last.kind === 'follow-up' ? last.text : null
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

  return (
    <main className="mx-auto max-w-[720px] px-6 py-8" data-testid="room">
      <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-rule pb-3.5">
        <span className="font-mono text-[11px] text-ink-3" data-testid="round-progress">
          {counts.answered} of {target} answered
        </span>
        <span className="rounded-full border border-rule bg-surface-2 px-2.5 py-1 font-mono text-[11px] text-ink-2">
          {level === 'friendly' ? 'Friendly senior' : level === 'staff' ? 'Staff, terse' : 'Skeptical principal'}
        </span>
        <span
          data-testid="hints-left"
          className="rounded-full border border-[var(--gold)] px-2.5 py-1 font-mono text-[11px] text-[var(--gold-ink)]"
        >
          {hintsLeft} hints left
        </span>
        <span
          className={`ml-auto font-mono text-[11.5px] ${remaining < 600 ? 'text-[var(--rose)]' : 'text-ink-3'}`}
        >
          {remaining < 0 ? '+' : ''}
          {clock}
        </span>
      </div>

      {error ? (
        <p
          role="alert"
          data-testid="room-error"
          className="mb-4 rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag"
        >
          {error}
        </p>
      ) : null}

      <h1 className="font-display text-[26px] leading-[1.3] font-medium" data-testid="question">
        {last.text}
      </h1>

      <div className="mt-5 space-y-3">
        {turns.slice(1).map((turn, index) => (
          <p
            key={index}
            data-testid={`turn-${turn.kind}`}
            className={
              turn.speaker === 'you'
                ? 'rounded-md border-l-2 border-rule-strong bg-surface-2 px-4 py-3 text-meta text-ink-2'
                : 'rounded-md border-l-2 border-[var(--volt)] bg-[var(--volt-soft)] px-4 py-3 text-meta text-ink-2'
            }
          >
            {turn.text}
          </p>
        ))}
      </div>

      <textarea
        aria-label="Your answer"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={4}
        className="mt-5 w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body leading-[1.6] text-ink outline-offset-[-1px] focus:border-accent focus:outline-2 focus:outline-accent"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <Button
          variant="primary"
          loading={busy}
          loadingLabel="Thinking…"
          disabled={answer.trim() === ''}
          onClick={() =>
            say({ speaker: 'you', text: answer, topicId: null, kind: 'answer' }, 'follow')
          }
        >
          Answer
        </Button>

        {/*
          Its own action, so a clarifying question is NEVER scored as a wrong
          answer — `countRound` counts it as `questionsAsked`, and Enquiry is a
          dimension that counts asking FOR you.
        */}
        <Button
          disabled={busy || answer.trim() === ''}
          onClick={() =>
            say({ speaker: 'you', text: answer, topicId: null, kind: 'clarification' }, 'clarify')
          }
        >
          Ask a question
        </Button>

        {hintsLeft > 0 ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              say({ speaker: 'you', text: 'Can I have a hint?', topicId: null, kind: 'hint' }, 'hint')
            }
          >
            Hint · {hintsLeft} left
          </Button>
        ) : null}

        <Button variant="ghost" disabled={busy} onClick={end} data-testid="end-round">
          {counts.answered >= target ? 'See the scorecard' : 'End the round'}
        </Button>
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
          className="mt-6 rounded-lg border border-[var(--gold)] bg-[var(--gold-soft)] px-4 py-3.5"
        >
          {draft === null ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-meta text-ink-2">Keep this follow-up as a quiz?</span>
              <Button
                variant="ghost"
                loading={drafting}
                loadingLabel="Drafting…"
                disabled={busy}
                onClick={startDraft}
                data-testid="draft-quiz"
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
  )
}
