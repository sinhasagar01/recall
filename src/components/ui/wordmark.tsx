export function Wordmark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`grid place-items-center rounded-md bg-ink font-display font-semibold tracking-[-0.08em] text-surface ${size === 'lg' ? 'size-9 text-wordmark' : 'size-7 text-[17px]'}`}
      >
        r
      </span>
      <span className={`font-display font-semibold tracking-[-0.04em] ${size === 'lg' ? 'text-wordmark-lg' : 'text-wordmark'}`}>recall</span>
    </span>
  )
}
