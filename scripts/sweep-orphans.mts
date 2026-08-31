/**
 * Collects mental-model images that no topic points at any more.
 *
 * Replacing an image uploads the new object, patches the path, then removes the
 * old one. A failure at that last step leaves an orphan — surfaced to the user at
 * the time, but never collected. This is the collector.
 *
 * **Reports by default. Deletes only with --delete.** A maintenance script whose
 * default mode is destructive is a bad script.
 *
 *   npm run sweep:orphans            # list what would go
 *   npm run sweep:orphans -- --delete
 *
 * It acts on whatever NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY point at,
 * so it runs against the local stack unless those are pointed elsewhere. Sweeping
 * the hosted project means supplying that project's values deliberately.
 *
 * The secret key is required: a sweep has to see every user's objects, which is
 * exactly what RLS stops the app itself from doing.
 */
import { createClient } from '@supabase/supabase-js'
import { ORPHAN_MIN_AGE_MS, selectOrphans, type StoredObject } from '../src/lib/domain/orphans.ts'

process.loadEnvFile('.env.local')

const BUCKET = 'mental-models'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
const shouldDelete = process.argv.includes('--delete')

/*
  The age window, overridable. Lower it only when you know nothing is mid-save —
  it is the sole protection for a file uploaded but not yet patched onto its row.
*/
const minAgeArg = process.argv.find((a) => a.startsWith('--min-age-minutes='))
const minAgeMs = minAgeArg ? Number(minAgeArg.split('=')[1]) * 60_000 : ORPHAN_MIN_AGE_MS

if (!url || !secretKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local.')
  process.exit(1)
}

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const undateable: string[] = []

/** Walks {user_id}/{topic_id}/{filename}. Folders come back with a null id. */
async function listObjects(): Promise<StoredObject[]> {
  const objects: StoredObject[] = []

  const { data: users, error } = await admin.storage.from(BUCKET).list('')
  if (error) throw new Error(`Listing the bucket failed: ${error.message}`)

  for (const user of users ?? []) {
    if (user.id !== null) continue // a file at the root; not our layout

    const { data: topics } = await admin.storage.from(BUCKET).list(user.name)
    for (const topic of topics ?? []) {
      if (topic.id !== null) continue

      const prefix = `${user.name}/${topic.name}`
      const { data: files } = await admin.storage.from(BUCKET).list(prefix)
      for (const file of files ?? []) {
        if (file.id === null) continue

        /*
          created_at is nullable in the storage API. An object whose age cannot be
          judged is never a deletion candidate — the age window is the only thing
          protecting a file that is mid-save, so an undateable object is skipped
          and reported rather than guessed at.
        */
        if (file.created_at === null) {
          undateable.push(`${prefix}/${file.name}`)
          continue
        }

        objects.push({ path: `${prefix}/${file.name}`, createdAt: file.created_at })
      }
    }
  }

  return objects
}

const objects = await listObjects()

const { data: rows, error: rowsError } = await admin
  .from('topics')
  .select('mental_model_image_path')
  .not('mental_model_image_path', 'is', null)

if (rowsError) {
  console.error(`Reading topics failed: ${rowsError.message}`)
  process.exit(1)
}

const referenced = (rows ?? [])
  .map((row) => row.mental_model_image_path)
  .filter((path): path is string => path !== null)

const orphans = selectOrphans({ objects, referenced, now: new Date(), minAgeMs })

console.log(`objects in bucket : ${objects.length}`)
console.log(`referenced by rows: ${referenced.length}`)
if (undateable.length > 0) {
  console.log(`undateable        : ${undateable.length}  (no created_at — skipped, never deleted)`)
}
console.log(`orphaned          : ${orphans.length}  (older than ${minAgeMs / 60000} minutes)`)

if (orphans.length === 0) {
  console.log('\nNothing to collect.')
  process.exit(0)
}

for (const orphan of orphans) console.log(`  ${orphan.path}  (${orphan.createdAt})`)

if (!shouldDelete) {
  console.log('\nReport only. Re-run with --delete to remove them.')
  process.exit(0)
}

const { error: removeError } = await admin.storage.from(BUCKET).remove(orphans.map((o) => o.path))

if (removeError) {
  console.error(`\nRemoval failed: ${removeError.message}`)
  process.exit(1)
}

console.log(`\nRemoved ${orphans.length} orphaned object${orphans.length === 1 ? '' : 's'}.`)
