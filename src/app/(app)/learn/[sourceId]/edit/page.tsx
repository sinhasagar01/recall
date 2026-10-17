import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LearningSourceEditor } from '@/components/learn/learning-source-editor'
import { PageHeader } from '@/components/ui/page-header'
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
      <PageHeader
        eyebrow="Edit saved transcript"
        title="Refine your raw material"
        summary="Correct the lesson name or transcript before you continue learning it."
      />
      <LearningSourceEditor sourceId={sourceId} initialLesson={source.lessonName} initialTranscript={material.transcript} />
    </>
  )
}
