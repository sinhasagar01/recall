/**
 * Which stored objects are safe to delete.
 *
 * Replacing an image uploads the new object, patches the path, then removes the
 * old one. A failure at that last step leaves an orphan — reported to the user,
 * but never collected. This decides what a sweep may remove.
 */
export interface StoredObject {
  path: string
  createdAt: string
}

/**
 * How old an unreferenced object must be before it counts as abandoned.
 *
 * Saving is insert -> upload -> patch, so between the upload and the patch an
 * object is legitimately unreferenced. Deleting inside that window would destroy
 * a file someone had just attached. The real window is seconds; an hour is
 * generously past it.
 */
export const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000

export function selectOrphans({
  objects,
  referenced,
  now,
  minAgeMs = ORPHAN_MIN_AGE_MS,
}: {
  objects: StoredObject[]
  referenced: Iterable<string>
  now: Date
  minAgeMs?: number
}): StoredObject[] {
  const live = new Set(referenced)

  return objects.filter((object) => {
    // The hard guarantee: a path some row points at is never an orphan.
    if (live.has(object.path)) return false

    const age = now.getTime() - Date.parse(object.createdAt)
    return Number.isFinite(age) && age > minAgeMs
  })
}
