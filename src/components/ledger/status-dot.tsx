import type { Kind, Status } from '@/lib/domain/ledger'
import { statusLabel } from '@/lib/domain/ledger'

/**
 * A status, in this kind's own words.
 *
 * ── No green ────────────────────────────────────────────────────────────────
 * `ledger-reference.html` painted settled in `--ok`. It does not get it.
 * DESIGN.md reserves that colour for what the app **derives** — a quiz's correct
 * option, a recorded evidence marker, a demonstrated capability — and a ledger
 * status is a **self-report**. The reference's own callout makes the case: the
 * product cannot know whether you shipped what a URL points at.
 *
 * It is the same argument the palette already makes about confidence, which is
 * drawn in ink rather than red/amber/green because it is a judgement. So the three
 * states are told apart by shape and weight instead: dashed hollow, filled ink,
 * hollow grey.
 */
const DOT: Record<Status, string> = {
  open: 'border-dashed border-rule-strong',
  settled: 'border-ink bg-ink',
  retired: 'border-rule-strong',
}

const TEXT: Record<Status, string> = {
  open: 'text-ink-3',
  settled: 'text-ink',
  retired: 'text-ink-3',
}

export function StatusDot({ kind, status }: { kind: Kind; status: Status }) {
  return (
    <span className={`flex flex-none items-center gap-1.5 font-mono text-[10.5px] whitespace-nowrap ${TEXT[status]}`}>
      <i aria-hidden="true" className={`size-[7px] flex-none rounded-full border ${DOT[status]}`} />
      {statusLabel(kind, status)}
    </span>
  )
}
