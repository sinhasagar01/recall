import { METER_SQUARES, lessonMeter, meterLabel } from '@/lib/domain/sources'
import type { Topic } from '@/lib/domain/types'

/**
 * Five squares, filled by entries at okay or better over entries from this lesson.
 *
 * ── What it replaced, twice ─────────────────────────────────────────────────
 * Arc 2 drew five dots counting a five-item extraction checklist. Arc 6 deleted
 * that checklist and left one grey dot meaning "finished" — binary, and on a row
 * already carrying four numbers, too quiet to read. You had to ask what it was.
 *
 * Five marks again, now measuring something real: how much of this lesson you
 * can actually recall.
 *
 * ── Not a bar, and not a percentage ─────────────────────────────────────────
 * A bar reads as a percentage, and this app has refused percentages since the
 * first spec. Five discrete marks say "some of it" without implying a precision
 * the number does not have.
 *
 * ── Colour is never the only signal ─────────────────────────────────────────
 * `--ok` is right here for the reason it is right on the evidence cells and the
 * quiz answer: this is DERIVED from confidence, not a self-report. But the
 * squares are the glance and `meterLabel` is the truth — the exact numbers are
 * in both `title` and `aria-label`, so nothing depends on seeing green.
 *
 * Dashed and empty for "nothing distilled", which is the confidence meter's own
 * idiom for no data yet, one level up.
 */
export function LessonMeter({ entries }: { entries: Topic[] }) {
  const meter = lessonMeter(entries)
  const label = meterLabel(meter)

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid="lesson-meter"
      data-filled={meter.filled}
      className="inline-flex flex-none items-center gap-[3px]"
    >
      {Array.from({ length: METER_SQUARES }, (_, index) => (
        <i
          key={index}
          className={`size-[7px] rounded-[2px] border ${
            index < meter.filled
              ? 'border-ok bg-ok'
              : meter.none
                ? 'border-dashed border-rule-strong'
                : 'border-rule-strong'
          }`}
        />
      ))}
    </span>
  )
}
