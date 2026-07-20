import { useEffect, useState } from "react";
import type { Settings, TranslationHealthEntry } from "../shared/types";
import { TYPE_COLORS, TYPE_LABELS } from "../content/tooltip-constants";

const LANG_NAMES: Record<string, string> = {
  es: "Spanish", en_US: "English", fr: "French", nl_NL: "Dutch",
  de: "German", it: "Italian", pt_BR: "Portuguese (BR)", ja: "Japanese", zh_CN: "Chinese (CN)",
};

interface LoadedState {
  entries: TranslationHealthEntry[];
  languages: string[];
}

async function loadHealth(): Promise<LoadedState> {
  const stored = await chrome.storage.local.get(["translationHealth", "settings"]);
  const entries = (stored.translationHealth as TranslationHealthEntry[] | undefined) ?? [];
  const settings = stored.settings as Settings | undefined;
  return { entries, languages: settings?.activeLanguages ?? [] };
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

  const { entries, languages } = state;

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
      <p style={{ color: "#706e6b", fontSize: 13 }}>
        {entries.length} tracked element(s) across {languages.length} active language(s).
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #d8dde6" }}>
            <th style={{ padding: "8px 6px" }}>Language</th>
            <th style={{ padding: "8px 6px" }}>Missing</th>
            <th style={{ padding: "8px 6px" }}>Coverage</th>
          </tr>
        </thead>
        <tbody>
          {languages.map((lang) => {
            const missing = entries.filter((e) => e.missingLanguages.includes(lang));
            const coverage = Math.round(((entries.length - missing.length) / entries.length) * 100);
            const isExpanded = expandedLang === lang;
            return (
              <>
                <tr
                  key={lang}
                  onClick={() => setExpandedLang(isExpanded ? null : lang)}
                  style={{ borderBottom: "1px solid #eef1f6", cursor: "pointer" }}
                >
                  <td style={{ padding: "8px 6px", fontWeight: 600 }}>
                    {isExpanded ? "▾" : "▸"} {LANG_NAMES[lang] ?? lang} ({lang})
                  </td>
                  <td style={{ padding: "8px 6px", color: missing.length > 0 ? "#a06400" : "#1a7f4e" }}>
                    {missing.length}
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
                  <tr key={`${lang}-details`}>
                    <td colSpan={3} style={{ padding: "4px 6px 14px 24px", background: "#f9fafb" }}>
                      {missing.length === 0 ? (
                        <span style={{ color: "#1a7f4e", fontSize: 13 }}>Everything translated ✓</span>
                      ) : (
                        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
                          {missing.map((e) => {
                            const colors = TYPE_COLORS[e.type];
                            return (
                              <li key={e.apiName + e.type} style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                                  {TYPE_LABELS[e.type]}
                                </span>
                                <code style={{ fontSize: 12 }}>{e.apiName}</code>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
