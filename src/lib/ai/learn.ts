import 'server-only'
import { chat } from '@/lib/ai/client'
import { CALLBACKS_LESSON, isCallbacksTranscript, parseLearningLesson, type LearningLesson } from '@/lib/domain/learning'

const schema = { type: 'object', additionalProperties: false, required: ['title','read_once','code_example','code_language','recall_prompt','recall_answer','trace_title','trace_steps','transfer_prompt','transfer_answer'], properties: { title:{type:'string'}, read_once:{type:'string'}, code_example:{type:['string','null']}, code_language:{type:['string','null']}, recall_prompt:{type:'string'}, recall_answer:{type:'string'}, trace_title:{type:'string'}, trace_steps:{type:'array',items:{type:'string'}}, transfer_prompt:{type:'string'}, transfer_answer:{type:'string'} } } as const

export async function createLearningLesson(transcript: string): Promise<{ ok: true; lesson: LearningLesson } | { ok: false; reason: string }> {
  if (isCallbacksTranscript(transcript)) return { ok: true, lesson: CALLBACKS_LESSON }
  const result = await chat({
    system: 'Turn this transcript into one rich, self-contained learning lesson. Preserve the instructor\'s important examples, distinctions and step-by-step reasoning; remove filler only. The learner will read it once, recall it, trace it, then transfer it. In read_once, use short paragraphs, **bold** for key ideas, `inline code` for identifiers or commands, and - lists only when they aid scanning. For technical material, include the best complete code example from the transcript with exact formatting and its language. Give 3-6 concrete trace steps that walk through that code. For non-code material, code_example and code_language must be null and trace the causal sequence. Write a strong retrieval prompt and answer, then a new transfer scenario and answer. Do not create topics, flashcards, markdown fences, or meta commentary.',
    messages: [{ role: 'user', content: transcript }], maxOutputTokens: 3000,
    schema: { name: 'learning_lesson', schema }, whatWasLost: 'No lesson was created; try again.'
  })
  if (!result.ok) return result
  try {
    const lesson = parseLearningLesson(JSON.parse(result.content))
    return lesson ? { ok: true, lesson } : { ok: false, reason: 'The lesson response was incomplete. No lesson was created; try again.' }
  } catch { return { ok: false, reason: 'The lesson response was not readable. No lesson was created; try again.' } }
}
