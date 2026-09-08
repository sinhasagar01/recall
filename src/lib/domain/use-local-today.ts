'use client'

import { useEffect, useState } from 'react'
import { localDateString } from '@/lib/domain/evidence'

/**
 * Today's date, as the user's calendar sees it.
 *
 * The server cannot answer this: on a UTC host the calendar date is wrong for a
 * third of every day, which is why `localDateString` exists and why it takes the
 * date as a parameter. So every surface that needs "which day is it" resolves it
 * here, after mount, and renders nothing for it until it knows.
 *
 * `null` on the first pass is the honest value, not a placeholder — and rendering
 * a count for the wrong day briefly is worse than rendering none.
 */
export function useLocalToday(): string | null {
  const [today, setToday] = useState<string | null>(null)

  useEffect(() => {
    setToday(localDateString(new Date()))
  }, [])

  return today
}
