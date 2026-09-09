import 'server-only'
import { fail } from '@/lib/data/fail'

import { cache } from 'react'

import type { ProjectItem } from '@/lib/domain/ledger'
import { createClient } from '@/lib/supabase/server'

/**
 * The only module that reads or writes the ledger.
 *
 * RLS scopes every read. No hand-written `user_id` filter, for the reason the
 * rest of the data layer gives: writing one would imply the policy might not be
 * doing its job.
 */

const COLUMNS =
  'id, user_id, kind, title, link, note, status, capability_id, created_at, updated_at'

/**
 * The whole ledger, newest first.
 *
 * One read. The list is small by construction — it is a capstone's decisions, not
 * an event stream — so the kind and status chips filter in the component rather
 * than round-tripping. The only filter that reaches the server is `capability_id`,
 * because it arrives as a link from the capability page.
 */
export const listLedger = cache(async (capabilityId?: string): Promise<ProjectItem[]> => {
  const supabase = await createClient()

  const query = supabase.from('project_items').select(COLUMNS).order('created_at', { ascending: false })
  const { data, error } = capabilityId ? await query.eq('capability_id', capabilityId) : await query

  if (error) fail('Loading your ledger', error)
  return data as unknown as ProjectItem[]
})

/**
 * Ledger items grouped by capability, for the line on a phase's capabilities.
 *
 * One query for the whole phase page rather than one per capability — the shape
 * arcs 2 and 3 both use. Returns a Map so the caller can look up without scanning.
 */
export const ledgerByCapability = cache(
  async (): Promise<Map<string, ProjectItem[]>> => {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('project_items')
      .select(COLUMNS)
      .not('capability_id', 'is', null)
      .order('created_at', { ascending: false })

    if (error) fail('Loading what your capabilities produced', error)

    const byCapability = new Map<string, ProjectItem[]>()
    for (const item of data as unknown as ProjectItem[]) {
      const list = byCapability.get(item.capability_id!) ?? []
      list.push(item)
      byCapability.set(item.capability_id!, list)
    }
    return byCapability
  },
)

/**
 * How many items, for the rail. A count, not the rows — this runs on every page.
 *
 * ── No `head: true`, deliberately ───────────────────────────────────────────
 * It was a HEAD request, which is the cheaper thing and the wrong one. A HEAD
 * response has no body, and a PostgREST error's description lives in the body —
 * so every failure of this read arrived as `{ message: '' }` and was reported as
 * `Counting your ledger failed: unknown ·` with nothing after it.
 *
 * That happened, on a real 401, and the cause can no longer be identified
 * because the sentence naming it was never transferred. The saving was a body
 * that is empty on success anyway; the cost was the only channel an error had.
 * On a read that runs on every page in the group, that trade is never worth it.
 */
export const countLedger = cache(async (): Promise<number> => {
  const supabase = await createClient()

  const { count, error, status } = await supabase
    .from('project_items')
    .select('id', { count: 'exact' })

  if (error) fail('Counting your ledger', error, status)
  return count ?? 0
})

export interface NewItem {
  kind: string
  title: string
  link: string | null
  note: string | null
  status: string
  capability_id: string | null
}

export async function insertItem(input: NewItem): Promise<ProjectItem> {
  const supabase = await createClient()

  // No user_id: the column default provides it and the insert policy's with-check
  // refuses anything else. No created_at either — the item is stamped, never
  // back-dated.
  const { data, error } = await supabase.from('project_items').insert(input).select().single()

  if (error) fail('Saving the item', error)
  return data as unknown as ProjectItem
}

export async function updateItem(id: string, input: NewItem): Promise<ProjectItem> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('project_items')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) fail('Saving your changes', error)
  return data as unknown as ProjectItem
}

/**
 * Status only, for the one-tap change from the row.
 *
 * A retired item stays in the list, in place, at its original date. A ledger that
 * hides what you changed your mind about is not a record.
 */
export async function setItemStatus(id: string, status: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('project_items')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) fail('Changing the status', error)
}

/** Deletes the entry. Nothing at the link is touched — see deleteItemCopy. */
export async function deleteItem(id: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('project_items').delete().eq('id', id)

  if (error) fail('Deleting the entry', error)
}
