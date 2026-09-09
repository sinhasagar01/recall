import { describe, expect, it } from 'vitest'
import { apprenticeshipNav } from '@/lib/domain/navigation'

/**
 * The negative half of "no key, no entry point" — the half arc 7 did not build.
 *
 * The plan said *"No entry point anywhere when there is no key."* The route's
 * `notFound()` shipped and satisfied that sentence completely, because a
 * requirement stated only as a negative never says what exists in the positive
 * case. Nothing failed: the plan was met, the guards were green, and interview
 * mode was unreachable by clicking for its whole first deployment.
 *
 * So both directions are asserted here, and the positive one is the assertion
 * that was missing.
 */

const COUNTS = {
  today: '2 / 3',
  phases: '4 / 9',
  ledger: '11',
  sources: '6',
}

const hrefs = (interview: boolean) =>
  apprenticeshipNav({ ...COUNTS, interview }).map((destination) => destination.href)

describe('the Apprenticeship group', () => {
  it('offers Interview when a key is configured', () => {
    expect(
      hrefs(true),
      'a feature nothing links to is a feature nobody has',
    ).toContain('/interview')
  })

  it('does not offer it at all when there is no key', () => {
    /*
      Absent, not disabled. `toContain` is the assertion rather than a check on
      some `disabled` flag, because the rule is that the entry does not exist —
      a greyed entry advertises a feature you cannot have, and a link to a route
      that answers 404 is worse than no link.
    */
    expect(hrefs(false)).not.toContain('/interview')
  })

  it('changes nothing else when the key comes and goes', () => {
    /*
      Guard the guard. Both assertions above pass for a function that returns
      `['/interview']` and nothing else, or that drops half the group when the
      key is absent. The other four are fixed.
    */
    const withoutKey = hrefs(false)

    expect(withoutKey).toEqual(['/today', '/phases', '/ledger', '/sources'])
    expect(hrefs(true)).toEqual([...withoutKey, '/interview'])
  })

  it('keeps Phases directly above Sources', () => {
    /*
      The one ordering in this group with a written argument behind it: a phase
      is what you are trying to become able to do, a source is the raw material
      you do it with. Interview was appended rather than inserted so that this
      stays true, and this says so out loud.
    */
    const order = hrefs(true)
    expect(order.indexOf('/phases')).toBeLessThan(order.indexOf('/sources'))
  })

  it('carries a null count through rather than inventing a zero', () => {
    // A day you have not started is not a day you are failing at.
    const [today] = apprenticeshipNav({ ...COUNTS, today: null, interview: true })
    expect(today.count).toBeNull()
  })
})
