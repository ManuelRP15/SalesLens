import { createRoot } from "react-dom/client";
import { MOCK_LABEL_ENTRIES } from "../src/shared/mock-data";
import { computeDuplicateClusters } from "../src/shared/duplicate-detection";
import { BASE_LANGUAGE, isInSimpleScope, type TranslationHealthEntry } from "../src/shared/types";

/**
 * Product Outcome Verification harness for the Translation Health page (DECISIONS.md #64).
 * It renders the REAL <Health/> component against representative data so the user-facing
 * result can be seen and screenshotted WITHOUT a live Salesforce org — the gate the factory
 * was missing. Data is DERIVED from the real mock set + the real `computeDuplicateClusters`
 * (not hand-faked); the tiny per-entry health computation is inlined only because its
 * production copy lives in the chrome-bound background and can't be imported here. NOT
 * shipped — separate dir + separate vite config, never seen by the extension build.
 */
const languages = ["es", "en_US", "fr", "nl_NL"];
const simpleMode = true;

const translationHealth: TranslationHealthEntry[] = MOCK_LABEL_ENTRIES
  .filter((e) => !simpleMode || isInSimpleScope(e.type))
  .map((e) => {
    const base = e.valuesByLang[BASE_LANGUAGE];
    return {
      apiName: e.apiName,
      type: e.type,
      missingLanguages: languages.filter((l) => !e.valuesByLang[l]),
      identicalToSourceLanguages: base
        ? languages.filter((l) => l !== BASE_LANGUAGE && e.valuesByLang[l] === base)
        : [],
    };
  });

const duplicateClusters = computeDuplicateClusters(MOCK_LABEL_ENTRIES, languages, simpleMode);

// Stub the only chrome API the Health page uses, BEFORE it mounts.
(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async () => ({
        translationHealth,
        duplicateClusters,
        settings: { activeLanguages: languages, flagIdenticalTranslations: true, simpleMode },
      }),
    },
  },
};

const { Health } = await import("../src/health/Health");
createRoot(document.getElementById("root")!).render(<Health />);
