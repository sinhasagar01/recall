import { INTENTIONS, dayCounts, doneOf, textOf, type Day } from '@/lib/domain/today'
import { formatShortDate } from '@/lib/domain/library'

/**
 * The log. Read-only, and that is the point.
 *
 * Ticking Thursday's box from Sunday's chair is writing history rather than
 * recording it, and the log is only worth reading if it says what actually
 * happened. So there is no control here at all — not a disabled one.
 */
export function EarlierDays({ days }: { days: Day[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-rule bg-surface">
      {days.map((day) => {
        const counts = dayCounts(day)
        return (
          <div
            key={day.id}
            data-testid="log-row"
            data-day={day.day}
            className="flex items-start gap-4 border-b border-rule px-[17px] py-4 last:border-b-0"
          >
            <div className="w-[86px] flex-none font-mono text-[11.5px] text-ink-3">
              {formatShortDate(`${day.day}T12:00:00`)}
            </div>

            <div className="min-w-0 flex-1">
              {INTENTIONS.map((slot) => {
                const text = textOf(day, slot)
                return (
                  <p key={slot} className="flex items-start gap-2 text-[13.5px] leading-[1.5]">
                    <span
                      aria-hidden="true"
                      className={`mt-[3px] flex-none font-mono text-[11px] ${
                        doneOf(day, slot) ? 'text-ink' : 'text-ink-3'
                      }`}
                    >
                      {doneOf(day, slot) ? '✓' : '·'}
                    </span>
                    <span className={text === null ? 'text-ink-3' : 'text-ink-2'}>
                      {text ?? '—'}
                    </span>
                  </p>
                )
              })}

              {day.blocker_text ? (
                <p className="mt-2 rounded-r-md border-l-2 border-rule-strong bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
                  {day.blocker_text}
                  {day.blocker_resolved_at === null ? (
                    <span className="ml-1.5 font-mono text-[10.5px] text-ink-3">· still open</span>
                  ) : null}
                </p>
              ) : null}
            </div>

            <div className="flex-none font-mono text-[11.5px] text-ink-3">
              {counts.done} / {counts.written}
            </div>
          </div>
        )
      })}
    </div>
  )
}
