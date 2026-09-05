'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { loadMoreWeak } from '@/app/(app)/weak/actions'
import { Button } from '@/components/ui/button'
import { ConfidenceMeter } from '@/components/ui/confidence-meter'
import type { WeakCursor } from '@/lib/data/practice'
import { lastPracticedLabel, topicPath } from '@/lib/domain/library'
import type { Topic } from '@/lib/domain/types'

/**
 * The weak list, with its own pagination.
 *
 * A client component only because "Load more" accumulates pages in state. The
 * ordering is not this component's business — it comes from the query, which is
 * checked against `orderForPractice` in the parity suite.
 */
export function WeakList({
  initial,
  initialCursor,
  total,
  readAt,
  scope = 'weak',
}: {
  initial: Topic[]
  initialCursor: WeakCursor | null
  total: number
  readAt: string
  /** Which half of the page this list is: what needs review, or what has gone quiet. */
  scope?: 'weak' | 'stale'
}) {
  const [topics, setTopics] = useState(initial)
  const [cursor, setCursor] = useState(initialCursor)
  const [isLoading, startLoading] = useTransition()

  const at = new Date(readAt)

  const loadMore = () => {
    if (cursor === null) return

    startLoading(async () => {
      const page = await loadMoreWeak(cursor, scope)
      setTopics((previous) => [...previous, ...page.topics])
      setCursor(page.nextCursor)
    })
  }

  return (
    <>
      <ul className="overflow-hidden rounded-lg border border-rule bg-surface">
        {topics.map((topic) => (
          <li
            key={topic.id}
            className="flex items-center gap-4 border-b border-rule px-[18px] py-[15px] last:border-b-0 hover:bg-surface-2"
          >
            <ConfidenceMeter confidence={topic.confidence} />

            <div className="min-w-0 flex-1">
              <Link
                href={`/topic/${topic.id}`}
                className="block font-display text-[16.5px] font-medium hover:underline"
              >
                {topic.title}
              </Link>
              <div className="font-mono text-mono-sm text-ink-3">
                {topicPath(topic)} — {lastPracticedLabel(topic, at)}
              </div>
            </div>

            <Link
              href={`/practice?topic=${topic.id}`}
              aria-label={`Practice ${topic.title}`}
              className="inline-flex shrink-0 cursor-pointer items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2.5 text-label font-medium text-ink hover:border-ink-3"
            >
              Practice
            </Link>
          </li>
        ))}
      </ul>

      {cursor === null ? null : (
        <div className="mt-9 flex flex-col items-center gap-2">
          {/*
            Two of these can be on the weak page at once — one per list — and
            "Load more" twice is ambiguous to anyone not looking at which heading
            it sits under. The visible label stays short; the accessible name says
            which list it belongs to.
          */}
          <Button
            onClick={loadMore}
            loading={isLoading}
            loadingLabel="Loading…"
            aria-label={
              scope === 'stale' ? 'Load more settled topics' : 'Load more topics that need review'
            }
          >
            Load more
          </Button>
          <p className="font-mono text-[11.5px] text-ink-3">
            Showing {topics.length} of {total}
          </p>
        </div>
      )}
    </>
  )
}
