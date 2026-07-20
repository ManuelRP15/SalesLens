import type { LabelEntry } from "./types";

/**
 * Built-in catalog of Salesforce PLATFORM UI strings (standard buttons and
 * standard record-page tabs) with Salesforce's own translations.
 *
 * Why this exists (lesson #37): there is NO API that returns platform chrome
 * strings in an arbitrary language — REST has no per-request language mechanism
 * at all (its documented header list contains none), and SOAP's LocaleOptions
 * only applies to describeSObject(s). But these strings are Salesforce's own
 * platform translations, identical in every org in the world, which makes a
 * curated catalog both possible and safe.
 *
 * Rules for this file:
 * - Only genuinely STANDARD platform strings belong here — never anything an
 *   admin can author or customize.
 * - Values must be Salesforce's real UI translations (check against a real org
 *   in that language when in doubt), never free-hand translations.
 * - Currently curated for es / fr / nl_NL (the active project languages).
 *   Extending to another language = adding its key to each entry.
 */

interface PlatformLabelDef {
  name: string;
  type: "StandardButton" | "StandardTab";
  labels: Record<string, string>;
}

const DEFS: PlatformLabelDef[] = [
  // ── Standard buttons / actions ─────────────────────────────────────────────
  { name: "Edit",   type: "StandardButton", labels: { en_US: "Edit",   es: "Modificar", fr: "Modifier",  nl_NL: "Bewerken" } },
  { name: "New",    type: "StandardButton", labels: { en_US: "New",    es: "Nuevo",     fr: "Nouveau",   nl_NL: "Nieuw" } },
  { name: "Delete", type: "StandardButton", labels: { en_US: "Delete", es: "Eliminar",  fr: "Supprimer", nl_NL: "Verwijderen" } },
  { name: "Clone",  type: "StandardButton", labels: { en_US: "Clone",  es: "Clonar",    fr: "Cloner",    nl_NL: "Klonen" } },
  { name: "Save",   type: "StandardButton", labels: { en_US: "Save",   es: "Guardar",   fr: "Enregistrer", nl_NL: "Opslaan" } },
  { name: "Cancel", type: "StandardButton", labels: { en_US: "Cancel", es: "Cancelar",  fr: "Annuler",   nl_NL: "Annuleren" } },
  { name: "ViewAll",     type: "StandardButton", labels: { en_US: "View All",     es: "Ver todo",        fr: "Afficher tout",       nl_NL: "Alles weergeven" } },
  { name: "Refresh",     type: "StandardButton", labels: { en_US: "Refresh",      es: "Actualizar",      fr: "Actualiser",          nl_NL: "Vernieuwen" } },
  { name: "ExpandAll",   type: "StandardButton", labels: { en_US: "Expand All",   es: "Expandir todo",   fr: "Développer tout",     nl_NL: "Alles uitvouwen" } },
  { name: "CollapseAll", type: "StandardButton", labels: { en_US: "Collapse All", es: "Contraer todo",   fr: "Réduire tout",        nl_NL: "Alles samenvouwen" } },
  { name: "UploadFiles", type: "StandardButton", labels: { en_US: "Upload Files", es: "Cargar archivos", fr: "Charger des fichiers", nl_NL: "Bestanden uploaden" } },
  { name: "Follow",      type: "StandardButton", labels: { en_US: "Follow",       es: "Seguir",          fr: "Suivre",              nl_NL: "Volgen" } },
  { name: "Following",   type: "StandardButton", labels: { en_US: "Following",    es: "Siguiendo",       fr: "Suivi",               nl_NL: "Volgend" } },
  { name: "SubmitForApproval", type: "StandardButton", labels: { en_US: "Submit for Approval", es: "Enviar para aprobación", fr: "Soumettre pour approbation", nl_NL: "Indienen voor goedkeuring" } },
  { name: "ShowAllActivities", type: "StandardButton", labels: { en_US: "Show All Activities", es: "Mostrar todas las actividades", fr: "Afficher toutes les activités", nl_NL: "Alle activiteiten weergeven" } },
  { name: "ShowMoreActions",   type: "StandardButton", labels: { en_US: "Show more actions",   es: "Mostrar más acciones",  fr: "Afficher plus d'actions", nl_NL: "Meer acties weergeven" } },
  { name: "ShowActions",       type: "StandardButton", labels: { en_US: "Show Actions",        es: "Mostrar acciones",      fr: "Afficher les actions",    nl_NL: "Acties weergeven" } },
  { name: "LogACall",          type: "StandardButton", labels: { en_US: "Log a Call",          es: "Registrar una llamada", fr: "Consigner un appel",      nl_NL: "Een gesprek vastleggen" } },

  // ── Standard record-page tabs ──────────────────────────────────────────────
  { name: "Details",  type: "StandardTab", labels: { en_US: "Details",  es: "Detalles",    fr: "Détails",    nl_NL: "Details" } },
  { name: "Related",  type: "StandardTab", labels: { en_US: "Related",  es: "Relacionado", fr: "Associé",    nl_NL: "Gerelateerd" } },
  { name: "Activity", type: "StandardTab", labels: { en_US: "Activity", es: "Actividad",   fr: "Activité",   nl_NL: "Activiteit" } },
  { name: "Chatter",  type: "StandardTab", labels: { en_US: "Chatter",  es: "Chatter",     fr: "Chatter",    nl_NL: "Chatter" } },
  { name: "News",     type: "StandardTab", labels: { en_US: "News",     es: "Noticias",    fr: "Actualités", nl_NL: "Nieuws" } },
];

/**
 * The catalog as ready-to-index LabelEntry objects. apiName is "Platform.{name}"
 * so displayApiName strips the prefix like every other object-scoped type.
 * No customizedLanguages — these are Salesforce's own translations by definition.
 */
export const PLATFORM_LABEL_ENTRIES: LabelEntry[] = DEFS.map((def) => ({
  apiName: `Platform.${def.name}`,
  type: def.type,
  valuesByLang: def.labels,
}));
