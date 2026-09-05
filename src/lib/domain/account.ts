import type { Topic } from '@/lib/domain/types'

/**
 * What deleting an account actually destroys, named.
 *
 * The same rule as deleting a single topic (DESIGN.md, "Delete confirmation names what dies"): name what
 * dies, and nothing that does not. An account with no images should not be told
 * its images are going.
 */
export function accountDeletionSummary(topics: Topic[]): string {
  return accountDeletionSummaryFromCounts(
    topics.length,
    topics.filter((topic) => topic.mental_model_image_path !== null).length,
  )
}

/**
 * The same sentence from counts alone.
 *
 * The library is no longer read whole on every page, so the surfaces that offer
 * account deletion have two numbers rather than an array. The wording rule is
 * unchanged and lives here once.
 */
export function accountDeletionSummaryFromCounts(topics: number, images: number): string {
  if (topics === 0) {
    return "This deletes your account. You haven't saved anything yet. It can't be undone."
  }

  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

  const parts = [plural(topics, 'topic')]
  if (images > 0) parts.push(plural(images, 'image'))

  const list = parts.length === 1 ? ` and ${parts[0]}` : `, ${parts[0]} and ${parts[1]}`

  return `This deletes your account${list}. It can't be undone.`
}
