/** The shell both auth screens share: mark, tagline, bordered box, alt line. */
export function AuthCard({
  tagline,
  children,
  alt,
}: {
  tagline: string
  children: React.ReactNode
  alt: React.ReactNode
}) {
  return (
    <div className="w-[min(420px,100%)]">
      <p className="font-mono text-mono-sm tracking-[.14em] text-accent-ink uppercase">Recall workspace</p>
      <p className="mt-3 max-w-[35ch] text-register leading-[1.55] text-ink-2">{tagline}</p>

      <div className="mt-7 rounded-lg border border-rule-strong bg-surface p-6 shadow-pop md:p-7">{children}</div>

      <p className="mt-5 text-label text-ink-2">{alt}</p>
    </div>
  )
}
