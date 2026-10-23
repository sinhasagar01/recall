import Link from 'next/link'
import { ConfidenceMeter } from '@/components/ui/confidence-meter'
import { topicPath } from '@/lib/domain/library'
import type { Topic } from '@/lib/domain/types'
import { EvidenceBar } from '@/components/evidence/evidence-bar'
import { hasEvidence } from '@/lib/domain/evidence'

/*
  A link, now that /topic/[id] exists. The reference draws it as a button; a link
  is the honest element for something that navigates, and it gets middle-click,
  open-in-new-tab and the browser's own affordances for free.
*/
export function TopicCard({ topic, timestamp, selected, selectionMode = false, onSelect }: {
  topic: Topic
  timestamp?: string
  /** Present only while the library is in selection mode. */
  selected?: boolean
  selectionMode?: boolean
  onSelect?: () => void
}) {
  const complete = topic.confidence === 'strong'
  const secondaryText = complete ? 'text-ink-2' : 'text-ink-3'

  return (
    <div className="relative h-full">
      {selectionMode ? (
        <label className="absolute top-2.5 right-2.5 z-10 flex size-7 cursor-pointer items-center justify-center rounded-md border border-rule-strong bg-surface shadow-card">
          <input
            type="checkbox"
            aria-label={`Select “${topic.title}”`}
            checked={selected}
            onChange={onSelect}
            disabled={!onSelect}
            className="size-4 accent-accent"
          />
        </label>
      ) : null}
      <Link
        href={`/topic/${topic.id}`}
        className={`flex h-full min-h-[252px] flex-col rounded-lg border p-6 shadow-card transition-[border-color,background-color,transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-pop ${
          complete
            ? 'border-ok/45 bg-ok-soft hover:border-ok'
            : 'border-rule bg-surface hover:border-rule-strong'
        }`}
      >
        <div className="flex items-center justify-between gap-3 font-mono text-mono-xs tracking-[0.13em] uppercase">
          <span className={topic.kind === 'quiz' ? 'text-accent-ink' : 'text-ink-3'}>
            {topic.kind === 'quiz' ? 'Quiz' : 'Topic'}
          </span>
          <span className={complete ? 'text-ok' : 'text-ink-3'}>
            {complete ? 'Complete' : timestamp ? `Saved ${timestamp}` : 'New'}
          </span>
        </div>

        {/* Reserve two lines: varied titles still form a calm, even grid. */}
        <h3 className="mt-4 min-h-[58px] line-clamp-2 font-display text-[23px] leading-[1.18] font-medium tracking-[-0.018em]">
          {topic.title}
        </h3>
        <span className={`mt-2 inline-flex w-fit max-w-full truncate rounded-full border border-rule bg-surface-2 px-2.5 py-1 font-mono text-mono-sm ${secondaryText}`}>{topicPath(topic)}</span>

        {/*
          Both kinds reserve the same reading space. A quiz gets useful orientation
          instead of a blank hole, while topic definitions stay scannable.
        */}
        {topic.kind === 'topic' ? (
          <p className="mt-4 min-h-[47px] line-clamp-2 text-option leading-[1.65] text-ink-2">{topic.definition}</p>
        ) : (
          <p className="mt-4 min-h-[47px] text-option leading-[1.65] text-ink-2">Choose an answer, then check the reasoning.</p>
        )}

        <div className={`mt-auto flex items-center justify-between gap-2.5 border-t pt-4 ${
          complete ? 'border-ok/45' : 'border-rule'
        }`}>
          <ConfidenceMeter confidence={topic.confidence} showLabel />
          {/* The strongest reason to open a card. */}
          {/*
            A quiz's Why lives in mental_model, so the unguarded version showed a quiz
            "Model ✓". The reference shows a practice count there instead, and omits it
            entirely before the first practice.
          */}
          {/*
            The right slot holds ONE element.

            The evidence squares take it when a topic has any, and Model ✓ is the
            fallback when it has none — never both, and never three things in the
            foot. An early draft of evidence-reference.html drew cards with no
            Model ✓ at all; that was an oversight in the drawing rather than a
            decision to delete a shipped element, and the reference now says so.

            A quiz keeps its practice count and never gets squares: the constraint
            refuses it evidence, so there is nothing to draw.
          */}
          {topic.kind === 'quiz'
            ? topic.practice_count > 0 && (
                <span className={`font-mono text-[11.5px] ${secondaryText}`}>
                  Practiced {topic.practice_count}×
                </span>
              )
            : hasEvidence(topic)
              ? <EvidenceBar topic={topic} />
              : topic.mental_model && (
                  <span className="font-mono text-[10px] tracking-[0.1em] text-accent uppercase">
                    Model ✓
                  </span>
                )}
        </div>
      </Link>
    </div>
  )
}

/** Matches the card's geometry exactly, so nothing shifts when data lands. */
export function TopicCardSkeleton({ widths }: { widths: [string, string] }) {
  return (
    <div className="flex min-h-[252px] flex-col rounded-lg border border-rule bg-surface p-6 shadow-card">
      <div>
        <div className="animate-skeleton h-[10px] w-[24%] rounded-sm bg-surface-3" />
        <div className="animate-skeleton mt-4 h-[23px] rounded-sm bg-surface-3" style={{ width: widths[0] }} />
        <div className="animate-skeleton mt-2 h-[10px] w-[38%] rounded-sm bg-surface-3" />
      </div>
      <div className="animate-skeleton mt-4 h-[11px] w-[42%] rounded-sm bg-surface-3" />
      <div className="animate-skeleton mt-2 h-[11px] rounded-sm bg-surface-3" style={{ width: widths[1] }} />
      <div className="mt-auto animate-skeleton h-[13px] w-[96px] rounded-sm bg-surface-3" />
    </div>
  )
}
