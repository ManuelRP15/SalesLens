import { describe, expect, it } from "vitest";
import type { LabelEntry, WorkspaceEdit, WorkspaceItem, WorkspacePin } from "./types";
import {
  allElementKeys,
  assessDrift,
  buildPackageXml,
  buildWorkspaceExport,
  elementDrift,
  elementKey,
  groupItemsByElement,
  historyOf,
  isReviewedFresh,
  mergeWorkspaceExport,
  normalizeReviewedMap,
  normalizeStoredWorkspace,
  packageMembersForItem,
  parseWorkspaceExport,
  pinnedKeys,
  recordEdit,
  summarizeWorkspace,
  togglePin,
  workspaceOverviewCounts,
} from "./workspace";

function edit(partial: Partial<WorkspaceEdit>): WorkspaceEdit {
  return {
    kind: "edit",
    type: "CustomLabel",
    apiName: "Welcome_Message",
    language: "es",
    oldValue: "Bienvenido",
    newValue: "Bienvenido de nuevo",
    timestamp: 1000,
    ...partial,
  };
}

function pin(partial: Partial<WorkspacePin>): WorkspacePin {
  return {
    kind: "pin",
    type: "FieldLabel",
    apiName: "Account.Status__c",
    snapshot: { en_US: "Status", es: "Estado" },
    timestamp: 1000,
    ...partial,
  };
}

describe("normalizeStoredWorkspace — v1→v2 migration", () => {
  it("keeps v2 items and folds legacy v1 edit rows in with kind added", () => {
    const legacy = { type: "CustomLabel", apiName: "X", language: "es", oldValue: "a", newValue: "b", timestamp: 1 };
    const result = normalizeStoredWorkspace([pin({})], [legacy]);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("pin");
    expect(result[1]).toMatchObject({ kind: "edit", apiName: "X", language: "es" });
  });

  it("drops unrecognizable rows instead of guessing", () => {
    expect(normalizeStoredWorkspace([{ bogus: true }], [{ alsoBogus: 1 }])).toHaveLength(0);
    expect(normalizeStoredWorkspace(undefined, undefined)).toHaveLength(0);
  });
});

describe("recordEdit — the fold rule", () => {
  it("appends a brand-new key", () => {
    expect(recordEdit([], edit({}))).toHaveLength(1);
  });

  it("updates newValue/timestamp of an existing key but keeps the FIRST oldValue", () => {
    const first = edit({ oldValue: "Original", newValue: "Second", timestamp: 1 });
    const result = recordEdit([first], edit({ oldValue: "Second", newValue: "Third", timestamp: 2 }));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ oldValue: "Original", newValue: "Third", timestamp: 2 });
  });

  it("starts editCount at 1 on first capture and increments on every repeat fold", () => {
    const first = recordEdit([], edit({ timestamp: 1 }));
    expect((first[0] as WorkspaceEdit).editCount).toBe(1);
    const second = recordEdit(first, edit({ timestamp: 2 }));
    expect((second[0] as WorkspaceEdit).editCount).toBe(2);
    const third = recordEdit(second, edit({ timestamp: 3 }));
    expect((third[0] as WorkspaceEdit).editCount).toBe(3);
  });

  it("treats another language of the same element as a separate row", () => {
    expect(recordEdit([edit({ language: "es" })], edit({ language: "fr" }))).toHaveLength(2);
  });

  it("appends every fold's exact (oldValue, newValue, timestamp) to history, oldest first (DECISIONS.md #68)", () => {
    const first = recordEdit([], edit({ oldValue: "Red", newValue: "Rojo", timestamp: 1 }));
    const second = recordEdit(first, edit({ oldValue: "Rojo", newValue: "Rojo oscuro", timestamp: 2 }));
    const third = recordEdit(second, edit({ oldValue: "Rojo oscuro", newValue: "Rojo", timestamp: 3 }));
    expect((third[0] as WorkspaceEdit).history).toEqual([
      { timestamp: 1, oldValue: "Red", newValue: "Rojo" },
      { timestamp: 2, oldValue: "Rojo", newValue: "Rojo oscuro" },
      { timestamp: 3, oldValue: "Rojo oscuro", newValue: "Rojo" },
    ]);
  });

  it("keeps a row the user edited back to its original value (touched, not vanished)", () => {
    const result = recordEdit(
      [edit({ oldValue: "Original", newValue: "Changed", timestamp: 1 })],
      edit({ oldValue: "Changed", newValue: "Original", timestamp: 2 })
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ oldValue: "Original", newValue: "Original" });
  });

  it("never touches pin rows", () => {
    const result = recordEdit([pin({ apiName: "Welcome_Message", type: "CustomLabel" })], edit({}));
    expect(result).toHaveLength(2);
  });
});

describe("togglePin", () => {
  it("adds when absent, removes when present, and reports the resulting state", () => {
    const added = togglePin([], pin({}));
    expect(added.pinned).toBe(true);
    expect(added.items).toHaveLength(1);
    const removed = togglePin(added.items, pin({ snapshot: {} }));
    expect(removed.pinned).toBe(false);
    expect(removed.items).toHaveLength(0);
  });

  it("coexists with an edit of the same element (different questions, both kept)", () => {
    const withEdit = [edit({ type: "FieldLabel", apiName: "Account.Status__c", language: "es" })];
    const result = togglePin(withEdit, pin({}));
    expect(result.items).toHaveLength(2);
  });

  it("pinnedKeys reflects only pins", () => {
    const items = [edit({}), pin({})];
    expect(pinnedKeys(items)).toEqual(new Set(["FieldLabel Account.Status__c"]));
  });
});

describe("packageMembersForItem — edits mirror the write path's dependency sets", () => {
  it("CustomLabel edit → the label + the language's Translations file", () => {
    expect(packageMembersForItem(edit({ type: "CustomLabel", apiName: "Welcome_Message", language: "es" }))).toEqual([
      { type: "CustomLabel", member: "Welcome_Message" },
      { type: "Translations", member: "es" },
    ]);
  });

  it("FieldLabel edit → CustomObjectTranslation + CustomObject + CustomField (lesson #15/#16 unlock)", () => {
    expect(packageMembersForItem(edit({ type: "FieldLabel", apiName: "Account.Invoice_Color__c", language: "fr" }))).toEqual([
      { type: "CustomObjectTranslation", member: "Account-fr" },
      { type: "CustomObject", member: "Account" },
      { type: "CustomField", member: "Account.Invoice_Color__c" },
    ]);
  });

  it("object-scoped PicklistValue edit → same set as its field", () => {
    expect(packageMembersForItem(edit({ type: "PicklistValue", apiName: "Account.Status__c#Active", language: "es" }))).toEqual([
      { type: "CustomObjectTranslation", member: "Account-es" },
      { type: "CustomObject", member: "Account" },
      { type: "CustomField", member: "Account.Status__c" },
    ]);
  });

  it("global-value-set PicklistValue edit → GlobalValueSetTranslation + the set", () => {
    expect(packageMembersForItem(edit({ type: "PicklistValue", apiName: "Regions#EMEA", language: "es" }))).toEqual([
      { type: "GlobalValueSetTranslation", member: "Regions-es" },
      { type: "GlobalValueSet", member: "Regions" },
    ]);
  });

  it("RecordType / WebLink / QuickAction edits each add themselves on top of the object pair", () => {
    for (const type of ["RecordType", "WebLink", "QuickAction"] as const) {
      expect(packageMembersForItem(edit({ type, apiName: "Account.Special", language: "nl_NL" }))).toEqual([
        { type: "CustomObjectTranslation", member: "Account-nl_NL" },
        { type: "CustomObject", member: "Account" },
        { type: type, member: "Account.Special" },
      ]);
    }
  });

  it("LayoutSection edit → object pair only (Layout members are live-only)", () => {
    expect(packageMembersForItem(edit({ type: "LayoutSection", apiName: "Account.Extra Info", language: "es" }))).toEqual([
      { type: "CustomObjectTranslation", member: "Account-es" },
      { type: "CustomObject", member: "Account" },
    ]);
  });

  it("CustomTab / CustomApplication edits → the language's Translations file + themselves", () => {
    expect(packageMembersForItem(edit({ type: "CustomTab", apiName: "My_Tab", language: "fr" }))).toEqual([
      { type: "Translations", member: "fr" },
      { type: "CustomTab", member: "My_Tab" },
    ]);
  });
});

describe("packageMembersForItem — pins contribute component identity, no translation containers", () => {
  it("custom field pin → object + field, no CustomObjectTranslation", () => {
    expect(packageMembersForItem(pin({ type: "FieldLabel", apiName: "Account.Invoice_Color__c" }))).toEqual([
      { type: "CustomObject", member: "Account" },
      { type: "CustomField", member: "Account.Invoice_Color__c" },
    ]);
  });

  it("standard field pin → its object only (no CustomField component exists)", () => {
    expect(packageMembersForItem(pin({ type: "FieldLabel", apiName: "Account.Industry" }))).toEqual([
      { type: "CustomObject", member: "Account" },
    ]);
  });

  it("ObjectLabel pin → the object; platform types contribute nothing", () => {
    expect(packageMembersForItem(pin({ type: "ObjectLabel", apiName: "Invoice__c" }))).toEqual([
      { type: "CustomObject", member: "Invoice__c" },
    ]);
    expect(packageMembersForItem(pin({ type: "StandardButton", apiName: "New" }))).toEqual([]);
    expect(packageMembersForItem(pin({ type: "StandardTab", apiName: "Details" }))).toEqual([]);
  });
});

describe("buildPackageXml", () => {
  it("dedupes shared members and sorts types and members alphabetically", () => {
    const xml = buildPackageXml([
      edit({ type: "FieldLabel", apiName: "Account.B__c", language: "es" }),
      edit({ type: "FieldLabel", apiName: "Account.A__c", language: "es" }),
    ]);
    expect(xml.match(/Account-es/g)).toHaveLength(1);
    expect(xml.indexOf("Account.A__c")).toBeLessThan(xml.indexOf("Account.B__c"));
    expect(xml.indexOf("<name>CustomField</name>")).toBeLessThan(xml.indexOf("<name>CustomObject</name>"));
  });

  it("uses the extension's own Metadata API version and the standard Package envelope", () => {
    const xml = buildPackageXml([edit({})]);
    expect(xml).toContain('<Package xmlns="http://soap.sforce.com/2006/04/metadata">');
    expect(xml).toContain("<version>61.0</version>");
    expect(xml.endsWith("</Package>\n")).toBe(true);
  });

  it("escapes XML-significant characters in member names", () => {
    const xml = buildPackageXml([edit({ type: "CustomTab", apiName: "Tab_&_<X>", language: "es" })]);
    expect(xml).toContain("<members>Tab_&amp;_&lt;X&gt;</members>");
  });

  it("renders an empty (but valid) package for an empty workspace", () => {
    const xml = buildPackageXml([]);
    expect(xml).not.toContain("<types>");
    expect(xml).toContain("<version>");
  });
});

describe("summarizeWorkspace", () => {
  it("counts edits, pins, distinct components, and sorted edit languages", () => {
    const summary = summarizeWorkspace([
      edit({ type: "FieldLabel", apiName: "Account.A__c", language: "fr" }),
      edit({ type: "CustomLabel", apiName: "Welcome", language: "es" }),
      pin({ type: "ObjectLabel", apiName: "Invoice__c", snapshot: { en_US: "Invoice" } }),
    ]);
    expect(summary.editCount).toBe(2);
    expect(summary.pinCount).toBe(1);
    // Account-fr + Account + A__c + Welcome + Translations:es + Invoice__c = 6.
    expect(summary.componentCount).toBe(6);
    expect(summary.languages).toEqual(["es", "fr"]);
  });
});

describe("assessDrift — 'did this change behind my back?'", () => {
  const entry: LabelEntry = {
    apiName: "Account.Status__c",
    type: "FieldLabel",
    valuesByLang: { en_US: "Status", es: "Estado actual", fr: "Statut" },
  };

  it("no entry in the index → honestly unknown, never 'clean'", () => {
    expect(assessDrift(edit({}), undefined)).toEqual({ state: "unknown" });
  });

  it("edit whose saved value still matches the index → clean", () => {
    const e = edit({ type: "FieldLabel", apiName: "Account.Status__c", language: "fr", newValue: "Statut" });
    expect(assessDrift(e, entry)).toEqual({ state: "clean" });
  });

  it("edit whose language moved afterwards → changed, with captured vs current", () => {
    const e = edit({ type: "FieldLabel", apiName: "Account.Status__c", language: "es", newValue: "Estado" });
    expect(assessDrift(e, entry)).toEqual({
      state: "changed",
      changes: [{ language: "es", capturedValue: "Estado", currentValue: "Estado actual" }],
    });
  });

  it("pin drift compares every snapshotted language and reports only the moved ones", () => {
    const p = pin({ snapshot: { en_US: "Status", es: "Estado", fr: "Statut" } });
    expect(assessDrift(p, entry)).toEqual({
      state: "changed",
      changes: [{ language: "es", capturedValue: "Estado", currentValue: "Estado actual" }],
    });
    expect(assessDrift(pin({ snapshot: { en_US: "Status", fr: "Statut" } }), entry)).toEqual({ state: "clean" });
  });
});

describe("elementKey / allElementKeys — Workspace v3 element identity (DECISIONS.md #67)", () => {
  it("elementKey is the same 'type apiName' shape pinnedKeys already used", () => {
    expect(elementKey("FieldLabel", "Account.Status__c")).toBe("FieldLabel Account.Status__c");
  });

  it("allElementKeys covers both pins and edits, unlike pinnedKeys", () => {
    const items = [edit({ type: "CustomLabel", apiName: "Welcome_Message" }), pin({})];
    expect(allElementKeys(items)).toEqual(new Set(["CustomLabel Welcome_Message", "FieldLabel Account.Status__c"]));
    expect(pinnedKeys(items)).toEqual(new Set(["FieldLabel Account.Status__c"]));
  });
});

describe("groupItemsByElement", () => {
  it("groups an edit in two languages plus a pin of the same element into ONE group", () => {
    const items: WorkspaceItem[] = [
      edit({ type: "FieldLabel", apiName: "Account.Invoice_Color__c", language: "es", timestamp: 10 }),
      edit({ type: "FieldLabel", apiName: "Account.Invoice_Color__c", language: "fr", timestamp: 20 }),
      pin({ type: "FieldLabel", apiName: "Account.Invoice_Color__c", timestamp: 5 }),
      edit({ type: "CustomLabel", apiName: "Welcome_Message", timestamp: 1 }),
    ];
    const groups = groupItemsByElement(items);
    expect(groups).toHaveLength(2);
    const invoiceColor = groups.find((g) => g.apiName === "Account.Invoice_Color__c")!;
    expect(invoiceColor.items).toHaveLength(3);
    expect(invoiceColor.latestTimestamp).toBe(20);
  });

  it("returns one group per unrelated element", () => {
    const items = [edit({ apiName: "A" }), edit({ apiName: "B" })];
    expect(groupItemsByElement(items)).toHaveLength(2);
  });
});

describe("elementDrift — aggregates assessDrift across a group's items", () => {
  const entry: LabelEntry = {
    apiName: "Account.Status__c",
    type: "FieldLabel",
    valuesByLang: { en_US: "Status", es: "Estado actual", fr: "Statut" },
  };
  const entriesByKey = new Map([["FieldLabel Account.Status__c", entry]]);

  it("clean when every item in the group matches the index", () => {
    const group = groupItemsByElement([
      edit({ type: "FieldLabel", apiName: "Account.Status__c", language: "fr", newValue: "Statut" }),
      pin({ snapshot: { en_US: "Status", fr: "Statut" } }),
    ])[0];
    expect(elementDrift(group, entriesByKey)).toEqual({ state: "clean" });
  });

  it("unknown when the element isn't in the index, uniformly across its items", () => {
    const group = groupItemsByElement([pin({ type: "CustomLabel", apiName: "Deleted_Label", snapshot: { en_US: "x" } })])[0];
    expect(elementDrift(group, new Map())).toEqual({ state: "unknown" });
  });

  it("changed combines drifted languages from every item, deduplicated", () => {
    const group = groupItemsByElement([
      edit({ type: "FieldLabel", apiName: "Account.Status__c", language: "es", newValue: "Estado" }),
      pin({ snapshot: { es: "Estado", fr: "Statut" } }),
    ])[0];
    const drift = elementDrift(group, entriesByKey);
    expect(drift.state).toBe("changed");
    expect(drift.state === "changed" && drift.changes.map((c) => c.language)).toEqual(["es"]);
  });
});

describe("isReviewedFresh — self-invalidating reviewed status", () => {
  const cleanGroup = groupItemsByElement([edit({ timestamp: 100 })])[0];

  it("false when never reviewed", () => {
    expect(isReviewedFresh(undefined, cleanGroup, { state: "clean" })).toBe(false);
  });

  it("true when reviewed after the element's latest activity and not drifted", () => {
    expect(isReviewedFresh(150, cleanGroup, { state: "clean" })).toBe(true);
  });

  it("false when a newer edit/pin landed after the review (stale)", () => {
    expect(isReviewedFresh(90, cleanGroup, { state: "clean" })).toBe(false);
  });

  it("false when the element has drifted since, even if the review is recent", () => {
    expect(isReviewedFresh(150, cleanGroup, { state: "changed", changes: [] })).toBe(false);
  });
});

describe("normalizeReviewedMap", () => {
  it("keeps clean string->number entries", () => {
    expect(normalizeReviewedMap({ "CustomLabel X": 123 })).toEqual({ "CustomLabel X": 123 });
  });

  it("drops non-numeric values and non-object input instead of guessing", () => {
    expect(normalizeReviewedMap({ "CustomLabel X": "not a number", "CustomLabel Y": 5 })).toEqual({ "CustomLabel Y": 5 });
    expect(normalizeReviewedMap(undefined)).toEqual({});
    expect(normalizeReviewedMap(null)).toEqual({});
    expect(normalizeReviewedMap([1, 2, 3])).toEqual({});
  });
});

describe("historyOf — real entries, or an honest best-effort reconstruction (DECISIONS.md #68)", () => {
  it("returns the row's real history untouched when present", () => {
    const history = [
      { timestamp: 1, oldValue: "Red", newValue: "Rojo" },
      { timestamp: 2, oldValue: "Rojo", newValue: "Rojo oscuro" },
    ];
    expect(historyOf(edit({ history }))).toBe(history);
  });

  it("synthesizes exactly ONE entry from top-level fields for a pre-v4 row with no history — the latest transition only, not a fabricated trail", () => {
    const preV4 = edit({ oldValue: "Red", newValue: "Rojo oscuro", timestamp: 5, history: undefined });
    expect(historyOf(preV4)).toEqual([{ timestamp: 5, oldValue: "Red", newValue: "Rojo oscuro" }]);
  });

  it("treats an empty history array the same as missing (defensive)", () => {
    expect(historyOf(edit({ oldValue: "Red", newValue: "Rojo", timestamp: 5, history: [] }))).toEqual([
      { timestamp: 5, oldValue: "Red", newValue: "Rojo" },
    ]);
  });
});

describe("buildWorkspaceExport / parseWorkspaceExport — the Workspace v4 portable envelope (DECISIONS.md #68)", () => {
  it("round-trips items + reviewed through the v4 envelope", () => {
    const items = [edit({}), pin({})];
    const reviewed = { "FieldLabel Account.Status__c": 123 };
    const built = buildWorkspaceExport(items, reviewed);
    expect(built.formatVersion).toBe(1);
    const parsed = parseWorkspaceExport(JSON.parse(JSON.stringify(built)));
    expect(parsed).toEqual({ items, reviewed });
  });

  it("accepts a bare WorkspaceItem[] for back-compat with the pre-v4 'Export JSON' output", () => {
    const parsed = parseWorkspaceExport([edit({})]);
    expect(parsed).toEqual({ items: [edit({})], reviewed: {} });
  });

  it("drops malformed rows inside an otherwise-valid envelope instead of guessing", () => {
    const parsed = parseWorkspaceExport({ items: [edit({}), { bogus: true }], reviewed: { valid: 1, invalid: "x" } });
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.reviewed).toEqual({ valid: 1 });
  });

  it("returns null for anything that isn't a recognizable Workspace export", () => {
    expect(parseWorkspaceExport({ not: "a workspace" })).toBeNull();
    expect(parseWorkspaceExport("just a string")).toBeNull();
    expect(parseWorkspaceExport(null)).toBeNull();
    expect(parseWorkspaceExport(42)).toBeNull();
  });
});

describe("mergeWorkspaceExport", () => {
  it("unions items present on only one side", () => {
    const current = { items: [edit({ apiName: "A" })], reviewed: {} };
    const incoming = { items: [edit({ apiName: "B" })], reviewed: {} };
    expect(mergeWorkspaceExport(current, incoming).items).toHaveLength(2);
  });

  it("on a same-key conflict, the newer timestamp wins", () => {
    const current = { items: [edit({ newValue: "Old capture", timestamp: 1 })], reviewed: {} };
    const incoming = { items: [edit({ newValue: "Newer capture", timestamp: 2 })], reviewed: {} };
    const merged = mergeWorkspaceExport(current, incoming);
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]).toMatchObject({ newValue: "Newer capture" });
  });

  it("an older incoming row loses to the current one", () => {
    const current = { items: [edit({ newValue: "Current wins", timestamp: 5 })], reviewed: {} };
    const incoming = { items: [edit({ newValue: "Stale", timestamp: 1 })], reviewed: {} };
    expect(mergeWorkspaceExport(current, incoming).items[0]).toMatchObject({ newValue: "Current wins" });
  });

  it("reviewed marks merge by keeping the LATER reviewedAt per key", () => {
    const current = { items: [], reviewed: { "CustomLabel X": 10 } };
    const incoming = { items: [], reviewed: { "CustomLabel X": 5, "CustomLabel Y": 20 } };
    expect(mergeWorkspaceExport(current, incoming).reviewed).toEqual({ "CustomLabel X": 10, "CustomLabel Y": 20 });
  });
});

describe("workspaceOverviewCounts — the popup's at-a-glance summary (DECISIONS.md #68)", () => {
  it("counts distinct elements, not raw items", () => {
    const items = [
      edit({ type: "FieldLabel", apiName: "Account.A__c", language: "es" }),
      edit({ type: "FieldLabel", apiName: "Account.A__c", language: "fr" }),
      pin({ type: "ObjectLabel", apiName: "Invoice__c" }),
    ];
    expect(workspaceOverviewCounts(items, {}, new Map()).elementCount).toBe(2);
  });

  it("needsReview counts every element not freshly reviewed; changed counts drifted elements", () => {
    const entry: LabelEntry = { apiName: "Account.Status__c", type: "FieldLabel", valuesByLang: { es: "Estado actual" } };
    const items = [
      edit({ type: "FieldLabel", apiName: "Account.Status__c", language: "es", newValue: "Estado", timestamp: 100 }),
      pin({ type: "ObjectLabel", apiName: "Invoice__c", timestamp: 50 }),
    ];
    const reviewed = { "ObjectLabel Invoice__c": 60 };
    const entriesByKey = new Map([["FieldLabel Account.Status__c", entry]]);
    const counts = workspaceOverviewCounts(items, reviewed, entriesByKey);
    expect(counts.elementCount).toBe(2);
    expect(counts.changedCount).toBe(1); // Account.Status__c drifted
    expect(counts.needsReviewCount).toBe(1); // only the drifted one — Invoice__c is reviewed and fresh
  });
});
