import { describe, expect, it } from 'vitest'
import {
  ALLOWED_IMAGE_TYPES,
  formatBytes,
  imagePath,
  MAX_IMAGE_BYTES,
  rejectImage,
  rejectionMessage,
  safeFileName,
} from '@/lib/domain/mental-model-image'

describe('rejectImage', () => {
  it.each(ALLOWED_IMAGE_TYPES)('accepts %s', (type) => {
    expect(rejectImage({ size: 1000, type })).toBeNull()
  })

  it('accepts a file exactly at the limit', () => {
    expect(rejectImage({ size: MAX_IMAGE_BYTES, type: 'image/png' })).toBeNull()
  })

  it('rejects one byte over', () => {
    expect(rejectImage({ size: MAX_IMAGE_BYTES + 1, type: 'image/png' })).toEqual({
      reason: 'too-large',
      bytes: MAX_IMAGE_BYTES + 1,
    })
  })

  it.each(['application/pdf', 'image/gif', 'image/svg+xml', ''])('rejects %s', (type) => {
    expect(rejectImage({ size: 10, type })?.reason).toBe('wrong-type')
  })

  it('reports the type before the size, so the message names the real problem', () => {
    // A 9 MB PDF is wrong for two reasons; the type is the one worth saying.
    expect(rejectImage({ size: 9_000_000, type: 'application/pdf' })?.reason).toBe('wrong-type')
  })
})

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [412 * 1024, '412 KB'],
    [Math.round(8.4 * 1024 * 1024), '8.4 MB'],
    [5 * 1024 * 1024, '5 MB'],
    [24 * 1024 * 1024, '24 MB'],
  ])('%i reads as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected)
  })
})

describe('rejectionMessage', () => {
  it('names the file, the real size and the real limit', () => {
    const message = rejectionMessage('tree-diff.png', { reason: 'too-large', bytes: 8_800_000 })
    expect(message).toContain('tree-diff.png')
    expect(message).toContain('8.4 MB')
    expect(message).toContain('5 MB')
    expect(message).toContain('open the topic later')
  })

  it('names the accepted types when the type is wrong', () => {
    const message = rejectionMessage('notes.pdf', { reason: 'wrong-type', type: 'application/pdf' })
    expect(message).toContain('notes.pdf')
    expect(message).toContain('png, jpeg or webp')
  })

  it('reads grammatically for any type, including a missing one', () => {
    expect(rejectionMessage('x', { reason: 'wrong-type', type: '' })).toContain('of an unknown type')
    expect(rejectionMessage('x.gif', { reason: 'wrong-type', type: 'image/gif' })).toContain(
      'x.gif is image/gif.',
    )
  })

  it('never says something vague', () => {
    const message = rejectionMessage('x.gif', { reason: 'wrong-type', type: 'image/gif' })
    expect(message).not.toMatch(/something went wrong|try again later|failed/i)
  })
})

describe('safeFileName', () => {
  it('leaves an ordinary name alone', () => {
    expect(safeFileName('tree-diff.png')).toBe('tree-diff.png')
  })

  it('strips path separators, which would change the key shape', () => {
    // The RLS policy reads (storage.foldername(name))[1]; extra segments are not
    // this function's to invent.
    expect(safeFileName('../../etc/passwd')).not.toContain('/')
    expect(safeFileName('a/b/c.png')).toBe('a-b-c.png')
  })

  it('collapses spaces and unusual characters', () => {
    expect(safeFileName('my  diagram (final).png')).toBe('my-diagram-final-.png')
  })

  it('never returns an empty name', () => {
    expect(safeFileName('///')).toBe('diagram')
    expect(safeFileName('')).toBe('diagram')
  })

  it('caps the length', () => {
    expect(safeFileName(`${'a'.repeat(300)}.png`).length).toBeLessThanOrEqual(96)
  })
})

describe('imagePath', () => {
  it('puts the user id first, because the policy keys on it', () => {
    expect(imagePath('user-1', 'topic-1', 'tree diff.png')).toBe('user-1/topic-1/tree-diff.png')
  })

  it('sanitises the file name as part of building the path', () => {
    expect(imagePath('u', 't', '../escape.png').split('/')).toHaveLength(3)
  })
})
