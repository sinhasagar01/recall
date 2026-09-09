import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The way back to the library is one component, not a class string people copy.
 *
 * ── Why a guard and not a convention ────────────────────────────────────────
 * There were seven hand-rolled links to `/library`, and the four-search
 * enumeration found every one of them. What failed was the reading afterwards:
 * six were judged from the grep line without opening the file, written off as
 * prose, and shipped as underlined text beside a component built to replace
 * them. A search can be complete and a classification still wrong, and this is
 * the check that does not depend on either.
 *
 * The rule is mechanical: a styled link whose destination is the library is the
 * shared control or it is a mistake.
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

/**
 * The two files allowed to name the bare destination.
 *
 * `back-to-library.tsx` IS the control. `tab-bar.tsx` is navigation — a tab is
 * not a way back, it is where you are, and it carries `aria-current` rather than
 * a label saying "back".
 */
const ALLOWED = ['components/ui/back-to-library.tsx', 'components/topics/tab-bar.tsx']

describe('every way back to the library is the same control', () => {
  it('is the only thing that links to a bare /library', () => {
    /*
      `/library?add=1` is deliberately not matched. That is an ACTION — it opens
      the add form — and its label says so. A link to the bare library is a
      destination, and destinations get the control.
    */
    const offenders = sourceFiles(SRC)
      .filter((file) => readFileSync(file, 'utf8').includes('href="/library"'))
      .map(relative)
      .filter((path) => !ALLOWED.includes(path))

    expect(
      offenders,
      'a styled link to the library is the shared control or it is a mistake',
    ).toEqual([])
  })

  it('and the control still exists, so the check above is not vacuous', () => {
    const control = readFileSync(join(SRC, 'components/ui/back-to-library.tsx'), 'utf8')

    expect(control, 'the control must actually link to the library').toContain('href="/library"')
    expect(control, 'and be an anchor, since a Button wrapping a Link is invalid').toContain(
      '<Link',
    )

    /* Guard the guard: if nobody used it, the rule above would hold trivially. */
    const callers = sourceFiles(SRC)
      .filter((file) => readFileSync(file, 'utf8').includes('<BackToLibrary'))
      .map(relative)

    expect(callers.length, 'the control must be in use').toBeGreaterThan(8)
  })
})
