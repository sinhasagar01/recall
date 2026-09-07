import { Zip, ZipPassThrough } from 'fflate'
import { NextResponse } from 'next/server'

import { fetchImage, readCapabilitiesForExport, readEntireLibrary, readSourcesForExport } from '@/lib/data/export'
import { exportFilename, imageEntryName, renderLibraryMarkdown } from '@/lib/domain/export'
import { createClient } from '@/lib/supabase/server'

/**
 * The whole library, as a zip.
 *
 * One action, no options, no format picker. Two files come out and they are not
 * equivalent: `library.md` is the artifact meant to survive — readable in any
 * text editor with no tooling — and `library.json` is the machine copy, every
 * column, for an importer that may never be written.
 *
 * Streamed rather than buffered. A library is bounded by nothing but how much
 * you have saved, images are up to 5 MB each, and Vercel caps a non-streaming
 * response at 4.5 MB. Streaming is also the only version that does not hold the
 * whole archive in memory, so there is one code path rather than a small one and
 * a large one.
 *
 * Scoped by RLS, not by a filter written here — see src/lib/data/export.ts.
 */
export async function GET() {
  /*
    An explicit check, even though RLS would return nothing anyway. Without it a
    signed-out request gets a valid, empty zip, which reads as "your library is
    empty" rather than "you are not signed in".
  */
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const exportedAt = new Date()
  const [topics, { sources, sourceOf }, { capabilities, capabilityOf }] = await Promise.all([
    readEntireLibrary(),
    readSourcesForExport(),
    readCapabilitiesForExport(),
  ])

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false

      const zip = new Zip((error, chunk, final) => {
        if (closed) return
        if (error) {
          closed = true
          controller.error(error)
          return
        }
        controller.enqueue(chunk)
        if (final) {
          closed = true
          controller.close()
        }
      })

      /** fflate's streams are push-based; this is the one-file convenience. */
      const write = (name: string, bytes: Uint8Array) => {
        const file = new ZipPassThrough(name)
        zip.add(file)
        file.push(bytes, true)
      }

      try {
        /*
          Images first, so the two documents can state what actually made it in.
          A row pointing at an object storage no longer holds is recorded rather
          than thrown: one dead path must not cost the whole export.
        */
        const missingPaths = new Set<string>()

        for (const topic of topics) {
          const path = topic.mental_model_image_path
          if (path === null) continue

          const image = await fetchImage(path)
          if (image === null) {
            missingPaths.add(path)
            continue
          }

          write(imageEntryName(topic)!, image.bytes)
        }

        const encoder = new TextEncoder()

        write(
          'library.md',
          encoder.encode(
            renderLibraryMarkdown(topics, {
              exportedAt,
              missingPaths,
              sources,
              sourceOf,
              capabilities,
              capabilityOf,
            }),
          ),
        )

        write(
          'library.json',
          encoder.encode(
            JSON.stringify(
              {
                exportedAt: exportedAt.toISOString(),
                topicCount: topics.length,
                images: {
                  exported: topics.filter(
                    (t) => t.mental_model_image_path !== null && !missingPaths.has(t.mental_model_image_path),
                  ).length,
                  // Visible rather than silent: a row can outlive its object.
                  missing: [...missingPaths],
                },
                topics,
                /*
                  Sources carry their record and their word count, never the
                  transcript body. A stated exception to "every column, not a
                  summary", which was asserted about topics — the note below is in
                  the file so a reader finding a count and no text can tell a
                  decision from a bug.
                */
                sourceNote:
                  'Transcript bodies are deliberately not exported: scratch text pasted from elsewhere, not your writing. transcript_words is kept so their absence reads as a decision.',
                sources,
                sourceOf,
                capabilities,
                capabilityOf,
              },
              null,
              2,
            ),
          ),
        )

        zip.end()
      } catch (error) {
        if (!closed) {
          closed = true
          controller.error(error)
        }
      }
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${exportFilename(exportedAt)}"`,
      // Someone's entire library. Never a shared cache, never a stale copy.
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    },
  })
}
