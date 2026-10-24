/**
 * The two sizes that decide how the library is read.
 *
 * They live in the domain rather than in src/lib/data because more than the data
 * layer needs them: the e2e seed builds a library deliberately just over the
 * threshold, and the specs assert on the page size. src/lib/data/library.ts is
 * `server-only`, so anything importing from there cannot run in a script.
 */

/**
 * Up to this many topics are sent whole and filtered in the browser.
 *
 * Chosen so that a personal library — the case this application is actually used
 * for — keeps instant, round-trip-free search. At roughly 1KB a topic this is
 * about half a megabyte, which issue #4 calls comfortable. Past it, correctness
 * beats immediacy and the query moves to the database.
 */
export const LOCAL_MODE_MAX = 500

/** The Library selector deliberately offers a short, scannable set of sizes. */
export const LIBRARY_PAGE_SIZES = [12, 24, 48] as const

export type LibraryPageSize = (typeof LIBRARY_PAGE_SIZES)[number]

/** The card grid is most legible when a first visit has two tidy rows of cards. */
export const DEFAULT_LIBRARY_PAGE_SIZE: LibraryPageSize = 12

/**
 * The server uses the same size the visible paginator does. Keeping this alias
 * makes the old server-paging import a stable API for scripts and tests.
 */
export const SERVER_PAGE_SIZE = DEFAULT_LIBRARY_PAGE_SIZE

export function isLibraryPageSize(value: string | null): value is `${LibraryPageSize}` {
  return value !== null && LIBRARY_PAGE_SIZES.some((size) => String(size) === value)
}
