'use server'

import { revalidatePath } from 'next/cache'
import {
  deleteCapability,
  deletePhase,
  insertCapability,
  insertPhase,
  setTopicCapability,
  updatePhase,
} from '@/lib/data/phases'
import { parseCapabilityForm, parsePhaseForm } from '@/lib/domain/phase-form'

export type PhaseResult = { error: string | null; id?: string }

function read(formData: FormData) {
  return {
    name: String(formData.get('name') ?? ''),
    when_text: String(formData.get('when_text') ?? ''),
    sources_text: String(formData.get('sources_text') ?? ''),
  }
}

export async function createPhase(formData: FormData): Promise<PhaseResult> {
  const parsed = parsePhaseForm(read(formData))
  if (parsed.error !== undefined) return { error: parsed.error }

  try {
    const phase = await insertPhase(parsed.value)
    revalidatePath('/phases')
    return { error: null, id: phase.id }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The phase could not be saved.' }
  }
}

export async function savePhase(id: string, formData: FormData): Promise<PhaseResult> {
  const parsed = parsePhaseForm(read(formData))
  if (parsed.error !== undefined) return { error: parsed.error }

  try {
    await updatePhase(id, parsed.value)
    revalidatePath('/phases')
    revalidatePath(`/phases/${id}`)
    return { error: null, id }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The changes could not be saved.' }
  }
}

export async function addCapability(phaseId: string, formData: FormData): Promise<PhaseResult> {
  const parsed = parseCapabilityForm(String(formData.get('name') ?? ''))
  if (parsed.error !== undefined) return { error: parsed.error }

  try {
    const capability = await insertCapability(phaseId, parsed.value)
    revalidatePath('/phases')
    revalidatePath(`/phases/${phaseId}`)
    return { error: null, id: capability.id }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The capability could not be saved.' }
  }
}

export async function removeCapability(id: string, phaseId: string): Promise<PhaseResult> {
  try {
    await deleteCapability(id)
    revalidatePath('/phases')
    revalidatePath(`/phases/${phaseId}`)
    return { error: null }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The capability could not be deleted.' }
  }
}

export async function removePhase(id: string): Promise<PhaseResult> {
  try {
    await deletePhase(id)
    revalidatePath('/phases')
    revalidatePath('/library')
    return { error: null }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The phase could not be deleted.' }
  }
}

/** Used by the topic edit sheet, which is why it revalidates the library too. */
export async function linkTopicCapability(
  topicId: string,
  capabilityId: string | null,
): Promise<PhaseResult> {
  try {
    await setTopicCapability(topicId, capabilityId)
    revalidatePath('/phases')
    revalidatePath(`/topic/${topicId}`)
    return { error: null }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The capability could not be linked.' }
  }
}
