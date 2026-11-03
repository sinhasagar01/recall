import { imageEntryName } from '@/lib/domain/export'
import { normaliseRichText, richTextToPlainText } from '@/lib/domain/rich-text'
import type { Confidence, Difficulty, Kind, Topic } from '@/lib/domain/types'

export interface ImportedTopic {
  title: string
  kind: Kind
  definition: string | null
  mental_model: string | null
  category: string | null
  tags: string[]
  options: string[] | null
  correct_option: number | null
  code_example: string | null
  code_language: string | null
  difficulty: Difficulty
  confidence: Confidence
  practice_count: number
  last_practiced_at: string | null
  extracted: boolean
  last_recall: string | null
  last_recall_at: string | null
  rebuild_at: string | null
  rebuild_note: string | null
  rebuild_url: string | null
  challenge_at: string | null
  challenge_note: string | null
  challenge_url: string | null
  production_at: string | null
  production_note: string | null
  production_url: string | null
  imageEntry: string | null
}

type Result = { topics: ImportedTopic[] } | { error: string }
type RecordValue = Record<string, unknown>
const confidences = ['new', 'weak', 'okay', 'strong'] as const
const difficulties = ['easy', 'medium', 'hard'] as const

/** Parses Recall's own library.json. Import is additive; ids and ownership never cross accounts. */
export function parseLibraryImport(value: unknown): Result {
  if (!isRecord(value) || !Array.isArray(value.topics)) return { error: 'This is not a Recall library export. Choose the .zip created by Export my library.' }
  if (value.topics.length === 0) return { error: 'That export has no topics or quizzes to add.' }
  if (value.topics.length > 5_000) return { error: 'That export is too large to import in one go.' }

  const topics: ImportedTopic[] = []
  for (const [index, raw] of value.topics.entries()) {
    const parsed = parseTopic(raw)
    if ('error' in parsed) return { error: `Entry ${index + 1}: ${parsed.error}` }
    topics.push(parsed.topic)
  }
  return { topics }
}

function parseTopic(value: unknown): { topic: ImportedTopic } | { error: string } {
  if (!isRecord(value)) return { error: 'is not a topic record.' }
  const title = text(value.title)
  const kind = value.kind
  if (title === null || title.trim() === '') return { error: 'needs a title.' }
  if (kind !== 'topic' && kind !== 'quiz') return { error: 'has an unsupported type.' }
  const tags = strings(value.tags)
  if (tags === null) return { error: 'has invalid tags.' }
  const confidence = oneOf(value.confidence, confidences)
  const difficulty = oneOf(value.difficulty, difficulties)
  if (confidence === null || difficulty === null) return { error: 'has an invalid confidence or difficulty.' }
  const practiceCount = value.practice_count
  if (typeof practiceCount !== 'number' || !Number.isInteger(practiceCount) || practiceCount < 0) return { error: 'has an invalid practice count.' }

  const shared = {
    title: title.trim(), kind, tags, confidence, difficulty, practice_count: practiceCount,
    mental_model: optionalText(value.mental_model), category: optionalText(value.category),
    code_example: optionalText(value.code_example), code_language: optionalText(value.code_language),
    last_practiced_at: optionalText(value.last_practiced_at), extracted: value.extracted === true,
    last_recall: optionalText(value.last_recall), last_recall_at: optionalText(value.last_recall_at),
    rebuild_at: optionalText(value.rebuild_at), rebuild_note: optionalText(value.rebuild_note), rebuild_url: optionalText(value.rebuild_url),
    challenge_at: optionalText(value.challenge_at), challenge_note: optionalText(value.challenge_note), challenge_url: optionalText(value.challenge_url),
    production_at: optionalText(value.production_at), production_note: optionalText(value.production_note), production_url: optionalText(value.production_url),
    imageEntry: imageEntry(value),
  }

  if (!validEvidence(shared, kind)) return { error: 'has incomplete evidence fields.' }
  if (kind === 'topic') {
    const definition = optionalText(value.definition)
    if (definition === null || richTextToPlainText(normaliseRichText(definition)) === '') return { error: 'needs a definition.' }
    return { topic: { ...shared, kind, definition: normaliseRichText(definition), options: null, correct_option: null } }
  }

  const options = strings(value.options)
  if (options === null || options.length < 2 || options.some((option) => option.trim() === '')) return { error: 'has invalid quiz options.' }
  const correctOption = value.correct_option
  if (typeof correctOption !== 'number' || !Number.isInteger(correctOption) || correctOption < 0 || correctOption >= options.length) return { error: 'has no valid correct answer.' }
  if (shared.mental_model === null || richTextToPlainText(normaliseRichText(shared.mental_model)) === '') return { error: 'needs an explanation.' }
  return { topic: { ...shared, kind, definition: null, options: options.map((option) => option.trim()), correct_option: correctOption } }
}

function validEvidence(topic: Pick<ImportedTopic, 'rebuild_at' | 'rebuild_note' | 'rebuild_url' | 'challenge_at' | 'challenge_note' | 'challenge_url' | 'production_at' | 'production_note' | 'production_url'>, kind: Kind) {
  const entries = [[topic.rebuild_at, topic.rebuild_note, topic.rebuild_url], [topic.challenge_at, topic.challenge_note, topic.challenge_url], [topic.production_at, topic.production_note, topic.production_url]] as const
  if (kind === 'quiz') return entries.every(([date, note, url]) => date === null && note === null && url === null)
  return entries.every(([date, note, url]) => (date === null) === (note === null) && (url === null || date !== null) && (note === null || note.trim() !== ''))
}

function imageEntry(value: RecordValue): string | null {
  if (typeof value.id !== 'string' || typeof value.mental_model_image_path !== 'string') return null
  return imageEntryName({ id: value.id, mental_model_image_path: value.mental_model_image_path } as Topic)
}
function isRecord(value: unknown): value is RecordValue { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function text(value: unknown): string | null { return typeof value === 'string' ? value : null }
function optionalText(value: unknown): string | null { return value === null || value === undefined ? null : text(value) }
function strings(value: unknown): string[] | null { return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null }
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null { return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : null }
