import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LessonBuilder } from '@/components/learn/lesson-builder'
import { LessonPlayer } from '@/components/learn/lesson-player'
import { hasKey } from '@/lib/ai/extract'
import { readLearningSource } from '@/lib/data/learning'
import { PageHeader } from '@/components/ui/page-header'

export default async function LearnSourcePage({ params }: PageProps<'/learn/[sourceId]'>) {
  const { sourceId } = await params
  const material = await readLearningSource(sourceId)
  if (material === null) notFound()

  return (
    <>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 text-meta">
        <Link href="/learn" className="text-accent-ink underline hover:text-ink">← Learn</Link>
        <Link href={`/learn/${sourceId}/edit`} className="text-accent-ink underline hover:text-ink">Edit transcript</Link>
      </div>
      <PageHeader
        eyebrow="Transcript"
        title={material.lessonName}
        summary="Turn this transcript into one focused guided lesson. Nothing is added to your library."
      />

      {material.lesson ? <><LessonPlayer lesson={material.lesson} sourceId={sourceId} /><div className="mt-5"><LessonBuilder sourceId={sourceId} words={material.transcriptWords} /></div></> : hasKey() ? <LessonBuilder sourceId={sourceId} words={material.transcriptWords} /> : <p className="rounded-lg border border-rule bg-surface p-5 text-meta text-ink-2">This transcript is not available, or an OpenAI key is not configured.</p>}
    </>
  )
}
