import { notFound } from 'next/navigation'
import { TopicDetail } from '@/components/topics/topic-detail'
import { libraryTotals } from '@/lib/data/library'
import { getTopic, parentTopicOf, signedImageUrl } from '@/lib/data/topics'
import { listSourceOptions, readTopicSource } from '@/lib/data/sources'
import { listCapabilityOptions, readTopicCapability } from '@/lib/data/phases'
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
  const [imageUrl, source, sourceOptions, capability, capabilityOptions, parent] = await Promise.all([
    signedImageUrl(topic.mental_model_image_path),
    readTopicSource(id),
    listSourceOptions(),
    /*
      Two extra reads on this one page, and the price of the boundary: neither
      `source_id` nor `capability_id` is on the domain Topic, so neither arrives
      with the topic. In exchange the queue has no way to name either.
    */
    readTopicCapability(id),
    listCapabilityOptions(),
    /* And a third, for the same reason: `parent_topic_id` is not on the Topic either. */
    parentTopicOf(id),
  ])

  return (
    <TopicDetail
      topic={topic}
      categories={categoryOptionsFromCounts(counts.byCategory, counts.total)}
      imageUrl={imageUrl}
      source={source}
      parent={parent}
      sourceOptions={sourceOptions}
      capability={capability}
      capabilityOptions={capabilityOptions}
    />
  )
}
