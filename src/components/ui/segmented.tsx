/*
  Native radios, visually segmented. Using real radios means arrow-key navigation,
  grouping and announcement come from the platform — there is no custom
  interaction model here, and so nothing for a component test to pin down.
*/
export function Segmented<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string
  name: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-label font-medium text-ink">{legend}</legend>
      <div className="inline-flex overflow-hidden rounded-md border border-rule-strong">
        {options.map((option, index) => (
          <label
            key={option.value}
            className={`cursor-pointer px-3.5 py-2 text-label ${
              index > 0 ? 'border-l border-rule-strong' : ''
            } ${
              value === option.value
                ? 'bg-accent-soft font-medium text-accent-ink'
                : 'bg-surface text-ink-2 hover:bg-surface-2'
            } has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-accent`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
