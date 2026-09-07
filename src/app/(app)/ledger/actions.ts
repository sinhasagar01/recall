'use server'

import { revalidatePath } from 'next/cache'
import { deleteItem, insertItem, setItemStatus, updateItem } from '@/lib/data/ledger'
import { parseLedgerForm } from '@/lib/domain/ledger-form'

export type LedgerResult = { error: string | null; id?: string }

function read(formData: FormData) {
  return {
    kind: String(formData.get('kind') ?? ''),
    title: String(formData.get('title') ?? ''),
    link: String(formData.get('link') ?? ''),
    note: String(formData.get('note') ?? ''),
    status: String(formData.get('status') ?? 'open'),
    capabilityId: String(formData.get('capability_id') ?? ''),
  }
}

export async function createItem(formData: FormData): Promise<LedgerResult> {
  const parsed = parseLedgerForm(read(formData))
  if (parsed.error !== undefined) return { error: parsed.error }

  try {
    const item = await insertItem(parsed.value)
    revalidatePath('/ledger')
    revalidatePath('/phases')
    return { error: null, id: item.id }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The item could not be saved.' }
  }
}

export async function saveItem(id: string, formData: FormData): Promise<LedgerResult> {
  const parsed = parseLedgerForm(read(formData))
  if (parsed.error !== undefined) return { error: parsed.error }

  try {
    await updateItem(id, parsed.value)
    revalidatePath('/ledger')
    revalidatePath('/phases')
    return { error: null, id }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The changes could not be saved.' }
  }
}

export async function changeStatus(id: string, status: string): Promise<LedgerResult> {
  try {
    await setItemStatus(id, status)
    revalidatePath('/ledger')
    return { error: null, id }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The status could not be changed.' }
  }
}

export async function removeItem(id: string): Promise<LedgerResult> {
  try {
    await deleteItem(id)
    revalidatePath('/ledger')
    revalidatePath('/phases')
    return { error: null }
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : 'The entry could not be deleted.' }
  }
}
