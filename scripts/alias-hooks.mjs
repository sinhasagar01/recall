/**
 * Teaches Node the `@/` path alias that tsconfig.json defines.
 *
 * Node resolves `.mts` files directly, but it knows nothing about TypeScript path
 * aliases, so a script importing a domain module fails the moment that module
 * imports another one as `@/lib/...`. Vitest gets this from vite-tsconfig-paths;
 * scripts run outside Vitest need it too.
 *
 * A resolve hook rather than a build step: the point of running these scripts with
 * plain `node` is that there is nothing to build.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve as resolvePath } from 'node:path'

const SRC = resolvePath(dirname(fileURLToPath(import.meta.url)), '..', 'src')

// TypeScript imports are extensionless; Node requires the extension.
const CANDIDATES = ['.ts', '.tsx', '/index.ts', '']

export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context)

  const base = resolvePath(SRC, specifier.slice(2))

  for (const suffix of CANDIDATES) {
    const candidate = base + suffix
    if (existsSync(candidate)) {
      return nextResolve(pathToFileURL(candidate).href, context)
    }
  }

  return nextResolve(pathToFileURL(base).href, context)
}
