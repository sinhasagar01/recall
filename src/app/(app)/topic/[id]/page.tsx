import { notFound } from 'next/navigation'
import { TopicDetail } from '@/components/topics/topic-detail'
import { getTopic, listTopics } from '@/lib/data/topics'
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

  return <TopicDetail topic={topic} categories={categoryOptions(topics)} />
}
