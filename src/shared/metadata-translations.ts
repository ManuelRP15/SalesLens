import { BASE_LANGUAGE as BASE_LANG, type LabelEntry } from "./types";
import {
  decodeZipEntry,
  findZipEntriesBySuffix,
  languageFromTranslationFileName,
  listMetadataFullNames,
  parseGlobalTranslationFile,
  parseGlobalValueSetTranslationFile,
  parseObjectTranslationFile,
  retrieveMetadataZip,
  splitObjectTranslationFullName,
} from "./metadata-api";
import {
  fetchAppLabels,
  fetchCustomFieldIds,
  fetchEntityLabels,
  fetchFieldLabels,
  fetchQuickActionLabels,
  fetchRecordTypeLabels,
  fetchTabLabels,
  fetchWebLinkLabels,
} from "./salesforce-api";
import {
  fetchLocalizedDescribes,
  fetchLocalizedLayout,
  type LocalizedLayoutInfo,
  type LocalizedObjectInfo,
} from "./describe-api";
import { PLATFORM_LABEL_ENTRIES } from "./platform-labels";

function splitFieldKey(fieldKey: string): { objectApiName: string; fieldApiName: string } {
  const dotIdx = fieldKey.lastIndexOf(".");
  return { objectApiName: fieldKey.slice(0, dotIdx), fieldApiName: fieldKey.slice(dotIdx + 1) };
}

/**
 * Loads Translation Workbench translations (objects, fields, record types, tabs,
 * apps and picklist values) via the Metadata API, PLUS Salesforce's own built-in
 * standard translations for standard objects/fields/picklist values (via the
 * Partner API's describeSObjects + LocaleOptions, see describe-api.ts) so those
 * show up automatically even when nobody has ever customized them.
 *
 * Unlike Custom Labels (Tooling API), this is a lot more expensive and degrades
 * gracefully (empty array) on any failure: the caller simply keeps showing
 * whatever other translations it already has.
 */
export async function fetchMetadataTranslationEntries(
  apiHost: string,
  sessionId: string,
  activeLanguages: string[],
  pageObjectApiName?: string | null
): Promise<LabelEntry[]> {
  const [
    objectTranslationFullNames,
    globalValueSetFullNames,
    webLinkFullNames,
    quickActionFullNames,
    layoutFullNames,
  ] = await Promise.all([
    listMetadataFullNames(apiHost, sessionId, "CustomObjectTranslation"),
    listMetadataFullNames(apiHost, sessionId, "GlobalValueSetTranslation"),
    listMetadataFullNames(apiHost, sessionId, "WebLink"),
    listMetadataFullNames(apiHost, sessionId, "QuickAction"),
    listMetadataFullNames(apiHost, sessionId, "Layout"),
  ]);
  console.log(
    `[STI] listMetadata: ${objectTranslationFullNames.length} CustomObjectTranslation, ` +
      `${globalValueSetFullNames.length} GlobalValueSetTranslation, ${webLinkFullNames.length} WebLink, ` +
      `${quickActionFullNames.length} QuickAction, ${layoutFullNames.length} Layout`
  );

  const objectApiNames = new Set<string>();
  for (const fullName of objectTranslationFullNames) {
    const split = splitObjectTranslationFullName(fullName);
    if (split) objectApiNames.add(split.objectApiName);
  }
  // Always in scope, even if the admin has never customized anything on it — that's
  // exactly the case "always show standard translations" needs to cover.
  if (pageObjectApiName) objectApiNames.add(pageObjectApiName);

  // Scope the sibling-unlock member lists (lesson #15 pattern: nested translations
  // only surface when the corresponding component is in the same retrieve package)
  // to the objects we actually care about. WebLink/QuickAction fullNames are
  // "Object.Name"; Layout fullNames are "Object-Layout Name".
  const scopedByPrefix = (fullNames: string[], separator: string): string[] =>
    fullNames.filter((fn) => {
      const idx = fn.indexOf(separator);
      return idx > 0 && objectApiNames.has(fn.slice(0, idx));
    });
  const webLinkMembers = scopedByPrefix(webLinkFullNames, ".");
  const quickActionMembers = scopedByPrefix(quickActionFullNames, ".");
  const layoutMembers = scopedByPrefix(layoutFullNames, "-");

  // Base labels are fetched BEFORE the retrieve() call: their keys double as the
  // CustomField/RecordType member lists the retrieve package needs (see below).
  const describeLanguages = new Set(activeLanguages);
  describeLanguages.add(BASE_LANG);

  // ── describeLayout in the org's base language ONLY (lessons #34/#36/#37):
  // it inventories buttons/sections/related lists/quick actions with their base
  // labels, but NO API localizes layout labels into arbitrary languages (REST
  // has no per-request language mechanism; SOAP LocaleOptions only covers
  // describeSObject(s)) — translations come from the platform catalog, the
  // related object's plural labels, and the CustomObjectTranslation overlay. ──
  const baseLayoutByObject = new Map<string, LocalizedLayoutInfo>();
  await Promise.all(
    [...objectApiNames].map(async (objectApiName) => {
      const info = await fetchLocalizedLayout(apiHost, sessionId, objectApiName, BASE_LANG);
      if (info) baseLayoutByObject.set(objectApiName, info);
    })
  );
  {
    const first = [...baseLayoutByObject.entries()][0];
    if (first) {
      const [name, info] = first;
      console.log(
        `[STI] describeLayout(${name}) base: ${info.buttons.length} buttons, ${info.sections.length} sections, ` +
          `${info.relatedLists.length} related lists, ${info.relatedListButtons.length} related-list buttons, ` +
          `${info.quickActions.length} quick actions`
      );
    }
  }

  // Related-list objects join the describe scope so their field labels (the
  // Title:/Email:/Phone: labels inside related list cards and their columns)
  // and their plural labels (used as related list titles) resolve too.
  const allObjectApiNames = new Set(objectApiNames);
  for (const info of baseLayoutByObject.values()) {
    for (const rl of info.relatedLists) if (rl.sobject) allObjectApiNames.add(rl.sobject);
    for (const rb of info.relatedListButtons) allObjectApiNames.add(rb.sobject);
  }

  const [entityLabels, fieldLabels, customFieldIds, recordTypeLabels, webLinkLabels, quickActionLabels, localizedByLanguageEntries] = await Promise.all([
    fetchEntityLabels(apiHost, sessionId, [...allObjectApiNames]),
    fetchFieldLabels(apiHost, sessionId, [...allObjectApiNames]),
    fetchCustomFieldIds(apiHost, sessionId, [...allObjectApiNames]),
    fetchRecordTypeLabels(apiHost, sessionId, [...allObjectApiNames]),
    fetchWebLinkLabels(apiHost, sessionId, [...objectApiNames]),
    fetchQuickActionLabels(apiHost, sessionId, [...objectApiNames]),
    Promise.all(
      [...describeLanguages].map(async (lang) => [lang, await fetchLocalizedDescribes(apiHost, sessionId, [...allObjectApiNames], lang)] as const)
    ),
  ]);
  const localizedByLanguage = new Map<string, Map<string, LocalizedObjectInfo>>(localizedByLanguageEntries);

  // Diagnostic: describeSObjects+LocaleOptions is the ONLY source for standard
  // (never-customized) translations in non-base languages — if an active language
  // shows 0 objects here, it never had a chance of surfacing standard labels for
  // that language (see PHASE 7 / lesson #21), regardless of anything downstream.
  // A language with N objects resolved but whose entries still don't show up in the
  // tooltip points to a bug further down the merge instead; check the two
  // separately using this line rather than guessing.
  const coverageSummary = [...localizedByLanguage.entries()]
    .map(([lang, byObject]) => `${lang}=${byObject.size}/${allObjectApiNames.size} objects`)
    .join(", ");
  console.log(`[STI] describeSObjects coverage by language: ${coverageSummary}`);

  // NOTE: verified empirically (both through this extension and an independent
  // retrieve via Workbench) that the Metadata API only includes a field's
  // CustomFieldTranslation — and presumably a record type's RecordTypeTranslation
  // — inside CustomObjectTranslation when the corresponding CustomField/RecordType
  // component is ALSO present in the same retrieve package. Without it, those
  // nested translations are silently omitted even though they're visible and
  // editable in the Translation Workbench Setup UI. `fieldLabels`/`recordTypeLabels`
  // keys are already in the exact "Object.ApiName" member format both types need.
  const customFieldMembers = [...fieldLabels.keys()].filter((key) => key.endsWith("__c"));
  const recordTypeMembers = [...recordTypeLabels.keys()];

  // Standard field/object label translations (admin overrides) come from "Rename
  // Tabs and Labels" (standard objects aren't available in Translation Workbench
  // itself), and the same rule applies one level up: they only show up in
  // CustomObjectTranslation when the object's own CustomObject component is also
  // retrieved alongside it — confirmed against Salesforce's own guidance for
  // deploying renamed standard object/field labels.
  const [objectZip, globalZip] = await Promise.all([
    retrieveMetadataZip(apiHost, sessionId, [
      { name: "CustomObjectTranslation", members: objectTranslationFullNames },
      { name: "CustomObject", members: [...objectApiNames] },
      { name: "CustomField", members: customFieldMembers },
      { name: "RecordType", members: recordTypeMembers },
      // Sibling-unlock (lesson #15 pattern) for the nested webLinks/quickActions/
      // layouts translations inside CustomObjectTranslation.
      { name: "WebLink", members: webLinkMembers },
      { name: "QuickAction", members: quickActionMembers },
      { name: "Layout", members: layoutMembers },
    ]),
    retrieveMetadataZip(apiHost, sessionId, [
      { name: "Translations", members: ["*"] },
      { name: "GlobalValueSetTranslation", members: globalValueSetFullNames },
    ]),
  ]);
  const zip = { ...(objectZip ?? {}), ...(globalZip ?? {}) };

  // ── Parse the CustomObjectTranslation/Translations/GlobalValueSetTranslation files ──
  const parsedObjectTranslations = objectZip
    ? objectTranslationFullNames
        .map((fullName) => {
          const [path] = findZipEntriesBySuffix(zip, `${fullName}.objectTranslation`);
          const xml = path ? decodeZipEntry(zip, path) : null;
          return xml ? parseObjectTranslationFile(xml, fullName) : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
    : [];

  const parsedGlobalTranslations = globalZip
    ? findZipEntriesBySuffix(zip, ".translation")
        .map((path) => {
          const xml = decodeZipEntry(zip, path);
          return xml ? parseGlobalTranslationFile(xml, languageFromTranslationFileName(path)) : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
    : [];

  const parsedGlobalValueSets = globalZip
    ? globalValueSetFullNames
        .map((fullName) => {
          const [path] = findZipEntriesBySuffix(zip, `${fullName}.globalValueSetTranslation`);
          const xml = path ? decodeZipEntry(zip, path) : null;
          return xml ? parseGlobalValueSetTranslationFile(xml, fullName) : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null)
    : [];

  console.log(
    `[STI] parsed: ${parsedObjectTranslations.length} object translation file(s), ` +
      `${parsedGlobalTranslations.length} global translation file(s), ` +
      `${parsedGlobalValueSets.length} global value set translation file(s)`
  );

  const tabNames = new Set<string>();
  const appNames = new Set<string>();
  for (const g of parsedGlobalTranslations) {
    for (const t of g.customTabs) tabNames.add(t.name);
    for (const a of g.customApplications) appNames.add(a.name);
  }

  const [tabLabels, appLabels] = await Promise.all([
    fetchTabLabels(apiHost, sessionId, [...tabNames]),
    fetchAppLabels(apiHost, sessionId, [...appNames]),
  ]);

  const entries: LabelEntry[] = [];

  // ── ObjectLabel: seed base (EntityDefinition) + every active language's standard
  // translation (describeSObjects), then overlay admin overrides below. ─────────
  const objectLabelEntries = new Map<string, { singular: LabelEntry; plural?: LabelEntry }>();
  for (const objectApiName of objectApiNames) {
    const base = entityLabels.get(objectApiName);
    if (!base) continue;
    const singular: LabelEntry = {
      apiName: objectApiName,
      type: "ObjectLabel",
      valuesByLang: { [BASE_LANG]: base.label },
      customizedLanguages: [],
    };
    let plural: LabelEntry | undefined;
    if (base.pluralLabel && base.pluralLabel !== base.label) {
      plural = {
        apiName: `${objectApiName} (plural)`,
        type: "ObjectLabel",
        valuesByLang: { [BASE_LANG]: base.pluralLabel },
        customizedLanguages: [],
      };
    }
    for (const lang of activeLanguages) {
      if (lang === BASE_LANG) continue;
      const info = localizedByLanguage.get(lang)?.get(objectApiName);
      if (info?.label) singular.valuesByLang[lang] = info.label;
      if (plural && info?.labelPlural) plural.valuesByLang[lang] = info.labelPlural;
    }
    objectLabelEntries.set(objectApiName, { singular, plural });
    entries.push(singular);
    if (plural) entries.push(plural);
  }

  // ── FieldLabel: one entry per field FieldDefinition knows about (ALL of them —
  // standard and custom alike), seeded with every active language's standard
  // translation, admin overrides applied afterwards. ────────────────────────────
  const fieldEntries = new Map<string, LabelEntry>();
  for (const [fieldKey, base] of fieldLabels) {
    const { objectApiName, fieldApiName } = splitFieldKey(fieldKey);
    const entry: LabelEntry = {
      apiName: fieldKey,
      type: "FieldLabel",
      dataType: base.dataType,
      valuesByLang: { [BASE_LANG]: base.label },
      customizedLanguages: [],
      // Custom fields only (see DECISIONS.md #51) — Setup's field-detail route needs
      // the CustomField's real Id, not its API name; standard fields have no such Id
      // (they're not in the Tooling API's CustomField sObject at all) and keep using
      // the API-name route in setupPath, unaffected by this.
      id: customFieldIds.get(fieldKey),
    };
    for (const lang of activeLanguages) {
      if (lang === BASE_LANG) continue;
      const label = localizedByLanguage.get(lang)?.get(objectApiName)?.fields.get(fieldApiName)?.label;
      if (label) entry.valuesByLang[lang] = label;
    }
    fieldEntries.set(fieldKey, entry);
    entries.push(entry);
  }

  // ── PicklistValue: enumerate every picklist value describeSObjects knows about
  // (from the base-language describe, which gives the real API value + label),
  // seeded with every active language's standard translation. ───────────────────
  const picklistEntries = new Map<string, LabelEntry>();
  const baseDescribe = localizedByLanguage.get(BASE_LANG);
  if (baseDescribe) {
    for (const fieldKey of fieldLabels.keys()) {
      const { objectApiName, fieldApiName } = splitFieldKey(fieldKey);
      const basePicklistValues = baseDescribe.get(objectApiName)?.fields.get(fieldApiName)?.picklistValues ?? [];
      for (const pv of basePicklistValues) {
        const picklistKey = `${fieldKey}#${pv.label}`;
        const entry: LabelEntry = {
          apiName: picklistKey,
          type: "PicklistValue",
          valuesByLang: { [BASE_LANG]: pv.label },
          customizedLanguages: [],
        };
        for (const lang of activeLanguages) {
          if (lang === BASE_LANG) continue;
          const match = localizedByLanguage
            .get(lang)
            ?.get(objectApiName)
            ?.fields.get(fieldApiName)
            ?.picklistValues.find((candidate) => candidate.value === pv.value);
          if (match?.label) entry.valuesByLang[lang] = match.label;
        }
        picklistEntries.set(picklistKey, entry);
        entries.push(entry);
      }
    }
  }

  const recordTypeEntries = new Map<string, LabelEntry>();
  // Buttons (standard AND custom), quick actions, sections and related lists are
  // seeded from describeLayout for every active language (lesson #34), then the
  // CustomObjectTranslation-derived admin translations are overlaid below with
  // customizedLanguages tracking — the exact same pattern as fields.
  const buttonEntries = new Map<string, LabelEntry>();
  const quickActionEntries = new Map<string, LabelEntry>();
  const sectionEntries = new Map<string, LabelEntry>();
  const relatedListEntries = new Map<string, LabelEntry>();

  for (const [objectApiName, baseInfo] of baseLayoutByObject) {
    for (const btn of baseInfo.buttons) {
      const key = `${objectApiName}.${btn.name}`;
      const entry: LabelEntry = {
        apiName: key,
        type: btn.custom ? "WebLink" : "StandardButton",
        valuesByLang: { [BASE_LANG]: btn.label },
        customizedLanguages: btn.custom ? [] : undefined,
      };
      buttonEntries.set(key, entry);
      entries.push(entry);
    }

    for (const baseHeading of baseInfo.sections) {
      const key = `${objectApiName}.${baseHeading}`;
      if (sectionEntries.has(key)) continue;
      const entry: LabelEntry = {
        apiName: key,
        type: "LayoutSection",
        valuesByLang: { [BASE_LANG]: baseHeading },
        customizedLanguages: [],
      };
      sectionEntries.set(key, entry);
      entries.push(entry);
    }

    // Related list titles: base label from the layout; per-language values from
    // the related object's PLURAL LABEL (real Salesforce translations, already
    // fetched via describeSObjects) — but only when the base label actually IS
    // the object's plural label (an admin-renamed list keeps base-only, never a
    // wrong guess).
    for (const rl of baseInfo.relatedLists) {
      const key = `${objectApiName}.${rl.name}`;
      const entry: LabelEntry = {
        apiName: key,
        type: "RelatedList",
        valuesByLang: { [BASE_LANG]: rl.label },
      };
      if (rl.sobject) {
        const basePlural = localizedByLanguage.get(BASE_LANG)?.get(rl.sobject)?.labelPlural;
        if (basePlural && basePlural === rl.label) {
          for (const lang of activeLanguages) {
            if (lang === BASE_LANG) continue;
            const plural = localizedByLanguage.get(lang)?.get(rl.sobject)?.labelPlural;
            if (plural) entry.valuesByLang[lang] = plural;
          }
        }
      }
      relatedListEntries.set(key, entry);
      entries.push(entry);
    }

    for (const qa of baseInfo.quickActions) {
      // quickActionName may already carry an "Object." prefix — don't double it.
      const key = qa.name.includes(".") ? qa.name : `${objectApiName}.${qa.name}`;
      if (quickActionEntries.has(key)) continue;
      const entry: LabelEntry = {
        apiName: key,
        type: "QuickAction",
        valuesByLang: { [BASE_LANG]: qa.label },
        customizedLanguages: [],
      };
      quickActionEntries.set(key, entry);
      entries.push(entry);
    }

    // Buttons on related list cards belong to the RELATED object (Contact's
    // "New", Opportunity's "New"...) — without these, related-list action
    // buttons resolve to nothing (real-org log: sfdc:StandardButton.Contact.NewContact → []).
    for (const rb of baseInfo.relatedListButtons) {
      const key = `${rb.sobject}.${rb.name}`;
      if (buttonEntries.has(key)) continue;
      const entry: LabelEntry = {
        apiName: key,
        type: rb.custom ? "WebLink" : "StandardButton",
        valuesByLang: { [BASE_LANG]: rb.label },
        customizedLanguages: rb.custom ? [] : undefined,
      };
      buttonEntries.set(key, entry);
      entries.push(entry);
    }
  }

  // ── Platform catalog (lesson #37): Salesforce's own translations of standard
  // chrome strings, bundled with the extension because no API serves them. Two
  // roles: (a) enrich layout-seeded standard buttons whose base label matches a
  // catalog string, so "Account.Edit" carries es/fr/nl values; (b) standalone
  // entries for chrome with no layout identity (Follow, the standard tabs,
  // Upload Files...). Entries are cloned so index-side mutation can never touch
  // the shared constants. ──
  const catalogByBaseLabel = new Map(
    PLATFORM_LABEL_ENTRIES.filter((e) => e.type === "StandardButton").map((e) => [e.valuesByLang[BASE_LANG], e])
  );
  for (const entry of buttonEntries.values()) {
    if (entry.type !== "StandardButton") continue;
    const catalogEntry = catalogByBaseLabel.get(entry.valuesByLang[BASE_LANG]);
    if (!catalogEntry) continue;
    for (const [lang, value] of Object.entries(catalogEntry.valuesByLang)) {
      if (!(lang in entry.valuesByLang)) entry.valuesByLang[lang] = value;
    }
  }
  for (const catalogEntry of PLATFORM_LABEL_ENTRIES) {
    entries.push({ ...catalogEntry, valuesByLang: { ...catalogEntry.valuesByLang } });
  }

  // ── Overlay admin-entered overrides (Translation Workbench / Rename Tabs and
  // Labels) on top of the standard baseline seeded above — these are what get
  // marked as "customized" for the given language. ───────────────────────────────
  for (const parsed of parsedObjectTranslations) {
    const objLabels = objectLabelEntries.get(parsed.objectApiName);
    if (objLabels) {
      if (parsed.singularLabel) {
        objLabels.singular.valuesByLang[parsed.language] = parsed.singularLabel;
        objLabels.singular.customizedLanguages!.push(parsed.language);
      }
      if (objLabels.plural && parsed.pluralLabel) {
        objLabels.plural.valuesByLang[parsed.language] = parsed.pluralLabel;
        objLabels.plural.customizedLanguages!.push(parsed.language);
      }
    }

    for (const field of parsed.fields) {
      const fieldKey = `${parsed.objectApiName}.${field.name}`;
      const entry = fieldEntries.get(fieldKey);
      if (field.label && entry) {
        entry.valuesByLang[parsed.language] = field.label;
        entry.customizedLanguages!.push(parsed.language);
      }

      for (const pv of field.picklistValues) {
        const picklistKey = `${fieldKey}#${pv.masterLabel}`;
        let entry2 = picklistEntries.get(picklistKey);
        if (!entry2) {
          // Describe didn't have this value seeded (e.g. an inactive picklist value) — create it now.
          entry2 = {
            apiName: picklistKey,
            type: "PicklistValue",
            valuesByLang: { [BASE_LANG]: pv.masterLabel },
            customizedLanguages: [],
          };
          picklistEntries.set(picklistKey, entry2);
          entries.push(entry2);
        }
        entry2.valuesByLang[parsed.language] = pv.translation;
        entry2.customizedLanguages!.push(parsed.language);
      }
    }

    for (const rt of parsed.recordTypes) {
      const rtKey = `${parsed.objectApiName}.${rt.name}`;
      const baseLabel = recordTypeLabels.get(rtKey);
      if (!baseLabel) continue;
      let entry = recordTypeEntries.get(rtKey);
      if (!entry) {
        entry = { apiName: rtKey, type: "RecordType", valuesByLang: { [BASE_LANG]: baseLabel }, customizedLanguages: [] };
        recordTypeEntries.set(rtKey, entry);
        entries.push(entry);
      }
      entry.valuesByLang[parsed.language] = rt.label;
      entry.customizedLanguages!.push(parsed.language);
    }

    for (const wl of parsed.webLinks) {
      const key = `${parsed.objectApiName}.${wl.name}`;
      let entry = buttonEntries.get(key);
      if (!entry) {
        // Not on any layout describeLayout saw — fall back to the Tooling base label.
        const baseLabel = webLinkLabels.get(key);
        if (!baseLabel) continue;
        entry = { apiName: key, type: "WebLink", valuesByLang: { [BASE_LANG]: baseLabel }, customizedLanguages: [] };
        buttonEntries.set(key, entry);
        entries.push(entry);
      }
      entry.valuesByLang[parsed.language] = wl.label;
      (entry.customizedLanguages ??= []).push(parsed.language);
    }

    for (const qa of parsed.quickActions) {
      const key = `${parsed.objectApiName}.${qa.name}`;
      let entry = quickActionEntries.get(key);
      if (!entry) {
        const baseLabel = quickActionLabels.get(key);
        if (!baseLabel) continue;
        entry = { apiName: key, type: "QuickAction", valuesByLang: { [BASE_LANG]: baseLabel }, customizedLanguages: [] };
        quickActionEntries.set(key, entry);
        entries.push(entry);
      }
      entry.valuesByLang[parsed.language] = qa.label;
      (entry.customizedLanguages ??= []).push(parsed.language);
    }

    for (const s of parsed.layoutSections) {
      // The master section name doubles as the base value — no API call needed.
      const key = `${parsed.objectApiName}.${s.section}`;
      let entry = sectionEntries.get(key);
      if (!entry) {
        entry = { apiName: key, type: "LayoutSection", valuesByLang: { [BASE_LANG]: s.section }, customizedLanguages: [] };
        sectionEntries.set(key, entry);
        entries.push(entry);
      }
      entry.valuesByLang[parsed.language] = s.label;
      (entry.customizedLanguages ??= []).push(parsed.language);
    }
  }

  // ── Global value set values (global picklists) — always admin-entered, no
  // Salesforce "standard" baseline exists for these. ─────────────────────────────
  for (const gvs of parsedGlobalValueSets) {
    const split = splitObjectTranslationFullName(gvs.fullName);
    if (!split) continue;
    for (const vt of gvs.valueTranslations) {
      const picklistKey = `${split.objectApiName}#${vt.masterLabel}`;
      let entry = picklistEntries.get(picklistKey);
      if (!entry) {
        entry = {
          apiName: picklistKey,
          type: "PicklistValue",
          valuesByLang: { [BASE_LANG]: vt.masterLabel },
          customizedLanguages: [],
        };
        picklistEntries.set(picklistKey, entry);
        entries.push(entry);
      }
      entry.valuesByLang[split.language] = vt.translation;
      entry.customizedLanguages!.push(split.language);
    }
  }

  // ── Tabs and apps (global translation, not tied to one object; inherently
  // custom-only — there's no "standard Salesforce translation" for a tab/app name). ──
  const tabEntries = new Map<string, LabelEntry>();
  const appEntries = new Map<string, LabelEntry>();
  for (const g of parsedGlobalTranslations) {
    for (const t of g.customTabs) {
      const baseLabel = tabLabels.get(t.name);
      if (!baseLabel) continue;
      let entry = tabEntries.get(t.name);
      if (!entry) {
        entry = { apiName: t.name, type: "CustomTab", valuesByLang: { [BASE_LANG]: baseLabel } };
        tabEntries.set(t.name, entry);
        entries.push(entry);
      }
      entry.valuesByLang[g.language] = t.label;
    }
    for (const a of g.customApplications) {
      const baseLabel = appLabels.get(a.name);
      if (!baseLabel) continue;
      let entry = appEntries.get(a.name);
      if (!entry) {
        entry = { apiName: a.name, type: "CustomApplication", valuesByLang: { [BASE_LANG]: baseLabel } };
        appEntries.set(a.name, entry);
        entries.push(entry);
      }
      entry.valuesByLang[g.language] = a.label;
    }
  }

  console.log(
    `[STI] Metadata API entries: ${objectLabelEntries.size} object, ${fieldEntries.size} field, ` +
      `${recordTypeEntries.size} record type, ${tabEntries.size} tab, ${appEntries.size} app, ` +
      `${picklistEntries.size} picklist value, ${buttonEntries.size} button, ` +
      `${quickActionEntries.size} quick action, ${sectionEntries.size} layout section, ` +
      `${relatedListEntries.size} related list`
  );

  return entries;
}
