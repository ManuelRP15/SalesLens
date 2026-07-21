import { useEffect, useRef } from "react";
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

/**
 * The ONE semantic color per status, referenced by every surface that has to
 * communicate it (the row's status rail, the active tab, the stepper's status word)
 * — a status must read the same everywhere or the "understand the page at a glance"
 * goal collapses into "read every label" again (DECISIONS.md #62).
 */
const STATUS_COLOR: Record<AuditStatus, string> = {
  missing: "#c0392b",
  identical: "#b8860b",
  complete: "#1a7f4e",
};

/** One line explaining WHY this specific entry is in the current filter — the specific language(s) involved, not just the category name, so the user knows exactly what to fix. */
function statusDetail(entry: AuditEntry): string {
  if (entry.status === "missing") return `Missing: ${entry.missingLanguages.join(", ")}`;
  if (entry.status === "identical") return `Identical to source: ${entry.identicalLanguages.join(", ")}`;
  return "Fully translated";
}

/** The compact per-row version of `statusDetail` — just the language codes, since the row's own colored rail already carries WHICH status they belong to. Empty for `complete` (nothing to act on). */
function rowMeta(entry: AuditEntry): string {
  if (entry.status === "missing") return entry.missingLanguages.join(" ");
  if (entry.status === "identical") return entry.identicalLanguages.join(" ");
  return "";
}

/**
 * Everything about one entry a user could plausibly type into the search box:
 * the label they see on the page, the API name they'd paste into Setup or code (full
 * AND display form — the display form drops the object prefix, so "Account.Phone"
 * must still match a row displayed as just "Phone"), the type name, and every
 * translated value. Deliberately NOT configurable — a single box that searches
 * "everything meaningful about this entry" needs no configuration to be predictable.
 */
function searchHaystack(entry: AuditEntry): string {
  return [
    entry.entry.apiName,
    displayApiName(entry.entry),
    typeLabel(entry.entry),
    ...Object.values(entry.entry.valuesByLang),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * The metadata-type axis (DECISIONS.md #63) uses `typeLabel()` — the SAME string the
 * entry's own badge shows, which is what makes the filter self-explanatory: you filter
 * by clicking the name you can already see on the rows. It also means "Field" and
 * "Custom Field" are separate, MUTUALLY EXCLUSIVE categories rather than a broad
 * "Field" containing both, because that is how the badges already split them; a
 * "Field" chip that also matched rows badged "Custom Field" would contradict the row
 * it selected. Selecting both chips is the union, so "all fields" remains one click
 * away without inventing an overlapping category.
 */
export function entryTypeLabel(entry: AuditEntry): string {
  return typeLabel(entry.entry);
}

/**
 * The SINGLE source of truth for "which entries are currently showing" — used by the
 * panel to render AND by content/index.tsx to resolve the current navigation target /
 * badge scope. Both used to apply their own copy of the filter predicate; adding
 * further axes (search, then metadata type) to independent copies is exactly how they
 * drift out of sync, so there is one function and every axis lands in it.
 *
 * The three axes are independent and combine with AND: status tab, free text, and
 * metadata type. An empty `types` means "no type restriction" — not "nothing matches".
 */
export function filterAuditEntries(
  entries: AuditEntry[],
  filter: AuditFilter,
  search: string,
  types: string[] = []
): AuditEntry[] {
  const needle = search.trim().toLowerCase();
  return entries.filter(
    (e) =>
      (filter === "all" || e.status === filter) &&
      (needle === "" || searchHaystack(e).includes(needle)) &&
      (types.length === 0 || types.includes(entryTypeLabel(e)))
  );
}

/**
 * Keeps the active row visible inside the panel's OWN list, and nothing else —
 * deliberately not `scrollIntoView`, which walks up and scrolls every scrollable
 * ancestor it finds: here that would mean the Salesforce page itself moving as a side
 * effect of a panel-internal list adjusting, fighting the guided navigation's own
 * (separately computed, obstruction-corrected) page scroll. Also a no-op when the row
 * is already comfortably visible, so stepping through a short filtered list doesn't
 * animate for no reason.
 */
function scrollRowIntoList(list: HTMLElement, row: HTMLElement) {
  const delta = listScrollDelta(list.getBoundingClientRect(), row.getBoundingClientRect());
  if (delta === 0) return;
  list.scrollTo({ top: list.scrollTop + delta, behavior: "smooth" });
}

/** Vertical padding kept between the active row and the list's own edges — enough that the selected row never sits flush against the boundary and read as "half off the list". */
const LIST_SCROLL_PAD_PX = 8;

/**
 * How far the list must scroll for the row to be comfortably visible: negative to
 * scroll up, positive down, ZERO when the row already is (the common case while
 * stepping through a short list, and the reason this doesn't animate for no reason).
 * Split out from the DOM call above purely so this decision is unit-testable — the
 * `scrollTo` that follows is three lines with nothing left to get wrong.
 */
export function listScrollDelta(listRect: DOMRect, rowRect: DOMRect, pad = LIST_SCROLL_PAD_PX): number {
  if (rowRect.top < listRect.top + pad) return rowRect.top - (listRect.top + pad);
  if (rowRect.bottom > listRect.bottom - pad) return rowRect.bottom - (listRect.bottom - pad);
  return 0;
}

export interface AuditPanelProps {
  entries: AuditEntry[];
  filter: AuditFilter;
  onFilterChange: (filter: AuditFilter) => void;
  /** Free-text search, applied ON TOP of the filter tabs (they are independent axes, not alternatives) — see `filterAuditEntries`. */
  search: string;
  onSearchChange: (search: string) => void;
  /** Selected metadata-type labels (`typeLabel()` strings). Empty = no type restriction. */
  typeFilters: string[];
  onTypeFiltersChange: (types: string[]) => void;
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
 * DECISIONS.md #60/#62) — a collapsed pill by default (lightweight, unobtrusive),
 * expands into a search box + filter tabs + a Prev/Next stepper + a clickable list,
 * all reading from the same `AuditEntry[]` `translation-mode.tsx`'s scan already
 * produces for the inline badges. This component is purely presentational: every
 * action (filter change, search, navigate) calls back into content/index.tsx, which
 * owns scrolling/highlighting/opening the inspector — the panel itself never touches
 * the page DOM or the inspector. Its ONE piece of local behavior is keeping its own
 * active row scrolled into view (`scrollRowIntoList`), which is genuinely internal to
 * this list and has no meaning outside it.
 */
export function AuditPanel({
  entries,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  typeFilters,
  onTypeFiltersChange,
  currentIndex,
  onNavigate,
  expanded,
  onToggleExpanded,
  scope,
  onScopeChange,
}: AuditPanelProps) {
  const listRef = useRef<HTMLUListElement | null>(null);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);

  // Counts are always the FULL picture for the current search AND type selection — the
  // tabs have to keep answering "how much is in each category" while those are active,
  // otherwise switching tabs mid-search is a blind guess.
  const searched = filterAuditEntries(entries, "all", search, typeFilters);
  const counts: Record<AuditFilter, number> = { all: searched.length, missing: 0, identical: 0, complete: 0 };
  for (const e of searched) counts[e.status]++;

  // Only types actually PRESENT on this page get a chip — a filter for something that
  // cannot match is pure noise, and it keeps the row short on ordinary record pages.
  const availableTypes = [...new Set(entries.map(entryTypeLabel))].sort();

  const filtered = filterAuditEntries(entries, filter, search, typeFilters);
  const clampedIndex = filtered.length === 0 ? 0 : Math.min(currentIndex, filtered.length - 1);
  const current = filtered[clampedIndex];
  const issueCount = counts.missing + counts.identical;

  // The internal list follows navigation the same way the page does (DECISIONS.md
  // #62) — keyed on the active entry's identity, not the raw index, so a save that
  // reshuffles the filtered array doesn't scroll to whatever now happens to sit at
  // the same index.
  useEffect(() => {
    const list = listRef.current;
    const row = activeRowRef.current;
    if (expanded && list && row) scrollRowIntoList(list, row);
  }, [current?.key, expanded, filter, search, typeFilters.join("|")]);

  if (!expanded) {
    return (
      <button type="button" className="sti-audit-pill" onClick={onToggleExpanded}>
        <span className="sti-audit-pill__dot" style={{ background: issueCount > 0 ? STATUS_COLOR.missing : STATUS_COLOR.complete }} />
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

      <div className="sti-audit-panel__search">
        <input
          type="text"
          className="sti-audit-search-input"
          placeholder="Search label, API name, value…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search translations on this page"
        />
        {search !== "" && (
          <button
            type="button"
            className="sti-audit-search-clear"
            onClick={() => onSearchChange("")}
            title="Clear search"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Metadata-type chips (DECISIONS.md #63): the whole filter UI is this one
          wrapped row — no dropdown to open, no panel to manage, nothing to configure.
          Each chip is the exact badge label used on the rows themselves, and a
          selected chip adopts that type's own badge colours, so the connection between
          "what I picked" and "what I see" needs no explanation. Multi-select, and the
          only extra affordance is a Clear that appears once something is on. */}
      {availableTypes.length > 1 && (
        <div className="sti-audit-panel__types">
          {availableTypes.map((label) => {
            const on = typeFilters.includes(label);
            const sample = entries.find((e) => entryTypeLabel(e) === label);
            const colors = sample ? TYPE_COLORS[sample.entry.type] : undefined;
            return (
              <button
                key={label}
                type="button"
                className={`sti-audit-type-chip${on ? " sti-audit-type-chip--on" : ""}`}
                style={on && colors ? { background: colors.bg, color: colors.color, borderColor: colors.bg } : undefined}
                aria-pressed={on}
                onClick={() =>
                  onTypeFiltersChange(on ? typeFilters.filter((t) => t !== label) : [...typeFilters, label])
                }
              >
                {label}
              </button>
            );
          })}
          {typeFilters.length > 0 && (
            <button type="button" className="sti-audit-type-clear" onClick={() => onTypeFiltersChange([])}>
              Clear
            </button>
          )}
        </div>
      )}

      <div className="sti-audit-panel__tabs">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`sti-audit-tab sti-audit-tab--${value}${filter === value ? " sti-audit-tab--active" : ""}`}
            onClick={() => onFilterChange(value)}
          >
            <span className="sti-audit-tab__label">{label}</span>
            <span className="sti-audit-tab__count">{counts[value]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="sti-audit-panel__empty">
          {search.trim() !== "" || typeFilters.length > 0
            ? "No match for the current search and filters."
            : filter === "all"
              ? "Nothing detected on this page yet."
              : `Nothing in "${FILTERS.find((f) => f.value === filter)?.label}" right now.`}
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
            <button
              type="button"
              className={`sti-audit-panel__current sti-audit-panel__current--${current.status}`}
              onClick={() => onNavigate(clampedIndex, current)}
            >
              <span
                className="sti-audit-badge"
                style={{ background: TYPE_COLORS[current.entry.type].bg, color: TYPE_COLORS[current.entry.type].color }}
              >
                {typeLabel(current.entry)}
              </span>
              <span className="sti-audit-panel__current-name">{displayApiName(current.entry)}</span>
              <span className="sti-audit-panel__current-detail" style={{ color: STATUS_COLOR[current.status] }}>
                {statusDetail(current)}
                {!current.editable && <span className="sti-audit-panel__readonly"> · read-only</span>}
              </span>
            </button>
          )}

          <ul className="sti-audit-panel__list" ref={listRef}>
            {filtered.map((entry, i) => {
              const active = i === clampedIndex;
              const meta = rowMeta(entry);
              return (
                <li key={entry.key}>
                  <button
                    ref={active ? activeRowRef : undefined}
                    type="button"
                    className={`sti-audit-panel__row sti-audit-panel__row--${entry.status}${active ? " sti-audit-panel__row--active" : ""}`}
                    onClick={() => onNavigate(i, entry)}
                    aria-current={active ? "true" : undefined}
                  >
                    {/* A real selection marker, not a colour difference the eye has to
                        infer — the caret is the one element only the selected row ever
                        has, so "which am I on" survives any status colour behind it
                        (DECISIONS.md #63). */}
                    <span className="sti-audit-panel__row-caret" aria-hidden="true">
                      {active ? "▸" : ""}
                    </span>
                    <span
                      className="sti-audit-badge sti-audit-badge--sm"
                      style={{ background: TYPE_COLORS[entry.entry.type].bg, color: TYPE_COLORS[entry.entry.type].color }}
                    >
                      {typeLabel(entry.entry)}
                    </span>
                    <span className="sti-audit-panel__row-name" title={entry.entry.apiName}>
                      {displayApiName(entry.entry)}
                    </span>
                    {meta && (
                      <span className="sti-audit-panel__row-meta" style={{ color: STATUS_COLOR[entry.status] }}>
                        {meta}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
