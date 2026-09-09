import 'server-only'
import { fail } from '@/lib/data/fail'

import { cache } from 'react'

import { toTopic, type TopicRow } from '@/lib/data/topic-mapping'
import type { Capability, Phase } from '@/lib/domain/phases'
import type { Topic } from '@/lib/domain/types'
import { createClient } from '@/lib/supabase/server'

/**
 * The only module that reads or writes phases and capabilities.
 *
 * RLS scopes every read here. There is no `user_id` filter written by hand, for
 * the reason the rest of the data layer gives: writing one would imply the policy
 * might not be doing its job.
 */

const PHASE_COLUMNS_SQL = 'id, user_id, name, when_text, sources_text, created_at, updated_at'
const CAPABILITY_COLUMNS_SQL = 'id, user_id, phase_id, name, created_at, updated_at'

/*
  What a linked entry needs to answer "is this demonstrated": enough to render a
  row, plus confidence and the three evidence markers the rule reads. Not `*` —
  the point of an explicit list is that adding a column to `topics` does not
  silently widen every read in the application.
*/
const ENTRY_COLUMNS =
  'id, user_id, title, definition, mental_model, mental_model_image_path, category, tags, difficulty, confidence, practice_count, last_practiced_at, created_at, updated_at, kind, options, correct_option, rebuild_at, rebuild_note, rebuild_url, challenge_at, challenge_note, challenge_url, production_at, production_note, production_url'

export interface CapabilityWithEntries {
  capability: Capability
  entries: Topic[]
}

export interface PhaseWithCapabilities {
  phase: Phase
  capabilities: CapabilityWithEntries[]
}

/**
 * Every phase, its capabilities, and what is linked to each.
 *
 * Three reads rather than nested embeds, then grouped here. Demonstrated is
 * derived per capability from rows already in hand, so the list page issues a
 * fixed number of queries no matter how many capabilities exist — the shape
 * `listSources` established. All three are bounded by RLS to one person.
 *
 * Ordered by `created_at` ASCENDING, which is load-bearing: "current" is the
 * earliest phase not fully demonstrated, and earliest means the order the list
 * shows. Sources orders newest-first; phases do not, because you work through
 * them forwards.
 */
export const listPhases = cache(async (): Promise<PhaseWithCapabilities[]> => {
  const supabase = await createClient()

  const [phases, capabilities, entries] = await Promise.all([
    supabase.from('phases').select(PHASE_COLUMNS_SQL).order('created_at', { ascending: true }),
    supabase
      .from('capabilities')
      .select(CAPABILITY_COLUMNS_SQL)
      .order('created_at', { ascending: true }),
    supabase.from('topics').select(`${ENTRY_COLUMNS}, capability_id`).not('capability_id', 'is', null),
  ])

  if (phases.error) fail('Loading your phases', phases.error)
  if (capabilities.error) fail('Loading your capabilities', capabilities.error)
  if (entries.error) fail('Loading what serves them', entries.error)

  const byCapability = new Map<string, Topic[]>()
  for (const row of entries.data as (TopicRow & { capability_id: string })[]) {
    const list = byCapability.get(row.capability_id) ?? []
    list.push(toTopic(row))
    byCapability.set(row.capability_id, list)
  }

  const byPhase = new Map<string, CapabilityWithEntries[]>()
  for (const capability of capabilities.data as unknown as Capability[]) {
    const list = byPhase.get(capability.phase_id) ?? []
    list.push({ capability, entries: byCapability.get(capability.id) ?? [] })
    byPhase.set(capability.phase_id, list)
  }

  return (phases.data as unknown as Phase[]).map((phase) => ({
    phase,
    capabilities: byPhase.get(phase.id) ?? [],
  }))
})

/** One phase with its capabilities and their linked entries. */
export const readPhase = cache(
  async (id: string): Promise<PhaseWithCapabilities | null> => {
    const supabase = await createClient()

    const [phase, capabilities] = await Promise.all([
      supabase.from('phases').select(PHASE_COLUMNS_SQL).eq('id', id).maybeSingle(),
      supabase
        .from('capabilities')
        .select(CAPABILITY_COLUMNS_SQL)
        .eq('phase_id', id)
        .order('created_at', { ascending: true }),
    ])

    if (phase.error) fail('Loading the phase', phase.error)
    if (capabilities.error) fail('Loading its capabilities', capabilities.error)
    if (phase.data === null) return null

    const ids = (capabilities.data as unknown as Capability[]).map((c) => c.id)

    const entries = ids.length
      ? await supabase.from('topics').select(`${ENTRY_COLUMNS}, capability_id`).in('capability_id', ids)
      : { data: [], error: null }

    if (entries.error) fail('Loading what serves them', entries.error)

    const byCapability = new Map<string, Topic[]>()
    for (const row of (entries.data ?? []) as (TopicRow & { capability_id: string })[]) {
      const list = byCapability.get(row.capability_id) ?? []
      list.push(toTopic(row))
      byCapability.set(row.capability_id, list)
    }

    return {
      phase: phase.data as unknown as Phase,
      capabilities: (capabilities.data as unknown as Capability[]).map((capability) => ({
        capability,
        entries: byCapability.get(capability.id) ?? [],
      })),
    }
  },
)

/**
 * The capability a topic serves, for the "What this is for" line.
 *
 * A separate read because `capability_id` is deliberately not on the domain
 * `Topic` — see topic-mapping.ts. One extra query on one page, in exchange for a
 * queue that has no way to name a capability.
 */
export const readTopicCapability = cache(
  async (topicId: string): Promise<{ capability: Capability; phase: Phase } | null> => {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('topics')
      .select(`capability_id, capabilities ( ${CAPABILITY_COLUMNS_SQL}, phases ( ${PHASE_COLUMNS_SQL} ) )`)
      .eq('id', topicId)
      .maybeSingle()

    if (error) fail('Loading what this is for', error)

    const row = data as {
      capability_id: string | null
      capabilities: (Capability & { phases: Phase | null }) | null
    } | null

    if (row?.capabilities == null || row.capability_id === null) return null

    const { phases, ...capability } = row.capabilities
    if (phases == null) return null

    return { capability, phase: phases }
  },
)

/**
 * Every capability, grouped by phase, for the edit sheet's optional field.
 *
 * The select groups by phase because a capability's wording only makes sense
 * under the phase that set it — two phases can reasonably both contain
 * "Explain it without notes".
 */
export async function listCapabilityOptions(): Promise<
  { phase: string; options: { id: string; name: string }[] }[]
> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('phases')
    .select(`name, created_at, capabilities ( id, name, created_at )`)
    .order('created_at', { ascending: true })

  if (error) fail('Loading your capabilities', error)

  return (data as unknown as { name: string; capabilities: { id: string; name: string }[] }[])
    .filter((phase) => phase.capabilities.length > 0)
    .map((phase) => ({ phase: phase.name, options: phase.capabilities }))
}

/**
 * How many capabilities, and how many demonstrated, for the rail's "2 / 8".
 *
 * The rail runs on every page in the group, so this reads the minimum that can
 * answer the question: the capability ids, and the linked rows' confidence and
 * evidence markers. Not the whole library — the mistake the three topic counts
 * were written to avoid.
 */
export const phaseCounts = cache(async (): Promise<{ total: number; demonstrated: number }> => {
  const supabase = await createClient()

  const [capabilities, entries] = await Promise.all([
    supabase.from('capabilities').select('id'),
    supabase
      .from('topics')
      .select('capability_id, kind, confidence, rebuild_at, challenge_at, production_at')
      .not('capability_id', 'is', null),
  ])

  if (capabilities.error) fail('Counting your capabilities', capabilities.error)
  if (entries.error) fail('Counting what serves them', entries.error)

  const rows = entries.data as {
    capability_id: string
    kind: string
    confidence: string
    rebuild_at: string | null
    challenge_at: string | null
    production_at: string | null
  }[]

  const recall = new Set<string>()
  const evidence = new Set<string>()
  for (const row of rows) {
    if (row.confidence === 'okay' || row.confidence === 'strong') recall.add(row.capability_id)
    // The same kind filter the rule uses — see demonstrationOf.
    if (
      row.kind === 'topic' &&
      (row.rebuild_at !== null || row.challenge_at !== null || row.production_at !== null)
    ) {
      evidence.add(row.capability_id)
    }
  }

  const all = capabilities.data as { id: string }[]

  return {
    total: all.length,
    demonstrated: all.filter((c) => recall.has(c.id) && evidence.has(c.id)).length,
  }
})

export interface NewPhase {
  name: string
  when_text: string | null
  sources_text: string | null
}

export async function insertPhase(input: NewPhase): Promise<Phase> {
  const supabase = await createClient()

  // No user_id: it comes from the column default and the insert policy's
  // with-check refuses anything else.
  const { data, error } = await supabase.from('phases').insert(input).select().single()

  if (error) fail('Saving the phase', error)
  return data as unknown as Phase
}

export async function updatePhase(id: string, input: NewPhase): Promise<Phase> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('phases')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) fail('Saving your changes', error)
  return data as unknown as Phase
}

/**
 * Deletes the phase only.
 *
 * Its capabilities go with it (`on delete cascade`) and its topics stay
 * (`on delete set null`). Both are guarantees of the schema rather than of this
 * function, which is why there is no cleanup here — see
 * supabase/tests/phases_test.sql.
 */
export async function deletePhase(id: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('phases').delete().eq('id', id)

  if (error) fail('Deleting the phase', error)
}

export async function insertCapability(phaseId: string, name: string): Promise<Capability> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('capabilities')
    .insert({ phase_id: phaseId, name })
    .select()
    .single()

  if (error) fail('Saving the capability', error)
  return data as unknown as Capability
}

export async function deleteCapability(id: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('capabilities').delete().eq('id', id)

  if (error) fail('Deleting the capability', error)
}

/** Attaches or detaches a topic's capability. Used by the edit sheet. */
export async function setTopicCapability(
  topicId: string,
  capabilityId: string | null,
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('topics')
    .update({ capability_id: capabilityId })
    .eq('id', topicId)

  if (error) fail('Linking the capability', error)
}
