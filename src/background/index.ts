import { buildReverseIndex, resolveText, type ReverseIndex } from "../shared/index-builder";
import { MOCK_LABEL_ENTRIES } from "../shared/mock-data";
import { fetchAllTranslations, saveCustomLabelTranslation, toApiHost } from "../shared/salesforce-api";
import { fetchMetadataTranslationEntries } from "../shared/metadata-translations";
import { saveMetadataTranslation } from "../shared/metadata-write";
import { isEditableLabelType } from "../shared/types";
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
  TranslationHealthEntry,
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
  tmHotkey: "Alt+T",
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

/** Which of the user's active languages each entry has no translated value for. */
function computeTranslationHealth(entries: LabelEntry[], languages: string[]): TranslationHealthEntry[] {
  return entries.map((entry) => ({
    apiName: entry.apiName,
    type: entry.type,
    missingLanguages: languages.filter((lang) => !entry.valuesByLang[lang]),
  }));
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
  const translationHealth = computeTranslationHealth(entries, settings.activeLanguages);
  await chrome.storage.local.set({
    settings: { ...settings, lastIndexRefresh: Date.now() } satisfies Settings,
    cachedEntries: entries,
    translationHealth,
  });
}

async function loadLabels(pageOrigin: string, pageObjectApiName: string | null | undefined): Promise<void> {
  const apiHost = toApiHost(pageOrigin);
  const sessionId = await getSessionId(apiHost);
  if (!sessionId) {
    console.warn(`[STI] no 'sid' cookie for ${apiHost}; using sample data.`);
    return;
  }
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
 * isEditableLabelType) and folds the change back into the live index — same
 * setIndexFromRealData path a full refresh uses, so the reverse index, the persisted
 * cache, and Translation Health all pick up the edit immediately, with no separate
 * "apply this one edit" logic to keep in sync. Two write mechanisms share this one
 * function: CustomLabel goes through the Tooling API (saveCustomLabelTranslation,
 * fast, synchronous PATCH/POST); everything else goes through a Metadata API deploy()
 * (saveMetadataTranslation, slower, retrieve-then-deploy) — see DECISIONS.md #53.
 */
async function saveTranslation(req: SaveTranslationRequest): Promise<SaveTranslationResponse> {
  if (!isEditableLabelType(req.labelType)) {
    return { ok: false, error: "This metadata type can't be edited from here yet." };
  }
  const entry = allEntries.find((e) => e.type === req.labelType && e.apiName === req.apiName);
  if (!entry) {
    return { ok: false, error: "Couldn't find this entry anymore — try refreshing the index." };
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
    await setIndexFromRealData(allEntries);
    return { ok: true, entry };
  } catch (err) {
    console.warn("[STI] saveTranslation error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Save failed." };
  }
}

type IncomingMessage =
  | ResolveTextRequest
  | ResolveTextsBulkRequest
  | GetSettingsRequest
  | SaveTranslationRequest
  | { type: "LOAD_LABELS"; origin: string; pageObjectApiName?: string | null };

chrome.runtime.onMessage.addListener((message: IncomingMessage, _sender, sendResponse) => {
  if (message.type === "LOAD_LABELS") {
    void loadLabels(message.origin, message.pageObjectApiName)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => { console.warn("[STI] loadLabels error:", err); sendResponse({ ok: false }); });
    return true;
  }

  if (message.type === "RESOLVE_TEXT") {
    const { candidates, highConfidence } = resolveText(reverseIndex, message.text, message.hints);
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
    const results = message.items.map(({ text, hints }) => {
      const { candidates, highConfidence } = resolveText(reverseIndex, text, hints);
      return { candidates, highConfidence } satisfies ResolveTextResponse;
    });
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

  return false;
});
