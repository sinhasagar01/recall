import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LessonBuilder } from '@/components/learn/lesson-builder'
import { LessonPlayer } from '@/components/learn/lesson-player'
import { hasKey } from '@/lib/ai/extract'
import { readSource } from '@/lib/data/sources'
import { readLearningMaterial } from '@/lib/data/learning'

export default async function LearnSourcePage({ params }: PageProps<'/learn/[sourceId]'>) {
  const { sourceId } = await params
  const found = await readSource(sourceId)
  if (found === null) notFound()

  const material = await readLearningMaterial(sourceId)

  return (
    <>
      <p className="mb-3.5 text-meta"><Link href="/learn" className="text-accent-ink underline hover:text-ink">← Learn</Link></p>
      <div className="mb-6">
        <p className="font-mono text-mono-sm tracking-[0.12em] text-accent-ink uppercase">Transcript</p>
        <h1 className="mt-1 font-display text-page-title font-medium tracking-[-0.022em]">{found.source.lesson}</h1>
        <p className="mt-1.5 text-meta text-ink-2">Turn this transcript into one focused guided lesson. Nothing is added to your library.</p>
      </div>

      {material?.lesson ? <><LessonPlayer lesson={material.lesson} sourceId={sourceId} /><div className="mt-5"><LessonBuilder sourceId={sourceId} words={found.source.transcript_words ?? 0} /></div></> : hasKey() && material ? <LessonBuilder sourceId={sourceId} words={found.source.transcript_words ?? 0} /> : <p className="rounded-lg border border-rule bg-surface p-5 text-meta text-ink-2">This transcript is not available, or an OpenAI key is not configured.</p>}
    </>
  )
}
