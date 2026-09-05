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

/** Page size once the library is too big to send whole. */
export const SERVER_PAGE_SIZE = 60
