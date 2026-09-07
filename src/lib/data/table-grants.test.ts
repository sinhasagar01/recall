import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every table the app reads has an explicit GRANT.
 *
 * This is the regression for a production outage, and for the same outage a
 * second time. `sources` was created with four RLS policies and no grant. Every
 * local check passed — 42 pgTAP assertions, the full e2e suite against a real
 * Supabase — and the hosted project answered `42501 · permission denied for
 * table sources`, taking down every page in the (app) group rather than only
 * /sources, because `countSources()` runs in the shared layout.
 *
 * ── Why the pgTAP privilege assertions do not cover this ────────────────────
 * `topics_test.sql` has had `has_table_privilege` assertions since the first time
 * this happened, and `sources_test.sql` now has them too. They pass **whether or
 * not the grant migration exists**, because the local stack grants them through
 * Supabase's default ACLs for new tables in `public`. A hosted project does not
 * apply those defaults to a table created by a migration on a running project.
 * So the local database cannot answer this question — only the migrations can,
 * and that is what this reads.
 *
 * RLS is a separate gate and does not replace this one. GRANT is checked first,
 * and it is the one that fails loudly: without a policy you get zero rows and no
 * error, which reads like the data vanished; without the grant you get a 500.
 */

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')

function migrationSources(): string {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith('.sql'))
    .map((file) => readFileSync(join(MIGRATIONS, file), 'utf8'))
    .join('\n')
}

/** `create table public.foo (` / `create table if not exists public.foo (` */
const CREATED = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi

/** `grant select, insert, update, delete on table public.foo to authenticated` */
const GRANTED = /grant\s+([\w\s,]+?)\s+on\s+table\s+public\.(\w+)\s+to\s+authenticated/gi

const REQUIRED = ['select', 'insert', 'update', 'delete']

describe('every table created by a migration is granted to authenticated', () => {
  it('grants all four privileges on each one', () => {
    const sql = migrationSources()

    const created = [...sql.matchAll(CREATED)].map((match) => match[1])
    const granted = new Map<string, string[]>()
    for (const match of [...sql.matchAll(GRANTED)]) {
      const privileges = match[1].split(',').map((word) => word.trim().toLowerCase())
      granted.set(match[2], [...(granted.get(match[2]) ?? []), ...privileges])
    }

    // Guard the guard: a regex that stopped matching would make this vacuous.
    expect(created.length, 'no created tables found — the pattern has rotted').toBeGreaterThan(0)
    expect(created).toContain('topics')
    expect(created).toContain('sources')

    const missing = created.flatMap((table) => {
      const has = granted.get(table) ?? []
      return REQUIRED.filter((privilege) => !has.includes(privilege)).map(
        (privilege) => `public.${table} is never granted ${privilege.toUpperCase()}`,
      )
    })

    expect(missing).toEqual([])
  })
})
