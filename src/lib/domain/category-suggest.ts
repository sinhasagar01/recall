import { normaliseText } from '@/lib/domain/search-filter'

export const UNCATEGORIZED = 'Uncategorized'

/**
 * The vocabulary design-reference.html uses in its category selects. `category`
 * is free text in the schema, so this is what the heuristic can *suggest*, not
 * a set the user is confined to.
 */
export const SUGGESTABLE_CATEGORIES = [
  'React',
  'Next.js',
  'TypeScript',
  'JavaScript',
  'CSS',
  'Browser',
  'Web performance',
  'Frontend architecture',
] as const

export type SuggestableCategory = (typeof SUGGESTABLE_CATEGORIES)[number]

/** Keyed by the category list above, so the two cannot drift apart. */
const KEYWORDS: Record<SuggestableCategory, string[]> = {
  React: ['react', 'jsx', 'hooks', 'reconciliation', 'server component', 'hydration', 'usestate', 'useeffect', 'virtual dom'],
  'Next.js': ['next.js', 'nextjs', 'app router', 'pages router', 'server action', 'route handler'],
  TypeScript: ['typescript', 'discriminated union', 'type narrowing', 'generic', 'tsconfig', 'satisfies'],
  JavaScript: ['javascript', 'event loop', 'microtask', 'closure', 'promise', 'prototype', 'iterator'],
  CSS: ['css', 'flexbox', 'grid', 'specificity', 'cascade', 'selector', 'stacking context', 'media query'],
  Browser: ['browser', 'cors', 'preflight', 'dom', 'cookie', 'service worker', 'same-origin'],
  'Web performance': ['core web vitals', 'lighthouse', 'bundle size', 'inp', 'lcp', 'cls', 'fid', 'tti'],
  'Frontend architecture': ['architecture', 'frontend architecture', 'state management', 'monorepo', 'design system', 'module boundary'],
}

/** A title says more about a topic than its definition does. */
const TITLE_WEIGHT = 3
const DEFINITION_WEIGHT = 1

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Whole-word matching, with an optional plural. Substring matching would let
 * short acronyms like "inp" fire inside words like "input".
 */
const patternFor = (keyword: string) =>
  new RegExp(`\\b${escapeRegExp(keyword)}${keyword.endsWith('s') ? '' : 's?'}\\b`)

function score(text: string, keywords: string[]): number {
  return keywords.reduce((hits, keyword) => hits + (patternFor(keyword).test(text) ? 1 : 0), 0)
}

/**
 * A keyword heuristic over the title and definition. No AI, no network, no keys.
 *
 * Ties break by the order of SUGGESTABLE_CATEGORIES, so the same input always
 * gives the same answer.
 */
export function suggestCategory(title: string, definition: string): SuggestableCategory | typeof UNCATEGORIZED {
  const normalisedTitle = normaliseText(title)
  const normalisedDefinition = normaliseText(definition)

  let best: SuggestableCategory | null = null
  let bestScore = 0

  for (const category of SUGGESTABLE_CATEGORIES) {
    const keywords = KEYWORDS[category]
    const total =
      score(normalisedTitle, keywords) * TITLE_WEIGHT +
      score(normalisedDefinition, keywords) * DEFINITION_WEIGHT

    if (total > bestScore) {
      best = category
      bestScore = total
    }
  }

  return best ?? UNCATEGORIZED
}
