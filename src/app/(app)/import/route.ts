import { unzipSync } from 'fflate'
import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { insertImportedTopic, setMentalModelImagePath } from '@/lib/data/topics'
import { parseLibraryImport } from '@/lib/domain/library-import'
import { imagePath, rejectImage } from '@/lib/domain/mental-model-image'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
const MAX_UNZIPPED_BYTES = 80 * 1024 * 1024
const imageType = (name: string) => name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : name.endsWith('.jpg') || name.endsWith('.jpeg') ? 'image/jpeg' : ''

/** Adds exported entries as new records. Existing library entries are never read, updated, or replaced. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = typeof claims?.claims?.sub === 'string' ? claims.claims.sub : null
  if (!userId) return NextResponse.json({ error: 'Sign in before importing a library.' }, { status: 401 })

  let archive: File | null = null
  try {
    const form = await request.formData()
    const value = form.get('archive')
    archive = value instanceof File ? value : null
  } catch {
    return NextResponse.json({ error: 'Choose a Recall export .zip file.' }, { status: 400 })
  }
  if (!archive) return NextResponse.json({ error: 'Choose a Recall export .zip file.' }, { status: 400 })
  if (archive.size > MAX_ARCHIVE_BYTES) return NextResponse.json({ error: 'That export is larger than 50 MB. Remove large images and try again.' }, { status: 413 })

  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(await archive.arrayBuffer()))
  } catch {
    return NextResponse.json({ error: 'That file is not a readable Recall export.' }, { status: 400 })
  }
  const unpacked = Object.values(entries).reduce((total, bytes) => total + bytes.byteLength, 0)
  if (unpacked > MAX_UNZIPPED_BYTES) return NextResponse.json({ error: 'That export expands beyond the 80 MB import limit.' }, { status: 413 })

  const library = entries['library.json']
  if (!library) return NextResponse.json({ error: 'This archive has no library.json file. Choose the zip created by Export my library.' }, { status: 400 })

  let parsed: ReturnType<typeof parseLibraryImport>
  try {
    parsed = parseLibraryImport(JSON.parse(new TextDecoder().decode(library)))
  } catch {
    return NextResponse.json({ error: 'library.json is not valid JSON.' }, { status: 400 })
  }
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  let imagesImported = 0
  let imagesSkipped = 0
  try {
    for (const topic of parsed.topics) {
      const created = await insertImportedTopic(topic)
      const image = topic.imageEntry ? entries[topic.imageEntry] : null
      if (!image || topic.imageEntry === null) {
        if (topic.imageEntry !== null) imagesSkipped += 1
        continue
      }
      const type = imageType(topic.imageEntry.toLowerCase())
      if (rejectImage({ size: image.byteLength, type }) !== null) { imagesSkipped += 1; continue }
      const path = imagePath(userId, created.id, topic.imageEntry.split('/').pop() ?? 'diagram')
      const { error } = await supabase.storage.from('mental-models').upload(path, image, { contentType: type, upsert: false })
      if (error) { imagesSkipped += 1; continue }
      await setMentalModelImagePath(created.id, path)
      imagesImported += 1
    }
  } catch (cause) {
    return NextResponse.json({ error: `${cause instanceof Error ? cause.message : 'The import stopped unexpectedly.'} Earlier entries were added and were not changed.` }, { status: 500 })
  }

  revalidatePath('/library')
  revalidatePath('/settings')
  return NextResponse.json({ imported: parsed.topics.length, imagesImported, imagesSkipped })
}
