import type { LabelEntry, LabelType } from "./types";
import {
  buildXmlPreserveOrder,
  decodeZipEntry,
  deployMetadataFile,
  findZipEntriesBySuffix,
  freshXmlDocument,
  listMetadataFullNames,
  parseXmlPreserveOrder,
  retrieveMetadataZip,
  xmlAllChildren,
  xmlFirstChild,
  xmlLeafText,
  xmlSetLeafText,
  type RetrieveTypeMembers,
  type XmlAstNode,
} from "./metadata-api";

/**
 * PHASE 6b — types whose translation lives inside a CustomObjectTranslation/
 * Translations/GlobalValueSetTranslation XML file, writable via a Metadata API
 * deploy() (see DECISIONS.md #53). Deliberately excludes ObjectLabel/RelatedList
 * (their target is `<caseValues>`, which can hold multiple grammatical-case entries
 * for gendered languages — safely patching only the Nominative one without disturbing
 * the others needs its own follow-up, not a corner cut here) and StandardButton/
 * StandardTab (Salesforce's own platform-controlled translations — there is no
 * admin-authored value to write back to, ever, not just "not built yet").
 */
const METADATA_WRITE_TYPES: ReadonlySet<LabelType> = new Set([
  "FieldLabel",
  "RecordType",
  "WebLink",
  "QuickAction",
  "LayoutSection",
  "PicklistValue",
  "CustomTab",
  "CustomApplication",
]);

export function isMetadataWriteType(type: LabelType): boolean {
  return METADATA_WRITE_TYPES.has(type);
}

/**
 * Optimistic-concurrency decision for the deploy()-backed types, comparing the RIGHT
 * two things (see DECISIONS.md #54). `currentValue` is what lives in the deployable XML
 * file — an admin OVERRIDE, or "" when none exists. `expectedValue` is what the tooltip
 * displayed, which is the EFFECTIVE label: an override when the language was customized,
 * but otherwise Salesforce's own STANDARD translation, which never lives in this file at
 * all. Naively comparing the file's override against a standard value always mismatched,
 * producing a bogus "someone else changed it" conflict that blanked the row (real-org
 * bug: "desaparece la traducción y se quita el idioma"). Two legitimate no-conflict
 * states, so this returns false for them:
 *   (a) the file already holds exactly what we displayed (an override we saw), or
 *   (b) the language showed a STANDARD value (`showedStandardValue`) and the file still
 *       has no override for it — precisely the gap this edit is about to fill.
 * Anything else is a genuine drift: the file holds a value we neither displayed nor
 * expected, so someone changed it underneath us and we must not overwrite it.
 */
export function isWriteConflict(currentValue: string, expectedValue: string, showedStandardValue: boolean): boolean {
  if (currentValue === expectedValue) return false;
  if (showedStandardValue && currentValue === "") return false;
  return true;
}

export function splitLast(value: string, sep: string): [string, string] {
  const idx = value.lastIndexOf(sep);
  return idx === -1 ? [value, ""] : [value.slice(0, idx), value.slice(idx + 1)];
}

/**
 * Finds the repeated `containerTag` block (e.g. one `<fields>` entry) whose
 * `matchTag` child text equals `matchValue`, returning that block's own children
 * array to read/patch a leaf within — or, if none exists yet, appends a brand new
 * block already seeded with `matchTag`, ready for a leaf to be added to it. This is
 * the ONE shared shape behind fields/recordTypes/webLinks/quickActions/customTabs/
 * customApplications/picklistValues — they're all "a list of blocks identified by one
 * child, holding another child as the actual value."
 */
export function locateOrCreateBlock(
  rootChildren: XmlAstNode[],
  containerTag: string,
  matchTag: string,
  matchValue: string
): XmlAstNode[] {
  const existing = xmlAllChildren(rootChildren, containerTag).find(
    (block) => xmlLeafText(xmlFirstChild(block, matchTag)) === matchValue
  );
  if (existing) return existing;
  const fresh: XmlAstNode[] = [{ [matchTag]: [{ "#text": matchValue }] }];
  rootChildren.push({ [containerTag]: fresh });
  return fresh;
}

/**
 * FieldLabel/RecordType translations can use `<caseValues>` instead of a flat
 * `<label>` for languages with grammatical gender (German, Slavic...) — patching
 * "just the label" would either silently do nothing (no flat tag exists) or, if we
 * naively added one, risk two conflicting representations of the same translation.
 * Refuse cleanly instead of guessing — same "silence over a wrong answer" bar as
 * everywhere else in this project, just applied to a write instead of a read.
 */
export function assertNoGenderedCase(block: XmlAstNode[], leafTag: string, what: string): void {
  if (xmlFirstChild(block, leafTag)) return;
  if (xmlFirstChild(block, "caseValues")) {
    throw new Error(`${what} uses grammatical case forms in this language — editing isn't supported for that yet.`);
  }
}

interface ResolvedTarget {
  /** Everything retrieve() needs, INCLUDING the lesson #15 sibling-unlock members — without them, nested translations silently come back as unusable comments, not just absent. */
  retrieveTypes: RetrieveTypeMembers[];
  /** Metadata type name + member the deploy's package.xml declares. */
  deployType: string;
  deployMember: string;
  /** Zip entry suffix of the one file being patched — same path convention retrieve() itself already uses. */
  filePath: string;
  /** Root element tag of that file, e.g. "CustomObjectTranslation". */
  rootTag: string;
  /** Locates (creating if necessary) the target leaf within the parsed/fresh document, returning its current text and a setter. */
  apply(rootChildren: XmlAstNode[]): { currentValue: string; setValue: (v: string) => void };
}

async function resolveTarget(
  apiHost: string,
  sessionId: string,
  entry: LabelEntry,
  language: string
): Promise<ResolvedTarget> {
  switch (entry.type) {
    case "FieldLabel":
    case "PicklistValue": {
      // PicklistValue's apiName is "Object.Field#MasterLabel" (field-scoped) or
      // "GlobalValueSetName#MasterLabel" (global) — the latter has its own case below.
      const isPicklist = entry.type === "PicklistValue";
      const [left, masterLabel] = isPicklist ? splitLast(entry.apiName, "#") : [entry.apiName, ""];
      if (isPicklist && !left.includes(".")) {
        return resolveGlobalValueSetTarget(entry, language, left, masterLabel);
      }
      const [objectApiName, fieldApiName] = splitLast(isPicklist ? left : entry.apiName, ".");
      const memberFullName = `${objectApiName}-${language}`;
      const filePath = `objectTranslations/${memberFullName}.objectTranslation`;
      const retrieveTypes: RetrieveTypeMembers[] = [
        { name: "CustomObjectTranslation", members: [memberFullName] },
        { name: "CustomObject", members: [objectApiName] },
      ];
      if (fieldApiName.endsWith("__c")) {
        retrieveTypes.push({ name: "CustomField", members: [`${objectApiName}.${fieldApiName}`] });
      }
      return {
        retrieveTypes,
        deployType: "CustomObjectTranslation",
        deployMember: memberFullName,
        filePath,
        rootTag: "CustomObjectTranslation",
        apply(root) {
          const fieldBlock = locateOrCreateBlock(root, "fields", "name", fieldApiName);
          if (!isPicklist) {
            assertNoGenderedCase(fieldBlock, "label", "This field's translation");
            return {
              currentValue: xmlLeafText(xmlFirstChild(fieldBlock, "label")) ?? "",
              setValue: (v) => xmlSetLeafText(fieldBlock, "label", v),
            };
          }
          const pvBlock = locateOrCreateBlock(fieldBlock, "picklistValues", "masterLabel", masterLabel);
          return {
            currentValue: xmlLeafText(xmlFirstChild(pvBlock, "translation")) ?? "",
            setValue: (v) => xmlSetLeafText(pvBlock, "translation", v),
          };
        },
      };
    }

    case "RecordType": {
      const [objectApiName, rtName] = splitLast(entry.apiName, ".");
      const memberFullName = `${objectApiName}-${language}`;
      return {
        retrieveTypes: [
          { name: "CustomObjectTranslation", members: [memberFullName] },
          { name: "CustomObject", members: [objectApiName] },
          { name: "RecordType", members: [entry.apiName] },
        ],
        deployType: "CustomObjectTranslation",
        deployMember: memberFullName,
        filePath: `objectTranslations/${memberFullName}.objectTranslation`,
        rootTag: "CustomObjectTranslation",
        apply(root) {
          const block = locateOrCreateBlock(root, "recordTypes", "name", rtName);
          assertNoGenderedCase(block, "label", "This record type's translation");
          return {
            currentValue: xmlLeafText(xmlFirstChild(block, "label")) ?? "",
            setValue: (v) => xmlSetLeafText(block, "label", v),
          };
        },
      };
    }

    case "WebLink": {
      const [objectApiName, name] = splitLast(entry.apiName, ".");
      const memberFullName = `${objectApiName}-${language}`;
      return {
        retrieveTypes: [
          { name: "CustomObjectTranslation", members: [memberFullName] },
          { name: "CustomObject", members: [objectApiName] },
          { name: "WebLink", members: [entry.apiName] },
        ],
        deployType: "CustomObjectTranslation",
        deployMember: memberFullName,
        filePath: `objectTranslations/${memberFullName}.objectTranslation`,
        rootTag: "CustomObjectTranslation",
        apply(root) {
          const block = locateOrCreateBlock(root, "webLinks", "name", name);
          return {
            currentValue: xmlLeafText(xmlFirstChild(block, "label")) ?? "",
            setValue: (v) => xmlSetLeafText(block, "label", v),
          };
        },
      };
    }

    case "QuickAction": {
      const [objectApiName, name] = splitLast(entry.apiName, ".");
      const memberFullName = `${objectApiName}-${language}`;
      return {
        retrieveTypes: [
          { name: "CustomObjectTranslation", members: [memberFullName] },
          { name: "CustomObject", members: [objectApiName] },
          { name: "QuickAction", members: [entry.apiName] },
        ],
        deployType: "CustomObjectTranslation",
        deployMember: memberFullName,
        filePath: `objectTranslations/${memberFullName}.objectTranslation`,
        rootTag: "CustomObjectTranslation",
        apply(root) {
          const block = locateOrCreateBlock(root, "quickActions", "name", name);
          return {
            currentValue: xmlLeafText(xmlFirstChild(block, "label")) ?? "",
            setValue: (v) => xmlSetLeafText(block, "label", v),
          };
        },
      };
    }

    case "LayoutSection": {
      const [objectApiName, sectionName] = splitLast(entry.apiName, ".");
      const memberFullName = `${objectApiName}-${language}`;
      // Sections are nested one level under a specific <layouts> entry, and a
      // LayoutSection LabelEntry only knows the object + section name (the read path
      // flattens every layout's sections into one list, see parseObjectTranslationFile)
      // — not which literal Layout record it belongs to. Discover the object's actual
      // Layout fullNames via listMetadata (same lesson #15 sibling-unlock the read
      // path already relies on for this type), so retrieve() can surface ALL of the
      // object's layouts' sections, whichever one this turns out to be.
      const allLayoutFullNames = await listMetadataFullNames(apiHost, sessionId, "Layout");
      const layoutMembers = allLayoutFullNames.filter((fn) => fn.startsWith(`${objectApiName}-`));
      return {
        retrieveTypes: [
          { name: "CustomObjectTranslation", members: [memberFullName] },
          { name: "CustomObject", members: [objectApiName] },
          { name: "Layout", members: layoutMembers },
        ],
        deployType: "CustomObjectTranslation",
        deployMember: memberFullName,
        filePath: `objectTranslations/${memberFullName}.objectTranslation`,
        rootTag: "CustomObjectTranslation",
        apply(root) {
          for (const layoutBlock of xmlAllChildren(root, "layouts")) {
            for (const sectionBlock of xmlAllChildren(layoutBlock, "sections")) {
              if (xmlLeafText(xmlFirstChild(sectionBlock, "section")) === sectionName) {
                return {
                  currentValue: xmlLeafText(xmlFirstChild(sectionBlock, "label")) ?? "",
                  setValue: (v) => xmlSetLeafText(sectionBlock, "label", v),
                };
              }
            }
          }
          // Unlike every other type here, we deliberately do NOT insert a brand new
          // section block: we don't know which <layouts> entry (there can be several
          // per object) a never-before-translated section should attach to, and
          // guessing wrong would silently misfile it. Editing an EXISTING section
          // (the common case — sections come from real page layouts already seeded as
          // the base value) still works via the loop above.
          throw new Error(
            "Couldn't find this section's layout entry to add a new translation — try editing an existing translation for this section instead."
          );
        },
      };
    }

    case "CustomTab": {
      return {
        retrieveTypes: [{ name: "Translations", members: [language] }],
        deployType: "Translations",
        deployMember: language,
        filePath: `translations/${language}.translation`,
        rootTag: "Translations",
        apply(root) {
          const block = locateOrCreateBlock(root, "customTabs", "name", entry.apiName);
          return {
            currentValue: xmlLeafText(xmlFirstChild(block, "label")) ?? "",
            setValue: (v) => xmlSetLeafText(block, "label", v),
          };
        },
      };
    }

    case "CustomApplication": {
      return {
        retrieveTypes: [{ name: "Translations", members: [language] }],
        deployType: "Translations",
        deployMember: language,
        filePath: `translations/${language}.translation`,
        rootTag: "Translations",
        apply(root) {
          const block = locateOrCreateBlock(root, "customApplications", "name", entry.apiName);
          return {
            currentValue: xmlLeafText(xmlFirstChild(block, "label")) ?? "",
            setValue: (v) => xmlSetLeafText(block, "label", v),
          };
        },
      };
    }

    default:
      throw new Error(`Editing is not supported for ${entry.type} yet.`);
  }
}

function resolveGlobalValueSetTarget(
  entry: LabelEntry,
  language: string,
  gvsName: string,
  masterLabel: string
): ResolvedTarget {
  const memberFullName = `${gvsName}-${language}`;
  return {
    // No sibling-unlock needed: GlobalValueSetTranslation is retrieved as its own
    // independent file, never nested inside another component's package (unlike
    // CustomObjectTranslation's children).
    retrieveTypes: [{ name: "GlobalValueSetTranslation", members: [memberFullName] }],
    deployType: "GlobalValueSetTranslation",
    deployMember: memberFullName,
    filePath: `globalValueSetTranslations/${memberFullName}.globalValueSetTranslation`,
    rootTag: "GlobalValueSetTranslation",
    apply(root) {
      const block = locateOrCreateBlock(root, "valueTranslation", "masterLabel", masterLabel);
      return {
        currentValue: xmlLeafText(xmlFirstChild(block, "translation")) ?? "",
        setValue: (v) => xmlSetLeafText(block, "translation", v),
      };
    },
  };
}

/**
 * Saves one language's value for any of the 8 XML-backed metadata types (see
 * METADATA_WRITE_TYPES) — the deploy()-based counterpart to
 * saveCustomLabelTranslation, same signature/return shape so background/index.ts can
 * dispatch on labelType with minimal branching. Optimistic concurrency (rule #9): the
 * relevant file is retrieved and parsed FRESH, its current value compared against
 * `expectedValue`, and the write aborted on a mismatch — exactly like the Tooling API
 * path, just against a slower, retrieve-then-deploy round trip instead of a REST GET.
 * Return type includes `newLocalizationId` (always undefined here) only so
 * background/index.ts's shared success-handling code can treat both write paths'
 * results identically without a type-narrowing branch of its own.
 *
 * Safety-critical: if retrieveMetadataZip returns null (ANY failure — network, auth,
 * timeout), this THROWS rather than falling back to "build a fresh file" — treating an
 * unknown/failed read as "nothing exists yet" would risk deploying a near-empty file
 * over an object that actually already has many real translations, destroying them.
 * The "fresh file" path is only reached when retrieve() itself SUCCEEDED but the
 * specific file's suffix genuinely isn't among the returned entries — the only
 * evidence-backed signal that it doesn't exist yet, not an assumption.
 */
export async function saveMetadataTranslation(
  apiHost: string,
  sessionId: string,
  entry: LabelEntry,
  language: string,
  value: string,
  expectedValue: string
): Promise<{ conflict: true; currentValue: string } | { conflict?: false; newLocalizationId?: string }> {
  const target = await resolveTarget(apiHost, sessionId, entry, language);

  const zip = await retrieveMetadataZip(apiHost, sessionId, target.retrieveTypes);
  if (!zip) {
    throw new Error("Couldn't read the current translation state from the org — try again.");
  }
  const [existingPath] = findZipEntriesBySuffix(zip, target.filePath);
  const xmlText = existingPath ? decodeZipEntry(zip, existingPath) : null;

  const doc = xmlText ? parseXmlPreserveOrder(xmlText) : freshXmlDocument(target.rootTag);
  const rootWrapper = doc.find((n) => target.rootTag in n);
  if (!rootWrapper) {
    throw new Error("Unexpected file format from the org — couldn't find the root element.");
  }
  const rootChildren = rootWrapper[target.rootTag] as XmlAstNode[];

  const { currentValue, setValue } = target.apply(rootChildren);

  const showedStandardValue = !(entry.customizedLanguages?.includes(language) ?? false);
  if (isWriteConflict(currentValue, expectedValue, showedStandardValue)) {
    return { conflict: true, currentValue };
  }

  setValue(value);
  const patchedXml = buildXmlPreserveOrder(doc);

  const result = await deployMetadataFile(apiHost, sessionId, target.deployType, target.deployMember, target.filePath, patchedXml);
  if (!result.success) {
    const problem = result.componentFailures[0]?.problem ?? result.errorMessage ?? "Deploy failed.";
    throw new Error(describeDeployFailure(entry, problem));
  }
  return {};
}

/**
 * Turns a raw Metadata API deploy error into something a translator can act on. Today
 * this only special-cases global/standard quick actions: they're surfaced on an
 * object's layout, so they look object-scoped, but their translations don't live in
 * that object's CustomObjectTranslation — Salesforce rejects the deploy with "no
 * QuickAction named X found". Rather than leak that (or guess at an unverified global
 * `Translations` route), we say plainly that it isn't supported yet (DECISIONS.md #54).
 * The deploy is transactional, so nothing was written — the row keeps its value and the
 * editor just shows this message. Any other failure passes through unchanged; the raw
 * Salesforce text is usually the most accurate thing we can show.
 */
function describeDeployFailure(entry: LabelEntry, problem: string): string {
  if (entry.type === "QuickAction" && /no QuickAction named/i.test(problem)) {
    return "This looks like a standard or global action — editing its translation from here isn't supported yet.";
  }
  return problem;
}
