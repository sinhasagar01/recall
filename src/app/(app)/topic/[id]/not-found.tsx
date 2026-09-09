import Link from 'next/link'
import { StateBlock } from '@/components/ui/state-block'
import { BackToLibrary } from '@/components/ui/back-to-library'

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
        <BackToLibrary />
      }
    />
  )
}
