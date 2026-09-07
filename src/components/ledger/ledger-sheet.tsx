'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { createItem } from '@/app/(app)/ledger/actions'
import { KINDS, KIND_LABEL, statusChoices, type Kind } from '@/lib/domain/ledger'

/**
 * One small form. Everything except the title and the kind is optional, because a
 * decision you have made but not written up yet is still a decision.
 *
 * There is no date field: the item is stamped when you add it. Back-dating a
 * decision you made last week is the kind of tidying that turns a record into a
 * story.
 */
export function LedgerSheet({
  capabilityOptions,
  onClose,
}: {
  capabilityOptions: { phase: string; options: { id: string; name: string }[] }[]
  onClose: () => void
}) {
  const router = useRouter()
  const [kind, setKind] = useState<Kind>('adr')
  const [title, setTitle] = useState('')
  const [link, setLink] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('open')
  const [capability, setCapability] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()

  const submit = (formData: FormData) => {
    setError(null)
    startSaving(async () => {
      const result = await createItem(formData)
      if (result.error !== null) {
        setError(result.error)
        return
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add an item"
      footer={
        <>
          <Button type="submit" form="ledger" variant="primary" size="lg" loading={isSaving} loadingLabel="Saving…">
            Save item
          </Button>
          <span className="font-mono text-[11.5px] text-ink-3">A kind and a title are enough</span>
        </>
      }
    >
      <form id="ledger" action={submit}>
        {error ? (
          <p role="alert" className="mb-[18px] rounded-md border border-flag bg-flag-soft px-4 py-3 text-meta text-flag">
            {error}
          </p>
        ) : null}

        <fieldset className="mb-[18px]">
          <legend className="mb-1.5 text-label font-medium text-ink">Kind</legend>
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
                className={`cursor-pointer rounded-full border px-2.5 py-1 font-mono text-[11px] ${
                  kind === option
                    ? 'border-ink bg-ink text-surface'
                    : 'border-rule text-ink-3 hover:border-rule-strong hover:text-ink'
                }`}
              >
                {KIND_LABEL[option]}
              </button>
            ))}
          </div>
          <input type="hidden" name="kind" value={kind} />
        </fieldset>

        <Field label="Title" name="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <Field
          label="Link"
          name="link"
          hint="optional · where the thing actually lives"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />

        {/*
          The status words change with the kind — an ADR is Decided, a task is
          Done, an incident is Closed. One stored enum, six vocabularies, and the
          mapping lives in the domain so this and the row cannot disagree.
        */}
        <fieldset className="mb-[18px]">
          <legend className="mb-1.5 text-label font-medium text-ink">Status</legend>
          <div className="flex flex-wrap gap-1.5">
            {statusChoices(kind).map((choice) => (
              <button
                key={choice.status}
                type="button"
                aria-pressed={status === choice.status}
                onClick={() => setStatus(choice.status)}
                className={`cursor-pointer rounded-full border px-2.5 py-1 font-mono text-[11px] ${
                  status === choice.status
                    ? 'border-ink bg-ink text-surface'
                    : 'border-rule text-ink-3 hover:border-rule-strong hover:text-ink'
                }`}
              >
                {choice.label}
              </button>
            ))}
          </div>
          <input type="hidden" name="status" value={status} />
        </fieldset>

        {capabilityOptions.length > 0 ? (
          <div className="mb-[18px]">
            <label htmlFor="capability_id" className="mb-1.5 block text-label font-medium text-ink">
              Serves
              <span className="ml-1.5 font-mono text-mono font-normal text-ink-3">
                optional · a capability
              </span>
            </label>
            <select
              id="capability_id"
              name="capability_id"
              value={capability}
              onChange={(event) => setCapability(event.target.value)}
              className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body text-ink outline-offset-[-1px] focus:border-accent focus:outline-2 focus:outline-accent"
            >
              <option value="">No capability</option>
              {capabilityOptions.map((group) => (
                <optgroup key={group.phase} label={group.phase}>
                  {group.options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        ) : null}

        <div className="mb-[18px]">
          <label htmlFor="note" className="mb-1.5 block text-label font-medium text-ink">
            Note
            <span className="ml-1.5 font-mono text-mono font-normal text-ink-3">
              optional · one line, for future you
            </span>
          </label>
          <textarea
            id="note"
            name="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this, in a sentence…"
            className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-body leading-[1.6] text-ink outline-offset-[-1px] focus:border-accent focus:outline-2 focus:outline-accent"
          />
        </div>

        <p className="font-mono text-[11px] text-ink-3">
          No ADR body, alternatives or consequences — those live at the link, in a file you can
          diff. The item is stamped when you add it.
        </p>
      </form>
    </Sheet>
  )
}
