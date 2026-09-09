'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  IDLE,
  speechSupported,
  spokenText,
  voiceReducer,
  type Segment,
  type VoiceState,
} from '@/lib/domain/voice'

/**
 * The impure half: real `SpeechRecognition` events into the pure reducer.
 *
 * Deliberately thin, and deliberately the only thing in this feature with no
 * automated coverage. Everything that DECIDES anything is in `lib/domain/voice.ts`
 * and is tested there; this file starts an engine, forwards what it emits, and
 * stops it. If it grows a decision, that decision belongs in the domain file.
 *
 * ── The types are ours, not the DOM's ───────────────────────────────────────
 * `SpeechRecognition` is not in TypeScript's DOM library, and the shape below is
 * only what we read. It is a description of the API's surface written from its
 * documentation — which is exactly the position the stub rule warns about, so it
 * is worth saying plainly: **this interface is a guess and the reducer does not
 * depend on it being right.** Anything unexpected arrives as a segment or an
 * error code, and both paths are total.
 */
interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEvent {
  resultIndex: number
  results: { length: number; [index: number]: RecognitionResult }
}
interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

export function useSpeech({ onTranscript }: { onTranscript: (text: string) => void }) {
  /*
    `null` until mounted, never `false`, because the server cannot know and a
    default of `false` would render "your browser cannot do this" to everyone
    for one frame — a sentence that is wrong more often than it is right.
  */
  const [supported, setSupported] = useState<boolean | null>(null)
  const [state, setState] = useState<VoiceState>(IDLE)
  const engine = useRef<Recognition | null>(null)
  /* The callback changes every render; the engine is wired once. */
  const emit = useRef(onTranscript)
  emit.current = onTranscript

  useEffect(() => {
    setSupported(speechSupported(window as unknown as Record<string, unknown>))
  }, [])

  const push = useCallback((event: Parameters<typeof voiceReducer>[1]) => {
    setState((current) => {
      const next = voiceReducer(current, event)
      if (next.settled !== current.settled || next.pending !== current.pending) {
        emit.current(spokenText(next))
      }
      return next
    })
  }, [])

  const stop = useCallback(() => {
    engine.current?.stop()
  }, [])

  const start = useCallback(() => {
    if (engine.current !== null) return
    const scope = window as unknown as Record<string, unknown>
    const Ctor = (scope.SpeechRecognition ?? scope.webkitSpeechRecognition) as
      | (new () => Recognition)
      | undefined
    if (Ctor === undefined) return

    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    /*
      The document's language, not a hardcoded locale. Guessing en-US for
      everyone is how dictation becomes unusable for the people it mishears.
    */
    recognition.lang = document.documentElement.lang || 'en'

    recognition.onstart = () => push({ type: 'start' })
    recognition.onerror = (event) => push({ type: 'error', code: event.error })
    recognition.onend = () => {
      engine.current = null
      push({ type: 'end' })
    }
    recognition.onresult = (event) => {
      const segments: Segment[] = []
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        segments.push({ text: result[0].transcript, final: result.isFinal })
      }
      push({ type: 'result', segments })
    }

    engine.current = recognition
    recognition.start()
  }, [push])

  /*
    Stop on unmount, with `abort` rather than `stop`: leaving a round should not
    wait for a last result to arrive, and the microphone indicator going out is
    the thing the person is watching for.
  */
  useEffect(
    () => () => {
      engine.current?.abort()
      engine.current = null
    },
    [],
  )

  return { supported, state, start, stop, listening: state.status === 'listening' }
}
