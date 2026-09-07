import { describe, expect, it } from 'vitest'
import {
  KINDS,
  STATUSES,
  deleteItemCopy,
  kindChips,
  ledgerSummary,
  statusChoices,
  statusLabel,
  type Kind,
  type ProjectItem,
} from '@/lib/domain/ledger'

const item = (over: Partial<ProjectItem> = {}): ProjectItem => ({
  id: 'i1',
  user_id: 'u1',
  kind: 'adr',
  title: 'Modular monolith over microfrontends',
  link: 'https://example.com/adr-001.md',
  note: null,
  status: 'open',
  capability_id: null,
  created_at: '2026-09-04T10:00:00.000Z',
  updated_at: '2026-09-04T10:00:00.000Z',
  ...over,
})

describe('one stored enum, six vocabularies', () => {
  /*
    The whole table, so a kind cannot be added without deciding what its three
    words are — and so a copy-paste that leaves a task saying "Decided" fails.
  */
  it('renders every kind in its own words', () => {
    expect(statusLabel('adr', 'open')).toBe('Draft')
    expect(statusLabel('adr', 'settled')).toBe('Decided')
    expect(statusLabel('adr', 'retired')).toBe('Superseded')

    expect(statusLabel('task', 'open')).toBe('Open')
    expect(statusLabel('task', 'settled')).toBe('Done')
    expect(statusLabel('task', 'retired')).toBe('Dropped')

    expect(statusLabel('diagram', 'open')).toBe('Draft')
    expect(statusLabel('diagram', 'settled')).toBe('Done')
    expect(statusLabel('diagram', 'retired')).toBe('Superseded')

    expect(statusLabel('incident', 'open')).toBe('Open')
    expect(statusLabel('incident', 'settled')).toBe('Closed')
    expect(statusLabel('incident', 'retired')).toBe('Dropped')

    expect(statusLabel('milestone', 'open')).toBe('Planned')
    expect(statusLabel('milestone', 'settled')).toBe('Reached')
    expect(statusLabel('milestone', 'retired')).toBe('Dropped')

    expect(statusLabel('scale_exercise', 'open')).toBe('Open')
    expect(statusLabel('scale_exercise', 'settled')).toBe('Done')
    expect(statusLabel('scale_exercise', 'retired')).toBe('Dropped')
  })

  it('has a word for every kind and status, with none left blank', () => {
    // Guard the guard: a kind added to KINDS with no vocabulary entry would
    // otherwise render `undefined` in the UI and pass the cases above.
    for (const kind of KINDS) {
      for (const status of STATUSES) {
        const label = statusLabel(kind, status)
        expect(label, `${kind}/${status}`).toBeTruthy()
        expect(label, `${kind}/${status}`).not.toBe('undefined')
      }
    }
  })

  it('never tells you that you are late', () => {
    /*
      A milestone's retired state is "Dropped", not "Missed" or "Overdue". A
      missed milestone is the product working out that you are behind — the thing
      the free-text "When" rule on a phase exists to refuse.
    */
    const every = KINDS.flatMap((kind) => STATUSES.map((status) => statusLabel(kind, status)))
    for (const word of ['Missed', 'Overdue', 'Late', 'Behind', 'Failed']) {
      expect(every).not.toContain(word)
    }
  })

  it('offers the three choices in the kind\'s words', () => {
    expect(statusChoices('incident').map((c) => c.label)).toEqual(['Open', 'Closed', 'Dropped'])
    expect(statusChoices('milestone').map((c) => c.label)).toEqual([
      'Planned',
      'Reached',
      'Dropped',
    ])
  })
})

describe('what the delete confirmation says', () => {
  it('names what is NOT deleted, in the kind\'s own noun', () => {
    expect(deleteItemCopy('adr', true)).toBe(
      'This removes the ledger entry. Nothing at the link is touched — the ADR stays where you wrote it. It can’t be undone.',
    )
    expect(deleteItemCopy('incident', true)).toContain('the issue stays where you filed it')
    expect(deleteItemCopy('diagram', true)).toContain('the diagram stays where you drew it')
  })

  it('makes no promise about a link that does not exist', () => {
    // "Nothing at the link is touched" is a reassurance about something absent.
    const copy = deleteItemCopy('task', false)

    expect(copy).toBe('This removes the ledger entry. It can’t be undone.')
    expect(copy).not.toContain('link')
  })
})

describe('the list summary and chips', () => {
  it('counts items and open ones, agreeing with itself', () => {
    expect(ledgerSummary([])).toBe('0 items · 0 open · newest first')
    expect(ledgerSummary([{ status: 'open' }])).toBe('1 item · 1 open · newest first')
    expect(ledgerSummary([{ status: 'open' }, { status: 'settled' }])).toBe(
      '2 items · 1 open · newest first',
    )
  })

  it('derives chips from the kinds actually present, never a dead zero', () => {
    const chips = kindChips([item({ kind: 'adr' }), item({ kind: 'adr' }), item({ kind: 'task' })])

    expect(chips.map((c) => [c.label, c.count])).toEqual([
      ['ADR', 2],
      ['Task', 1],
    ])
    expect(chips.map((c) => c.kind)).not.toContain('scale_exercise')
  })

  it('shows a Scale exercise chip once one exists', () => {
    const chips = kindChips([item({ kind: 'scale_exercise' as Kind })])
    expect(chips.map((c) => c.label)).toEqual(['Scale exercise'])
  })
})
