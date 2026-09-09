/**
 * Dictation, as a pure state machine.
 *
 * The browser's `SpeechRecognition` is an event source and nothing here touches
 * it. Everything that decides what the answer box should say lives in this file,
 * takes plain data and returns plain data, and is tested directly — because the
 * recogniser itself cannot be tested at all. See ARCHITECTURE.md: a fake proves
 * what its author derived it from, and nobody here has read what Chrome's engine
 * emits for a hesitant forty-second answer with a false start in it.
 *
 * So the split is deliberate. This half is proven. The adapter that wires real
 * events into it is thin enough to read in one screen, and is on the by-hand
 * list in TASKS.md rather than pretended to be covered.
 */

export const ANSWER_MODES = ['typing', 'voice'] as const
export type AnswerMode = (typeof ANSWER_MODES)[number]

export type VoiceStatus = 'idle' | 'listening' | 'error'

export interface VoiceState {
  status: VoiceStatus
  /**
   * What the engine has committed. **Never rewritten**, only appended to.
   *
   * This is the whole reason the state has two fields. A recogniser re-guesses
   * its current phrase on every event, so holding one string and assigning the
   * latest result to it deletes everything said before the current phrase —
   * the classic dictation bug, where a long answer collapses to its last clause.
   */
  settled: string
  /** The engine's current guess. Replaced wholesale, every time. */
  pending: string
  /** A sentence for the person, or null when there is nothing to say. */
  problem: string | null
}

export const IDLE: VoiceState = { status: 'idle', settled: '', pending: '', problem: null }

/** One chunk as the engine reports it. `final` means it will not be revised. */
export interface Segment {
  text: string
  final: boolean
}

export type VoiceEvent =
  | { type: 'start' }
  | { type: 'result'; segments: Segment[] }
  | { type: 'error'; code: string }
  /** The engine stopped on its own — a pause, a timeout, or after `stop()`. */
  | { type: 'end' }

/**
 * What to say about each error code, and which ones are not worth saying.
 *
 * `no-speech` and `aborted` are absences rather than faults: the first fires
 * when you think for a few seconds, the second when you stopped it yourself.
 * Rendering either as an error would put a red sentence on screen for doing
 * nothing wrong, which is how people learn to ignore the error line.
 */
const QUIET = new Set(['no-speech', 'aborted'])

const PROBLEM: Record<string, string> = {
  'not-allowed': 'The microphone is blocked. Allow it in the address bar, or keep typing.',
  'service-not-allowed':
    'The microphone is blocked. Allow it in the address bar, or keep typing.',
  'audio-capture': 'No microphone was found. Plug one in, or keep typing.',
  network: 'Speech recognition needs the network and could not reach it. Keep typing.',
}

/** Every message ends by naming the way that still works. */
export function voiceProblem(code: string): string | null {
  if (QUIET.has(code)) return null
  return PROBLEM[code] ?? `Speech recognition stopped: ${code}. Keep typing.`
}

export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case 'start':
      return { ...state, status: 'listening', problem: null }

    case 'result': {
      /*
        Finals append; interims replace. In that order, in one pass, because a
        single event can carry both — the engine commits the phrase you just
        finished and guesses the one you have started in the same callback.
      */
      let settled = state.settled
      let pending = ''
      for (const segment of event.segments) {
        if (segment.final) settled = join(settled, segment.text)
        else pending = join(pending, segment.text)
      }
      return { ...state, settled, pending }
    }

    case 'error': {
      const problem = voiceProblem(event.code)
      /*
        A quiet code is not an error state. Keeping `listening` would be a lie —
        the engine has stopped either way — so it lands in `idle` with nothing
        on screen, which is what "you paused and it timed out" should look like.
      */
      return { ...state, status: problem === null ? 'idle' : 'error', problem }
    }

    case 'end':
      /*
        An un-finalised guess is kept rather than dropped. The engine discards
        it, but the person said it, and losing the last clause of an answer
        because you stopped talking half a second early is the worst thing this
        feature could do.
      */
      return {
        ...state,
        status: state.status === 'error' ? 'error' : 'idle',
        settled: join(state.settled, state.pending),
        pending: '',
      }
  }
}

/** What the answer box should show: what is committed plus the current guess. */
export function spokenText(state: VoiceState): string {
  return join(state.settled, state.pending)
}

/**
 * Whether this browser can do it at all.
 *
 * Takes the scope rather than reading `window`, so it is pure and so the test
 * can hand it an object with nothing in it — which is a real condition, not a
 * simulated service.
 *
 * A constructor check and never a user-agent string: the question is whether
 * the API exists, and a browser that lies about its name still cannot lie about
 * that.
 */
export function speechSupported(scope: Record<string, unknown>): boolean {
  return 'SpeechRecognition' in scope || 'webkitSpeechRecognition' in scope
}

/** One space between chunks, and no leading space on the first one. */
function join(left: string, right: string): string {
  const a = left.trim()
  const b = right.trim()
  if (a === '') return b
  if (b === '') return a
  return `${a} ${b}`
}
