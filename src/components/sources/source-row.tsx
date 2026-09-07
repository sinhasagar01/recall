import Link from 'next/link'
import { formatRelativeTime } from '@/lib/domain/library'
import {
  extractionCount,
  isUndistilled,
  transcriptState,
  UNDISTILLED_WINDOW_DAYS,
  type SourceWithEntriesView,
} from '@/lib/domain/sources'

/**
 * A source row is deliberately NOT a topic card.
 *
 * No serif title, no confidence meter, no left accent rule. A source is raw
 * material, and the moment it looks like a topic it competes with the library for
 * the same attention.
 */
export function SourceRow({ view, now }: { view: SourceWithEntriesView; now: Date }) {
  const { source, entries } = view
  const topics = entries.filter((entry) => entry.kind === 'topic').length
  const quizzes = entries.filter((entry) => entry.kind === 'quiz').length
  const done = extractionCount(source, entries)
  const state = transcriptState(source)
  const stale = isUndistilled(source, entries.length, now)

  const transcriptLabel =
    state === 'present'
      ? `${source.transcript_words?.toLocaleString()} words`
      : state === 'deleted'
        ? 'transcript deleted'
        : 'no transcript'

  return (
    <Link
      href={`/sources/${source.id}`}
      className="flex items-center gap-4 border-b border-rule px-1 py-[15px] hover:bg-surface-2"
    >
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium text-ink">{source.title}</div>
        <div className="mt-[3px] font-mono text-[11.5px] text-ink-3">
          {source.course ? `${source.course} · ` : ''}
          {formatRelativeTime(source.created_at, now)} · {transcriptLabel}
        </div>
      </div>

      {entries.length === 0 ? (
        /*
          The one place this product says something uncomfortable.

          Crimson on the LABEL only — the row stays neutral. A crimson row would
          read as an error, and a stale source is not an error, it is a fact about
          me. See DESIGN.md; the reference's own rules tab argued for the row and
          was corrected.
        */
        <span
          className={`shrink-0 font-mono text-[11.5px] ${stale ? 'text-flag' : 'text-ink-3'}`}
        >
          {stale
            ? `Nothing · ${Math.floor(
                (now.getTime() - Date.parse(source.created_at)) / 86_400_000,
              )} days`
            : 'Nothing distilled'}
        </span>
      ) : (
        <span className="shrink-0 font-mono text-[11.5px] text-ink-3">
          {topics > 0 ? `${topics} topic${topics === 1 ? '' : 's'}` : ''}
          {topics > 0 && quizzes > 0 ? ' · ' : ''}
          {quizzes > 0 ? `${quizzes} quiz${quizzes === 1 ? '' : 'zes'}` : ''}
        </span>
      )}

      {/* The dots count extractions, never progress through a video — the app has
          no idea how much of one you watched and must not pretend to. */}
      <span
        className="hidden shrink-0 items-center gap-[3px] sm:inline-flex"
        role="img"
        aria-label={`${done} of 5 extracted${stale ? `, nothing in ${UNDISTILLED_WINDOW_DAYS} days` : ''}`}
      >
        {[0, 1, 2, 3, 4].map((index) => (
          <i
            key={index}
            className={`size-[7px] rounded-full ${index < done ? 'bg-ok' : 'bg-rule-strong'}`}
          />
        ))}
      </span>
    </Link>
  )
}
