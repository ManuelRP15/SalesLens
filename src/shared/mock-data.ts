import type { LabelEntry } from "./types";

/**
 * Sample set that mimics what the Tooling API and Metadata API would return for
 * a few Custom Labels and a couple of fields with Translation Workbench active.
 * Used to test the hover + tooltip mechanism without depending on a real org.
 */
export const MOCK_LABEL_ENTRIES: LabelEntry[] = [
  {
    apiName: "Parking_Space_Title",
    type: "CustomLabel",
    valuesByLang: {
      es: "Plaza",
      en_US: "Parking Space",
      fr: "Place",
      nl_NL: "Parkeerplaats",
    },
  },
  {
    apiName: "Save_Changes_Button",
    type: "CustomLabel",
    valuesByLang: {
      es: "Guardar cambios",
      en_US: "Save Changes",
      fr: "Enregistrer",
      nl_NL: "Wijzigingen opslaan",
    },
  },
  {
    apiName: "Account.Name",
    type: "FieldLabel",
    dataType: "Text(255)",
    valuesByLang: {
      es: "Nombre de la cuenta",
      en_US: "Account Name",
      fr: "Nom du compte",
      nl_NL: "Accountnaam",
    },
  },
  {
    apiName: "Account",
    type: "ObjectLabel",
    valuesByLang: {
      es: "Cuenta",
      en_US: "Account",
      fr: "Compte",
      nl_NL: "Account",
    },
  },
  {
    apiName: "Account.Partner",
    type: "RecordType",
    valuesByLang: {
      es: "Socio",
      en_US: "Partner",
      fr: "Partenaire",
      nl_NL: "Partner",
    },
  },
  {
    apiName: "Parking_Spaces_Tab",
    type: "CustomTab",
    valuesByLang: {
      es: "Plazas de aparcamiento",
      en_US: "Parking Spaces",
      fr: "Places de parking",
      nl_NL: "Parkeerplaatsen",
    },
  },
  {
    apiName: "Account.Rating#Hot",
    type: "PicklistValue",
    valuesByLang: {
      es: "Caliente",
      en_US: "Hot",
      fr: "Chaud",
      nl_NL: "Heet",
    },
  },
  // Two field pairs that deliberately reuse a translation, so Translation Health's
  // Duplicated check (DECISIONS.md #64) has something to surface in dev/no-org use:
  // es "Zona" (Region__c + Territory__c), es "Socio" (Partner_Label + Ally__c),
  // fr "Zone" (Region__c + Territory__c). All in-scope types so they survive Simple Mode.
  {
    apiName: "Account.Region__c",
    type: "FieldLabel",
    dataType: "Text(255)",
    valuesByLang: { es: "Zona", en_US: "Region", fr: "Zone", nl_NL: "Regio" },
  },
  {
    apiName: "Contact.Territory__c",
    type: "FieldLabel",
    dataType: "Text(255)",
    valuesByLang: { es: "Zona", en_US: "Territory", fr: "Zone", nl_NL: "Gebied" },
  },
  {
    apiName: "Partner_Label",
    type: "CustomLabel",
    valuesByLang: { es: "Socio", en_US: "Partner", fr: "Partenaire", nl_NL: "Partner" },
  },
  {
    // Deliberately missing nl_NL, so the Health page also demonstrates the Missing signal
    // (and Account/ObjectLabel's nl_NL "Account" == en_US shows Possibly-untranslated).
    apiName: "Contact.Ally__c",
    type: "FieldLabel",
    dataType: "Text(255)",
    valuesByLang: { es: "Socio", en_US: "Ally", fr: "Allié" },
  },
];
