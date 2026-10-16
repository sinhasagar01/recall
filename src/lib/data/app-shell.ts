import 'server-only'

import { cache } from 'react'
import { fail } from '@/lib/data/fail'
import { REVIEW_CONFIDENCES } from '@/lib/domain/library-counts'
import { createClient } from '@/lib/supabase/server'

export type AppShellSummary = {
  rail: { total: number; needsReview: number; withImages: number }
  sources: number
  phases: { total: number; demonstrated: number }
  ledger: number
  days: { day: string; done: number; written: number }[]
}

/** The small private data set shared by the persistent navigation surfaces. */
export const readAppShellSummary = cache(async (): Promise<AppShellSummary> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('app_shell_summary', {
    p_review_confidences: [...REVIEW_CONFIDENCES],
  })
  if (error) fail('Loading navigation', error)
  return data as unknown as AppShellSummary
})
