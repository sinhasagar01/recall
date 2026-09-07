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
  /*
    A phase delete touches three things. Each surviving half appears only when it
    has something to say, so the two counts are varied independently — 1 topic and
    0 entries is a different sentence from 0 topics and 1 entry, not the same one
    with a number moved.
  */
  it('makes no claim at all when nothing survives', () => {
    const copy = deletePhaseCopy(2, 0, 0)

    expect(copy.removes).toBe('This removes the phase and its 2 capabilities')
    expect(copy.kept).toBe('')
  })

  it('names only the topics when there are no ledger entries', () => {
    expect(deletePhaseCopy(1, 1, 0).kept).toBe(
      'The 1 topic linked to it stays in your library — it loses the line saying which capability it serves',
    )
    expect(deletePhaseCopy(1, 2, 0).kept).toBe(
      'The 2 topics linked to it stay in your library — they lose the line saying which capability they serve',
    )
    expect(deletePhaseCopy(1, 2, 0).kept).not.toContain('ledger')
  })

  it('names only the ledger entries when there are no topics', () => {
    expect(deletePhaseCopy(1, 0, 1).kept).toBe(
      'The 1 ledger entry linked to it stays in your ledger — it loses the line saying which capability it serves',
    )
    expect(deletePhaseCopy(1, 0, 2).kept).toBe(
      'The 2 ledger entries linked to it stay in your ledger — they lose the line saying which capability they serve',
    )
    expect(deletePhaseCopy(1, 0, 2).kept).not.toContain('topic')
    expect(deletePhaseCopy(1, 0, 2).kept).not.toContain('library')
  })

  it('names both, and agrees over the total rather than either count', () => {
    /*
      One topic and one entry is TWO things. Agreeing over either count alone
      would produce "The 1 topic and 1 ledger entry ... stays", which is the bug
      this arrangement exists to avoid.
    */
    expect(deletePhaseCopy(2, 1, 1).kept).toBe(
      'The 1 topic and 1 ledger entry linked to them stay in your library and ledger — they lose the line saying which capability they serve',
    )
    expect(deletePhaseCopy(2, 2, 1).kept).toBe(
      'The 2 topics and 1 ledger entry linked to them stay in your library and ledger — they lose the line saying which capability they serve',
    )
  })

  it('agrees on the capability count independently of what survives', () => {
    expect(deletePhaseCopy(1, 1, 0).kept).toContain('linked to it ')
    expect(deletePhaseCopy(2, 1, 0).kept).toContain('linked to them ')
  })

  it('never mismatches a number and its noun, at any of the nine combinations', () => {
    for (const topics of [0, 1, 2]) {
      for (const items of [0, 1, 2]) {
        const { kept } = deletePhaseCopy(1, topics, items)
        const where = `topics=${topics} items=${items}`

        for (const wrong of ['1 topics', '1 ledger entries', '2 topic ', '2 ledger entry']) {
          expect(kept, `${where}: ${wrong}`).not.toContain(wrong)
        }
        if (topics + items === 1) expect(kept, where).not.toContain(' stay in')
        if (topics + items > 1) expect(kept, where).not.toContain(' stays in')
        if (topics + items === 0) expect(kept, where).toBe('')
      }
    }
  })

  it('says so when the phase has no capabilities yet', () => {
    expect(deletePhaseCopy(0, 0, 0).removes).toBe('This removes the phase. It has no capabilities yet')
  })
})
