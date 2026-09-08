import Link from 'next/link'
import { SourceRow } from '@/components/sources/source-row'
import { formatDuration } from '@/lib/domain/duration'
import { NO_CHAPTER, NO_COURSE, type CourseNode } from '@/lib/domain/source-grouping'
import { plural } from '@/lib/domain/plural'

/**
 * One course, its chapters, and their lessons.
 *
 * ── Two counts, because they say different things ───────────────────────────
 * *"3 of 5 mined"* is lessons that produced something. *"1h 04m"* is the length
 * of the lessons you have added. A course that is 8 of 42 lessons might be a
 * third of the hours or a twentieth — **the count flatters and the duration does
 * not**, which is the whole reason both are here.
 *
 * ── There is no progress bar, and that is a decision ────────────────────────
 * The mock drew one at 62% beside "3 of 5 mined", which is 60%. Both numbers
 * cannot be right, and neither should exist: a bar needs a denominator, and the
 * app knows how many lessons you have ADDED, never how many the course has.
 * Drawing one would be the first fake number in this product — which the mock's
 * own rules tab says, on the tab next to the one that drew it.
 *
 * ── "No course" is the absence of a course, not a course ────────────────────
 * A conference talk is a real source and should not need a course invented for
 * it. It groups last and gets no course-level actions, because there is no
 * course to practise.
 */
export function CourseGroup({ node, now }: { node: CourseNode; now: Date }) {
  const length = formatDuration(node.seconds)
  const named = node.course !== null

  return (
    <section data-testid="course-group" data-course={node.course ?? ''} className="mb-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule-strong pb-2.5">
        <h2
          className={`font-display text-[19px] font-medium ${named ? 'text-ink' : 'text-ink-3'}`}
        >
          {node.course ?? NO_COURSE}
        </h2>

        <p className="font-mono text-[11.5px] text-ink-3">
          {named && node.chapters.length > 1 ? `${plural(node.chapters.length, 'chapter')} · ` : ''}
          {plural(node.lessons, 'lesson')}
          {length ? ` · ${length}` : ''} · {plural(node.entries, 'entry', 'entries')} ·{' '}
          <span data-testid="course-mined">
            {node.mined} of {node.lessons} mined
          </span>
        </p>
      </div>

      {named && node.entries > 0 ? (
        <p className="mt-2.5">
          <Link
            href={`/practice?scope=course&course=${encodeURIComponent(node.course!)}`}
            className="font-mono text-[11.5px] text-accent-ink underline hover:text-ink"
          >
            Practise this course · {plural(node.entries, 'entry', 'entries')}
          </Link>
        </p>
      ) : null}

      {node.chapters.map((chapter) => (
        <div key={chapter.chapter ?? '—'} data-testid="chapter-group" className="mt-4">
          {/*
            A course with exactly one unnamed chapter has no chapter to show — a
            heading reading "No chapter" above every lesson of a course nobody
            gave chapters to is noise about an absence.
          */}
          {chapter.chapter !== null || node.chapters.length > 1 ? (
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span
                className={`font-mono text-mono font-medium tracking-[0.14em] uppercase ${
                  chapter.chapter === null ? 'text-ink-3' : 'text-ink-2'
                }`}
              >
                {chapter.chapter ?? NO_CHAPTER}
              </span>

              <span className="flex items-baseline gap-3 font-mono text-[11px] text-ink-3">
                <span>
                  {plural(chapter.lessons.length, 'lesson')}
                  {formatDuration(chapter.seconds) ? ` · ${formatDuration(chapter.seconds)}` : ''} ·{' '}
                  {plural(chapter.entries, 'entry', 'entries')}
                </span>
                {named && chapter.chapter !== null && chapter.entries > 0 ? (
                  <Link
                    href={`/practice?scope=chapter&course=${encodeURIComponent(
                      node.course!,
                    )}&chapter=${encodeURIComponent(chapter.chapter)}`}
                    className="text-accent-ink underline hover:text-ink"
                  >
                    Practise
                  </Link>
                ) : null}
              </span>
            </div>
          ) : null}

          <div className="border-t border-rule">
            {chapter.lessons.map(({ view }) => (
              <SourceRow key={view.source.id} view={view} now={now} />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
