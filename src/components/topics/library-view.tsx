'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { LibraryToolbar, type ToolbarState } from '@/components/topics/library-toolbar'
import { TopicCard } from '@/components/topics/topic-card'
import { TopicSheet } from '@/components/topics/topic-sheet'
import { Button } from '@/components/ui/button'
import { StateBlock } from '@/components/ui/state-block'
import { Toast } from '@/components/ui/toast'
import { signOut } from '@/app/(auth)/actions'
import {
  categoryOptions,
  confidenceOptions,
  difficultyOptions,
  formatRelativeTime,
  libraryStats,
} from '@/lib/domain/library'
import { filterTopics, type QuickFilter } from '@/lib/domain/search-filter'
import type { Confidence, Difficulty, Topic } from '@/lib/domain/types'

const GRID = 'grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fill,minmax(292px,1fr))]'
const QUICK_FILTERS: QuickFilter[] = [
  'never-practiced',
  'needs-review',
  'recently-added',
  'recently-practiced',
]

/*
  Filter state lives in the URL, so a filtered view is shareable and survives a
  reload. It is written with window.history.replaceState — the documented Next
  pattern that updates the URL without reloading the page while staying in sync
  with useSearchParams. No server round-trip, and no history entry per keystroke.

  replaceState for every control, not only the input: the toolbar is one
  continuous act of narrowing, and stepping back through half-typed queries and
  intermediate filter states is not history worth keeping.
*/
function readState(params: URLSearchParams): ToolbarState {
  return {
    query: params.get('q') ?? '',
    category: params.get('category') ?? 'all',
    confidence: params.get('confidence') ?? 'any',
    difficulty: params.get('difficulty') ?? 'any',
    quickFilters: QUICK_FILTERS.filter((quick) => params.getAll('quick').includes(quick)),
  }
}

function writeState(state: ToolbarState) {
  const params = new URLSearchParams()
  if (state.query) params.set('q', state.query)
  if (state.category !== 'all') params.set('category', state.category)
  if (state.confidence !== 'any') params.set('confidence', state.confidence)
  if (state.difficulty !== 'any') params.set('difficulty', state.difficulty)
  for (const quick of state.quickFilters) params.append('quick', quick)

  const query = params.toString()
  window.history.replaceState(null, '', query === '' ? window.location.pathname : `?${query}`)
}

const CLEARED: ToolbarState = {
  query: '',
  category: 'all',
  confidence: 'any',
  difficulty: 'any',
  quickFilters: [],
}

export function LibraryView({ topics, readAt }: { topics: Topic[]; readAt: string }) {
  const searchParams = useSearchParams()
  const [adding, setAdding] = useState(false)
  const [prefillTitle, setPrefillTitle] = useState('')
  const [saved, setSaved] = useState<string | null>(null)

  const at = new Date(readAt)
  const params = new URLSearchParams(searchParams.toString())
  const state = readState(params)

  /*
    The mobile FAB lives in the layout and the sheet's state lives here, so it links
    to `?add=1` rather than reaching across the tree for a setter. Consistent with
    the filters, which already live in the URL, and it works from any page.
  */
  const addRequested = params.get('add') === '1'
  const sheetOpen = adding || addRequested

  const closeSheet = () => {
    setAdding(false)
    if (addRequested) writeState(state)
  }

  const update = (next: Partial<ToolbarState>) => writeState({ ...state, ...next })

  /*
    The whole of search and filtering, in one call to the phase 2 function. Every
    rule it applies — partial case-insensitive matching across five fields, AND
    composition, the recency window — was written and tested before any of this
    existed. There is no comparison in this component.
  */
  const visible = filterTopics(
    topics,
    {
      query: state.query,
      category: state.category === 'all' ? null : state.category,
      confidence: state.confidence === 'any' ? null : (state.confidence as Confidence),
      difficulty: state.difficulty === 'any' ? null : (state.difficulty as Difficulty),
      quickFilters: state.quickFilters,
    },
    at,
  )

  const isFiltered =
    state.query !== '' ||
    state.category !== 'all' ||
    state.confidence !== 'any' ||
    state.difficulty !== 'any' ||
    state.quickFilters.length > 0

  const stats = libraryStats(topics)

  /*
    Counts come from the FULL library, never the filtered set. The reference is
    explicit: with a query matching nothing and a category selected, its category
    select still reads "All categories 48".
  */
  const quickCounts = Object.fromEntries(
    QUICK_FILTERS.map((quick) => [quick, filterTopics(topics, { quickFilters: [quick] }, at).length]),
  ) as Record<QuickFilter, number>

  // Recently learned only splits the unfiltered library; a filtered result is one list.
  const recent = isFiltered ? [] : filterTopics(topics, { quickFilters: ['recently-added'] }, at)
  const recentIds = new Set(recent.map((topic) => topic.id))
  const rest = visible.filter((topic) => !recentIds.has(topic.id))

  const openAdd = (title: string) => {
    setPrefillTitle(title)
    setAdding(true)
  }

  const subtitle = () => {
    if (topics.length === 0) return 'Nothing saved yet'
    if (isFiltered) return `${visible.length} of ${stats.total} topics match`
    return `${stats.total} ${stats.total === 1 ? 'topic' : 'topics'} · ${stats.needsReview} need review · last practiced ${formatRelativeTime(stats.lastPracticedAt, at)}`
  }

  return (
    <>
      <div className="mb-[22px] flex items-start justify-between gap-5">
        <div>
          <h1 className="font-display text-[24px] font-medium tracking-[-0.022em] md:text-page-title">
            My knowledge
          </h1>
          <p className="mt-1 font-mono text-[11.5px] text-ink-3">{subtitle()}</p>
        </div>

        {/*
          Sign out has no home on mobile — the rail is gone and the mock's tab bar
          has two destinations plus the FAB, with no room for it. It sits here,
          beside the title on the default destination, so it is always one tap away.
        */}
        <form action={signOut} className="md:hidden">
          <button
            type="submit"
            className="cursor-pointer rounded-md px-2 py-1 text-label text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            Sign out
          </button>
        </form>

        {topics.length > 0 ? (
          <Button variant="primary" onClick={() => openAdd('')} className="hidden md:inline-flex">
            + Add topic
          </Button>
        ) : null}
      </div>

      {topics.length === 0 ? (
        <StateBlock
          eyebrow="Empty library"
          title="Nothing here yet"
          body="Save a concept the moment you understand it. The definition is what it is; the mental model is how you think about it."
          action={
            <Button variant="primary" size="lg" onClick={() => openAdd('')}>
              + Add your first topic
            </Button>
          }
        />
      ) : (
        <>
          <LibraryToolbar
            state={state}
            onChange={update}
            onClear={() => writeState(CLEARED)}
            categories={categoryOptions(topics)}
            confidences={confidenceOptions(topics, at)}
            difficulties={difficultyOptions(topics, at)}
            quickCounts={quickCounts}
          />

          {visible.length === 0 ? (
            /*
              Distinct from the empty library: there ARE topics, this search has
              none. Conflating the two would tell someone their library is empty
              when it is not.
            */
            <StateBlock
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              }
              title={
                state.query === ''
                  ? 'Nothing matches those filters'
                  : `No topic matches “${state.query}”`
              }
              body={
                state.category === 'all'
                  ? 'Search covers titles, definitions, mental models, categories and tags.'
                  : `Nothing in ${state.category} matches that. Search covers titles, definitions, mental models, categories and tags.`
              }
              action={
                <>
                  {/* Drops the filters, keeps the query — "search ALL topics". */}
                  <Button onClick={() => writeState({ ...CLEARED, query: state.query })}>
                    Search all {stats.total} topics
                  </Button>
                  {state.query === '' ? null : (
                    <Button variant="primary" onClick={() => openAdd(state.query)}>
                      + Add “{state.query}”
                    </Button>
                  )}
                </>
              }
            />
          ) : (
            <>
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
        </>
      )}

      {/* Remounted per prefill, so the title arrives via a state initialiser. */}
      <TopicSheet
        key={prefillTitle}
        open={sheetOpen}
        onClose={closeSheet}
        onSaved={setSaved}
        categories={categoryOptions(topics)}
        initialTitle={prefillTitle}
      />

      {saved ? <Toast message={`Saved — ${saved}`} /> : null}
    </>
  )
}
