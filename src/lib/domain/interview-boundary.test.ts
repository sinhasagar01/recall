import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Two boundaries, and they run in opposite directions.
 *
 * **A round never reaches the queue.** The seventh guard in the line —
 * secret-key, evidence, sources, phases, today, ai, and this. The interview
 * reads topics to ask about them; it is not a practisable thing and the queue
 * must never learn it exists.
 *
 * **The interview scale never leaves the interview.** A 0–100 colour scale that
 * appears on a topic card stops being a scale and becomes palette meaning, which
 * is the one thing DESIGN.md's colour section refuses. Unlike every other guard
 * here, this one is the SECOND line of defence: the scale is defined on
 * `[data-mode='interview']` in globals.css, so outside that subtree the custom
 * properties do not resolve and a stray `bg-[var(--volt)]` paints nothing. The
 * cascade makes it true; this names the rule for whoever reads it next.
 *
 * ── The tokens, counted against the tree before being written ───────────────
 * Arc 5 shipped a guard matching `days` in prose about practice gaps, so these
 * were counted first. The obvious words are all unusable:
 *
 *   `round`   283 hits — `Math.round`, "around", "rounded"
 *   `level`   100 hits
 *   `score`    18 hits
 *   `rose`     26 hits — "prose", "arose"
 *   `band`     14 hits — "chapter band"
 *   `teal`      6 hits
 *
 * What is left is distinctive and was zero before this arc: the table name, the
 * PostgREST call that reaches it, and the scale's own custom properties.
 */

const SRC = join(process.cwd(), 'src')
const ROOT = process.cwd()

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

const relative = (file: string) => file.slice(SRC.length + 1)

/** Every column that would put a round in front of the queue. */
const INTERVIEW_COLUMNS = ['interview_rounds', "from('interview_rounds')"] as const

/**
 * The modules that decide what to practise and what counts as weak.
 *
 * The same list the four earlier queue guards protect. Listed rather than
 * globbed, so adding one is a deliberate act.
 */
const QUEUE_MODULES = [
  'lib/domain/practice-selection.ts',
  'lib/domain/practice-session.ts',
  'lib/domain/confidence.ts',
  'lib/domain/library-counts.ts',
  'lib/data/practice.ts',
  'app/(practice)/practice/page.tsx',
  'app/(app)/weak/page.tsx',
]

describe('a round never reaches the queue', () => {
  it('is not named in any module that chooses what to practise or what is weak', () => {
    const offenders = QUEUE_MODULES.flatMap((file) => {
      const source = readFileSync(join(SRC, file), 'utf8')
      return INTERVIEW_COLUMNS.filter((column) => source.includes(column)).map(
        (column) => `${file} names ${column}`,
      )
    })

    expect(
      offenders,
      'the score is about the round, never about what you know — the queue must not be able to see one',
    ).toEqual([])
  })

  it('is not named in the practice or weak SQL', () => {
    /*
      The ordering runs in SQL, so the TypeScript check above would miss a join
      added to the query — which is how a round would arrive in a session.
    */
    const migrations = join(ROOT, 'supabase', 'migrations')
    const offenders = readdirSync(migrations)
      .filter((file) => /practice|weak/.test(file))
      .flatMap((file) => {
        const source = readFileSync(join(migrations, file), 'utf8')
        return INTERVIEW_COLUMNS.filter((column) => source.includes(column)).map(
          (column) => `${file} names ${column}`,
        )
      })

    expect(offenders).toEqual([])
  })

  it('has no confidence to be ordered by, which is what makes the rule absolute', () => {
    /*
      The structural half. Even given the table, the queue has nothing to sort a
      round on — `interview_test.sql` asserts `hasnt_column` for `confidence` and
      `last_practiced_at`. This is the TypeScript side of the same claim: the
      domain type carries no confidence either.
    */
    const domain = readFileSync(join(SRC, 'lib/domain/interview.ts'), 'utf8')

    expect(domain, 'a round must not carry a confidence').not.toMatch(/^\s*confidence:/m)
    expect(domain, 'nor a practice stamp').not.toMatch(/^\s*last_practiced_at:/m)
  })
})

describe('the interview scale never leaves the interview', () => {
  /**
   * The scale's own custom properties. `--volt` and `--mesh` were zero in the
   * tree before this arc; the rest are checked as `--name` rather than as bare
   * words precisely because `rose`, `teal`, `band` and `gold` are ordinary
   * English and would match prose.
   */
  const SCALE = ['--volt', '--gold', '--mint', '--rose', '--teal'] as const

  /** Where the scale is allowed to be named. */
  const ALLOWED = [/^app\/\(interview\)\//, /^components\/interview\//]

  it('is named only inside the interview tree', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => {
        const path = relative(file)
        if (ALLOWED.some((allowed) => allowed.test(path))) return false
        const source = readFileSync(file, 'utf8')
        return SCALE.some((token) => source.includes(token))
      })
      .map(relative)

    expect(
      offenders,
      'a 0–100 scale on a topic card stops being a scale and becomes palette meaning',
    ).toEqual([])
  })

  it('is defined on the scoped selector and NOT in @theme', () => {
    /*
      The assertion the whole mechanism rests on. `@theme` emits its properties on
      `:root` and generates utilities — putting the scale there would make
      `bg-volt` available to every component in the app, and the guard above
      would be the only thing standing between a scale and a topic card.

      Sliced deliberately narrowly: the `@theme` block only, so this cannot pass
      by reading a region that no longer contains anything.
    */
    const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8')

    const themeStart = css.indexOf('@theme {')
    const theme = css.slice(themeStart, css.indexOf('\n}', themeStart))

    expect(theme, 'the @theme anchor must still resolve').toContain('--color-surface')
    for (const token of SCALE) {
      expect(theme, `${token} must not be in @theme — it would become an app-wide utility`).not.toContain(
        token,
      )
    }

    expect(css, 'the scale must be defined on the scoped selector').toMatch(
      /\[data-mode='interview'\]\s*\{[\s\S]*--volt:/,
    )
  })

  it('is carried by a layout that actually sets the attribute', () => {
    /*
      Guard the guard. Every assertion above is about where the scale is written;
      none of them notices if the subtree that makes it resolve stops existing.
      Without `data-mode="interview"` on the layout, the scoped block matches
      nothing and the whole mode renders unstyled.
    */
    const layout = readFileSync(join(SRC, 'app/(interview)/layout.tsx'), 'utf8')

    expect(layout, 'the interview layout must set data-mode, or the scale resolves nowhere').toContain(
      'data-mode="interview"',
    )
  })
})

describe('nothing touches confidence until you press', () => {
  /**
   * The structural half of "the scorecard offers and you confirm".
   *
   * The score is about the round, never about what you know — so the path that
   * RENDERS a scorecard must have no way to write one back into the library. Not
   * carefully avoided: unable.
   *
   * Same treatment as arc 6's "opening Today writes nothing" and "extraction
   * saves nothing before Save", and seen failing the same way, by putting an
   * update on the render path.
   */
  const RENDER_PATH = [
    'components/interview/scorecard.tsx',
    'components/interview/round.tsx',
    'lib/ai/interview.ts',
    'lib/domain/interview.ts',
  ]

  /* The PostgREST verbs that create or change rows. */
  const WRITES = ['.insert(', '.upsert(', '.update(', '.delete(', '.rpc(']

  it('has no write anywhere on the path that renders a scorecard', () => {
    const offenders = RENDER_PATH.flatMap((file) => {
      const source = readFileSync(join(SRC, file), 'utf8')
      return WRITES.filter((verb) => source.includes(verb)).map((verb) => `${file} calls ${verb}`)
    })

    expect(
      offenders,
      'a scorecard offers — it must not be able to change a confidence by rendering',
    ).toEqual([])
  })

  it('cannot reach a database client at all from that path', () => {
    /*
      Stronger than the verb list, and it does not depend on guessing every verb:
      a module with no client has nothing to write THROUGH, so this stays true
      against a PostgREST method nobody has thought of yet.
    */
    for (const file of RENDER_PATH) {
      const source = readFileSync(join(SRC, file), 'utf8')
      expect(source, `${file} must not import a Supabase client`).not.toContain('@/lib/supabase')
      expect(source, `${file} must not build its own client`).not.toContain(
        "from '@supabase/supabase-js'",
      )
    }
  })

  it('keeps the confidence write in one function, so the check above is not vacuous', () => {
    /*
      Guard the guard. If the write moved somewhere else entirely, everything
      above would still pass while asserting nothing — the empty-set failure arc 4
      found in five shipped specs at once.
    */
    const data = readFileSync(join(SRC, 'lib/data/interview.ts'), 'utf8')

    expect(data, 'the write must exist somewhere, or the checks above guard nothing').toContain(
      "update({ confidence: 'weak' })",
    )

    /* And exactly one module may call it. */
    const callers = sourceFiles(SRC)
      .filter((file) => readFileSync(file, 'utf8').includes('markTopicsWeak'))
      .map(relative)
      .filter((path) => path !== 'lib/data/interview.ts')

    expect(callers).toEqual(['app/(interview)/interview/actions.ts'])
  })
})

describe('a turn carries the topic it is about', () => {
  /**
   * The guard for issue #25, and the one that did not exist.
   *
   * `Turn.topicId` was typed from the first day of interview mode and passed
   * `null` at all five construction sites for a whole session. Nothing failed:
   * the type was satisfied, the field was commented as available, and its two
   * consumers — the transcript serializer's `(topic …)` branch and the round's
   * `topic_ids` — read a value that was always null.
   *
   * A typed field that is never populated is a lie the type tells, and the type
   * system cannot catch it because `null` is a legal value. So it is asserted on
   * the source: the runner may not construct a turn with a literal null topic.
   */
  it('is never constructed with a hard-coded null topic', () => {
    const runner = readFileSync(join(SRC, 'components/interview/round.tsx'), 'utf8')

    expect(
      runner.includes('topicId: null'),
      'a literal null topic is how this field stayed empty for a whole session',
    ).toBe(false)
  })

  it('has somewhere for the topic to come from, so the check above is not vacuous', () => {
    /*
      Guard the guard. The assertion above passes for a runner that removed the
      field entirely, or that never asks the model for an attribution at all.
    */
    const ai = readFileSync(join(SRC, 'lib/ai/interview.ts'), 'utf8')
    const runner = readFileSync(join(SRC, 'components/interview/round.tsx'), 'utf8')

    expect(ai, 'the turn call must ask for an attribution').toContain('topic_id')

    /*
      On `result.topicId`, not on the local variable's name. The first draft
      asserted the variable and a perturbation renaming its declaration DID NOT
      BITE — the usages still carried the string, so the assertion could not tell
      a rename from a removal. What matters is not that a variable exists but
      that the MODEL's attribution reaches the turn, which is exactly what was
      missing for a whole session.
    */
    expect(runner, 'the model’s attribution must reach the turn').toContain('result.topicId')
  })
})

describe('a round is written once and never again', () => {
  /**
   * The structural half of "rewind never changes the stored round".
   *
   * Session two-a lets you re-ask a question after the scorecard is on screen.
   * The rule is that the stored round cannot move — and the cheapest way to keep
   * a rule like that is for there to be no code capable of breaking it.
   *
   * ── Token, counted against the tree before being written ────────────────────
   * `rewind` was **0 hits in src/** before this session, which makes it usable.
   * `quiz` was **331**, which makes it worthless — the arc 5 `days` lesson
   * exactly, so nothing here is asserted on that word. What is asserted on is
   * `interview_rounds`, which was 0 outside the one data module and still is.
   */
  const ROUNDS_TABLE = "from('interview_rounds')"

  it('is inserted in exactly one module, and updated in none', () => {
    const writers = sourceFiles(SRC)
      .filter((file) => readFileSync(file, 'utf8').includes(ROUNDS_TABLE))
      .map(relative)

    expect(writers, 'only the data module may reach the rounds table').toEqual([
      'lib/data/interview.ts',
    ])

    const data = readFileSync(join(SRC, 'lib/data/interview.ts'), 'utf8')

    /*
      Sliced to the round-writing function so this cannot pass because some OTHER
      part of the file has no update — `markTopicsWeak` lives here too and does
      call `.update(`, on `topics`, which is a different table and a different
      rule.
    */
    const start = data.indexOf('export async function saveRound')
    const end = data.indexOf('\nexport ', start)

    expect(start, 'the saveRound anchor must still resolve').toBeGreaterThan(-1)
    expect(end, 'and so must its closing anchor').toBeGreaterThan(start)

    const body = data.slice(start, end)

    expect(body, 'a round is one insert').toContain('.insert(')
    expect(body, 'and nothing updates it — a rewind must not be able to move a stored score').not.toContain(
      '.update(',
    )
  })

  it('has no rewind anywhere near a write', () => {
    /*
      The other direction, and the one that would catch a rewind quietly gaining
      a write of its own somewhere new. `rewind` is distinctive enough that a
      match MEANS the rewind path — see the token count above.
    */
    const offenders = sourceFiles(SRC)
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        if (!/rewind/i.test(source)) return false
        return (
          source.includes('@/lib/supabase') ||
          source.includes("from '@supabase/supabase-js'") ||
          source.includes(ROUNDS_TABLE)
        )
      })
      .map(relative)

    expect(
      offenders,
      'nothing that knows what a rewind is may also hold a client or name the rounds table',
    ).toEqual([])
  })
})

describe('interviewer level is a prompt, never a multiplier', () => {
  it('cannot vary the scoring prompt, because the scoring prompt takes no level', () => {
    /*
      "A harder interviewer does not lower your score" is a claim about two
      strings, and it is enforced by there being two: `LEVEL_PROMPT` varies and
      `SCORING_PROMPT` is a flat constant.

      Asserted on the SOURCE rather than by calling it — `lib/ai/interview.ts`
      imports `server-only`, which cannot be loaded here, and importing it just to
      compare three identical strings would be testing a function I wrote to make
      the test possible. This reads the thing itself.
    */
    const ai = readFileSync(join(SRC, 'lib/ai/interview.ts'), 'utf8')

    const start = ai.indexOf('const SCORING_PROMPT')
    const end = ai.indexOf('].join(', start)

    /*
      Both ends asserted. The first draft closed on a string containing an escaped
      newline, which never matched, so `indexOf` returned -1 and the slice ran to
      the end of the file — picking up unrelated template literals and failing for
      a reason that had nothing to do with the prompt. A slice with an unchecked
      anchor is the "coupled to location" failure in ARCHITECTURE.md, and it fails
      open just as easily as it fails closed.
    */
    expect(start, 'the SCORING_PROMPT anchor must still resolve').toBeGreaterThan(-1)
    expect(end, 'and so must its closing anchor').toBeGreaterThan(start)

    const prompt = ai.slice(start, end)

    // No interpolation at all: nothing can be threaded through it.
    expect(prompt, 'the scoring prompt must not interpolate anything').not.toContain('${')
    expect(prompt, 'nor name a level').not.toMatch(/friendly|staff|skeptical/)
    expect(prompt, 'nor read LEVEL_PROMPT').not.toContain('LEVEL_PROMPT')

    // And the scoring call must not receive one.
    const scoreStart = ai.indexOf('export async function scoreRound')
    const scoreBody = ai.slice(scoreStart)
    expect(scoreBody, 'scoreRound must not take or pass a level').not.toContain('level')
  })

  it('does vary the interviewer prompt, or the level would mean nothing at all', () => {
    /*
      Guard the guard. Every assertion above is satisfied by a file with no level
      handling whatsoever, which would pass while the feature did nothing.
    */
    const ai = readFileSync(join(SRC, 'lib/ai/interview.ts'), 'utf8')

    for (const level of ['friendly', 'staff', 'skeptical']) {
      expect(ai, `LEVEL_PROMPT must actually say something for ${level}`).toContain(`${level}:`)
    }
  })
})
