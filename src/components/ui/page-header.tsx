import type { ReactNode } from 'react'

/** The shared editorial head for a working page in the signed-in app. */
export function PageHeader({
  eyebrow,
  title,
  summary,
  action,
}: {
  eyebrow: string
  title: string
  summary: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-5">
      <div>
        <p className="font-mono text-mono-xs tracking-[0.14em] text-accent-ink uppercase">{eyebrow}</p>
        <h1 className="mt-2 font-display text-page-title leading-[1.1] font-medium tracking-[-0.025em]">{title}</h1>
        <div className="mt-2 text-meta text-ink-2">{summary}</div>
      </div>
      {action ? <div className="mb-0.5 flex-none">{action}</div> : null}
    </header>
  )
}
