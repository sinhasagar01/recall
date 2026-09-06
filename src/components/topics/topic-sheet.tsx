'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Kbd } from '@/components/ui/kbd'
import { Segmented } from '@/components/ui/segmented'
import { Select } from '@/components/ui/select'
import { Sheet } from '@/components/ui/sheet'
import { TagsInput } from '@/components/ui/tags-input'
import { suggestCategory, UNCATEGORIZED } from '@/lib/domain/category-suggest'
import { DIFFICULTY_LABEL, type CategoryOption } from '@/lib/domain/library'
import { QuizOptionsField } from '@/components/topics/quiz-options-field'
import type { Difficulty, Kind } from '@/lib/domain/types'
import { attachMentalModelImage, createTopic, type SaveTopicResult } from '@/app/(app)/library/actions'
import { ImageField, type PickedImage } from '@/components/topics/image-field'
import { discardUploadedImage, uploadMentalModelImage } from '@/lib/data/mental-model-image'
import { saveTopicEdits } from '@/app/(app)/topic/[id]/actions'
import type { Topic } from '@/lib/domain/types'

const DIFFICULTIES = (['easy', 'medium', 'hard'] as const).map((value) => ({
  value,
  label: DIFFICULTY_LABEL[value],
}))

const KINDS = [
  { value: 'topic', label: 'Topic' },
  { value: 'quiz', label: 'Quiz' },
]

/**
 * One sheet, four modes — add/edit crossed with topic/quiz.
 *
 * Passing a `topic` puts it in edit mode; the type toggle at the top switches
 * between the two shapes. Forking a second sheet would mean two places to keep
 * the category suggestions, the tag rules and the difficulty control in step, and
 * they would not stay in step. The quiz mode swaps three fields and hides the
 * image; everything else is the same control in the same place.
 *
 * Switching the toggle keeps what you have typed. Definition and options are held
 * in separate state, so flipping to Quiz and back does not lose a half-written
 * definition — and a mistaken tap on the toggle is not destructive.
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

  const [kind, setKind] = useState<Kind>(topic?.kind ?? 'topic')
  const isQuiz = kind === 'quiz'

  const [title, setTitle] = useState(topic?.title ?? initialTitle)
  const [definition, setDefinition] = useState(topic?.definition ?? '')
  const [options, setOptions] = useState<string[]>(topic?.options ?? ['', ''])
  // -1 is "nothing marked yet". An existing quiz always has an answer; a new one
  // must be given one, rather than inheriting a default nobody chose.
  const [correct, setCorrect] = useState(topic?.correct_option ?? -1)
  const [mentalModel, setMentalModel] = useState(topic?.mental_model ?? '')
  /*
    ── The category follows the suggestion until you overrule it ──────────────
    `null` means "nobody has chosen"; the effective value is then whatever
    `suggestCategory` currently makes of the title and definition. Picking one
    from the select writes a real value here and the field stops moving.

    Deliberately NOT `useState(suggestCategory(initialTitle, ''))`. A one-shot
    initialiser would be a no-op: at mount the title and definition are empty, so
    the suggester has nothing to read and returns Uncategorized — which is the
    value we are trying to stop opening on. The suggestion only exists after you
    have typed, so the field has to be able to change its mind.

    An edit starts from the stored category, so nothing drifts under a topic that
    already has one.
  */
  const [chosenCategory, setChosenCategory] = useState<string | null>(topic?.category ?? null)
  const [tags, setTags] = useState<string[]>(topic?.tags ?? [])
  const isEdit = topic !== undefined
  const [difficulty, setDifficulty] = useState<Difficulty>(topic?.difficulty ?? 'medium')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const [picked, setPicked] = useState<PickedImage>(null)
  const [existingImage, setExistingImage] = useState(topic?.mental_model_image_path ?? null)
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [orphanNote, setOrphanNote] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  /*
    The Suggested group comes from the phase 2 keyword heuristic. No AI, no keys —
    it reads the title and definition the user has already typed.
  */
  const suggestion = useMemo(() => suggestCategory(title, definition), [title, definition])

  /*
    What the control shows and what a save sends. The app had this answer already
    — the select labelled it "Suggested from your topic" and put it first — and
    still opened on Uncategorized, so every save spent two actions choosing the
    option the app itself had nominated.
  */
  const category = chosenCategory ?? suggestion

  const categoryChoices = useMemo(() => {
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
  }, [categories, suggestion])

  const clear = () => {
    setTitle('')
    setDefinition('')
    setOptions(['', ''])
    setCorrect(-1)
    setMentalModel('')
    setChosenCategory(null)
    setTags([])
    setDifficulty('medium')
    setError(null)
    // The toggle is deliberately NOT reset: adding three quizzes in a row should
    // not mean setting it to Quiz three times.
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

      /*
        ── insert / update, THEN upload, THEN patch ────────────────────────────
        The object path needs the topic id, so the upload cannot happen until the
        row exists. From here on the topic is SAVED: nothing below may roll it
        back, and every failure reports the real reason instead.
      */
      const cleared = existingImage === null && picked === null && topic?.mental_model_image_path

      if (picked !== null) {
        setUploading(true)
        cancelledRef.current = false
        const uploaded = await uploadMentalModelImage(result.userId, result.id, picked.file)
        setUploading(false)

        if (cancelledRef.current) {
          // Cancelled while in flight. `upload()` takes no abort signal, so the
          // request could not be stopped — the object it created is removed
          // instead, which leaves nothing behind either way.
          if (uploaded.path) await discardUploadedImage(uploaded.path)
        } else if (uploaded.error !== null) {
          setImageError(uploaded.error)
          onSaved(result.title)
          return // The topic stays saved and the sheet stays open, showing why.
        } else {
          const attached = await attachMentalModelImage(result.id, uploaded.path)
          if (attached.error !== null) {
            setImageError(attached.error)
            onSaved(result.title)
            return
          }
          if (attached.orphanedPath !== null) {
            // Recorded rather than leaked silently.
            setOrphanNote('The previous file could not be removed from storage.')
          }
        }
      } else if (cleared) {
        const attached = await attachMentalModelImage(result.id, null)
        if (attached.error !== null) {
          setImageError(attached.error)
          onSaved(result.title)
          return
        }
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
      /*
        The title follows the toggle rather than reading a bare "Add", which is what
        the reference draws. DESIGN.md, "Copy rules": an action keeps its name
        through the whole flow — the sheet, the save button and the toast all say
        the same word, and "Add" next to a button reading "Save quiz" does not.
      */
      title={`${editing ? 'Edit' : 'Add'} ${isQuiz ? 'quiz' : 'topic'}`}
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
            {editing ? 'Save changes' : isQuiz ? 'Save quiz' : 'Save topic'}
          </Button>
          <span className="font-mono text-[11.5px] text-ink-3">
            {isQuiz ? (
              'Question, 2+ options, a marked answer and the why'
            ) : (
              <>
                <Kbd>⌘</Kbd> <Kbd>↵</Kbd> to save
              </>
            )}
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

        {/* The mode, and the only control whose position never changes. */}
        <input type="hidden" name="kind" value={kind} />
        <div className="mb-[18px]">
          <Segmented
            legend="Type"
            name="kind_toggle"
            options={KINDS}
            value={kind}
            onChange={(next) => setKind(next as Kind)}
          />
        </div>

        {isQuiz ? (
          /*
            A question is a sentence, not a name, so it gets a textarea where a
            topic gets a single line. The question IS the title — same column,
            same card heading — which is why there is no separate definition.
          */
          <div className="mb-[18px]">
            <label htmlFor="title" className="mb-1.5 block text-label font-medium text-ink">
              Question
            </label>
            <textarea
              id="title"
              name="title"
              required
              rows={2}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body leading-[1.5] text-ink outline-offset-[-1px] focus:border-accent focus:outline-2 focus:outline-accent"
            />
          </div>
        ) : (
          <Field
            label="Topic"
            name="title"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        )}

        {isQuiz ? (
          <QuizOptionsField
            options={options}
            correct={correct}
            onChange={(next) => {
              setOptions(next.options)
              setCorrect(next.correct)
            }}
          />
        ) : (
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
        )}

        <div className="mb-[18px]">
          {/*
            One field, two names. A quiz's Why and a topic's mental model do the
            same job — not what the answer is, but why — so they share the column,
            the register and the voice. Required for a quiz, because a question you
            get wrong that explains nothing teaches the answer rather than the idea;
            enforced by the form rather than by the column, which is shared.
          */}
          <label htmlFor="mental_model" className="mb-1.5 block text-label font-medium text-ink">
            {isQuiz ? 'Why' : 'Mental model'}
            <span className="ml-1.5 font-mono text-mono font-normal text-ink-3">
              {isQuiz ? 'shown after you answer' : 'how you think about it'}
            </span>
          </label>
          <textarea
            id="mental_model"
            name="mental_model"
            required={isQuiz}
            rows={3}
            value={mentalModel}
            onChange={(event) => setMentalModel(event.target.value)}
            className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body leading-[1.5] text-ink outline-offset-[-1px] focus:border-accent focus:outline-2 focus:outline-accent"
          />
        </div>

        {/*
          Difficulty is an EDIT-only control — issue #14. Nothing reads it when
          choosing what to practise, so asking at capture charged a decision at
          the moment that most needs to be cheap. A new topic takes the column
          default; you set difficulty later, once you have met the topic.

          The row collapses to one column when it is absent, so Category is not
          left sitting in half a grid.
        */}
        <div
          className={`mb-[18px] grid grid-cols-1 gap-3.5 ${isEdit ? 'md:grid-cols-2' : ''}`}
        >
          <div>
            <span className="mb-1.5 block text-label font-medium text-ink">Category</span>
            <input type="hidden" name="category" value={category} />
            <Select
              label="Category"
              options={categoryChoices}
              value={category}
              unsetValue={UNCATEGORIZED}
              onChange={setChosenCategory}
              filterable
            />
          </div>

          {isEdit ? (
            <Segmented
              legend="Difficulty"
              name="difficulty"
              options={DIFFICULTIES}
              value={difficulty}
              onChange={setDifficulty}
            />
          ) : null}
        </div>

        <TagsInput label="Tags" hint="optional" tags={tags} onChange={setTags} />
        {tags.map((tag) => (
          <input key={tag} type="hidden" name="tags" value={tag} />
        ))}

        {imageError ? (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-md border border-flag bg-flag-soft px-4 py-3.5 text-option text-flag"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true" className="mt-0.5 shrink-0">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v6" />
              <path d="M12 16.5v.5" />
            </svg>
            <div>
              <div className="font-medium">The topic saved. The image didn&rsquo;t.</div>
              <div className="mt-0.5 text-ink-2">{imageError}</div>
            </div>
          </div>
        ) : null}

        {orphanNote ? (
          <p role="status" className="mb-4 font-mono text-[11.5px] text-ink-3">
            {orphanNote}
          </p>
        ) : null}

        {/*
          No image field on a quiz — "a quiz that needs a diagram is a topic". The
          database refuses one too, so this is the same rule said twice rather than
          a UI convention holding it up alone.
        */}
        {isQuiz ? null : (
        <ImageField
          picked={picked}
          existingName={existingImage === null ? null : (existingImage.split('/').pop() ?? null)}
          onPick={(file) => {
            setImageError(null)
            setPicked({ file, previewUrl: URL.createObjectURL(file) })
          }}
          onClear={() => {
            setPicked(null)
            setExistingImage(null)
            setImageError(null)
          }}
          uploading={uploading}
          onCancel={() => {
            cancelledRef.current = true
            setPicked(null)
          }}
          error={imageError}
        />
        )}
      </form>
    </Sheet>
  )
}
