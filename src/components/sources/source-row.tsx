import Link from 'next/link'
import { formatDuration } from '@/lib/domain/duration'
import { formatRelativeTime } from '@/lib/domain/library'
import { LessonMeter } from '@/components/sources/lesson-meter'
import {
  isUndistilled,
  sourceProgress,
  sourceProgressCopy,
  transcriptState,
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
  const progress = sourceProgress(entries)
  const state = transcriptState(source)
  const length = formatDuration(source.duration_seconds)
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
      className="flex items-center gap-4 border-t border-rule py-[13px] pr-[18px] pl-[34px] first:border-t-0 hover:bg-surface-2"
    >
      {/*
        The meter LEADS the row — both mocks put it first, and the trailing
        placement was inherited from arc 2's dot row without ever being checked
        against the drawing. Found by looking at the built page beside the mock;
        see TASKS.md.
      */}
      <LessonMeter entries={entries} />

      <div className="min-w-0 flex-1">
        <div className="text-body font-medium text-ink">{source.lesson}</div>
        {/*
          No course here any more: the group heading above already says it, and
          repeating it on every row is how a grouped list reads as a flat one
          that happens to be indented.
        */}
        <div className="mt-[3px] font-mono text-[11.5px] text-ink-3">
          {length ? `${length} · ` : ''}
          {transcriptLabel} · {formatRelativeTime(source.created_at, now)}
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
          {sourceProgressCopy(progress)}
        </span>
      )}

    </Link>
  )
}
