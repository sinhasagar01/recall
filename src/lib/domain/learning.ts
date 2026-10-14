export interface LearningLesson {
  title: string
  read_once: string
  code_example: string | null
  code_language: string | null
  recall_prompt: string
  recall_answer: string
  trace_title: string
  trace_steps: string[]
  transfer_prompt: string
  transfer_answer: string
  transfer_quizzes?: { prompt: string; options: string[]; correct_option: number; explanation: string }[]
  /** Completion belongs to the learning session, not to a Library card. */
  completed_at?: string
}

/** The approved cleaned lesson for the JavaScript callbacks transcript. */
export const CALLBACKS_LESSON: LearningLesson = {
  title: 'Passing a function into another function',
  read_once: [
    'JavaScript lets us pass a function as a value. That allows one reusable function to apply different operations to every item in an array.',
    '`copyArrayAndManipulate` expects an array and an `instructions` function. `multiplyBy2` is passed in as the `instructions` function. Inside the loop, `instructions(array[i])` calls that function for each item and puts the returned value in `output`.',
    '**The key idea:** `instructions` is a placeholder for any function we want to run on each array item. The reusable function does not need to know whether it will double, add, divide, filter, or perform another operation.',
  ].join('\n\n'),
  code_example: `function copyArrayAndManipulate(array, instructions) {
  const output = []

  for (let i = 0; i < array.length; i++) {
    output.push(instructions(array[i]))
  }

  return output
}

function multiplyBy2(input) {
  return input * 2
}

const result = copyArrayAndManipulate([1, 2, 3], multiplyBy2)
// result: [2, 4, 6]`,
  code_language: 'JavaScript',
  recall_prompt: 'What does instructions represent, and why is instructions(array[i]) useful?',
  recall_answer: 'instructions holds the function passed into copyArrayAndManipulate. Calling instructions(array[i]) runs that received function on the current array item, so the reusable function can apply a different operation to every item.',
  trace_title: 'Watch the same instruction run on each item.',
  trace_steps: ['array[0] is 1. instructions(1) runs multiplyBy2(1), which returns 2. Push 2 into output.', 'array[1] is 2. instructions(2) runs multiplyBy2(2), which returns 4. Push 4 into output.', 'array[2] is 3. instructions(3) runs multiplyBy2(3), which returns 6. Push 6 into output.', 'The loop ends and the function returns [2, 4, 6].'],
  transfer_prompt: 'If we pass add3 instead of multiplyBy2, what does copyArrayAndManipulate([1, 2, 3], add3) return?',
  transfer_answer: 'It returns [4, 5, 6]. The reusable function has not changed; only the instruction function changed.',
  transfer_quizzes: [
    { prompt: 'If we pass add3 instead of multiplyBy2, what is returned?', options: ['[2, 4, 6]', '[4, 5, 6]', '[1, 2, 3]'], correct_option: 1, explanation: 'add3 runs for each input: 1 + 3, 2 + 3, and 3 + 3.' },
    { prompt: 'What changes when copyArrayAndManipulate receives a different function?', options: ['The loop must be rewritten', 'Only the operation applied to each item changes', 'The input array is mutated'], correct_option: 1, explanation: 'The reusable loop stays the same. The passed-in function supplies the operation.' },
  ],
}

export function isCallbacksTranscript(transcript: string): boolean {
  const value = transcript.toLowerCase()
  return value.includes('copyarrayandmanipulate') || (value.includes('will sentance') && value.includes('repeatable functions'))
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null

export function parseLearningLesson(value: unknown): LearningLesson | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const title = text(raw.title)
  const readOnce = text(raw.read_once)
  const codeExample = text(raw.code_example)
  const codeLanguage = text(raw.code_language)
  const recallPrompt = text(raw.recall_prompt)
  const recallAnswer = text(raw.recall_answer)
  const traceTitle = text(raw.trace_title)
  const transferPrompt = text(raw.transfer_prompt)
  const transferAnswer = text(raw.transfer_answer)
  const traceSteps = Array.isArray(raw.trace_steps) ? raw.trace_steps.map(text).filter((item): item is string => item !== null) : []
  if (!title || !readOnce || !recallPrompt || !recallAnswer || !traceTitle || !transferPrompt || !transferAnswer || traceSteps.length < 2) return null
  const quizzes = Array.isArray(raw.transfer_quizzes) ? raw.transfer_quizzes.map((item) => {
    if (typeof item !== 'object' || item === null) return null
    const quiz = item as Record<string, unknown>; const prompt = text(quiz.prompt); const explanation = text(quiz.explanation)
    const options = Array.isArray(quiz.options) ? quiz.options.map(text).filter((option): option is string => option !== null) : []
    const correct = typeof quiz.correct_option === 'number' ? quiz.correct_option : -1
    return prompt && explanation && options.length >= 2 && correct >= 0 && correct < options.length ? { prompt, options, correct_option: correct, explanation } : null
  }).filter((item): item is { prompt: string; options: string[]; correct_option: number; explanation: string } => item !== null) : []
  const completedAt = text(raw.completed_at)
  return { title, read_once: readOnce, code_example: codeExample, code_language: codeLanguage, recall_prompt: recallPrompt, recall_answer: recallAnswer, trace_title: traceTitle, trace_steps: traceSteps, transfer_prompt: transferPrompt, transfer_answer: transferAnswer, transfer_quizzes: quizzes.length > 0 ? quizzes : undefined, completed_at: completedAt ?? undefined }
}
