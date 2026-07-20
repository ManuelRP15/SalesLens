import type { ContextHints, LabelEntry } from "./types";
import { normalizeText, normalizeTextLoose } from "./normalize";

export type ReverseIndex = Map<string, LabelEntry[]>;

export function buildReverseIndex(entries: LabelEntry[]): ReverseIndex {
  const index: ReverseIndex = new Map();

  for (const entry of entries) {
    const seenKeysForEntry = new Set<string>();
    for (const value of Object.values(entry.valuesByLang)) {
      const key = normalizeText(value);
      if (!key || seenKeysForEntry.has(key)) continue;
      seenKeysForEntry.add(key);
      const bucket = index.get(key);
      if (bucket) bucket.push(entry);
      else index.set(key, [entry]);
    }
  }

  return index;
}

export interface ResolveResult {
  /** Always 0 or 1 entries — this project never surfaces a "N possible origins" list, see resolveText below. */
  candidates: LabelEntry[];
  /** True only when a signal (unique index match, tag-type hint, or DOM hint) actually confirmed the answer, as opposed to a best-effort tie-break pick. */
  highConfidence: boolean;
}

const TYPE_PRIORITY: Record<LabelEntry["type"], number> = {
  CustomLabel: 0,
  FieldLabel:  1,
  ObjectLabel: 2,
  RecordType:  3,
  WebLink:     4,
  StandardButton: 5,
  QuickAction: 6,
  LayoutSection: 7,
  RelatedList: 8,
  StandardTab: 9,
  CustomTab:   10,
  CustomApplication: 11,
  PicklistValue: 12,
};

/**
 * Which metadata types can legitimately render on each UI surface. When the
 * hovered element sits on one of these surfaces and NO candidate fits the
 * allowed set, the correct answer is silence — the element is standard
 * Salesforce chrome (a stock "New"/"Edit" button, a "Details"/"Related" tab,
 * plain record data...) whose translations are not extractable through any
 * supported API, so showing anything would be a guess (lesson #31).
 */
const SURFACE_ALLOWED_TYPES: Record<
  "button" | "navTab" | "innerTab" | "section" | "relatedList",
  LabelEntry["type"][]
> = {
  // Buttons/actions: custom buttons (WebLink), quick actions, and standard
  // buttons — the latter thanks to describeLayout + LocaleOptions (lesson #34),
  // which exposes Salesforce's own per-language labels for New/Edit/Delete etc.
  button: ["WebLink", "QuickAction", "StandardButton"],
  // App navigation bar items: object tabs (plural object label), custom tabs,
  // and the app's own name.
  navTab: ["CustomTab", "ObjectLabel", "CustomApplication"],
  // In-page tabs: standard ones (Details/Related/Activity/Chatter/News) come
  // from the built-in platform catalog (lesson #37); a custom flexipage tab
  // label may come from a Custom Label. Array order = preference order on this
  // surface (a tab whose text matches a platform tab name is far more likely
  // the standard tab than a coincidentally-named Custom Label).
  innerTab: ["StandardTab", "CustomLabel"],
  // Collapsible layout section headings. These render INSIDE a <button>
  // (slds-section__title-action), so without this dedicated surface the button
  // rule above would suppress every section heading — the exact bug found in
  // real-org testing (sections never showed).
  section: ["LayoutSection"],
  // Related list cards (lst-* components): the card title is the related list's
  // label, which often equals the related object's plural label.
  relatedList: ["RelatedList", "ObjectLabel"],
};

/**
 * Known Salesforce base Lightning components whose rendered text has a fixed
 * semantic meaning, mapped to the LabelEntry type it corresponds to. Verified
 * against real-org DOM output (2026-07-19): `<records-entity-label>` renders the
 * object's own label (confirmed by real-org testing — an earlier guess that it
 * meant "record data, not a label" was wrong and has been reverted). Only add a
 * tag here on the same evidence bar — real DOM output from an actual org
 * confirming what it renders — never by guessing from naming conventions alone
 * (see lesson #26/#27).
 */
const TAG_TYPE_HINTS: Partial<Record<string, LabelEntry["type"]>> = {
  "RECORDS-ENTITY-LABEL": "ObjectLabel",
};

/**
 * Resolves hovered/scanned text to metadata. This project deliberately never
 * shows a "N possible origins" list to the user — every ambiguous case gets
 * narrowed, using every signal available, down to exactly one best answer (or to
 * "Unknown origin" when there's truly no candidate at all). `highConfidence`
 * records whether a real signal confirmed that answer or whether it's a
 * best-effort tie-break pick, for internal logging/diagnostics only — it does not
 * change what's shown to the user.
 */
export function resolveText(
  index: ReverseIndex,
  rawText: string,
  hints: ContextHints
): ResolveResult {
  const key = normalizeText(rawText);
  let candidates = index.get(key) ?? [];

  if (candidates.length === 0) {
    const looseKey = normalizeTextLoose(rawText);
    for (const [indexedKey, entries] of index) {
      if (normalizeTextLoose(indexedKey) === looseKey) {
        candidates = entries;
        break;
      }
    }
  }

  if (candidates.length === 0) return { candidates: [], highConfidence: false };

  // Structural restriction FIRST — before any single-candidate early return: the
  // UI surface / field container the element sits in (lessons #30/#31) defines
  // the ONLY types that can legitimately render there. This must apply even when
  // exactly one candidate matched: a text field whose stored DATA collides with
  // a lone Custom Label must suppress, not resolve. If no candidate fits, the
  // answer is silence (empty result → the content script shows nothing), never a
  // cross-category guess. Surface wins over field context: a button inside a
  // field row is still a button.
  const allowedTypes: LabelEntry["type"][] | null = hints.surfaceContext
    ? SURFACE_ALLOWED_TYPES[hints.surfaceContext]
    : hints.fieldContext === "label" || hints.fieldContext === "item"
      ? ["FieldLabel"]
      : hints.fieldContext === "value"
        ? ["PicklistValue", "RecordType"]
        : null;
  if (allowedTypes) {
    candidates = candidates.filter((c) => allowedTypes.includes(c.type));
    if (candidates.length === 0) return { candidates: [], highConfidence: false };
  }
  if (candidates.length === 1) return { candidates, highConfidence: true };

  // Strongest positive signal: a known Salesforce base component whose rendered
  // text has a fixed semantic meaning narrows straight to that type.
  const preferredType = hints.elementTagName ? TAG_TYPE_HINTS[hints.elementTagName] : undefined;
  if (preferredType) {
    const narrowed = candidates.filter((c) => c.type === preferredType);
    if (narrowed.length > 0) candidates = narrowed;
  }
  if (candidates.length === 1) return { candidates, highConfidence: true };

  // Reliable signal: data-target-selection-name from the DOM. Depending on the
  // Lightning component, Salesforce sets this to either the full
  // "ObjectApiName.FieldApiName" path or just the bare field/object name — check
  // both directions so a partial value on either side still narrows correctly.
  if (hints.targetSelectionName) {
    const target = hints.targetSelectionName.toLowerCase();
    const narrowed = candidates.filter((c) => {
      const apiName = c.apiName.toLowerCase();
      return target.endsWith(apiName) || apiName.endsWith(target);
    });
    if (narrowed.length > 0) candidates = narrowed;
  }
  if (candidates.length === 1) return { candidates, highConfidence: true };

  // No further reliable signal narrowed it to exactly one: still forced to commit
  // to a single best guess (never a list — see the doc comment above), ordered by
  // the tie-breaks below, top one wins. highConfidence stays false so logs/tests
  // can tell this was a tie-break pick rather than a confirmed match.
  //
  // The page-object boost for FieldLabel/RecordType is GATED on field-container
  // evidence (lesson #30): without it, "this field belongs to the object of the
  // current page" says nothing about whether the hovered text is that field's
  // label at all — boosting on page relevance alone is exactly what made
  // free-standing Custom Labels ("Account", "Test") get mislabeled as fields.
  // With no DOM evidence, TYPE_PRIORITY (CustomLabel first) decides. There is
  // deliberately no page boost for ObjectLabel: its one confirmed rendering
  // (records-entity-label) is already handled by TAG_TYPE_HINTS above.
  const page = hints.pageObjectApiName?.toLowerCase() ?? null;
  const hasFieldEvidence = hints.fieldContext != null;
  const belongsToPage = (c: LabelEntry): boolean => {
    if (!page || !hasFieldEvidence) return false;
    if (c.type === "FieldLabel" || c.type === "RecordType") {
      return c.apiName.toLowerCase().startsWith(`${page}.`);
    }
    return false;
  };

  // Type ranking: on a recognized surface, the surface's own allowed-array order
  // is the preference order; on free text, the global TYPE_PRIORITY
  // (CustomLabel-first) applies. The "more languages wins" tie-break comes ONLY
  // AFTER type ranking — its sole job is picking the richer twin among
  // same-ranked candidates (e.g. layout-seeded vs catalog StandardButton).
  // Putting it before type ranking made a 5-language FieldLabel beat a
  // 2-language CustomLabel on free text — the exact "Account" regression of
  // lesson #39.
  const typeRank = (c: LabelEntry): number => {
    if (allowedTypes) {
      const idx = allowedTypes.indexOf(c.type);
      if (idx >= 0) return idx;
    }
    return TYPE_PRIORITY[c.type];
  };

  const sorted = [...candidates].sort((a, b) => {
    const pageDelta = Number(belongsToPage(b)) - Number(belongsToPage(a));
    if (pageDelta !== 0) return pageDelta;
    const rankDelta = typeRank(a) - typeRank(b);
    if (rankDelta !== 0) return rankDelta;
    const langDelta = Object.keys(b.valuesByLang).length - Object.keys(a.valuesByLang).length;
    if (langDelta !== 0) return langDelta;
    return TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
  });
  return { candidates: [sorted[0]], highConfidence: false };
}
