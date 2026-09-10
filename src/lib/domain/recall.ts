/**
 * What you wrote from memory, and what it is called.
 *
 * The practice card asks you to write what you remember before revealing the
 * answer. This keeps the most recent one, so the topic's page can show you what
 * you could produce under time pressure with the answer hidden — which is a
 * different thing from the definition you wrote at leisure, and often more
 * useful precisely when it is wrong.
 *
 * ── The name ────────────────────────────────────────────────────────────────
 * Not "recall attempt", which is the schema talking. The card says *write what
 * you remember* and the answer screen says *WHAT YOU WROTE*; **"From memory"**
 * is that read back, and it is what a person would say about the thing.
 *
 * The copy lives here rather than at the call site so the next surface that
 * wants it cannot spell it differently — the same reason `ROUND_LABEL` and
 * `CONFIDENCE_LABEL` are constants.
 */
export const FROM_MEMORY = 'From memory'

/**
 * Said where the section would otherwise be empty.
 *
 * Names the thing that produces one rather than the absence: a topic you have
 * never practised has not failed to record anything.
 */
export const NOTHING_FROM_MEMORY =
  'Nothing yet — this fills in when you write something in the practice card.'

/**
 * Whether an attempt is worth storing.
 *
 * **The rule this feature turns on.** Revealing without typing and then grading
 * reaches the same write that a real attempt does, so without this the stored
 * text is overwritten with an empty string every time someone skips the writing
 * step — and *an empty attempt is the absence of an explanation, not a new one*.
 *
 * Trimmed, because a textarea someone tabbed through holds a newline and that is
 * not an explanation either.
 */
export function isRecalled(text: string | null | undefined): boolean {
  return typeof text === 'string' && text.trim() !== ''
}

/** One attempt, ready to write. Both fields or neither — never one. */
export interface RecallWrite {
  last_recall: string
  last_recall_at: string
}

/**
 * The two columns for an attempt, or nothing at all.
 *
 * They travel together and are produced together, because the pairing is the
 * thing that can be false: a date from one practice beside text from another is
 * a page that lies while every column in it is correct. See ARCHITECTURE.md.
 */
export function recallWrite(text: string | null | undefined, now: Date): RecallWrite | null {
  if (!isRecalled(text)) return null
  return { last_recall: (text as string).trim(), last_recall_at: now.toISOString() }
}
