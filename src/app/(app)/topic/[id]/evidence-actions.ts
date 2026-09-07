'use server'

import { revalidatePath } from 'next/cache'
import { getTopic, writeEvidence } from '@/lib/data/topics'
import { parseEvidenceForm, EVIDENCE_KINDS, type EvidenceKind } from '@/lib/domain/evidence'

export type EvidenceResult = { error: string | null }

/** The kind, from the wire. Anything else is not a marker. */
function kindFrom(raw: unknown): EvidenceKind | null {
  return EVIDENCE_KINDS.includes(raw as EvidenceKind) ? (raw as EvidenceKind) : null
}

/**
 * Records or edits one marker.
 *
 * Refuses a quiz. A quiz is a retrieval device, not a concept — there is nothing
 * to rebuild or apply — and `topics_evidence_is_consistent` refuses it too. This
 * check exists because an action is reachable by anything that can sign in, so
 * the UI hiding the section is not a guarantee.
 */
export async function recordEvidence(
  id: string,
  rawKind: string,
  formData: FormData,
): Promise<EvidenceResult> {
  const kind = kindFrom(rawKind)
  if (kind === null) return { error: 'That is not a kind of evidence.' }

  try {
    const topic = await getTopic(id)
    if (topic === null) return { error: 'That topic is no longer in your library.' }
    if (topic.kind !== 'topic') return { error: 'A quiz does not carry evidence.' }

    const parsed = parseEvidenceForm({
      note: String(formData.get('note') ?? ''),
      at: String(formData.get('at') ?? ''),
      url: String(formData.get('url') ?? ''),
    })
    if (parsed.error !== undefined) return { error: parsed.error }

    await writeEvidence(id, kind, parsed.value)

    revalidatePath(`/topic/${id}`)
    // The card's squares come from the same columns.
    revalidatePath('/library')

    return { error: null }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'That could not be saved.' }
  }
}

/** Removes a marker. All three of its columns clear together. */
export async function removeEvidence(id: string, rawKind: string): Promise<EvidenceResult> {
  const kind = kindFrom(rawKind)
  if (kind === null) return { error: 'That is not a kind of evidence.' }

  try {
    const topic = await getTopic(id)
    if (topic === null) return { error: 'That topic is no longer in your library.' }

    await writeEvidence(id, kind, null)

    revalidatePath(`/topic/${id}`)
    revalidatePath('/library')

    return { error: null }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'That could not be removed.' }
  }
}
