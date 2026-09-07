import { categoryOf } from '@/lib/domain/category-suggest'
import { CONFIDENCE_LABEL } from '@/lib/domain/confidence'
import { EVIDENCE_COPY, evidenceEntries } from '@/lib/domain/evidence'
import { DIFFICULTY_LABEL, formatShortDate } from '@/lib/domain/library'
import type { Topic } from '@/lib/domain/types'

/**
 * What a library looks like when it leaves.
 *
 * Two files go in the zip and they are not equivalent. `library.json` is the
 * machine copy — every column, nothing lost, and what an importer would read if
 * one is ever written. `library.md` is the one that actually survives: readable
 * in any text editor a decade from now with no tooling at all, and no promise
 * about software that may never exist.
 *
 * So this renders the Markdown, and the JSON is just the rows.
 */

/** Dated, because two exports otherwise collide in a downloads folder. */
export function exportFilename(now: Date): string {
  return `recall-${now.toISOString().slice(0, 10)}.zip`
}

/**
 * Where a topic's image sits inside the zip.
 *
 * Prefixed with the topic id: two topics can carry files with the same name, and
 * a flat `images/diagram.png` would silently keep only one of them.
 */
export function imageEntryName(topic: Topic): string | null {
  if (topic.mental_model_image_path === null) return null

  const filename = topic.mental_model_image_path.split('/').pop() ?? 'image'
  return `images/${topic.id}-${filename}`
}

/**
 * "12 topics", "3 quizzes", "12 topics and 3 quizzes".
 *
 * A library holding both is not "15 topics", and the count at the top of the file
 * is the one thing someone reads before deciding whether the export is complete.
 */
function counted(topics: Topic[]): string {
  const quizzes = topics.filter((topic) => topic.kind === 'quiz').length
  const plain = topics.length - quizzes

  const parts: string[] = []
  if (plain > 0) parts.push(`${plain} ${plain === 1 ? 'topic' : 'topics'}`)
  if (quizzes > 0) parts.push(`${quizzes} ${quizzes === 1 ? 'quiz' : 'quizzes'}`)

  // Empty stays '0 topics' — there are no quizzes either, and the line reads.
  return parts.length === 0 ? '0 topics' : parts.join(' and ')
}

function practiceLine(topic: Topic): string {
  const confidence = CONFIDENCE_LABEL[topic.confidence]
  const when =
    topic.last_practiced_at === null
      ? 'never practiced'
      : `last practiced ${formatShortDate(topic.last_practiced_at)}`
  const count = `${topic.practice_count} ${topic.practice_count === 1 ? 'time' : 'times'}`

  return `${confidence} · ${when} · practiced ${count} · ${DIFFICULTY_LABEL[topic.difficulty]}`
}

/**
 * The library as one readable document.
 *
 * Field order follows the detail page — title, category and tags, definition,
 * mental model, then the practice line — so it reads like the product rather
 * than like a table dump.
 *
 * `missingPaths` are objects a row points at that storage no longer holds. Their
 * topics still render in full; only the image reference is replaced, so the
 * document never carries a link to a file that is not in the zip.
 */
export function renderLibraryMarkdown(
  topics: Topic[],
  { exportedAt, missingPaths }: { exportedAt: Date; missingPaths: Set<string> },
): string {
  const missingCount = topics.filter(
    (topic) =>
      topic.mental_model_image_path !== null && missingPaths.has(topic.mental_model_image_path),
  ).length

  // Only promise an images/ folder when the zip actually carries one.
  const exportedImages = topics.filter(
    (topic) =>
      topic.mental_model_image_path !== null && !missingPaths.has(topic.mental_model_image_path),
  ).length

  const head = [
    '# Recall',
    '',
    `${counted(topics)}, exported ${formatShortDate(exportedAt.toISOString())}.`,
    '',
    exportedImages > 0
      ? '`library.json` holds the same data with every field, for a machine. Images are in `images/`.'
      : '`library.json` holds the same data with every field, for a machine.',
  ]

  if (missingCount > 0) {
    head.push(
      '',
      `**${missingCount} ${missingCount === 1 ? 'image could not be exported' : 'images could not be exported'}** — the files were missing from storage. The topics are all here; the images are named below where they belong.`,
    )
  }

  if (topics.length === 0) {
    head.push('', 'No topics saved.')
    return head.join('\n') + '\n'
  }

  const body = topics.map((topic) => {
    const lines = ['', '---', '', `# ${topic.title}`, '']

    const tags = topic.tags.length > 0 ? ` · ${topic.tags.join(', ')}` : ''
    lines.push(`${categoryOf(topic)}${tags}`, '')

    /*
      A quiz has no definition — its question is the heading above. The section is
      omitted rather than rendered empty, the same rule the mental model follows.
    */
    if (topic.kind === 'topic') lines.push('## Definition', '', topic.definition, '')

    /*
      A quiz's options, in STORED order rather than shuffled, with the answer
      marked in words.

      Stored order because the shuffle is a property of a practice session, not of
      the quiz — an export that reordered them would make two exports of the same
      library differ. In words because the file has to be readable with no tooling
      at all: a bold entry or a colour would be a formatting convention someone has
      to already know, and "the answer" is not.
    */
    if (topic.kind === 'quiz') {
      lines.push('## Options', '')
      topic.options.forEach((option, index) => {
        lines.push(`${index + 1}. ${option}${index === topic.correct_option ? '  ← the answer' : ''}`)
      })
      lines.push('')
    }

    /*
      Omitted entirely rather than rendered as an empty section. Named "Why" for a
      quiz, which is the word the add sheet uses — the field is shared, the heading
      follows what was actually typed into it.
    */
    if (topic.mental_model !== null && topic.mental_model !== '') {
      lines.push(topic.kind === 'quiz' ? '## Why' : '## Mental model', '', topic.mental_model, '')
    }

    /*
      Evidence, after the mental model and before the practice line — the detail
      page's order, so the file reads the way the product does.

      Omitted entirely when there is none, the rule Definition and Visual already
      follow, so a library with no evidence exports byte-identically to before this
      shipped. Dated prose belongs in the file that survives Recall.
    */
    const evidence = evidenceEntries(topic)
    if (evidence.length > 0) {
      lines.push('## Evidence', '')
      for (const { kind, entry } of evidence) {
        const link = entry.url === null ? '' : ` — ${entry.url}`
        lines.push(
          `- **${EVIDENCE_COPY[kind].label}** — ${formatShortDate(entry.at)} — ${entry.note}${link}`,
        )
      }
      lines.push('')
    }

    if (topic.mental_model_image_path !== null) {
      lines.push('## Visual', '')
      if (missingPaths.has(topic.mental_model_image_path)) {
        lines.push(
          `The image was missing from storage and is not in this export. It was at \`${topic.mental_model_image_path}\`.`,
          '',
        )
      } else {
        lines.push(`![${topic.title}](${imageEntryName(topic)})`, '')
      }
    }

    lines.push(practiceLine(topic), '')
    return lines.join('\n')
  })

  return [...head, ...body].join('\n').trimEnd() + '\n'
}
