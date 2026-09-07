import { describe, expect, it } from 'vitest'
import {
  currentPhaseId,
  deletePhaseCopy,
  demonstrationOf,
  missingHalf,
} from '@/lib/domain/phases'
import { makeQuiz, makeTopic } from '@/lib/domain/topic-fixture'

/*
  Every state on the reference's "Every state" tab, in its order:
  nothing linked; linked but weak with no evidence; recall without evidence;
  evidence without recall; both halves.

  The two middle ones are the point of the whole screen — the same unchecked box,
  two opposite reasons — so they are asserted on the SENTENCE, not just on the
  boolean. A test that only checked `demonstrated === false` would pass for a
  screen that says nothing.
*/

const linkedTopic = (over: Parameters<typeof makeTopic>[0] = {}) => makeTopic(over)

describe('the demonstrated rule', () => {
  it('nothing linked: not demonstrated, and no diagnosis to offer', () => {
    const d = demonstrationOf([])

    expect(d.demonstrated).toBe(false)
    expect(d.linked).toBe(0)
    // No why-line: the evidence line already says "nothing linked".
    expect(missingHalf(d)).toBeNull()
  })

  it('linked but weak with no evidence: both halves named', () => {
    const d = demonstrationOf([linkedTopic({ confidence: 'weak' })])

    expect(d).toMatchObject({ demonstrated: false, recall: false, evidence: false, topics: 1 })
    expect(missingHalf(d)).toBe(
      'Not demonstrated: nothing linked is at okay or better, and nothing carries evidence.',
    )
  })

  it('recall without evidence: you can say it, but you have not built with it', () => {
    const d = demonstrationOf([
      linkedTopic({ confidence: 'okay' }),
      linkedTopic({ confidence: 'strong' }),
    ])

    expect(d).toMatchObject({ demonstrated: false, recall: true, evidence: false })
    expect(d.atOkayOrBetter).toBe(2)
    expect(missingHalf(d)).toBe(
      'Not demonstrated: you can say it, but you have not built with it.',
    )
  })

  it('evidence without recall: you have built with it, but you cannot say it cold', () => {
    const d = demonstrationOf([
      linkedTopic({ confidence: 'weak', rebuild_at: '2026-09-01' }),
      linkedTopic({ confidence: 'new' }),
    ])

    expect(d).toMatchObject({ demonstrated: false, recall: false, evidence: true })
    expect(d.markers).toEqual(['rebuild'])
    expect(missingHalf(d)).toBe(
      'Not demonstrated: you have built with it, but you cannot say it cold.',
    )
  })

  it('both halves: demonstrated, and nothing to explain', () => {
    const d = demonstrationOf([
      linkedTopic({ confidence: 'strong', production_at: '2026-09-02' }),
      linkedTopic({ confidence: 'weak' }),
    ])

    expect(d.demonstrated).toBe(true)
    expect(missingHalf(d)).toBeNull()
  })

  it('the two halves may come from different topics', () => {
    /*
      Nothing requires one topic to carry both. "Something linked is at okay or
      better AND something linked carries evidence" is two existential claims over
      the same set, not one claim about one row.
    */
    const d = demonstrationOf([
      linkedTopic({ confidence: 'okay' }),
      linkedTopic({ confidence: 'weak', challenge_at: '2026-09-01' }),
    ])

    expect(d.demonstrated).toBe(true)
  })

  it('counts each marker once and keeps them in a fixed order', () => {
    const d = demonstrationOf([
      linkedTopic({ confidence: 'okay', production_at: '2026-09-03' }),
      linkedTopic({ confidence: 'weak', rebuild_at: '2026-09-01' }),
      linkedTopic({ confidence: 'weak', rebuild_at: '2026-09-02' }),
    ])

    expect(d.markers).toEqual(['rebuild', 'production'])
  })
})

describe('a quiz linked to a capability', () => {
  it('can satisfy the recall half', () => {
    const d = demonstrationOf([makeQuiz({ confidence: 'okay', options: ['a', 'b'], correct_option: 0 })])

    expect(d.recall).toBe(true)
    expect(d.quizzes).toBe(1)
    expect(d.topics).toBe(0)
  })

  it('can never satisfy the evidence half, even carrying markers', () => {
    /*
      The database refuses evidence columns on a quiz outright, so this row cannot
      exist. Constructed anyway, because the rule must hold on its own terms
      rather than because another file happens to prevent the input — that is
      exactly what the kind filter in demonstrationOf is for.
    */
    const impossible = {
      ...makeQuiz({ options: ['a', 'b'], correct_option: 0, confidence: 'okay' }),
      rebuild_at: '2026-09-01',
    } as unknown as ReturnType<typeof makeTopic>

    const d = demonstrationOf([impossible])

    expect(d.evidence, 'a quiz is not something you build with').toBe(false)
    expect(d.demonstrated).toBe(false)
    expect(missingHalf(d)).toBe(
      'Not demonstrated: you can say it, but you have not built with it.',
    )
  })
})

describe('which phase is current', () => {
  const demonstrated = demonstrationOf([
    makeTopic({ confidence: 'strong', rebuild_at: '2026-09-01' }),
  ])
  const notYet = demonstrationOf([makeTopic({ confidence: 'weak' })])

  it('is the earliest phase not fully demonstrated', () => {
    expect(
      currentPhaseId([
        { id: 'first', capabilities: [demonstrated, demonstrated] },
        { id: 'second', capabilities: [demonstrated, notYet] },
        { id: 'third', capabilities: [notYet] },
      ]),
    ).toBe('second')
  })

  it('is none when every phase is fully demonstrated', () => {
    expect(
      currentPhaseId([
        { id: 'first', capabilities: [demonstrated] },
        { id: 'second', capabilities: [demonstrated] },
      ]),
    ).toBeNull()
  })

  it('counts a phase with no capabilities as not finished', () => {
    // You have arrived and not yet written down what you are there to learn,
    // which is when the marker is most useful rather than least.
    expect(
      currentPhaseId([
        { id: 'first', capabilities: [demonstrated] },
        { id: 'empty', capabilities: [] },
      ]),
    ).toBe('empty')
  })

  it('is none when there are no phases at all', () => {
    expect(currentPhaseId([])).toBeNull()
  })
})

describe('what the delete confirmation says', () => {
  it('makes no claim about topics when none are linked', () => {
    const copy = deletePhaseCopy(2, 0)

    expect(copy.removes).toBe('This removes the phase and its 2 capabilities')
    expect(copy.kept).toBe('')
  })

  it('agrees throughout at one capability and one topic', () => {
    const copy = deletePhaseCopy(1, 1)

    expect(copy.removes).toBe('This removes the phase and its 1 capability')
    expect(copy.kept).toBe(
      'The 1 topic linked to it stays in your library — it loses the line saying which capability it serves',
    )
    for (const wrong of ['capabilities', '1 topics', 'stay in', 'they lose', 'they serve']) {
      expect(`${copy.removes} ${copy.kept}`).not.toContain(wrong)
    }
  })

  it('agrees throughout at many', () => {
    const copy = deletePhaseCopy(4, 11)

    expect(copy.removes).toBe('This removes the phase and its 4 capabilities')
    expect(copy.kept).toBe(
      'The 11 topics linked to them stay in your library — they lose the line saying which capability they serve',
    )
    for (const wrong of ['1 capability ', 'stays in', 'it loses']) {
      expect(`${copy.removes} ${copy.kept}`).not.toContain(wrong)
    }
  })

  it('says so when the phase has no capabilities yet', () => {
    expect(deletePhaseCopy(0, 0).removes).toBe('This removes the phase. It has no capabilities yet')
  })
})
