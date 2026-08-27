/*
  The reference's `.state` block: the empty library, the load error, and later the
  no-results and cleared-weak states. Dashed and quiet by default; solid and
  --flag when something actually went wrong.
*/
export function StateBlock({
  eyebrow,
  icon,
  title,
  body,
  action,
  footnote,
  tone = 'quiet',
}: {
  eyebrow?: string
  icon?: React.ReactNode
  title: string
  body: string
  action?: React.ReactNode
  footnote?: string
  tone?: 'quiet' | 'error'
}) {
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-lg px-8 py-14 text-center ${
        tone === 'error'
          ? 'border border-flag bg-flag-soft'
          : 'border border-dashed border-rule-strong bg-surface-2'
      }`}
    >
      {eyebrow ? (
        <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
          {eyebrow}
        </span>
      ) : null}
      {icon ? (
        <span className="mb-1.5 grid size-[38px] place-items-center rounded-full border border-rule bg-surface text-ink-3">
          {icon}
        </span>
      ) : null}
      <h2 className="font-display text-[22px] font-medium">{title}</h2>
      <p className="max-w-[42ch] text-[14px] text-ink-2">{body}</p>
      {action ? <div className="mt-3 flex gap-2">{action}</div> : null}
      {footnote ? <p className="mt-3.5 font-mono text-[11.5px] text-ink-3">{footnote}</p> : null}
    </div>
  )
}
