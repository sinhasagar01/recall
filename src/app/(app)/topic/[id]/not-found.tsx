import Link from 'next/link'
import { StateBlock } from '@/components/ui/state-block'

/*
  Identical whether the id never existed or belongs to somebody else. The copy
  says nothing that would confirm a topic exists.
*/
export default function TopicNotFound() {
  return (
    <StateBlock
      title="Topic not found"
      body="This topic either doesn't exist or isn't one of yours. Your library is where everything you've saved lives."
      action={
        <Link
          href="/library"
          className="inline-flex cursor-pointer items-center rounded-md border border-accent bg-accent px-3.5 py-2.5 text-label font-medium text-white hover:border-accent-ink hover:bg-accent-ink"
        >
          Back to library
        </Link>
      }
    />
  )
}
