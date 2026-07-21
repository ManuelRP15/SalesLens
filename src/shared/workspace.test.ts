import { describe, expect, it } from "vitest";
import type { LabelEntry, WorkspaceEdit, WorkspacePin } from "./types";
import {
  assessDrift,
  buildPackageXml,
  normalizeStoredWorkspace,
  packageMembersForItem,
  pinnedKeys,
  recordEdit,
  summarizeWorkspace,
  togglePin,
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

  it("treats another language of the same element as a separate row", () => {
    expect(recordEdit([edit({ language: "es" })], edit({ language: "fr" }))).toHaveLength(2);
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
