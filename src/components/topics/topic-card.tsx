import Link from 'next/link'
import { ConfidenceMeter } from '@/components/ui/confidence-meter'
import { topicPath } from '@/lib/domain/library'
import type { Topic } from '@/lib/domain/types'
import { QuizBadge } from '@/components/ui/quiz-badge'
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
        className={`flex h-full min-h-[236px] flex-col gap-[9px] rounded-lg border p-5 shadow-card ${
          complete
            ? 'border-ok/45 bg-ok-soft hover:border-ok'
            : 'border-rule bg-surface hover:border-rule-strong'
        } ${
          topic.kind === 'quiz' ? 'border-l-[3px] border-l-accent' : ''
        }`}
      >
        <div>
          <div className="flex items-start gap-3">
            {/* Reserve two lines, so one short title cannot shrink its card. */}
            <h3 className="min-h-[49px] min-w-0 flex-1 line-clamp-2 font-display text-card-title leading-[1.28] font-medium tracking-[-0.01em]">
              {topic.title}
            </h3>
            {topic.kind === 'quiz' ? <QuizBadge /> : null}
          </div>
          <p className={`truncate font-mono text-mono-sm ${secondaryText}`}>{topicPath(topic)}</p>
        </div>

        {/* A dedicated, reserved row keeps time out of the title's layout. */}
        <p className={`min-h-[17px] font-mono text-[11.5px] ${secondaryText}`}>
          {timestamp ? `Saved ${timestamp}` : <span aria-hidden="true">&nbsp;</span>}
        </p>

        {/*
          A quiz has no excerpt, but it reserves the topic excerpt's space so every
          library card shares one stable height and the footer aligns across a row.
        */}
        {topic.kind === 'topic' ? (
          <p className="min-h-[47px] line-clamp-2 text-option leading-[1.6] text-ink-2">{topic.definition}</p>
        ) : (
          <div className="min-h-[47px]" aria-hidden="true" />
        )}

        <div className={`mt-auto flex items-center justify-between gap-2.5 border-t pt-[11px] ${
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
    <div className="flex min-h-[236px] flex-col gap-[9px] rounded-lg border border-rule bg-surface p-5 shadow-card">
      <div>
        <div className="animate-skeleton h-[18px] rounded-sm bg-surface-3" style={{ width: widths[0] }} />
        <div className="animate-skeleton mt-[9px] h-[11px] w-[38%] rounded-sm bg-surface-3" />
      </div>
      <div className="animate-skeleton mt-3 h-[11px] w-[42%] rounded-sm bg-surface-3" />
      <div className="animate-skeleton mt-2 h-[11px] rounded-sm bg-surface-3" style={{ width: widths[1] }} />
      <div className="mt-auto animate-skeleton h-[13px] w-[84px] rounded-sm bg-surface-3" />
    </div>
  )
}
