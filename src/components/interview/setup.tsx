import Link from 'next/link'
import {
  LENGTHS,
  LEVELS,
  ROUND_TYPES,
  estimateRoundCost,
  questionCount,
  HINTS_PER_ROUND,
  EXCHANGE_CAP,
  type Length,
  type Level,
  type RoundType,
} from '@/lib/domain/interview'
import { plural } from '@/lib/domain/plural'

/**
 * Set up a round.
 *
 * ── Type plus duration sets the shape ───────────────────────────────────────
 * Never a minutes-per-question slider. Forty-five minutes of concepts is eight
 * questions with follow-ups; the number falls out of the pair rather than being
 * dialled.
 *
 * ── The pool line is read from your data ────────────────────────────────────
 * And it says honestly when a round would be thin. Nothing is asked that you have
 * not saved, so a category with four topics cannot fill an eight-question round
 * and the card says so before you press.
 *
 * ── Session one ships five types ────────────────────────────────────────────
 * DSA and System design are ABSENT, not disabled — they need their own runners
 * and neither is built. The shipped rule from the quiz options: a disabled
 * control still says there is something here.
 *
 * ── Entering the room is the opt-in ─────────────────────────────────────────
 * No model call happens on this screen. The cost range is on the button before
 * you press it, and it is a range for arc 6's reason: how much comes back is the
 * thing you are paying to find out.
 */
const LEVEL_LABEL: Record<Level, { name: string; how: string }> = {
  friendly: { name: 'Friendly senior', how: 'nudges, accepts a good direction' },
  staff: { name: 'Staff, terse', how: 'two follow-ups, no encouragement' },
  skeptical: { name: 'Skeptical principal', how: 'pushes until you concede or hold' },
}

const TYPE_LABEL: Record<RoundType, { name: string; how: string }> = {
  javascript: { name: 'JavaScript', how: 'Concepts, escalating follow-ups' },
  react: { name: 'React', how: 'Concepts, escalating follow-ups' },
  typescript: { name: 'TypeScript', how: 'Concepts, escalating follow-ups' },
  behavioural: { name: 'Behavioural', how: 'Drawn from your ledger' },
  mixed: { name: 'Mixed', how: 'A real loop, every shape you have' },
}

export interface Pool {
  topics: number
  weak: number
}

export function Setup({
  pools,
  minutes,
  level,
}: {
  pools: Record<RoundType, Pool>
  minutes: Length
  level: Level
}) {
  const cost = estimateRoundCost(minutes)
  const money = (value: number) => `$${value.toFixed(2)}`
  const questions = questionCount(minutes)
  const href = (next: { minutes?: Length; level?: Level }) =>
    `/interview?minutes=${next.minutes ?? minutes}&level=${next.level ?? level}`

  return (
    <main className="mx-auto max-w-[1020px] px-6 py-8">
      <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">
        Set up a round
      </h1>
      <p className="mt-1.5 max-w-[62ch] text-meta text-ink-2">
        Every question comes from your own library. Nothing is asked that you have not saved.
      </p>

      <h2 className="mt-7 mb-3 font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
        Round
      </h2>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {ROUND_TYPES.map((option) => {
          const pool = pools[option]
          const thin = pool.topics < questions

          return (
            <Link
              key={option}
              href={`/interview?type=${option}&minutes=${minutes}&level=${level}`}
              data-testid={`round-type-${option}`}
              className="rounded-lg border border-rule bg-surface p-4 hover:border-[var(--volt)]"
            >
              <span className="block text-body font-medium">{TYPE_LABEL[option].name}</span>
              <span className="mt-0.5 block text-meta text-ink-2">{TYPE_LABEL[option].how}</span>
              <span className="mt-2 block font-mono text-[11px] text-ink-3">
                {option === 'behavioural'
                  ? plural(pool.topics, 'decision')
                  : plural(pool.topics, 'topic')}
                {pool.weak > 0 ? ` · ${pool.weak} weak` : ''}
                {/* Says honestly when a round would be thin, rather than starting one. */}
                {thin ? (
                  <span className="text-[var(--gold-ink)]"> · thin for {minutes} min</span>
                ) : null}
              </span>
            </Link>
          )
        })}
      </div>

      <h2 className="mt-7 mb-3 font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
        Length
      </h2>
      <div className="flex flex-wrap gap-2.5">
        {LENGTHS.map((option) => (
          <Link
            key={option}
            href={href({ minutes: option })}
            aria-current={option === minutes ? 'true' : undefined}
            data-testid={`length-${option}`}
            className={`rounded-md border px-4 py-2.5 ${
              option === minutes
                ? 'border-[var(--volt)] bg-[var(--volt-soft)] text-[var(--volt-ink)]'
                : 'border-rule-strong bg-surface text-ink hover:border-ink-3'
            }`}
          >
            <span className="block text-label font-medium">{option} min</span>
            <span className="block font-mono text-[10.5px] text-ink-3">
              {plural(questionCount(option), 'concept')}
            </span>
          </Link>
        ))}
      </div>

      <h2 className="mt-7 mb-3 font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
        Who is interviewing you
      </h2>
      <div className="flex flex-wrap gap-2.5">
        {LEVELS.map((option) => (
          <Link
            key={option}
            href={href({ level: option })}
            aria-current={option === level ? 'true' : undefined}
            data-testid={`level-${option}`}
            className={`rounded-md border px-4 py-2.5 ${
              option === level
                ? 'border-[var(--volt)] bg-[var(--volt-soft)] text-[var(--volt-ink)]'
                : 'border-rule-strong bg-surface text-ink hover:border-ink-3'
            }`}
          >
            <span className="block text-label font-medium">{LEVEL_LABEL[option].name}</span>
            <span className="block font-mono text-[10.5px] text-ink-3">
              {LEVEL_LABEL[option].how}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-7 rounded-xl border border-rule bg-surface p-5 shadow-[0_1px_2px_rgba(18,19,26,.05)]">
        <p className="font-mono text-[11px] text-ink-3">
          {minutes} minutes · {LEVEL_LABEL[level].name.toLowerCase()} · typing
        </p>
        <p className="mt-1 text-body font-medium">
          {plural(questions, 'concept')}, weighted toward weak
        </p>
        <p className="mt-1 max-w-[64ch] text-meta text-ink-2">
          The ones you grade weak come first. {plural(HINTS_PER_ROUND, 'hint')} available, each
          visible on the scorecard. Pick a round above to begin.
        </p>

        <p className="mt-4 font-mono text-[11px] text-ink-3" data-testid="cost-estimate">
          ≈ {Math.round(cost.lowTokens / 1000)}k–{Math.round(cost.highTokens / 1000)}k tokens ·{' '}
          {money(cost.lowUsd)}–{money(cost.highUsd)} · resent each turn · capped at {EXCHANGE_CAP}{' '}
          exchanges
        </p>
      </div>

      {/*
        The rules tab claimed "the setup screen says so" about losing a round, and
        the reference's setup screen said nothing of the kind. A round you cannot
        resume must say so BEFORE you enter, not in an appendix.
      */}
      <p className="mt-4 max-w-[62ch] border-t border-rule pt-4 font-mono text-[11px] text-ink-3">
        A round is never resumed. Leaving this page, refreshing or closing the tab loses it —
        forty-five minutes of continuous attention or it is not a round.
      </p>
    </main>
  )
}
