import 'server-only'

import { kindFrom, type TopicFormInput } from '@/lib/domain/topic-form'

/**
 * `FormData` in, plain strings out.
 *
 * The one place that knows the sheet's field names. It exists so
 * `parseTopicForm` can stay a pure function over strings — the rules are then
 * testable without constructing a request, which is what keeps them in the
 * domain layer where ARCHITECTURE.md says business rules belong.
 */
export function readTopicForm(formData: FormData): TopicFormInput {
  return {
    kind: kindFrom(formData.get('kind')),
    sourceId: String(formData.get('source_id') ?? ''),
    capabilityId: String(formData.get('capability_id') ?? ''),
    title: String(formData.get('title') ?? ''),
    definition: String(formData.get('definition') ?? ''),
    mentalModel: String(formData.get('mental_model') ?? ''),
    category: String(formData.get('category') ?? ''),
    tags: formData.getAll('tags').map(String),
    options: formData.getAll('options').map(String),
    correctOption: String(formData.get('correct_option') ?? ''),
  }
}
