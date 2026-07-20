export type LabelType =
  | "CustomLabel"
  | "FieldLabel"
  | "ObjectLabel"
  | "RecordType"
  | "CustomTab"
  | "CustomApplication"
  | "PicklistValue"
  /** Custom button/link (WebLink metadata) — seeded from describeLayout, admin overrides via CustomObjectTranslation webLinks. */
  | "WebLink"
  /** Standard Salesforce button (New, Edit, Delete...) — labels come from describeLayout + LocaleOptions, Salesforce's own translations. */
  | "StandardButton"
  /** Quick action — seeded from describeLayout, admin overrides via CustomObjectTranslation quickActions. */
  | "QuickAction"
  /** Page layout section heading — seeded from describeLayout, admin overrides via CustomObjectTranslation layouts/sections. */
  | "LayoutSection"
  /** Related list title on a record page — base label from describeLayout, translations from the related object's plural label. */
  | "RelatedList"
  /** Standard record-page tab (Details, Related, Activity, Chatter, News) — platform strings from the built-in catalog. */
  | "StandardTab";

export interface LabelEntry {
  apiName: string;
  type: LabelType;
  /** Key = Salesforce language code (es, en_US, fr, nl_NL...), value = translated text */
  valuesByLang: Record<string, string>;
  /** FieldLabel entries only: the field's Salesforce data type (Picklist, Date, Text(255)...) */
  dataType?: string;
  /**
   * Languages where valuesByLang[lang] came from an actual admin override (Translation
   * Workbench / Rename Tabs and Labels) rather than Salesforce's own out-of-the-box
   * standard translation. Only meaningful for FieldLabel/ObjectLabel/PicklistValue —
   * other types (CustomLabel, CustomTab, CustomApplication) have no "standard"
   * translation to fall back to, so every language on them is inherently custom.
   */
  customizedLanguages?: string[];
  /**
   * The entry's underlying Salesforce record Id, when one exists and this project needs
   * it. Two unrelated uses share the field rather than each getting their own:
   * - CustomLabel: the ExternalString record's own Id — needed to PATCH the
   *   base-language value directly, and as the parent Id when POSTing a brand new
   *   ExternalStringLocalization row for a language that has none yet (PHASE 6).
   * - FieldLabel, custom fields only (`__c`): the CustomField record's Id — Setup's
   *   field-detail route needs it, not the field's API name (DECISIONS.md #51).
   *   Standard fields have no CustomField row at all, so this stays undefined for them.
   */
  id?: string;
  /**
   * CustomLabel entries only: ExternalStringLocalization.Id per language, when a
   * translation row already exists for it. Editing a language present here is a PATCH;
   * editing a language absent here is a POST (creates the row) — see
   * saveCustomLabelTranslation in salesforce-api.ts.
   */
  localizationIdsByLang?: Record<string, string>;
}

/**
 * Types with a real, direct write path today (PHASE 6): CustomLabel translations live
 * on standalone Tooling API records (ExternalString/ExternalStringLocalization) that
 * can be PATCHed/POSTed individually. Every other type's translation lives inside a
 * CustomObjectTranslation (or similar) XML file, only reachable via a Metadata API
 * deploy() of a re-zipped package — a materially different, unbuilt pipeline. Don't
 * add a type here until that pipeline exists; the tooltip's edit affordance is gated
 * on this set so it never offers an edit action it can't actually fulfill.
 */
const EDITABLE_LABEL_TYPES: ReadonlySet<LabelType> = new Set(["CustomLabel"]);

export function isEditableLabelType(type: LabelType): boolean {
  return EDITABLE_LABEL_TYPES.has(type);
}

export interface SaveTranslationRequest {
  type: "SAVE_TRANSLATION";
  origin: string;
  apiName: string;
  labelType: LabelType;
  language: string;
  value: string;
  /**
   * The value the editor started from (before the user's own keystrokes) — the
   * optimistic-concurrency baseline. The background re-reads the LIVE org value
   * right before writing and compares it against this; a mismatch means someone
   * else changed it in between, and the write is aborted rather than silently
   * overwriting their change. Not the same as `value`, which is what the user
   * typed just now.
   */
  expectedValue: string;
}

export interface SaveTranslationResponse {
  ok: boolean;
  /** Present on success — the entry with its updated value (and Id bookkeeping) applied. */
  entry?: LabelEntry;
  /** Present on failure — a message safe to show directly in the tooltip. */
  error?: string;
  /**
   * True when the save was aborted because the live org value no longer matched
   * `expectedValue` — someone else changed it since the editor opened. `currentValue`
   * carries what the org actually has now, already folded back into the entry
   * returned alongside this (so the caller can show it immediately without a
   * separate refresh).
   */
  conflict?: boolean;
  currentValue?: string;
}

export interface ContextHints {
  /** e.g. "Account.Name" if the element had data-target-selection-name */
  targetSelectionName?: string | null;
  /** apiName of the current page's object, if it can be inferred from the URL */
  pageObjectApiName?: string | null;
  /**
   * Uppercase tag name of the hovered/scanned element (`element.tagName`), e.g.
   * "RECORDS-ENTITY-LABEL". Lets resolveText recognize known Salesforce base
   * Lightning components whose rendered text has a fixed semantic meaning
   * (currently: records-entity-label → the object's own label).
   */
  elementTagName?: string | null;
  /**
   * Field-container classification of the element's ancestor chain (see
   * resolveFieldContext in dom-utils.ts): "label" = the label side of a
   * record-detail field, "value" = the value side, "item" = inside a field
   * container without a more specific marker, null = no field container at all.
   * This is what separates a real field label from a Custom Label whose text
   * merely collides with one — structurally different DOM, identical text.
   */
  fieldContext?: "label" | "value" | "item" | null;
  /**
   * UI-surface classification of the element's ancestor chain (see
   * resolveSurfaceContext in dom-utils.ts): "button" = inside a button/action
   * control, "navTab" = an item of the app navigation bar, "innerTab" = a tab
   * inside the page (Details/Related/...), "section" = a collapsible layout
   * section heading (which renders INSIDE a button — it must be detected before
   * the button check or sections would be suppressed as uncovered buttons),
   * null = none of those. Each surface restricts which metadata types can
   * legitimately render there; when no candidate fits, the tooltip stays silent
   * (standard Salesforce chrome we don't cover) instead of guessing.
   */
  surfaceContext?: "button" | "navTab" | "innerTab" | "section" | "relatedList" | null;
}

export interface ResolveTextRequest {
  type: "RESOLVE_TEXT";
  text: string;
  hints: ContextHints;
}

export interface ResolveTextResponse {
  /** Always 0 or 1 entries — this project never surfaces a "N possible origins" list, see resolveText in index-builder.ts. */
  candidates: LabelEntry[];
  /** True only when a real signal confirmed the answer, as opposed to a best-effort tie-break pick. Internal/diagnostic only — doesn't change what's shown. */
  highConfidence: boolean;
}

/** Translation Mode batches every on-screen text into one round trip instead of one message per element. */
export interface ResolveTextsBulkRequest {
  type: "RESOLVE_TEXTS_BULK";
  items: Array<{ text: string; hints: ContextHints }>;
}

export interface ResolveTextsBulkResponse {
  results: ResolveTextResponse[];
}

export interface RefreshIndexRequest {
  type: "REFRESH_INDEX";
}

export interface RegisterOrgHostRequest {
  type: "REGISTER_ORG_HOST";
  origin: string;
}

export interface GetSettingsRequest {
  type: "GET_SETTINGS";
}

/** Visual style of Translation Mode's annotations. "stacked" places them on their own line under the label. */
export type TmPreset = "stacked" | "subtle" | "tinted" | "plain";

export interface Settings {
  activeLanguages: string[];
  enabled: boolean;
  lastIndexRefresh: number | null;
  /** Translation Mode: annotate every matching element on screen at once, instead of relying on hover. */
  translationModeEnabled: boolean;
  /** Translation Mode chip style: "subtle" neutral pills, "tinted" per-language pastel pills, "plain" unobtrusive text. */
  tmPreset: TmPreset;
  /** Show the language flag emoji on each Translation Mode chip. */
  tmShowFlags: boolean;
  /** Show the language code (es, fr...) on each Translation Mode chip. */
  tmShowLangCodes: boolean;
  /**
   * Key held to activate the hover inspector (KeyboardEvent.key, e.g. "Alt",
   * "Control", "Shift", "q"). null = inspector always active while enabled
   * (the pre-hotkey behavior). While held, the cursor becomes a magnifier.
   */
  inspectorHotkey: string | null;
  /** Key combination toggling Translation Mode on/off, e.g. "Alt+T". null = no shortcut. */
  tmHotkey: string | null;
}

export const DEFAULT_INSPECTOR_HOTKEY = "Alt";
export const DEFAULT_TM_HOTKEY = "Alt+T";

/** One row of the Translation Health registry — which languages a given element is missing. */
export interface TranslationHealthEntry {
  apiName: string;
  type: LabelType;
  missingLanguages: string[];
}
