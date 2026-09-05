/**
 * Whether a keystroke belongs to a field rather than to a shortcut.
 *
 * Shared by the practice keys and the global ones. Two handlers deciding this
 * separately is how one of them ends up grading a card while someone types the
 * word "three" into the recall box.
 */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}
