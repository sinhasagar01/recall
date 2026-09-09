/**
 * How every read and write in `lib/data` reports a database failure.
 *
 * One module because there were **ten byte-identical copies** of this function,
 * one per data module, and they had the same defect ten times over.
 *
 * ── What the old format asserted, and could not deliver ─────────────────────
 * It was `${action} failed: ${code ?? 'unknown'} · ${message}` — a shape that
 * assumes `message` says something. When it does not, the result is an action
 * name, a colon, the word "unknown", a separator, and then nothing:
 *
 *     Counting your ledger failed: unknown ·
 *
 * That is worse than a stack trace. A trace at least says where. This names the
 * thing that broke and then stops, and it read as a bug in `countLedger` — which
 * was fine — rather than as an error the transport had already discarded.
 *
 * ── Why an error can arrive with nothing in it ──────────────────────────────
 * A PostgREST error's description lives in the response BODY. A request made
 * with `head: true` is an HTTP HEAD, which has no body by definition, so there
 * is nothing for the client to parse and the error object arrives as
 * `{ message: '' }`. The same read without `head` returns
 * `PGRST301 · No suitable key or wrong key type`. See ARCHITECTURE.md.
 *
 * So this says what it actually knows, and says plainly when it knows nothing —
 * because "the server sent no description" is a fact worth reporting, and it
 * points at the request rather than at the query.
 */
export interface DatabaseError {
  code?: string
  message?: string
  /** PostgREST puts the useful half here — "None of the keys was able to decode the JWT". */
  details?: string | null
  hint?: string | null
}

export function fail(action: string, error: DatabaseError, status?: number): never {
  const where = status === undefined ? '' : ` (HTTP ${status})`
  const message = error.message?.trim() ?? ''

  if (message === '') {
    throw new Error(
      `${action} failed${where}, and the server sent no description. ` +
        'An error with no message usually means the request carried no response body — ' +
        'a `head: true` count is the common cause. See ARCHITECTURE.md.',
    )
  }

  /* `details` is often the only sentence that names the actual cause. */
  const detail = error.details?.trim() ? ` — ${error.details.trim()}` : ''

  throw new Error(`${action} failed${where}: ${error.code ?? 'unknown'} · ${message}${detail}`)
}
