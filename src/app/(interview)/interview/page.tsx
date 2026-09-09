import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Round } from '@/components/interview/round'
import { Setup } from '@/components/interview/setup'
import { ANSWER_MODES, type AnswerMode } from '@/lib/domain/voice'
import { hasKey } from '@/lib/ai/client'
import { pastRounds, readLedgerPool, readTopicPool } from '@/lib/data/interview'
import {
  LENGTHS,
  type Pool,
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

  const { type, minutes, level, mode } = await searchParams
  const roundType = (ROUND_TYPES as readonly string[]).includes(String(type))
    ? (type as RoundType)
    : null
  /*
    Two readings of the same params, and they are not the same question.

    The ROOM needs a length and a level to run, so an absent one takes a default.
    SETUP must be able to say "nothing chosen yet" — defaulting there would
    pre-select two of the three gates and make the disabled button a fiction.
  */
  const chosenLength = (LENGTHS as readonly number[]).includes(Number(minutes))
    ? (Number(minutes) as Length)
    : null
  /*
    Validated like the other three, and defaulting to typing for the same reason
    the setup screen does: a default cannot ask for anything, and voice raises a
    microphone prompt. An unknown value is typing rather than an error — a
    mistyped query string should start a round, not refuse one.
  */
  const answerMode = (ANSWER_MODES as readonly string[]).includes(String(mode))
    ? (mode as AnswerMode)
    : ANSWER_MODES[0]

  const chosenLevel = (LEVELS as readonly string[]).includes(String(level))
    ? (level as Level)
    : null

  const length = chosenLength ?? 45
  const who = chosenLevel ?? ('staff' as Level)

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
        mode={answerMode}
        roundType={roundType}
        minutes={length}
        level={who}
        opening={opening.text}
        openingTopicId={opening.topicId}
        openingTopicTitle={opening.topicTitle}
        openingTopicWeak={opening.topicWeak}
        /* The date rides along — the sparkline labels its columns with it. */
        past={history}
        poolSize={poolSize}
      />
    )
  }

  const [pool, ledger] = await Promise.all([readTopicPool(), readLedgerPool()])

  /*
    Counted per shape, because the three kinds of round draw on different things
    — see `poolLine`. Quizzes are counted apart from topics rather than folded
    in: a category of twenty quizzes and one topic is not an eight-concept round.
  */
  const poolFor = (option: RoundType): Pool => {
    if (option === 'behavioural') {
      return {
        topics: ledger.filter((item) => item.kind === 'adr').length,
        weak: 0,
        quizzes: 0,
        incidents: ledger.filter((item) => item.kind === 'incident').length,
      }
    }

    const mine =
      option === 'mixed' ? pool : pool.filter((topic) => topic.category === CATEGORY[option])

    return {
      topics: mine.filter((topic) => topic.kind === 'topic').length,
      weak: mine.filter((topic) => topic.confidence === 'weak').length,
      quizzes: mine.filter((topic) => topic.kind === 'quiz').length,
      incidents: 0,
    }
  }

  return (
    <Setup
      pools={Object.fromEntries(ROUND_TYPES.map((option) => [option, poolFor(option)])) as Record<RoundType, Pool>}
      minutes={chosenLength}
      level={chosenLevel}
    />
  )
}
