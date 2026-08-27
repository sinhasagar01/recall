import { Wordmark } from '@/components/ui/wordmark'

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
    <div className="w-[min(400px,100%)]">
      <div className="mb-2 flex justify-center">
        <Wordmark size="lg" />
      </div>

      <p className="mb-8 text-center text-[14px] text-ink-2">{tagline}</p>

      <div className="rounded-lg border border-rule bg-surface p-[26px] shadow-card">{children}</div>

      <p className="mt-[18px] text-center text-label text-ink-2">{alt}</p>
    </div>
  )
}
