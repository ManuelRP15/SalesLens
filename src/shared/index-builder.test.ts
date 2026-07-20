import { describe, expect, it } from "vitest";
import { buildReverseIndex, resolveText } from "./index-builder";
import type { LabelEntry } from "./types";

const ENTRIES: LabelEntry[] = [
  {
    apiName: "Parking_Space_Title",
    type: "CustomLabel",
    valuesByLang: { es: "Plaza", en_US: "Parking Space" },
  },
  {
    apiName: "Account.Name",
    type: "FieldLabel",
    valuesByLang: { es: "Nombre", en_US: "Name" },
  },
  {
    apiName: "Contact.Name",
    type: "FieldLabel",
    // Deliberate collision: same "Nombre" value as Account.Name in Spanish
    valuesByLang: { es: "Nombre", en_US: "Name" },
  },
];

describe("buildReverseIndex", () => {
  it("indexes every value of every language", () => {
    const index = buildReverseIndex(ENTRIES);
    expect(index.get("Plaza")).toHaveLength(1);
    expect(index.get("Parking Space")).toHaveLength(1);
  });

  it("groups distinct entries that share the same translated value", () => {
    const index = buildReverseIndex(ENTRIES);
    expect(index.get("Nombre")).toHaveLength(2);
  });
});

describe("resolveText", () => {
  it("returns high confidence when there is a single match", () => {
    const index = buildReverseIndex(ENTRIES);
    const result = resolveText(index, "Plaza", {});
    expect(result.highConfidence).toBe(true);
    expect(result.candidates[0].apiName).toBe("Parking_Space_Title");
  });

  it("tolerates extra spaces and line breaks in the detected text", () => {
    const index = buildReverseIndex(ENTRIES);
    const result = resolveText(index, "  Parking   Space \n", {});
    expect(result.highConfidence).toBe(true);
  });

  it("commits to a single best-guess candidate (never a list) when there isn't enough signal to fully disambiguate", () => {
    const index = buildReverseIndex(ENTRIES);
    const result = resolveText(index, "Nombre", {});
    expect(result.highConfidence).toBe(false);
    expect(result.candidates).toHaveLength(1);
  });

  it("disambiguates using the DOM's targetSelectionName", () => {
    const index = buildReverseIndex(ENTRIES);
    const result = resolveText(index, "Nombre", {
      targetSelectionName: "sfdc:RecordField.Contact.Name",
    });
    expect(result.highConfidence).toBe(true);
    expect(result.candidates[0].apiName).toBe("Contact.Name");
  });

  it("returns an empty list and low confidence when there is no match at all", () => {
    const index = buildReverseIndex(ENTRIES);
    const result = resolveText(index, "Text with no associated metadata", {});
    expect(result.highConfidence).toBe(false);
    expect(result.candidates).toHaveLength(0);
  });

  it("disambiguates when targetSelectionName is shorter than the candidate's apiName (bare field name, no object prefix)", () => {
    const entries: LabelEntry[] = [
      { apiName: "DA_Account", type: "CustomLabel", valuesByLang: { en_US: "Account" } },
      { apiName: "Account.MasterRecordId", type: "FieldLabel", valuesByLang: { en_US: "Account" } },
      { apiName: "Account", type: "ObjectLabel", valuesByLang: { en_US: "Account" } },
    ];
    const index = buildReverseIndex(entries);
    // Previously only `target.endsWith(apiName)` was checked, which silently failed
    // whenever the DOM hint was shorter than the candidate's full "Object.Field" apiName.
    const result = resolveText(index, "Account", { targetSelectionName: "MasterRecordId" });
    expect(result.highConfidence).toBe(true);
    expect(result.candidates[0].apiName).toBe("Account.MasterRecordId");
  });

  it("prefers the Custom Label when the DOM shows NO field container evidence, even if a same-text field belongs to the current page's object (the 'Account'/'Test' real-org bug)", () => {
    const entries: LabelEntry[] = [
      { apiName: "DA_Account", type: "CustomLabel", valuesByLang: { en_US: "Account" } },
      { apiName: "Account.MasterRecordId", type: "FieldLabel", valuesByLang: { en_US: "Account" } },
      { apiName: "Account", type: "ObjectLabel", valuesByLang: { en_US: "Account" } },
    ];
    const index = buildReverseIndex(entries);
    // fieldContext absent → the page-object boost for FieldLabel must NOT fire;
    // TYPE_PRIORITY (CustomLabel first) decides the single best guess.
    const result = resolveText(index, "Account", { pageObjectApiName: "Account" });
    expect(result.highConfidence).toBe(false);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].apiName).toBe("DA_Account");
    expect(result.candidates[0].type).toBe("CustomLabel");
  });

  it("narrows to the FieldLabel with high confidence when the element sits on the label side of a field container", () => {
    const entries: LabelEntry[] = [
      { apiName: "DA_Account", type: "CustomLabel", valuesByLang: { en_US: "Account" } },
      { apiName: "Account.MasterRecordId", type: "FieldLabel", valuesByLang: { en_US: "Account" } },
    ];
    const index = buildReverseIndex(entries);
    const result = resolveText(index, "Account", { fieldContext: "label", pageObjectApiName: "Account" });
    expect(result.highConfidence).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].apiName).toBe("Account.MasterRecordId");
  });

  it("uses the page's object to pick between same-label fields on different objects once field context is established", () => {
    const index = buildReverseIndex(ENTRIES);
    // "Nombre" collides across Account.Name and Contact.Name; field context is
    // real, so the page-object boost applies and picks the current page's field.
    const result = resolveText(index, "Nombre", { fieldContext: "label", pageObjectApiName: "Contact" });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].apiName).toBe("Contact.Name");
    expect(result.highConfidence).toBe(false);
  });

  it("narrows to the PicklistValue when the element sits on the value side of a field container", () => {
    const entries: LabelEntry[] = [
      { apiName: "Hot_Label", type: "CustomLabel", valuesByLang: { en_US: "Hot" } },
      { apiName: "Account.Rating#Hot", type: "PicklistValue", valuesByLang: { en_US: "Hot" } },
    ];
    const index = buildReverseIndex(entries);
    const result = resolveText(index, "Hot", { fieldContext: "value" });
    expect(result.highConfidence).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].type).toBe("PicklistValue");
  });

  it("recognizes <records-entity-label> as the object's own label and narrows straight to it, even when the text collides with a real Custom Label", () => {
    const entries: LabelEntry[] = [
      { apiName: "DA_Account", type: "CustomLabel", valuesByLang: { en_US: "Account" } },
      { apiName: "Account", type: "ObjectLabel", valuesByLang: { en_US: "Account" } },
    ];
    const index = buildReverseIndex(entries);
    const result = resolveText(index, "Account", { elementTagName: "RECORDS-ENTITY-LABEL" });
    expect(result.highConfidence).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].apiName).toBe("Account");
    expect(result.candidates[0].type).toBe("ObjectLabel");
  });

  it("stays silent on a button surface when no button-type metadata matches (standard Salesforce buttons are not extractable)", () => {
    const entries: LabelEntry[] = [
      { apiName: "Edit_Label", type: "CustomLabel", valuesByLang: { en_US: "Edit" } },
      { apiName: "Account.Edit_Status__c", type: "FieldLabel", valuesByLang: { en_US: "Edit" } },
    ];
    const index = buildReverseIndex(entries);
    const result = resolveText(index, "Edit", { surfaceContext: "button" });
    expect(result.candidates).toHaveLength(0);
  });

  it("resolves a custom button's label on a button surface", () => {
    const entries: LabelEntry[] = [
      { apiName: "Check_Credit_Label", type: "CustomLabel", valuesByLang: { en_US: "Check Credit" } },
      { apiName: "Account.Check_Credit", type: "WebLink", valuesByLang: { en_US: "Check Credit", es: "Comprobar crédito" } },
    ];
    const index = buildReverseIndex(entries);
    const result = resolveText(index, "Check Credit", { surfaceContext: "button" });
    expect(result.highConfidence).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].type).toBe("WebLink");
  });

  it("stays silent on the value side when only non-value metadata collides (plain record data must never resolve)", () => {
    const entries: LabelEntry[] = [
      { apiName: "Greeting_Label", type: "CustomLabel", valuesByLang: { en_US: "Hello" } },
    ];
    const index = buildReverseIndex(entries);
    // A text field whose stored DATA happens to read "Hello" — same string as a
    // Custom Label. The value side only ever legitimately renders PicklistValue/
    // RecordType metadata, so this must suppress, not resolve to the label.
    const result = resolveText(index, "Hello", { fieldContext: "value" });
    expect(result.candidates).toHaveLength(0);
  });

  it("resolves a STANDARD button label on a button surface (describeLayout-seeded StandardButton entries)", () => {
    const entries: LabelEntry[] = [
      { apiName: "Edit_Label", type: "CustomLabel", valuesByLang: { en_US: "Edit" } },
      { apiName: "Account.Edit", type: "StandardButton", valuesByLang: { en_US: "Edit", es: "Modificar" } },
    ];
    const index = buildReverseIndex(entries);
    const result = resolveText(index, "Edit", { surfaceContext: "button" });
    expect(result.highConfidence).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].type).toBe("StandardButton");
  });

  it("resolves a related list title to RelatedList/ObjectLabel on a related list surface, never a colliding Custom Label", () => {
    const entries: LabelEntry[] = [
      { apiName: "Contacts_Label", type: "CustomLabel", valuesByLang: { en_US: "Contacts" } },
      { apiName: "Account.Contacts", type: "RelatedList", valuesByLang: { en_US: "Contacts", es: "Contactos" } },
    ];
    const index = buildReverseIndex(entries);
    const result = resolveText(index, "Contacts", { surfaceContext: "relatedList" });
    expect(result.highConfidence).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].type).toBe("RelatedList");
  });

  it("keeps CustomLabel-first on free text even when a colliding FieldLabel carries more languages (the second 'Account' regression)", () => {
    const entries: LabelEntry[] = [
      { apiName: "DA_Account", type: "CustomLabel", valuesByLang: { en_US: "Account", nl_NL: "Klanten" } },
      {
        apiName: "Account.MasterRecordId",
        type: "FieldLabel",
        valuesByLang: { en_US: "Account", es: "Cuenta", fr: "Compte", nl_NL: "Account", de: "Account" },
      },
    ];
    const index = buildReverseIndex(entries);
    // No surface, no field context → free text → the "more languages" tie-break
    // must NOT outrank TYPE_PRIORITY (it only picks among same-ranked types).
    const result = resolveText(index, "Account", { pageObjectApiName: "Account" });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].type).toBe("CustomLabel");
  });

  it("resolves a standard record-page tab (Details) to the platform catalog's StandardTab on an inner tab surface", () => {
    const entries: LabelEntry[] = [
      { apiName: "Details_Label", type: "CustomLabel", valuesByLang: { en_US: "Details" } },
      { apiName: "Platform.Details", type: "StandardTab", valuesByLang: { en_US: "Details", es: "Detalles", fr: "Détails" } },
    ];
    const index = buildReverseIndex(entries);
    const result = resolveText(index, "Details", { surfaceContext: "innerTab" });
    expect(result.candidates).toHaveLength(1);
    // Both CustomLabel and StandardTab are allowed on innerTab; the informative
    // tie-break (more languages) picks the catalog entry.
    expect(result.candidates[0].type).toBe("StandardTab");
  });

  it("resolves a collapsible layout section heading to LayoutSection even though it renders inside a button", () => {
    const entries: LabelEntry[] = [
      { apiName: "Information_Label", type: "CustomLabel", valuesByLang: { en_US: "Information" } },
      { apiName: "Account.Information", type: "LayoutSection", valuesByLang: { en_US: "Information", es: "Información" } },
    ];
    const index = buildReverseIndex(entries);
    // The section surface must be detected BEFORE the button rule — section
    // headings live inside slds-section__title-action buttons, and the button
    // surface (WebLink/QuickAction only) would otherwise suppress them.
    const result = resolveText(index, "Information", { surfaceContext: "section" });
    expect(result.highConfidence).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].type).toBe("LayoutSection");
  });

  it("resolves a nav bar item to the tab/object metadata, never to a colliding Custom Label", () => {
    const entries: LabelEntry[] = [
      { apiName: "Accounts_Label", type: "CustomLabel", valuesByLang: { en_US: "Accounts" } },
      { apiName: "Account (plural)", type: "ObjectLabel", valuesByLang: { en_US: "Accounts" } },
    ];
    const index = buildReverseIndex(entries);
    const result = resolveText(index, "Accounts", { surfaceContext: "navTab" });
    expect(result.highConfidence).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].type).toBe("ObjectLabel");
  });
});
