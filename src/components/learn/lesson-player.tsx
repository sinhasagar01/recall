'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LearnCodeEditor } from '@/components/learn/learn-code-editor'
import type { LearningLesson } from '@/lib/domain/learning'
import { markLearningLessonComplete } from '@/app/(app)/learn/actions'

type Stage = 0 | 1 | 2 | 3

const STAGES = [
  { label: 'Learn it', detail: 'Read the idea' },
  { label: 'Recall it', detail: 'Explain from memory' },
  { label: 'Apply it', detail: 'Use it in a new case' },
  { label: 'Finish', detail: 'Keep the takeaway' },
] as const

export function LessonPlayer({ lesson, sourceId }: { lesson: LearningLesson; sourceId: string }) {
  const [stage, setStage] = useState<Stage>(0)
  const [furthestStage, setFurthestStage] = useState<Stage>(0)
  const [recall, setRecall] = useState('')
  const [showReference, setShowReference] = useState(false)
  const [completionError, setCompletionError] = useState<string | null>(null)
  const [savingCompletion, startCompletion] = useTransition()

  const goTo = (next: Stage) => {
    setStage(next)
    setFurthestStage((current) => Math.max(current, next) as Stage)
  }
  const complete = () => {
    goTo(3)
    startCompletion(async () => {
      const result = await markLearningLessonComplete(sourceId)
      setCompletionError(result.error)
    })
  }

  return (
    <section className="overflow-hidden rounded-[18px] border border-rule bg-[#f7f7fc] shadow-card">
      <header className="flex items-center justify-between border-b border-rule bg-surface px-6 py-5 md:px-9">
        <div className="min-w-0">
          <p className="font-mono text-mono-sm tracking-[.14em] text-accent uppercase">Guided lesson</p>
          <h1 className="mt-1 truncate font-display text-[28px] font-semibold tracking-[-.025em] md:text-[36px]">{lesson.title}</h1>
        </div>
        <span className="hidden rounded-full border border-rule bg-surface-2 px-3 py-2 font-mono text-mono-sm text-ink-2 sm:block">≈ 5 minutes</span>
      </header>

      <div className="px-5 py-7 md:px-9 md:py-9">
        <p className="max-w-3xl text-register text-ink-2">Understand the idea, retrieve it without notes, then use it in a new situation.</p>
        <Progress stage={stage} furthestStage={furthestStage} onSelect={setStage} />

        <article className="mt-7 overflow-hidden rounded-2xl border border-rule bg-surface shadow-[0_10px_26px_rgba(39,37,70,.045)]">
          {stage === 0 ? <LearnStage lesson={lesson} onNext={() => goTo(1)} /> : null}
          {stage === 1 ? <RecallStage lesson={lesson} value={recall} onChange={setRecall} showReference={showReference} onReveal={() => setShowReference(true)} onNext={() => goTo(2)} /> : null}
          {stage === 2 ? <ApplyStage lesson={lesson} onComplete={complete} /> : null}
          {stage === 3 ? <FinishStage lesson={lesson} onReview={() => setStage(0)} savingCompletion={savingCompletion} completionError={completionError} /> : null}
        </article>
      </div>
    </section>
  )
}

function Progress({ stage, furthestStage, onSelect }: { stage: Stage; furthestStage: Stage; onSelect: (stage: Stage) => void }) {
  return (
    <ol className="mt-7 grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Lesson progress">
      {STAGES.map((item, index) => {
        const itemStage = index as Stage
        const complete = itemStage < furthestStage
        const active = itemStage === stage
        const available = itemStage <= furthestStage
        return <li key={item.label}><button type="button" disabled={!available} onClick={() => onSelect(itemStage)} aria-current={active ? 'step' : undefined} className={`min-h-[76px] w-full rounded-xl border px-3 text-left transition ${active ? 'border-[#716bf0] bg-[#eeedff] text-accent-ink shadow-[0_0_0_2px_rgba(63,58,199,.08)]' : complete ? 'border-[#b9dfca] bg-[#f5fcf8] text-ok hover:border-ok' : 'border-rule bg-surface text-ink-3 disabled:cursor-not-allowed disabled:opacity-70'}`}><span className={`mr-2 inline-grid size-6 place-items-center rounded-full font-mono text-mono-sm ${active ? 'bg-accent text-white' : complete ? 'bg-ok-soft text-ok' : 'bg-surface-3 text-ink-3'}`}>{complete ? '✓' : index + 1}</span><span className="font-medium">{item.label}</span><span className="mt-1 block pl-8 text-[12px] leading-none opacity-75">{item.detail}</span></button></li>
      })}
    </ol>
  )
}

function LearnStage({ lesson, onNext }: { lesson: LearningLesson; onNext: () => void }) {
  return <Pane side={<><b className="font-display text-[23px] text-accent">Read for the mechanism</b><p className="mt-3">Do not try to memorise every sentence. Look for the one relationship that makes the example work.</p></>}><Eyebrow>Get the idea</Eyebrow><h2 className="mt-2 font-display text-[40px] font-semibold leading-[1.1] tracking-[-.025em] md:text-[46px]">What is happening here?</h2><RichText value={lesson.read_once} />{lesson.code_example ? <CodeEditor code={lesson.code_example} language={lesson.code_language} /> : null}<div className="mt-8 flex justify-end"><Button variant="primary" size="lg" onClick={onNext}>I understand the idea →</Button></div></Pane>
}

function RecallStage({ lesson, value, onChange, showReference, onReveal, onNext }: { lesson: LearningLesson; value: string; onChange: (value: string) => void; showReference: boolean; onReveal: () => void; onNext: () => void }) {
  return <Pane side={<><b className="font-display text-[23px] text-accent">Think before checking</b><p className="mt-3">Retrieving an answer strengthens learning more than reading it again. A rough explanation is enough.</p></>}><Eyebrow>Recall it</Eyebrow><h2 className="mt-2 max-w-4xl font-display text-[36px] font-semibold leading-[1.15] tracking-[-.02em] md:text-[42px]">{lesson.recall_prompt}</h2><label className="mt-6 block font-mono text-mono-sm tracking-[.12em] text-ink-3 uppercase" htmlFor="lesson-recall">Your explanation</label><textarea id="lesson-recall" value={value} onChange={(event) => onChange(event.target.value)} rows={6} placeholder="Explain it in your own words…" className="mt-3 w-full rounded-xl border border-rule-strong bg-[#fcfcff] px-4 py-3 text-register leading-[1.55] outline-none placeholder:text-ink-3 focus:border-accent" />{showReference ? <Answer label="Reference answer" value={lesson.recall_answer} /> : null}<div className="mt-6 flex flex-wrap items-center justify-between gap-3"><button type="button" className="font-medium text-accent hover:text-accent-ink" onClick={onReveal}>{showReference ? 'Reference answer shown' : 'Reveal reference answer'}</button><Button variant="primary" size="lg" disabled={value.trim().length === 0} onClick={onNext}>Use the idea →</Button></div></Pane>
}

function ApplyStage({ lesson, onComplete }: { lesson: LearningLesson; onComplete: () => void }) {
  const hasTrace = Boolean(lesson.code_example && lesson.trace_steps.length > 1)
  const [activity, setActivity] = useState<'trace' | 'quiz'>(hasTrace ? 'trace' : 'quiz')
  return activity === 'trace' ? <TraceActivity lesson={lesson} onNext={() => setActivity('quiz')} /> : <QuizActivity lesson={lesson} onComplete={onComplete} />
}

function TraceActivity({ lesson, onNext }: { lesson: LearningLesson; onNext: () => void }) {
  const [trace, setTrace] = useState(0)
  const current = lesson.trace_steps[trace] ?? lesson.trace_steps[0]
  return <div className="p-6 md:p-9"><Eyebrow>Apply it · worked example</Eyebrow><h2 className="mt-2 font-display text-[40px] font-semibold leading-[1.1] tracking-[-.025em] md:text-[46px]">{lesson.trace_title}</h2><p className="mt-6 max-w-5xl text-[19px] leading-[1.6] text-ink-2 md:text-[21px]">{current}</p>{lesson.code_example ? <CodeEditor code={lesson.code_example} language={lesson.code_language} compact /> : null}<div className="mt-6 grid gap-3 md:grid-cols-3">{lesson.trace_steps.slice(0, 3).map((item, index) => <button key={item} type="button" onClick={() => setTrace(index)} className={`rounded-2xl border p-5 text-left ${trace === index ? 'border-[#716bf0] bg-[#f2f1ff] text-accent-ink' : 'border-rule text-ink-2 hover:border-rule-strong'}`}><b className="block font-medium">Pass {index + 1}</b><span className="mt-2 block text-sm leading-[1.45] text-ink-3">{shortTrace(item)}</span></button>)}</div><div className="mt-8 flex justify-end"><Button variant="primary" size="lg" onClick={onNext}>Try a new case →</Button></div></div>
}

function QuizActivity({ lesson, onComplete }: { lesson: LearningLesson; onComplete: () => void }) {
  const quizzes = lesson.transfer_quizzes?.length ? lesson.transfer_quizzes : [{ prompt: lesson.transfer_prompt, options: [], correct_option: 0, explanation: lesson.transfer_answer }]
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const quiz = quizzes[index]
  const isCorrect = picked === quiz.correct_option
  const canContinue = picked !== null && (quiz.options.length === 0 || isCorrect)
  const advance = () => {
    if (!canContinue) return
    if (index < quizzes.length - 1) { setIndex(index + 1); setPicked(null); return }
    onComplete()
  }
  return <Pane side={<><b className="font-display text-[23px] text-accent">Use it, do not repeat it</b><p className="mt-3">A new case tests whether you understand the rule—not whether you remember the original wording.</p></>}><Eyebrow>Apply it · question {index + 1} of {quizzes.length}</Eyebrow><h2 className="mt-2 font-display text-[40px] font-semibold leading-[1.1] tracking-[-.025em] md:text-[46px]">Can you use the idea in a new case?</h2><p className="mt-6 text-[19px] leading-[1.6] text-ink-2 md:text-[21px]">{quiz.prompt}</p>{quiz.options.length > 0 ? <div className="mt-6 grid gap-3">{quiz.options.map((option, optionIndex) => <button key={option} type="button" onClick={() => setPicked(optionIndex)} className={`flex min-h-16 items-center gap-4 rounded-2xl border px-5 py-3 text-left text-[18px] transition md:text-[20px] ${picked === optionIndex ? isCorrect ? 'border-[#7bc89c] bg-[#f2fbf5] text-ok' : 'border-[#e59b9b] bg-[#fff6f5] text-flag' : 'border-rule text-ink-2 hover:border-rule-strong'}`}><span className={`size-6 shrink-0 rounded-full border-2 ${picked === optionIndex ? 'border-[7px]' : 'border-rule-strong'}`} />{option}</button>)}</div> : <Answer label="Takeaway" value={quiz.explanation} />}{picked !== null && quiz.options.length > 0 ? <Answer label={isCorrect ? 'Correct' : 'Try again'} value={isCorrect ? quiz.explanation : 'That answer does not follow the rule. Re-read the question and choose another answer.'} positive={isCorrect} /> : null}<div className="mt-8 flex justify-end"><Button variant="primary" size="lg" disabled={!canContinue} onClick={advance}>{index < quizzes.length - 1 ? 'Next question →' : 'Finish lesson →'}</Button></div></Pane>
}

function FinishStage({ lesson, onReview, savingCompletion, completionError }: { lesson: LearningLesson; onReview: () => void; savingCompletion: boolean; completionError: string | null }) {
  return <div className="p-6 md:p-9"><Eyebrow>Lesson complete</Eyebrow><h2 className="mt-2 font-display text-[40px] font-semibold leading-[1.1] tracking-[-.025em] md:text-[46px]">You can now explain and use this idea.</h2><p className="mt-5 max-w-4xl text-[19px] leading-[1.6] text-ink-2 md:text-[21px]">You read the mechanism, retrieved it from memory, and applied it in a new case. Come back when you want a quick refresher—this lesson stays separate from your Library.</p><div className="mt-7 grid gap-3 md:grid-cols-3"><Prompt label="Core idea" value={lesson.recall_prompt} /><Prompt label="Use it" value={lesson.transfer_prompt} /><Prompt label="Next time" value="Try to explain the idea before opening the lesson." /></div><div className="mt-7 rounded-2xl border border-[#d5d2ff] bg-[#f1f0ff] p-6 text-[18px] leading-[1.55] text-accent-ink md:text-[20px]"><b>Nice work.</b> {savingCompletion ? 'Saving your completed lesson…' : completionError ? completionError : 'You completed the learning loop. Revisit this lesson later, or start another transcript when you are ready.'}</div><div className="mt-8 flex flex-wrap items-center justify-between gap-3"><button type="button" className="font-medium text-accent hover:text-accent-ink" onClick={onReview}>Review this lesson</button><Link href="/learn" className="inline-flex items-center rounded-md border border-accent bg-accent px-[18px] py-3 font-body text-body font-medium text-white hover:border-accent-ink hover:bg-accent-ink">Back to Learn</Link></div></div>
}

function Pane({ children, side }: { children: React.ReactNode; side: React.ReactNode }) {
  return <div className="grid gap-7 p-6 md:grid-cols-[minmax(0,1fr)_280px] md:p-9"><div>{children}</div><aside className="h-fit rounded-xl border border-[#e1e0ef] bg-[#f7f7fc] p-5 text-body leading-[1.65] text-ink-2">{side}</aside></div>
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-mono-sm tracking-[.14em] text-ink-3 uppercase">{children}</p>
}

function CodeEditor({ code, language, compact = false }: { code: string; language: string | null; compact?: boolean }) {
  return <div className={`mt-6 overflow-hidden rounded-xl border border-[#30363d] bg-[#0d1117] ${compact ? '' : 'shadow-[0_8px_20px_rgba(13,17,23,.18)]'}`}><div className="flex items-center justify-between border-b border-[#30363d] bg-[#161b22] px-4 py-2 font-mono text-[10px] tracking-[.14em] text-[#8b949e] uppercase"><span>{language ?? 'Code example'}</span><span className="rounded bg-[#30363d] px-2 py-1 text-[#c9d1d9] normal-case">GitHub Dark</span></div><LearnCodeEditor code={code} language={language} /></div>
}

function Answer({ label, value, positive = true }: { label: string; value: string; positive?: boolean }) {
  return <div className={`mt-4 rounded-xl border p-4 ${positive ? 'border-[#c8e8d5] bg-ok-soft' : 'border-[#f2cbcb] bg-[#fff6f5]'}`}><p className={`font-mono text-mono-sm tracking-[.1em] uppercase ${positive ? 'text-ok' : 'text-flag'}`}>{label}</p><p className="mt-2 leading-[1.65]">{value}</p></div>
}

function Prompt({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-rule p-6"><Eyebrow>{label}</Eyebrow><p className="mt-4 font-display text-[23px] font-semibold leading-[1.25]">{value}</p></div>
}

function RichText({ value }: { value: string }) {
  return <div className="mt-6 space-y-6 text-[19px] leading-[1.75] text-ink md:text-[21px]">{value.split('\n\n').map((paragraph, index) => paragraph.startsWith('- ') ? <ul key={index} className="list-disc space-y-3 pl-7 marker:text-accent">{paragraph.split('\n').map((item) => <li key={item}>{inline(item.slice(2))}</li>)}</ul> : <p key={index} className="max-w-[72ch]">{inline(paragraph)}</p>)}</div>
}

function inline(value: string): React.ReactNode[] {
  return value.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean).map((part, index) => part.startsWith('`') ? <code key={index} className="rounded-md border border-[#dedcf1] bg-[#f2f1fb] px-1.5 py-0.5 font-mono text-[.86em] text-accent-ink">{part.slice(1, -1)}</code> : part.startsWith('**') ? <strong key={index} className="font-semibold text-[#2f2a9b]">{part.slice(2, -2)}</strong> : part.startsWith('*') ? <em key={index}>{part.slice(1, -1)}</em> : part)
}

function shortTrace(value: string) {
  return value.length > 80 ? `${value.slice(0, 77)}…` : value
}
