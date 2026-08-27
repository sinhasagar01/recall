export function Wordmark({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  return (
    <span className="flex items-baseline gap-[7px]">
      <span
        className={`font-display font-semibold tracking-[-0.02em] ${
          size === 'lg' ? 'text-wordmark-lg' : 'text-wordmark'
        }`}
      >
        Recall
      </span>
      <span className="size-[5px] rounded-full bg-accent" />
    </span>
  )
}
