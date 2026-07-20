/**
 * Normalizes text so that reverse-index lookups are consistent between what
 * gets indexed (metadata values) and what's detected in the DOM (which can
 * carry line breaks, double spaces, etc.)
 */
export function normalizeText(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Second, looser pass — only used if the exact-match lookup finds nothing. */
export function normalizeTextLoose(raw: string): string {
  return normalizeText(raw).toLowerCase();
}
