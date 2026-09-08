import Link from 'next/link'
import { SourceRow } from '@/components/sources/source-row'
import { formatDuration } from '@/lib/domain/duration'
import {
  NO_CHAPTER,
  NO_COURSE,
  practisableScopes,
  type CourseNode,
} from '@/lib/domain/source-grouping'
import { minedCopy, practiseMeta } from '@/lib/domain/sources'
import { plural } from '@/lib/domain/plural'

/**
 * One course: a panel, its chapters, and their lessons.
 *
 * Two references cover this screen. `sources-hierarchy-mock.html` specifies the
 * grouping, the course head, the chapter band, the ordering and the page header;
 * `sources-actions-mock.html` specifies the practise actions and the lesson
 * meter, and wins on those two only.
 *
 * ── The course head ─────────────────────────────────────────────────────────
 * Name and sub-line stacked on the left, and the **mined count on the far
 * right, on its own**. It is the course's summary judgement and reads as one
 * when it is not the tail of a list of four numbers.
 *
 * ── Actions read as buttons, and each follows what it covers ────────────────
 * They start a session, so they take the shipped Button's styling rather than
 * looking like navigation. They stay `Link`s underneath: a `<Button>` wrapping a
 * `<Link>` is invalid markup and gives a screen reader two nested controls,
 * which arc 5 recorded when the practice line hit it. The chapter's lives in the
 * chapter band, which is the only row belonging to that chapter and nothing
 * else; the course's is in the card footer, after every chapter.
 *
 * **The count sits BESIDE the button, not inside the label**, so the button says
 * what it does at a constant length and the meta says how much.
 *
 * ── Never two actions producing the same session ────────────────────────────
 * `practisableScopes` decides. It is one general rule — *if two scopes resolve
 * to the same set of topic ids, show the widest* — so "a course with one
 * chapter" and "a chapter with one lesson" are consequences rather than two
 * conditions someone has to remember. A scope with no entries is dropped
 * entirely: absent, not disabled.
 *
 * ── Still no progress bar ───────────────────────────────────────────────────
 * A bar needs a denominator, and the app knows how many lessons you ADDED,
 * never how many the course has.
 */
export function CourseGroup({ node, now }: { node: CourseNode; now: Date }) {
  const length = formatDuration(node.seconds)
  const named = node.course !== null

  /*
    Every action this panel could show, offered to one rule. The course is only
    a candidate when it has a name — "No course" is the absence of a course, and
    there is nothing to practise "all of".
  */
  const visible = practisableScopes([
    ...(named ? [{ key: 'course', level: 'course' as const, ids: node.entryIds }] : []),
    ...node.chapters
      .filter((chapter) => named && chapter.chapter !== null)
      .map((chapter) => ({
        key: `chapter:${chapter.chapter}`,
        level: 'chapter' as const,
        ids: chapter.entryIds,
      })),
  ])

  const allEntries = node.chapters.flatMap((chapter) =>
    chapter.lessons.flatMap(({ view }) => view.entries),
  )

  return (
    <section
      data-testid="course-group"
      data-course={node.course ?? ''}
      className="mb-3.5 overflow-hidden rounded-lg border border-rule bg-surface shadow-[0_1px_2px_rgba(18,19,26,.05),0_1px_1px_rgba(18,19,26,.03)]"
    >
      <div className="flex items-start gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2
            className={`font-display text-[20px] leading-[1.25] font-medium ${
              named ? 'text-ink' : 'text-ink-3'
            }`}
          >
            {node.course ?? NO_COURSE}
          </h2>
          <p className="mt-1 font-mono text-[11px] text-ink-3">
            {named && node.chapters.length > 1 ? `${plural(node.chapters.length, 'chapter')} · ` : ''}
            {plural(node.lessons, 'lesson')}
            {length ? ` · ${length}` : ''} · {plural(node.entries, 'entry', 'entries')}
          </p>
        </div>

        <span data-testid="course-mined" className="flex-none font-mono text-[11.5px] text-ink-2">
          {minedCopy(node.mined, node.lessons)}
        </span>
      </div>

      {node.chapters.map((chapter) => (
        <div key={chapter.chapter ?? '—'} data-testid="chapter-group">
          {/*
            A course whose only chapter is the unnamed one has no band to show —
            a strip reading "No chapter" above every lesson of a course nobody
            gave chapters to is noise about an absence.
          */}
          {chapter.chapter !== null || node.chapters.length > 1 ? (
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-y border-rule bg-surface-2 px-5 py-[11px]">
              <span
                className={`flex-1 text-[13.5px] font-medium ${
                  chapter.chapter === null ? 'text-ink-3' : 'text-ink'
                }`}
              >
                {chapter.chapter ?? NO_CHAPTER}
              </span>
              <span className="font-mono text-[10.5px] text-ink-3">
                {plural(chapter.lessons.length, 'lesson')}
                {formatDuration(chapter.seconds) ? ` · ${formatDuration(chapter.seconds)}` : ''} ·{' '}
                {plural(chapter.entries, 'entry', 'entries')}
              </span>

              {visible.has(`chapter:${chapter.chapter}`) ? (
                <Link
                  href={`/practice?scope=chapter&course=${encodeURIComponent(
                    node.course!,
                  )}&chapter=${encodeURIComponent(chapter.chapter!)}`}
                  className="inline-flex flex-none cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-3 py-1.5 text-label font-medium text-ink hover:border-ink-3"
                >
                  Practise this chapter
                </Link>
              ) : null}
            </div>
          ) : null}

          {chapter.lessons.map(({ view }) => (
            <SourceRow key={view.source.id} view={view} now={now} />
          ))}
        </div>
      ))}

      {visible.has('course') ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-rule bg-surface-2 px-5 py-3">
          {/*
            A Link wearing the primary Button's styling, not a `<Button>` around
            a `<Link>` — that is invalid markup and gives a screen reader two
            nested controls, which arc 5 recorded when the practice line hit it.
            The new mock asks for buttons rather than links and this is what that
            means here: it reads and behaves as the action it is, and stays one
            control.
          */}
          <Link
            href={`/practice?scope=course&course=${encodeURIComponent(node.course!)}`}
            className="inline-flex flex-none cursor-pointer items-center rounded-md border border-accent bg-accent px-3.5 py-2 text-label font-medium text-white hover:border-accent-ink hover:bg-accent-ink"
          >
            Practise this course
          </Link>
          <span className="ml-auto font-mono text-[11.5px] text-ink-3">
            {practiseMeta(allEntries)}
          </span>
        </div>
      ) : null}
    </section>
  )
}
