import Link from 'next/link'
import { PracticeSession } from '@/components/practice/practice-session'
import { StateBlock } from '@/components/ui/state-block'
import { topicIdsForSource } from '@/lib/data/extraction'
import { topicIdsForChapter, topicIdsForCourse } from '@/lib/data/sources'
import { railCounts } from '@/lib/data/library'
import { practiceQueue } from '@/lib/data/practice'
import { getTopic, signedImageUrl } from '@/lib/data/topics'
import type { Topic } from '@/lib/domain/types'
import { BackToLibrary } from '@/components/ui/back-to-library'
import {
  canPracticeBelowMinimum,
  meetsPracticeMinimum,
  PRACTICE_MINIMUM,
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
    /practice?scope=source&id=<id>
                           everything one video produced, from its workspace.
                           Same chosen-set shape again. Note this page names NO
                           source column: the ids are resolved by a module that
                           knows what a source is, and the queue is handed a list
                           it cannot trace back. That is what lets
                           sources-boundary.test.ts stay absolute — see
                           ARCHITECTURE.md.

                           The guard bit here once already, on COPY rather than
                           code: an empty state named one of the forbidden
                           columns in an English sentence. The fix was the
                           sentence, not an exception — this screen has no
                           business naming that concept in either register.
    /practice?scope=quiz   quizzes only. Same shape as ?scope=weak: a chosen set,
                           the same PRACTICE_SESSION_SIZE cap, the same waived
                           floor. Note this is the SEPARATION, not the rule — the
                           default session above already mixes both shapes, and
                           excluding quizzes from it would leave a quiz you are
                           weak at waiting for you to come looking.
*/
export default async function PracticePage({ searchParams }: PageProps<'/practice'>) {
  const { topic: topicId, all, scope, id, course, chapter } = await searchParams

  /*
    The queue is built by the query now, not by reading the library and ordering it
    here. See src/lib/data/practice.ts and the 20260905160000 migration: the same
    bucket-then-staleness ordering, with the tie-break seeded from the read.
  */
  const readAt = new Date().toISOString()

  const chosen = typeof topicId === 'string' ? await getTopic(topicId) : null

  if (typeof topicId === 'string') {
    if (chosen === null) {
      return (
        <StateBlock
          title="Topic not found"
          body="This topic either doesn't exist or isn't one of yours."
          action={<BackToLibrary />}
        />
      )
    }
    const one = [chosen]
    return <PracticeSession queue={one} imageUrls={await imageUrls(one)} seed={readAt} />
  }

  if (scope === 'weak') {
    /*
      A chosen set, so the three-topic floor still does not apply — the same
      reasoning as "Practice this" from a topic's detail page, established in
      phase 9. What HAS changed is the size: this used to queue every topic that
      needed review, which was the one entry point ignoring the session size. Ten
      at a time is what a session has always meant.
    */
    const weak = await practiceQueue({ seed: readAt, weakOnly: true })
    if (weak.length > 0)
      return <PracticeSession queue={weak} imageUrls={await imageUrls(weak)} seed={readAt} />
  }

  if (scope === 'source' && typeof id === 'string') {
    const ids = await topicIdsForSource(id)

    if (ids.length === 0) {
      return (
        <StateBlock
          eyebrow="Practice"
          title="Nothing from this source yet"
          body="Extract from it, or distil a topic by hand, and this becomes a session of everything the video taught."
          action={<BackToLibrary />}
        />
      )
    }

    const set = await practiceQueue({ seed: readAt, ids })
    return <PracticeSession queue={set} imageUrls={await imageUrls(set)} seed={readAt} />
  }

  /*
    Arc 2.1: the same chosen-set shape, one and two levels up. Note this page
    still names no source column — `lib/data/sources.ts` resolves the ids and
    hands over a plain list, so the queue cannot trace them back.
  */
  if ((scope === 'course' || scope === 'chapter') && typeof course === 'string') {
    const ids =
      scope === 'chapter' && typeof chapter === 'string'
        ? await topicIdsForChapter(course, chapter)
        : await topicIdsForCourse(course)

    if (ids.length === 0) {
      return (
        <StateBlock
          eyebrow="Practice"
          title="Nothing from this yet"
          body="Distil a topic from one of these lessons, or extract from one, and this becomes a session of everything they taught."
          action={<BackToLibrary />}
        />
      )
    }

    const set = await practiceQueue({ seed: readAt, ids })
    return <PracticeSession queue={set} imageUrls={await imageUrls(set)} seed={readAt} />
  }

  if (scope === 'quiz') {
    const quizzes = await practiceQueue({ seed: readAt, kinds: ['quiz'] })

    if (quizzes.length === 0) {
      return (
        <StateBlock
          eyebrow="Practice"
          title="No quizzes yet"
          body="A quiz is a question you write yourself, with a couple of options and one right answer. Add one from the library and it'll show up here."
          action={<BackToLibrary />}
        />
      )
    }

    return <PracticeSession queue={quizzes} imageUrls={{}} seed={readAt} />
  }

  const overridden = all === '1'
  const { total } = await railCounts()

  if (!meetsPracticeMinimum(total) && !overridden) {
    return (
      <StateBlock
        eyebrow="Practice"
        title="Not enough to practice yet"
        body={`You have ${total} ${total === 1 ? 'topic' : 'topics'} saved. Practice starts at ${PRACTICE_MINIMUM} — below that it's just re-reading the same card.`}
        action={
          <>
            {/*
              `?add=1`, not `/library`. It said "+ Add a topic" and delivered you
              to the library with no form open — the label promised the thing the
              destination did not do. The FAB and the N shortcut both use this
              parameter; this is the third caller, not a new mechanism.
            */}
            <Link
              href="/library?add=1"
              className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-accent bg-accent px-[18px] py-3 text-body font-medium text-white hover:border-accent-ink hover:bg-accent-ink"
            >
              + Add a topic
            </Link>
            {/*
              And a plain way back, because the one above is an action rather
              than a destination. This state was the only route in the group
              whose sole /library link was labelled something else.
            */}
            <BackToLibrary />
            {/*
              A hard floor that cannot be overridden is the kind of thing that
              makes a personal tool annoying.
            */}
            {canPracticeBelowMinimum(total) ? (
              <Link
                href="/practice?all=1"
                className="inline-flex cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-[18px] py-3 text-body font-medium text-ink hover:border-ink-3"
              >
                Practice the {total} anyway
              </Link>
            ) : null}
          </>
        }
      />
    )
  }

  // Seeded from the read, not from a clock or Math.random — same property the
  // injected seededShuffle had, now satisfied by the query's md5 tie-break.
  const queue = await practiceQueue({ seed: readAt })

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

  return <PracticeSession queue={queue} imageUrls={await imageUrls(queue)} seed={readAt} />
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

