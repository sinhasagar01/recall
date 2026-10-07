'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { usePracticeKeys } from '@/components/practice/use-practice-keys'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { ConfidenceMeter } from '@/components/ui/confidence-meter'
import { Kbd } from '@/components/ui/kbd'
import { QuizBadge } from '@/components/ui/quiz-badge'
import { Definition, MentalModel, RegisterSection } from '@/components/ui/register'
import { QuizCard } from '@/components/practice/quiz-card'
import { answerQuiz, gradeTopic } from '@/app/(practice)/practice/actions'
import { CONFIDENCE_LABEL, GRADE_TO_CONFIDENCE, gradeQuiz, type Grade } from '@/lib/domain/confidence'
import { topicPath } from '@/lib/domain/library'
import { sessionSummary, sessionTally, type GradedResult } from '@/lib/domain/practice-session'
import type { QueueTopic, Topic } from '@/lib/domain/types'
import { BackToLibrary } from '@/components/ui/back-to-library'

const GRADES = [
  { grade: 'didnt-know', label: "Didn't know it", hint: 'comes back first' },
  { grade: 'partly', label: 'Partly knew it', hint: '' },
  { grade: 'knew-it', label: 'Knew it', hint: '' },
] as const satisfies readonly { grade: Grade; label: string; hint: string }[]

/**
 * A session receives one practice mode at a time. The topic and quiz cards still
 * share progress, ordering and confidence bookkeeping, but never appear together
 * in a session because their answer interactions are intentionally different.
 */
export function PracticeSession({
  queue,
  imageUrls,
  seed,
}: {
  queue: QueueTopic[]
  imageUrls: Record<string, string>
  /** The read timestamp. Shuffles a quiz's options, stably for the session. */
  seed: string
}) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  /*
    A quiz's equivalent of `revealed`. Both mean "the answer is now on screen", and
    both hide the prior-confidence chip for the same reason: once you can see the
    answer, what the app thought of you beforehand is no longer information you can
    act on, and leaving it up next to a fresh verdict reads as a contradiction.
  */
  const [answered, setAnswered] = useState(false)
  const [answer, setAnswer] = useState('')
  const [results, setResults] = useState<GradedResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const topic = queue[index]
  const done = index >= queue.length

  const advance = () => {
    setRevealed(false)
    setAnswered(false)
    setAnswer('')
    setError(null)
    setIndex((current) => current + 1)
  }

  /*
    The write is awaited before advancing.

    The alternative — advance optimistically and reconcile — would put a failed
    write two cards behind the user, and the entire value of this screen is
    trusting the confidence record. A grade that appears to save and silently
    does not is the worst outcome here, so a failure keeps the card on screen
    with the real reason.
  */
  const grade = (chosen: Grade) => {
    if (isSaving) return
    setError(null)
    startSaving(async () => {
      /*
        What was written from memory goes with the grade, in the same write.

        `answer` is sent as-is: whether an empty one counts is decided in the
        domain, not here, because "an empty attempt is the absence of an
        explanation rather than a new one" is a rule about recall attempts and
        not about this textarea. A second surface that collects one gets the
        same behaviour without knowing it exists.
      */
      const result = await gradeTopic(topic.id, chosen, answer)
      if (result.error !== null) {
        setError(result.error)
        return
      }
      setResults((current) => [...current, { topic, confidence: GRADE_TO_CONFIDENCE[chosen] }])
      advance()
    })
  }

  /*
    Answering a quiz. Same shape as `grade`: awaited, and a failure keeps the card
    on screen rather than advancing past a write that did not happen.

    The picked index goes to the server and the verdict comes back from the stored
    answer — this only needs to know it for the tally.
  */
  const submitAnswer = (picked: number) => {
    if (isSaving) return
    setError(null)
    setAnswered(true)
    startSaving(async () => {
      const result = await answerQuiz(topic.id, picked)
      if (result.error !== null) {
        setError(result.error)
        return
      }
      const correct = topic.kind === 'quiz' && picked === topic.correct_option
      setResults((current) => [...current, { topic, confidence: gradeQuiz(correct) }])
    })
  }

  /*
    Skip never reaches the server. There is no skip action to call — see
    actions.ts. It advances the queue and writes nothing, which is the rule.
  */
  const skip = () => advance()
  const finish = () => setIndex(queue.length)

  const isQuizCard = !done && topic.kind === 'quiz'

  usePracticeKeys({
    // Both undefined on a quiz: Space has nothing to reveal, and 1-3 would fight
    // QuizCard's own 1-9 for the same keys. Escape stays bound either way.
    onReveal: !done && !revealed && !isQuizCard ? () => setRevealed(true) : undefined,
    onGrade:
      !done && revealed && !isSaving && !isQuizCard ? (i) => grade(GRADES[i].grade) : undefined,
    onExit: finish,
  })

  if (done) return <Complete results={results} count={queue.length} />

  const resultsById = new Map(results.map((result) => [result.topic.id, result]))

  return (
    <div>
      <div className="mb-[34px] flex items-center justify-between gap-4">
        <div className="flex items-center gap-[3px]" role="img" aria-label={`Card ${index + 1} of ${queue.length}`}>
          {queue.map((item, position) => (
            <i
              key={item.id}
              className={`h-[3px] w-[19px] rounded-[2px] ${
                progressTone(resultsById.get(item.id)?.confidence, position === index)
              }`}
            />
          ))}
        </div>
        {/*
          The way out, said plainly — and now saying where it goes.

          This was an underlined word at 11.5px after the counter, which is not an
          exit anyone finds when they want one — the screen has no rail, so it is
          the only way back and it read as decoration. It became a control naming
          its shortcut, and then read as a screen with no way to the library:
          `End session` describes what stops, not where you land, so someone
          scanning for the affordance every other screen has finds nothing.

          ── One control, not two ──────────────────────────────────────────────
          The obvious fix is a second, `← Library` beside it. There is nowhere
          for the two to differ: `/practice` with no params builds a queue and
          renders a session immediately, so "end the session" cannot mean "go to
          /practice" without starting another one. Two controls to one
          destination is the duplication the shared control just removed.

          So it is one control naming both halves: what stops, and where you go.
          It stays an anchor — `a11y.spec.ts` focuses it and presses Space
          expecting the card to reveal, which a button would swallow.
        */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11.5px] text-ink-3">
            {index + 1} / {queue.length}
          </span>
          <Button variant="ghost" onClick={finish}>
            End session <Kbd>Esc</Kbd>
          </Button>
        </div>
      </div>

      <div className="mb-1 flex items-center gap-2">
        <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
          {topicPath(topic)}
        </span>
        {topic.kind === 'quiz' ? <QuizBadge /> : null}
        {!revealed && !answered && topic.confidence !== 'new' ? (
          <Chip tone={topic.confidence === 'weak' ? 'flag' : 'default'}>
            {CONFIDENCE_LABEL[topic.confidence]}
          </Chip>
        ) : null}
      </div>

      {/*
        A quiz is answered, not recalled, so it does not get the prompt heading,
        the recall textarea or the grade buttons — none of which mean anything
        when the answer is on screen and objective. Everything OUTSIDE this
        branch is shared: the progress bar, the path line, the confidence chip,
        the way out, the tally at the end.
      */}
      {topic.kind === 'quiz' ? (
        <div className="mt-[22px]">
          {error ? (
            <p
              role="alert"
              className="mb-3.5 rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag"
            >
              {error} Your earlier answers are already saved.
            </p>
          ) : null}

          <QuizCard
            // Remounts per card, so a pick never survives into the next question.
            key={topic.id}
            quiz={topic}
            seed={seed}
            isSaving={isSaving}
            onAnswered={submitAnswer}
            onNext={advance}
            isLast={index === queue.length - 1}
          />
        </div>
      ) : (
      <>

      <h1
        className={`mt-[22px] mb-2 font-display font-medium tracking-[-0.022em] ${
          revealed ? 'text-[24px] leading-[1.3]' : 'text-prompt leading-[1.26]'
        }`}
      >
        {topic.title}
      </h1>

      {revealed ? (
        <>
          <RegisterSection title="What you wrote">
            <p className="mt-2.5 max-w-[66ch] border-l-2 border-rule-strong py-0.5 pl-[18px] text-register leading-[1.7] text-ink-2">
              {answer.trim() === '' ? 'You went straight to the answer.' : answer}
            </p>
          </RegisterSection>

          {/* The same two components the detail page imports. */}
          <Definition>{topic.definition}</Definition>
          {topic.mental_model ? <MentalModel>{topic.mental_model}</MentalModel> : null}

          {imageUrls[topic.id] ? (
            <RegisterSection title="Visual">
              <figure className="mt-2.5 aspect-16/7 overflow-hidden rounded-md border border-rule bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                <img
                  src={imageUrls[topic.id]}
                  alt={topic.mental_model_image_path?.split('/').pop() ?? 'Diagram'}
                  className="size-full object-contain"
                />
              </figure>
            </RegisterSection>
          ) : null}

          <div className="mt-[38px] border-t border-rule pt-6">
            <p className="mb-3.5 font-display text-card-title font-medium">
              How well did you know it?
            </p>

            {error ? (
              <p
                role="alert"
                className="mb-3.5 rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag"
              >
                {error} Your earlier grades are already saved.
              </p>
            ) : null}

            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
              {GRADES.map(({ grade: value, label, hint }, position) => (
                <button
                  key={value}
                  type="button"
                  disabled={isSaving}
                  onClick={() => grade(value)}
                  className="flex cursor-pointer flex-col items-start gap-[9px] rounded-lg border border-rule-strong bg-surface px-4 py-[15px] text-left hover:border-ink-3 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <ConfidenceMeter confidence={GRADE_TO_CONFIDENCE[value]} />
                  <strong className="font-medium">{label}</strong>
                  <span className="font-mono text-mono text-ink-3">
                    → {GRADE_TO_CONFIDENCE[value]}
                    {hint ? ` · ${hint}` : ''} <Kbd>{position + 1}</Kbd>
                  </span>
                </button>
              ))}
            </div>

            {/* The line from the mock, kept because it states the actual rule. */}
            <p className="mt-3 font-mono text-[11.5px] text-ink-3">
              Saved as you choose — ending early keeps everything you&rsquo;ve already graded.
            </p>
          </div>
        </>
      ) : (
        <>
          <p className="font-mono text-[11.5px] text-ink-3">
            Explain it in your own words before revealing.
          </p>

          <div className="mt-6">
            <textarea
              aria-label="Write what you remember"
              placeholder="Write what you remember…"
              rows={6}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              className="w-full rounded-md border border-rule-strong bg-surface-2 px-3 py-2.5 text-body leading-[1.5] text-ink outline-offset-[-1px] placeholder:text-ink-3 focus:border-accent focus:bg-surface focus:outline-2 focus:outline-accent"
            />
          </div>

          <div className="mt-5 flex items-center gap-3.5">
            <Button variant="primary" size="lg" onClick={() => setRevealed(true)}>
              Reveal answer
            </Button>
            <Button variant="ghost" onClick={skip}>
              Skip
            </Button>
            {/*
              Names ⌘↵, not Space. Space still reveals, but only while the caret
              is outside the textarea — and this card has just asked you to put it
              inside. A hint that is true only if you ignore the instruction above
              it is worse than no hint. ⌘↵ is true either way, and it is the same
              chord the add sheet uses to finish a form.
            */}
            <span className="font-mono text-[11.5px] text-ink-3">
              <Kbd>⌘</Kbd> <Kbd>↵</Kbd> reveal · Skip records nothing
            </span>
          </div>
        </>
      )}
      </>
      )}
    </div>
  )
}

function Complete({ results, count }: { results: GradedResult[]; count: number }) {
  const tally = sessionTally(results)
  const kind = results[0]?.topic.kind
  const right = results.filter((result) => result.confidence === 'strong').length
  const wrong = results.filter((result) => result.confidence === 'weak').length

  return (
    <div className="py-15 text-center">
      <div className="mx-auto mb-[22px] grid size-[88px] place-items-center rounded-full border-2 border-accent font-display text-page-title text-accent">
        {tally.total}
      </div>

      <h1 className="mb-2 font-display text-[27px] font-medium">Session complete</h1>
      <p className="mx-auto mb-[26px] max-w-[44ch] text-ink-2">{sessionSummary(results)}</p>

      <p className="mb-6 font-mono text-[11.5px] text-ink-3">
        {kind === 'quiz'
          ? `${right} right · ${wrong} wrong`
          : `${tally.strong} knew it · ${tally.okay} partly knew it · ${tally.weak} didn’t know it`}
      </p>

      {/*
        Labelled by confidence — Weak / Okay / Strong — rather than by the grade
        buttons' words. A session can hold both shapes, and "Didn't know it" is
        the topic screen's phrasing for a self-assessment a quiz never makes.
        These are the words the meter, the library chips and the weak page
        already use, so the tally names the thing that was actually recorded.
      */}
      <div className="mb-[30px] flex flex-wrap justify-center gap-[26px]">
        {(['weak', 'okay', 'strong'] as const).map((confidence) => (
          <div key={confidence}>
            <div className="font-display text-[23px] font-medium">{tally[confidence]}</div>
            <div className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
              {CONFIDENCE_LABEL[confidence]}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-center gap-2.5">
        <Link
          href="/practice"
          className="inline-flex cursor-pointer items-center rounded-md border border-accent bg-accent px-[18px] py-3 text-body font-medium text-white hover:border-accent-ink hover:bg-accent-ink"
        >
          Practice {count} more
        </Link>
        <BackToLibrary />
      </div>
    </div>
  )
}

/** Completed cards retain their outcome; the active card is the only blue dash. */
function progressTone(confidence: GradedResult['confidence'] | undefined, active: boolean): string {
  if (confidence === 'strong') return 'bg-ok'
  if (confidence === 'weak') return 'bg-flag'
  if (confidence === 'okay') return 'bg-ink'
  return active ? 'bg-accent' : 'bg-rule-strong'
}
