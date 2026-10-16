import { NextResponse } from 'next/server'

const METRICS = new Set(['CLS', 'FCP', 'INP', 'LCP', 'TTFB'])

/**
 * Deliberately logs only metric aggregates. No URL, identity, or user content
 * leaves the browser, keeping private learning data out of telemetry.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  if (
    body === null ||
    typeof body !== 'object' ||
    !('name' in body) ||
    !('value' in body) ||
    typeof body.name !== 'string' ||
    typeof body.value !== 'number' ||
    !METRICS.has(body.name)
  ) {
    return NextResponse.json({ error: 'Invalid metric' }, { status: 400 })
  }

  console.info('web-vital', { name: body.name, value: Math.round(body.value) })
  return new NextResponse(null, { status: 204 })
}
