/*
  The two registers. Definition and mental model must never look like two
  paragraphs of the same thing — this separation IS the product, and it appears
  identically on topic detail and on practice reveal.

  Definition: sans, 15.5px, --ink, max 66ch, no container.
  Mental model: --accent-soft panel, 2px --accent left rule, serif 17.5px,
  --accent-ink, mono eyebrow in --accent.
*/
function Eyebrow({ children, tone }: { children: React.ReactNode; tone: 'muted' | 'accent' }) {
  return (
    <span
      className={`font-mono text-mono font-medium tracking-[0.16em] uppercase ${
        tone === 'accent' ? 'text-accent' : 'text-ink-3'
      }`}
    >
      {children}
    </span>
  )
}

export function Definition({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[30px]">
      <Eyebrow tone="muted">Definition</Eyebrow>
      <p className="mt-2.5 max-w-[66ch] text-register leading-[1.72] text-ink">{children}</p>
    </div>
  )
}

export function MentalModel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-[30px]">
      <Eyebrow tone="accent">Mental model</Eyebrow>
      <p className="mt-2.5 max-w-[66ch] rounded-r-md border-l-2 border-accent bg-accent-soft px-5 py-4 font-display text-model leading-[1.68] text-accent-ink">
        {children}
      </p>
    </div>
  )
}
