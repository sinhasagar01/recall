'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { LibraryToolbar, type ToolbarState } from '@/components/topics/library-toolbar'
import { DeleteAccount } from '@/components/topics/delete-account'
import { TopicCard } from '@/components/topics/topic-card'
import { TopicSheet } from '@/components/topics/topic-sheet'
import { Button } from '@/components/ui/button'
import { StateBlock } from '@/components/ui/state-block'
import { Toast } from '@/components/ui/toast'
import { signOut } from '@/app/(auth)/actions'
import { loadMoreTopics } from '@/app/(app)/library/actions'
import { SEARCH_INPUT_ID } from '@/components/topics/global-keys'
import type { Cursor, LibraryData } from '@/lib/data/library'
import {
  categoryOptionsFromCounts,
  confidenceOptionsFromCounts,
  difficultyOptionsFromCounts,
  formatRelativeTime,
  libraryStatsFromCounts,
} from '@/lib/domain/library'
import { libraryCounts } from '@/lib/domain/library-counts'
import { filterTopics, type QuickFilter, type TopicFilters } from '@/lib/domain/search-filter'
import type { Confidence, Difficulty, Kind, Topic } from '@/lib/domain/types'

/** How long typing settles before server mode asks the database. */
const SEARCH_DEBOUNCE_MS = 250

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
    kind: params.get('kind') ?? 'all',
    quickFilters: QUICK_FILTERS.filter((quick) => params.getAll('quick').includes(quick)),
  }
}

function stateToParams(state: ToolbarState): string {
  const params = new URLSearchParams()
  if (state.query) params.set('q', state.query)
  if (state.category !== 'all') params.set('category', state.category)
  if (state.confidence !== 'any') params.set('confidence', state.confidence)
  if (state.difficulty !== 'any') params.set('difficulty', state.difficulty)
  if (state.kind !== 'all') params.set('kind', state.kind)
  for (const quick of state.quickFilters) params.append('quick', quick)

  return params.toString()
}

/** The toolbar's sentinels ("all", "any") are absences; the domain says null. */
function toFilters(state: ToolbarState): TopicFilters {
  return {
    query: state.query,
    category: state.category === 'all' ? null : state.category,
    confidence: state.confidence === 'any' ? null : (state.confidence as Confidence),
    difficulty: state.difficulty === 'any' ? null : (state.difficulty as Difficulty),
    kind: state.kind === 'all' ? null : (state.kind as Kind),
    quickFilters: state.quickFilters,
  }
}

const CLEARED: ToolbarState = {
  query: '',
  category: 'all',
  confidence: 'any',
  difficulty: 'any',
  kind: 'all',
  quickFilters: [],
}

export function LibraryView({
  data,
  account,
}: {
  data: LibraryData
  account: { topics: number; images: number }
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [prefillTitle, setPrefillTitle] = useState('')
  const [saved, setSaved] = useState<string | null>(null)

  const at = new Date(data.readAt)
  const params = new URLSearchParams(searchParams.toString())
  const state = readState(params)
  const filters = toFilters(state)

  /*
    Pages fetched by "Load more", kept in client state rather than the URL: the
    filters are what should be shareable, not how far someone happened to scroll.
    Cleared whenever the server sends a fresh read — a new readAt means new
    filters, and pages fetched under the old ones no longer belong to this list.
  */
  const [loaded, setLoaded] = useState<{
    readAt: string
    topics: Topic[]
    nextCursor: Cursor | null
  } | null>(null)
  const [isLoadingMore, startLoadingMore] = useTransition()

  /*
    Stamped with the readAt they were fetched under and discarded during render
    when the server sends a newer one, rather than cleared from an effect. A new
    readAt means new filters, and pages fetched under the old ones do not belong in
    this list — dropping them while rendering avoids a frame that shows them.
  */
  const more = loaded?.readAt === data.readAt ? loaded : null
  const appended = more?.topics ?? []
  const nextCursor = more ? more.nextCursor : data.mode === 'server' ? data.nextCursor : null

  const loadMore = () => {
    if (nextCursor === null) return

    startLoadingMore(async () => {
      const page = await loadMoreTopics(filters, nextCursor)
      setLoaded({
        readAt: data.readAt,
        topics: [...appended, ...page.topics],
        nextCursor: page.nextCursor,
      })
    })
  }

  /*
    ── The only place the two reading modes differ ─────────────────────────────
    Rows and counts are chosen together, in one expression. In local mode both
    come from the domain functions over the whole library; in server mode both
    come from SQL. They cannot be taken from different modes, because there is one
    branch and it yields both.

    That matters because of the rule phase 7 established: a count and the list it
    describes come from the same computation, so a filter reading 12 cannot yield
    11 rows. A hybrid is exactly where that guarantee would be lost.

    supabase/tests/library_parity_test.sql asserts the two branches produce the
    same rows AND the same counts over a shared corpus.
  */
  const { counts, rows } =
    data.mode === 'local'
      ? {
          counts: libraryCounts(data.topics, filters, at),
          rows: filterTopics(data.topics, filters, at),
        }
      : { counts: data.counts, rows: [...data.topics, ...appended] }

  /*
    The URL is written immediately in both modes with history.replaceState — the
    documented Next pattern that updates the address bar without a reload while
    staying in sync with useSearchParams. That is what keeps the search input
    responsive (it is controlled by the URL) and the view shareable, and it is why
    there is no history entry per keystroke.

    Local mode stops there: it already has every topic, so narrowing is a re-render
    and nothing is fetched. Server mode has to ask the database, so it additionally
    schedules a navigation once typing settles. The explicit href matters —
    replaceState bypassed the router, so its own idea of the current URL is stale,
    and handing it the address we just wrote is what makes it fetch.
  */
  const refetch = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isFetching, startFetching] = useTransition()

  useEffect(() => () => clearTimeout(refetch.current ?? undefined), [])

  const writeState = (next: ToolbarState) => {
    const query = stateToParams(next)
    window.history.replaceState(null, '', query === '' ? window.location.pathname : `?${query}`)

    if (data.mode === 'local') return

    clearTimeout(refetch.current ?? undefined)
    refetch.current = setTimeout(() => {
      startFetching(() => router.replace(window.location.pathname + window.location.search, { scroll: false }))
    }, SEARCH_DEBOUNCE_MS)
  }

  /*
    The mobile FAB lives in the layout and the sheet's state lives here, so it links
    to `?add=1` rather than reaching across the tree for a setter. Consistent with
    the filters, which already live in the URL, and it works from any page.
  */
  /*
    Arriving from `/` pressed on another page. The param is consumed on mount and
    stripped, so a reload or a shared URL does not steal focus a second time.
  */
  const focusRequested = params.get('focus') === 'search'

  useEffect(() => {
    if (!focusRequested) return
    const input = document.getElementById(SEARCH_INPUT_ID)
    if (input instanceof HTMLInputElement) input.focus()

    const next = new URLSearchParams(window.location.search)
    next.delete('focus')
    const query = next.toString()
    window.history.replaceState(null, '', query === '' ? window.location.pathname : `?${query}`)
  }, [focusRequested])

  const addRequested = params.get('add') === '1'
  const sheetOpen = adding || addRequested

  const closeSheet = () => {
    setAdding(false)
    if (addRequested) writeState(state)
  }

  const update = (next: Partial<ToolbarState>) => writeState({ ...state, ...next })

  const isFiltered =
    state.query !== '' ||
    state.category !== 'all' ||
    state.confidence !== 'any' ||
    state.difficulty !== 'any' ||
    state.kind !== 'all' ||
    state.quickFilters.length > 0

  const stats = libraryStatsFromCounts(counts)

  /*
    Counts come from the FULL library, never the filtered set. The reference is
    explicit: with a query matching nothing and a category selected, its category
    select still reads "All categories 48". Only `matching` narrows.
  */
  const quickCounts = counts.quick
  const kindCounts = { total: counts.total, ...counts.byKind }

  /*
    "Recently learned" splits the unfiltered library into what arrived this week
    and everything else — and in server mode the client does not have the
    unfiltered library, only a page of it. Splitting a page would produce a heading
    that describes the page rather than the library, and rows would move under it
    as you paged. So the split is local mode only; server mode renders one list,
    which is already newest-first.
  */
  const recent = data.mode === 'local' && !isFiltered
    ? filterTopics(data.topics, { quickFilters: ['recently-added'] }, at)
    : []
  const recentIds = new Set(recent.map((topic) => topic.id))
  const rest = rows.filter((topic) => !recentIds.has(topic.id))

  const openAdd = (title: string) => {
    setPrefillTitle(title)
    setAdding(true)
  }

  const subtitle = () => {
    if (counts.total === 0) return 'Nothing saved yet'
    if (isFiltered) return `${counts.matching} of ${counts.total} topics match`
    return `${counts.total} ${counts.total === 1 ? 'topic' : 'topics'} · ${counts.needsReview} need review · last practiced ${formatRelativeTime(stats.lastPracticedAt, at)}`
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
        <div className="flex items-center gap-3 md:hidden">
          {/* The rail is hidden here, so the account surface lives in this head. */}
          <Link href="/settings" className="rounded-md px-2 py-1 text-label text-ink-2 hover:bg-surface-2 hover:text-ink">
            Settings
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="cursor-pointer rounded-md px-2 py-1 text-label text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              Sign out
            </button>
          </form>
          {/* The rail is hidden below the breakpoint, so deletion needs a home here. */}
          <DeleteAccount topics={account.topics} images={account.images} />
        </div>

        {counts.total > 0 ? (
          <Button variant="primary" onClick={() => openAdd('')} className="hidden md:inline-flex">
            + Add topic
          </Button>
        ) : null}
      </div>

      {counts.total === 0 ? (
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
            categories={categoryOptionsFromCounts(counts.byCategory, counts.total)}
            confidences={confidenceOptionsFromCounts(counts.byConfidence, counts.total)}
            difficulties={difficultyOptionsFromCounts(counts.byDifficulty, counts.total)}
            quickCounts={quickCounts}
            kindCounts={kindCounts}
          />

          {rows.length === 0 ? (
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
                    Search all {counts.total} topics
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
            <div
              /*
                Server mode only: narrowing is a round trip, so the results on
                screen are briefly the previous query's. Dimming and aria-busy say
                so, rather than letting stale rows look current.
              */
              aria-busy={isFetching}
              className={isFetching ? 'opacity-60 transition-opacity' : undefined}
            >
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

              {nextCursor === null ? null : (
                <div className="mt-9 flex flex-col items-center gap-2">
                  <Button onClick={loadMore} loading={isLoadingMore} loadingLabel="Loading…">
                    Load more
                  </Button>
                  <p className="font-mono text-[11.5px] text-ink-3">
                    Showing {rows.length} of {counts.matching}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Remounted per prefill, so the title arrives via a state initialiser. */}
      <TopicSheet
        key={prefillTitle}
        open={sheetOpen}
        onClose={closeSheet}
        onSaved={setSaved}
        categories={categoryOptionsFromCounts(counts.byCategory, counts.total)}
        initialTitle={prefillTitle}
      />

      {saved ? <Toast message={`Saved — ${saved}`} /> : null}
    </>
  )
}
