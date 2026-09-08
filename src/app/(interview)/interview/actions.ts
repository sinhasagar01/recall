'use server'

import { revalidatePath } from 'next/cache'
import { nextTurn, scoreRound } from '@/lib/ai/interview'
import { markTopicsWeak, readLedgerPool, readTopicPool, saveRound } from '@/lib/data/interview'
import {
  countRound,
  EXCHANGE_CAP,
  TRANSCRIPT_BYTE_CAP,
  type Length,
  type Level,
  type RoundType,
  type Scorecard,
  type Turn,
} from '@/lib/domain/interview'

/**
 * Three actions, and the asymmetry between them is the whole rule.
 *
 * `speak` and `finish` READ and return data. Neither writes anything about the
 * round, and neither can write confidence — `lib/ai/interview.ts` has no database
 * client at all.
 *
 * `markWeak` is the only thing in this arc that touches confidence, and it runs
 * when you press. The scorecard renders from `finish`'s return value; nothing on
 * that path writes.
 */

/** Pool material as text, so the model asks only about what you have saved. */
async function materialFor(roundType: RoundType): Promise<{ text: string; ids: string[] }> {
  if (roundType === 'behavioural') {
    const items = await readLedgerPool()
    return {
      text: items
        .map((item) => `- ${item.kind.toUpperCase()}: ${item.title}${item.note ? ` — ${item.note}` : ''}`)
        .join('\n'),
      ids: [],
    }
  }

  const category = { javascript: 'JavaScript', react: 'React', typescript: 'TypeScript' }[
    roundType as 'javascript' | 'react' | 'typescript'
  ]

  const pool = await readTopicPool()
  const chosen = pool.filter((topic) => category === undefined || topic.category === category)

  /*
    Weighted toward weak: the ones you grade weak or have never practised come
    first. Ordering only — nothing here writes a confidence, and the round never
    reads one back into the library.
  */
  const weighted = [...chosen].sort((a, b) => {
    const weight = (confidence: string) => (confidence === 'weak' ? 0 : confidence === 'new' ? 1 : 2)
    return weight(a.confidence) - weight(b.confidence)
  })

  return {
    text: weighted
      .slice(0, 40)
      .map((topic) => `- [${topic.id}] ${topic.title}${topic.definition ? `: ${topic.definition}` : ''}`)
      .join('\n'),
    ids: weighted.slice(0, 40).map((topic) => topic.id),
  }
}

export type SpeakResult = { ok: true; text: string } | { ok: false; reason: string }

export async function speak(input: {
  roundType: RoundType
  level: Level
  turns: Turn[]
  intent: 'ask' | 'follow' | 'hint' | 'clarify'
}): Promise<SpeakResult> {
  /*
    The cap is enforced HERE, by the runner, rather than by the model running out
    of context. Two of them: exchanges, and bytes — the second because session
    two's DSA round pastes source into the transcript and the first stops being
    the binding one. See lib/domain/interview.ts for the measured numbers.
  */
  if (input.turns.length >= EXCHANGE_CAP) {
    return { ok: false, reason: `This round has reached its cap of ${EXCHANGE_CAP} exchanges.` }
  }
  if (new Blob([JSON.stringify(input.turns)]).size > TRANSCRIPT_BYTE_CAP) {
    return { ok: false, reason: 'This round has grown too long to continue.' }
  }

  const { text } = await materialFor(input.roundType)
  const outcome = await nextTurn({ ...input, material: text })

  return outcome.ok ? { ok: true, text: outcome.text } : { ok: false, reason: outcome.reason }
}

export type FinishResult =
  | { ok: true; scorecard: Scorecard; roundId: string }
  | { ok: false; reason: string }

/**
 * The scorecard, and the round's one insert.
 *
 * The counts come from `countRound` over the transcript — code, never the model.
 * The model is asked for judgement and nothing else, and the two are rendered
 * beside each other rather than mixed, so a disagreement is visible.
 */
export async function finish(input: {
  roundType: RoundType
  minutes: Length
  level: Level
  turns: Turn[]
  elapsedSeconds: number
}): Promise<FinishResult> {
  const titles = new Map<string, string>()
  if (input.roundType !== 'behavioural') {
    for (const topic of await readTopicPool()) titles.set(topic.id, topic.title)
  }

  const result = await scoreRound(input.turns, titles)
  if (!result.ok) return { ok: false, reason: result.reason }

  const counts = countRound(input.turns)

  /*
    Which topics the round actually drew on.

    From BOTH the transcript and the scorecard's per-question results. The turns
    alone were not enough: session one's runner does not yet tag each turn with
    its topic — session two needs that for save-as-quiz and will add it — so
    `topic_ids` was silently always empty, and a perturbation that applied the
    offer automatically passed clean because it had nothing to apply it to.

    Found by a perturbation that DID NOT BITE, which is the only reason it was
    found at all.
  */
  const topicIds = [
    ...new Set(
      [
        ...input.turns.map((turn) => turn.topicId),
        ...result.scorecard.questions.map((question) => question.topicId),
      ].filter((id): id is string => id !== null),
    ),
  ]

  /*
    The clock is advisory — the question count ended the round. Its teeth are
    here: over-run is recorded and shown against past rounds rather than cutting
    an answer off mid-sentence in a round that is never resumed.
  */
  const budget = input.minutes * 60
  const overBySeconds = Math.max(0, input.elapsedSeconds - budget)

  const roundId = await saveRound({
    roundType: input.roundType,
    minutes: input.minutes,
    level: input.level,
    counts,
    elapsedSeconds: input.elapsedSeconds,
    overBySeconds,
    scorecard: result.scorecard,
    topicIds,
  })

  return { ok: true, scorecard: result.scorecard, roundId }
}

/**
 * The offer step. **The only write in this arc that touches confidence.**
 *
 * Nothing above this line can reach it: the scorecard renders from `finish`'s
 * return value, and `markTopicsWeak` is called from here and nowhere else.
 */
export async function markWeak(topicIds: string[]): Promise<{ error: string | null; marked?: number }> {
  try {
    const marked = await markTopicsWeak(topicIds)
    revalidatePath('/library')
    revalidatePath('/weak')
    return { error: null, marked }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'Nothing was changed.' }
  }
}
