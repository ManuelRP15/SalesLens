/**
 * Dev harness for the content script (added in DECISIONS.md #63).
 *
 * Why this exists: every interaction bug this feature has had — the tooltip closing on
 * an inside click, the editor collapsing on blur, scroll correction under sticky
 * headers — depends on REAL browser behaviour that neither unit tests nor jsdom can
 * express. jsdom in particular never performs mousedown's focus default action at all,
 * so a test asserting "preventDefault keeps the editor open" passes there whether or
 * not the mechanism works. This harness runs the ACTUAL content script against a
 * deliberately Lightning-shaped page in a real browser, with `chrome.*` stubbed, so
 * those behaviours can be driven and observed directly.
 *
 * It is a development tool, not part of the extension: nothing in `src/` imports it and
 * it is never bundled (`vite build` only builds the manifest's entry points).
 *
 * Run: `npm run harness`, then open the printed URL and use the on-page controls.
 */

interface StubSettings {
  enabled: boolean;
  activeLanguages: string[];
  inspectorHotkey: string | null;
  holdHotkey: string | null;
  tmHotkey: string | null;
  translationModeEnabled: boolean;
  simpleMode?: boolean;
  flagIdenticalTranslations?: boolean;
}

const settings: StubSettings = {
  enabled: true,
  activeLanguages: ["en_US", "es", "fr"],
  inspectorHotkey: "Alt",
  holdHotkey: "Shift",
  tmHotkey: "Alt+T",
  translationModeEnabled: false,
  flagIdenticalTranslations: true,
};

type StorageListener = (changes: Record<string, { newValue: unknown }>, area: string) => void;
const storageListeners: StorageListener[] = [];

/** Fake metadata for the harness page's labels — keyed by the visible text the content script will resolve. */
const CANDIDATES: Record<string, unknown> = {
  "Account Name": {
    apiName: "Account.Name",
    type: "FieldLabel",
    dataType: "Text(255)",
    valuesByLang: { en_US: "Account Name", es: "Nombre de la cuenta", fr: "Nom du compte" },
  },
  Industry: {
    apiName: "Account.Industry__c",
    type: "FieldLabel",
    dataType: "Picklist",
    valuesByLang: { en_US: "Industry", es: "", fr: "Industry" },
  },
  "Annual Revenue": {
    apiName: "Account.Annual_Revenue__c",
    type: "FieldLabel",
    dataType: "Currency",
    valuesByLang: { en_US: "Annual Revenue", es: "Ingresos anuales", fr: "" },
  },
  Description: {
    apiName: "Welcome_Description",
    type: "CustomLabel",
    id: "101xx0000000001",
    valuesByLang: { en_US: "Description", es: "Descripción", fr: "Description" },
  },
  "Nested Field": {
    apiName: "Account.Nested_Field__c",
    type: "FieldLabel",
    valuesByLang: { en_US: "Nested Field", es: "", fr: "" },
  },
};

function candidatesFor(text: string): unknown[] {
  const hit = CANDIDATES[text.trim()];
  return hit ? [hit] : [];
}

/** Extra storage keys beyond `settings` — currently the Workspace items the content script reads pin state from (PHASE 16 v2). */
const extraStore: Record<string, unknown> = { workspaceItems: [] };

function notifyStorage(changes: Record<string, { newValue: unknown }>): void {
  for (const l of storageListeners) l(changes, "local");
}

const chromeStub = {
  storage: {
    local: {
      get: (keys: string | string[], cb: (items: Record<string, unknown>) => void) => {
        const wanted = Array.isArray(keys) ? keys : [keys];
        const result: Record<string, unknown> = {};
        for (const k of wanted) {
          if (k === "settings") result.settings = settings;
          else if (k in extraStore) result[k] = extraStore[k];
        }
        cb(result);
      },
      set: (items: Record<string, unknown>) => {
        const changes: Record<string, { newValue: unknown }> = {};
        if (items.settings) {
          Object.assign(settings, items.settings as StubSettings);
          changes.settings = { newValue: { ...settings } };
        }
        for (const [k, v] of Object.entries(items)) {
          if (k === "settings") continue;
          extraStore[k] = v;
          changes[k] = { newValue: v };
        }
        notifyStorage(changes);
      },
    },
    onChanged: { addListener: (l: StorageListener) => storageListeners.push(l) },
  },
  runtime: {
    lastError: undefined as unknown,
    id: "harness",
    sendMessage: (
      message: { type: string; text?: string; items?: { text: string }[]; apiName?: string; labelType?: string },
      cb?: (r: unknown) => void
    ) => {
      if (!cb) return;
      // Async, like the real service worker round trip — timing bugs that only show up
      // with a real message delay are exactly what this harness is for.
      setTimeout(() => {
        if (message.type === "RESOLVE_TEXT") cb({ candidates: candidatesFor(message.text ?? "") });
        else if (message.type === "RESOLVE_TEXTS_BULK")
          cb({ results: (message.items ?? []).map((i) => ({ candidates: candidatesFor(i.text) })) });
        else if (message.type === "SAVE_TRANSLATION") cb({ ok: true });
        else if (message.type === "WORKSPACE_TOGGLE_PIN") {
          // Same toggle semantics as the real background (shared/workspace.ts's togglePin).
          const items = extraStore.workspaceItems as Array<{ kind: string; type: string; apiName: string }>;
          const without = items.filter((i) => !(i.kind === "pin" && i.type === message.labelType && i.apiName === message.apiName));
          const pinned = without.length === items.length;
          extraStore.workspaceItems = pinned
            ? [...items, { kind: "pin", type: message.labelType, apiName: message.apiName, snapshot: {}, timestamp: Date.now() }]
            : without;
          notifyStorage({ workspaceItems: { newValue: extraStore.workspaceItems } });
          cb({ pinned });
        } else cb(undefined);
      }, 30);
    },
    onMessage: { addListener: () => {} },
  },
};

(globalThis as unknown as { chrome: unknown }).chrome = chromeStub;

// The tooltip lives in a CLOSED shadow root (CLAUDE.md rule #3) — correct for the
// product, but it means a harness script can't see inside it to assert anything.
// `attachShadow` RETURNS the root even when closed, so capturing it here gives the
// harness a handle WITHOUT weakening the mode: the extension still gets a genuinely
// closed root, and nothing about event retargeting (the thing the click-ownership
// rule depends on) changes.
const originalAttachShadow = Element.prototype.attachShadow;
Element.prototype.attachShadow = function (init: ShadowRootInit) {
  const shadow = originalAttachShadow.call(this, init);
  if ((this as HTMLElement).id === "sti-root") {
    (window as unknown as { __stiShadow: ShadowRoot }).__stiShadow = shadow;
  }
  return shadow;
};

// Import AFTER the stub is installed — the content script reads chrome.storage at
// module scope.
await import("../src/content/index");

// ── On-page controls, so the harness is drivable without devtools ──────────────
const bar = document.createElement("div");
bar.style.cssText =
  "position:fixed;left:8px;bottom:8px;z-index:2147483646;display:flex;gap:6px;background:#fff;" +
  "border:1px solid #d8dde6;border-radius:8px;padding:6px 8px;font:12px 'Segoe UI',sans-serif;" +
  "box-shadow:0 4px 14px rgba(22,50,92,.18)";
const label = document.createElement("span");
label.textContent = "harness:";
label.style.cssText = "color:#706e6b;align-self:center";
bar.appendChild(label);

function control(text: string, onClick: () => void) {
  const b = document.createElement("button");
  b.textContent = text;
  b.style.cssText = "font:inherit;cursor:pointer;border:1px solid #d8dde6;background:#f8f9fb;border-radius:5px;padding:3px 8px";
  b.addEventListener("click", onClick);
  bar.appendChild(b);
}

control("Toggle Translate All", () => {
  chromeStub.storage.local.set({ settings: { ...settings, translationModeEnabled: !settings.translationModeEnabled } });
});
control("Inspection Mode (Alt)", () => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true, bubbles: true }));
});
document.body.appendChild(bar);
