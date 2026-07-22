import { useEffect, useMemo, useRef, useState } from "react";
import type { LabelEntry, LabelType, Settings, WorkspaceHistoryEntry, WorkspaceItem, WorkspaceReviewedMap } from "../shared/types";
import {
  buildPackageXml,
  buildWorkspaceExport,
  type ElementGroup,
  elementDrift,
  elementKey,
  groupItemsByElement,
  historyOf,
  isReviewedFresh,
  itemKey,
  mergeWorkspaceExport,
  normalizeReviewedMap,
  normalizeStoredWorkspace,
  type ParsedWorkspaceImport,
  parseWorkspaceExport,
  type WorkspaceDrift,
} from "../shared/workspace";
import { langAccent, setupPath, TYPE_COLORS, TYPE_LABELS } from "../content/tooltip-constants";
import "./workspace.css";

/**
 * Workspace v3 (`DECISIONS.md #67`) — the page: the product's work-hub, not a log.
 * The ELEMENT (type + apiName) is the primary unit — every edit and pin for the same
 * element renders as one card, not sibling rows. Status (needs review / reviewed /
 * changed) is derived, not manually tracked: a "reviewed" mark is self-invalidating
 * (`isReviewedFresh`) the instant the element changes again or drifts against the
 * index. A secondary "Activity" view keeps the raw chronological feed for anyone who
 * wants it, computed from the same items — no second data source.
 *
 * Reads `workspaceItems` (+ v1 `workspaceEdits` migration), `workspaceReviewed`
 * (page-owned, background never touches it), `cachedEntries` (drift baseline),
 * `settings`, `lastOrgOrigin`. Capture still happens only in the background — this
 * page never invents item rows, only reviewed-state and selection, both local to it.
 */

interface LoadedState {
  items: WorkspaceItem[];
  reviewed: WorkspaceReviewedMap;
  entriesByKey: Map<string, LabelEntry>;
  orgOrigin: string | null;
  lastIndexRefresh: number | null;
}

async function loadState(): Promise<LoadedState> {
  const stored = await chrome.storage.local.get([
    "workspaceItems",
    "workspaceEdits",
    "workspaceReviewed",
    "cachedEntries",
    "settings",
    "lastOrgOrigin",
  ]);
  const entries = (stored.cachedEntries as LabelEntry[] | undefined) ?? [];
  return {
    items: normalizeStoredWorkspace(stored.workspaceItems, stored.workspaceEdits),
    reviewed: normalizeReviewedMap(stored.workspaceReviewed),
    entriesByKey: new Map(entries.map((e) => [elementKey(e.type, e.apiName), e])),
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

/** How many past transitions show before collapsing behind "+N earlier" — compact by default even for a heavily-edited element. */
const HISTORY_VISIBLE_CAP = 5;

/**
 * The language's full edit history (Workspace v4, `DECISIONS.md #68`), newest first —
 * a self-contained disclosure so a single-edit language (the common case) never pays
 * for it. Real entries (`WorkspaceEdit.history`) or one honest reconstruction
 * (`historyOf`) for rows captured before this field existed.
 */
function EditHistory({ language, entries }: { language: string; entries: WorkspaceHistoryEntry[] }) {
  const [open, setOpen] = useState(false);
  if (entries.length <= 1) return null;

  const newestFirst = [...entries].reverse();
  const visible = open ? newestFirst.slice(0, HISTORY_VISIBLE_CAP) : [];
  const hidden = newestFirst.length - visible.length;

  return (
    <div className="ws-history">
      <button
        type="button"
        className="ws-history__toggle"
        onClick={(e) => {
          // Without this the click bubbles to the card's own expand/collapse handler
          // (EditHistory renders inside ws-card__main) — toggling History OPEN and the
          // whole card CLOSED in the same click, which immediately hides what was just
          // opened. Found re-verifying this in the harness (DECISIONS.md #68).
          e.stopPropagation();
          setOpen((x) => !x);
        }}
      >
        {open ? "▾" : "▸"} History ({entries.length})
      </button>
      {open && (
        <ol className="ws-history__list">
          {visible.map((h, i) => (
            <li key={h.timestamp} className="ws-history__entry">
              <span className="ws-history__index">{newestFirst.length - i}.</span>
              <span className="ws-history__time" title={new Date(h.timestamp).toLocaleString()}>
                {new Date(h.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <LangChip code={language} />
              <ValueText value={h.oldValue} />
              <span className="ws-values__arrow">→</span>
              <ValueText value={h.newValue} />
            </li>
          ))}
          {hidden > 0 && <li className="ws-history__more">+{hidden} earlier</li>}
        </ol>
      )}
    </div>
  );
}

type StatusFilter = "all" | "needsReview" | "reviewed" | "changed";
type KindFilter = "edit" | "pin";
type ViewMode = "elements" | "activity";

interface GroupModel {
  group: ElementGroup;
  entry: LabelEntry | undefined;
  drift: WorkspaceDrift;
  reviewedAt: number | undefined;
  reviewedFresh: boolean;
}

function itemMatchesSearch(item: WorkspaceItem, needle: string): boolean {
  if (item.kind === "edit") {
    return item.newValue.toLowerCase().includes(needle) || item.oldValue.toLowerCase().includes(needle);
  }
  return Object.values(item.snapshot).some((v) => v.toLowerCase().includes(needle));
}

function groupMatchesSearch(model: GroupModel, needle: string): boolean {
  if (model.group.apiName.toLowerCase().includes(needle)) return true;
  return model.group.items.some((i) => itemMatchesSearch(i, needle));
}

/** The single most relevant line for a collapsed card — avoids repeating every detail up front. */
function collapsedSummary(model: GroupModel): string {
  const { group, drift } = model;
  if (drift.state === "changed") {
    return `${drift.changes.length} language${drift.changes.length === 1 ? "" : "s"} changed in the org since captured`;
  }
  const edits = group.items.filter((i): i is Extract<WorkspaceItem, { kind: "edit" }> => i.kind === "edit");
  if (edits.length > 0) {
    const latest = [...edits].sort((a, b) => b.timestamp - a.timestamp)[0];
    return `${latest.language}: "${latest.oldValue || "(empty)"}" → "${latest.newValue || "(empty)"}"`;
  }
  const pin = group.items.find((i) => i.kind === "pin");
  const langCount = pin && pin.kind === "pin" ? Object.keys(pin.snapshot).length : 0;
  return `Pinned · ${langCount} language${langCount === 1 ? "" : "s"} captured`;
}

function ElementCard({
  model,
  orgOrigin,
  selected,
  onToggleSelect,
  onRemove,
  onToggleReviewed,
}: {
  model: GroupModel;
  orgOrigin: string | null;
  selected: boolean;
  onToggleSelect: (key: string, opts: { shift: boolean }) => void;
  onRemove: (key: string) => void;
  onToggleReviewed: (key: string, reviewed: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { group, entry, drift, reviewedFresh } = model;
  const hasEdit = group.items.some((i) => i.kind === "edit");
  const hasPin = group.items.some((i) => i.kind === "pin");
  const editCount = group.items
    .filter((i): i is Extract<WorkspaceItem, { kind: "edit" }> => i.kind === "edit")
    .reduce((sum, i) => sum + (i.editCount ?? 1), 0);
  const changed = drift.state === "changed";
  const setupHref = entry && orgOrigin ? setupPath(entry) : null;
  const cardClass = [
    "ws-card",
    changed ? "ws-card--changed" : reviewedFresh ? "ws-card--reviewed" : "",
    selected ? "ws-card--selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      className={cardClass}
      onClick={(e) => {
        if ((e.ctrlKey || e.metaKey) && !(e.target as HTMLElement).closest("button, a, input")) {
          e.preventDefault();
          onToggleSelect(group.key, { shift: false });
        }
      }}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        aria-label={selected ? `Deselect ${group.apiName}` : `Select ${group.apiName}`}
        className={`ws-checkbox${selected ? " ws-checkbox--checked" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(group.key, { shift: e.shiftKey });
        }}
      >
        {selected && <span className="ws-checkbox__mark">✓</span>}
      </button>

      <div className="ws-card__main" onClick={() => setExpanded((x) => !x)}>
        <div className="ws-card__head">
          <span className="ws-badge" style={{ background: TYPE_COLORS[group.type].bg, color: TYPE_COLORS[group.type].color }}>
            {TYPE_LABELS[group.type]}
          </span>
          <code className="ws-row__api" title={group.apiName}>
            {group.apiName}
          </code>
          <button
            type="button"
            className="ws-icon-btn"
            title="Copy API name"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(group.apiName);
            }}
          >
            ⧉
          </button>
          {hasEdit && <span className="ws-kind ws-kind--edit">✎ edited{editCount > 1 ? ` ×${editCount}` : ""}</span>}
          {hasPin && <span className="ws-kind ws-kind--pin">📌 pinned</span>}
          {reviewedFresh && <span className="ws-kind ws-kind--reviewed">✓ reviewed</span>}
          {setupHref && (
            <a
              className="ws-setup-link"
              href={`${orgOrigin}${setupHref}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              Open in Setup ↗
            </a>
          )}
          <span className="ws-time" title={new Date(group.latestTimestamp).toLocaleString()}>
            {timeAgo(group.latestTimestamp)}
          </span>
        </div>

        {!expanded && <div className="ws-card__summary">{collapsedSummary(model)}</div>}

        {expanded && (
          <div className="ws-card__detail">
            {group.items
              .filter((i): i is Extract<WorkspaceItem, { kind: "edit" }> => i.kind === "edit")
              .sort((a, b) => a.language.localeCompare(b.language))
              .map((i) => (
                <div key={`edit-${i.language}`}>
                  <div className="ws-values">
                    <LangChip code={i.language} />{" "}
                    <span className={`ws-values__old${i.oldValue === i.newValue ? " ws-values__old--kept" : ""}`}>
                      <ValueText value={i.oldValue} />
                    </span>
                    <span className="ws-values__arrow">→</span>
                    <span className="ws-values__new">
                      <ValueText value={i.newValue} />
                    </span>
                    {i.oldValue === i.newValue && <span className="ws-values__note">(edited back to the original)</span>}
                    {(i.editCount ?? 1) > 1 && <span className="ws-values__note">· edited {i.editCount}×</span>}
                  </div>
                  <EditHistory language={i.language} entries={historyOf(i)} />
                </div>
              ))}
            {group.items
              .filter((i): i is Extract<WorkspaceItem, { kind: "pin" }> => i.kind === "pin")
              .map((i) => (
                <div key="pin" className="ws-values">
                  <span className="ws-kind">📌 pinned snapshot:</span>{" "}
                  {Object.entries(i.snapshot).map(([lang, value]) => (
                    <span key={lang} className="ws-snapshot-lang">
                      <LangChip code={lang} /> <ValueText value={value} />
                    </span>
                  ))}
                </div>
              ))}
          </div>
        )}

        {changed &&
          drift.changes.map((c) => (
            <div key={c.language} className="ws-drift">
              <span className="ws-drift__lang">{c.language}</span> changed in the org since capture:{" "}
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
        <button
          type="button"
          className={`ws-reviewed-btn${reviewedFresh ? " ws-reviewed-btn--on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleReviewed(group.key, !reviewedFresh);
          }}
        >
          {reviewedFresh ? "Reviewed ✓" : "Mark reviewed"}
        </button>
        <button
          type="button"
          className="ws-remove"
          title="Remove from Workspace (does not undo any saved translation)"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(group.key);
          }}
        >
          ✕
        </button>
      </div>
    </li>
  );
}

/** Flat chronological row for the Activity view — one item, not one element. */
function ActivityRow({ item, orgOrigin, entry }: { item: WorkspaceItem; orgOrigin: string | null; entry: LabelEntry | undefined }) {
  const setupHref = entry && orgOrigin ? setupPath(entry) : null;
  return (
    <li className={`ws-row${item.kind === "pin" ? " ws-row--pin" : ""}`}>
      <div className="ws-row__main">
        <div className="ws-row__head">
          <span className="ws-badge" style={{ background: TYPE_COLORS[item.type].bg, color: TYPE_COLORS[item.type].color }}>
            {TYPE_LABELS[item.type]}
          </span>
          <code className="ws-row__api" title={item.apiName}>
            {item.apiName}
          </code>
          {item.kind === "edit" ? (
            <span className="ws-kind">
              ✎ edited <LangChip code={item.language} />
            </span>
          ) : (
            <span className="ws-kind">📌 pinned · {Object.keys(item.snapshot).length} language(s) captured</span>
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
          </div>
        )}
      </div>
      <div className="ws-row__side">
        <span className="ws-time" title={new Date(item.timestamp).toLocaleString()}>
          {timeAgo(item.timestamp)}
        </span>
      </div>
    </li>
  );
}

/**
 * The primary export action (Workspace v4, `DECISIONS.md #68`) — ONE button, a small
 * menu for the format choice it already had (package.xml / the portable Workspace
 * file), instead of two permanently-visible buttons. Always exports the WHOLE
 * Workspace regardless of the current filter/search — "Export current view" (toolbar)
 * and "Export selected" (bulk bar) are the scoped alternatives, each labeled with
 * exactly what they'd export.
 */
function ExportMenu({ onExportXml, onExportJson }: { onExportXml: () => void; onExportJson: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  return (
    <div className="ws-export-menu" ref={ref}>
      <button type="button" className="ws-btn ws-btn--primary" onClick={() => setOpen((x) => !x)}>
        Export Workspace {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="ws-export-menu__dropdown">
          <button
            type="button"
            className="ws-export-menu__item"
            onClick={() => {
              setOpen(false);
              onExportXml();
            }}
          >
            package.xml
            <span className="ws-export-menu__hint">for a Salesforce deploy/retrieve</span>
          </button>
          <button
            type="button"
            className="ws-export-menu__item"
            onClick={() => {
              setOpen(false);
              onExportJson();
            }}
          >
            Workspace file (.json)
            <span className="ws-export-menu__hint">save/restore this Workspace's state</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function Workspace() {
  const [state, setState] = useState<LoadedState | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ReadonlySet<LabelType>>(new Set());
  const [kindFilter, setKindFilter] = useState<ReadonlySet<KindFilter>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [view, setView] = useState<ViewMode>("elements");
  const [clearArmed, setClearArmed] = useState(false);
  // Keyed by elementKey, deliberately independent of which cards are currently
  // rendered — filtering/searching narrows the LIST, never the selection (#68). An
  // element selected then filtered away stays selected (its checkbox just isn't on
  // screen); bring back the filter and it's still checked. Only an explicit action
  // (checkbox click, bulk remove, Clear selection) changes this set.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchorKey, setAnchorKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // A parsed-but-not-yet-applied import, held for the merge/replace choice — null once
  // there's nothing pending. `replaceArmed` mirrors Clear's two-stage discipline: a
  // destructive Replace needs its own confirming click, not just the file picker.
  const [pendingImport, setPendingImport] = useState<{ fileName: string; parsed: ParsedWorkspaceImport } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [replaceArmed, setReplaceArmed] = useState(false);
  // Single-level, session-only Undo (Workspace v4, `DECISIONS.md #68`) — one snapshot
  // of what the Workspace looked like right before the last destructive action, held
  // in memory only (never chrome.storage: the delete already committed there the
  // instant it happened, this only restores the one-click convenience of not having
  // to redo the work by hand). Deliberately not a stack: no redo, no multi-level
  // history — see #68 for why that's the right amount of complexity here.
  const [pendingUndo, setPendingUndo] = useState<{ label: string; items: WorkspaceItem[]; reviewed: WorkspaceReviewedMap } | null>(null);
  const undoTimerRef = useRef<number | undefined>(undefined);

  const armUndo = (label: string, snapshotItems: WorkspaceItem[], snapshotReviewed: WorkspaceReviewedMap) => {
    window.clearTimeout(undoTimerRef.current);
    setPendingUndo({ label, items: snapshotItems, reviewed: snapshotReviewed });
    undoTimerRef.current = window.setTimeout(() => setPendingUndo(null), 8000);
  };

  useEffect(() => {
    void loadState().then(setState);
    // Live updates: an edit saved or an element pinned in a Salesforce tab appears
    // here without a refresh — the page is a live view of the same storage.
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      if (changes.workspaceItems || changes.workspaceEdits || changes.workspaceReviewed || changes.cachedEntries || changes.settings) {
        void loadState().then(setState);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  const allGroups = useMemo<GroupModel[]>(() => {
    if (!state) return [];
    return groupItemsByElement(state.items).map((group) => {
      const entry = state.entriesByKey.get(group.key);
      const drift = elementDrift(group, state.entriesByKey);
      const reviewedAt = state.reviewed[group.key];
      return { group, entry, drift, reviewedAt, reviewedFresh: isReviewedFresh(reviewedAt, group, drift) };
    });
  }, [state]);

  const needsReviewCount = allGroups.filter((m) => !m.reviewedFresh).length;
  const reviewedCount = allGroups.filter((m) => m.reviewedFresh).length;
  const changedCount = allGroups.filter((m) => m.drift.state === "changed").length;

  const visibleGroups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allGroups
      .filter((model) => {
        if (statusFilter === "needsReview" && model.reviewedFresh) return false;
        if (statusFilter === "reviewed" && !model.reviewedFresh) return false;
        if (statusFilter === "changed" && model.drift.state !== "changed") return false;
        if (typeFilter.size > 0 && !typeFilter.has(model.group.type)) return false;
        if (kindFilter.size > 0 && !model.group.items.some((i) => kindFilter.has(i.kind))) return false;
        if (needle && !groupMatchesSearch(model, needle)) return false;
        return true;
      })
      .sort((a, b) => b.group.latestTimestamp - a.group.latestTimestamp);
  }, [allGroups, search, typeFilter, kindFilter, statusFilter]);

  const sections = useMemo(() => {
    const byType = new Map<LabelType, GroupModel[]>();
    for (const model of visibleGroups) {
      const list = byType.get(model.group.type) ?? [];
      list.push(model);
      byType.set(model.group.type, list);
    }
    return [...byType.entries()].sort(([a], [b]) => TYPE_LABELS[a].localeCompare(TYPE_LABELS[b]));
  }, [visibleGroups]);

  const activityItems = useMemo(
    () => visibleGroups.flatMap((m) => m.group.items.map((item) => ({ item, entry: m.entry }))).sort((a, b) => b.item.timestamp - a.item.timestamp),
    [visibleGroups]
  );

  if (!state) {
    return <div className="ws-page">Loading…</div>;
  }

  const { items, reviewed } = state;
  const presentTypes = [...new Set(items.map((i) => i.type))].sort((a, b) => TYPE_LABELS[a].localeCompare(TYPE_LABELS[b]));
  const languages = [...new Set(items.filter((i): i is Extract<WorkspaceItem, { kind: "edit" }> => i.kind === "edit").map((i) => i.language))].sort();
  const oldestTimestamp = items.length > 0 ? Math.min(...items.map((i) => i.timestamp)) : null;

  const persistReviewed = (next: WorkspaceReviewedMap) => {
    setState({ ...state, reviewed: next });
    void chrome.storage.local.set({ workspaceReviewed: next });
  };

  const persistBoth = (nextItems: WorkspaceItem[], nextReviewed: WorkspaceReviewedMap) => {
    setState({ ...state, items: nextItems, reviewed: nextReviewed });
    void chrome.storage.local.set({ workspaceItems: nextItems, workspaceReviewed: nextReviewed });
  };

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setImportError(null);
    void file.text().then((text) => {
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        setImportError(`"${file.name}" isn't valid JSON.`);
        return;
      }
      const parsed = parseWorkspaceExport(raw);
      if (!parsed) {
        setImportError(`"${file.name}" doesn't look like a Workspace export.`);
        return;
      }
      if (items.length === 0) {
        // Nothing to conflict with — apply directly, no merge/replace choice to make.
        persistBoth(parsed.items, parsed.reviewed);
        return;
      }
      setPendingImport({ fileName: file.name, parsed });
      setReplaceArmed(false);
    });
  };

  const applyMergeImport = () => {
    if (!pendingImport) return;
    const merged = mergeWorkspaceExport({ items, reviewed }, pendingImport.parsed);
    persistBoth(merged.items, merged.reviewed);
    setPendingImport(null);
  };

  const applyReplaceImport = () => {
    if (!pendingImport) return;
    // Two-stage, same discipline as Clear (#55/#63): overwriting the whole Workspace
    // needs its own confirming click, not just having picked a file.
    if (!replaceArmed) {
      setReplaceArmed(true);
      window.setTimeout(() => setReplaceArmed(false), 4000);
      return;
    }
    persistBoth(pendingImport.parsed.items, pendingImport.parsed.reviewed);
    setPendingImport(null);
    setReplaceArmed(false);
  };

  const cancelImport = () => {
    setPendingImport(null);
    setReplaceArmed(false);
  };

  const performUndo = () => {
    if (!pendingUndo) return;
    window.clearTimeout(undoTimerRef.current);
    persistBoth(pendingUndo.items, pendingUndo.reviewed);
    setPendingUndo(null);
  };

  const removeElement = (key: string) => {
    const label = allGroups.find((m) => m.group.key === key)?.group.apiName ?? "element";
    armUndo(`Removed ${label}`, items, reviewed);
    const nextReviewed = key in reviewed ? { ...reviewed } : reviewed;
    if (key in nextReviewed) delete nextReviewed[key];
    persistBoth(
      items.filter((i) => elementKey(i.type, i.apiName) !== key),
      nextReviewed
    );
    setSelected((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const toggleReviewed = (key: string, makeReviewed: boolean) => {
    const next = { ...reviewed };
    if (makeReviewed) next[key] = Date.now();
    else delete next[key];
    persistReviewed(next);
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
    armUndo(`Cleared Workspace (${allGroups.length} element${allGroups.length === 1 ? "" : "s"})`, items, reviewed);
    persistBoth([], {});
    setSelected(new Set());
  };

  const toggleType = (type: LabelType) => {
    const next = new Set(typeFilter);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setTypeFilter(next);
  };

  const toggleKind = (kind: KindFilter) => {
    const next = new Set(kindFilter);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    setKindFilter(next);
  };

  // The order cards actually render in — type sections first, then by recency inside
  // each (`sections`), NOT the flat `visibleGroups` timestamp order underneath it.
  // Shift-range has to walk THIS one, or "select everything between the two cards I
  // clicked" silently selects a different set than what's visually between them
  // (DECISIONS.md #68 — found while re-verifying shift-click, not something the
  // original v3 range logic got right either).
  const renderedOrder = sections.flatMap(([, list]) => list.map((m) => m.group.key));

  // Click on a card's checkbox toggles it; shift-click selects the contiguous range
  // (in the currently RENDERED order) since the last-touched card, added to the
  // existing selection. Ctrl/Cmd-click anywhere else on a card behaves like the plain
  // checkbox toggle — a bigger, more forgiving hit target for the same gesture.
  const toggleSelect = (key: string, opts: { shift: boolean }) => {
    if (opts.shift && anchorKey) {
      const order = renderedOrder;
      const from = order.indexOf(anchorKey);
      const to = order.indexOf(key);
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from];
        const range = order.slice(start, end + 1);
        setSelected((prev) => new Set([...prev, ...range]));
        return;
      }
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setAnchorKey(key);
  };

  const clearSelection = () => setSelected(new Set());

  const bulkRemove = () => {
    armUndo(`Removed ${selected.size} element${selected.size === 1 ? "" : "s"}`, items, reviewed);
    const nextReviewed = { ...reviewed };
    for (const key of selected) delete nextReviewed[key];
    persistBoth(
      items.filter((i) => !selected.has(elementKey(i.type, i.apiName))),
      nextReviewed
    );
    clearSelection();
  };

  const bulkExportSelection = () => {
    const selectedItems = items.filter((i) => selected.has(elementKey(i.type, i.apiName)));
    download("package.xml", "text/xml", buildPackageXml(selectedItems));
  };

  // "Current view" = whatever the active search/filters/status-tab currently show
  // (`visibleGroups`) — distinct from the primary button's "everything" and the bulk
  // bar's "just what I checked." Only offered once a filter genuinely narrows the
  // list, and its own label states the resulting scope (#68).
  const isFiltered = visibleGroups.length !== allGroups.length;
  const exportCurrentView = () => {
    const visibleItems = visibleGroups.flatMap((m) => m.group.items);
    download("package.xml", "text/xml", buildPackageXml(visibleItems));
  };

  const bulkMarkReviewed = (makeReviewed: boolean) => {
    const next = { ...reviewed };
    for (const key of selected) {
      if (makeReviewed) next[key] = Date.now();
      else delete next[key];
    }
    persistReviewed(next);
  };

  const statusTabs: Array<{ id: StatusFilter; label: string; count: number }> = [
    { id: "all", label: "All", count: allGroups.length },
    { id: "needsReview", label: "Needs review", count: needsReviewCount },
    { id: "reviewed", label: "Reviewed", count: reviewedCount },
    { id: "changed", label: "Changed", count: changedCount },
  ];

  return (
    <div className="ws-page">
      <header className="ws-header">
        <div>
          <h1>Workspace</h1>
          <p className="ws-subtitle">This is where your current Salesforce work lives — captured automatically as you edit or pin, nothing to manage by hand.</p>
        </div>
        <div className="ws-actions">
          {items.length > 0 && (
            <ExportMenu
              onExportXml={() => download("package.xml", "text/xml", buildPackageXml(items))}
              onExportJson={() =>
                download("workspace.json", "application/json", JSON.stringify(buildWorkspaceExport(items, reviewed), null, 2))
              }
            />
          )}
          <button type="button" className="ws-btn" onClick={openFilePicker}>
            Import Workspace
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={handleFileSelected}
          />
          {items.length > 0 && (
            <button type="button" className={`ws-btn ws-btn--danger${clearArmed ? " ws-btn--danger-armed" : ""}`} onClick={clearAll}>
              {clearArmed ? "Click again to clear everything" : "Clear all"}
            </button>
          )}
        </div>
      </header>

      {importError && (
        <div className="ws-import-banner ws-import-banner--error">
          {importError}
          <button type="button" className="ws-btn" onClick={() => setImportError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {pendingImport && (
        <div className="ws-import-banner">
          <span>
            Import <strong>{pendingImport.parsed.items.length}</strong> item
            {pendingImport.parsed.items.length === 1 ? "" : "s"} from <strong>{pendingImport.fileName}</strong>? Your
            current Workspace has {items.length} item{items.length === 1 ? "" : "s"}.
          </span>
          <button type="button" className="ws-btn ws-btn--primary" onClick={applyMergeImport}>
            Merge with current
          </button>
          <button
            type="button"
            className={`ws-btn ws-btn--danger${replaceArmed ? " ws-btn--danger-armed" : ""}`}
            onClick={applyReplaceImport}
          >
            {replaceArmed ? "Click again to replace" : "Replace current"}
          </button>
          <button type="button" className="ws-btn" onClick={cancelImport}>
            Cancel
          </button>
        </div>
      )}

      {pendingUndo && (
        <div className="ws-import-banner ws-undo-banner">
          <span>{pendingUndo.label}</span>
          <button type="button" className="ws-btn ws-btn--primary" onClick={performUndo}>
            Undo
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="ws-empty">
          <strong>Nothing here yet.</strong>
          <br />
          Edit any translation (it's captured on save), or hit <strong>+ Workspace</strong> on the inspector tooltip to
          pin an element you want to track. Everything you touch collects here, organized by element, with a
          package.xml ready to download whenever you are.
        </div>
      ) : (
        <>
          <div className="ws-overview">
            <span className="ws-overview__stat">
              <strong>{allGroups.length}</strong> element{allGroups.length === 1 ? "" : "s"}
            </span>
            <span className="ws-overview__stat">
              <strong>{needsReviewCount}</strong> needs review
            </span>
            {changedCount > 0 && (
              <span className="ws-changed-pill" title="Values that moved in the org after the Workspace captured them">
                ⚠ {changedCount} changed since captured
              </span>
            )}
            {languages.map((lang) => (
              <LangChip key={lang} code={lang} />
            ))}
            {oldestTimestamp !== null && <span>since {new Date(oldestTimestamp).toLocaleDateString()}</span>}
            <div className="ws-view-toggle">
              <button type="button" className={view === "elements" ? "ws-view-toggle__btn ws-view-toggle__btn--active" : "ws-view-toggle__btn"} onClick={() => setView("elements")}>
                By element
              </button>
              <button type="button" className={view === "activity" ? "ws-view-toggle__btn ws-view-toggle__btn--active" : "ws-view-toggle__btn"} onClick={() => setView("activity")}>
                Activity
              </button>
            </div>
          </div>

          <div className="ws-toolbar">
            <input type="search" className="ws-search" placeholder="Search API names and values…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
            <span className="ws-toolbar__sep" />
            <button type="button" className={`ws-chip${kindFilter.has("edit") ? " ws-chip--active" : ""}`} onClick={() => toggleKind("edit")}>
              ✎ Edited
            </button>
            <button type="button" className={`ws-chip${kindFilter.has("pin") ? " ws-chip--active" : ""}`} onClick={() => toggleKind("pin")}>
              📌 Pinned
            </button>
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
            {isFiltered && visibleGroups.length > 0 && (
              <button
                type="button"
                className="ws-btn ws-btn--small"
                title="Export only the elements the current search/filters show"
                onClick={exportCurrentView}
              >
                Export {visibleGroups.length} filtered
              </button>
            )}
          </div>

          {visibleGroups.length === 0 ? (
            <div className="ws-no-match">Nothing matches the current search/filters.</div>
          ) : view === "elements" ? (
            sections.map(([type, list]) => {
              const colors = TYPE_COLORS[type];
              return (
                <section key={type} className="ws-group">
                  <div className="ws-group__header">
                    <span className="ws-badge" style={{ background: colors.bg, color: colors.color }}>
                      {TYPE_LABELS[type]}
                    </span>
                    <span className="ws-group__count">
                      {list.length} element{list.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="ws-cards">
                    {list.map((model) => (
                      <ElementCard
                        key={model.group.key}
                        model={model}
                        orgOrigin={state.orgOrigin}
                        selected={selected.has(model.group.key)}
                        onToggleSelect={toggleSelect}
                        onRemove={removeElement}
                        onToggleReviewed={toggleReviewed}
                      />
                    ))}
                  </ul>
                </section>
              );
            })
          ) : (
            <ul className="ws-rows ws-rows--activity">
              <li className="ws-activity-hint">
                Every capture across the whole Workspace, most recent first — for what a single element did over time,
                expand its card in <strong>By element</strong> instead.
              </li>
              {activityItems.map(({ item, entry }) => (
                <ActivityRow key={itemKey(item)} item={item} orgOrigin={state.orgOrigin} entry={entry} />
              ))}
            </ul>
          )}

          <div className="ws-freshness">
            Change detection compares against the extension's own index
            {state.lastIndexRefresh ? `, last refreshed ${timeAgo(state.lastIndexRefresh)}` : ""} — refresh it from the
            popup for the latest org values.
          </div>
        </>
      )}

      {selected.size > 0 && (
        <div className="ws-bulkbar">
          <span className="ws-bulkbar__count">{selected.size} selected</span>
          <button type="button" className="ws-btn" onClick={bulkExportSelection}>
            Export package.xml
          </button>
          <button type="button" className="ws-btn" onClick={() => bulkMarkReviewed(true)}>
            Mark reviewed
          </button>
          <button type="button" className="ws-btn" onClick={() => bulkMarkReviewed(false)}>
            Mark pending
          </button>
          <button type="button" className="ws-btn ws-btn--danger" onClick={bulkRemove}>
            Remove
          </button>
          <button type="button" className="ws-btn ws-bulkbar__clear" onClick={clearSelection}>
            Clear selection
          </button>
        </div>
      )}
    </div>
  );
}
