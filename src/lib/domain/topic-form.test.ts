import { describe, expect, it } from 'vitest'
import { kindFrom, parseTopicForm, type TopicFormInput } from '@/lib/domain/topic-form'

const form = (overrides: Partial<TopicFormInput> = {}): TopicFormInput => ({
  kind: 'topic',
  title: 'Stacking contexts',
  definition: 'A z-index only competes inside one.',
  mentalModel: '',
  category: 'CSS',
  tags: [],
  options: [],
  correctOption: '',
  ...overrides,
})

const quizForm = (overrides: Partial<TopicFormInput> = {}) =>
  form({
    kind: 'quiz',
    title: 'Does a transform create one?',
    definition: '',
    mentalModel: 'Because the transform establishes a new context.',
    options: ['Yes', 'No'],
    correctOption: '0',
    ...overrides,
  })

describe('a topic', () => {
  it('parses, with both quiz columns explicitly null', () => {
    const parsed = parseTopicForm(form())

    expect(parsed.value).toEqual({
      kind: 'topic',
      title: 'Stacking contexts',
      definition: 'A z-index only competes inside one.',
      mental_model: null,
      category: 'CSS',
      tags: [],
      options: null,
      correct_option: null,
    })
  })

  it('still needs a definition', () => {
    expect(parseTopicForm(form({ definition: '  ' })).error).toBe(
      'A topic needs a definition. What is it?',
    )
  })

  it('does not need a mental model', () => {
    expect(parseTopicForm(form({ mentalModel: '' })).error).toBeUndefined()
  })
})

describe('a quiz', () => {
  it('parses, with definition explicitly null', () => {
    const parsed = parseTopicForm(quizForm())

    expect(parsed.value).toEqual({
      kind: 'quiz',
      title: 'Does a transform create one?',
      definition: null,
      mental_model: 'Because the transform establishes a new context.',
      category: 'CSS',
      tags: [],
      options: ['Yes', 'No'],
      correct_option: 0,
    })
  })

  it('needs a question', () => {
    expect(parseTopicForm(quizForm({ title: ' ' })).error).toBe('A quiz needs a question.')
  })

  it('needs two options — one choice is not a question', () => {
    expect(parseTopicForm(quizForm({ options: ['Yes'] })).error).toBe(
      'A quiz needs at least 2 options.',
    )
  })

  it('reports an empty option rather than dropping it', () => {
    /*
      Dropping it would shift every option after it and move the marked answer
      without saying so — a quiz that saves with the wrong answer and looks fine.
    */
    const parsed = parseTopicForm(quizForm({ options: ['Yes', '  ', 'No'], correctOption: '2' }))
    expect(parsed.error).toBe('Every option needs some text, or remove it.')
  })

  it('rejects an answer that does not index into the options', () => {
    for (const correctOption of ['2', '-1', '', 'x', '1.5']) {
      expect(parseTopicForm(quizForm({ correctOption })).error).toBe(
        'Mark which option is the right answer.',
      )
    }
  })

  it('accepts the last valid index — the boundary is on the valid side', () => {
    const parsed = parseTopicForm(quizForm({ options: ['a', 'b', 'c'], correctOption: '2' }))
    expect(parsed.value?.correct_option).toBe(2)
  })

  it('requires the why, which the database does not', () => {
    /*
      The rule lives here rather than in a NOT NULL because the column is shared
      with topics, where it is optional — and a constraint has no business knowing
      which form a row arrived through.
    */
    expect(parseTopicForm(quizForm({ mentalModel: '   ' })).error).toBe(
      'Write the why — it is what you read when you get it wrong.',
    )
  })

  it('ignores a definition sent alongside a quiz', () => {
    // The shape CHECK would reject it, so the form must not forward one.
    const parsed = parseTopicForm(quizForm({ definition: 'left over from the other mode' }))
    expect(parsed.value?.definition).toBeNull()
  })
})

describe('kindFrom', () => {
  it('is a quiz only when it says so', () => {
    expect(kindFrom('quiz')).toBe('quiz')
    expect(kindFrom('topic')).toBe('topic')
  })

  it('defaults to a topic for anything else, including nothing', () => {
    for (const raw of [null, undefined, '', 'flashcard', 42]) {
      expect(kindFrom(raw)).toBe('topic')
    }
  })
})
