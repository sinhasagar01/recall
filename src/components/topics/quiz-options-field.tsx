'use client'

/**
 * The options editor. Two or more, exactly one marked.
 *
 * A real `<input type="radio">` group rather than styled buttons, so the "exactly
 * one answer" rule is the browser's rule and not something this component has to
 * enforce. It also means arrow keys move the answer between options for free,
 * which is what a person expects of a radio group and what a row of buttons would
 * silently not do.
 *
 * A new quiz starts with **nothing marked** (`correct` is -1). Pre-checking the
 * first option would mean a distracted save silently records the wrong answer, and
 * the quiz would then look completely normal until it marked you wrong for being
 * right. The radios carry `required`, so the browser refuses the submit and points
 * at the control rather than costing a round trip; the same rule is enforced again
 * in `parseTopicForm`, because an action is reachable without a form.
 *
 * There is always one empty row at the end — the reference's "Add another
 * option…" — so adding a third option is typing rather than finding a button
 * first. Empty rows are dropped on submit, so the trailing one costs nothing.
 */
export function QuizOptionsField({
  options,
  correct,
  onChange,
}: {
  options: string[]
  correct: number
  onChange: (next: { options: string[]; correct: number }) => void
}) {
  // The trailing blank is presentational: the caller holds only real options.
  const rows = [...options, '']

  const setAt = (index: number, value: string) => {
    // Assigning at `options.length` extends the array, which is how typing into
    // the trailing blank makes it a real option. Nothing extra is appended — an
    // earlier version also pushed, and every option arrived twice.
    const next = [...options]
    next[index] = value

    onChange({ options: next, correct })
  }

  const removeAt = (index: number) => {
    const next = options.filter((_, position) => position !== index)

    /*
      The marked answer follows its option rather than its index. Removing the
      row above the answer would otherwise silently move the answer to whatever
      took its place — a quiz that saves with the wrong answer and looks fine.
    */
    const nextCorrect =
      index === correct ? -1 : index < correct ? correct - 1 : correct

    onChange({ options: next, correct: nextCorrect })
  }

  return (
    <div className="mb-[18px]">
      <span className="mb-1.5 block text-label font-medium text-ink">
        Options
        <span className="ml-1.5 font-mono text-mono font-normal text-ink-3">
          pick the circle beside the right one
        </span>
      </span>

      {rows.map((value, index) => {
        const isBlank = index === options.length

        return (
          <div key={index} className="mb-2 flex items-center gap-2.5">
            <input
              type="radio"
              name="correct_option"
              value={index}
              required
              checked={!isBlank && index === correct}
              // The blank row has nothing to be the answer to yet.
              disabled={isBlank}
              onChange={() => onChange({ options, correct: index })}
              aria-label={`Option ${index + 1} is the answer`}
              className="size-[17px] shrink-0 accent-accent disabled:opacity-35"
            />

            <input
              type="text"
              /*
                The trailing blank is unnamed, so it never submits. That keeps the
                submitted `options` list exactly as long as the state the radio's
                value indexes into — a blank that submitted would shift every
                index after it and mark the wrong answer.
              */
              name={isBlank ? undefined : 'options'}
              value={value}
              placeholder={isBlank ? 'Add another option…' : undefined}
              aria-label={isBlank ? 'Add another option' : `Option ${index + 1}`}
              onChange={(event) => setAt(index, event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-rule-strong bg-surface px-3 py-2 text-body text-ink outline-offset-[-1px] placeholder:text-ink-3 focus:border-accent focus:outline-2 focus:outline-accent"
            />

            {/*
              No remove button on the blank row, and none at all while only two
              real options remain — two is the floor, and a control that exists
              only to be refused is worse than one that is not there.
            */}
            {!isBlank && options.length > 2 ? (
              <button
                type="button"
                onClick={() => removeAt(index)}
                aria-label={`Remove option ${index + 1}`}
                className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-[17px] leading-none text-ink-3 hover:bg-surface-2 hover:text-flag"
              >
                ×
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
