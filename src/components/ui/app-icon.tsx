import type { ReactNode, SVGProps } from 'react'

export type AppIconName =
  | 'brain'
  | 'chart'
  | 'home'
  | 'layers'
  | 'library'
  | 'settings'
  | 'sparkles'
  | 'target'
  | 'today'
  | 'weak'

const PATHS: Record<AppIconName, ReactNode> = {
  home: <path d="M3.5 10.5 12 3l8.5 7.5v9.25a1.25 1.25 0 0 1-1.25 1.25h-14A1.25 1.25 0 0 1 4 19.75V10.5Zm5 10.5v-6h7v6" />,
  library: <path d="M4 4.5h6.5v15H4v-15Zm9.5 0H20v15h-6.5v-15Z" />,
  brain: <path d="M9.25 4.5A3.25 3.25 0 0 0 3 5.75 3.25 3.25 0 0 0 4.5 12 3.25 3.25 0 0 0 8 17.5c.44 1.77 1.7 2.5 4 2.5m2.75-15.5A3.25 3.25 0 0 1 21 5.75 3.25 3.25 0 0 1 19.5 12a3.25 3.25 0 0 1-3.5 5.5c-.44 1.77-1.7 2.5-4 2.5M12 4v16M8 8.5h4m4 0h-4m-4 5h4m4 0h-4" />,
  sparkles: <path d="m12 3 1.15 4.35L17.5 8.5l-4.35 1.15L12 14l-1.15-4.35L6.5 8.5l4.35-1.15L12 3Zm6.25 10.75.7 2.55 2.55.7-2.55.7-.7 2.55-.7-2.55-2.55-.7 2.55-.7.7-2.55ZM5.75 14.5l.6 2.15 2.15.6-2.15.6-.6 2.15-.6-2.15-2.15-.6 2.15-.6.6-2.15Z" />,
  layers: <path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Zm-8.5 9L12 16.5l8.5-4.5M3.5 16.5 12 21l8.5-4.5" />,
  weak: <path d="M12 3a8.5 8.5 0 1 0 8.5 8.5M12 7v5l3 2" />,
  today: <path d="M6 3v3m12-3v3M4.5 9h15M5.75 5h12.5c.69 0 1.25.56 1.25 1.25v12.5c0 .69-.56 1.25-1.25 1.25H5.75c-.69 0-1.25-.56-1.25-1.25V6.25C4.5 5.56 5.06 5 5.75 5Zm2.75 8h3m2 0h2" />,
  target: <path d="M20.5 12A8.5 8.5 0 1 1 12 3.5a8.5 8.5 0 0 1 8.5 8.5ZM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0 3.5h.01" />,
  chart: <path d="M4 20V4m0 16h16M8 16v-4m4 4V7m4 9v-6" />,
  settings: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5 1.05 2.16 2.38.35.6 2.33 2.12 1.15-1.15 2.12 1.15 2.12-2.12 1.15-.6 2.33-2.38.35L12 21l-1.05-2.16-2.38-.35-.6-2.33-2.12-1.15 1.15-2.12-1.15-2.12 2.12-1.15.6-2.33 2.38-.35L12 3Z" />,
}

export function AppIcon({ name, className = '', ...props }: { name: AppIconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...props}>
      {PATHS[name]}
    </svg>
  )
}
