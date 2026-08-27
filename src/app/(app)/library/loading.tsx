import { TopicCardSkeleton } from '@/components/topics/topic-card'

/* Geometry matches TopicCard exactly, so nothing shifts when the data lands. */
const SKELETON_WIDTHS: [string, string][] = [
  ['62%', '78%'],
  ['74%', '64%'],
  ['52%', '88%'],
  ['66%', '71%'],
]

export default function LibraryLoading() {
  return (
    <>
      <div className="mb-[22px] flex items-start justify-between gap-5">
        <div>
          <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">
            My knowledge
          </h1>
          <p className="mt-1 font-mono text-[11.5px] text-ink-3">Loading your topics…</p>
        </div>
      </div>

      {/*
        A placeholder, not the real toolbar: filtering something that has not
        loaded yet is meaningless, and a live control here would accept input and
        then be replaced mid-keystroke when the data lands.
      */}
      <div className="mb-[26px] flex flex-wrap items-center gap-2.5" aria-hidden="true">
        <div className="animate-skeleton h-[42px] min-w-[240px] flex-1 rounded-md bg-surface-3" />
        <div className="animate-skeleton h-[38px] w-[130px] rounded-md bg-surface-3" />
        <div className="animate-skeleton h-[38px] w-[130px] rounded-md bg-surface-3" />
        <div className="animate-skeleton h-[38px] w-[130px] rounded-md bg-surface-3" />
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(292px,1fr))] gap-3">
        {SKELETON_WIDTHS.map((widths, index) => (
          <TopicCardSkeleton key={index} widths={widths} />
        ))}
      </div>
    </>
  )
}
