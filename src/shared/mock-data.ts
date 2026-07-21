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
];
