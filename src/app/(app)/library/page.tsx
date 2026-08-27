import { LibraryView } from '@/components/topics/library-view'
import { listTopics } from '@/lib/data/topics'

/*
  A server component: the first paint carries the data, with no client waterfall
  and no loading flash. Writes go through the server action in ./actions.ts, which
  revalidates this path — which is how the list updates without a reload.

  `readAt` comes from the read rather than from render: a component calling
  Date.now() while rendering is impure, and would also drift between the rail and
  the page.
*/
export default async function LibraryPage() {
  const { topics, readAt } = await listTopics()

  return <LibraryView topics={topics} readAt={readAt} />
}
