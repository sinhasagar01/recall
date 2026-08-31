import { describe, expect, it } from 'vitest'
import { ORPHAN_MIN_AGE_MS, selectOrphans, type StoredObject } from '@/lib/domain/orphans'

const NOW = new Date('2026-06-15T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const HOUR = 60 * 60 * 1000

const obj = (path: string, age = 24 * HOUR): StoredObject => ({ path, createdAt: ago(age) })

describe('selectOrphans', () => {
  it('never selects an object a row points at, however old', () => {
    // The one guarantee that matters. Everything else is a heuristic; this is not.
    const objects = [obj('u/t/keep.png', 365 * 24 * HOUR)]
    expect(selectOrphans({ objects, referenced: ['u/t/keep.png'], now: NOW })).toEqual([])
  })

  it('selects an unreferenced object past the age window', () => {
    const objects = [obj('u/t/stray.png')]
    expect(selectOrphans({ objects, referenced: [], now: NOW }).map((o) => o.path)).toEqual([
      'u/t/stray.png',
    ])
  })

  it('spares an unreferenced object that is too young', () => {
    /*
      The hazard this exists for: saving is insert -> upload -> patch, so between
      the upload and the patch an object is legitimately unreferenced. A sweep
      running in that window would delete a file someone just attached.
    */
    const objects = [obj('u/t/mid-save.png', 30_000)]
    expect(selectOrphans({ objects, referenced: [], now: NOW })).toEqual([])
  })

  it('uses an hour as the window, and respects the boundary', () => {
    expect(ORPHAN_MIN_AGE_MS).toBe(HOUR)
    expect(selectOrphans({ objects: [obj('u/t/a.png', HOUR + 1)], referenced: [], now: NOW })).toHaveLength(1)
    expect(selectOrphans({ objects: [obj('u/t/a.png', HOUR - 1)], referenced: [], now: NOW })).toHaveLength(0)
  })

  it('takes the window as a parameter, so a sweep can be more cautious', () => {
    const objects = [obj('u/t/a.png', 2 * HOUR)]
    expect(selectOrphans({ objects, referenced: [], now: NOW, minAgeMs: 24 * HOUR })).toEqual([])
  })

  it('separates the referenced from the stray in one pass', () => {
    const objects = [obj('u/t1/keep.png'), obj('u/t2/stray.png'), obj('u/t3/keep2.png')]
    const orphans = selectOrphans({
      objects,
      referenced: ['u/t1/keep.png', 'u/t3/keep2.png'],
      now: NOW,
    })
    expect(orphans.map((o) => o.path)).toEqual(['u/t2/stray.png'])
  })

  it('ignores referenced paths with no object behind them', () => {
    // A row pointing at something already gone is not this sweep's problem.
    const objects = [obj('u/t/stray.png')]
    const orphans = selectOrphans({ objects, referenced: ['u/t/missing.png'], now: NOW })
    expect(orphans.map((o) => o.path)).toEqual(['u/t/stray.png'])
  })

  it('handles an empty bucket and an empty library', () => {
    expect(selectOrphans({ objects: [], referenced: [], now: NOW })).toEqual([])
    expect(selectOrphans({ objects: [], referenced: ['u/t/a.png'], now: NOW })).toEqual([])
  })

  it('does not mutate what it was given', () => {
    const objects = [obj('u/t/a.png')]
    const snapshot = [...objects]
    selectOrphans({ objects, referenced: [], now: NOW })
    expect(objects).toEqual(snapshot)
  })

  it('is safe to run twice — the second pass sees the same answer', () => {
    const objects = [obj('u/t/a.png'), obj('u/t/b.png')]
    const first = selectOrphans({ objects, referenced: ['u/t/a.png'], now: NOW })
    const second = selectOrphans({ objects, referenced: ['u/t/a.png'], now: NOW })
    expect(first).toEqual(second)
  })
})
