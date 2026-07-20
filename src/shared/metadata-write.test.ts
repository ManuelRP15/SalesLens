import { describe, expect, it } from "vitest";
import {
  buildXmlPreserveOrder,
  freshXmlDocument,
  parseXmlPreserveOrder,
  xmlAllChildren,
  xmlFirstChild,
  xmlLeafText,
  xmlSetLeafText,
} from "./metadata-api";
import { assertNoGenderedCase, isMetadataWriteType, isWriteConflict, locateOrCreateBlock, splitLast } from "./metadata-write";

/** Finds the root element's own children array by tag, the same way saveMetadataTranslation does. */
function rootChildrenOf(doc: ReturnType<typeof parseXmlPreserveOrder>, rootTag: string) {
  const wrapper = doc.find((n) => rootTag in n);
  return wrapper![rootTag] as ReturnType<typeof parseXmlPreserveOrder>;
}

describe("splitLast", () => {
  it("splits on the last occurrence of the separator", () => {
    expect(splitLast("Account.MyField__c", ".")).toEqual(["Account", "MyField__c"]);
  });
  it("keeps a separator-containing local name intact", () => {
    expect(splitLast("Account.My.Weird.Field__c", ".")).toEqual(["Account.My.Weird", "Field__c"]);
  });
  it("returns an empty second part when the separator is absent", () => {
    expect(splitLast("NoSeparator", ".")).toEqual(["NoSeparator", ""]);
  });
});

describe("isMetadataWriteType", () => {
  it("accepts the 8 XML-backed types", () => {
    for (const t of ["FieldLabel", "RecordType", "WebLink", "QuickAction", "LayoutSection", "PicklistValue", "CustomTab", "CustomApplication"] as const) {
      expect(isMetadataWriteType(t)).toBe(true);
    }
  });
  it("rejects CustomLabel (different write path) and the deferred/permanent types", () => {
    for (const t of ["CustomLabel", "ObjectLabel", "RelatedList", "StandardButton", "StandardTab"] as const) {
      expect(isMetadataWriteType(t)).toBe(false);
    }
  });
});

describe("isWriteConflict (optimistic-concurrency baseline, DECISIONS.md #54)", () => {
  it("does NOT conflict when editing a STANDARD value that has no override in the file yet (the bug that blanked rows)", () => {
    // Displayed "Industria" was Salesforce's standard translation; the file has no
    // override (currentValue ""). This must proceed, not report a bogus conflict.
    expect(isWriteConflict("", "Industria", /* showedStandardValue */ true)).toBe(false);
  });

  it("does NOT conflict when the file already holds exactly the override we displayed", () => {
    expect(isWriteConflict("Industria", "Industria", false)).toBe(false);
    expect(isWriteConflict("Industria", "Industria", true)).toBe(false);
  });

  it("DOES conflict when the file holds a different override than what we displayed (real drift)", () => {
    // Someone else changed the override since we loaded — must not clobber it.
    expect(isWriteConflict("Otra cosa", "Industria", false)).toBe(true);
  });

  it("DOES conflict when we showed a standard value but someone has since added a (different) override", () => {
    expect(isWriteConflict("Override ajeno", "Industria", true)).toBe(true);
  });

  it("does NOT conflict when a customized override matches, even if it happens to be empty", () => {
    expect(isWriteConflict("", "", false)).toBe(false);
  });
});

describe("preserveOrder round-trip: patching an EXISTING field label", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomObjectTranslation xmlns="http://soap.sforce.com/2006/04/metadata">
    <fields>
        <name>Industry__c</name>
        <label>Industria</label>
    </fields>
    <fields>
        <name>OtherField__c</name>
        <label>Otro Campo</label>
    </fields>
    <validationRules>
        <name>SomeRule</name>
        <errorMessage>Untouched</errorMessage>
    </validationRules>
</CustomObjectTranslation>`;

  it("patches only the targeted field's label, leaving siblings and unrelated content untouched", () => {
    const doc = parseXmlPreserveOrder(xml);
    const root = rootChildrenOf(doc, "CustomObjectTranslation");

    const block = locateOrCreateBlock(root, "fields", "name", "Industry__c");
    expect(xmlLeafText(xmlFirstChild(block, "label"))).toBe("Industria");
    xmlSetLeafText(block, "label", "Industria (editado)");

    const output = buildXmlPreserveOrder(doc);
    const reparsed = parseXmlPreserveOrder(output);
    const reroot = rootChildrenOf(reparsed, "CustomObjectTranslation");

    const patched = xmlAllChildren(reroot, "fields").find((f) => xmlLeafText(xmlFirstChild(f, "name")) === "Industry__c");
    expect(xmlLeafText(xmlFirstChild(patched!, "label"))).toBe("Industria (editado)");

    // Sibling field and the unrelated validationRules block survive byte-for-byte semantically.
    const other = xmlAllChildren(reroot, "fields").find((f) => xmlLeafText(xmlFirstChild(f, "name")) === "OtherField__c");
    expect(xmlLeafText(xmlFirstChild(other!, "label"))).toBe("Otro Campo");
    const rule = xmlFirstChild(reroot, "validationRules");
    expect(xmlLeafText(xmlFirstChild(rule!, "errorMessage"))).toBe("Untouched");
  });
});

describe("preserveOrder round-trip: inserting a NEW field translation", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CustomObjectTranslation xmlns="http://soap.sforce.com/2006/04/metadata">
    <fields>
        <name>Industry__c</name>
        <label>Industria</label>
    </fields>
</CustomObjectTranslation>`;

  it("appends a brand new <fields> block when the field has never been translated, without disturbing the existing one", () => {
    const doc = parseXmlPreserveOrder(xml);
    const root = rootChildrenOf(doc, "CustomObjectTranslation");

    const block = locateOrCreateBlock(root, "fields", "name", "NeverTranslated__c");
    expect(xmlLeafText(xmlFirstChild(block, "label"))).toBeUndefined();
    xmlSetLeafText(block, "label", "Nueva Traduccion");

    const reparsed = parseXmlPreserveOrder(buildXmlPreserveOrder(doc));
    const reroot = rootChildrenOf(reparsed, "CustomObjectTranslation");
    const fields = xmlAllChildren(reroot, "fields");
    expect(fields).toHaveLength(2);

    const created = fields.find((f) => xmlLeafText(xmlFirstChild(f, "name")) === "NeverTranslated__c");
    expect(xmlLeafText(xmlFirstChild(created!, "label"))).toBe("Nueva Traduccion");
    const original = fields.find((f) => xmlLeafText(xmlFirstChild(f, "name")) === "Industry__c");
    expect(xmlLeafText(xmlFirstChild(original!, "label"))).toBe("Industria");
  });
});

describe("preserveOrder: building a FRESH document from scratch", () => {
  it("produces a minimal valid file that a field translation can be inserted into", () => {
    const doc = freshXmlDocument("CustomObjectTranslation");
    const root = rootChildrenOf(doc, "CustomObjectTranslation");
    expect(root).toEqual([]);

    const block = locateOrCreateBlock(root, "fields", "name", "BrandNewField__c");
    xmlSetLeafText(block, "label", "Primera Traduccion");

    const reparsed = parseXmlPreserveOrder(buildXmlPreserveOrder(doc));
    const reroot = rootChildrenOf(reparsed, "CustomObjectTranslation");
    const created = xmlFirstChild(reroot, "fields");
    expect(xmlLeafText(xmlFirstChild(created!, "name"))).toBe("BrandNewField__c");
    expect(xmlLeafText(xmlFirstChild(created!, "label"))).toBe("Primera Traduccion");
  });
});

describe("assertNoGenderedCase", () => {
  it("allows patching a field that already has a flat <label>", () => {
    const doc = parseXmlPreserveOrder(`<root><fields><label>X</label></fields></root>`);
    const root = rootChildrenOf(doc, "root");
    const block = xmlFirstChild(root, "fields")!;
    expect(() => assertNoGenderedCase(block, "label", "This field's translation")).not.toThrow();
  });

  it("allows a field with neither <label> nor <caseValues> (safe to insert into)", () => {
    const doc = parseXmlPreserveOrder(`<root><fields><name>X</name></fields></root>`);
    const root = rootChildrenOf(doc, "root");
    const block = xmlFirstChild(root, "fields")!;
    expect(() => assertNoGenderedCase(block, "label", "This field's translation")).not.toThrow();
  });

  it("refuses a field that only has <caseValues> (grammatical-gender language)", () => {
    const doc = parseXmlPreserveOrder(
      `<root><fields><caseValues><value>X</value><plural>false</plural></caseValues></fields></root>`
    );
    const root = rootChildrenOf(doc, "root");
    const block = xmlFirstChild(root, "fields")!;
    expect(() => assertNoGenderedCase(block, "label", "This field's translation")).toThrow(/grammatical case/);
  });
});

describe("preserveOrder round-trip: global picklist value (flat masterLabel/translation blocks)", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GlobalValueSetTranslation xmlns="http://soap.sforce.com/2006/04/metadata">
    <valueTranslation>
        <masterLabel>Hot</masterLabel>
        <translation>Caliente</translation>
    </valueTranslation>
</GlobalValueSetTranslation>`;

  it("patches an existing value translation and can insert a new one", () => {
    const doc = parseXmlPreserveOrder(xml);
    const root = rootChildrenOf(doc, "GlobalValueSetTranslation");

    const hot = locateOrCreateBlock(root, "valueTranslation", "masterLabel", "Hot");
    xmlSetLeafText(hot, "translation", "Muy Caliente");

    const cold = locateOrCreateBlock(root, "valueTranslation", "masterLabel", "Cold");
    xmlSetLeafText(cold, "translation", "Frio");

    const reparsed = parseXmlPreserveOrder(buildXmlPreserveOrder(doc));
    const reroot = rootChildrenOf(reparsed, "GlobalValueSetTranslation");
    const blocks = xmlAllChildren(reroot, "valueTranslation");
    expect(blocks).toHaveLength(2);
    expect(xmlLeafText(xmlFirstChild(blocks.find((b) => xmlLeafText(xmlFirstChild(b, "masterLabel")) === "Hot")!, "translation"))).toBe(
      "Muy Caliente"
    );
    expect(xmlLeafText(xmlFirstChild(blocks.find((b) => xmlLeafText(xmlFirstChild(b, "masterLabel")) === "Cold")!, "translation"))).toBe(
      "Frio"
    );
  });
});
