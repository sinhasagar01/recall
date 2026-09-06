import type { Kind } from '@/lib/domain/types'

/**
 * Reading the add/edit sheet's form data, for both shapes.
 *
 * One parser, shared by `createTopic` and `saveTopicEdits`. Forking it would mean
 * two places holding "a quiz needs 2+ options and a marked answer", and the two
 * would drift the first time one of them was corrected.
 *
 * Everything here runs on the server as well as informing the browser: `required`
 * on an input is a courtesy to the user, not a guarantee to an action, and
 * anything that can sign in can POST to one.
 *
 * It is a pure function over the already-read strings, so the rules are testable
 * without a form, a request or a database — ARCHITECTURE.md, "Every business rule
 * goes in src/lib/domain".
 */

export interface TopicFormInput {
  kind: string
  title: string
  definition: string
  mentalModel: string
  category: string
  tags: string[]
  options: string[]
  correctOption: string
}

export type ParsedTopicForm =
  | { error: string; value?: undefined }
  | {
      error?: undefined
      value:
        | {
            kind: 'topic'
            title: string
            definition: string
            mental_model: string | null
            category: string | null
            tags: string[]
            options: null
            correct_option: null
          }
        | {
            kind: 'quiz'
            title: string
            definition: null
            mental_model: string | null
            category: string | null
            tags: string[]
            options: string[]
            correct_option: number
          }
    }

/** 2, because a single choice is not a question. Mirrors the CHECK constraint. */
export const MIN_QUIZ_OPTIONS = 2

export function parseTopicForm(input: TopicFormInput): ParsedTopicForm {
  const title = input.title.trim()
  const mentalModel = input.mentalModel.trim()
  const category = input.category.trim()

  const shared = {
    title,
    mental_model: mentalModel === '' ? null : mentalModel,
    category: category === '' ? null : category,
    tags: input.tags,
  }

  if (input.kind === 'quiz') {
    if (title === '') return { error: 'A quiz needs a question.' }

    /*
      Not filtered. A blank in the middle would shift every option after it and
      silently move the marked answer, so an empty option is reported rather than
      dropped — the row that looks wrong is the one the person can see and fix.
    */
    const options = input.options.map((option) => option.trim())
    if (options.length < MIN_QUIZ_OPTIONS) {
      return { error: `A quiz needs at least ${MIN_QUIZ_OPTIONS} options.` }
    }
    if (options.some((option) => option === '')) {
      return { error: 'Every option needs some text, or remove it.' }
    }

    /*
      Parsed from the digits, not with `Number`.

      `Number('')` is **0**, so a form where no radio was selected — which sends
      nothing at all — would have arrived here as a valid index and silently marked
      the first option correct. Found by a test that fed it an empty string.
    */
    const raw = input.correctOption.trim()
    const correct = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
      return { error: 'Mark which option is the right answer.' }
    }

    /*
      Required by the FORM, not by the database. A quiz you get wrong that explains
      nothing teaches you the answer rather than the idea — but a NOT NULL on a
      column shared with topics would also reject a quiz arriving by any other
      path, and the constraint has no business knowing which form was used.
    */
    if (shared.mental_model === null) {
      return { error: 'Write the why — it is what you read when you get it wrong.' }
    }

    return {
      value: { ...shared, kind: 'quiz', definition: null, options, correct_option: correct },
    }
  }

  const definition = input.definition.trim()
  if (title === '') return { error: 'Give the topic a title so you can find it again.' }
  if (definition === '') return { error: 'A topic needs a definition. What is it?' }

  return {
    value: { ...shared, kind: 'topic', definition, options: null, correct_option: null },
  }
}

/** What the sheet's toggle sent, defaulting to a topic. */
export function kindFrom(raw: unknown): Kind {
  return raw === 'quiz' ? 'quiz' : 'topic'
}
