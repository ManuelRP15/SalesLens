import { METADATA_API_VERSION } from "./metadata-api";
import { splitLast } from "./metadata-write";
import type {
  LabelEntry,
  LabelType,
  WorkspaceEdit,
  WorkspaceHistoryEntry,
  WorkspaceItem,
  WorkspacePin,
  WorkspaceReviewedMap,
} from "./types";

/**
 * PHASE 16 — the Workspace's pure core: how captured items accumulate (edits from the
 * save path, pins from the inspector), how legacy v1 storage migrates, how items
 * translate into the metadata components a deployment manifest (package.xml) needs,
 * how "did this change behind my back" is assessed against the live index, and (v3,
 * `DECISIONS.md #67`) how items group into ELEMENTS — the atomic unit the Workspace
 * page renders, selects, and reviews by — plus the self-invalidating "reviewed" state
 * that sits alongside items in its own `workspaceReviewed` storage key.
 * Everything here is chrome-free and unit-tested. The background owns WHEN an item is
 * recorded (`background/index.ts`); the Workspace page owns HOW it's shown and owns
 * `workspaceReviewed` entirely (`src/workspace/Workspace.tsx`).
 */

/**
 * Identity of the ELEMENT an item belongs to — the unit Workspace v3 groups, selects,
 * and reviews by (`DECISIONS.md #67`). Edits and pins for the same (type, apiName)
 * share this key even though `itemKey` (below) keeps them as distinct rows.
 */
export function elementKey(type: LabelType, apiName: string): string {
  return `${type} ${apiName}`;
}

/**
 * Identity of one item row. Edits are per (type, apiName, language) — each language of
 * an element is its own change. Pins are per (type, apiName) — you track the ELEMENT,
 * whose snapshot already holds every language.
 */
export function itemKey(item: WorkspaceItem): string {
  return item.kind === "edit"
    ? `edit ${elementKey(item.type, item.apiName)} ${item.language}`
    : `pin ${elementKey(item.type, item.apiName)}`;
}

/**
 * Storage migration + validation in one place: v1 stored bare edit rows (no `kind`)
 * under `workspaceEdits`; v2 stores `WorkspaceItem[]` under `workspaceItems`. Callers
 * pass whatever both keys held; this returns one clean list. Unknown shapes are
 * dropped rather than guessed at.
 */
export function normalizeStoredWorkspace(itemsRaw: unknown, legacyEditsRaw: unknown): WorkspaceItem[] {
  const items: WorkspaceItem[] = [];
  if (Array.isArray(itemsRaw)) {
    for (const row of itemsRaw as Array<{ kind?: string }>) {
      if (row && (row.kind === "edit" || row.kind === "pin")) items.push(row as WorkspaceItem);
    }
  }
  if (Array.isArray(legacyEditsRaw)) {
    for (const row of legacyEditsRaw as Array<{ apiName?: unknown; language?: unknown }>) {
      if (row && typeof row.apiName === "string" && typeof row.language === "string") {
        items.push({ kind: "edit", ...(row as unknown as Omit<WorkspaceEdit, "kind">) });
      }
    }
  }
  return items;
}

/**
 * Folds one new edit into the list. Keyed per `itemKey`: a repeat edit updates
 * `newValue` and `timestamp` but keeps the FIRST capture's `oldValue` — the org's
 * value before this Workspace touched it, which is what the before/after comparator
 * displays and what a future per-item Safe Undo would restore. A row whose `newValue`
 * ends up equal to its original `oldValue` (the user edited back to the original by
 * hand) is kept, not dropped: the element WAS touched, and rows that silently vanish
 * would make the list feel unreliable.
 *
 * Every fold also appends to `history` (Workspace v4, `DECISIONS.md #68`) — the exact
 * `(oldValue, newValue, timestamp)` this specific save carried, nothing reconstructed.
 */
export function recordEdit(items: WorkspaceItem[], edit: WorkspaceEdit): WorkspaceItem[] {
  const key = itemKey(edit);
  const existing = items.find((i) => itemKey(i) === key);
  const historyEntry = { timestamp: edit.timestamp, oldValue: edit.oldValue, newValue: edit.newValue };
  if (!existing) return [...items, { ...edit, editCount: 1, history: [historyEntry] }];
  return items.map((i) =>
    itemKey(i) === key
      ? {
          ...i,
          newValue: edit.newValue,
          timestamp: edit.timestamp,
          editCount: ((i as WorkspaceEdit).editCount ?? 1) + 1,
          history: [...((i as WorkspaceEdit).history ?? []), historyEntry],
        }
      : i
  );
}

/**
 * The edit's full history, oldest first — real entries if the row has them, or one
 * best-effort reconstruction from its top-level fields for rows captured before
 * `history` existed. The reconstructed entry is honestly partial: it's the LATEST
 * transition only (the original `oldValue` alongside the current `newValue`), not a
 * fabricated step-by-step trail — there is no way to know what the intermediate values
 * were for those rows, and this doesn't pretend otherwise.
 */
export function historyOf(edit: WorkspaceEdit): WorkspaceHistoryEntry[] {
  if (edit.history && edit.history.length > 0) return edit.history;
  return [{ timestamp: edit.timestamp, oldValue: edit.oldValue, newValue: edit.newValue }];
}

/**
 * Toggles an element's pin: pinned → unpinned (the pin row is removed), unpinned →
 * pinned with a fresh snapshot. Editing an element does NOT unpin it and vice versa —
 * the two kinds answer different questions ("I changed this" / "I'm watching this")
 * and may coexist for one element.
 */
export function togglePin(items: WorkspaceItem[], pin: WorkspacePin): { items: WorkspaceItem[]; pinned: boolean } {
  const key = itemKey(pin);
  const without = items.filter((i) => itemKey(i) !== key);
  if (without.length !== items.length) return { items: without, pinned: false };
  return { items: [...items, pin], pinned: true };
}

/** The `"type apiName"` pin keys currently in the list — what the tooltip needs to render "In Workspace ✓". */
export function pinnedKeys(items: WorkspaceItem[]): Set<string> {
  return new Set(items.filter((i) => i.kind === "pin").map((i) => elementKey(i.type, i.apiName)));
}

/**
 * Every element key present in the Workspace, pinned OR edited — what a read-only
 * "tracked in Workspace" indicator elsewhere in the product needs (the Translate All
 * audit panel, Workspace v3, `DECISIONS.md #67`). Unlike `pinnedKeys`, doesn't care
 * which kind put the element there.
 */
export function allElementKeys(items: WorkspaceItem[]): Set<string> {
  return new Set(items.map((i) => elementKey(i.type, i.apiName)));
}

export interface PackageMember {
  /** Metadata type name as package.xml's `<name>` wants it, e.g. "CustomObjectTranslation". */
  type: string;
  /** Component fullName as `<members>` wants it, e.g. "Account-es" or "Account.Invoice_Color__c". */
  member: string;
}

function objectPair(objectApiName: string, language: string): PackageMember[] {
  return [
    { type: "CustomObjectTranslation", member: `${objectApiName}-${language}` },
    { type: "CustomObject", member: objectApiName },
  ];
}

/**
 * The metadata components one EDIT implies, mirroring the write path's
 * reverse-engineered dependency sets (`metadata-write.ts`'s per-type targets, lessons
 * #15/#16): the component that was edited + the translation container its value
 * actually lives in + the sibling members the retrieve-unlock relationship needs.
 * This is what makes the generated package.xml usable both as a retrieve manifest
 * (IDE / Workbench) and as the honest answer to "what would deploying my edits touch".
 *
 * LayoutSection deliberately contributes no `Layout` members: which literal Layout
 * records hold the section is only discoverable live (`listMetadataFullNames` at write
 * time — see metadata-write.ts's LayoutSection case), and the section's TRANSLATION
 * lives in the CustomObjectTranslation file regardless.
 */
function packageMembersForEdit(edit: WorkspaceEdit): PackageMember[] {
  switch (edit.type) {
    case "CustomLabel":
      // The label itself, plus the org-wide Translations file its per-language value
      // lives in (the Tooling API rows the extension PATCHes are that same file's data).
      return [
        { type: "CustomLabel", member: edit.apiName },
        { type: "Translations", member: edit.language },
      ];
    case "FieldLabel": {
      const [objectApiName] = splitLast(edit.apiName, ".");
      return [...objectPair(objectApiName, edit.language), { type: "CustomField", member: edit.apiName }];
    }
    case "PicklistValue": {
      const [left] = edit.apiName.split("#");
      if (!left.includes(".")) {
        // Global value set — retrieved standalone, no sibling unlock (metadata-write.ts),
        // but the set itself is still the component the value belongs to.
        return [
          { type: "GlobalValueSetTranslation", member: `${left}-${edit.language}` },
          { type: "GlobalValueSet", member: left },
        ];
      }
      const [objectApiName] = splitLast(left, ".");
      return [...objectPair(objectApiName, edit.language), { type: "CustomField", member: left }];
    }
    case "RecordType": {
      const [objectApiName] = splitLast(edit.apiName, ".");
      return [...objectPair(objectApiName, edit.language), { type: "RecordType", member: edit.apiName }];
    }
    case "WebLink": {
      const [objectApiName] = splitLast(edit.apiName, ".");
      return [...objectPair(objectApiName, edit.language), { type: "WebLink", member: edit.apiName }];
    }
    case "QuickAction": {
      const [objectApiName] = splitLast(edit.apiName, ".");
      return [...objectPair(objectApiName, edit.language), { type: "QuickAction", member: edit.apiName }];
    }
    case "LayoutSection": {
      const [objectApiName] = splitLast(edit.apiName, ".");
      return objectPair(objectApiName, edit.language);
    }
    case "CustomTab":
      return [
        { type: "Translations", member: edit.language },
        { type: "CustomTab", member: edit.apiName },
      ];
    case "CustomApplication":
      return [
        { type: "Translations", member: edit.language },
        { type: "CustomApplication", member: edit.apiName },
      ];
    default:
      // Non-editable types can't produce edits (isEditableEntry gates the write path),
      // so an unknown type here is a data bug — contribute nothing rather than guess.
      return [];
  }
}

/**
 * The metadata components one PIN implies: just the component identity (plus its
 * parent object where one exists) — you pinned the METADATA, not a translation change,
 * so pins contribute no per-language translation containers. Platform-owned types
 * (StandardButton/StandardTab) and RelatedList contribute nothing: there is no
 * admin-deployable component behind them. Standard fields/picklists contribute their
 * object only (no CustomField component exists for them).
 */
function packageMembersForPin(pin: WorkspacePin): PackageMember[] {
  switch (pin.type) {
    case "CustomLabel":
      return [{ type: "CustomLabel", member: pin.apiName }];
    case "FieldLabel": {
      const [objectApiName, fieldApiName] = splitLast(pin.apiName, ".");
      return fieldApiName.endsWith("__c")
        ? [
            { type: "CustomObject", member: objectApiName },
            { type: "CustomField", member: pin.apiName },
          ]
        : [{ type: "CustomObject", member: objectApiName }];
    }
    case "PicklistValue": {
      const [left] = pin.apiName.split("#");
      if (!left.includes(".")) return [{ type: "GlobalValueSet", member: left }];
      const [objectApiName, fieldApiName] = splitLast(left, ".");
      return fieldApiName.endsWith("__c")
        ? [
            { type: "CustomObject", member: objectApiName },
            { type: "CustomField", member: left },
          ]
        : [{ type: "CustomObject", member: objectApiName }];
    }
    case "ObjectLabel":
      return [{ type: "CustomObject", member: pin.apiName }];
    case "RecordType":
      return [
        { type: "CustomObject", member: splitLast(pin.apiName, ".")[0] },
        { type: "RecordType", member: pin.apiName },
      ];
    case "WebLink":
      return [
        { type: "CustomObject", member: splitLast(pin.apiName, ".")[0] },
        { type: "WebLink", member: pin.apiName },
      ];
    case "QuickAction":
      return [
        { type: "CustomObject", member: splitLast(pin.apiName, ".")[0] },
        { type: "QuickAction", member: pin.apiName },
      ];
    case "LayoutSection":
      return [{ type: "CustomObject", member: splitLast(pin.apiName, ".")[0] }];
    case "CustomTab":
      return [{ type: "CustomTab", member: pin.apiName }];
    case "CustomApplication":
      return [{ type: "CustomApplication", member: pin.apiName }];
    default:
      return [];
  }
}

export function packageMembersForItem(item: WorkspaceItem): PackageMember[] {
  return item.kind === "edit" ? packageMembersForEdit(item) : packageMembersForPin(item);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * The deduplicated, grouped, alphabetically sorted package.xml for everything in the
 * Workspace — Salesforce's own `<types>`-per-metadata-type structure, one `<members>`
 * per distinct component. API version follows the same constant the extension's own
 * Metadata API calls use.
 */
export function buildPackageXml(items: WorkspaceItem[], apiVersion: string = METADATA_API_VERSION): string {
  const byType = new Map<string, Set<string>>();
  for (const item of items) {
    for (const { type, member } of packageMembersForItem(item)) {
      const members = byType.get(type) ?? new Set<string>();
      members.add(member);
      byType.set(type, members);
    }
  }
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
  ];
  for (const type of [...byType.keys()].sort()) {
    lines.push("    <types>");
    for (const member of [...byType.get(type)!].sort()) {
      lines.push(`        <members>${escapeXml(member)}</members>`);
    }
    lines.push(`        <name>${escapeXml(type)}</name>`);
    lines.push("    </types>");
  }
  lines.push(`    <version>${apiVersion}</version>`, "</Package>", "");
  return lines.join("\n");
}

export interface WorkspaceSummary {
  editCount: number;
  pinCount: number;
  /** Distinct package components (type + member) implied by the items. */
  componentCount: number;
  /** Languages touched by edits, sorted. */
  languages: string[];
}

export function summarizeWorkspace(items: WorkspaceItem[]): WorkspaceSummary {
  const components = new Set<string>();
  const languages = new Set<string>();
  let editCount = 0;
  let pinCount = 0;
  for (const item of items) {
    if (item.kind === "edit") {
      editCount += 1;
      languages.add(item.language);
    } else {
      pinCount += 1;
    }
    for (const { type, member } of packageMembersForItem(item)) components.add(`${type} ${member}`);
  }
  return { editCount, pinCount, componentCount: components.size, languages: [...languages].sort() };
}

/** One language whose value moved after the Workspace captured it. */
export interface DriftedLanguage {
  language: string;
  /** What the Workspace last knew: an edit's saved value, or a pin's snapshot value. */
  capturedValue: string;
  /** What the index holds now. */
  currentValue: string;
}

export type WorkspaceDrift =
  /** The element is no longer in the current index — outside the last refresh's scope, renamed, or deleted. Honestly unknown, not "unchanged". */
  | { state: "unknown" }
  | { state: "clean" }
  | { state: "changed"; changes: DriftedLanguage[] };

/**
 * "Did this change behind my back?" — compares what the Workspace captured against
 * the entry as the background's index knows it NOW (`cachedEntries`, refreshed on
 * every index rebuild and folded save). No new API calls: this is exactly as fresh as
 * the rest of the product's data, and the page says so. For an edit, the question is
 * whether the language's current value still equals what the user saved; for a pin,
 * whether any snapshotted language moved.
 */
export function assessDrift(item: WorkspaceItem, entry: LabelEntry | undefined): WorkspaceDrift {
  if (!entry) return { state: "unknown" };
  if (item.kind === "edit") {
    const currentValue = entry.valuesByLang[item.language] ?? "";
    if (currentValue === item.newValue) return { state: "clean" };
    return { state: "changed", changes: [{ language: item.language, capturedValue: item.newValue, currentValue }] };
  }
  const changes: DriftedLanguage[] = [];
  for (const [language, capturedValue] of Object.entries(item.snapshot)) {
    const currentValue = entry.valuesByLang[language] ?? "";
    if (currentValue !== capturedValue) changes.push({ language, capturedValue, currentValue });
  }
  return changes.length === 0 ? { state: "clean" } : { state: "changed", changes };
}

/**
 * One element (type + apiName) and every item captured for it — the atomic unit
 * Workspace v3 renders, selects, and reviews (`DECISIONS.md #67`), replacing the old
 * per-type/per-row grouping. An element with edits in two languages plus a pin is ONE
 * group with three items, not three unrelated rows.
 */
export interface ElementGroup {
  key: string;
  type: LabelType;
  apiName: string;
  items: WorkspaceItem[];
  /** The latest `timestamp` across every item in the group. */
  latestTimestamp: number;
}

/** Groups items by `elementKey`. Order follows first appearance in `items`; callers sort as they render. */
export function groupItemsByElement(items: WorkspaceItem[]): ElementGroup[] {
  const groups = new Map<string, ElementGroup>();
  for (const item of items) {
    const key = elementKey(item.type, item.apiName);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      existing.latestTimestamp = Math.max(existing.latestTimestamp, item.timestamp);
    } else {
      groups.set(key, { key, type: item.type, apiName: item.apiName, items: [item], latestTimestamp: item.timestamp });
    }
  }
  return [...groups.values()];
}

/**
 * The element's drift, aggregated from `assessDrift` on each of its items — reused,
 * not reimplemented. All items in a group share one `entry` lookup (same type +
 * apiName), so "unknown" is uniform across the group; "changed" combines every
 * drifted language across the group's items (edit values and pin-snapshot values
 * alike) into one list, deduplicated by language.
 */
export function elementDrift(group: ElementGroup, entriesByKey: Map<string, LabelEntry>): WorkspaceDrift {
  const entry = entriesByKey.get(group.key);
  const perItem = group.items.map((item) => assessDrift(item, entry));
  if (perItem.some((d) => d.state === "unknown")) return { state: "unknown" };
  const changesByLanguage = new Map<string, DriftedLanguage>();
  for (const drift of perItem) {
    if (drift.state !== "changed") continue;
    for (const change of drift.changes) changesByLanguage.set(change.language, change);
  }
  return changesByLanguage.size === 0 ? { state: "clean" } : { state: "changed", changes: [...changesByLanguage.values()] };
}

/**
 * Whether a "reviewed" mark on this element still holds — self-invalidating by
 * design (`DECISIONS.md #67`): stale the instant something newer touches the
 * element (another edit/pin, bumping `latestTimestamp`) or the org drifts under it.
 * Nothing has to actively clear `workspaceReviewed` for this to work.
 */
export function isReviewedFresh(reviewedAt: number | undefined, group: ElementGroup, drift: WorkspaceDrift): boolean {
  if (reviewedAt === undefined) return false;
  if (reviewedAt < group.latestTimestamp) return false;
  return drift.state !== "changed";
}

/** Defensive parse of the `workspaceReviewed` storage value — drops anything that isn't a clean `string -> number` map, same posture as `normalizeStoredWorkspace`. */
export function normalizeReviewedMap(raw: unknown): WorkspaceReviewedMap {
  const result: WorkspaceReviewedMap = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return result;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number") result[key] = value;
  }
  return result;
}

/** Element-level counts for an at-a-glance summary — the same computation the Workspace page does per row (`allGroups` in `Workspace.tsx`), extracted so the popup can share it instead of re-deriving its own (Workspace v4, `DECISIONS.md #68`). */
export interface WorkspaceOverviewCounts {
  elementCount: number;
  needsReviewCount: number;
  changedCount: number;
}

export function workspaceOverviewCounts(
  items: WorkspaceItem[],
  reviewed: WorkspaceReviewedMap,
  entriesByKey: Map<string, LabelEntry>
): WorkspaceOverviewCounts {
  const groups = groupItemsByElement(items);
  let needsReviewCount = 0;
  let changedCount = 0;
  for (const group of groups) {
    const drift = elementDrift(group, entriesByKey);
    if (drift.state === "changed") changedCount += 1;
    if (!isReviewedFresh(reviewed[group.key], group, drift)) needsReviewCount += 1;
  }
  return { elementCount: groups.length, needsReviewCount, changedCount };
}

/**
 * A whole Workspace's state, portable across machines/sessions (Workspace v4,
 * `DECISIONS.md #68`) — deliberately NOT package.xml: this describes the extension's
 * OWN state (what's tracked, its history, review status), package.xml describes
 * Salesforce metadata for a deploy. `formatVersion` exists so a future shape change
 * has somewhere to branch from; there's exactly one version today.
 */
export interface WorkspaceExport {
  formatVersion: 1;
  exportedAt: number;
  items: WorkspaceItem[];
  reviewed: WorkspaceReviewedMap;
}

export function buildWorkspaceExport(items: WorkspaceItem[], reviewed: WorkspaceReviewedMap): WorkspaceExport {
  return { formatVersion: 1, exportedAt: Date.now(), items, reviewed };
}

export interface ParsedWorkspaceImport {
  items: WorkspaceItem[];
  reviewed: WorkspaceReviewedMap;
}

/**
 * Defensive parse of an imported Workspace file. Accepts the v4 envelope AND a bare
 * `WorkspaceItem[]` — what the pre-v4 "Export JSON" button produced, so nothing
 * exported before this feature existed is stranded. Reuses `normalizeStoredWorkspace`/
 * `normalizeReviewedMap` for row-level validation (they already drop malformed entries
 * instead of guessing) rather than re-implementing that. Anything else — not JSON,
 * not an array, not an object with an `items` array — returns `null`.
 */
export function parseWorkspaceExport(raw: unknown): ParsedWorkspaceImport | null {
  if (Array.isArray(raw)) {
    return { items: normalizeStoredWorkspace(raw, undefined), reviewed: {} };
  }
  if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)) {
    const obj = raw as { items: unknown; reviewed?: unknown };
    return { items: normalizeStoredWorkspace(obj.items, undefined), reviewed: normalizeReviewedMap(obj.reviewed) };
  }
  return null;
}

/**
 * Merges an imported Workspace into the current one — the default, non-destructive
 * import path (Replace is a separate, explicitly-armed action in the UI). Items
 * dedupe by `itemKey`; on a genuine conflict (same key on both sides) the NEWER
 * `timestamp` wins, same "most recent capture is the truth" rule the fold logic
 * already uses elsewhere. Reviewed marks merge by keeping the LATER `reviewedAt` per
 * element key — never loses a more-informed review just because it came from the
 * other side.
 */
export function mergeWorkspaceExport(current: ParsedWorkspaceImport, incoming: ParsedWorkspaceImport): ParsedWorkspaceImport {
  const byKey = new Map<string, WorkspaceItem>();
  for (const item of current.items) byKey.set(itemKey(item), item);
  for (const item of incoming.items) {
    const existing = byKey.get(itemKey(item));
    if (!existing || item.timestamp >= existing.timestamp) byKey.set(itemKey(item), item);
  }
  const reviewed: WorkspaceReviewedMap = { ...current.reviewed };
  for (const [key, ts] of Object.entries(incoming.reviewed)) {
    reviewed[key] = Math.max(reviewed[key] ?? 0, ts);
  }
  return { items: [...byKey.values()], reviewed };
}
