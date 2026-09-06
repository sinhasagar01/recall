import Link from 'next/link'
import { ConfidenceMeter } from '@/components/ui/confidence-meter'
import { topicPath } from '@/lib/domain/library'
import type { Topic } from '@/lib/domain/types'
import { QuizBadge } from '@/components/ui/quiz-badge'

/*
  A link, now that /topic/[id] exists. The reference draws it as a button; a link
  is the honest element for something that navigates, and it gets middle-click,
  open-in-new-tab and the browser's own affordances for free.
*/
export function TopicCard({ topic, timestamp }: { topic: Topic; timestamp?: string }) {
  return (
    <Link
      href={`/topic/${topic.id}`}
      className={`flex flex-col gap-[9px] rounded-lg border border-rule bg-surface p-5 shadow-card hover:border-rule-strong ${
        topic.kind === 'quiz' ? 'border-l-[3px] border-l-accent' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-card-title leading-[1.28] font-medium tracking-[-0.01em]">
            {topic.title}
          </h3>
          <p className="font-mono text-mono-sm text-ink-3">{topicPath(topic)}</p>
        </div>
        {topic.kind === 'quiz' ? <QuizBadge /> : null}
        {timestamp ? (
          <span className="shrink-0 font-mono text-[11.5px] text-ink-3">{timestamp}</span>
        ) : null}
      </div>

      {/*
        A quiz has no excerpt — its question is the title and there is nothing
        beneath it to preview. Omitted rather than rendered empty: `definition` is
        null on the quiz arm, so this would have been a blank <p> that looked almost
        right. `tsc` cannot see that; e2e/quiz.spec.ts asserts the element is absent.
      */}
      {topic.kind === 'topic' ? (
        <p className="line-clamp-2 text-option leading-[1.6] text-ink-2">{topic.definition}</p>
      ) : null}

      <div className="mt-[3px] flex items-center justify-between gap-2.5 border-t border-rule pt-[11px]">
        <ConfidenceMeter confidence={topic.confidence} showLabel />
        {/* The strongest reason to open a card. */}
        {/*
          A quiz's Why lives in mental_model, so the unguarded version showed a quiz
          "Model ✓". The reference shows a practice count there instead, and omits it
          entirely before the first practice.
        */}
        {topic.kind === 'quiz'
          ? topic.practice_count > 0 && (
              <span className="font-mono text-[11.5px] text-ink-3">
                Practiced {topic.practice_count}×
              </span>
            )
          : topic.mental_model && (
              <span className="font-mono text-[10px] tracking-[0.1em] text-accent uppercase">
                Model ✓
              </span>
            )}
      </div>
    </Link>
  )
}

/** Matches the card's geometry exactly, so nothing shifts when data lands. */
export function TopicCardSkeleton({ widths }: { widths: [string, string] }) {
  return (
    <div className="flex flex-col gap-[9px] rounded-lg border border-rule bg-surface p-5 shadow-card">
      <div>
        <div className="animate-skeleton h-[18px] rounded-sm bg-surface-3" style={{ width: widths[0] }} />
        <div className="animate-skeleton mt-[9px] h-[11px] w-[38%] rounded-sm bg-surface-3" />
      </div>
      <div className="animate-skeleton mt-3 h-[11px] w-full rounded-sm bg-surface-3" />
      <div className="animate-skeleton mt-[7px] h-[11px] rounded-sm bg-surface-3" style={{ width: widths[1] }} />
      <div className="animate-skeleton mt-4 h-[13px] w-[84px] rounded-sm bg-surface-3" />
    </div>
  )
}
