/**
 * Small shared utility for the two independent bare-key shortcuts (Settings.
 * inspectorHotkey / holdHotkey) — comparison/normalization logic used by both the
 * popup (conflict prevention while recording a key) and the content script (matching
 * a live KeyboardEvent), so the two never drift out of sync on what "the same key"
 * means (Ctrl/Control aliasing, case).
 */

/** Canonical form for comparison: aliases the recorder's "Ctrl" label to the real KeyboardEvent.key value "Control", uppercased. null (disabled) stays null. */
export function normalizeBareKey(key: string | null): string | null {
  if (key === null) return null;
  return (key === "Ctrl" ? "Control" : key).toUpperCase();
}

/** True when two configured bare-key hotkeys would fire on the exact same keypress. A disabled slot (null) never conflicts with anything. */
export function bareKeysConflict(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  return normalizeBareKey(a) === normalizeBareKey(b);
}

/**
 * A small fixed pool tried, in order, when a shortcut is re-enabled and needs a safe
 * key to start from. Only reached if `preferred` (the setting's own default) happens
 * to collide with the OTHER shortcut's current key — normally never, since recording
 * a key already goes through `bareKeysConflict` and rejects collisions at that point.
 */
const FALLBACK_POOL = ["Alt", "Shift", "Control"];

/** Picks `preferred` unless it conflicts with `other`, in which case falls back to the first non-conflicting candidate in `FALLBACK_POOL`. Always returns a usable key. */
export function pickAvailableBareKey(preferred: string, other: string | null): string {
  if (!bareKeysConflict(preferred, other)) return preferred;
  return FALLBACK_POOL.find((k) => !bareKeysConflict(k, other)) ?? preferred;
}
