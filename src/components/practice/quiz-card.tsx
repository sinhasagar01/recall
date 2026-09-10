'use client'

import { useEffect, useMemo, useState } from 'react'
import { isTyping } from '@/components/ui/is-typing'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { ConfidenceMeter } from '@/components/ui/confidence-meter'
import { MentalModel } from '@/components/ui/register'
import { CONFIDENCE_LABEL, gradeQuiz } from '@/lib/domain/confidence'
import { seededShuffle } from '@/lib/domain/practice-selection'
import type { QueueTopic, Quiz } from '@/lib/domain/types'

/**
 * Answering a quiz. Select, then Check.
 *
 * **A tap never writes.** The database write happens on Check, so a mis-tap on a
 * phone cannot permanently mark something weak — you can change your pick as often
 * as you like until you commit.
 *
 * ── After Check, only two options are marked ────────────────────────────────
 * The correct one, and your pick if it was wrong. Everything else goes muted grey.
 * Painting every wrong option red buries the one that matters.
 *
 * **The two-option case is the shape most likely to look broken**, and it is the
 * one this was built against first: there is no quiet third, so both options carry a
 * mark and the "everything else goes grey" rule has nothing to apply to. It is not a
 * special case in the code — it falls out of marking exactly the correct one and the
 * wrong pick — but it is the case where getting the rule wrong is invisible.
 *
 * Colour never carries the meaning alone: every marked option has a glyph and a text
 * tag, and the outcome is announced through an aria-live region.
 */
export function QuizCard({
  quiz,
  seed,
  onAnswered,
  onNext,
  isLast,
  isSaving,
}: {
  quiz: Extract<QueueTopic, { kind: 'quiz' }>
  /** The read timestamp, so the order is stable for the question and varies between. */
  seed: string
  /** The chosen index. Whether it was right is decided on the server. */
  onAnswered: (picked: number) => void
  onNext: () => void
  isLast: boolean
  isSaving: boolean
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const [checked, setChecked] = useState(false)

  /*
    Shuffled per session with the existing seeded shuffle — otherwise by the third
    round you are recalling "the second one" rather than the answer. Keyed by the
    quiz id as well as the seed so two quizzes in one session do not share an order.

    Indices are into the ORIGINAL options array, so `correct_option` keeps meaning
    what the database says it means.
  */
  const order = useMemo(
    () => seededShuffle(`${seed}:${quiz.id}`)(quiz.options.map((_, index) => index)),
    [seed, quiz.id, quiz.options],
  )

  const isCorrect = picked === quiz.correct_option
  const outcome = gradeQuiz(isCorrect)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTyping(event.target)) return
      if (isSaving) return

      if (event.key === 'Enter') {
        // Enter is the same key twice: commit, then continue. Nothing else moves
        // the session on, so the whole question is answerable without the mouse.
        event.preventDefault()
        if (checked) {
          onNext()
          return
        }
        if (picked === null) return
        setChecked(true)
        onAnswered(picked)
        return
      }

      if (checked) return

      // 1-9, mapped to displayed position rather than stored index.
      const position = Number(event.key)
      if (Number.isInteger(position) && position >= 1 && position <= order.length) {
        event.preventDefault()
        setPicked(order[position - 1])
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [checked, isSaving, picked, order, onAnswered, onNext])

  const check = () => {
    if (picked === null || checked) return
    setChecked(true)
    onAnswered(picked)
  }

  return (
    <div>
      <p className="mb-[14px] font-display text-[22px] leading-[1.35] font-medium">{quiz.title}</p>

      <ul className="list-none">
        {order.map((index, position) => {
          const isAnswer = index === quiz.correct_option
          const isPick = index === picked

          // Before checking: only the pick is marked, in accent. Deliberately not
          // green or red — the app is not hinting at whether you are right.
          const state = !checked
            ? isPick
              ? 'selected'
              : 'idle'
            : isAnswer
              ? 'correct'
              : isPick
                ? 'wrong'
                : 'muted'

          const tone = {
            idle: 'border-rule-strong bg-surface text-ink hover:border-ink-3',
            selected: 'border-accent bg-accent-soft text-accent-ink',
            correct: 'border-ok bg-ok-soft text-ok',
            wrong: 'border-flag bg-flag-soft text-flag',
            muted: 'border-rule text-ink-3',
          }[state]

          const tag =
            state === 'correct'
              ? isPick
                ? 'Correct · you picked this'
                : 'The answer'
              : state === 'wrong'
                ? 'You picked this'
                : null

          const body = (
            <>
              <span
                aria-hidden="true"
                className={`mt-px grid h-[19px] w-[19px] flex-none place-items-center rounded-full border-[1.5px] text-[11px] text-white ${
                  state === 'correct'
                    ? 'border-ok bg-ok'
                    : state === 'wrong'
                      ? 'border-flag bg-flag'
                      : state === 'selected'
                        ? 'border-accent bg-accent'
                        : 'border-rule-strong'
                }`}
              >
                {state === 'correct' ? '✓' : state === 'wrong' ? '✕' : ''}
              </span>

              <span className="min-w-0 flex-1">
                {quiz.options[index]}
                {tag ? (
                  <span className="mt-[7px] block font-mono text-[9.5px] tracking-[0.1em] uppercase">
                    {tag}
                  </span>
                ) : null}
              </span>

              {checked ? null : <Kbd>{position + 1}</Kbd>}
            </>
          )

          const shape = `mb-2 flex w-full items-start gap-3 rounded-lg border px-[15px] py-[13px] text-left text-[14px] leading-[1.5] ${tone}`

          /*
            The state, on the element.

            Not a test hook — it is the one thing about an answered option that
            matters and it is otherwise only legible as a colour. `muted` is the
            state with no glyph and no tag, which means it is also the state that
            looks identical to a bug: an option rendered as `wrong` when it was
            neither the answer nor the pick would differ only in hue. With two
            options that state cannot occur at all, so it is asserted against a
            three-option quiz in e2e/quiz.spec.ts, together with the computed
            colour so the attribute cannot drift away from what is painted.
          */

          /*
            After Check the options stop being buttons — same shape so nothing
            shifts, but no hover, not focusable, and not announced as actionable.
            A <li> rather than a disabled <button>, because a disabled control still
            says "control".
          */
          return (
            <li key={index} className="list-none">
              {checked ? (
                <div data-state={state} className={shape}>
                  {body}
                </div>
              ) : (
                <button
                  type="button"
                  data-state={state}
                  className={`${shape} cursor-pointer`}
                  onClick={() => setPicked(index)}
                >
                  {body}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {checked ? (
        <>
          {/*
            Absent rather than an empty panel when a quiz has no explanation, and
            unlabelled: it sits directly under the marked options, and the
            reference draws no eyebrow there. Same panel the detail page and a
            topic's mental model use — one field, one register, one voice.
          */}
          {quiz.mental_model ? <MentalModel label={null}>{quiz.mental_model}</MentalModel> : null}

          {/*
            The verdict, with the meter the rest of the app uses for confidence —
            so the sentence, the ticks and the colour say the same thing three
            ways and none of them is load-bearing alone. Announced, because it
            appears without the focus moving.
          */}
          <div
            role="status"
            aria-live="polite"
            className="mt-[14px] flex items-center gap-2.5 text-[13.5px] font-medium"
          >
            <ConfidenceMeter confidence={outcome} />
            <span className={isCorrect ? 'text-ok' : 'text-flag'}>
              Marked {CONFIDENCE_LABEL[outcome].toLowerCase()}
            </span>
          </div>

          <div className="mt-5 flex items-center gap-3.5">
            <Button variant="primary" size="lg" onClick={onNext} loading={isSaving} loadingLabel="Saving…">
              {isLast ? 'Finish session' : 'Next'}
            </Button>
            <span className="font-mono text-[11.5px] text-ink-3">
              <Kbd>Enter</Kbd> {isLast ? 'finish' : 'next'}
            </span>
          </div>
        </>
      ) : (
        <>
          <Button
            variant="primary"
            size="lg"
            block
            disabled={picked === null}
            loading={isSaving}
            loadingLabel="Saving…"
            onClick={check}
          >
            Check answer
          </Button>

          {/* The shortcuts named where they are used, as everywhere else. */}
          <p className="mt-2.5 text-center font-mono text-[11.5px] text-ink-3">
            <Kbd>Enter</Kbd> to check · 1–{order.length} to{' '}
            {picked === null ? 'pick' : 'change your pick'}
          </p>
        </>
      )}
    </div>
  )
}
