import { normalizeText } from "./normalize";
import { BASE_LANGUAGE, isInSimpleScope, type DuplicateClusterReport, type LabelEntry, type LabelType } from "./types";

/** Stable identity for an element: apiName + type. `|` can appear in neither a Salesforce apiName nor a `LabelType`, so it never collides. */
function identityKey(apiName: string, type: LabelType): string {
  return `${apiName}|${type}`;
}

/**
 * Finds, per language, the translated values shared by two or more DISTINCT elements — a
 * copy-paste QA smell surfaced in Translation Health (ROADMAP.md PHASE 10, `DECISIONS.md
 * #64`). Pure and dependency-free (no chrome, no network) so it is fully unit-testable,
 * unlike `computeTranslationHealth` which lives inside the chrome-bound background.
 *
 * Deliberate rules, each mirroring an existing health signal for consistency (`#58`):
 * - **Base language excluded.** Two objects both labelled "Name" in English is normal,
 *   not a translation defect — same `lang !== BASE_LANGUAGE` guard the identical-to-source
 *   check uses.
 * - **Whitespace-normalized, case-SENSITIVE grouping** (`normalizeText`). Consistent with
 *   the reverse index; strict on case to bias toward under-claiming (zero-false-positives).
 * - **Empty/missing values excluded** — an absent translation is "Missing", not a duplicate.
 * - **Identity is `apiName + type`**, so a field and a picklist that coincidentally share
 *   an apiName aren't merged, and a cluster needs 2+ genuinely distinct elements.
 * - **Simple Mode scopes it** at the same choke point as everything else (`#56`).
 */
export function computeDuplicateClusters(
  entries: LabelEntry[],
  languages: string[],
  simpleMode: boolean,
): DuplicateClusterReport {
  const scoped = simpleMode ? entries.filter((entry) => isInSimpleScope(entry.type)) : entries;
  const report: DuplicateClusterReport = {};

  for (const lang of languages) {
    if (lang === BASE_LANGUAGE) continue;

    // Normalized value -> the distinct elements carrying it (keyed by apiName+type identity).
    const byValue = new Map<string, Map<string, { apiName: string; type: LabelType }>>();
    for (const entry of scoped) {
      const raw = entry.valuesByLang[lang];
      if (!raw) continue;
      const value = normalizeText(raw);
      if (!value) continue;
      let members = byValue.get(value);
      if (!members) {
        members = new Map();
        byValue.set(value, members);
      }
      members.set(identityKey(entry.apiName, entry.type), { apiName: entry.apiName, type: entry.type });
    }

    const clusters = [...byValue.entries()]
      .filter(([, members]) => members.size >= 2)
      .map(([value, members]) => ({ value, members: [...members.values()] }))
      // Most-shared clusters first, then alphabetical — stable and useful for scanning.
      .sort((a, b) => b.members.length - a.members.length || a.value.localeCompare(b.value));

    if (clusters.length > 0) report[lang] = clusters;
  }

  return report;
}
