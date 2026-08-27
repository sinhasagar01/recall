export function Chip({
  children,
  tone = 'default',
}: {
  children: React.ReactNode
  tone?: 'default' | 'flag'
}) {
  return (
    <span
      className={`rounded-full border px-2 py-[3px] font-mono text-mono-sm ${
        tone === 'flag'
          ? 'border-flag bg-flag-soft text-flag'
          : 'border-rule bg-surface-2 text-ink-2'
      }`}
    >
      {children}
    </span>
  )
}

/** The library's quick filters: a chip that toggles. */
export function QuickFilterChip({
  children,
  pressed,
  onClick,
}: {
  children: React.ReactNode
  pressed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`cursor-pointer rounded-full border px-2.5 py-1 font-mono text-mono-sm ${
        pressed
          ? 'border-ink bg-ink text-surface'
          : 'border-rule bg-transparent text-ink-3 hover:border-rule-strong hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
