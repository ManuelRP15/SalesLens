import { Fragment, useEffect, useState } from "react";
import type { DuplicateCluster, DuplicateClusterReport, LabelType, Settings, TranslationHealthEntry } from "../shared/types";
import { TYPE_COLORS, TYPE_LABELS } from "../content/tooltip-constants";

const LANG_NAMES: Record<string, string> = {
  es: "Spanish", en_US: "English", fr: "French", nl_NL: "Dutch",
  de: "German", it: "Italian", pt_BR: "Portuguese (BR)", ja: "Japanese", zh_CN: "Chinese (CN)",
};

interface LoadedState {
  entries: TranslationHealthEntry[];
  duplicates: DuplicateClusterReport;
  languages: string[];
  flagIdentical: boolean;
}

async function loadHealth(): Promise<LoadedState> {
  const stored = await chrome.storage.local.get(["translationHealth", "duplicateClusters", "settings"]);
  const entries = (stored.translationHealth as TranslationHealthEntry[] | undefined) ?? [];
  const duplicates = (stored.duplicateClusters as DuplicateClusterReport | undefined) ?? {};
  const settings = stored.settings as Settings | undefined;
  return {
    entries,
    duplicates,
    languages: settings?.activeLanguages ?? [],
    flagIdentical: settings?.flagIdenticalTranslations ?? true,
  };
}

/** One `TYPE  apiName` row — the single shared shape for every element listed in the detail panel (Missing, Possibly untranslated, and each duplicate cluster's members), so all three read as one system. */
function ElementRow({ apiName, type }: { apiName: string; type: LabelType }) {
  const colors = TYPE_COLORS[type];
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          background: colors.bg,
          color: colors.color,
          borderRadius: 4,
          padding: "1px 6px",
          whiteSpace: "nowrap",
        }}
      >
        {TYPE_LABELS[type]}
      </span>
      <code style={{ fontSize: 12 }}>{apiName}</code>
    </li>
  );
}

/** A labeled group of element rows — used for "Missing" and "Possibly untranslated". */
function renderEntryList(label: string, entries: TranslationHealthEntry[]) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", color: "#706e6b", marginBottom: 4 }}>{label}</div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
        {entries.map((e) => (
          <ElementRow key={e.apiName + e.type} apiName={e.apiName} type={e.type} />
        ))}
      </ul>
    </div>
  );
}

/** The duplicate detail: each shared value, then the elements that repeat it. Same badge vocabulary as `renderEntryList` so duplicates read as one more health signal, not a separate feature. */
function renderClusterList(label: string, clusters: DuplicateCluster[]) {
  return (
    <div>
      <div style={{ fontSize: 11, textTransform: "uppercase", color: "#706e6b", marginBottom: 4 }}>{label}</div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
        {clusters.map((c) => (
          <li key={c.value} style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13 }}>
              “<span style={{ fontWeight: 600 }}>{c.value}</span>” — used by {c.members.length}
            </span>
            <ul style={{ margin: "0 0 0 12px", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
              {c.members.map((m) => (
                <ElementRow key={m.apiName + m.type} apiName={m.apiName} type={m.type} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A single at-a-glance figure in the overview strip. Typographic emphasis only (a big
 * number + a quiet label), never a coloured tile — a report, not a dashboard (P6/#62). */
function SummaryStat({ label, value, tone }: { label: string; value: number; tone: "neutral" | "ok" | "warn" | "soft" }) {
  const color = tone === "warn" ? "#a06400" : tone === "soft" ? "#b8860b" : tone === "ok" ? "#1a7f4e" : "#514f4d";
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 90 }}>
      <span style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</span>
      <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.3, color: "#706e6b" }}>{label}</span>
    </div>
  );
}

export function Health() {
  const [state, setState] = useState<LoadedState | null>(null);
  const [expandedLang, setExpandedLang] = useState<string | null>(null);

  useEffect(() => {
    void loadHealth().then(setState);
  }, []);

  if (!state) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  const { entries, duplicates, languages, flagIdentical } = state;

  if (entries.length === 0) {
    return (
      <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20 }}>Translation Health</h1>
        <p style={{ color: "#706e6b" }}>
          No data yet — open a Salesforce Lightning tab with the extension enabled and hit "Refresh" in the popup first.
        </p>
      </div>
    );
  }

  // Language + Missing + [Possibly untranslated] + Duplicated + Coverage.
  const detailColSpan = flagIdentical ? 5 : 4;

  // Org-wide overview counts (distinct elements affected, and total duplicate clusters).
  const elementsMissing = entries.filter((e) => e.missingLanguages.length > 0).length;
  const elementsIdentical = entries.filter((e) => e.identicalToSourceLanguages.length > 0).length;
  const duplicateClusterCount = Object.values(duplicates).reduce((sum, clusters) => sum + clusters.length, 0);

  return (
    <div style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Translation Health</h1>
        <button
          onClick={() => void loadHealth().then(setState)}
          style={{
            padding: "6px 14px",
            fontSize: 13,
            borderRadius: 4,
            border: "1px solid #d8dde6",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>
      <p style={{ color: "#706e6b", fontSize: 13, margin: "4px 0 0" }}>
        {entries.length} tracked element(s) across {languages.length} active language(s).
      </p>

      <div
        style={{
          display: "flex",
          gap: 28,
          flexWrap: "wrap",
          padding: "14px 0",
          margin: "10px 0",
          borderTop: "1px solid #eef1f6",
          borderBottom: "1px solid #eef1f6",
        }}
      >
        <SummaryStat label="Elements" value={entries.length} tone="neutral" />
        <SummaryStat label="Missing ≥1 lang" value={elementsMissing} tone={elementsMissing > 0 ? "warn" : "ok"} />
        {flagIdentical && (
          <SummaryStat label="Possibly untranslated" value={elementsIdentical} tone={elementsIdentical > 0 ? "soft" : "ok"} />
        )}
        <SummaryStat label="Duplicated values" value={duplicateClusterCount} tone={duplicateClusterCount > 0 ? "soft" : "ok"} />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #d8dde6" }}>
            <th style={{ padding: "8px 6px" }}>Language</th>
            <th style={{ padding: "8px 6px" }}>Missing</th>
            {flagIdentical && <th style={{ padding: "8px 6px" }}>Possibly untranslated</th>}
            <th style={{ padding: "8px 6px" }}>Duplicated</th>
            <th style={{ padding: "8px 6px" }}>Coverage</th>
          </tr>
        </thead>
        <tbody>
          {languages.map((lang) => {
            const missing = entries.filter((e) => e.missingLanguages.includes(lang));
            const identical = entries.filter((e) => e.identicalToSourceLanguages.includes(lang));
            const dupes = duplicates[lang] ?? [];
            const coverage = Math.round(((entries.length - missing.length) / entries.length) * 100);
            const isExpanded = expandedLang === lang;
            return (
              <Fragment key={lang}>
                <tr
                  onClick={() => setExpandedLang(isExpanded ? null : lang)}
                  style={{ borderBottom: "1px solid #eef1f6", cursor: "pointer" }}
                >
                  <td style={{ padding: "8px 6px", fontWeight: 600 }}>
                    {isExpanded ? "▾" : "▸"} {LANG_NAMES[lang] ?? lang} ({lang})
                  </td>
                  <td style={{ padding: "8px 6px", color: missing.length > 0 ? "#a06400" : "#1a7f4e" }}>
                    {missing.length}
                  </td>
                  {flagIdentical && (
                    <td style={{ padding: "8px 6px", color: identical.length > 0 ? "#b8860b" : "#706e6b" }}>
                      {identical.length}
                    </td>
                  )}
                  <td style={{ padding: "8px 6px", color: dupes.length > 0 ? "#b8860b" : "#706e6b" }}>
                    {dupes.length}
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, background: "#eef1f6", borderRadius: 4, height: 8, maxWidth: 160 }}>
                        <div
                          style={{
                            width: `${coverage}%`,
                            background: coverage === 100 ? "#1a7f4e" : "#a06400",
                            height: "100%",
                            borderRadius: 4,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12, color: "#706e6b" }}>{coverage}%</span>
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={detailColSpan} style={{ padding: "4px 6px 14px 24px", background: "#f9fafb" }}>
                      {missing.length === 0 && identical.length === 0 && dupes.length === 0 ? (
                        <span style={{ color: "#1a7f4e", fontSize: 13 }}>Everything translated ✓</span>
                      ) : (
                        <div style={{ display: "grid", gap: 10 }}>
                          {missing.length > 0 && renderEntryList("Missing", missing)}
                          {flagIdentical && identical.length > 0 &&
                            renderEntryList("Possibly untranslated — identical to the source language", identical)}
                          {dupes.length > 0 &&
                            renderClusterList("Duplicated — the same value used by multiple elements", dupes)}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
