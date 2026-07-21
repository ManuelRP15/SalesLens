import { describe, expect, it } from "vitest";
import type { WorkspaceEdit } from "./types";
import {
  buildPackageXml,
  packageMembersForEdit,
  recordEdit,
  summarizeWorkspace,
} from "./workspace";

function edit(partial: Partial<WorkspaceEdit>): WorkspaceEdit {
  return {
    type: "CustomLabel",
    apiName: "Welcome_Message",
    language: "es",
    oldValue: "Bienvenido",
    newValue: "Bienvenido de nuevo",
    timestamp: 1000,
    ...partial,
  };
}

describe("recordEdit — the fold rule", () => {
  it("appends a brand-new key", () => {
    const result = recordEdit([], edit({}));
    expect(result).toHaveLength(1);
  });

  it("updates newValue/timestamp of an existing key but keeps the FIRST oldValue", () => {
    const first = edit({ oldValue: "Original", newValue: "Second", timestamp: 1 });
    const result = recordEdit([first], edit({ oldValue: "Second", newValue: "Third", timestamp: 2 }));
    expect(result).toHaveLength(1);
    expect(result[0].oldValue).toBe("Original");
    expect(result[0].newValue).toBe("Third");
    expect(result[0].timestamp).toBe(2);
  });

  it("treats another language of the same element as a separate row", () => {
    const result = recordEdit([edit({ language: "es" })], edit({ language: "fr" }));
    expect(result).toHaveLength(2);
  });

  it("keeps a row the user edited back to its original value (touched, not vanished)", () => {
    const first = edit({ oldValue: "Original", newValue: "Changed", timestamp: 1 });
    const result = recordEdit([first], edit({ oldValue: "Changed", newValue: "Original", timestamp: 2 }));
    expect(result).toHaveLength(1);
    expect(result[0].oldValue).toBe("Original");
    expect(result[0].newValue).toBe("Original");
  });
});

describe("packageMembersForEdit — mirrors the write path's dependency sets", () => {
  it("CustomLabel → the label + the language's Translations file", () => {
    expect(packageMembersForEdit(edit({ type: "CustomLabel", apiName: "Welcome_Message", language: "es" }))).toEqual([
      { type: "CustomLabel", member: "Welcome_Message" },
      { type: "Translations", member: "es" },
    ]);
  });

  it("FieldLabel → CustomObjectTranslation + CustomObject + CustomField (lesson #15/#16 unlock)", () => {
    expect(packageMembersForEdit(edit({ type: "FieldLabel", apiName: "Account.Invoice_Color__c", language: "fr" }))).toEqual([
      { type: "CustomObjectTranslation", member: "Account-fr" },
      { type: "CustomObject", member: "Account" },
      { type: "CustomField", member: "Account.Invoice_Color__c" },
    ]);
  });

  it("object-scoped PicklistValue → same set as its field", () => {
    expect(
      packageMembersForEdit(edit({ type: "PicklistValue", apiName: "Account.Status__c#Active", language: "es" }))
    ).toEqual([
      { type: "CustomObjectTranslation", member: "Account-es" },
      { type: "CustomObject", member: "Account" },
      { type: "CustomField", member: "Account.Status__c" },
    ]);
  });

  it("global-value-set PicklistValue → GlobalValueSetTranslation + the set (no object unlock)", () => {
    expect(packageMembersForEdit(edit({ type: "PicklistValue", apiName: "Regions#EMEA", language: "es" }))).toEqual([
      { type: "GlobalValueSetTranslation", member: "Regions-es" },
      { type: "GlobalValueSet", member: "Regions" },
    ]);
  });

  it("RecordType / WebLink / QuickAction each add themselves on top of the object pair", () => {
    for (const type of ["RecordType", "WebLink", "QuickAction"] as const) {
      expect(packageMembersForEdit(edit({ type, apiName: "Account.Special", language: "nl_NL" }))).toEqual([
        { type: "CustomObjectTranslation", member: "Account-nl_NL" },
        { type: "CustomObject", member: "Account" },
        { type: type, member: "Account.Special" },
      ]);
    }
  });

  it("LayoutSection → object pair only (Layout members are live-only, see metadata-write.ts)", () => {
    expect(packageMembersForEdit(edit({ type: "LayoutSection", apiName: "Account.Extra Info", language: "es" }))).toEqual([
      { type: "CustomObjectTranslation", member: "Account-es" },
      { type: "CustomObject", member: "Account" },
    ]);
  });

  it("CustomTab / CustomApplication → the language's Translations file + themselves", () => {
    expect(packageMembersForEdit(edit({ type: "CustomTab", apiName: "My_Tab", language: "fr" }))).toEqual([
      { type: "Translations", member: "fr" },
      { type: "CustomTab", member: "My_Tab" },
    ]);
    expect(packageMembersForEdit(edit({ type: "CustomApplication", apiName: "My_App", language: "fr" }))).toEqual([
      { type: "Translations", member: "fr" },
      { type: "CustomApplication", member: "My_App" },
    ]);
  });
});

describe("buildPackageXml", () => {
  it("dedupes shared members and sorts types and members alphabetically", () => {
    const xml = buildPackageXml([
      edit({ type: "FieldLabel", apiName: "Account.B__c", language: "es" }),
      edit({ type: "FieldLabel", apiName: "Account.A__c", language: "es" }),
    ]);
    // Two fields on the same object+language share ONE CustomObjectTranslation member.
    expect(xml.match(/Account-es/g)).toHaveLength(1);
    const aIdx = xml.indexOf("Account.A__c");
    const bIdx = xml.indexOf("Account.B__c");
    expect(aIdx).toBeGreaterThan(-1);
    expect(aIdx).toBeLessThan(bIdx);
    // Types sorted: CustomField < CustomObject < CustomObjectTranslation.
    expect(xml.indexOf("<name>CustomField</name>")).toBeLessThan(xml.indexOf("<name>CustomObject</name>"));
    expect(xml.indexOf("<name>CustomObject</name>")).toBeLessThan(xml.indexOf("<name>CustomObjectTranslation</name>"));
  });

  it("uses the extension's own Metadata API version and the standard Package envelope", () => {
    const xml = buildPackageXml([edit({})]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<Package xmlns="http://soap.sforce.com/2006/04/metadata">');
    expect(xml).toContain("<version>61.0</version>");
    expect(xml.endsWith("</Package>\n")).toBe(true);
  });

  it("escapes XML-significant characters in member names", () => {
    const xml = buildPackageXml([edit({ type: "CustomTab", apiName: "Tab_&_<X>", language: "es" })]);
    expect(xml).toContain("<members>Tab_&amp;_&lt;X&gt;</members>");
    expect(xml).not.toContain("<members>Tab_&_<X></members>");
  });

  it("renders an empty (but valid) package for an empty workspace", () => {
    const xml = buildPackageXml([]);
    expect(xml).not.toContain("<types>");
    expect(xml).toContain("<version>");
  });
});

describe("summarizeWorkspace", () => {
  it("counts edits, distinct components, and sorted languages", () => {
    const summary = summarizeWorkspace([
      edit({ type: "FieldLabel", apiName: "Account.A__c", language: "fr" }),
      edit({ type: "FieldLabel", apiName: "Account.B__c", language: "fr" }),
      edit({ type: "CustomLabel", apiName: "Welcome", language: "es" }),
    ]);
    expect(summary.editCount).toBe(3);
    // Account-fr + Account + A__c + B__c + Welcome + Translations:es = 6 distinct.
    expect(summary.componentCount).toBe(6);
    expect(summary.languages).toEqual(["es", "fr"]);
  });
});
