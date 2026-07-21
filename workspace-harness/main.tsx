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
  // Edit, clean (index still holds what was saved).
  { kind: "edit", type: "CustomLabel", apiName: "Welcome_Message", language: "es", oldValue: "Bienvenido", newValue: "Bienvenido de nuevo", timestamp: now - 40 * min },
  // Edit with empty original.
  { kind: "edit", type: "FieldLabel", apiName: "Account.Invoice_Color__c", language: "es", oldValue: "", newValue: "Color de factura", timestamp: now - 30 * min },
  // Edit that DRIFTED: someone changed fr after the save (see cachedEntries below).
  { kind: "edit", type: "FieldLabel", apiName: "Account.Invoice_Color__c", language: "fr", oldValue: "Couleur", newValue: "Couleur de facture", timestamp: now - 25 * min },
  // Edit reverted by hand.
  { kind: "edit", type: "RecordType", apiName: "Account.Partner", language: "fr", oldValue: "Partenaire", newValue: "Partenaire", timestamp: now - 5 * min },
  // Global value set picklist edit.
  { kind: "edit", type: "PicklistValue", apiName: "Regions#EMEA", language: "nl_NL", oldValue: "EMEA", newValue: "Europa/MO/Afrika", timestamp: now - 9 * min },
  // Pin, clean.
  { kind: "pin", type: "ObjectLabel", apiName: "Invoice__c", snapshot: { en_US: "Invoice", es: "Factura", fr: "Facture" }, timestamp: now - 60 * min },
  // Pin that DRIFTED in one language.
  { kind: "pin", type: "FieldLabel", apiName: "Account.Status__c", snapshot: { en_US: "Status", es: "Estado", fr: "Statut" }, timestamp: now - 26 * 60 * min },
  // Pin whose element is NOT in the index anymore → honest "unknown" state.
  { kind: "pin", type: "CustomLabel", apiName: "Deleted_Label", snapshot: { en_US: "Old text" }, timestamp: now - 50 * min },
];

/** What the background's index "currently" holds — the drift baseline. */
const SAMPLE_ENTRIES: LabelEntry[] = [
  { apiName: "Welcome_Message", type: "CustomLabel", valuesByLang: { en_US: "Welcome back", es: "Bienvenido de nuevo" } },
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
