import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The browser never sees the key and never talks to OpenAI.
 *
 * The sixth boundary guard, and the second of the two shapes: `secret-key`,
 * `evidence`, `sources`, `phases`, `today` — five of those forbid a column in a
 * module that has no business knowing a concept exists. This one, like
 * `secret-key-boundary.test.ts` which it is modelled on, allows exactly one
 * holder and forbids everyone else.
 *
 * ── Why an allowlist and not a list of guarded modules ──────────────────────
 * The queue guards name the modules they protect, because the set of modules
 * that decide what to practise is small, known, and worth making deliberate to
 * extend. The set of modules that must not hold an API key is *every module*, so
 * enumerating them is the wrong shape — it walks the tree instead, and a seventh
 * arc cannot add a file it forgot to list.
 *
 * ── The tokens, checked against prose BEFORE they were written ──────────────
 * Arc 5 shipped a guard whose token was `days`, which matched the weak page's
 * prose about practice gaps. So these were counted first:
 *
 *   `openai.`            REJECTED — 2 hits in supabase/config.toml, and it also
 *                        matches `platform.openai.com`, which the out-of-credit
 *                        copy contains. The reference's own rules tab proposed
 *                        this token: the arc 5 mistake, inside the rule written
 *                        to prevent it.
 *   `OPENAI_API_KEY`     1 pre-existing hit — `supabase/config.toml:100`, which
 *                        is Supabase's own AI config. So this walks `src/` only.
 *                        Repo-wide it would go red on shipped configuration.
 *   `api.openai.com`     0 hits. Distinct from `platform.openai.com`, which is
 *                        the host named in copy.
 *   `NEXT_PUBLIC_OPENAI` 0 hits.
 *
 * The lesson generalises: a guard token must be distinctive enough that a match
 * MEANS what the guard claims, and the fix for a false positive is a better
 * token, never a file exception.
 */

const SRC = join(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

const relative = (file: string) => file.slice(SRC.length + 1)

describe('the OpenAI key', () => {
  it('is referenced by exactly one module', () => {
    const holders = sourceFiles(SRC)
      .filter((file) => readFileSync(file, 'utf8').includes('OPENAI_API_KEY'))
      .map(relative)

    expect(holders).toEqual(['lib/ai/extract.ts'])
  })

  it('reaches the vendor from exactly that one module too', () => {
    /*
      Stated separately from the key. A module could talk to OpenAI without
      naming the key — by taking it as a parameter — and that is still the
      browser talking to OpenAI if it happens in a client component.
    */
    const callers = sourceFiles(SRC)
      .filter((file) => readFileSync(file, 'utf8').includes('api.openai.com'))
      .map(relative)

    expect(callers).toEqual(['lib/ai/extract.ts'])
  })

  it('is never named in a client component', () => {
    /*
      The assertion that fails FIRST when someone reaches for the key from the
      review screen, and the one whose message says why. The allowlist above
      would also catch it, but it would report "an unexpected holder" rather than
      "this runs in the browser".
    */
    const offenders = sourceFiles(SRC)
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return (
          /^\s*['"]use client['"]/m.test(source) &&
          (source.includes('OPENAI_API_KEY') || source.includes('api.openai.com'))
        )
      })
      .map(relative)

    expect(
      offenders,
      'a client component reaching for the key ships it to the browser',
    ).toEqual([])
  })

  it('is never exposed under a NEXT_PUBLIC_ prefix, anywhere', () => {
    /*
      Its own assertion, because it is its own mistake with its own failure
      mode. The allowlist above passes happily for
      `NEXT_PUBLIC_OPENAI_API_KEY` in `lib/ai/extract.ts` — it contains the
      substring `OPENAI_API_KEY`, so the holder is still exactly one file, and
      the key is public.

      `NEXT_PUBLIC_` is inlined into the client bundle at build time by Next
      regardless of which module writes it, so the file it appears in does not
      matter and there is no allowlist here.
    */
    const offenders = sourceFiles(SRC)
      .filter((file) => readFileSync(file, 'utf8').includes('NEXT_PUBLIC_OPENAI'))
      .map(relative)

    expect(
      offenders,
      'NEXT_PUBLIC_ on an AI key is the same mistake as NEXT_PUBLIC_ on the Supabase secret key',
    ).toEqual([])
  })
})

describe('an extraction result reaches the database only through Save', () => {
  /**
   * The structural half of "nothing is saved until you press Save".
   *
   * Extraction produces a review screen and nothing else. That is a claim about
   * the code path, so it is asserted on the code path — the same treatment arc 5
   * gave "opening Today writes nothing", and it was seen failing the same way,
   * by putting a write on the extract path.
   */
  const EXTRACT_PATH = ['lib/ai/extract.ts', 'lib/domain/extraction.ts']

  /* The PostgREST verbs that create or change rows. */
  const WRITES = ['.insert(', '.upsert(', '.update(', '.delete(', '.rpc(']

  it('has no write anywhere on the extract path', () => {
    const offenders = EXTRACT_PATH.flatMap((file) => {
      const source = readFileSync(join(SRC, file), 'utf8')
      return WRITES.filter((verb) => source.includes(verb)).map((verb) => `${file} calls ${verb}`)
    })

    expect(
      offenders,
      'extraction must produce a review screen and nothing else — a concept you have not looked at is not one you chose',
    ).toEqual([])
  })

  it('cannot reach a database client at all from the extract path', () => {
    /*
      Stronger than the verb list and it does not depend on guessing every verb.
      A module with no client has nothing to write THROUGH, so this stays true
      against a PostgREST method nobody has thought of yet.
    */
    for (const file of EXTRACT_PATH) {
      const source = readFileSync(join(SRC, file), 'utf8')
      expect(source, `${file} must not import a Supabase client`).not.toContain('@/lib/supabase')
      expect(source, `${file} must not build its own client`).not.toContain(
        "from '@supabase/supabase-js'",
      )
    }
  })

  it('keeps the write in the data module, so there is somewhere for it to be', () => {
    /*
      Guard the guard. If the write moved somewhere else entirely, the assertions
      above would still pass while asserting nothing — the empty-set failure arc
      4 found in five shipped specs at once.
    */
    const writer = readFileSync(join(SRC, 'lib/data/extraction.ts'), 'utf8')

    expect(writer, 'saving must exist somewhere, or the checks above are vacuous').toContain(
      '.insert(',
    )
  })
})
