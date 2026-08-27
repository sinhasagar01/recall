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
  topicId: string,
  file: File,
): Promise<UploadOutcome> {
  // A pre-check, so the message can name the real size and the real limit. The
  // bucket enforces the same rule regardless — see the bucket-limits migration.
  const rejection = rejectImage(file)
  if (rejection !== null) return { path: null, error: rejectionMessage(file.name, rejection) }

  const supabase = createClient()

  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { path: null, error: 'Your session expired. Sign in and try again.' }

  const path = imagePath(auth.user.id, topicId, file.name)

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
