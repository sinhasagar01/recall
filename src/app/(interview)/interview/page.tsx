import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Round } from '@/components/interview/round'
import { Setup, type Pool } from '@/components/interview/setup'
import { hasKey } from '@/lib/ai/client'
import { pastRounds, readLedgerPool, readTopicPool } from '@/lib/data/interview'
import {
  LENGTHS,
  LEVELS,
  ROUND_TYPES,
  type Length,
  type Level,
  type RoundType,
} from '@/lib/domain/interview'
import { speak } from './actions'

/*
  Setup, then the room. Session one ships five types; DSA and System design are
  absent from this screen entirely — absent, not disabled, per the shipped rule.

  No key means no interview mode at all: not a disabled entry, not an explanation
  of what you are missing. The whole route is `notFound`.

  ── Entering the room is the opt-in ─────────────────────────────────────────
  No model call happens on load. The first question is asked when you press, and
  the cost range is on the button before you do.
*/
const CATEGORY: Record<string, string> = {
  javascript: 'JavaScript',
  react: 'React',
  typescript: 'TypeScript',
}

export default async function InterviewPage({ searchParams }: PageProps<'/interview'>) {
  if (!hasKey()) notFound()

  const { type, minutes, level } = await searchParams
  const roundType = (ROUND_TYPES as readonly string[]).includes(String(type))
    ? (type as RoundType)
    : null
  const length = (LENGTHS as readonly number[]).includes(Number(minutes))
    ? (Number(minutes) as Length)
    : 45
  const who = (LEVELS as readonly string[]).includes(String(level))
    ? (level as Level)
    : ('staff' as Level)

  if (roundType !== null) {
    const opening = await speak({ roundType, level: who, turns: [], intent: 'ask' })
    if (!opening.ok) {
      return (
        <main className="mx-auto max-w-[720px] px-6 py-8">
          <h1 className="font-display text-page-title font-medium">The room did not open</h1>
          <p role="alert" className="mt-3 rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag">
            {opening.reason}
          </p>
          <p className="mt-4 text-meta">
            <Link href="/interview" className="text-accent-ink underline">Back to setup</Link>
          </p>
        </main>
      )
    }
    const [history, allTopics, ledgerItems] = await Promise.all([
      pastRounds(roundType),
      readTopicPool(),
      readLedgerPool(),
    ])
    const poolSize =
      roundType === 'behavioural'
        ? ledgerItems.length
        : roundType === 'mixed'
          ? allTopics.length
          : allTopics.filter((topic) => topic.category === CATEGORY[roundType]).length

    return (
      <Round
        roundType={roundType}
        minutes={length}
        level={who}
        opening={opening.text}
        past={history.map((round) => round.overall)}
        poolSize={poolSize}
      />
    )
  }

  const [pool, ledger] = await Promise.all([readTopicPool(), readLedgerPool()])

  const poolFor = (option: RoundType): Pool => {
    if (option === 'behavioural') return { topics: ledger.length, weak: 0 }
    if (option === 'mixed') return { topics: pool.length, weak: pool.filter((t) => t.confidence === 'weak').length }
    const category = CATEGORY[option]
    const mine = pool.filter((topic) => topic.category === category)
    return { topics: mine.length, weak: mine.filter((topic) => topic.confidence === 'weak').length }
  }

  return (
    <Setup
      pools={Object.fromEntries(ROUND_TYPES.map((option) => [option, poolFor(option)])) as Record<RoundType, Pool>}
      minutes={length}
      level={who}
    />
  )
}
