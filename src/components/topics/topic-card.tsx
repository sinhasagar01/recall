import Link from 'next/link'
import { ConfidenceMeter } from '@/components/ui/confidence-meter'
import { topicPath } from '@/lib/domain/library'
import type { Topic } from '@/lib/domain/types'

/*
  A link, now that /topic/[id] exists. The reference draws it as a button; a link
  is the honest element for something that navigates, and it gets middle-click,
  open-in-new-tab and the browser's own affordances for free.
*/
export function TopicCard({ topic, timestamp }: { topic: Topic; timestamp?: string }) {
  return (
    <Link
      href={`/topic/${topic.id}`}
      className="flex flex-col gap-[9px] rounded-lg border border-rule bg-surface p-5 shadow-card hover:border-rule-strong">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-card-title leading-[1.28] font-medium tracking-[-0.01em]">
            {topic.title}
          </h3>
          <p className="font-mono text-mono-sm text-ink-3">{topicPath(topic)}</p>
        </div>
        {timestamp ? (
          <span className="shrink-0 font-mono text-[11.5px] text-ink-3">{timestamp}</span>
        ) : null}
      </div>

      <p className="line-clamp-2 text-option leading-[1.6] text-ink-2">{topic.definition}</p>

      <div className="mt-[3px] flex items-center justify-between gap-2.5 border-t border-rule pt-[11px]">
        <ConfidenceMeter confidence={topic.confidence} showLabel />
        {/* The strongest reason to open a card. */}
        {topic.mental_model ? (
          <span className="font-mono text-[10px] tracking-[0.1em] text-accent uppercase">
            Model ✓
          </span>
        ) : null}
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
