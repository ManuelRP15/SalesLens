import { describe, expect, it } from "vitest";
import { computeDuplicateClusters } from "./duplicate-detection";
import type { LabelEntry, LabelType } from "./types";

function entry(apiName: string, type: LabelType, valuesByLang: Record<string, string>): LabelEntry {
  return { apiName, type, valuesByLang };
}

describe("computeDuplicateClusters", () => {
  it("flags a value shared by two different elements in a translation language", () => {
    const report = computeDuplicateClusters(
      [
        entry("Account.Type", "PicklistValue", { en_US: "Type", es: "Tipo" }),
        entry("Contact.Kind__c", "FieldLabel", { en_US: "Kind", es: "Tipo" }),
      ],
      ["es"],
      false,
    );
    expect(report.es).toHaveLength(1);
    expect(report.es[0].value).toBe("Tipo");
    expect(report.es[0].members.map((m) => m.apiName).sort()).toEqual(["Account.Type", "Contact.Kind__c"]);
  });

  it("does not flag a value used only once (singletons are not duplicates)", () => {
    const report = computeDuplicateClusters(
      [
        entry("A", "CustomLabel", { es: "Uno" }),
        entry("B", "CustomLabel", { es: "Dos" }),
      ],
      ["es"],
      false,
    );
    expect(report.es).toBeUndefined();
    expect(Object.keys(report)).toHaveLength(0);
  });

  it("groups three sharing elements into a single 3-member cluster", () => {
    const report = computeDuplicateClusters(
      [
        entry("A", "CustomLabel", { es: "Guardar" }),
        entry("B", "CustomLabel", { es: "Guardar" }),
        entry("C", "CustomLabel", { es: "Guardar" }),
      ],
      ["es"],
      false,
    );
    expect(report.es).toHaveLength(1);
    expect(report.es[0].members).toHaveLength(3);
  });

  it("excludes the base language — same base value on two elements is normal, not a defect", () => {
    const report = computeDuplicateClusters(
      [
        entry("Account.Name", "FieldLabel", { en_US: "Name" }),
        entry("Contact.Name", "FieldLabel", { en_US: "Name" }),
      ],
      ["en_US", "es"],
      false,
    );
    expect(report.en_US).toBeUndefined();
    expect(Object.keys(report)).toHaveLength(0);
  });

  it("computes clusters per language independently", () => {
    const report = computeDuplicateClusters(
      [
        entry("A", "CustomLabel", { es: "Igual", fr: "Un" }),
        entry("B", "CustomLabel", { es: "Igual", fr: "Deux" }),
      ],
      ["es", "fr"],
      false,
    );
    expect(report.es).toHaveLength(1); // shared in Spanish
    expect(report.fr).toBeUndefined(); // distinct in French
  });

  it("ignores empty and missing values", () => {
    const report = computeDuplicateClusters(
      [
        entry("A", "CustomLabel", { es: "" }),
        entry("B", "CustomLabel", { es: "" }),
        entry("C", "CustomLabel", { en_US: "Only base" }),
      ],
      ["es"],
      false,
    );
    expect(Object.keys(report)).toHaveLength(0);
  });

  it("normalizes surrounding/collapsed whitespace before comparing", () => {
    const report = computeDuplicateClusters(
      [
        entry("A", "CustomLabel", { es: "Cuenta" }),
        entry("B", "CustomLabel", { es: "  Cuenta " }),
        entry("C", "CustomLabel", { es: "Cuenta\tcorriente" }),
        entry("D", "CustomLabel", { es: "Cuenta corriente" }),
      ],
      ["es"],
      false,
    );
    expect(report.es).toHaveLength(2);
    const byValue = Object.fromEntries(report.es.map((c) => [c.value, c.members.length]));
    expect(byValue["Cuenta"]).toBe(2);
    expect(byValue["Cuenta corriente"]).toBe(2);
  });

  it("is case-sensitive — different casing is not treated as duplicate (bias to under-claim)", () => {
    const report = computeDuplicateClusters(
      [
        entry("A", "CustomLabel", { es: "Cuenta" }),
        entry("B", "CustomLabel", { es: "cuenta" }),
      ],
      ["es"],
      false,
    );
    expect(Object.keys(report)).toHaveLength(0);
  });

  it("Simple Mode drops out-of-scope types, dissolving clusters that depended on them", () => {
    const entries = [
      entry("Account.Foo__c", "FieldLabel", { es: "Compartido" }), // in scope
      entry("Some.Button", "WebLink", { es: "Compartido" }), // out of scope in Simple Mode
    ];
    // Advanced mode: both counted -> a cluster.
    expect(computeDuplicateClusters(entries, ["es"], false).es).toHaveLength(1);
    // Simple mode: only the FieldLabel survives -> no cluster.
    expect(computeDuplicateClusters(entries, ["es"], true).es).toBeUndefined();
  });

  it("Simple Mode still clusters two in-scope elements", () => {
    const report = computeDuplicateClusters(
      [
        entry("Account.Foo__c", "FieldLabel", { es: "Compartido" }),
        entry("Contact.Bar__c", "FieldLabel", { es: "Compartido" }),
        entry("Some.Button", "WebLink", { es: "Compartido" }),
      ],
      ["es"],
      true,
    );
    expect(report.es).toHaveLength(1);
    expect(report.es[0].members).toHaveLength(2); // the WebLink is excluded, the two fields remain
  });

  it("treats apiName+type as identity — a coincidental apiName collision across types is not a self-duplicate", () => {
    // Same apiName, different type, same value: two genuinely different elements -> a real cluster of 2.
    const report = computeDuplicateClusters(
      [
        entry("Account.Type", "FieldLabel", { es: "Tipo" }),
        entry("Account.Type", "PicklistValue", { es: "Tipo" }),
      ],
      ["es"],
      false,
    );
    expect(report.es).toHaveLength(1);
    expect(report.es[0].members).toHaveLength(2);
  });

  it("de-duplicates a repeated identity so it cannot cluster with itself", () => {
    const report = computeDuplicateClusters(
      [
        entry("A", "CustomLabel", { es: "Solo" }),
        entry("A", "CustomLabel", { es: "Solo" }), // same identity appearing twice
      ],
      ["es"],
      false,
    );
    expect(Object.keys(report)).toHaveLength(0);
  });

  it("orders by member count descending — count wins even when the bigger cluster sorts alphabetically later", () => {
    const report = computeDuplicateClusters(
      [
        entry("A", "CustomLabel", { es: "Zebra" }),
        entry("B", "CustomLabel", { es: "Zebra" }),
        entry("C", "CustomLabel", { es: "Zebra" }),
        entry("D", "CustomLabel", { es: "Alpha" }),
        entry("E", "CustomLabel", { es: "Alpha" }),
      ],
      ["es"],
      false,
    );
    // Zebra has 3 members vs Alpha's 2 — count is the primary key, so Zebra leads despite "Z" > "A".
    expect(report.es.map((c) => c.value)).toEqual(["Zebra", "Alpha"]);
  });

  it("breaks equal-count ties alphabetically by value", () => {
    const report = computeDuplicateClusters(
      [
        entry("A", "CustomLabel", { es: "Beta" }),
        entry("B", "CustomLabel", { es: "Beta" }),
        entry("C", "CustomLabel", { es: "Alpha" }),
        entry("D", "CustomLabel", { es: "Alpha" }),
      ],
      ["es"],
      false,
    );
    // Both clusters have 2 members — the alphabetical tie-break puts Alpha before Beta.
    expect(report.es.map((c) => c.value)).toEqual(["Alpha", "Beta"]);
  });

  it("returns an empty report when there are no duplicates anywhere", () => {
    const report = computeDuplicateClusters(
      [entry("A", "CustomLabel", { es: "X", fr: "Y" })],
      ["es", "fr"],
      false,
    );
    expect(report).toEqual({});
  });
});
