import { buildReverseIndex, resolveText, type ReverseIndex } from "../shared/index-builder";
import { MOCK_LABEL_ENTRIES } from "../shared/mock-data";
import { fetchAllTranslations, saveCustomLabelTranslation, toApiHost } from "../shared/salesforce-api";
import { fetchMetadataTranslationEntries } from "../shared/metadata-translations";
import { saveMetadataTranslation } from "../shared/metadata-write";
import { elementKey, normalizeStoredWorkspace, recordEdit, togglePin } from "../shared/workspace";
import { isEditableEntry, isInSimpleScope } from "../shared/types";
import type {
  ResolveTextRequest,
  ResolveTextResponse,
  ResolveTextsBulkRequest,
  ResolveTextsBulkResponse,
  GetSettingsRequest,
  SaveTranslationRequest,
  SaveTranslationResponse,
  Settings,
  LabelEntry,
  ToggleWorkspacePinRequest,
  ToggleWorkspacePinResponse,
  WorkspaceEdit,
  WorkspaceItem,
} from "../shared/types";

console.log("[STI] ### background loaded - PHASE 4 version ###");

const DEFAULT_SETTINGS: Settings = {
  activeLanguages: ["es", "en_US", "fr", "nl_NL"],
  enabled: false,
  lastIndexRefresh: null,
  translationModeEnabled: false,
  tmPreset: "stacked",
  tmShowFlags: true,
  tmShowLangCodes: true,
  inspectorHotkey: "Alt",
  holdHotkey: "Shift",
  tmHotkey: "Alt+T",
  simpleMode: true,
  flagIdenticalTranslations: true,
};

let reverseIndex: ReverseIndex = buildReverseIndex(MOCK_LABEL_ENTRIES);
// Same entries the reverse index was built from, kept as a flat list too — the index
// is keyed by displayed TEXT (many-to-one), which can't answer "find the entry for
// this exact apiName+type" the way SAVE_TRANSLATION needs to. Always kept in sync
// with reverseIndex by construction (both are only ever (re)assigned together, in
// setIndexFromRealData and on cache restore below).
let allEntries: LabelEntry[] = MOCK_LABEL_ENTRIES;

// MV3 service workers get killed by Chrome after a short idle period; when a new
// event wakes this one back up, the module re-executes from scratch and the line
// above would silently reset to mock data until something re-triggers LOAD_LABELS.
// Restoring from chrome.storage.local here closes that gap within milliseconds of
// waking up, instead of leaving the user on stale mock data until a manual refresh.
void chrome.storage.local.get("cachedEntries").then((stored) => {
  const cached = stored.cachedEntries as LabelEntry[] | undefined;
  if (cached && cached.length > 0) {
    allEntries = cached;
    reverseIndex = buildReverseIndex(cached);
    console.log(`[STI] restored ${cached.length} cached entries after service worker wake-up`);
  }
});

/**
 * A synchronous mirror of storage's `settings`, kept fresh via `chrome.storage.onChanged`
 * below — RESOLVE_TEXT/RESOLVE_TEXTS_BULK need `simpleMode` on the hot hover path
 * (rule: hover must feel instant), and an async `chrome.storage.local.get` per hover
 * would be exactly the kind of latency this project's speed bar exists to prevent.
 * `getSettings()` remains the source of truth for anything that can afford to be async.
 */
let cachedSettings: Settings = DEFAULT_SETTINGS;
void chrome.storage.local.get("settings").then((stored) => {
  cachedSettings = { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    cachedSettings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue as Partial<Settings> | undefined) };
  }
});

async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings as Partial<Settings> | undefined) };
}

async function getSessionId(apiHost: string): Promise<string | null> {
  try {
    const cookie = await chrome.cookies.get({ url: apiHost, name: "sid" });
    console.log(
      "[STI][DEBUG] sid at", apiHost, "->",
      cookie
        ? { domain: cookie.domain, hostOnly: cookie.hostOnly, valuePreview: cookie.value.slice(0, 12) + "…" }
        : null
    );
    return cookie?.value ?? null;
  } catch (err) {
    console.warn("[STI] could not read the 'sid' cookie:", err);
    return null;
  }
}

/**
 * Applies `settings.simpleMode` to a resolveText() result — the ONE choke point both
 * hover (RESOLVE_TEXT) and Translation Mode (RESOLVE_TEXTS_BULK) go through, so
 * scoping stays consistent between them without touching resolveText's own
 * disambiguation logic (index-builder.ts) at all. Since resolveText already guarantees
 * 0-or-1 candidates (rule #4), filtering out an out-of-scope one just means "no match" —
 * same silence-over-a-wrong-answer shape as every other suppression in this project.
 */
function applySimpleScope(response: ResolveTextResponse, simpleMode: boolean): ResolveTextResponse {
  if (!simpleMode) return response;
  const candidates = response.candidates.filter((c) => isInSimpleScope(c.type));
  return candidates.length === response.candidates.length ? response : { candidates, highConfidence: false };
}

async function setIndexFromRealData(entries: LabelEntry[]): Promise<void> {
  allEntries = entries;
  reverseIndex = buildReverseIndex(entries);
  const byType = entries.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log("[STI] index rebuilt:", byType);

  const settings = await getSettings();
  await chrome.storage.local.set({
    settings: { ...settings, lastIndexRefresh: Date.now() } satisfies Settings,
    cachedEntries: entries,
  });
  // Translation Health was removed from the product (DECISIONS.md #66) — clear the
  // key its page used to read so retired data doesn't linger in users' storage.
  await chrome.storage.local.remove("translationHealth");
}

async function loadLabels(pageOrigin: string, pageObjectApiName: string | null | undefined): Promise<void> {
  const apiHost = toApiHost(pageOrigin);
  const sessionId = await getSessionId(apiHost);
  if (!sessionId) {
    console.warn(`[STI] no 'sid' cookie for ${apiHost}; using sample data.`);
    return;
  }
  // The org origin the index was loaded from — extension pages (the Workspace) need it
  // to build absolute Setup links, since THEIR window.location is chrome-extension://.
  await chrome.storage.local.set({ lastOrgOrigin: pageOrigin });
  try {
    const settings = await getSettings();
    const [customLabelEntries, metadataEntries] = await Promise.all([
      fetchAllTranslations(apiHost, sessionId),
      fetchMetadataTranslationEntries(apiHost, sessionId, settings.activeLanguages, pageObjectApiName),
    ]);
    const entries = [...customLabelEntries, ...metadataEntries];
    console.log(`[STI] Total entries: ${entries.length} (Custom Labels: ${customLabelEntries.length}, Metadata API: ${metadataEntries.length})`);
    await setIndexFromRealData(entries);
  } catch (err) {
    console.warn(`[STI] failed to query ${apiHost}:`, err);
  }
}

/**
 * PHASE 6/6b: persists one language's edited value for any editable type (see
 * isEditableEntry) and folds the change back into the live index — same
 * setIndexFromRealData path a full refresh uses, so the reverse index and the
 * persisted cache both pick up the edit immediately, with no separate
 * "apply this one edit" logic to keep in sync. Two write mechanisms share this one
 * function: CustomLabel goes through the Tooling API (saveCustomLabelTranslation,
 * fast, synchronous PATCH/POST); everything else goes through a Metadata API deploy()
 * (saveMetadataTranslation, slower, retrieve-then-deploy) — see DECISIONS.md #53.
 * The editability check needs the full ENTRY, not just labelType (DECISIONS.md #56 —
 * standard vs. custom fields/picklists need different, not-both-built write paths), so
 * the entry lookup happens BEFORE the gate now, not after.
 */
async function saveTranslation(req: SaveTranslationRequest): Promise<SaveTranslationResponse> {
  const entry = allEntries.find((e) => e.type === req.labelType && e.apiName === req.apiName);
  if (!entry) {
    return { ok: false, error: "Couldn't find this entry anymore — try refreshing the index." };
  }
  if (!isEditableEntry(entry)) {
    return { ok: false, error: "This metadata type can't be edited from here yet." };
  }

  const apiHost = toApiHost(req.origin);
  const sessionId = await getSessionId(apiHost);
  if (!sessionId) {
    return { ok: false, error: "No active Salesforce session for this org." };
  }

  try {
    const result =
      req.labelType === "CustomLabel"
        ? await saveCustomLabelTranslation(apiHost, sessionId, entry, req.language, req.value, req.expectedValue)
        : await saveMetadataTranslation(apiHost, sessionId, entry, req.language, req.value, req.expectedValue);

    if (result.conflict) {
      // Someone else changed this language since the editor opened — the write never
      // happened. Fold the real current value back into the local cache (we just read
      // it live, it's more accurate than whatever we had) so the caller can show it
      // immediately without a second refresh, and report the conflict instead of
      // pretending the save succeeded.
      entry.valuesByLang[req.language] = result.currentValue;
      await setIndexFromRealData(allEntries);
      return { ok: false, conflict: true, currentValue: result.currentValue, entry, error: "This translation was changed by someone else — not saved." };
    }

    entry.valuesByLang[req.language] = req.value;
    if (result.newLocalizationId) {
      entry.localizationIdsByLang = { ...(entry.localizationIdsByLang ?? {}), [req.language]: result.newLocalizationId };
    }
    // For the deploy()-backed types, a successful save just WROTE an admin override for
    // this language — record that so (a) the "✎ customized" mark shows immediately and
    // (b) a SECOND edit in the same session compares against the override we just wrote,
    // not against "no override" (which would otherwise report a bogus conflict — the
    // mirror image of the blanking bug fixed in metadata-write.ts, see DECISIONS.md #54).
    // CustomLabels have no standard/override distinction, so they're left untouched.
    if (req.labelType !== "CustomLabel") {
      const customized = new Set(entry.customizedLanguages ?? []);
      customized.add(req.language);
      entry.customizedLanguages = [...customized];
    }
    await setIndexFromRealData(allEntries);

    // PHASE 16 (Workspace): a successful save is the ONE capture point — the edit and
    // its pre-edit value feed the Workspace automatically. `expectedValue` is the
    // effective value the user saw when the editor opened, which the write path just
    // verified against the live org — exactly the "before" the comparator (and a
    // future Safe Undo) needs. Capture must never break the save it records (the
    // write already happened), so failures only log.
    let workspaceCaptureKind: SaveTranslationResponse["workspaceCaptureKind"];
    try {
      const { wasNew } = await recordWorkspaceEdit({
        kind: "edit",
        type: req.labelType,
        apiName: req.apiName,
        language: req.language,
        oldValue: req.expectedValue,
        newValue: req.value,
        timestamp: Date.now(),
      });
      workspaceCaptureKind = wasNew ? "added" : "updated";
    } catch (err) {
      console.warn("[STI] workspace capture failed:", err);
    }

    return { ok: true, entry, workspaceCaptureKind };
  } catch (err) {
    console.warn("[STI] saveTranslation error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Save failed." };
  }
}

/**
 * PHASE 16: the persisted Workspace, read with v1→v2 migration applied
 * (`workspaceEdits` bare rows → `workspaceItems` with `kind`, see
 * shared/workspace.ts's normalizeStoredWorkspace).
 */
async function loadWorkspaceItems(): Promise<WorkspaceItem[]> {
  const stored = await chrome.storage.local.get(["workspaceItems", "workspaceEdits"]);
  return normalizeStoredWorkspace(stored.workspaceItems, stored.workspaceEdits);
}

async function storeWorkspaceItems(items: WorkspaceItem[]): Promise<void> {
  await chrome.storage.local.set({ workspaceItems: items });
  // The legacy v1 key is folded into workspaceItems on every read — remove it so the
  // migration happens exactly once instead of duplicating rows on the next load.
  await chrome.storage.local.remove("workspaceEdits");
}

/**
 * PHASE 16: folds one captured edit into the persisted Workspace (fold rule:
 * shared/workspace.ts's recordEdit). Returns whether the element (any edit or pin,
 * not just this exact language) already had a Workspace presence BEFORE this fold —
 * Workspace v4's (`DECISIONS.md #68`) "Added" vs. "Updated" capture message needs to
 * know this, and this is the one place that already loads the Workspace to check.
 */
async function recordWorkspaceEdit(edit: WorkspaceEdit): Promise<{ wasNew: boolean }> {
  const existing = await loadWorkspaceItems();
  const key = elementKey(edit.type, edit.apiName);
  const wasNew = !existing.some((i) => elementKey(i.type, i.apiName) === key);
  await storeWorkspaceItems(recordEdit(existing, edit));
  return { wasNew };
}

/**
 * PHASE 16 v2 (DECISIONS.md #66): the tooltip's "Add to Workspace" — pins an element,
 * snapshotting its values from the background's OWN index (the authoritative copy the
 * tooltip's display came from), so drift detection later compares like with like.
 */
async function toggleWorkspacePin(req: ToggleWorkspacePinRequest): Promise<ToggleWorkspacePinResponse> {
  const entry = allEntries.find((e) => e.type === req.labelType && e.apiName === req.apiName);
  const result = togglePin(await loadWorkspaceItems(), {
    kind: "pin",
    type: req.labelType,
    apiName: req.apiName,
    snapshot: { ...(entry?.valuesByLang ?? {}) },
    timestamp: Date.now(),
  });
  await storeWorkspaceItems(result.items);
  return { pinned: result.pinned };
}

type IncomingMessage =
  | ResolveTextRequest
  | ResolveTextsBulkRequest
  | GetSettingsRequest
  | SaveTranslationRequest
  | ToggleWorkspacePinRequest
  | { type: "LOAD_LABELS"; origin: string; pageObjectApiName?: string | null };

chrome.runtime.onMessage.addListener((message: IncomingMessage, _sender, sendResponse) => {
  if (message.type === "LOAD_LABELS") {
    void loadLabels(message.origin, message.pageObjectApiName)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => { console.warn("[STI] loadLabels error:", err); sendResponse({ ok: false }); });
    return true;
  }

  if (message.type === "RESOLVE_TEXT") {
    const raw = resolveText(reverseIndex, message.text, message.hints);
    const { candidates, highConfidence } = applySimpleScope(raw, cachedSettings.simpleMode);
    console.log(
      "[STI] RESOLVE_TEXT:", JSON.stringify(message.text),
      "hints:", JSON.stringify(message.hints),
      "→", candidates.map((c) => `${c.apiName}(${c.type})`),
      "highConfidence:", highConfidence
    );
    sendResponse({ candidates, highConfidence } satisfies ResolveTextResponse);
    return false;
  }

  if (message.type === "RESOLVE_TEXTS_BULK") {
    const results = message.items.map(({ text, hints }) =>
      applySimpleScope(resolveText(reverseIndex, text, hints), cachedSettings.simpleMode)
    );
    sendResponse({ results } satisfies ResolveTextsBulkResponse);
    return false;
  }

  if (message.type === "GET_SETTINGS") {
    void getSettings().then((settings) => sendResponse(settings));
    return true;
  }

  if (message.type === "SAVE_TRANSLATION") {
    void saveTranslation(message).then(sendResponse);
    return true;
  }

  if (message.type === "WORKSPACE_TOGGLE_PIN") {
    void toggleWorkspacePin(message)
      .then(sendResponse)
      .catch((err) => {
        console.warn("[STI] workspace pin toggle failed:", err);
        sendResponse({ pinned: false } satisfies ToggleWorkspacePinResponse);
      });
    return true;
  }

  return false;
});
