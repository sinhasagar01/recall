import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SourceWorkspace } from '@/components/sources/source-workspace'
import { readSource } from '@/lib/data/sources'

export default async function SourcePage({ params }: PageProps<'/sources/[id]'>) {
  const { id } = await params
  const found = await readSource(id)

  // Not-found and not-yours are the same answer, the rule the topic page follows.
  if (found === null) notFound()

  return (
    <>
      <p className="mb-3.5 text-meta">
        <Link href="/sources" className="text-accent-ink underline hover:text-ink">
          ← Sources
        </Link>
      </p>
      <SourceWorkspace source={found.source} entries={found.entries} />
    </>
  )
}
