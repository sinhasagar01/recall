'use server'

import { revalidatePath } from 'next/cache'
import type { Intention } from '@/lib/domain/today'
import { createClient } from '@/lib/supabase/server'

/**
 * Every write in this arc lives here.
 *
 * The Today page and lib/data/today.ts are reads only — opening the app must not
 * create a row, and `today-boundary.test.ts` asserts that neither of them names a
 * write. Keeping the writes in one file behind explicit form submission is what
 * makes "an unsaved prefill creates no row" structural rather than careful.
 *
 * The `day` always arrives from the client. The server cannot compute it: on a
 * UTC host the calendar date is wrong for a third of every day, which is why
 * localDateString runs in the browser.
 */

export type DayResult = { error: string | null }

const blank = (raw: string): string | null => {
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

function fail(cause: unknown, fallback: string): DayResult {
  return { error: cause instanceof Error ? cause.message : fallback }
}

/**
 * Save the three intentions for a day.
 *
 * An upsert on (user_id, day) — the unique constraint is what makes this one
 * statement instead of a read-then-write that races a second tab.
 */
export async function saveDay(day: string, formData: FormData): Promise<DayResult> {
  const texts = {
    explain_text: blank(String(formData.get('explain') ?? '')),
    rebuild_text: blank(String(formData.get('rebuild') ?? '')),
    apply_text: blank(String(formData.get('apply') ?? '')),
  }

  /*
    A day with nothing typed writes nothing. Pressing Save on three empty fields
    is not a record of a day — it is the same as not having opened the app.
  */
  if (Object.values(texts).every((value) => value === null)) {
    return { error: null }
  }

  try {
    const supabase = await createClient()
    // No user_id: the column default provides it and the insert policy's
    // with-check refuses anything else.
    const { error } = await supabase
      .from('days')
      .upsert({ day, ...texts }, { onConflict: 'user_id,day' })

    if (error) throw new Error(`${error.code ?? 'unknown'} · ${error.message}`)
    revalidatePath('/today')
    return { error: null }
  } catch (cause) {
    return fail(cause, 'Today could not be saved.')
  }
}

/** Tick or untick one line. A single-column update, never read-modify-write. */
export async function setDone(
  day: string,
  slot: Intention,
  done: boolean,
): Promise<DayResult> {
  try {
    const supabase = await createClient()
    /*
      Written as a literal per slot rather than a computed key, so the generated
      column types still check it. A `[\`${slot}_done\`]` key widens to `string`
      and the row type stops being verified at all — a silent loss of exactly the
      guarantee the generated types exist to give.
    */
    const column = { explain: 'explain_done', rebuild: 'rebuild_done', apply: 'apply_done' } as const
    const patch =
      column[slot] === 'explain_done'
        ? { explain_done: done }
        : column[slot] === 'rebuild_done'
          ? { rebuild_done: done }
          : { apply_done: done }

    const { error } = await supabase
      .from('days')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('day', day)

    if (error) throw new Error(`${error.code ?? 'unknown'} · ${error.message}`)
    revalidatePath('/today')
    return { error: null }
  } catch (cause) {
    return fail(cause, 'That could not be saved.')
  }
}

export async function saveBlocker(day: string, text: string): Promise<DayResult> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('days')
      .upsert({ day, blocker_text: blank(text) }, { onConflict: 'user_id,day' })

    if (error) throw new Error(`${error.code ?? 'unknown'} · ${error.message}`)
    revalidatePath('/today')
    return { error: null }
  } catch (cause) {
    return fail(cause, 'The blocker could not be saved.')
  }
}

/** Resolving keeps the text and stamps the date. It never deletes what you wrote. */
export async function resolveBlocker(id: string): Promise<DayResult> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('days')
      .update({ blocker_resolved_at: new Date().toISOString() })
      .eq('id', id)

    if (error) throw new Error(`${error.code ?? 'unknown'} · ${error.message}`)
    revalidatePath('/today')
    return { error: null }
  } catch (cause) {
    return fail(cause, 'The blocker could not be resolved.')
  }
}
