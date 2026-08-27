import Link from 'next/link'
import { PracticeSession } from '@/components/practice/practice-session'
import { StateBlock } from '@/components/ui/state-block'
import { listTopics, signedImageUrl } from '@/lib/data/topics'
import { needsReview } from '@/lib/domain/library'
import type { Topic } from '@/lib/domain/types'
import {
  canPracticeBelowMinimum,
  meetsPracticeMinimum,
  orderForPractice,
  PRACTICE_MINIMUM,
  seededShuffle,
  selectPracticeSession,
} from '@/lib/domain/practice-selection'

/*
  Three ways in, distinguished by the URL:

    /practice              auto-selected session — the 3-topic floor applies
    /practice?topic=<id>   "Practice this" from a topic. One topic, deliberately
                           chosen, so the floor does not apply: the floor exists to
                           stop an auto-selected session from being re-reading the
                           same card, and choosing one card is not that.
    /practice?all=1        the override from the too-few screen. Floor waived.
    /practice?scope=weak   everything that needs review, from the weak page. A set
                           the user chose, so the floor is waived for the same
                           reason as ?topic= — this case did NOT follow from the
                           earlier scheme and was added in phase 9.
*/
export default async function PracticePage({ searchParams }: PageProps<'/practice'>) {
  const { topic: topicId, all, scope } = await searchParams
  const { topics, readAt } = await listTopics()

  const chosen = typeof topicId === 'string' ? topics.filter((t) => t.id === topicId) : null

  if (chosen !== null) {
    if (chosen.length === 0) {
      return (
        <StateBlock
          title="Topic not found"
          body="This topic either doesn't exist or isn't one of yours."
          action={<BackToLibrary />}
        />
      )
    }
    return <PracticeSession queue={chosen} imageUrls={await imageUrls(chosen)} />
  }

  if (scope === 'weak') {
    const weak = orderForPractice(topics.filter(needsReview), { shuffle: seededShuffle(readAt) })
    if (weak.length > 0) return <PracticeSession queue={weak} imageUrls={await imageUrls(weak)} />
  }

  const overridden = all === '1'

  if (!meetsPracticeMinimum(topics.length) && !overridden) {
    return (
      <StateBlock
        eyebrow="Practice"
        title="Not enough to practice yet"
        body={`You have ${topics.length} ${topics.length === 1 ? 'topic' : 'topics'} saved. Practice starts at ${PRACTICE_MINIMUM} — below that it's just re-reading the same card.`}
        action={
          <>
            <Link
              href="/library"
              className="inline-flex cursor-pointer items-center rounded-md border border-accent bg-accent px-[18px] py-3 text-body font-medium text-white hover:border-accent-ink hover:bg-accent-ink"
            >
              + Add a topic
            </Link>
            {/*
              A hard floor that cannot be overridden is the kind of thing that
              makes a personal tool annoying.
            */}
            {canPracticeBelowMinimum(topics.length) ? (
              <Link
                href="/practice?all=1"
                className="inline-flex cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-[18px] py-3 text-body font-medium text-ink hover:border-ink-3"
              >
                Practice the {topics.length} anyway
              </Link>
            ) : null}
          </>
        }
      />
    )
  }

  // Seeded from the read, not from a clock or Math.random — see seededShuffle.
  const queue = selectPracticeSession(topics, { shuffle: seededShuffle(readAt) })

  if (queue.length === 0) {
    return (
      <StateBlock
        eyebrow="Practice"
        title="Nothing to practice yet"
        body="Save a topic first, then come back and try to explain it from memory."
        action={<BackToLibrary />}
      />
    )
  }

  return <PracticeSession queue={queue} imageUrls={await imageUrls(queue)} />
}

/*
  Signed on the server, for the whole queue at once. Signing during the reveal
  would leave a hole in the layout at the exact moment attention is on the answer.
*/
async function imageUrls(queue: Topic[]): Promise<Record<string, string>> {
  const entries = await Promise.all(
    queue
      .filter((topic) => topic.mental_model_image_path !== null)
      .map(async (topic) => [topic.id, await signedImageUrl(topic.mental_model_image_path)] as const),
  )
  return Object.fromEntries(entries.filter(([, url]) => url !== null) as [string, string][])
}

function BackToLibrary() {
  return (
    <Link
      href="/library"
      className="inline-flex cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2.5 text-label font-medium text-ink hover:border-ink-3"
    >
      Back to library
    </Link>
  )
}
