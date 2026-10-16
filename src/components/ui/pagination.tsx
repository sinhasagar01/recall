import Link from 'next/link'

export function Pagination({ href, page, pageSize, total }: { href: string; page: number; pageSize: number; total: number }) {
  if (total <= pageSize) return null
  const last = Math.ceil(total / pageSize)
  const to = (next: number) => `${href}${href.includes('?') ? '&' : '?'}page=${next}`

  return (
    <nav aria-label="Pagination" className="mt-7 flex items-center justify-between gap-3 border-t border-rule pt-5">
      {page > 1 ? <Link href={to(page - 1)} className="text-label font-medium text-accent hover:text-accent-ink">← Previous</Link> : <span />}
      <span className="font-mono text-mono-sm text-ink-3">Page {page} of {last}</span>
      {page < last ? <Link href={to(page + 1)} className="text-label font-medium text-accent hover:text-accent-ink">Next →</Link> : <span />}
    </nav>
  )
}
