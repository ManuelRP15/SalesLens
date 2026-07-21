import { describe, expect, it } from "vitest";
import { filterAuditEntries, listScrollDelta, type AuditFilter } from "./AuditPanel";
import type { AuditEntry } from "./translation-mode";
import type { LabelEntry, LabelType } from "../shared/types";

function entry(
  apiName: string,
  type: LabelType,
  status: AuditEntry["status"],
  valuesByLang: Record<string, string> = {}
): AuditEntry {
  const labelEntry: LabelEntry = { apiName, type, valuesByLang };
  return {
    key: `${apiName}::${type}`,
    entry: labelEntry,
    element: null as unknown as Element,
    missingLanguages: status === "missing" ? ["es"] : [],
    identicalLanguages: status === "identical" ? ["fr"] : [],
    editable: true,
    status,
  };
}

const ENTRIES: AuditEntry[] = [
  entry("Account.Name", "FieldLabel", "complete", { en_US: "Account Name", es: "Nombre" }),
  entry("Account.Industry__c", "FieldLabel", "missing", { en_US: "Industry" }),
  entry("Account.Annual_Revenue__c", "FieldLabel", "identical", { en_US: "Annual Revenue", fr: "Annual Revenue" }),
  entry("Welcome_Message", "CustomLabel", "missing", { en_US: "Welcome" }),
  entry("Contact.Level__c#Hot", "PicklistValue", "complete", { en_US: "Hot", es: "Caliente" }),
];

/** The three filter axes are independent and must AND together — the property that makes "search Account, then click Missing" behave the way a user expects. */
describe("filterAuditEntries", () => {
  it("returns everything with no filters at all", () => {
    expect(filterAuditEntries(ENTRIES, "all", "")).toHaveLength(5);
  });

  it("filters by status", () => {
    expect(filterAuditEntries(ENTRIES, "missing", "").map((e) => e.entry.apiName)).toEqual([
      "Account.Industry__c",
      "Welcome_Message",
    ]);
  });

  it("searches the full API name, including the object prefix", () => {
    expect(filterAuditEntries(ENTRIES, "all", "account")).toHaveLength(3);
  });

  it("searches the DISPLAY name, which drops that prefix", () => {
    // "Industry" only appears in the display form and the value — never as a
    // standalone token of the raw apiName.
    expect(filterAuditEntries(ENTRIES, "all", "industry").map((e) => e.entry.apiName)).toEqual([
      "Account.Industry__c",
    ]);
  });

  it("searches translated values, not just identifiers", () => {
    expect(filterAuditEntries(ENTRIES, "all", "caliente").map((e) => e.entry.apiName)).toEqual([
      "Contact.Level__c#Hot",
    ]);
  });

  it("is case-insensitive and ignores surrounding whitespace", () => {
    expect(filterAuditEntries(ENTRIES, "all", "  WELCOME  ")).toHaveLength(1);
  });

  it("treats an empty type list as no restriction, never as 'match nothing'", () => {
    expect(filterAuditEntries(ENTRIES, "all", "", [])).toHaveLength(5);
  });

  it("filters by metadata type, keeping Field and Custom Field mutually exclusive", () => {
    expect(filterAuditEntries(ENTRIES, "all", "", ["Field"]).map((e) => e.entry.apiName)).toEqual([
      "Account.Name",
    ]);
    expect(filterAuditEntries(ENTRIES, "all", "", ["Custom Field"]).map((e) => e.entry.apiName)).toEqual([
      "Account.Industry__c",
      "Account.Annual_Revenue__c",
    ]);
  });

  it("unions multiple selected types", () => {
    expect(filterAuditEntries(ENTRIES, "all", "", ["Field", "Custom Label"])).toHaveLength(2);
  });

  it("ANDs all three axes together", () => {
    expect(
      filterAuditEntries(ENTRIES, "missing", "account", ["Custom Field"]).map((e) => e.entry.apiName)
    ).toEqual(["Account.Industry__c"]);
    // Same search and type, different status tab -> empty, not a fallback to a wider set.
    expect(filterAuditEntries(ENTRIES, "complete", "account", ["Custom Field"])).toEqual([]);
  });
});

function rect(top: number, bottom: number): DOMRect {
  return { top, bottom, height: bottom - top } as DOMRect;
}

/**
 * The panel's internal list follows navigation (DECISIONS.md #62/#63). The animation
 * itself is a three-line `scrollTo`; this pins the decision, including the "already
 * visible -> do nothing" case that keeps short lists from animating pointlessly.
 */
describe("listScrollDelta", () => {
  const list = rect(100, 300);

  it("does not scroll a row that is already comfortably visible", () => {
    expect(listScrollDelta(list, rect(150, 170))).toBe(0);
  });

  it("scrolls up for a row above the top edge", () => {
    expect(listScrollDelta(list, rect(60, 80))).toBe(-48);
  });

  it("scrolls down for a row below the bottom edge", () => {
    expect(listScrollDelta(list, rect(320, 340))).toBe(48);
  });

  it("keeps padding at the edges rather than aligning flush", () => {
    // Exactly flush with the top edge still nudges by the padding.
    expect(listScrollDelta(list, rect(100, 120))).toBe(-8);
    expect(listScrollDelta(list, rect(280, 300))).toBe(8);
  });
});
