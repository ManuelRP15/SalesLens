import type { LabelEntry } from "../shared/types";

// NOTE: country flag emoji are NOT used anywhere — Chrome on Windows doesn't ship
// the regional-indicator glyphs, so 🇪🇸 renders as the letters "ES" (confirmed in
// real-org testing). The language marker is a small colored dot instead, with a
// stable hue per language (shared by the tooltip, Translation Mode and popup).
const LANG_HUES: Record<string, number> = {
  es: 20, en_US: 215, fr: 260, nl_NL: 32, de: 0, it: 130, pt_BR: 160, ja: 340, zh_CN: 5,
};

export function langHue(lang: string): number {
  const known = LANG_HUES[lang];
  if (known !== undefined) return known;
  let acc = 0;
  for (const ch of lang) acc = (acc * 31 + ch.charCodeAt(0)) % 360;
  return acc;
}

/** Saturated accent for small markers (dots). */
export function langAccent(lang: string): string {
  return `hsl(${langHue(lang)},60%,45%)`;
}

export const TYPE_LABELS: Record<LabelEntry["type"], string> = {
  CustomLabel: "Custom Label",
  FieldLabel:  "Field",
  ObjectLabel: "Object",
  RecordType:  "Record Type",
  CustomTab:   "Tab",
  CustomApplication: "Application",
  PicklistValue: "Picklist Value",
  WebLink:     "Custom Button",
  StandardButton: "Button",
  QuickAction: "Quick Action",
  LayoutSection: "Section",
  RelatedList: "Related List",
  StandardTab: "Tab",
};

export const TYPE_COLORS: Record<LabelEntry["type"], { bg: string; color: string }> = {
  CustomLabel: { bg: "#e8f0fe", color: "#1a56db" },
  FieldLabel:  { bg: "#e3f6e8", color: "#1a7f4e" },
  ObjectLabel: { bg: "#f3e8fe", color: "#7c3aed" },
  RecordType:  { bg: "#fdf3e3", color: "#a06400" },
  CustomTab:   { bg: "#e0f7fa", color: "#00707c" },
  CustomApplication: { bg: "#fde8e8", color: "#c0392b" },
  PicklistValue: { bg: "#f0f0f0", color: "#555555" },
  WebLink:     { bg: "#e7ecf6", color: "#3b5b9d" },
  StandardButton: { bg: "#eef1f6", color: "#4a5568" },
  QuickAction: { bg: "#e2f5f2", color: "#0b7a6e" },
  LayoutSection: { bg: "#f4efe9", color: "#8a6a3b" },
  RelatedList: { bg: "#e9f2f4", color: "#2a7186" },
  StandardTab: { bg: "#e0f0fa", color: "#20618c" },
};

/**
 * Type badge text for a given entry. Every type except FieldLabel is a static
 * label; FieldLabel is split into "Field" vs "Custom Field" (apiName ending in
 * "__c" is Salesforce's own custom-field convention) so the two read as visibly
 * distinct at a glance, even though they share the same color.
 */
export function typeLabel(entry: LabelEntry): string {
  if (entry.type === "FieldLabel") {
    const fieldApiName = entry.apiName.split(".").pop() ?? entry.apiName;
    return fieldApiName.endsWith("__c") ? "Custom Field" : "Field";
  }
  return TYPE_LABELS[entry.type];
}

/**
 * Short, human-friendly form of apiName for display — the type badge already says
 * "Field"/"Record Type"/etc, so repeating the object prefix is redundant noise.
 * The full apiName (still the right thing to copy/paste into Setup or code) stays
 * available via the Copy button.
 */
export function displayApiName(entry: LabelEntry): string {
  switch (entry.type) {
    case "FieldLabel":
    case "RecordType":
    case "WebLink":
    case "StandardButton":
    case "QuickAction":
    case "LayoutSection":
    case "RelatedList":
    case "StandardTab":
      return entry.apiName.split(".").slice(1).join(".") || entry.apiName;
    case "PicklistValue": {
      const [rest, value] = entry.apiName.split("#");
      if (!value) return entry.apiName;
      const parts = rest.split(".");
      return `${value} (${parts[parts.length - 1]})`;
    }
    default:
      return entry.apiName;
  }
}

/**
 * Setup deep-link path for an entry, or null when there's no known URL pattern for its
 * type (PHASE 5) — returning null rather than guessing is what keeps this consistent
 * with the project's "silence over a wrong answer" bar; only add a case here once the
 * pattern is confirmed, the same evidence bar as everything else in this codebase.
 * CustomLabel's URL is NOT yet verified against a real org — it's the well-known
 * Lightning Setup "edit a Custom Label by Id" deep link, but hasn't been clicked
 * against a live session. ObjectLabel uses the standard Object Manager Details route.
 * FieldLabel is split by field kind (DECISIONS.md #51): standard fields keep the
 * API-name-based Object Manager route (unverified but unreported-broken); CUSTOM
 * fields need the field's real CustomField Id instead — confirmed broken
 * ("Insufficient Privileges" for every custom field) when API name was used, and the
 * Id-based route is a strong, but still real-org-UNVERIFIED, hypothesis. Silence
 * (null) rather than a second guess when a custom field's Id wasn't resolved.
 */
export function setupPath(entry: LabelEntry): string | null {
  switch (entry.type) {
    case "CustomLabel":
      return entry.id
        ? `/lightning/setup/ExternalStrings/page?address=${encodeURIComponent(`/one/one.app#/n/ExternalString/${entry.id}/e`)}`
        : null;
    case "FieldLabel": {
      const [objectApiName, fieldApiName] = entry.apiName.split(".");
      if (!objectApiName || !fieldApiName) return null;
      if (fieldApiName.endsWith("__c")) {
        return entry.id ? `/lightning/setup/ObjectManager/${objectApiName}/FieldsAndRelationships/${entry.id}/view` : null;
      }
      return `/lightning/setup/ObjectManager/${objectApiName}/FieldsAndRelationships/${fieldApiName}/view`;
    }
    case "ObjectLabel":
      return `/lightning/setup/ObjectManager/${entry.apiName}/Details/view`;
    default:
      return null;
  }
}

