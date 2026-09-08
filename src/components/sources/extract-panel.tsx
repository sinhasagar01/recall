'use client'

import { useEffect, useRef, useState } from 'react'
import { extract, saveExtraction, type ExtractResult } from '@/app/(app)/sources/[id]/actions'
import { Button } from '@/components/ui/button'
import {
  estimateCostRange,
  estimateTokens,
  isTooLong,
  type ReviewedConcept,
} from '@/lib/domain/extraction'
import { plural } from '@/lib/domain/plural'

/**
 * Extract, then review, then save. The order is the feature.
 *
 * ── The review screen lives in client state, deliberately ───────────────────
 * Not a route. A route would need the result to exist somewhere the server can
 * read it back, and the promise this arc makes is that it exists NOWHERE but
 * this browser tab until Save is pressed. Holding it in `useState` is not a
 * layout preference — it is the mechanism, and it is why "extraction produces a
 * review screen and nothing else" is structurally true rather than carefully
 * maintained.
 *
 * ── Cancel stops waiting, and says exactly that ─────────────────────────────
 * A server action is one round trip with no client-reachable abort. Cancelling
 * discards the result when it arrives; the call continues on the server and
 * finishes. And no architecture would make the alternative claim true — tokens
 * already generated are billed whether or not anyone is still waiting for them.
 * The reference drew *"a cancelled call is not billed"*, which is false
 * regardless of how this is built, on the one surface whose whole job is telling
 * the truth about what leaves and what it costs. The copy says what happens.
 *
 * There is no progress bar and no running count for the same reason: one round
 * trip produces no progress to report, and a bar that advances on a timer is a
 * drawing of information nobody has.
 */
export function ExtractPanel({
  sourceId,
  words,
  pass,
}: {
  sourceId: string
  words: number
  /** Which extraction this will be. Recorded on each coverage entry. */
  pass: number
}) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'review'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState<ReviewedConcept[]>([])
  const [partial, setPartial] = useState(false)
  const [saving, setSaving] = useState(false)

  /* Set by Cancel, read when the result lands. */
  const cancelled = useRef(false)

  useEffect(() => {
    if (phase !== 'running') return
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [phase])

  const tooLong = isTooLong(words)
  const cost = estimateCostRange(words)
  const money = (value: number) => `$${value.toFixed(2)}`

  const run = async () => {
    cancelled.current = false
    setError(null)
    setElapsed(0)
    setPhase('running')

    let result: ExtractResult
    try {
      result = await extract(sourceId)
    } catch {
      result = { ok: false, reason: 'The request did not complete. Nothing was saved.' }
    }

    // Cancelled while it was in flight: the result is dropped, unlooked at.
    if (cancelled.current) return

    if (!result.ok) {
      setError(result.reason)
      setPhase('idle')
      return
    }

    setReviewed(result.reviewed)
    setPartial(result.partial)
    setPhase('review')
  }

  const save = async () => {
    setSaving(true)
    const outcome = await saveExtraction(sourceId, reviewed, partial, pass)
    setSaving(false)

    if (outcome.error !== null) {
      setError(outcome.error)
      return
    }
    setPhase('idle')
    setReviewed([])
  }

  const kept = reviewed.filter((entry) => entry.keep)
  const keptQuestions = kept.reduce((total, entry) => total + entry.concept.questions.length, 0)

  if (phase === 'review') {
    return (
      <section data-testid="review-screen" className="rounded-lg border border-rule bg-surface">
        <div className="border-b border-rule px-[18px] py-4">
          <h2 className="font-display text-[20px] font-medium">Review before saving</h2>
          <p className="mt-1 font-mono text-[11.5px] text-ink-3">
            {plural(reviewed.length, 'concept')} found · {kept.length} kept ·{' '}
            {plural(keptQuestions, 'question')} · nothing saved yet
          </p>
          {partial ? (
            <p className="mt-2 rounded-md border border-rule-strong bg-surface-2 px-3 py-2 text-meta text-ink-2">
              The model stopped after {plural(reviewed.length, 'concept')}. Review and save these,
              or discard and try again — nothing has been saved either way.
            </p>
          ) : null}
        </div>

        <ul className="list-none">
          {reviewed.map((entry, index) => (
            <li
              key={`${entry.concept.title}-${index}`}
              data-testid="review-row"
              data-keep={entry.keep}
              className={`flex items-start gap-3.5 border-b border-rule px-[18px] py-3.5 last:border-b-0 ${
                entry.keep ? '' : 'bg-surface-2'
              }`}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={entry.keep}
                aria-label={`Keep ${entry.concept.title}`}
                onClick={() =>
                  setReviewed((current) =>
                    current.map((item, position) =>
                      position === index ? { ...item, keep: !item.keep } : item,
                    ),
                  )
                }
                className="-m-[13px] mt-[-11px] grid size-[44px] flex-none cursor-pointer place-items-center rounded"
              >
                <span
                  className={`grid size-[18px] place-items-center rounded border text-[10px] ${
                    entry.keep ? 'border-ink bg-ink text-surface' : 'border-rule-strong'
                  }`}
                >
                  {entry.keep ? '✓' : ''}
                </span>
              </button>

              <div className="min-w-0 flex-1">
                <p
                  className={`font-display text-[17px] leading-[1.3] font-medium ${
                    entry.keep ? '' : 'text-ink-3 line-through decoration-rule-strong'
                  }`}
                >
                  {entry.concept.title}
                </p>
                <p className="mt-1 text-meta leading-[1.55] text-ink-2">
                  {entry.concept.definition}
                </p>
              </div>

              <span className="flex-none pt-1 text-right font-mono text-[10.5px] text-ink-3">
                {entry.duplicateOf !== null ? (
                  <span data-testid="already-saved">already saved</span>
                ) : (
                  plural(entry.concept.questions.length, 'question')
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3 border-t border-rule px-[18px] py-3.5">
          <Button variant="primary" onClick={save} loading={saving} loadingLabel="Saving…">
            Save {plural(kept.length, 'topic')} and {plural(keptQuestions, 'question')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setReviewed([])
              setPhase('idle')
            }}
          >
            Discard everything
          </Button>
          <span className="font-mono text-[11px] text-ink-3">
            Each links to this source · nothing is saved until you press this
          </span>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-lg border border-rule bg-surface px-[20px] py-[17px]">
      {error ? (
        <p
          role="alert"
          data-testid="extract-error"
          className="mb-3 rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag"
        >
          {error}
        </p>
      ) : null}

      {tooLong ? (
        <>
          <p className="text-body font-medium">
            This transcript is {words.toLocaleString()} words — too long for one pass
          </p>
          <p className="mt-1 text-meta text-ink-2">
            Extract it in halves: paste the first part, extract, then edit the source and paste
            the rest. Coverage merges both passes.
          </p>
          <p className="mt-2 font-mono text-[11px] text-ink-3">
            Named before you press, so you never pay for a call that cannot succeed.
          </p>
        </>
      ) : phase === 'running' ? (
        <>
          <p className="text-body font-medium">Reading the transcript…</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button loading loadingLabel="Extracting">
              Extracting
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                cancelled.current = true
                setPhase('idle')
              }}
            >
              Cancel
            </Button>
            <span className="font-mono text-[11px] text-ink-3">
              {elapsed}s elapsed · usually 20–40s
            </span>
          </div>
          <p className="mt-2 font-mono text-[11px] text-ink-3">
            Cancelling stops waiting. The call may still finish, and you may still be billed for
            it.
          </p>
        </>
      ) : (
        <>
          <p className="text-body font-medium">Extract everything from this transcript</p>
          <p className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 font-mono text-[11.5px] text-ink-3">
            <span>sends the transcript · {words.toLocaleString()} words</span>
            <span aria-hidden="true">·</span>
            <span>≈ {estimateTokens(words).toLocaleString()} tokens in</span>
            <span aria-hidden="true">·</span>
            {/*
              A RANGE, not a figure. How much comes back depends on how many
              concepts the video contains, which is the thing being paid to find
              out — and the token estimate itself is ±25%, worse on code-heavy
              transcripts. A confidently wrong number is worse than an honest span.
            */}
            <span data-testid="cost-estimate">
              about {money(cost.low)}–{money(cost.high)}
            </span>
            <span aria-hidden="true">·</span>
            <span>20–40 seconds</span>
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={run}>
              Extract
            </Button>
            <span className="font-mono text-[11px] text-ink-3">
              Nothing is saved until you review it
            </span>
          </div>
        </>
      )}
    </section>
  )
}
