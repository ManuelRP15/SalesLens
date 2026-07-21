import type { WorkspaceEdit } from "../src/shared/types";

/**
 * G-PO preview harness for the Workspace page: stubs the `chrome.storage` surface the
 * page uses with representative captured edits, then mounts the REAL `<Workspace/>`.
 * Development tool only — imports nothing FROM the extension's build output and ships
 * in no artifact. The stub must exist before the component module evaluates, hence the
 * dynamic imports at the bottom.
 */

const SAMPLE_EDITS: WorkspaceEdit[] = [
  {
    type: "CustomLabel",
    apiName: "Welcome_Message",
    language: "es",
    oldValue: "Bienvenido",
    newValue: "Bienvenido de nuevo",
    timestamp: Date.now() - 40 * 60 * 1000,
  },
  {
    type: "FieldLabel",
    apiName: "Account.Invoice_Color__c",
    language: "es",
    oldValue: "",
    newValue: "Color de factura",
    timestamp: Date.now() - 30 * 60 * 1000,
  },
  {
    type: "FieldLabel",
    apiName: "Account.Invoice_Color__c",
    language: "fr",
    oldValue: "Couleur",
    newValue: "Couleur de facture",
    timestamp: Date.now() - 25 * 60 * 1000,
  },
  {
    type: "PicklistValue",
    apiName: "Account.Status__c#Active",
    language: "es",
    oldValue: "Activo",
    newValue: "Activa",
    timestamp: Date.now() - 12 * 60 * 1000,
  },
  {
    type: "PicklistValue",
    apiName: "Regions#EMEA",
    language: "nl_NL",
    oldValue: "EMEA",
    newValue: "Europa/MO/Afrika",
    timestamp: Date.now() - 9 * 60 * 1000,
  },
  {
    type: "RecordType",
    apiName: "Account.Partner",
    language: "fr",
    oldValue: "Partenaire",
    newValue: "Partenaire",
    timestamp: Date.now() - 5 * 60 * 1000,
  },
  {
    type: "CustomTab",
    apiName: "Invoices",
    language: "es",
    oldValue: "Facturas antiguas",
    newValue: "Facturas",
    timestamp: Date.now() - 2 * 60 * 1000,
  },
];

type StorageListener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, area: string) => void;
const listeners: StorageListener[] = [];
let store: Record<string, unknown> = { workspaceEdits: SAMPLE_EDITS };

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
