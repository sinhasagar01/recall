'use client'

import { INTENTION_LABEL, type Intention } from '@/lib/domain/today'

/**
 * One of the three lines.
 *
 * ── Why this box IS clickable, when arc 3's is not ──────────────────────────
 * They look identical and the distinction is the whole reason one is a control.
 *
 * A **capability** is a claim about *ability*. The app derives it, because you
 * cannot grade your own competence — so its box has no handler and no column
 * behind it, and `phases_test.sql` asserts there is no boolean to write.
 *
 * A **daily intention** is a claim about *what you did*. Only you can make it and
 * the app has no way to know, so ticking it is the only mechanism there could be.
 * Different kinds of claim, different rules.
 *
 * Arc 3's assertions are untouched: they are about `capabilities`, and the e2e
 * check that `/phases` has no checkbox anywhere is now *sharper* rather than
 * weaker — the app has checkboxes, and that screen deliberately has none.
 *
 * ── An empty line's box is not a control at all ─────────────────────────────
 * Not a disabled button. The shipped quiz rule: *"the options stop being buttons…
 * a disabled button still says button."* An empty slot keeps its place and its
 * label, and its box is a `span` a screen reader never announces.
 */
export function IntentionRow({
  slot,
  text,
  done,
  editable,
  onToggle,
}: {
  slot: Intention
  text: string | null
  done: boolean
  editable: boolean
  onToggle: (next: boolean) => void
}) {
  const label = INTENTION_LABEL[slot]

  return (
    <div className="flex items-start gap-3.5 border-b border-rule py-3.5 last:border-b-0">
      {text === null || !editable ? (
        <span
          aria-hidden="true"
          data-testid="intention-box"
          data-done={done}
          data-control={false}
          className={`mt-px grid size-[18px] flex-none place-items-center rounded border text-[10px] ${
            done ? 'border-ink bg-ink text-surface' : 'border-rule-strong'
          } ${text === null ? 'opacity-40' : ''}`}
        >
          {done ? '✓' : ''}
        </span>
      ) : (
        /*
          44px of tap target around an 18px box. Ticking on a phone is the most
          likely thing anyone does on this page — the negative margin keeps the
          visual row unchanged while the hit area grows past it.
        */
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`${label}: ${text}`}
          data-testid="intention-box"
          data-done={done}
          data-control={true}
          onClick={() => onToggle(!done)}
          className="-m-[13px] mt-[-12px] grid size-[44px] flex-none cursor-pointer place-items-center rounded"
        >
          <span
            className={`grid size-[18px] place-items-center rounded border text-[10px] ${
              done ? 'border-ink bg-ink text-surface' : 'border-rule-strong'
            }`}
          >
            {done ? '✓' : ''}
          </span>
        </button>
      )}

      <div className="min-w-0 flex-1">
        <p className="font-mono text-[9.5px] tracking-[0.14em] text-ink-3 uppercase">{label}</p>
        {text === null ? (
          <p className="mt-0.5 text-body text-ink-3">Nothing set</p>
        ) : (
          <p
            className={`mt-0.5 text-body leading-[1.5] ${
              done ? 'text-ink-3 line-through decoration-rule-strong' : 'text-ink'
            }`}
          >
            {text}
          </p>
        )}
      </div>
    </div>
  )
}
