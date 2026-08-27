'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { usePracticeKeys } from '@/components/practice/use-practice-keys'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { ConfidenceMeter } from '@/components/ui/confidence-meter'
import { Kbd } from '@/components/ui/kbd'
import { Definition, MentalModel, RegisterSection } from '@/components/ui/register'
import { gradeTopic } from '@/app/(practice)/practice/actions'
import { CONFIDENCE_LABEL, GRADE_TO_CONFIDENCE, type Grade } from '@/lib/domain/confidence'
import { topicPath } from '@/lib/domain/library'
import { sessionSummary, sessionTally, type GradedResult } from '@/lib/domain/practice-session'
import type { Topic } from '@/lib/domain/types'

const GRADES = [
  { grade: 'didnt-know', label: "Didn't know it", hint: 'comes back first' },
  { grade: 'partly', label: 'Partly knew it', hint: '' },
  { grade: 'knew-it', label: 'Knew it', hint: '' },
] as const satisfies readonly { grade: Grade; label: string; hint: string }[]

export function PracticeSession({ queue }: { queue: Topic[] }) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [answer, setAnswer] = useState('')
  const [results, setResults] = useState<GradedResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const topic = queue[index]
  const done = index >= queue.length

  const advance = () => {
    setRevealed(false)
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
      const result = await gradeTopic(topic.id, chosen)
      if (result.error !== null) {
        setError(result.error)
        return
      }
      setResults((current) => [...current, { topic, grade: chosen }])
      advance()
    })
  }

  /*
    Skip never reaches the server. There is no skip action to call — see
    actions.ts. It advances the queue and writes nothing, which is the rule.
  */
  const skip = () => advance()

  usePracticeKeys({
    onReveal: !done && !revealed ? () => setRevealed(true) : undefined,
    onGrade: !done && revealed && !isSaving ? (i) => grade(GRADES[i].grade) : undefined,
  })

  if (done) return <Complete results={results} count={queue.length} />

  return (
    <div>
      <div className="mb-[34px] flex items-center justify-between gap-4">
        <div className="flex items-center gap-[3px]" role="img" aria-label={`Topic ${index + 1} of ${queue.length}`}>
          {queue.map((item, position) => (
            <i
              key={item.id}
              className={`h-[3px] w-[19px] rounded-[2px] ${
                position < index ? 'bg-ink' : position === index ? 'bg-accent' : 'bg-rule-strong'
              }`}
            />
          ))}
        </div>
        <span className="font-mono text-[11.5px] text-ink-3">
          {index + 1} / {queue.length} ·{' '}
          <Link href="/library" className="text-accent-ink underline">
            End session
          </Link>
        </span>
      </div>

      <div className="mb-1 flex items-center gap-2">
        <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
          {topicPath(topic)}
        </span>
        {!revealed && topic.confidence !== 'new' ? (
          <Chip tone={topic.confidence === 'weak' ? 'flag' : 'default'}>
            {CONFIDENCE_LABEL[topic.confidence]}
          </Chip>
        ) : null}
      </div>

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
            <span className="font-mono text-[11.5px] text-ink-3">
              <Kbd>Space</Kbd> reveal · Skip records nothing
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function Complete({ results, count }: { results: GradedResult[]; count: number }) {
  const tally = sessionTally(results)

  return (
    <div className="py-15 text-center">
      <div className="mx-auto mb-[22px] grid size-[88px] place-items-center rounded-full border-2 border-accent font-display text-page-title text-accent">
        {tally.total}
      </div>

      <h1 className="mb-2 font-display text-[27px] font-medium">Session complete</h1>
      <p className="mx-auto mb-[26px] max-w-[44ch] text-ink-2">{sessionSummary(results)}</p>

      <div className="mb-[30px] flex flex-wrap justify-center gap-[26px]">
        {(
          [
            ['didnt-know', "Didn't know"],
            ['partly', 'Partly'],
            ['knew-it', 'Knew it'],
          ] as const
        ).map(([grade, label]) => (
          <div key={grade}>
            <div className="font-display text-[23px] font-medium">{tally[grade]}</div>
            <div className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
              {label}
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
        <Link
          href="/library"
          className="inline-flex cursor-pointer items-center rounded-md border border-transparent px-[18px] py-3 text-body font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          Back to library
        </Link>
      </div>
    </div>
  )
}
