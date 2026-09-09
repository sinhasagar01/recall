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
 *
 * ── Why the row is no longer a single anchor ────────────────────────────────
 * It used to be one `<Link>` wrapping everything, which is the cheapest way to
 * make a whole row clickable and forecloses putting a second control in it: an
 * `<a>` inside an `<a>` is invalid markup and hands a screen reader nested
 * controls — the same defect the practise actions and `back-to-library.tsx`
 * both had to route around.
 *
 * So the row is a flex container of two siblings: the link, which still covers
 * the meter, the name and the meta and still fills the row, and the practise
 * action at the end. The hover tint moved to the container so the row still
 * highlights as one thing.
 *
 * ── The action is visible, not revealed on hover ────────────────────────────
 * The mock styles `.lesson:hover`, which on a phone is nothing at all — there
 * is no hover, so a hover-revealed control is simply absent. That is the exact
 * failure this control was found by: a missing control renders nothing, so
 * nothing sees it. It is on screen always, and quiet instead of hidden.
 *
 * It is the QUIETEST of the three: the course action is filled, the chapter
 * bordered at full size, the lesson bordered and small. Weight falls as scope
 * narrows, which is also the order you meet them reading down the card.
 *
 * ── Below `md` the button takes its own line ────────────────────────────────
 * The row was already tight at 375px — meter, a wrapping lesson name, and a
 * `shrink-0` progress line. Adding a control to the same line squeezed the name
 * block until it wrapped to three lines and the progress ran into the button.
 * Measured, not guessed: the page never overflowed horizontally, so nothing
 * would have caught it but looking.
 *
 * The link is `w-full` below `md` and shares the line above it, so the phone
 * gets exactly the row it had before with the action underneath, and the desktop
 * is unchanged. **Not** hidden below a breakpoint — a control that is absent on
 * a phone is the failure this one was found by, and a narrower screen is not a
 * reason to take the action away from the person holding it.
 */
export function SourceRow({
  view,
  now,
  /** Whether `practisableScopes` kept this lesson — see `course-group.tsx`. */
  practisable = false,
}: {
  view: SourceWithEntriesView
  now: Date
  practisable?: boolean
}) {
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule py-[13px] pr-[18px] pl-[34px] first:border-t-0 hover:bg-surface-2">
      <Link
        href={`/sources/${source.id}`}
        className="flex w-full min-w-0 items-center gap-4 md:w-auto md:flex-1"
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

      {practisable ? (
        <Link
          href={`/practice?scope=source&id=${source.id}`}
          className="inline-flex flex-none cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink hover:border-ink-3"
        >
          Practise this lesson
        </Link>
      ) : null}
    </div>
  )
}
