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
 * Types with a real, direct write path (PHASE 6/6b — see DECISIONS.md #53). Two
 * different write mechanisms share this one gate: CustomLabel's translations are
 * standalone Tooling API records (PATCH/POST, salesforce-api.ts's
 * saveCustomLabelTranslation); every other type here lives inside a
 * CustomObjectTranslation/Translations/GlobalValueSetTranslation XML file, written via
 * a Metadata API deploy() (metadata-write.ts's saveMetadataTranslation). Deliberately
 * excludes ObjectLabel/RelatedList (their target, `<caseValues>`, can hold multiple
 * grammatical-case entries for gendered languages — not yet safely patchable) and
 * StandardButton/StandardTab (Salesforce's own platform-controlled translations — no
 * admin-authored value exists to write back to, ever). The tooltip's edit affordance
 * is gated on this set so it never offers an edit action it can't actually fulfill.
 */
const EDITABLE_LABEL_TYPES: ReadonlySet<LabelType> = new Set([
  "CustomLabel",
  "FieldLabel",
  "RecordType",
  "WebLink",
  "QuickAction",
  "LayoutSection",
  "PicklistValue",
  "CustomTab",
  "CustomApplication",
]);

export function isEditableLabelType(type: LabelType): boolean {
  return EDITABLE_LABEL_TYPES.has(type);
}

/**
 * FIELD-LEVEL editability, on top of `isEditableLabelType`'s type-level gate — real-org
 * testing (2026-07-21, DECISIONS.md #56) showed Salesforce rejects `FieldLabel`/
 * `PicklistValue` deploys for STANDARD fields with real, specific errors ("Cannot
 * translate standard field: Account.Fax", "Can't translate standard picklist Type with
 * Custom Object Translations. Use Standard Value Set instead.") — standard picklists
 * need an entirely different, unbuilt mechanism (`StandardValueSetTranslation`), and
 * some standard fields aren't renamable via metadata at all. Rather than keep offering
 * an edit button that Salesforce will reliably reject, this narrows editing to CUSTOM
 * fields/picklists only (`__c` suffix) — standard ones stay fully readable via hover
 * (unaffected; that path never touches this file) but lose the edit affordance until a
 * real standard-value-set write path is built. Global value sets (no dot before `#`)
 * are unaffected by this — different mechanism (`GlobalValueSetTranslation`), no
 * evidence of the same rejection.
 */
export function isEditableEntry(entry: LabelEntry): boolean {
  if (!isEditableLabelType(entry.type)) return false;
  if (entry.type === "FieldLabel") {
    const fieldApiName = entry.apiName.split(".").pop() ?? "";
    return fieldApiName.endsWith("__c");
  }
  if (entry.type === "PicklistValue") {
    const [left] = entry.apiName.split("#");
    if (!left.includes(".")) return true; // global value set — different mechanism, unaffected
    const fieldApiName = left.split(".").pop() ?? "";
    return fieldApiName.endsWith("__c");
  }
  return true;
}

/**
 * "Simple mode" (default ON — see DECISIONS.md #56 and PRODUCT.md): the product's core
 * value is Object/Field/Picklist/Label translations — buttons, quick actions, tabs,
 * apps, record types, layout sections carry disproportionate edge-case risk (global vs.
 * object-specific quick actions, standard-vs-custom picklist mechanisms, XSD ordering...)
 * for how rarely they're the actual translation gap someone's chasing. Simple mode
 * doesn't remove anything already built — it just doesn't SURFACE the advanced types
 * via hover/Translation Mode/Translation Health until the user opts into Advanced mode.
 */
const SIMPLE_SCOPE_TYPES: ReadonlySet<LabelType> = new Set(["ObjectLabel", "FieldLabel", "PicklistValue", "CustomLabel"]);

export function isInSimpleScope(type: LabelType): boolean {
  return SIMPLE_SCOPE_TYPES.has(type);
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
   * Key that TOGGLES Inspection Mode on/press (KeyboardEvent.key, e.g. "Alt",
   * "Control", "Shift", "q"). null = inspector always active while enabled (Always
   * Hover, the pre-hotkey behavior — classic continuous glance-and-go, unaffected by
   * the pin/sticky redesign below). Once toggled on, the FIRST resolvable element the
   * cursor reaches pins the tooltip — see DECISIONS.md #56: unlike the old behavior,
   * further mouse movement alone no longer retargets it (only `holdHotkey`, Escape, or
   * an outside click can move/close it) — deliberate mode, not glance-and-go.
   */
  inspectorHotkey: string | null;
  /**
   * A SEPARATE key (DECISIONS.md #56) that grants temporary retargeting while held —
   * the "Minecraft shift" companion to `inspectorHotkey`'s sticky toggle: hold it,
   * hover freely (live, zero-debounce, exactly like Inspection Mode used to always
   * behave), release to pin the tooltip on whatever's under the cursor at that moment.
   * Works independently of whether Inspection Mode is toggled on — it's how you EVER
   * move a pinned tooltip to a different element without closing it first. null =
   * disabled (Inspection Mode's pin becomes permanent until Escape/outside-click).
   */
  holdHotkey: string | null;
  /** Key combination toggling Translation Mode on/off, e.g. "Alt+T". null = no shortcut. */
  tmHotkey: string | null;
  /**
   * Simple mode (default true, DECISIONS.md #56/PRODUCT.md): only surface
   * Object/Field/Picklist/Custom Label translations via hover, Translation Mode, and
   * Translation Health. Advanced types (buttons, quick actions, tabs, apps, record
   * types, layout sections) stay fully built and reachable by turning this off — never
   * removed, just not the default surface.
   */
  simpleMode: boolean;
  /**
   * Flags translations whose value is byte-identical to the base-language value —
   * a soft, visual-only "might not actually be translated" hint (PRODUCT.md MVP
   * capability #4), shown as a chip mark in Translation Mode and a count in
   * Translation Health. Default true; a toggle exists because it's a real judgment
   * call, not a hard rule — short strings, numbers, and brand names legitimately
   * match across languages, and this project's "zero false positives" bar means
   * anyone who finds it noisy for their org should be able to turn it off outright
   * rather than live with a flag they've learned to ignore.
   */
  flagIdenticalTranslations: boolean;
}

export const DEFAULT_INSPECTOR_HOTKEY = "Alt";
export const DEFAULT_HOLD_HOTKEY = "Shift";
export const DEFAULT_TM_HOTKEY = "Alt+T";

/** One row of the Translation Health registry — which languages a given element is missing, and which merely repeat the base-language value (see `Settings.flagIdenticalTranslations`). */
export interface TranslationHealthEntry {
  apiName: string;
  type: LabelType;
  missingLanguages: string[];
  /**
   * Active, non-base languages whose value is byte-identical to the base-language
   * (`en_US`, DECISIONS.md #41's existing assumption) value — a real possible failure
   * mode (source pasted into the translation field instead of translating it), but not
   * always wrong (short strings, numbers, brand names legitimately match across
   * languages) — hence `Settings.flagIdenticalTranslations` gating whether this is
   * surfaced at all. Computed alongside `missingLanguages`, same data, no new fetches.
   */
  identicalToSourceLanguages: string[];
}
