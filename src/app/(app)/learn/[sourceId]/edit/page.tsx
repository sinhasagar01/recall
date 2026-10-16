import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LearningSourceEditor } from '@/components/learn/learning-source-editor'
import { readLearningMaterial, readLearningSource } from '@/lib/data/learning'

export default async function EditLearningSourcePage({ params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params
  const [source, material] = await Promise.all([
    readLearningSource(sourceId),
    readLearningMaterial(sourceId),
  ])
  if (source === null || material === null) notFound()

  return (
    <>
      <p className="mb-3.5 text-meta"><Link href={`/learn/${sourceId}`} className="text-accent-ink underline hover:text-ink">← Back to lesson</Link></p>
      <div className="mb-6">
        <p className="font-mono text-mono-sm tracking-[0.12em] text-accent-ink uppercase">Edit saved transcript</p>
        <h1 className="mt-1 font-display text-page-title font-medium tracking-[-0.022em]">Refine your raw material</h1>
        <p className="mt-1.5 text-meta text-ink-2">Correct the lesson name or transcript before you continue learning it.</p>
      </div>
      <LearningSourceEditor sourceId={sourceId} initialLesson={source.lessonName} initialTranscript={material.transcript} />
    </>
  )
}
