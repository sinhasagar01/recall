'use server'

import { revalidatePath } from 'next/cache'
import { extractConcepts } from '@/lib/ai/extract'
import {
  readLibraryTitles,
  readTranscript,
  saveExtracted,
} from '@/lib/data/extraction'
import {
  markDuplicates,
  normaliseTitle,
  type CoverageEntry,
  type ExtractedConcept,
  type ReviewedConcept,
} from '@/lib/domain/extraction'

/**
 * The two actions, and the asymmetry between them is the whole rule.
 *
 * `extract` READS a transcript, calls a model, and returns data. It writes
 * nothing and cannot — `lib/ai/extract.ts` has no database client, asserted by
 * `ai-boundary.test.ts` and seen failing by putting an insert on that path.
 *
 * `saveExtracted` is the only write, and it happens when Save is pressed.
 */

export type ExtractResult =
  | { ok: true; reviewed: ReviewedConcept[]; partial: boolean; dropped: string[] }
  | { ok: false; reason: string }

/**
 * Takes an ID, not a transcript.
 *
 * The browser never uploads the body — it is already on the server, kept there
 * by arc 2 for exactly this. So a 61,000-word transcript never approaches Next's
 * 1 MB server-action body limit, and the only thing that leaves this origin is
 * the request to the vendor.
 */
export async function extract(sourceId: string): Promise<ExtractResult> {
  const source = await readTranscript(sourceId)
  if (source === null) {
    return { ok: false, reason: 'There is no transcript on this source to extract from.' }
  }

  const outcome = await extractConcepts(source.transcript)
  if (!outcome.ok) return { ok: false, reason: outcome.reason }
  if (!outcome.result.ok) return { ok: false, reason: outcome.result.reason }

  /*
    Duplicates are marked HERE rather than in the browser, because the titles
    they are compared against are the whole library and that is a read the
    review screen has no business doing.
  */
  const titles = await readLibraryTitles()

  return {
    ok: true,
    reviewed: markDuplicates(outcome.result.concepts, titles),
    partial: outcome.result.partial,
    dropped: outcome.result.dropped,
  }
}

/**
 * The save. Nothing above this line writes anything.
 *
 * Coverage is built from the WHOLE reviewed list — kept and dropped alike —
 * because that is the point of it: *"nothing was silently skipped"*. A concept
 * you unticked is recorded with the reason, not omitted.
 */
export async function saveExtraction(
  sourceId: string,
  reviewed: ReviewedConcept[],
  partial: boolean,
  pass: number,
): Promise<{ error: string | null; saved?: { topics: number; quizzes: number } }> {
  const kept = reviewed.filter((entry) => entry.keep).map((entry) => entry.concept)

  const coverage: CoverageEntry[] = reviewed.map((entry) => ({
    title: entry.concept.title,
    normalised: normaliseTitle(entry.concept.title),
    timestamp: entry.concept.timestamp,
    status: entry.keep ? 'kept' : 'dropped',
    reason: entry.keep
      ? null
      : entry.duplicateOf !== null
        ? `already in your library — ${entry.duplicateOf}`
        : 'you dropped it',
    topicId: null,
    pass,
    partial,
  }))

  try {
    const saved = await saveExtracted(sourceId, kept as ExtractedConcept[], coverage)

    revalidatePath(`/sources/${sourceId}`)
    revalidatePath('/sources')
    revalidatePath('/library')

    return { error: null, saved }
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : 'Nothing was saved.',
    }
  }
}
