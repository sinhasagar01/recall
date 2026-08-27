import type { Confidence } from '@/lib/domain/types'

/*
  Confidence is encoded by FILL COUNT, not hue. Only weak and strong carry colour,
  and never red/amber/green — the library should not scold its owner on every card.
  The label is always present in the accessible tree, so colour never carries the
  meaning on its own.
*/
const FILLED: Record<Confidence, number> = { new: 0, weak: 1, okay: 2, strong: 3 }

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  new: 'Never practiced',
  weak: 'Weak',
  okay: 'Okay',
  strong: 'Strong',
}

const TICK_ON: Record<Confidence, string> = {
  new: '',
  weak: 'border-flag bg-flag',
  okay: 'border-ink bg-ink',
  strong: 'border-accent bg-accent',
}

const LABEL_TONE: Record<Confidence, string> = {
  new: 'text-ink-3',
  weak: 'text-flag',
  okay: 'text-ink-2',
  strong: 'text-accent-ink',
}

export function ConfidenceMeter({
  confidence,
  showLabel = false,
}: {
  confidence: Confidence
  showLabel?: boolean
}) {
  const filled = FILLED[confidence]
  const label = CONFIDENCE_LABEL[confidence]

  return (
    <span
      className="inline-flex items-center gap-[7px]"
      /* Without the label rendered, a bare row of ticks says nothing out loud. */
      role={showLabel ? undefined : 'img'}
      aria-label={showLabel ? undefined : label}
    >
      <span className="inline-flex gap-[2.5px]" aria-hidden={showLabel ? true : undefined}>
        {[0, 1, 2].map((index) => {
          const on = index < filled
          return (
            <i
              key={index}
              data-testid="confidence-tick"
              data-filled={on}
              className={`h-[13px] w-[5px] rounded-[1.5px] border ${
                confidence === 'new' ? 'border-dashed' : ''
              } ${on ? TICK_ON[confidence] : 'border-rule-strong bg-transparent'}`}
            />
          )
        })}
      </span>
      {showLabel ? (
        <span className={`font-mono text-mono-sm tracking-[0.04em] ${LABEL_TONE[confidence]}`}>
          {label}
        </span>
      ) : null}
    </span>
  )
}
