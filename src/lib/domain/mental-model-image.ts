/**
 * The rules for a mental-model image, in one place.
 *
 * These constants are the single source: the client pre-check reads them for a good
 * message, the server action enforces them, and the migration that sets the bucket's
 * own limits quotes them. Three copies of "5 MB" would eventually disagree, and the
 * one that mattered would be the one nobody looked at.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type ImageRejection =
  | { reason: 'too-large'; bytes: number }
  | { reason: 'wrong-type'; type: string }

/** Human sizes, matching how the reference writes them ("8.4 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  const mb = bytes / (1024 * 1024)
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`
}

/** Returns null when the file is acceptable. */
export function rejectImage(file: { size: number; type: string }): ImageRejection | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { reason: 'wrong-type', type: file.type }
  }
  if (file.size > MAX_IMAGE_BYTES) return { reason: 'too-large', bytes: file.size }
  return null
}

/**
 * The message the user actually sees. DESIGN.md: errors say what happened and what
 * to do, and are never vague — so this names the file, the real size and the real
 * limit rather than "upload failed".
 */
export function rejectionMessage(fileName: string, rejection: ImageRejection): string {
  if (rejection.reason === 'too-large') {
    return `${fileName} is ${formatBytes(rejection.bytes)} — the limit is ${formatBytes(MAX_IMAGE_BYTES)}. Add a smaller file, or open the topic later and attach one.`
  }
  const type = rejection.type === '' ? 'of an unknown type' : rejection.type
  return `${fileName} is ${type}. Diagrams must be png, jpeg or webp. Convert it, or open the topic later and attach one.`
}

/**
 * Storage keys are path segments, so a name with slashes, spaces or control
 * characters would either break the key or change its shape — and the shape is what
 * the RLS policy reads. `(storage.foldername(name))[1]` must stay the user id.
 */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '')
    .slice(-96)
  return cleaned === '' ? 'diagram' : cleaned
}

/** {user_id}/{topic_id}/{filename} — user_id first, because the policy keys on it. */
export function imagePath(userId: string, topicId: string, fileName: string): string {
  return `${userId}/${topicId}/${safeFileName(fileName)}`
}
