import { describe, expect, it } from 'vitest'
import {
  IDLE,
  spokenText,
  speechSupported,
  voiceProblem,
  voiceReducer,
  type VoiceEvent,
  type VoiceState,
} from '@/lib/domain/voice'

/*
  Every sequence here is hand-written, and that is a limitation rather than a
  design. Nobody has read what Chrome's engine actually emits, so these prove
  the reducer and nothing about the recogniser — see ARCHITECTURE.md, and
  TASKS.md for what a person has to check instead.
*/
const run = (events: VoiceEvent[], from: VoiceState = IDLE) =>
  events.reduce(voiceReducer, from)

describe('voiceReducer', () => {
  it('keeps everything said, not just the last phrase', () => {
    /*
      The bug this shape exists to prevent. A recogniser re-guesses its current
      phrase on every event, so a single string assigned the newest result loses
      every phrase before it — a four-sentence answer collapsing to its last
      clause the moment the fifth begins.
    */
    const state = run([
      { type: 'start' },
      { type: 'result', segments: [{ text: 'A closure keeps a live reference', final: true }] },
      { type: 'result', segments: [{ text: 'to the scope it was defined in', final: true }] },
      { type: 'result', segments: [{ text: 'not a copy', final: false }] },
    ])

    expect(spokenText(state)).toBe(
      'A closure keeps a live reference to the scope it was defined in not a copy',
    )
  })

  it('replaces the guess rather than appending it', () => {
    const state = run([
      { type: 'start' },
      { type: 'result', segments: [{ text: 'it keeps a', final: false }] },
      { type: 'result', segments: [{ text: 'it keeps a live', final: false }] },
      { type: 'result', segments: [{ text: 'it keeps a live reference', final: false }] },
    ])

    expect(spokenText(state)).toBe('it keeps a live reference')
  })

  it('handles one event carrying a commit and a new guess together', () => {
    // The engine does both in a single callback, and order matters within it.
    const state = run([
      { type: 'start' },
      { type: 'result', segments: [{ text: 'first sentence.', final: true }] },
      {
        type: 'result',
        segments: [
          { text: 'second sentence.', final: true },
          { text: 'and the third', final: false },
        ],
      },
    ])

    expect(state.settled).toBe('first sentence. second sentence.')
    expect(state.pending).toBe('and the third')
  })

  it('keeps an unfinished guess when the engine stops', () => {
    /*
      The engine throws this away. The person said it, and losing the last clause
      of an answer for stopping half a second early is the worst thing dictation
      can do.
    */
    const state = run([
      { type: 'start' },
      { type: 'result', segments: [{ text: 'a live reference', final: true }] },
      { type: 'result', segments: [{ text: 'not a copy', final: false }] },
      { type: 'end' },
    ])

    expect(spokenText(state)).toBe('a live reference not a copy')
    expect(state.pending).toBe('')
    expect(state.status).toBe('idle')
  })

  it('says nothing when you simply paused', () => {
    // `no-speech` fires when you think for a few seconds. A red line for
    // thinking is how people learn to ignore the error line.
    const state = run([{ type: 'start' }, { type: 'error', code: 'no-speech' }])

    expect(state.problem).toBeNull()
    expect(state.status).toBe('idle')
  })

  it('says nothing when it was you who stopped it', () => {
    const state = run([{ type: 'start' }, { type: 'error', code: 'aborted' }])

    expect(state.problem).toBeNull()
    expect(state.status).toBe('idle')
  })

  it('names a blocked microphone and the way that still works', () => {
    const state = run([{ type: 'start' }, { type: 'error', code: 'not-allowed' }])

    expect(state.status).toBe('error')
    expect(state.problem).toContain('blocked')
    expect(state.problem).toContain('keep typing')
  })

  it('keeps what was said when it fails mid-answer', () => {
    // The failure is about the microphone. It is not a reason to discard the
    // three sentences already in the box.
    const state = run([
      { type: 'start' },
      { type: 'result', segments: [{ text: 'a live reference', final: true }] },
      { type: 'error', code: 'network' },
      { type: 'end' },
    ])

    expect(spokenText(state)).toBe('a live reference')
    expect(state.status).toBe('error')
  })

  it('clears the last problem when you start again', () => {
    const state = run([
      { type: 'start' },
      { type: 'error', code: 'network' },
      { type: 'end' },
      { type: 'start' },
    ])

    expect(state.problem).toBeNull()
    expect(state.status).toBe('listening')
  })
})

describe('voiceProblem', () => {
  it('has a sentence for a code it has never seen', () => {
    // Better an unfamiliar code on screen than silence, and it still ends by
    // naming the way that works.
    const message = voiceProblem('some-new-chrome-code')

    expect(message).toContain('some-new-chrome-code')
    expect(message).toContain('Keep typing')
  })
})

describe('speechSupported', () => {
  it('is true for the prefixed constructor', () => {
    expect(speechSupported({ webkitSpeechRecognition: class {} })).toBe(true)
  })

  it('is true for the unprefixed one', () => {
    expect(speechSupported({ SpeechRecognition: class {} })).toBe(true)
  })

  it('is false for a browser that has neither', () => {
    expect(speechSupported({})).toBe(false)
  })

  it('does not consult anything that looks like a user agent', () => {
    /*
      A browser that lies about its name still cannot lie about whether the
      constructor exists. This asserts the negative directly: a scope claiming
      to be Chrome, with no speech API in it, is unsupported.
    */
    expect(speechSupported({ userAgent: 'Mozilla/5.0 Chrome/141.0.0.0' })).toBe(false)
  })
})
