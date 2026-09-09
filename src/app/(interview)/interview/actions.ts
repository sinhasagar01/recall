'use server'

import { revalidatePath } from 'next/cache'
import { draftQuiz, nextTurn, reaskOne, scoreOne, scoreRound } from '@/lib/ai/interview'
import { markTopicsWeak, readLedgerPool, readTopicPool, saveRound } from '@/lib/data/interview'
import { insertTopic } from '@/lib/data/topics'
import {
  countRound,
  EXCHANGE_CAP,
  TRANSCRIPT_BYTE_CAP,
  type QuizDraft,
  type Length,
  type Level,
  type RoundType,
  type Scorecard,
  type Turn,
} from '@/lib/domain/interview'

/**
 * Five actions, and the asymmetry between them is still the whole rule.
 *
 * `speak` and `finish` READ and return data. Neither writes anything about the
 * round, and neither can write confidence — `lib/ai/interview.ts` has no database
 * client at all.
 *
 * `markWeak` is the only thing in this arc that touches confidence, and it runs
 * when you press. The scorecard renders from `finish`'s return value; nothing on
 * that path writes.
 *
 * ── Session two-a added two, and neither weakens that ───────────────────────
 * `saveQuizFromRound` writes a row — and it is the FIRST write in a round that is
 * not the round's own insert. It does not touch the no-write-until-pressed
 * guarantee, because that guarantee is about **confidence and the scorecard**,
 * and this writes neither: a saved quiz arrives at `confidence: 'new'` from the
 * column default, exactly as a hand-made one does. The two rules govern different
 * objects — *a round never changes what you know without a press*, and *a quiz
 * you asked for is a thing you made*.
 *
 * `rewind` writes **nothing at all**. The round row is inserted once, at the end,
 * and no code path in the tree updates it — asserted structurally rather than
 * remembered.
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

export type SpeakResult =
  | { ok: true; text: string; topicId: string | null }
  | { ok: false; reason: string }

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

  /*
    The attribution rides back with the reply so the room can tag the exchange —
    which topic, and whether you grade it weak. Issue #25: the field existed for
    a whole session and nothing filled it.
  */
  return outcome.ok
    ? { ok: true, text: outcome.reply.text, topicId: outcome.reply.topicId }
    : { ok: false, reason: outcome.reason }
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
    Both halves now contribute. The turns half was silently always empty until
    issue #25 — a perturbation that DID NOT BITE is the only reason anyone
    noticed, and the scorecard half was added beside it as the workaround.
  */

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

export type DraftResult = { ok: true; draft: QuizDraft } | { ok: false; reason: string }

/**
 * Draft a quiz from a follow-up. **Writes nothing.**
 *
 * Split from the save on purpose: the reference asked for one tap and arc 6's
 * rule says a thing you have not looked at is not a thing you chose. Drafting and
 * saving being two actions is what lets the room show you the distractors in
 * place, without navigating anywhere, before anything is written.
 */
export async function draftQuizFromFollowUp(input: {
  roundType: RoundType
  followUp: string
  answer: string
}): Promise<DraftResult> {
  const { text } = await materialFor(input.roundType)
  const result = await draftQuiz({ followUp: input.followUp, answer: input.answer, material: text })

  return result.ok ? { ok: true, draft: result.draft } : { ok: false, reason: result.reason }
}

/**
 * Save a drafted quiz. **The same write path as the library's add form.**
 *
 * `insertTopic`, not a second writer — so the shape CHECK, the practice queue,
 * search, export and the weak page all apply without one of them having to learn
 * that interviews exist. There is no interview-only kind and no interview-only
 * column.
 *
 * ── Two kinds of link, doing two different jobs ─────────────────────────────
 * `parent_topic_id` is the provenance: where this question came from, answerable
 * later. `category`, `source_id` and `tags` are inherited from the same topic so
 * the quiz lands under the same filters — a shelf position. The first plan had
 * only the second and called it a link; it is not one, and the column exists
 * because the question worth being able to ask is "where did this come from".
 */
export async function saveQuizFromRound(input: {
  draft: QuizDraft
}): Promise<{ error: string | null; savedId?: string }> {
  try {
    const parent =
      input.draft.topicId === null
        ? null
        : ((await readTopicPool()).find((topic) => topic.id === input.draft.topicId) ?? null)

    const saved = await insertTopic(
      {
        title: input.draft.question,
        /* A quiz's mental_model is its explanation — one field, one register. */
        mental_model: input.draft.explanation === '' ? null : input.draft.explanation,
        category: parent?.category ?? null,
        tags: [],
        kind: 'quiz',
        definition: null,
        options: input.draft.options,
        correct_option: input.draft.correctOption,
        source_id: null,
        capability_id: null,
      },
      { parent_topic_id: parent?.id ?? null },
    )

    revalidatePath('/library')
    revalidatePath('/practice')
    return { error: null, savedId: saved.id }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'Nothing was saved.' }
  }
}

export type ReaskResult = { ok: true; question: string } | { ok: false; reason: string }

/** Re-ask one question. Reads nothing, writes nothing. */
export async function reask(input: { title: string; note: string }): Promise<ReaskResult> {
  const outcome = await reaskOne(input)
  return outcome.ok ? { ok: true, question: outcome.text } : { ok: false, reason: outcome.reason }
}

export type RewindScored = { ok: true; score: number; note: string } | { ok: false; reason: string }

/**
 * Score one re-asked answer. **Writes nothing — that is the arc's hard rule.**
 *
 * The result goes back to the page and lives in its state. The round row is
 * never written again, so a rewind cannot move a stored score however many times
 * it is run. Asserted by rewinding and comparing the whole row byte for byte,
 * and seen failing by putting an update on this path.
 */
export async function scoreRewind(input: {
  question: string
  answer: string
}): Promise<RewindScored> {
  const result = await scoreOne(input)
  return result.ok
    ? { ok: true, score: result.score, note: result.note }
    : { ok: false, reason: result.reason }
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
