import Link from 'next/link'
import { topicPath } from '@/lib/domain/library'
import { formatShortDate } from '@/lib/domain/library'
import { demonstrationOf, missingHalf } from '@/lib/domain/phases'
import type { Capability } from '@/lib/domain/phases'
import { plural } from '@/lib/domain/plural'
import type { Topic } from '@/lib/domain/types'

/**
 * One capability, and whether you have demonstrated it.
 *
 * ── The box has no click handler ────────────────────────────────────────────
 * It is a `<span>`, not an `<input>`. There is nothing to click, nothing to
 * submit, and no column to store a tick in — see phases_test.sql, which asserts
 * the exact column set so a boolean cannot be added quietly. A course ending
 * changes nothing here, and neither does your opinion of yourself on a good day.
 *
 * Because the box is decorative, the state is carried in TEXT for a screen
 * reader: the visually-hidden label, and the why-line below. DESIGN.md's
 * "Colour is never the only signal" — the tick glyph and the sentence both say
 * what the green says.
 */
export function CapabilityRow({
  capability,
  entries,
}: {
  capability: Capability
  entries: Topic[]
}) {
  const demonstration = demonstrationOf(entries)
  const reason = missingHalf(demonstration)
  const { demonstrated, topics, quizzes, atOkayOrBetter, markers, linked } = demonstration

  const evidenceTopics = entries.filter(
    (entry) =>
      entry.rebuild_at !== null || entry.challenge_at !== null || entry.production_at !== null,
  )

  return (
    <div className="flex items-start gap-3.5 border-b border-rule py-4 last:border-b-0">
      <span
        aria-hidden="true"
        data-testid="capability-box"
        data-demonstrated={demonstrated}
        className={`mt-0.5 grid size-[17px] flex-none place-items-center rounded border text-[10px] ${
          demonstrated ? 'border-ok bg-ok-soft text-ok' : 'border-dashed border-rule-strong'
        }`}
      >
        {demonstrated ? '✓' : ''}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`text-body leading-[1.5] ${demonstrated ? 'text-ok' : 'text-ink'}`}>
          {/* The state in words, for anyone who cannot see the box or its colour. */}
          <span className="sr-only">
            {demonstrated ? 'Demonstrated: ' : 'Not demonstrated: '}
          </span>
          {capability.name}
        </p>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[10.5px] text-ink-3">
          {linked === 0 ? (
            /*
              An absence, not an error — so --ink-3 like the rest of this line,
              never --flag. DESIGN.md keeps the alarm colour for weak confidence,
              destructive actions and errors, and "you have not started" is none
              of those. sources-reference.html argued the same point wrongly and
              was corrected; phases-reference.html is corrected here too.
            */
            <span>nothing linked</span>
          ) : (
            <>
              <span>
                {topics > 0 ? plural(topics, 'topic') : null}
                {topics > 0 && quizzes > 0 ? ', ' : null}
                {quizzes > 0 ? plural(quizzes, 'quiz', 'quizzes') : null}
              </span>
              <span aria-hidden="true">·</span>
              {/*
                "at weak" IS weak confidence, which is the one thing --flag is
                for. The count reads plainly when there is something to count.
              */}
              <span className={atOkayOrBetter === 0 ? 'text-flag' : undefined}>
                {atOkayOrBetter === 0
                  ? 'all weak or new'
                  : `${atOkayOrBetter} at okay or better`}
              </span>
              <span aria-hidden="true">·</span>
              {markers.length === 0 ? (
                <span>no rebuild, challenge or production</span>
              ) : (
                <span className="flex flex-wrap items-center gap-x-1.5">
                  {markers.join(', ')}
                  {evidenceTopics.slice(0, 1).map((entry) => (
                    <Link
                      key={entry.id}
                      href={topicPath(entry)}
                      className="text-accent-ink underline hover:text-ink"
                    >
                      {entry.title}
                    </Link>
                  ))}
                  {evidenceTopics[0] ? (
                    <span>
                      ·{' '}
                      {formatShortDate(
                        evidenceTopics[0].rebuild_at ??
                          evidenceTopics[0].challenge_at ??
                          evidenceTopics[0].production_at,
                      )}
                    </span>
                  ) : null}
                </span>
              )}
            </>
          )}
        </p>

        {/*
          The reason is the feature. A checklist that only shows unchecked boxes
          tells you nothing about what to do next; naming the missing half tells
          you whether to practise it or go build with it.
        */}
        {reason ? (
          <p
            data-testid="capability-reason"
            className="mt-2 max-w-[60ch] rounded-r-md border-l-2 border-rule-strong bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2"
          >
            {reason}
          </p>
        ) : null}
      </div>
    </div>
  )
}
