import { describe, expect, it } from 'vitest'

describe('vitest domain project', () => {
  it('runs in the node environment', () => {
    expect(typeof process.versions.node).toBe('string')
    expect(globalThis.document).toBeUndefined()
  })
})
