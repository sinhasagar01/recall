// Installs the `@/` resolve hook. Split from alias-hooks.mjs because register()
// must run in the main thread while the hooks themselves load in a worker.
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./alias-hooks.mjs', pathToFileURL(import.meta.filename))
