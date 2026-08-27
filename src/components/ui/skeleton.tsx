/*
  Skeletons must match real card geometry so nothing shifts when data lands.
  The pulse is `--animate-skeleton`; the reduced-motion rule in globals.css
  collapses it, and its keyframes end at opacity 1, so a user who never sees the
  animation still sees a fully drawn skeleton rather than a half-faded one.
*/
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-skeleton rounded-sm bg-surface-3 ${className}`} />
}
