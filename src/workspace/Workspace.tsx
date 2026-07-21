import { useEffect, useMemo, useState } from "react";
import type { LabelEntry, LabelType, Settings, WorkspaceItem } from "../shared/types";
import {
  assessDrift,
  buildPackageXml,
  itemKey,
  normalizeStoredWorkspace,
  summarizeWorkspace,
  type WorkspaceDrift,
} from "../shared/workspace";
import { langAccent, setupPath, TYPE_COLORS, TYPE_LABELS } from "../content/tooltip-constants";
import "./workspace.css";

/**
 * PHASE 16 v2 (`DECISIONS.md #66`) — the Workspace page: the product's memory.
 * Everything the user edited (captured automatically on save) or pinned from the
 * inspector, grouped by type, with before/after values, change-detection against the
 * background's index ("changed since you captured it"), search + type/status filters,
 * Setup navigation back to the element, and package.xml / JSON export.
 *
 * It reads `workspaceItems` (+ the v1 `workspaceEdits` key via migration),
 * `cachedEntries` (drift baseline), `settings` and `lastOrgOrigin` from
 * `chrome.storage.local`; capture happens in the background — this page never invents
 * rows. Live-updates via `chrome.storage.onChanged`.
 */

interface LoadedState {
  items: WorkspaceItem[];
  entriesByKey: Map<string, LabelEntry>;
  orgOrigin: string | null;
  lastIndexRefresh: number | null;
}

function entryKeyOf(type: LabelType, apiName: string): string {
  return `${type} ${apiName}`;
}

async function loadState(): Promise<LoadedState> {
  const stored = await chrome.storage.local.get(["workspaceItems", "workspaceEdits", "cachedEntries", "settings", "lastOrgOrigin"]);
  const entries = (stored.cachedEntries as LabelEntry[] | undefined) ?? [];
  return {
    items: normalizeStoredWorkspace(stored.workspaceItems, stored.workspaceEdits),
    entriesByKey: new Map(entries.map((e) => [entryKeyOf(e.type, e.apiName), e])),
    orgOrigin: (stored.lastOrgOrigin as string | undefined) ?? null,
    lastIndexRefresh: (stored.settings as Settings | undefined)?.lastIndexRefresh ?? null,
  };
}

function download(filename: string, mimeType: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** "just now" / "12 min ago" / "3 h ago" / date — compact enough to sit on every row. */
function timeAgo(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString();
}

function LangChip({ code }: { code: string }) {
  return (
    <span className="ws-lang">
      <span className="ws-lang__dot" style={{ background: langAccent(code) }} />
      {code}
    </span>
  );
}

function ValueText({ value }: { value: string }) {
  return value === "" ? <em className="ws-values__empty">(empty)</em> : <>{value}</>;
}

type StatusFilter = "all" | "edits" | "pins" | "changed";

interface RowModel {
  item: WorkspaceItem;
  entry: LabelEntry | undefined;
  drift: WorkspaceDrift;
}

function rowMatchesSearch(row: RowModel, needle: string): boolean {
  if (row.item.apiName.toLowerCase().includes(needle)) return true;
  if (row.item.kind === "edit") {
    return row.item.newValue.toLowerCase().includes(needle) || row.item.oldValue.toLowerCase().includes(needle);
  }
  return Object.values(row.item.snapshot).some((v) => v.toLowerCase().includes(needle));
}

function WorkspaceRow({ row, orgOrigin, onRemove }: { row: RowModel; orgOrigin: string | null; onRemove: (item: WorkspaceItem) => void }) {
  const { item, entry, drift } = row;
  const changed = drift.state === "changed";
  const setupHref = entry && orgOrigin ? setupPath(entry) : null;
  const rowClass = `ws-row${item.kind === "pin" ? " ws-row--pin" : ""}${changed ? " ws-row--changed" : ""}`;

  return (
    <li className={rowClass}>
      <div className="ws-row__main">
        <div className="ws-row__head">
          <code className="ws-row__api" title={item.apiName}>{item.apiName}</code>
          <button
            type="button"
            className="ws-icon-btn"
            title="Copy API name"
            onClick={() => void navigator.clipboard.writeText(item.apiName)}
          >
            ⧉
          </button>
          {item.kind === "edit" ? (
            <span className="ws-kind">
              ✎ edited <LangChip code={item.language} />
            </span>
          ) : (
            <span className="ws-kind">
              📌 pinned · {Object.keys(item.snapshot).length} language{Object.keys(item.snapshot).length === 1 ? "" : "s"} captured
            </span>
          )}
          {setupHref && (
            <a className="ws-setup-link" href={`${orgOrigin}${setupHref}`} target="_blank" rel="noopener noreferrer">
              Open in Setup ↗
            </a>
          )}
        </div>

        {item.kind === "edit" && (
          <div className="ws-values">
            <span className={`ws-values__old${item.oldValue === item.newValue ? " ws-values__old--kept" : ""}`}>
              <ValueText value={item.oldValue} />
            </span>
            <span className="ws-values__arrow">→</span>
            <span className="ws-values__new">
              <ValueText value={item.newValue} />
            </span>
            {item.oldValue === item.newValue && <span className="ws-values__note">(edited back to the original)</span>}
          </div>
        )}

        {changed &&
          drift.changes.map((c) => (
            <div key={c.language} className="ws-drift">
              <span className="ws-drift__lang">{c.language}</span> changed in the org since{" "}
              {item.kind === "edit" ? "your edit" : "you captured it"}:{" "}
              <ValueText value={c.capturedValue} /> <span className="ws-values__arrow">→</span>{" "}
              <strong>
                <ValueText value={c.currentValue} />
              </strong>
            </div>
          ))}

        {drift.state === "unknown" && (
          <div className="ws-unknown">Not in the current index — change detection unavailable for this element.</div>
        )}
      </div>

      <div className="ws-row__side">
        <span className="ws-time" title={new Date(item.timestamp).toLocaleString()}>
          {timeAgo(item.timestamp)}
        </span>
        <button
          type="button"
          className="ws-remove"
          title="Remove from Workspace (does not undo any saved translation)"
          onClick={() => onRemove(item)}
        >
          ✕
        </button>
      </div>
    </li>
  );
}

export function Workspace() {
  const [state, setState] = useState<LoadedState | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ReadonlySet<LabelType>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [clearArmed, setClearArmed] = useState(false);

  useEffect(() => {
    void loadState().then(setState);
    // Live updates: an edit saved or an element pinned in a Salesforce tab appears
    // here without a refresh — the page is a live view of the same storage.
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      if (changes.workspaceItems || changes.workspaceEdits || changes.cachedEntries || changes.settings) {
        void loadState().then(setState);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const rows = useMemo<RowModel[]>(() => {
    if (!state) return [];
    return state.items.map((item) => {
      const entry = state.entriesByKey.get(entryKeyOf(item.type, item.apiName));
      return { item, entry, drift: assessDrift(item, entry) };
    });
  }, [state]);

  const changedCount = rows.filter((r) => r.drift.state === "changed").length;

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === "edits" && row.item.kind !== "edit") return false;
      if (statusFilter === "pins" && row.item.kind !== "pin") return false;
      if (statusFilter === "changed" && row.drift.state !== "changed") return false;
      if (typeFilter.size > 0 && !typeFilter.has(row.item.type)) return false;
      if (needle && !rowMatchesSearch(row, needle)) return false;
      return true;
    });
  }, [rows, search, typeFilter, statusFilter]);

  const groups = useMemo(() => {
    const byType = new Map<LabelType, RowModel[]>();
    for (const row of visibleRows) {
      const list = byType.get(row.item.type) ?? [];
      list.push(row);
      byType.set(row.item.type, list);
    }
    return [...byType.entries()]
      .sort(([a], [b]) => TYPE_LABELS[a].localeCompare(TYPE_LABELS[b]))
      .map(([type, list]) => ({ type, list: [...list].sort((a, b) => b.item.timestamp - a.item.timestamp) }));
  }, [visibleRows]);

  if (!state) {
    return <div className="ws-page">Loading…</div>;
  }

  const { items } = state;
  const summary = summarizeWorkspace(items);
  const presentTypes = [...new Set(items.map((i) => i.type))].sort((a, b) => TYPE_LABELS[a].localeCompare(TYPE_LABELS[b]));
  const oldestTimestamp = items.length > 0 ? Math.min(...items.map((i) => i.timestamp)) : null;

  const persist = (next: WorkspaceItem[]) => {
    setState({ ...state, items: next });
    void chrome.storage.local.set({ workspaceItems: next });
  };

  const removeItem = (item: WorkspaceItem) => {
    persist(items.filter((i) => itemKey(i) !== itemKey(item)));
  };

  const clearAll = () => {
    // Two-stage, same discipline as the product's two-stage dismissal (#55/#63):
    // destroying the whole record must never be one accidental click.
    if (!clearArmed) {
      setClearArmed(true);
      window.setTimeout(() => setClearArmed(false), 4000);
      return;
    }
    setClearArmed(false);
    persist([]);
  };

  const toggleType = (type: LabelType) => {
    const next = new Set(typeFilter);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setTypeFilter(next);
  };

  const statusTabs: Array<{ id: StatusFilter; label: string; count: number }> = [
    { id: "all", label: "All", count: items.length },
    { id: "edits", label: "Edited", count: summary.editCount },
    { id: "pins", label: "Pinned", count: summary.pinCount },
    { id: "changed", label: "Changed", count: changedCount },
  ];

  return (
    <div className="ws-page">
      <header className="ws-header">
        <div>
          <h1>Workspace</h1>
          <p className="ws-subtitle">
            Everything you edit or pin while inspecting is captured here automatically — nothing to manage.
          </p>
        </div>
        {items.length > 0 && (
          <div className="ws-actions">
            <button type="button" className="ws-btn ws-btn--primary" onClick={() => download("package.xml", "text/xml", buildPackageXml(items))}>
              Download package.xml
            </button>
            <button type="button" className="ws-btn" onClick={() => download("workspace.json", "application/json", JSON.stringify(items, null, 2))}>
              Export JSON
            </button>
            <button
              type="button"
              className={`ws-btn ws-btn--danger${clearArmed ? " ws-btn--danger-armed" : ""}`}
              onClick={clearAll}
            >
              {clearArmed ? "Click again to clear everything" : "Clear all"}
            </button>
          </div>
        )}
      </header>

      {items.length === 0 ? (
        <div className="ws-empty">
          <strong>Your Workspace is empty.</strong>
          <br />
          Edit any translation (it's captured on save), or hit <strong>+ Workspace</strong> on the inspector tooltip to
          pin an element you want to track. Everything you touch collects here, with its original values kept for
          comparison and a package.xml ready to download.
        </div>
      ) : (
        <>
          <div className="ws-summary">
            <span>
              <strong>{summary.editCount}</strong> edit{summary.editCount === 1 ? "" : "s"}
            </span>
            <span>
              <strong>{summary.pinCount}</strong> pinned
            </span>
            <span>
              <strong>{summary.componentCount}</strong> package component{summary.componentCount === 1 ? "" : "s"}
            </span>
            {summary.languages.map((lang) => (
              <LangChip key={lang} code={lang} />
            ))}
            {oldestTimestamp !== null && <span>since {new Date(oldestTimestamp).toLocaleDateString()}</span>}
            {changedCount > 0 && (
              <span className="ws-changed-pill" title="Values that moved in the org after the Workspace captured them">
                ⚠ {changedCount} changed since captured
              </span>
            )}
          </div>

          <div className="ws-toolbar">
            <input
              type="search"
              className="ws-search"
              placeholder="Search API names and values…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {presentTypes.map((type) => {
              const colors = TYPE_COLORS[type];
              const active = typeFilter.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  className="ws-chip"
                  style={active ? { background: colors.bg, color: colors.color, borderColor: colors.color } : undefined}
                  onClick={() => toggleType(type)}
                >
                  {TYPE_LABELS[type]}
                </button>
              );
            })}
            <div className="ws-tabs">
              {statusTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`ws-tab${tab.id === "changed" ? " ws-tab--changed" : ""}${statusFilter === tab.id ? " ws-tab--active" : ""}`}
                  onClick={() => setStatusFilter(tab.id)}
                >
                  {tab.label}
                  <span className="ws-tab__count">{tab.count}</span>
                </button>
              ))}
            </div>
          </div>

          {groups.length === 0 ? (
            <div className="ws-no-match">Nothing matches the current search/filters.</div>
          ) : (
            groups.map(({ type, list }) => {
              const colors = TYPE_COLORS[type];
              return (
                <section key={type} className="ws-group">
                  <div className="ws-group__header">
                    <span className="ws-badge" style={{ background: colors.bg, color: colors.color }}>
                      {TYPE_LABELS[type]}
                    </span>
                    <span className="ws-group__count">
                      {list.length} item{list.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="ws-rows">
                    {list.map((row) => (
                      <WorkspaceRow key={itemKey(row.item)} row={row} orgOrigin={state.orgOrigin} onRemove={removeItem} />
                    ))}
                  </ul>
                </section>
              );
            })
          )}

          <div className="ws-freshness">
            Change detection compares against the extension's own index
            {state.lastIndexRefresh ? `, last refreshed ${timeAgo(state.lastIndexRefresh)}` : ""} — refresh it from the
            popup for the latest org values.
          </div>
        </>
      )}
    </div>
  );
}
