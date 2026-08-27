'use client'

import { createClient } from '@/lib/supabase/client'
import { imagePath, rejectImage, rejectionMessage } from '@/lib/domain/mental-model-image'

/**
 * Browser-side storage access for mental-model images.
 *
 * The second module in the data layer, and the only one that runs in the browser:
 * `topics.ts` is `server-only`. Uploading direct from the browser avoids routing
 * megabytes through a Server Action — which would also need its body limit raised —
 * and RLS still applies, because the insert policy checks that the first path
 * segment is the caller's own user id.
 */
export const BUCKET = 'mental-models'

export type UploadOutcome = { path: string; error: null } | { path: null; error: string }

export async function uploadMentalModelImage(
  userId: string,
  topicId: string,
  file: File,
): Promise<UploadOutcome> {
  // A pre-check, so the message can name the real size and the real limit. The
  // bucket enforces the same rule regardless — see the bucket-limits migration.
  const rejection = rejectImage(file)
  if (rejection !== null) return { path: null, error: rejectionMessage(file.name, rejection) }

  /*
    The user id comes from the row the server just wrote, NOT from a fresh
    `getUser()` call here.

    Supabase refresh tokens are single-use. An extra auth round-trip at this moment
    races the one the server has already made, and the loser gets back no user — so
    a perfectly valid session reported itself as expired, but only under concurrent
    load. Reading the id off the row removes the round-trip and the race with it, and
    the row is the authoritative source anyway: RLS wrote that user_id.
  */
  const supabase = createClient()
  const path = imagePath(userId, topicId, file.name)

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: true,
  })

  if (error) return { path: null, error: `${file.name} could not be uploaded. ${error.message}` }

  return { path, error: null }
}

/** Used to undo an upload the user cancelled after it had already landed. */
export async function discardUploadedImage(path: string): Promise<void> {
  const supabase = createClient()
  await supabase.storage.from(BUCKET).remove([path])
}
