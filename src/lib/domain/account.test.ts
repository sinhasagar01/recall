import { describe, expect, it } from 'vitest'
import { accountDeletionSummary } from '@/lib/domain/account'
import { makeTopic } from '@/lib/domain/topic-fixture'

const withImage = () => makeTopic({ mental_model_image_path: 'u/t/a.png' })
const withoutImage = () => makeTopic({ mental_model_image_path: null })

describe('accountDeletionSummary', () => {
  /*
    Same rule as deleting one topic: name what actually dies. Counting images the
    account does not have would name something that does not die, which DESIGN.md
    section 4.6 forbids.
  */
  it('names an empty account honestly', () => {
    expect(accountDeletionSummary([])).toBe(
      "This deletes your account. You haven't saved anything yet. It can't be undone.",
    )
  })

  it('counts one topic and one image', () => {
    expect(accountDeletionSummary([withImage()])).toBe(
      "This deletes your account, 1 topic and 1 image. It can't be undone.",
    )
  })

  it('pluralises both', () => {
    expect(accountDeletionSummary([withImage(), withImage(), withoutImage()])).toBe(
      "This deletes your account, 3 topics and 2 images. It can't be undone.",
    )
  })

  it('does not mention images when there are none', () => {
    const summary = accountDeletionSummary([withoutImage(), withoutImage()])
    expect(summary).toBe("This deletes your account and 2 topics. It can't be undone.")
    expect(summary).not.toContain('image')
  })

  it('counts only topics that actually carry an image', () => {
    expect(accountDeletionSummary([withImage(), withoutImage()])).toContain('1 image')
  })

  it('always says it cannot be undone', () => {
    for (const topics of [[], [withImage()], [withoutImage()]]) {
      expect(accountDeletionSummary(topics)).toContain("can't be undone")
    }
  })

  it('never apologises or hedges', () => {
    expect(accountDeletionSummary([withImage()])).not.toMatch(/sorry|please note|unfortunately/i)
  })
})
