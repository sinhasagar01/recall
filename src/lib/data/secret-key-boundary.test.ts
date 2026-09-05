import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Exactly one module may hold the secret key.
 *
 * The secret key bypasses RLS. Every read in this application is scoped by RLS
 * and by nothing else — there are no `user_id` filters written by hand, because
 * one would imply the policy might not be doing its job. That arrangement only
 * holds while the application client is the only client.
 *
 * `src/lib/data/account.ts` is the documented exception: deleting an auth user
 * is an admin operation and cannot be done any other way.
 *
 * This matters most for export. "The export returned someone else's rows" is the
 * one way that feature could be genuinely dangerous, and the way it would happen
 * is someone reaching for the admin client to read across a boundary. A grep is
 * a blunt instrument, but it fails loudly the moment the second module appears.
 */
const SRC = join(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

describe('the secret key', () => {
  it('is referenced by exactly one module', () => {
    const holders = sourceFiles(SRC)
      .filter((file) => readFileSync(file, 'utf8').includes('SUPABASE_SECRET_KEY'))
      .map((file) => file.slice(SRC.length + 1))

    expect(holders).toEqual(['lib/data/account.ts'])
  })

  it('is not reachable from the export path', () => {
    // Stated separately from the list above so the failure names the feature.
    for (const file of ['lib/data/export.ts', 'app/(app)/export/route.ts']) {
      const source = readFileSync(join(SRC, file), 'utf8')
      expect(source, `${file} must read through the session client`).not.toContain(
        'SUPABASE_SECRET_KEY',
      )
      expect(source, `${file} must not build its own supabase-js client`).not.toContain(
        "from '@supabase/supabase-js'",
      )
    }
  })
})
