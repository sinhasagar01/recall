import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), '.next', 'static')
const MAX_CHUNK_BYTES = 180 * 1024
const MAX_TOTAL_BYTES = 700 * 1024

function files(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })
}

const chunks = files(ROOT)
  .filter((path) => path.endsWith('.js'))
  .map((path) => ({ path, bytes: gzipSync(readFileSync(path)).byteLength }))

const oversized = chunks.filter((chunk) => chunk.bytes > MAX_CHUNK_BYTES)
const total = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0)

if (oversized.length > 0 || total > MAX_TOTAL_BYTES) {
  const detail = oversized.map((chunk) => `${chunk.path}: ${chunk.bytes} bytes gzip`).join('\n')
  throw new Error(`Browser bundle budget exceeded (${total}/${MAX_TOTAL_BYTES} bytes gzip).\n${detail}`)
}

console.log(`Bundle budget passed: ${chunks.length} chunks, ${total} bytes gzip.`)
