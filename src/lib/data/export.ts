import 'server-only'

import { toTopic, type TopicRow } from '@/lib/data/topic-mapping'
import type { SourceSummary } from '@/lib/domain/sources'
import type { Topic } from '@/lib/domain/types'
import type { ExportCapability, ExportLedgerItem } from '@/lib/domain/export'
import { statusLabel, type Kind, type Status } from '@/lib/domain/ledger'
import { createClient } from '@/lib/supabase/server'

/**
 * Reading a whole library, for export.
 *
 * The one place in the application that deliberately reads every row a user
 * owns. Issues #4 and #12 removed unbounded reads everywhere else because a page
 * only needs a screenful — but an export that returned a screenful would be a
 * broken export, so this pages through the lot.
 *
 * ── Why there is no admin client here ───────────────────────────────────────
 * This uses the ordinary session client, so **RLS is what scopes it**. The
 * secret key would read across users, and `src/lib/data/account.ts` is the only
 * module in the codebase allowed to hold it — `export-boundary.test.ts` asserts
 * that stays true, because "the export returned someone else's rows" is the one
 * way this feature could be genuinely dangerous.
 */

/** Big enough that a normal library is one round trip, small enough to be a page. */
const PAGE = 1000

const COLUMNS =
  'id, user_id, title, definition, mental_model, mental_model_image_path, category, tags, difficulty, confidence, practice_count, last_practiced_at, created_at, updated_at, kind, options, correct_option, rebuild_at, rebuild_note, rebuild_url, challenge_at, challenge_note, challenge_url, production_at, production_note, production_url'

function fail(action: string, error: { code?: string; message: string }): never {
  throw new Error(`${action} failed: ${error.code ?? 'unknown'} · ${error.message}`)
}

/**
 * Every topic the caller owns, newest first — the library's own order, so the
 * export reads in the order the product presents.
 */
export async function readEntireLibrary(): Promise<Topic[]> {
  const supabase = await createClient()
  const topics: Topic[] = []

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('topics')
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE - 1)

    if (error) fail('Reading your library', error)

    topics.push(...(data as TopicRow[]).map(toTopic))
    if (data.length < PAGE) return topics
  }
}

/**
 * Every source's RECORD, and the map from topic to source.
 *
 * `source_id` is not on the domain `Topic`, so the mapping is returned alongside
 * rather than read off the rows — the same arrangement the detail page uses.
 *
 * **The transcript body is not selected.** It is deliberately not exported: see
 * `sourcesSection` in src/lib/domain/export.ts for the reasoning, which the
 * exported file itself states so a reader can tell a decision from a bug.
 */
export async function readSourcesForExport(): Promise<{
  sources: SourceSummary[]
  sourceOf: Record<string, string>
}> {
  const supabase = await createClient()

  const [sources, links] = await Promise.all([
    supabase
      .from('sources')
      .select(
        'id, user_id, title, course, url, transcript_words, transcript_deleted_at, caveat_noted, created_at, updated_at',
      )
      .order('created_at', { ascending: false }),
    supabase.from('topics').select('id, source_id').not('source_id', 'is', null),
  ])

  if (sources.error) fail('Reading your sources', sources.error)
  if (links.error) fail('Reading where your topics came from', links.error)

  const sourceOf: Record<string, string> = {}
  for (const row of links.data as { id: string; source_id: string }[]) {
    sourceOf[row.id] = row.source_id
  }

  return { sources: sources.data as unknown as SourceSummary[], sourceOf }
}

export interface FetchedImage {
  path: string
  bytes: Uint8Array
}

/**
 * Downloads one image, or reports it missing.
 *
 * A row can point at an object storage no longer holds — a failed replace, a
 * swept orphan, a restore that missed the bucket. One dead path must not cost
 * the whole export, so this returns null and the caller records it. Silence
 * would be worse than the failure: you would get a zip that looks complete.
 *
 * Also the session client, so a caller cannot reach another user's folder even
 * by supplying its path.
 */
export async function fetchImage(path: string): Promise<FetchedImage | null> {
  const supabase = await createClient()

  const { data, error } = await supabase.storage.from('mental-models').download(path)
  if (error || !data) return null

  return { path, bytes: new Uint8Array(await data.arrayBuffer()) }
}

/**
 * Capabilities for the export, with `demonstrated` derived at read time.
 *
 * Derived here rather than stored, because it is derived everywhere: there is no
 * column to read it from. The linked rows come back with just enough to run the
 * rule — confidence and the three markers — rather than the whole library.
 */
export async function readCapabilitiesForExport(): Promise<{
  capabilities: ExportCapability[]
  capabilityOf: Record<string, string>
}> {
  const supabase = await createClient()

  const [phases, links] = await Promise.all([
    supabase
      .from('phases')
      .select('name, created_at, capabilities ( id, name, created_at )')
      .order('created_at', { ascending: true }),
    supabase
      .from('topics')
      .select('id, capability_id, kind, confidence, rebuild_at, challenge_at, production_at')
      .not('capability_id', 'is', null),
  ])

  if (phases.error) fail('Reading your phases', phases.error)
  if (links.error) fail('Reading what serves them', links.error)

  const rows = links.data as {
    id: string
    capability_id: string
    kind: string
    confidence: string
    rebuild_at: string | null
    challenge_at: string | null
    production_at: string | null
  }[]

  const capabilityOf: Record<string, string> = {}
  const recall = new Set<string>()
  const evidence = new Set<string>()

  for (const row of rows) {
    capabilityOf[row.id] = row.capability_id
    if (row.confidence === 'okay' || row.confidence === 'strong') recall.add(row.capability_id)
    // The same kind filter the rule uses — see demonstrationOf.
    if (
      row.kind === 'topic' &&
      (row.rebuild_at !== null || row.challenge_at !== null || row.production_at !== null)
    ) {
      evidence.add(row.capability_id)
    }
  }

  const capabilities: ExportCapability[] = []
  for (const phase of phases.data as unknown as {
    name: string
    capabilities: { id: string; name: string }[]
  }[]) {
    for (const capability of phase.capabilities) {
      capabilities.push({
        id: capability.id,
        name: capability.name,
        phase: phase.name,
        demonstrated: recall.has(capability.id) && evidence.has(capability.id),
      })
    }
  }

  return { capabilities, capabilityOf }
}

/** The ledger for the export, with each status already in its kind's words. */
export async function readLedgerForExport(): Promise<ExportLedgerItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('project_items')
    .select('kind, title, link, note, status, created_at, capabilities ( name )')
    .order('created_at', { ascending: false })

  if (error) fail('Reading your ledger', error)

  return (
    data as unknown as {
      kind: Kind
      title: string
      link: string | null
      note: string | null
      status: Status
      created_at: string
      capabilities: { name: string } | null
    }[]
  ).map((row) => ({
    kind: row.kind,
    title: row.title,
    link: row.link,
    note: row.note,
    // Rendered here so the file reads the way the screen does, from one mapping.
    status: statusLabel(row.kind, row.status),
    capability: row.capabilities?.name ?? null,
    created_at: row.created_at,
  }))
}
