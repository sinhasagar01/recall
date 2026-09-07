/**
 * Count and noun, agreeing.
 *
 * One place rather than a ternary at each call site, because the ternary is easy
 * to write and easy to forget: "1 topics" shipped to production on the sources
 * screen for exactly that reason.
 *
 * Irregular plurals are passed explicitly (`entry` / `entries`); the regular case
 * appends an `s`. It does not try to know English — a helper that guesses would
 * be wrong on the first word that matters.
 */
export function plural(count: number, one: string, many?: string): string {
  return `${count} ${count === 1 ? one : (many ?? `${one}s`)}`
}
