import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

const METADATA_API_VERSION = "61.0";
const RETRIEVE_POLL_INTERVAL_MS = 1500;
const RETRIEVE_MAX_POLLS = 20;

/** Generic parser for SOAP envelopes: no isArray, we use asArray() where cardinality is ambiguous. */
const soapXmlParser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true });

/**
 * Dedicated parser for the translation files inside the zip: here we DO know
 * upfront which tags are inherently repeatable, so fast-xml-parser always
 * returns them as an array (avoids the classic "collapses to an object when
 * there's only 1 element" bug).
 */
const ARRAY_TAGS = new Set([
  "caseValues",
  "fields",
  "picklistValues",
  "recordTypes",
  "validationRules",
  "layouts",
  "sections",
  "quickActions",
  "webLinks",
  "workflowTasks",
  "customTabs",
  "customApplications",
  "customLabels",
  "customPageWebLinks",
  "reportTypes",
  "scontrols",
  "flowDefinitions",
  "valueTranslation",
]);

const translationXmlParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  isArray: (tagName) => ARRAY_TAGS.has(tagName),
});

/** Normalizes the ambiguous-cardinality problem in SOAP responses (0/1/N collapse to undefined/object/array). */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function soapEnvelope(sessionId: string, bodyInner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="http://soap.sforce.com/2006/04/metadata">
  <soapenv:Header>
    <SessionHeader><sessionId>${escapeXml(sessionId)}</sessionId></SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    ${bodyInner}
  </soapenv:Body>
</soapenv:Envelope>`;
}

async function soapCall(apiHost: string, sessionId: string, operation: string, bodyInner: string): Promise<any> {
  const response = await fetch(`${apiHost}/services/Soap/m/${METADATA_API_VERSION}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=UTF-8",
      SOAPAction: '""',
    },
    body: soapEnvelope(sessionId, bodyInner),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Metadata API SOAP ${operation} ${response.status}: ${text.slice(0, 500)}`);
  }
  const parsed = soapXmlParser.parse(text);
  const body = parsed?.Envelope?.Body;
  if (body?.Fault) {
    throw new Error(`Metadata API SOAP fault in ${operation}: ${JSON.stringify(body.Fault)}`);
  }
  return body;
}

/** listMetadata: discovers the existing fullNames for a type. Never throws. */
export async function listMetadataFullNames(
  apiHost: string,
  sessionId: string,
  type: string
): Promise<string[]> {
  try {
    const body = await soapCall(
      apiHost,
      sessionId,
      "listMetadata",
      `<listMetadata><queries><type>${escapeXml(type)}</type></queries><asOfVersion>${METADATA_API_VERSION}</asOfVersion></listMetadata>`
    );
    const result = body?.listMetadataResponse?.result;
    return asArray(result)
      .map((r: any) => r?.fullName)
      .filter((name: unknown): name is string => typeof name === "string" && name.length > 0);
  } catch (err) {
    console.warn(`[STI] listMetadata(${type}) failed:`, err);
    return [];
  }
}

export interface RetrieveTypeMembers {
  name: string;
  members: string[];
}

/**
 * retrieve() + checkRetrieveStatus() polling + decompression of the resulting zip.
 * Returns null if there's nothing to request, on error, or if it times out
 * (never throws: the caller must be able to carry on without these translations).
 */
export async function retrieveMetadataZip(
  apiHost: string,
  sessionId: string,
  typesToMembers: RetrieveTypeMembers[]
): Promise<Record<string, Uint8Array> | null> {
  const nonEmpty = typesToMembers.filter((t) => t.members.length > 0);
  if (nonEmpty.length === 0) return null;

  const typesXml = nonEmpty
    .map(
      (t) =>
        `<types>${t.members.map((m) => `<members>${escapeXml(m)}</members>`).join("")}<name>${escapeXml(t.name)}</name></types>`
    )
    .join("");

  try {
    const retrieveBody = await soapCall(
      apiHost,
      sessionId,
      "retrieve",
      `<retrieve><retrieveRequest><apiVersion>${METADATA_API_VERSION}</apiVersion><singlePackage>true</singlePackage><unpackaged>${typesXml}</unpackaged></retrieveRequest></retrieve>`
    );
    const id = retrieveBody?.retrieveResponse?.result?.id;
    if (!id) {
      console.warn("[STI] retrieve() did not return an async process id");
      return null;
    }

    for (let attempt = 0; attempt < RETRIEVE_MAX_POLLS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, RETRIEVE_POLL_INTERVAL_MS));
      const statusBody = await soapCall(
        apiHost,
        sessionId,
        "checkRetrieveStatus",
        `<checkRetrieveStatus><asyncProcessId>${escapeXml(id)}</asyncProcessId><includeZip>true</includeZip></checkRetrieveStatus>`
      );
      const result = statusBody?.checkRetrieveStatusResponse?.result;
      const done = String(result?.done) === "true";
      if (!done) continue;

      if (String(result?.success) !== "true") {
        console.warn("[STI] checkRetrieveStatus finished without success:", result?.errorMessage ?? result?.status);
        return null;
      }
      const zipFile = result?.zipFile;
      if (!zipFile || typeof zipFile !== "string") {
        console.warn("[STI] checkRetrieveStatus done but no zipFile");
        return null;
      }

      const binary = atob(zipFile);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return unzipSync(bytes);
    }

    console.warn("[STI] retrieve() did not finish within the timeout");
    return null;
  } catch (err) {
    console.warn("[STI] retrieveMetadataZip failed:", err);
    return null;
  }
}

// ── Extraction of translation file content ──────────────────────────────────

export interface ParsedFieldTranslation {
  name: string;
  label?: string;
  picklistValues: Array<{ masterLabel: string; translation: string }>;
}

export interface ParsedObjectTranslation {
  objectApiName: string;
  language: string;
  singularLabel?: string;
  pluralLabel?: string;
  fields: ParsedFieldTranslation[];
  recordTypes: Array<{ name: string; label: string }>;
  /** Custom buttons/links (WebLink metadata). */
  webLinks: Array<{ name: string; label: string }>;
  /** Quick actions. */
  quickActions: Array<{ name: string; label: string }>;
  /** Page layout section headings. `section` is the master (base) name — it doubles as the base value, no extra API call needed. */
  layoutSections: Array<{ layout: string; section: string; label: string }>;
}

/** fullName has the form "ObjectApiName-language"; neither the language nor the object name ever contains a hyphen. */
export function splitObjectTranslationFullName(fullName: string): { objectApiName: string; language: string } | null {
  const idx = fullName.lastIndexOf("-");
  if (idx <= 0 || idx === fullName.length - 1) return null;
  return { objectApiName: fullName.slice(0, idx), language: fullName.slice(idx + 1) };
}

/**
 * Extracts singular/plural text out of a <caseValues> list. Salesforce uses this same
 * structure both at the object level and inside each <fields>/<recordTypes> entry for
 * languages with grammatical gender (it replaces the flat <label> tag entirely in that
 * case). <caseType> is only present when a language has more than one grammatical case
 * (e.g. German); when it's absent, the value IS the base/nominative form — it must not
 * be filtered out. Only skip values whose caseType is explicitly something other than
 * "Nominative" (Genitive, Accusative, Dative...).
 */
function extractCaseLabels(caseValues: unknown): { singular?: string; plural?: string } {
  let singular: string | undefined;
  let plural: string | undefined;
  for (const cv of asArray(caseValues) as any[]) {
    if (cv?.caseType && String(cv.caseType).toLowerCase() !== "nominative") continue;
    if (String(cv?.plural) === "true") plural = cv?.value;
    else singular = cv?.value;
  }
  return { singular, plural };
}

export function parseObjectTranslationFile(xmlText: string, fullName: string): ParsedObjectTranslation | null {
  const split = splitObjectTranslationFullName(fullName);
  if (!split) return null;

  const root = translationXmlParser.parse(xmlText)?.CustomObjectTranslation;
  if (!root) return null;

  const { singular: singularLabel, plural: pluralLabel } = extractCaseLabels(root.caseValues);

  const fields: ParsedFieldTranslation[] = asArray(root.fields).map((f: any) => ({
    name: f?.name,
    // Some languages send a flat <label>, others (grammatical gender) only send <caseValues>.
    label: f?.label ?? extractCaseLabels(f?.caseValues).singular,
    picklistValues: asArray(f?.picklistValues)
      .filter((pv: any) => pv?.masterLabel && pv?.translation)
      .map((pv: any) => ({ masterLabel: pv.masterLabel, translation: pv.translation })),
  }));

  const recordTypes = asArray(root.recordTypes)
    .map((rt: any) => ({ name: rt?.name, label: rt?.label ?? extractCaseLabels(rt?.caseValues).singular }))
    .filter((rt): rt is { name: string; label: string } => Boolean(rt.name && rt.label));

  const webLinks = asArray(root.webLinks)
    .map((w: any) => ({ name: w?.name, label: w?.label }))
    .filter((w): w is { name: string; label: string } => Boolean(w.name && w.label));

  const quickActions = asArray(root.quickActions)
    .map((q: any) => ({ name: q?.name, label: q?.label }))
    .filter((q): q is { name: string; label: string } => Boolean(q.name && q.label));

  const layoutSections = asArray(root.layouts).flatMap((l: any) =>
    asArray(l?.sections)
      .map((s: any) => ({ layout: l?.layout, section: s?.section, label: s?.label }))
      .filter((s): s is { layout: string; section: string; label: string } =>
        Boolean(s.layout && s.section && s.label)
      )
  );

  return {
    objectApiName: split.objectApiName,
    language: split.language,
    singularLabel,
    pluralLabel,
    fields,
    recordTypes,
    webLinks,
    quickActions,
    layoutSections,
  };
}

export interface ParsedGlobalTranslation {
  language: string;
  customTabs: Array<{ name: string; label: string }>;
  customApplications: Array<{ name: string; label: string }>;
}

/** The global "Translations" files are named "<language>.translation" inside the zip. */
export function languageFromTranslationFileName(fileName: string): string {
  const base = fileName.split("/").pop() ?? fileName;
  return base.replace(/\.translation$/i, "");
}

export function parseGlobalTranslationFile(xmlText: string, language: string): ParsedGlobalTranslation | null {
  const root = translationXmlParser.parse(xmlText)?.Translations;
  if (!root) return null;

  const customTabs = asArray(root.customTabs)
    .filter((t: any) => t?.name && t?.label)
    .map((t: any) => ({ name: t.name, label: t.label }));
  const customApplications = asArray(root.customApplications)
    .filter((a: any) => a?.name && a?.label)
    .map((a: any) => ({ name: a.name, label: a.label }));

  return { language, customTabs, customApplications };
}

export interface ParsedGlobalValueSetTranslation {
  fullName: string;
  valueTranslations: Array<{ masterLabel: string; translation: string }>;
}

export function parseGlobalValueSetTranslationFile(
  xmlText: string,
  fullName: string
): ParsedGlobalValueSetTranslation | null {
  const root = translationXmlParser.parse(xmlText)?.GlobalValueSetTranslation;
  if (!root) return null;

  const valueTranslations = asArray(root.valueTranslation)
    .filter((v: any) => v?.masterLabel && v?.translation)
    .map((v: any) => ({ masterLabel: v.masterLabel, translation: v.translation }));

  return { fullName, valueTranslations };
}

export function decodeZipEntry(zip: Record<string, Uint8Array>, path: string): string | null {
  const bytes = zip[path];
  return bytes ? strFromU8(bytes) : null;
}

/**
 * Looks up a zip entry by path suffix instead of exact path: the root folder that
 * retrieve() generates for "unpackaged" isn't guaranteed, so we don't assume its name.
 */
export function findZipEntriesBySuffix(zip: Record<string, Uint8Array>, suffix: string): string[] {
  return Object.keys(zip).filter((path) => path.toLowerCase().endsWith(suffix.toLowerCase()));
}
