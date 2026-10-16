'use client'

import { useReportWebVitals } from 'next/web-vitals'

/** Sends anonymous real-user performance measurements to the deployment logs. */
export function WebVitals() {
  useReportWebVitals((metric) => {
    void fetch('/api/web-vitals', {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: metric.name, value: metric.value, rating: metric.rating }),
    })
  })

  return null
}
