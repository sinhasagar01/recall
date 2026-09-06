/*
  The two registers. Definition and mental model must never look like two
  paragraphs of the same thing — this separation IS the product, and it appears
  identically on topic detail and on practice reveal.

  Definition: sans, 15.5px, --ink, max 66ch, no container.
  Mental model: --accent-soft panel, 2px --accent left rule, serif 17.5px,
  --accent-ink, mono eyebrow in --accent.
*/
/**
 * The eyebrow-plus-body block every section on the detail page uses. Definition
 * and MentalModel are the two that carry the product; Visual and Recall history
 * borrow the same frame so the page reads as one thing.
 */
export function RegisterSection({
  title,
  tone = 'muted',
  children,
}: {
  title: string
  tone?: 'muted' | 'accent'
  children: React.ReactNode
}) {
  return (
    <section className="mb-[30px]">
      <span
        className={`font-mono text-mono font-medium tracking-[0.16em] uppercase ${
          tone === 'accent' ? 'text-accent' : 'text-ink-3'
        }`}
      >
        {title}
      </span>
      {children}
    </section>
  )
}

/*
  These two are imported by BOTH the topic detail page and (phase 8) the practice
  reveal. That is deliberate: the separation between the registers is the product,
  and the way it fails is by drifting between the two screens. One definition,
  two callers.
*/
export function Definition({ children }: { children: React.ReactNode }) {
  return (
    <RegisterSection title="Definition">
      <p className="mt-2.5 max-w-[66ch] text-register leading-[1.72] text-ink">{children}</p>
    </RegisterSection>
  )
}

/**
 * The indigo register — one field, one voice, both shapes.
 *
 * `label` exists because a quiz's `mental_model` is captured as **Why**, and an
 * eyebrow reading "Mental model" over a quiz explanation would name a field the
 * person never filled in. `null` drops the eyebrow entirely, which is what the
 * quiz reference draws on the practice screen: there the explanation sits
 * directly under the marked options and a heading would only separate them.
 *
 * The panel itself never changes. That is the point of sharing the field.
 */
export function MentalModel({
  children,
  label = 'Mental model',
}: {
  children: React.ReactNode
  label?: string | null
}) {
  const panel = (
    <p className="max-w-[66ch] rounded-r-md border-l-2 border-accent bg-accent-soft px-5 py-4 font-display text-model leading-[1.68] text-accent-ink">
      {children}
    </p>
  )

  if (label === null) return <div className="mt-[18px] mb-[26px]">{panel}</div>

  return (
    <RegisterSection title={label} tone="accent">
      <div className="mt-2.5">{panel}</div>
    </RegisterSection>
  )
}
