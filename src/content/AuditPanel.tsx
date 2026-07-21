import { TYPE_COLORS, displayApiName, typeLabel } from "./tooltip-constants";
import type { AuditEntry, AuditStatus, BadgeScope } from "./translation-mode";

/** The audit panel's own filter axis — one tab per reliably-computed `AuditStatus`, plus "all". Deliberately NOT a larger set (no "needs attention" union, no Duplicated yet) — see ROADMAP.md PHASE 18 for why. */
export type AuditFilter = "all" | AuditStatus;

const FILTERS: { value: AuditFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "missing", label: "Missing" },
  { value: "identical", label: "Identical" },
  { value: "complete", label: "Complete" },
];

const STATUS_DOT: Record<AuditStatus, string> = {
  missing: "#c0392b",
  identical: "#b8860b",
  complete: "#1a7f4e",
};

function matchesFilter(entry: AuditEntry, filter: AuditFilter): boolean {
  return filter === "all" || entry.status === filter;
}

/** One line explaining WHY this specific entry is in the current filter — the specific language(s) involved, not just the category name, so the user knows exactly what to fix. */
function statusDetail(entry: AuditEntry): string {
  if (entry.status === "missing") return `Missing: ${entry.missingLanguages.join(", ")}`;
  if (entry.status === "identical") return `Identical to source: ${entry.identicalLanguages.join(", ")}`;
  return "Fully translated";
}

export interface AuditPanelProps {
  entries: AuditEntry[];
  filter: AuditFilter;
  onFilterChange: (filter: AuditFilter) => void;
  /** Index into the CURRENTLY FILTERED list — clamped by the caller after every data update, see content/index.tsx. */
  currentIndex: number;
  onNavigate: (index: number, entry: AuditEntry) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** "All fields" (default) badges every matched element on the page, same as classic Translation Mode. "Current only" declutters the page down to just the entry currently selected below — a live workflow toggle, not a persisted setting (ROADMAP.md PHASE 18 §4, DECISIONS.md #61). */
  scope: BadgeScope;
  onScopeChange: (scope: BadgeScope) => void;
}

/**
 * "Translate All" evolved into a guided audit panel (ROADMAP.md PHASE 18,
 * DECISIONS.md #60) — a collapsed pill by default (lightweight, unobtrusive), expands
 * into filter tabs + a Prev/Next stepper + a clickable list, all reading from the same
 * `AuditEntry[]` `translation-mode.tsx`'s scan already produces for the inline badges.
 * This component is purely presentational: every action (filter change, navigate)
 * calls back into content/index.tsx, which owns scrolling/highlighting/opening the
 * editor — the panel itself never touches the page DOM or the editor.
 */
export function AuditPanel({
  entries,
  filter,
  onFilterChange,
  currentIndex,
  onNavigate,
  expanded,
  onToggleExpanded,
  scope,
  onScopeChange,
}: AuditPanelProps) {
  const counts: Record<AuditFilter, number> = { all: entries.length, missing: 0, identical: 0, complete: 0 };
  for (const e of entries) counts[e.status]++;

  const filtered = entries.filter((e) => matchesFilter(e, filter));
  const clampedIndex = filtered.length === 0 ? 0 : Math.min(currentIndex, filtered.length - 1);
  const current = filtered[clampedIndex];
  const issueCount = counts.missing + counts.identical;

  if (!expanded) {
    return (
      <button type="button" className="sti-audit-pill" onClick={onToggleExpanded}>
        <span className="sti-audit-pill__dot" style={{ background: issueCount > 0 ? "#c0392b" : "#1a7f4e" }} />
        Translate All
        <span className="sti-audit-pill__count">{issueCount > 0 ? `${issueCount} to review` : "all clear"}</span>
      </button>
    );
  }

  return (
    <div className="sti-audit-panel" role="region" aria-label="Translate All audit">
      <div className="sti-audit-panel__header">
        <span className="sti-audit-panel__title">Translate All</span>
        <span className="sti-audit-panel__header-actions">
          <button
            type="button"
            className="sti-audit-scope-btn"
            onClick={() => onScopeChange(scope === "all" ? "current" : "all")}
            title={
              scope === "all"
                ? "Showing badges on every matched field — click to show only the current one"
                : "Showing a badge only on the current field — click to show every matched field"
            }
          >
            {scope === "all" ? "All fields" : "Current only"}
          </button>
          <button type="button" className="sti-audit-panel__collapse" onClick={onToggleExpanded} title="Collapse">
            ▾
          </button>
        </span>
      </div>

      <div className="sti-audit-panel__tabs">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`sti-audit-tab${filter === value ? " sti-audit-tab--active" : ""}`}
            onClick={() => onFilterChange(value)}
          >
            <span className="sti-audit-tab__label">{label}</span>
            <span className="sti-audit-tab__count">{counts[value]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="sti-audit-panel__empty">
          {filter === "all" ? "Nothing detected on this page yet." : `Nothing in "${FILTERS.find((f) => f.value === filter)?.label}" right now.`}
        </div>
      ) : (
        <>
          <div className="sti-audit-panel__stepper">
            <button
              type="button"
              className="sti-audit-panel__step-btn"
              disabled={clampedIndex === 0}
              onClick={() => onNavigate(clampedIndex - 1, filtered[clampedIndex - 1])}
            >
              ‹ Prev
            </button>
            <span className="sti-audit-panel__step-label">
              {FILTERS.find((f) => f.value === filter)?.label} — {clampedIndex + 1} of {filtered.length}
            </span>
            <button
              type="button"
              className="sti-audit-panel__step-btn"
              disabled={clampedIndex === filtered.length - 1}
              onClick={() => onNavigate(clampedIndex + 1, filtered[clampedIndex + 1])}
            >
              Next ›
            </button>
          </div>

          {current && (
            <button type="button" className="sti-audit-panel__current" onClick={() => onNavigate(clampedIndex, current)}>
              <span
                className="sti-audit-badge"
                style={{ background: TYPE_COLORS[current.entry.type].bg, color: TYPE_COLORS[current.entry.type].color }}
              >
                {typeLabel(current.entry)}
              </span>
              <span className="sti-audit-panel__current-name">{displayApiName(current.entry)}</span>
              <span className="sti-audit-panel__current-detail">
                {statusDetail(current)}
                {!current.editable && " — read-only"}
              </span>
            </button>
          )}

          <ul className="sti-audit-panel__list">
            {filtered.map((entry, i) => (
              <li key={entry.key}>
                <button
                  type="button"
                  className={`sti-audit-panel__row${i === clampedIndex ? " sti-audit-panel__row--active" : ""}`}
                  onClick={() => onNavigate(i, entry)}
                >
                  <span className="sti-audit-panel__row-dot" style={{ background: STATUS_DOT[entry.status] }} />
                  <span
                    className="sti-audit-badge sti-audit-badge--sm"
                    style={{ background: TYPE_COLORS[entry.entry.type].bg, color: TYPE_COLORS[entry.entry.type].color }}
                  >
                    {typeLabel(entry.entry)}
                  </span>
                  <span className="sti-audit-panel__row-name" title={entry.entry.apiName}>
                    {displayApiName(entry.entry)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
