import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

const METADATA_API_VERSION = "61.0";
const RETRIEVE_POLL_INTERVAL_MS = 1500;
const RETRIEVE_MAX_POLLS = 20;
// Deploys can genuinely take longer than a small single-file retrieve — a longer
// interval and higher cap than retrieve's (up to 60s total) rather than reusing the
// same constants.
const DEPLOY_POLL_INTERVAL_MS = 2000;
const DEPLOY_MAX_POLLS = 30;

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

// ── deploy() — the write side. Unlike every retrieve/describe helper in this file,
// these THROW on failure instead of degrading to null/[] — a save the user explicitly
// asked for must surface a real error, not vanish silently. background/index.ts's
// existing try/catch around every SAVE_TRANSLATION already turns a thrown Error into
// a user-facing message, the same pattern saveCustomLabelTranslation already relies
// on for the Tooling API write path. ──────────────────────────────────────────────

function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Chunked to avoid blowing the call-stack argument limit on String.fromCharCode
  // for a large file — unlikely for a single translation file, but cheap to guard.
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function buildPackageXml(typeName: string, memberFullName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>${escapeXml(memberFullName)}</members>
    <name>${escapeXml(typeName)}</name>
  </types>
  <version>${METADATA_API_VERSION}</version>
</Package>`;
}

export interface DeployComponentFailure {
  problem: string;
  fileName?: string;
  fullName?: string;
}

export interface DeployResult {
  success: boolean;
  errorMessage?: string;
  componentFailures: DeployComponentFailure[];
}

/**
 * Builds a minimal single-file deploy package (package.xml + the one file, at the
 * exact folder path Salesforce's own retrieve() already hands back for this type —
 * not a guessed convention), deploys it, and polls checkDeployStatus() to
 * completion. `rollbackOnError` + `singlePackage` means this is transactional: a
 * malformed patch fails the WHOLE deploy with an error, it never partially applies —
 * the worst case for a bug in the caller's XML patching is a failed save, not
 * corrupted org metadata.
 */
export async function deployMetadataFile(
  apiHost: string,
  sessionId: string,
  typeName: string,
  memberFullName: string,
  filePath: string,
  fileContent: string
): Promise<DeployResult> {
  const zipBytes = zipSync({
    "package.xml": strToU8(buildPackageXml(typeName, memberFullName)),
    [filePath]: strToU8(fileContent),
  });
  const zipBase64 = uint8ArrayToBase64(zipBytes);

  const deployBody = await soapCall(
    apiHost,
    sessionId,
    "deploy",
    `<deploy><ZipFile>${zipBase64}</ZipFile><DeployOptions><rollbackOnError>true</rollbackOnError>` +
      `<singlePackage>true</singlePackage></DeployOptions></deploy>`
  );
  const id = deployBody?.deployResponse?.result?.id;
  if (!id) throw new Error("deploy() did not return an async process id");

  for (let attempt = 0; attempt < DEPLOY_MAX_POLLS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, DEPLOY_POLL_INTERVAL_MS));
    const statusBody = await soapCall(
      apiHost,
      sessionId,
      "checkDeployStatus",
      `<checkDeployStatus><asyncProcessId>${escapeXml(id)}</asyncProcessId><includeDetails>true</includeDetails></checkDeployStatus>`
    );
    const result = statusBody?.checkDeployStatusResponse?.result;
    const done = String(result?.done) === "true";
    if (!done) continue;

    const success = String(result?.success) === "true";
    const componentFailures = asArray(result?.details?.componentFailures).map((f: any) => ({
      problem: typeof f?.problem === "string" ? f.problem : "Unknown deploy error",
      fileName: typeof f?.fileName === "string" ? f.fileName : undefined,
      fullName: typeof f?.fullName === "string" ? f.fullName : undefined,
    }));
    return { success, errorMessage: typeof result?.errorMessage === "string" ? result.errorMessage : undefined, componentFailures };
  }

  throw new Error("Deploy is taking longer than expected — check Setup > Deployment Status in the org.");
}

// ── preserveOrder XML AST — used ONLY by the write path (metadata-write.ts). The
// "friendly object" parser above (translationXmlParser) is lossy by design (that's
// what makes it pleasant to READ from) and unsuitable for writing back: rebuilding a
// full file from its friendly-mode parse would risk silently dropping content this
// project has never needed to understand (validation rules, sharing settings, other
// fields untouched by this one edit). preserveOrder mode round-trips losslessly —
// every node keeps its exact position, siblings, and attributes — so a "patch (or
// insert) exactly one node, leave everything else byte-for-byte" edit is safe. ──────

const preserveOrderParser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  removeNSPrefix: true,
  trimValues: true,
});

const preserveOrderBuilder = new XMLBuilder({
  ignoreAttributes: false,
  preserveOrder: true,
  format: true,
  suppressEmptyNode: false,
});

/** One preserveOrder AST node: `{ tagName: children[] }`, optionally with a `":@"` attributes key, or `{ "#text": string }` for a leaf's text content. */
export type XmlAstNode = Record<string, unknown>;

export function parseXmlPreserveOrder(xmlText: string): XmlAstNode[] {
  return preserveOrderParser.parse(xmlText) as XmlAstNode[];
}

export function buildXmlPreserveOrder(doc: XmlAstNode[]): string {
  return preserveOrderBuilder.build(doc) as string;
}

/** The children array of the first `tagName` element directly under `children`, or undefined if there isn't one. */
export function xmlFirstChild(children: XmlAstNode[] | undefined, tagName: string): XmlAstNode[] | undefined {
  const found = children?.find((n) => tagName in n);
  return found ? (found[tagName] as XmlAstNode[]) : undefined;
}

/** The children arrays of EVERY `tagName` element directly under `children` (for repeatable elements like `<fields>`). */
export function xmlAllChildren(children: XmlAstNode[] | undefined, tagName: string): XmlAstNode[][] {
  return (children ?? []).filter((n) => tagName in n).map((n) => n[tagName] as XmlAstNode[]);
}

/** Reads a leaf element's flat text content, e.g. the "Y" in `<label>Y</label>` given `<label>`'s own children array. */
export function xmlLeafText(children: XmlAstNode[] | undefined): string | undefined {
  const textNode = children?.find((n) => "#text" in n);
  return textNode ? String(textNode["#text"]) : undefined;
}

/** Patches an existing `tagName` leaf's text in place, or appends a brand new `<tagName>value</tagName>` element if none exists yet. */
export function xmlSetLeafText(parentChildren: XmlAstNode[], tagName: string, value: string): void {
  const existing = parentChildren.find((n) => tagName in n);
  if (existing) {
    const childArr = existing[tagName] as XmlAstNode[];
    const textNode = childArr.find((n) => "#text" in n);
    if (textNode) textNode["#text"] = value;
    else childArr.push({ "#text": value });
    return;
  }
  parentChildren.push({ [tagName]: [{ "#text": value }] });
}

/** A minimal, valid, empty document for `rootTag` (e.g. a CustomObjectTranslation file for an object+language pair that has never had one before) — safe because it only ever gets ADDED to, never merged with unfamiliar existing content. */
export function freshXmlDocument(rootTag: string): XmlAstNode[] {
  return [
    { "?xml": [], ":@": { "@_version": "1.0", "@_encoding": "UTF-8" } },
    { [rootTag]: [], ":@": { "@_xmlns": "http://soap.sforce.com/2006/04/metadata" } },
  ];
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
