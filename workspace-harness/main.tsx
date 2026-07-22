import type { LabelEntry, WorkspaceItem } from "../src/shared/types";

/**
 * G-PO preview harness for the Workspace page: stubs the `chrome.storage` surface the
 * page uses (items, cached entries for drift detection, settings, org origin), then
 * mounts the REAL `<Workspace/>`. Development tool only — imports nothing FROM the
 * extension's build output and ships in no artifact. The stub must exist before the
 * component module evaluates, hence the dynamic imports at the bottom.
 */

const now = Date.now();
const min = 60 * 1000;

const SAMPLE_ITEMS: WorkspaceItem[] = [
  // Edit, clean (index still holds what was saved). Real history, 7 entries — exercises
  // both the element card's "edited ×N" signal (v3, #67) AND the History disclosure's
  // "+N earlier" cap at 5 visible (v4, #68).
  {
    kind: "edit",
    type: "CustomLabel",
    apiName: "Welcome_Message",
    language: "es",
    oldValue: "Bienvenido",
    newValue: "Bienvenido de nuevo",
    timestamp: now - 40 * min,
    editCount: 7,
    history: [
      { timestamp: now - 90 * min, oldValue: "", newValue: "Hola" },
      { timestamp: now - 80 * min, oldValue: "Hola", newValue: "Bienvenido" },
      { timestamp: now - 70 * min, oldValue: "Bienvenido", newValue: "Bienvenido!" },
      { timestamp: now - 60 * min, oldValue: "Bienvenido!", newValue: "Bienvenido" },
      { timestamp: now - 50 * min, oldValue: "Bienvenido", newValue: "Bienvenido de nuevo" },
      { timestamp: now - 45 * min, oldValue: "Bienvenido de nuevo", newValue: "Bienvenido otra vez" },
      { timestamp: now - 40 * min, oldValue: "Bienvenido otra vez", newValue: "Bienvenido de nuevo" },
    ],
  },
  // Pre-v4 row: editCount > 1 but no `history` array (captured before this field
  // existed) — the History disclosure should NOT appear (historyOf reconstructs only
  // ONE entry, honestly, rather than fabricating a trail); the "edited ×N" badge is
  // the only multi-edit signal for this row, same as before v4.
  { kind: "edit", type: "CustomLabel", apiName: "Legacy_Label", language: "fr", oldValue: "Ancien", newValue: "Actuel", timestamp: now - 35 * min, editCount: 4 },
  // Edit with empty original.
  { kind: "edit", type: "FieldLabel", apiName: "Account.Invoice_Color__c", language: "es", oldValue: "", newValue: "Color de factura", timestamp: now - 30 * min },
  // Edit that DRIFTED: someone changed fr after the save (see cachedEntries below).
  // Same element as the row above — the KEY regression check for element grouping:
  // Account.Invoice_Color__c must render as ONE card with two language edits, not two.
  { kind: "edit", type: "FieldLabel", apiName: "Account.Invoice_Color__c", language: "fr", oldValue: "Couleur", newValue: "Couleur de facture", timestamp: now - 25 * min },
  // Edit reverted by hand.
  { kind: "edit", type: "RecordType", apiName: "Account.Partner", language: "fr", oldValue: "Partenaire", newValue: "Partenaire", timestamp: now - 5 * min },
  // Global value set picklist edit.
  { kind: "edit", type: "PicklistValue", apiName: "Regions#EMEA", language: "nl_NL", oldValue: "EMEA", newValue: "Europa/MO/Afrika", timestamp: now - 9 * min },
  // Pin, clean — also marked reviewed below (workspaceReviewed), so this exercises the
  // "Reviewed" status tab and the green reviewed card state.
  { kind: "pin", type: "ObjectLabel", apiName: "Invoice__c", snapshot: { en_US: "Invoice", es: "Factura", fr: "Facture" }, timestamp: now - 60 * min },
  // Pin that DRIFTED in one language, PLUS an edit of the same element (below) — one
  // card carrying both "pinned" and "edited" tags at once.
  { kind: "pin", type: "FieldLabel", apiName: "Account.Status__c", snapshot: { en_US: "Status", es: "Estado", fr: "Statut" }, timestamp: now - 26 * 60 * min },
  { kind: "edit", type: "FieldLabel", apiName: "Account.Status__c", language: "en_US", oldValue: "Status", newValue: "Status", timestamp: now - 3 * min },
  // Pin whose element is NOT in the index anymore → honest "unknown" state.
  { kind: "pin", type: "CustomLabel", apiName: "Deleted_Label", snapshot: { en_US: "Old text" }, timestamp: now - 50 * min },
];

/** Marks the clean Invoice__c pin reviewed — fresh (after its own timestamp, no drift), so it should show under the "Reviewed" tab. */
const SAMPLE_REVIEWED: Record<string, number> = {
  "ObjectLabel Invoice__c": now - 20 * min,
};

/** What the background's index "currently" holds — the drift baseline. */
const SAMPLE_ENTRIES: LabelEntry[] = [
  { apiName: "Welcome_Message", type: "CustomLabel", valuesByLang: { en_US: "Welcome back", es: "Bienvenido de nuevo" } },
  { apiName: "Legacy_Label", type: "CustomLabel", valuesByLang: { en_US: "Current", fr: "Actuel" } },
  {
    apiName: "Account.Invoice_Color__c",
    type: "FieldLabel",
    dataType: "Text(255)",
    id: "00Nxx0000000001",
    // es matches the saved value (clean); fr was changed by someone else afterwards.
    valuesByLang: { en_US: "Invoice Color", es: "Color de factura", fr: "Couleur de la facture" },
  },
  { apiName: "Account.Partner", type: "RecordType", valuesByLang: { en_US: "Partner", fr: "Partenaire" } },
  { apiName: "Regions#EMEA", type: "PicklistValue", valuesByLang: { en_US: "EMEA", nl_NL: "Europa/MO/Afrika" } },
  { apiName: "Invoice__c", type: "ObjectLabel", valuesByLang: { en_US: "Invoice", es: "Factura", fr: "Facture" } },
  // Status__c: es moved after the pin's snapshot was taken.
  { apiName: "Account.Status__c", type: "FieldLabel", dataType: "Picklist", valuesByLang: { en_US: "Status", es: "Estado actual", fr: "Statut" } },
];

type StorageListener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, area: string) => void;
const listeners: StorageListener[] = [];
let store: Record<string, unknown> = {
  workspaceItems: SAMPLE_ITEMS,
  workspaceReviewed: SAMPLE_REVIEWED,
  cachedEntries: SAMPLE_ENTRIES,
  settings: { activeLanguages: ["en_US", "es", "fr", "nl_NL"], lastIndexRefresh: now - 12 * min },
  lastOrgOrigin: "https://harness.lightning.force.com",
};

(globalThis as { chrome?: unknown }).chrome = {
  storage: {
    local: {
      get: async (keys: string | string[]) => {
        const wanted = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(wanted.filter((k) => k in store).map((k) => [k, store[k]]));
      },
      set: async (items: Record<string, unknown>) => {
        const changes = Object.fromEntries(
          Object.entries(items).map(([k, v]) => [k, { newValue: v, oldValue: store[k] }])
        );
        store = { ...store, ...items };
        for (const listener of listeners) listener(changes, "local");
      },
    },
    onChanged: {
      addListener: (fn: StorageListener) => listeners.push(fn),
      removeListener: (fn: StorageListener) => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    },
  },
};

const [{ createRoot }, { Workspace }] = await Promise.all([
  import("react-dom/client"),
  import("../src/workspace/Workspace"),
]);
createRoot(document.getElementById("root")!).render(<Workspace />);
