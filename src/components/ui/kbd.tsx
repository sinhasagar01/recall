/**
 * A keycap. Used in Select's footer, the rail's keyboard hints, and anywhere a
 * shortcut is named in the UI.
 *
 * The heavier bottom border on a small radius is the keycap idiom — it is what
 * makes this read as a physical key rather than a chip. Taken from
 * design-reference.html's `.kbd`.
 */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-sm border border-b-2 border-rule bg-surface px-[5px] py-px font-mono text-mono text-ink-3">
      {children}
    </kbd>
  )
}
