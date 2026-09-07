import { describe, expect, it } from 'vitest'
import { plural } from '@/lib/domain/plural'

describe('plural', () => {
  it('agrees at nothing, one and many', () => {
    expect(plural(0, 'topic')).toBe('0 topics')
    expect(plural(1, 'topic')).toBe('1 topic')
    expect(plural(2, 'topic')).toBe('2 topics')
  })

  it('takes an irregular plural rather than guessing', () => {
    expect(plural(0, 'entry', 'entries')).toBe('0 entries')
    expect(plural(1, 'entry', 'entries')).toBe('1 entry')
    expect(plural(2, 'entry', 'entries')).toBe('2 entries')
  })

  it('does not treat a negative count as singular', () => {
    // Not reachable from a count, but `=== 1` is the only singular case and this
    // pins that rather than leaving it to a `< 2` someone might write later.
    expect(plural(-1, 'topic')).toBe('-1 topics')
  })
})
