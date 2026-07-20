import { describe, expect, it } from "vitest";
import {
  asArray,
  findZipEntriesBySuffix,
  languageFromTranslationFileName,
  parseGlobalTranslationFile,
  parseGlobalValueSetTranslationFile,
  parseObjectTranslationFile,
  splitObjectTranslationFullName,
} from "./metadata-api";

describe("asArray", () => {
  it("wraps a single value in an array", () => {
    expect(asArray({ a: 1 })).toEqual([{ a: 1 }]);
  });
  it("passes an array through as-is", () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
  });
  it("returns [] for undefined/null", () => {
    expect(asArray(undefined)).toEqual([]);
    expect(asArray(null)).toEqual([]);
  });
});

describe("splitObjectTranslationFullName", () => {
  it("splits a simple object and language", () => {
    expect(splitObjectTranslationFullName("Account-es")).toEqual({ objectApiName: "Account", language: "es" });
  });
  it("supports languages with an underscore (pt_BR) without breaking on the object's hyphen", () => {
    expect(splitObjectTranslationFullName("MyObject__c-pt_BR")).toEqual({
      objectApiName: "MyObject__c",
      language: "pt_BR",
    });
  });
  it("returns null when there is no hyphen", () => {
    expect(splitObjectTranslationFullName("NoHyphen")).toBeNull();
  });
});

describe("languageFromTranslationFileName", () => {
  it("extracts the language from a file name with a folder", () => {
    expect(languageFromTranslationFileName("unpackaged/translations/es.translation")).toBe("es");
  });
  it("extracts the language without a folder", () => {
    expect(languageFromTranslationFileName("fr.translation")).toBe("fr");
  });
});

describe("findZipEntriesBySuffix", () => {
  it("finds entries by suffix without assuming the root folder", () => {
    const zip = {
      "unpackaged/objectTranslations/Account-es.objectTranslation": new Uint8Array(),
      "unpackaged/translations/es.translation": new Uint8Array(),
    };
    expect(findZipEntriesBySuffix(zip, "Account-es.objectTranslation")).toEqual([
      "unpackaged/objectTranslations/Account-es.objectTranslation",
    ]);
  });
  it("returns [] when there is no match", () => {
    expect(findZipEntriesBySuffix({}, "Nope.objectTranslation")).toEqual([]);
  });
});

describe("parseObjectTranslationFile", () => {
  it("parses several fields/recordTypes/picklistValues", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomObjectTranslation xmlns="http://soap.sforce.com/2006/04/metadata">
  <caseValues><plural>false</plural><caseType>Nominative</caseType><value>Cuenta</value></caseValues>
  <caseValues><plural>true</plural><caseType>Nominative</caseType><value>Cuentas</value></caseValues>
  <fields>
    <name>Rating</name>
    <label>Clasificación</label>
    <picklistValues><masterLabel>Hot</masterLabel><translation>Caliente</translation></picklistValues>
    <picklistValues><masterLabel>Warm</masterLabel><translation>Templado</translation></picklistValues>
  </fields>
  <fields>
    <name>Industry</name>
    <label>Sector</label>
  </fields>
  <recordTypes><name>Partner</name><label>Socio</label></recordTypes>
  <recordTypes><name>Vendor</name><label>Proveedor</label></recordTypes>
</CustomObjectTranslation>`;

    const result = parseObjectTranslationFile(xml, "Account-es");
    expect(result).not.toBeNull();
    expect(result!.objectApiName).toBe("Account");
    expect(result!.language).toBe("es");
    expect(result!.singularLabel).toBe("Cuenta");
    expect(result!.pluralLabel).toBe("Cuentas");
    expect(result!.fields).toHaveLength(2);
    expect(result!.fields[0]).toEqual({
      name: "Rating",
      label: "Clasificación",
      picklistValues: [
        { masterLabel: "Hot", translation: "Caliente" },
        { masterLabel: "Warm", translation: "Templado" },
      ],
    });
    expect(result!.fields[1].picklistValues).toEqual([]);
    expect(result!.recordTypes).toEqual([
      { name: "Partner", label: "Socio" },
      { name: "Vendor", label: "Proveedor" },
    ]);
  });

  it("does not collapse to an object when there's only one field/recordType/picklistValue (classic XML parser bug)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomObjectTranslation xmlns="http://soap.sforce.com/2006/04/metadata">
  <caseValues><plural>false</plural><caseType>Nominative</caseType><value>Objeto Único</value></caseValues>
  <fields>
    <name>OnlyField__c</name>
    <label>Único Campo</label>
    <picklistValues><masterLabel>Only</masterLabel><translation>Solo</translation></picklistValues>
  </fields>
  <recordTypes><name>OnlyType</name><label>Único Tipo</label></recordTypes>
</CustomObjectTranslation>`;

    const result = parseObjectTranslationFile(xml, "MyObject__c-es");
    expect(result).not.toBeNull();
    expect(result!.singularLabel).toBe("Objeto Único");
    expect(result!.pluralLabel).toBeUndefined();
    expect(result!.fields).toHaveLength(1);
    expect(result!.fields[0].picklistValues).toHaveLength(1);
    expect(result!.recordTypes).toHaveLength(1);
  });

  it("returns null when the fullName has no language", () => {
    expect(parseObjectTranslationFile("<CustomObjectTranslation/>", "NoHyphen")).toBeNull();
  });

  it("falls back to nested caseValues when there's no flat <label> (grammatical-gender languages), treating a missing caseType as nominative", () => {
    // This mirrors the real shape Salesforce returns for languages with grammatical
    // gender (e.g. Dutch, Spanish): no flat <label>, and <caseType> is omitted
    // entirely when the language doesn't use more than one grammatical case.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomObjectTranslation xmlns="http://soap.sforce.com/2006/04/metadata">
  <caseValues><plural>false</plural><value>Klant</value></caseValues>
  <caseValues><plural>true</plural><value>Klanten</value></caseValues>
  <fields>
    <caseValues><plural>false</plural><value>Klantnaam</value></caseValues>
    <caseValues><plural>true</plural><value>Klantnamen</value></caseValues>
    <gender>Neuter</gender>
    <name>account_name</name>
  </fields>
  <recordTypes>
    <caseValues><plural>false</plural><value>Partner Gemeentelijk</value></caseValues>
    <name>Partner</name>
  </recordTypes>
</CustomObjectTranslation>`;

    const result = parseObjectTranslationFile(xml, "Account-nl_NL");
    expect(result).not.toBeNull();
    expect(result!.singularLabel).toBe("Klant");
    expect(result!.pluralLabel).toBe("Klanten");
    expect(result!.fields).toEqual([
      { name: "account_name", label: "Klantnaam", picklistValues: [] },
    ]);
    expect(result!.recordTypes).toEqual([{ name: "Partner", label: "Partner Gemeentelijk" }]);
  });

  it("parses webLinks, quickActions and layout section headings (single and multiple)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomObjectTranslation xmlns="http://soap.sforce.com/2006/04/metadata">
  <layouts>
    <layout>Account Layout</layout>
    <sections><label>Información</label><section>Information</section></sections>
    <sections><label>Dirección</label><section>Address Information</section></sections>
  </layouts>
  <quickActions><label>Nuevo caso rápido</label><name>New_Quick_Case</name></quickActions>
  <webLinks><label>Comprobar crédito</label><name>Check_Credit</name></webLinks>
</CustomObjectTranslation>`;

    const result = parseObjectTranslationFile(xml, "Account-es");
    expect(result).not.toBeNull();
    expect(result!.webLinks).toEqual([{ name: "Check_Credit", label: "Comprobar crédito" }]);
    expect(result!.quickActions).toEqual([{ name: "New_Quick_Case", label: "Nuevo caso rápido" }]);
    expect(result!.layoutSections).toEqual([
      { layout: "Account Layout", section: "Information", label: "Información" },
      { layout: "Account Layout", section: "Address Information", label: "Dirección" },
    ]);
  });

  it("skips non-nominative grammatical cases (e.g. German Genitive/Dative) when caseType is explicitly present", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomObjectTranslation xmlns="http://soap.sforce.com/2006/04/metadata">
  <caseValues><plural>false</plural><caseType>Nominative</caseType><value>Konto</value></caseValues>
  <caseValues><plural>false</plural><caseType>Genitive</caseType><value>Kontos</value></caseValues>
  <caseValues><plural>false</plural><caseType>Dative</caseType><value>Konto</value></caseValues>
</CustomObjectTranslation>`;

    const result = parseObjectTranslationFile(xml, "Account-de");
    expect(result!.singularLabel).toBe("Konto");
  });
});

describe("parseGlobalTranslationFile", () => {
  it("parses customTabs/customApplications with several elements", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Translations xmlns="http://soap.sforce.com/2006/04/metadata">
  <customTabs><name>Parking_Spaces__c</name><label>Plazas de aparcamiento</label></customTabs>
  <customTabs><name>Invoices__c</name><label>Facturas</label></customTabs>
  <customApplications><name>MyApp</name><label>Mi Aplicación</label></customApplications>
</Translations>`;
    const result = parseGlobalTranslationFile(xml, "es");
    expect(result).toEqual({
      language: "es",
      customTabs: [
        { name: "Parking_Spaces__c", label: "Plazas de aparcamiento" },
        { name: "Invoices__c", label: "Facturas" },
      ],
      customApplications: [{ name: "MyApp", label: "Mi Aplicación" }],
    });
  });

  it("does not collapse to an object with a single customTab", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Translations xmlns="http://soap.sforce.com/2006/04/metadata">
  <customTabs><name>OnlyTab__c</name><label>Única Pestaña</label></customTabs>
</Translations>`;
    const result = parseGlobalTranslationFile(xml, "fr");
    expect(result!.customTabs).toHaveLength(1);
    expect(result!.customApplications).toEqual([]);
  });
});

describe("parseGlobalValueSetTranslationFile", () => {
  it("parses valueTranslation with several elements", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GlobalValueSetTranslation xmlns="http://soap.sforce.com/2006/04/metadata">
  <valueTranslation><masterLabel>Hot</masterLabel><translation>Caliente</translation></valueTranslation>
  <valueTranslation><masterLabel>Cold</masterLabel><translation>Frío</translation></valueTranslation>
</GlobalValueSetTranslation>`;
    const result = parseGlobalValueSetTranslationFile(xml, "MyValueSet-es");
    expect(result).toEqual({
      fullName: "MyValueSet-es",
      valueTranslations: [
        { masterLabel: "Hot", translation: "Caliente" },
        { masterLabel: "Cold", translation: "Frío" },
      ],
    });
  });

  it("does not collapse to an object with a single valueTranslation", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GlobalValueSetTranslation xmlns="http://soap.sforce.com/2006/04/metadata">
  <valueTranslation><masterLabel>Only</masterLabel><translation>Solo</translation></valueTranslation>
</GlobalValueSetTranslation>`;
    const result = parseGlobalValueSetTranslationFile(xml, "MyValueSet-fr");
    expect(result!.valueTranslations).toHaveLength(1);
  });
});
