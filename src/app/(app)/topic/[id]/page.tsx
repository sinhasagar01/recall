import { notFound } from 'next/navigation'
import { TopicDetail } from '@/components/topics/topic-detail'
import { libraryTotals } from '@/lib/data/library'
import { getTopic, signedImageUrl } from '@/lib/data/topics'
import { listSourceOptions, readTopicSource } from '@/lib/data/sources'
import { categoryOptionsFromCounts } from '@/lib/domain/library'

export default async function TopicPage({ params }: PageProps<'/topic/[id]'>) {
  const { id } = await params

  const topic = await getTopic(id)

  /*
    One path for both "no such id" and "somebody else's id". RLS returns zero rows
    either way, and notFound() is what both become. A 403 that distinguished them
    would tell an attacker which ids are real.
  */
  if (topic === null) notFound()

  // For the edit sheet's category select, which shows counts from the user's data.
  // Counts, not the library: this used to read every topic to tally categories.
  const counts = await libraryTotals()

  /*
    Signed here, during the server render, so the URL is in the first paint. A
    client-side fetch would leave a hole in the layout while it resolved; this way
    there is nothing to resolve.
  */
  const [imageUrl, source, sourceOptions] = await Promise.all([
    signedImageUrl(topic.mental_model_image_path),
    readTopicSource(id),
    listSourceOptions(),
  ])

  return <TopicDetail topic={topic} categories={categoryOptionsFromCounts(counts.byCategory, counts.total)} imageUrl={imageUrl} source={source} sourceOptions={sourceOptions} />
}
