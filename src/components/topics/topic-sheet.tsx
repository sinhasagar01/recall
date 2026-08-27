'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Kbd } from '@/components/ui/kbd'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import { Sheet } from '@/components/ui/sheet'
import { TagsInput } from '@/components/ui/tags-input'
import { suggestCategory, UNCATEGORIZED } from '@/lib/domain/category-suggest'
import { DIFFICULTY_LABEL, type CategoryOption } from '@/lib/domain/library'
import type { Difficulty } from '@/lib/domain/types'
import { createTopic, type SaveTopicResult } from '@/app/(app)/library/actions'
import { saveTopicEdits } from '@/app/(app)/topic/[id]/actions'
import type { Topic } from '@/lib/domain/types'

const DIFFICULTIES = (['easy', 'medium', 'hard'] as const).map((value) => ({
  value,
  label: DIFFICULTY_LABEL[value],
}))

/**
 * One sheet, two modes.
 *
 * Passing a `topic` puts it in edit mode. Forking a second sheet would mean two
 * places to keep the category suggestions, the tag rules and the difficulty
 * control in step, and they would not stay in step.
 *
 * The caller remounts this with a `key` when the topic changes, so the prefilled
 * state comes from useState initialisers rather than an effect syncing props into
 * state after the fact.
 */
export function TopicSheet({
  open,
  onClose,
  onSaved,
  categories,
  topic,
  initialTitle = '',
}: {
  open: boolean
  onClose: () => void
  onSaved: (title: string) => void
  categories: CategoryOption[]
  topic?: Topic
  /** Prefills a NEW topic — the "+ Add “query”" path out of no-results. */
  initialTitle?: string
}) {
  const editing = topic !== undefined

  const [title, setTitle] = useState(topic?.title ?? initialTitle)
  const [definition, setDefinition] = useState(topic?.definition ?? '')
  const [mentalModel, setMentalModel] = useState(topic?.mental_model ?? '')
  const [category, setCategory] = useState(topic?.category ?? UNCATEGORIZED)
  const [tags, setTags] = useState<string[]>(topic?.tags ?? [])
  const [difficulty, setDifficulty] = useState<Difficulty>(topic?.difficulty ?? 'medium')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  /*
    The Suggested group comes from the phase 2 keyword heuristic. No AI, no keys —
    it reads the title and definition the user has already typed.
  */
  const categoryChoices = useMemo(() => {
    const suggestion = suggestCategory(title, definition)
    const rest = categories
      .filter((option) => option.value !== 'all' && option.value !== suggestion)
      .map((option) => ({ ...option, group: 'All' }))

    const suggested = {
      value: suggestion,
      label: suggestion,
      count: categories.find((option) => option.value === suggestion)?.count,
      group: 'Suggested from your topic',
    }

    const uncategorized =
      suggestion === UNCATEGORIZED || rest.some((option) => option.value === UNCATEGORIZED)
        ? []
        : [{ value: UNCATEGORIZED, label: UNCATEGORIZED, group: 'All' }]

    return [suggested, ...rest, ...uncategorized]
  }, [categories, title, definition])

  const clear = () => {
    setTitle('')
    setDefinition('')
    setMentalModel('')
    setCategory(UNCATEGORIZED)
    setTags([])
    setDifficulty('medium')
    setError(null)
  }

  /*
    A transition rather than useActionState: closing the sheet and raising the
    toast are things that happen AFTER the action resolves, and doing them here
    avoids an effect that reacts to a state change just to call setState again.
  */
  const submit = (formData: FormData) => {
    setError(null)
    startSaving(async () => {
      const result: SaveTopicResult = editing
        ? await saveTopicEdits(topic.id, formData)
        : await createTopic(formData)

      if (result.error !== null) {
        setError(result.error)
        return
      }

      onSaved(result.title)
      // An edit keeps what it edited on screen; a new topic clears the form.
      if (!editing) clear()
      onClose()
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit topic' : 'Add topic'}
      footer={
        <>
          <Button
            type="submit"
            form="add-topic"
            variant="primary"
            size="lg"
            loading={isSaving}
            loadingLabel="Saving…"
          >
            {editing ? 'Save changes' : 'Save topic'}
          </Button>
          <span className="font-mono text-[11.5px] text-ink-3">
            <Kbd>⌘</Kbd> <Kbd>↵</Kbd> to save
          </span>
        </>
      }
    >
      <form
        id="add-topic"
        action={submit}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.currentTarget.requestSubmit()
          }
        }}
      >
        {error ? (
          <p
            role="alert"
            className="mb-[18px] flex items-center gap-2 rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="shrink-0">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v6" />
              <path d="M12 16.5v.5" />
            </svg>
            {error}
          </p>
        ) : null}

        <Field
          label="Topic"
          name="title"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <div className="mb-[18px]">
          <label htmlFor="definition" className="mb-1.5 block text-label font-medium text-ink">
            Definition
          </label>
          <textarea
            id="definition"
            name="definition"
            required
            rows={4}
            value={definition}
            onChange={(event) => setDefinition(event.target.value)}
            className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body leading-[1.5] text-ink outline-offset-[-1px] focus:border-accent focus:outline-2 focus:outline-accent"
          />
        </div>

        <div className="mb-[18px]">
          <label htmlFor="mental_model" className="mb-1.5 block text-label font-medium text-ink">
            Mental model
            <span className="ml-1.5 font-mono text-mono font-normal text-ink-3">
              how you think about it
            </span>
          </label>
          <textarea
            id="mental_model"
            name="mental_model"
            rows={3}
            value={mentalModel}
            onChange={(event) => setMentalModel(event.target.value)}
            className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body leading-[1.5] text-ink outline-offset-[-1px] focus:border-accent focus:outline-2 focus:outline-accent"
          />
        </div>

        <div className="mb-[18px] grid grid-cols-1 gap-3.5 md:grid-cols-2">
          <div>
            <span className="mb-1.5 block text-label font-medium text-ink">Category</span>
            <input type="hidden" name="category" value={category} />
            <Select
              label="Category"
              options={categoryChoices}
              value={category}
              unsetValue={UNCATEGORIZED}
              onChange={setCategory}
              filterable
            />
          </div>

          <Segmented
            legend="Difficulty"
            name="difficulty"
            options={DIFFICULTIES}
            value={difficulty}
            onChange={setDifficulty}
          />
        </div>

        <TagsInput label="Tags" hint="optional" tags={tags} onChange={setTags} />
        {tags.map((tag) => (
          <input key={tag} type="hidden" name="tags" value={tag} />
        ))}

        <div className="mb-[18px]">
          <span className="mb-1.5 block text-label font-medium text-ink">
            Visual
            <span className="ml-1.5 font-mono text-mono font-normal text-ink-3">
              optional · png, jpeg, webp · 5 mb
            </span>
          </span>
          {/* Renders, does not upload. Phase 10 wires it to the seam in actions.ts. */}
          <div
            aria-disabled="true"
            title="Image upload arrives in a later phase"
            className="flex items-center gap-3 rounded-md border border-dashed border-rule-strong bg-surface-2 p-[18px] text-label text-ink-2 opacity-70"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <circle cx="9" cy="10" r="1.6" />
              <path d="m4 17 5-5 4 4 3-2 4 4" />
            </svg>
            Diagrams arrive in a later phase.
          </div>
        </div>
      </form>
    </Sheet>
  )
}
