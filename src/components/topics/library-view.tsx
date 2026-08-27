'use client'

import { useState } from 'react'
import { AddTopicSheet } from '@/components/topics/add-topic-sheet'
import { LibraryToolbar } from '@/components/topics/library-toolbar'
import { TopicCard } from '@/components/topics/topic-card'
import { Button } from '@/components/ui/button'
import { StateBlock } from '@/components/ui/state-block'
import { Toast } from '@/components/ui/toast'
import { categoryOptions, formatRelativeTime, libraryStats } from '@/lib/domain/library'
import { filterTopics } from '@/lib/domain/search-filter'
import type { Topic } from '@/lib/domain/types'

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(292px,1fr))] gap-3'

export function LibraryView({ topics, readAt }: { topics: Topic[]; readAt: string }) {
  const [adding, setAdding] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  const at = new Date(readAt)
  const stats = libraryStats(topics)

  /*
    "Recently learned" is not a new rule — it is the recently-added quick filter
    from phase 2, which shares its window with recently-practiced.
  */
  const recent = filterTopics(topics, { quickFilters: ['recently-added'] }, at)
  const recentIds = new Set(recent.map((topic) => topic.id))
  const rest = topics.filter((topic) => !recentIds.has(topic.id))

  const addButton = (
    <Button variant="primary" onClick={() => setAdding(true)}>
      + Add topic
    </Button>
  )

  return (
    <>
      <div className="mb-[22px] flex items-start justify-between gap-5">
        <div>
          <h1 className="font-display text-page-title font-medium tracking-[-0.022em]">
            My knowledge
          </h1>
          <p className="mt-1 font-mono text-[11.5px] text-ink-3">
            {topics.length === 0
              ? 'Nothing saved yet'
              : `${stats.total} ${stats.total === 1 ? 'topic' : 'topics'} · ${stats.needsReview} need review · last practiced ${formatRelativeTime(stats.lastPracticedAt, at)}`}
          </p>
        </div>
        {topics.length > 0 ? addButton : null}
      </div>

      {topics.length === 0 ? (
        <StateBlock
          eyebrow="Empty library"
          title="Nothing here yet"
          body="Save a concept the moment you understand it. The definition is what it is; the mental model is how you think about it."
          action={
            <Button variant="primary" size="lg" onClick={() => setAdding(true)}>
              + Add your first topic
            </Button>
          }
        />
      ) : (
        <>
          <LibraryToolbar />

          <div className={GRID}>
            {rest.map((topic) => (
              <TopicCard key={topic.id} topic={topic} />
            ))}
          </div>

          {recent.length > 0 ? (
            <>
              <div className="mt-[38px] mb-4 flex items-center gap-3">
                <span className="font-mono text-mono font-medium tracking-[0.16em] text-ink-3 uppercase">
                  Recently learned
                </span>
                <span className="h-px flex-1 bg-rule" />
              </div>
              <div className={GRID}>
                {recent.map((topic) => (
                  <TopicCard
                    key={topic.id}
                    topic={topic}
                    timestamp={formatRelativeTime(topic.created_at, at)}
                  />
                ))}
              </div>
            </>
          ) : null}
        </>
      )}

      <AddTopicSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={setSaved}
        categories={categoryOptions(topics)}
      />

      {saved ? (
        /* DESIGN.md: "Save topic" produces "Saved". The action keeps its name. */
        <Toast message={`Saved — ${saved}`} />
      ) : null}
    </>
  )
}
