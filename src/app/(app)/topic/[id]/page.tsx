import { notFound } from 'next/navigation'
import { TopicDetail } from '@/components/topics/topic-detail'
import { getTopic, listTopics, signedImageUrl } from '@/lib/data/topics'
import { categoryOptions } from '@/lib/domain/library'

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
  const { topics } = await listTopics()

  /*
    Signed here, during the server render, so the URL is in the first paint. A
    client-side fetch would leave a hole in the layout while it resolved; this way
    there is nothing to resolve.
  */
  const imageUrl = await signedImageUrl(topic.mental_model_image_path)

  return <TopicDetail topic={topic} categories={categoryOptions(topics)} imageUrl={imageUrl} />
}
