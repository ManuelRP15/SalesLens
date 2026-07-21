import { useEffect, useMemo, useState } from "react";
import type { LabelType, WorkspaceEdit } from "../shared/types";
import { buildPackageXml, editKey, summarizeWorkspace } from "../shared/workspace";
import { langAccent, TYPE_COLORS, TYPE_LABELS } from "../content/tooltip-constants";

/**
 * PHASE 16 — the Workspace page: the silent record of every translation edit made
 * through the extension, grouped by metadata type, with before/after values and a
 * one-click package.xml of everything the edits touched. Same standalone-page pattern
 * as Translation Health (dedicated HTML entry opened from the popup via
 * chrome.tabs.create). It reads/writes ONLY `chrome.storage.local.workspaceEdits`;
 * capture happens in the background's saveTranslation — this page never invents rows.
 */

async function loadEdits(): Promise<WorkspaceEdit[]> {
  const stored = await chrome.storage.local.get("workspaceEdits");
  return (stored.workspaceEdits as WorkspaceEdit[] | undefined) ?? [];
}

function download(filename: string, mimeType: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const buttonStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 13,
  borderRadius: 4,
  border: "1px solid #d8dde6",
  background: "#fff",
  cursor: "pointer",
};

function LangChip({ code }: { code: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: langAccent(code), display: "inline-block" }} />
      {code}
    </span>
  );
}

/** Before → after, the comparator the captured oldValue exists for. */
function ValueDiff({ edit }: { edit: WorkspaceEdit }) {
  const empty = <em style={{ color: "#9aa0a6", fontStyle: "italic" }}>(empty)</em>;
  const reverted = edit.oldValue === edit.newValue;
  return (
    <span style={{ fontSize: 13 }}>
      <span style={{ color: "#706e6b", textDecoration: reverted ? "none" : "line-through" }}>
        {edit.oldValue === "" ? empty : edit.oldValue}
      </span>
      <span style={{ margin: "0 6px", color: "#9aa0a6" }}>→</span>
      <span style={{ fontWeight: 600 }}>{edit.newValue === "" ? empty : edit.newValue}</span>
      {reverted && <span style={{ marginLeft: 6, fontSize: 11, color: "#9aa0a6" }}>(edited back to the original)</span>}
    </span>
  );
}

export function Workspace() {
  const [edits, setEdits] = useState<WorkspaceEdit[] | null>(null);
  const [clearArmed, setClearArmed] = useState(false);

  useEffect(() => {
    void loadEdits().then(setEdits);
    // Live updates: edits made in another tab appear here without a manual refresh —
    // the "silent assistant" quality the phase asks for.
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && changes.workspaceEdits) {
        setEdits((changes.workspaceEdits.newValue as WorkspaceEdit[] | undefined) ?? []);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const groups = useMemo(() => {
    if (!edits) return [];
    const byType = new Map<LabelType, WorkspaceEdit[]>();
    for (const edit of edits) {
      const list = byType.get(edit.type) ?? [];
      list.push(edit);
      byType.set(edit.type, list);
    }
    return [...byType.entries()]
      .sort(([a], [b]) => TYPE_LABELS[a].localeCompare(TYPE_LABELS[b]))
      .map(([type, list]) => ({ type, list: [...list].sort((a, b) => b.timestamp - a.timestamp) }));
  }, [edits]);

  if (!edits) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  const summary = summarizeWorkspace(edits);

  const removeEdit = (edit: WorkspaceEdit) => {
    const next = edits.filter((e) => editKey(e) !== editKey(edit));
    setEdits(next);
    void chrome.storage.local.set({ workspaceEdits: next });
  };

  const clearAll = () => {
    // Two-stage, same discipline as the product's two-stage dismissal: destroying the
    // whole session record must never be one accidental click.
    if (!clearArmed) {
      setClearArmed(true);
      window.setTimeout(() => setClearArmed(false), 4000);
      return;
    }
    setClearArmed(false);
    setEdits([]);
    void chrome.storage.local.set({ workspaceEdits: [] });
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Workspace</h1>
        {edits.length > 0 && (
          <span style={{ fontSize: 13, color: "#706e6b" }}>
            {summary.editCount} change{summary.editCount === 1 ? "" : "s"} · {summary.componentCount} package
            component{summary.componentCount === 1 ? "" : "s"} ·{" "}
            {summary.languages.map((lang, i) => (
              <span key={lang} style={{ marginLeft: i === 0 ? 0 : 8 }}>
                <LangChip code={lang} />
              </span>
            ))}
          </span>
        )}
      </div>
      <p style={{ color: "#706e6b", fontSize: 13, marginTop: 6 }}>
        Every translation you save through the extension is tracked here automatically — nothing to manage. Download
        the package.xml to retrieve or deploy exactly what your edits touched.
      </p>

      {edits.length === 0 ? (
        <div
          style={{
            marginTop: 24,
            padding: "28px 24px",
            border: "1px dashed #d8dde6",
            borderRadius: 8,
            color: "#706e6b",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          No edits yet. Edit any translation from the hover tooltip or Translate All — it will appear here on its own,
          with its original value kept for comparison.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 18 }}>
            <button
              onClick={() => download("package.xml", "text/xml", buildPackageXml(edits))}
              style={{ ...buttonStyle, background: "#0176d3", borderColor: "#0176d3", color: "#fff", fontWeight: 600 }}
            >
              Download package.xml
            </button>
            <button onClick={() => download("workspace.json", "application/json", JSON.stringify(edits, null, 2))} style={buttonStyle}>
              Export JSON
            </button>
            <button
              onClick={clearAll}
              style={{
                ...buttonStyle,
                marginLeft: "auto",
                color: clearArmed ? "#fff" : "#ba0517",
                background: clearArmed ? "#ba0517" : "#fff",
                borderColor: clearArmed ? "#ba0517" : "#d8dde6",
              }}
            >
              {clearArmed ? "Click again to clear everything" : "Clear all"}
            </button>
          </div>

          {groups.map(({ type, list }) => {
            const colors = TYPE_COLORS[type];
            return (
              <section key={type} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      background: colors.bg,
                      color: colors.color,
                      borderRadius: 4,
                      padding: "2px 8px",
                    }}
                  >
                    {TYPE_LABELS[type]}
                  </span>
                  <span style={{ fontSize: 12, color: "#706e6b" }}>
                    {list.length} change{list.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                  {list.map((edit) => (
                    <li
                      key={editKey(edit)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 12px",
                        background: "#fff",
                        border: "1px solid #eef1f6",
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <code style={{ fontSize: 12 }}>{edit.apiName}</code>
                          <LangChip code={edit.language} />
                        </div>
                        <div style={{ marginTop: 3 }}>
                          <ValueDiff edit={edit} />
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: "#9aa0a6", whiteSpace: "nowrap" }}>
                        {new Date(edit.timestamp).toLocaleString()}
                      </span>
                      <button
                        onClick={() => removeEdit(edit)}
                        title="Remove from Workspace (does not undo the saved translation)"
                        style={{ ...buttonStyle, padding: "2px 8px", fontSize: 12, color: "#706e6b" }}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
