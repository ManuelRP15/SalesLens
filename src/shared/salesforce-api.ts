import type { LabelEntry } from "./types";

const API_VERSION = "v61.0";

/**
 * The key fetchAllTranslations seeds a Custom Label's org-default value under —
 * literal "en_US" regardless of the org's actual default language (pre-existing
 * simplification, not introduced here). saveCustomLabelTranslation depends on this
 * same key to decide whether an edit targets ExternalString.Value (the base value)
 * or an ExternalStringLocalization row (an actual translation) — if a real org with a
 * non-English default language ever surfaces a mismatch here, both this constant and
 * the seeding code below need to move together.
 */
const CUSTOM_LABEL_BASE_LANGUAGE = "en_US";

/**
 * Converts the Lightning page origin into the API instance host.
 *   foo-dev-ed.develop.lightning.force.com  →  foo-dev-ed.develop.my.salesforce.com
 */
export function toApiHost(pageOrigin: string): string {
  const { hostname } = new URL(pageOrigin);
  const apiHostname = hostname.replace(/\.lightning\.force\.com$/i, ".my.salesforce.com");
  return `https://${apiHostname}`;
}

interface QueryResponse<T> {
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
  records: T[];
}

interface ExternalStringRecord {
  Id: string;
  Name: string;
  MasterLabel: string;
  Value: string;
}

interface ExternalStringLocalizationRecord {
  Id: string;
  ExternalStringId: string;
  Language: string;
  Value: string;
}

async function runQuery<T>(
  apiHost: string,
  sessionId: string,
  soql: string,
  endpoint: "query" | "tooling/query"
): Promise<T[]> {
  const firstUrl = `${apiHost}/services/data/${API_VERSION}/${endpoint}/?q=${encodeURIComponent(soql)}`;
  const records: T[] = [];
  let url: string | null = firstUrl;

  while (url) {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${sessionId}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${endpoint} API ${response.status} at ${url}: ${body}`);
    }
    const data = (await response.json()) as QueryResponse<T>;
    records.push(...data.records);
    url = data.nextRecordsUrl ? `${apiHost}${data.nextRecordsUrl}` : null;
  }
  return records;
}

/** Tooling API SOQL: metadata-flavored objects (ExternalString, FieldDefinition, EntityDefinition, CustomTab...). */
function toolingQuery<T>(apiHost: string, sessionId: string, soql: string): Promise<T[]> {
  return runQuery<T>(apiHost, sessionId, soql, "tooling/query");
}

/** Regular REST Query API SOQL: plain data objects (RecordType is real CRM data, not metadata). */
function dataQuery<T>(apiHost: string, sessionId: string, soql: string): Promise<T[]> {
  return runQuery<T>(apiHost, sessionId, soql, "query");
}

async function availableToolingObjects(apiHost: string, sessionId: string): Promise<Set<string>> {
  const url = `${apiHost}/services/data/${API_VERSION}/tooling/sobjects/`;
  const response = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${sessionId}`, "Content-Type": "application/json" },
  });
  if (!response.ok) return new Set();
  const data = (await response.json()) as { sobjects: { name: string }[] };
  return new Set(data.sobjects.map((o) => o.name));
}

/**
 * Loads Custom Labels (ExternalString) + their translations (ExternalStringLocalization).
 */
export async function fetchAllTranslations(
  apiHost: string,
  sessionId: string
): Promise<LabelEntry[]> {
  const available = await availableToolingObjects(apiHost, sessionId);
  console.log(
    "[STI] available Tooling objects:",
    [...available].filter((n) =>
      ["ExternalString", "ExternalStringLocalization", "FieldLocalization", "EntityDefinitionLocalization"].includes(n)
    )
  );

  // ── Custom Labels base value (always en_US) ──────────────────────────────
  const baseRows = await toolingQuery<ExternalStringRecord>(
    apiHost, sessionId,
    "SELECT Id, Name, MasterLabel, Value FROM ExternalString"
  );

  const entriesById = new Map<string, LabelEntry>();
  const entriesByName = new Map<string, LabelEntry>();

  for (const row of baseRows) {
    const entry: LabelEntry = {
      apiName: row.Name,
      type: "CustomLabel",
      id: row.Id,
      valuesByLang: { [CUSTOM_LABEL_BASE_LANGUAGE]: row.Value ?? row.MasterLabel },
    };
    entriesById.set(row.Id, entry);
    entriesByName.set(row.Name, entry);
  }

  // ── Custom Label translations ─────────────────────────────────────────────
  if (available.has("ExternalStringLocalization")) {
    try {
      const locRows = await toolingQuery<ExternalStringLocalizationRecord>(
        apiHost, sessionId,
        "SELECT Id, ExternalStringId, Language, Value FROM ExternalStringLocalization"
      );
      for (const loc of locRows) {
        const entry = entriesById.get(loc.ExternalStringId);
        if (!entry) continue;
        // Record the row's own Id even when Value is blank — an existing-but-empty
        // localization row still means future edits must PATCH it, not POST a
        // duplicate (Salesforce doesn't enforce uniqueness client-side, but a
        // duplicate row would just silently not be the one the org actually uses).
        entry.localizationIdsByLang = { ...(entry.localizationIdsByLang ?? {}), [loc.Language]: loc.Id };
        if (loc.Value) entry.valuesByLang[loc.Language] = loc.Value;
      }
      console.log(`[STI] Custom Labels: ${locRows.length} translations loaded.`);
    } catch (err) {
      console.warn("[STI] ExternalStringLocalization error:", err);
    }
  }

  return Array.from(entriesByName.values());
}

/** @deprecated use fetchAllTranslations */
export const fetchCustomLabels = fetchAllTranslations;

// ── Base labels (org default language) for whatever Metadata API brings back ──
// Metadata API (CustomObjectTranslation/Translations) only returns the TRANSLATED
// value, never the base one. These queries fetch it, always scoped to the api
// names we already know (via listMetadata) have some translation — the full org
// schema is never queried.

function soqlQuote(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function soqlInClause(values: string[]): string | null {
  if (values.length === 0) return null;
  return `(${values.map(soqlQuote).join(",")})`;
}

interface EntityDefinitionRecord {
  QualifiedApiName: string;
  Label: string;
  PluralLabel: string;
}

export async function fetchEntityLabels(
  apiHost: string,
  sessionId: string,
  objectApiNames: string[]
): Promise<Map<string, { label: string; pluralLabel: string }>> {
  const result = new Map<string, { label: string; pluralLabel: string }>();
  const inClause = soqlInClause(objectApiNames);
  if (!inClause) return result;
  try {
    const rows = await toolingQuery<EntityDefinitionRecord>(
      apiHost, sessionId,
      `SELECT QualifiedApiName, Label, PluralLabel FROM EntityDefinition WHERE QualifiedApiName IN ${inClause}`
    );
    for (const row of rows) {
      result.set(row.QualifiedApiName, { label: row.Label, pluralLabel: row.PluralLabel });
    }
    console.log(`[STI] EntityDefinition: ${result.size} base object label(s) resolved.`);
  } catch (err) {
    console.warn("[STI] fetchEntityLabels error:", err);
  }
  return result;
}

interface FieldDefinitionRecord {
  QualifiedApiName: string;
  Label: string;
  DataType: string;
  EntityDefinition: { QualifiedApiName: string };
}

/** Key of the returned map: "ObjectApiName.FieldApiName" */
export async function fetchFieldLabels(
  apiHost: string,
  sessionId: string,
  objectApiNames: string[]
): Promise<Map<string, { label: string; dataType: string }>> {
  const result = new Map<string, { label: string; dataType: string }>();
  const inClause = soqlInClause(objectApiNames);
  if (!inClause) return result;
  try {
    // NOTE: FieldDefinition.DeveloperName is unreliable (often blank even on custom
    // fields), so we don't filter on it — we only ever look up keys that came from
    // the CustomObjectTranslation zip, so unrelated standard fields are harmless.
    const rows = await toolingQuery<FieldDefinitionRecord>(
      apiHost, sessionId,
      `SELECT QualifiedApiName, Label, DataType, EntityDefinition.QualifiedApiName FROM FieldDefinition ` +
        `WHERE EntityDefinition.QualifiedApiName IN ${inClause}`
    );
    for (const row of rows) {
      result.set(`${row.EntityDefinition.QualifiedApiName}.${row.QualifiedApiName}`, {
        label: row.Label,
        dataType: row.DataType,
      });
    }
    console.log(`[STI] FieldDefinition: ${result.size} base field label(s) resolved.`);
  } catch (err) {
    console.warn("[STI] fetchFieldLabels error:", err);
  }
  return result;
}

interface CustomFieldRecord {
  Id: string;
  DeveloperName: string;
  TableEnumOrId: string;
}

/**
 * Key of the returned map: "ObjectApiName.FieldApiName" (with the `__c` suffix,
 * matching fetchFieldLabels' keys) → the CustomField's real Tooling-API Id. Standard
 * fields have no CustomField row at all (they're not "custom" — the Tooling API's
 * `CustomField` sObject only lists custom ones), so they're simply absent from the
 * result, same "not present = don't guess" pattern as everywhere else. `DeveloperName`
 * here does NOT include the `__c` suffix (Salesforce's own convention for this
 * specific field), so it's added back on to match FieldDefinition's key format.
 */
export async function fetchCustomFieldIds(
  apiHost: string,
  sessionId: string,
  objectApiNames: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const inClause = soqlInClause(objectApiNames);
  if (!inClause) return result;
  try {
    const rows = await toolingQuery<CustomFieldRecord>(
      apiHost, sessionId,
      `SELECT Id, DeveloperName, TableEnumOrId FROM CustomField WHERE TableEnumOrId IN ${inClause}`
    );
    for (const row of rows) {
      result.set(`${row.TableEnumOrId}.${row.DeveloperName}__c`, row.Id);
    }
    console.log(`[STI] CustomField: ${result.size} custom field Id(s) resolved.`);
  } catch (err) {
    console.warn("[STI] fetchCustomFieldIds error:", err);
  }
  return result;
}

interface RecordTypeRecord {
  DeveloperName: string;
  Name: string;
  SobjectType: string;
}

/**
 * Key of the returned map: "ObjectApiName.RecordTypeDeveloperName".
 * RecordType is plain CRM data (not a metadata-flavored object), so it's queried
 * through the regular REST Query API, not the Tooling API — the Tooling API's view
 * of RecordType lacks a DeveloperName column.
 */
export async function fetchRecordTypeLabels(
  apiHost: string,
  sessionId: string,
  objectApiNames: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const inClause = soqlInClause(objectApiNames);
  if (!inClause) return result;
  try {
    const rows = await dataQuery<RecordTypeRecord>(
      apiHost, sessionId,
      `SELECT DeveloperName, Name, SobjectType FROM RecordType WHERE SobjectType IN ${inClause}`
    );
    for (const row of rows) {
      result.set(`${row.SobjectType}.${row.DeveloperName}`, row.Name);
    }
    console.log(`[STI] RecordType: ${result.size} base record type label(s) resolved.`);
  } catch (err) {
    console.warn("[STI] fetchRecordTypeLabels error:", err);
  }
  return result;
}

interface NamedToolingRecord {
  DeveloperName: string;
  Label: string;
}

export async function fetchTabLabels(
  apiHost: string,
  sessionId: string,
  tabNames: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const inClause = soqlInClause(tabNames);
  if (!inClause) return result;
  try {
    const rows = await toolingQuery<NamedToolingRecord>(
      apiHost, sessionId,
      `SELECT DeveloperName, Label FROM CustomTab WHERE DeveloperName IN ${inClause}`
    );
    for (const row of rows) result.set(row.DeveloperName, row.Label);
    console.log(`[STI] CustomTab: ${result.size} base tab label(s) resolved.`);
  } catch (err) {
    console.warn("[STI] fetchTabLabels error (the real field name may differ):", err);
  }
  return result;
}

interface WebLinkRecord {
  Name: string;
  MasterLabel: string;
  EntityDefinition: { QualifiedApiName: string };
}

/**
 * Key of the returned map: "ObjectApiName.WebLinkName" (custom buttons/links).
 * NOTE: the Tooling WebLink object has NO PageOrSobjectType column (real-org
 * INVALID_FIELD, 2026-07-20) — scope through EntityDefinition.QualifiedApiName,
 * the same pattern FieldDefinition uses.
 */
export async function fetchWebLinkLabels(
  apiHost: string,
  sessionId: string,
  objectApiNames: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const inClause = soqlInClause(objectApiNames);
  if (!inClause) return result;
  try {
    const rows = await toolingQuery<WebLinkRecord>(
      apiHost, sessionId,
      `SELECT Name, MasterLabel, EntityDefinition.QualifiedApiName FROM WebLink ` +
        `WHERE EntityDefinition.QualifiedApiName IN ${inClause}`
    );
    for (const row of rows) {
      result.set(`${row.EntityDefinition.QualifiedApiName}.${row.Name}`, row.MasterLabel);
    }
    console.log(`[STI] WebLink: ${result.size} base button/link label(s) resolved.`);
  } catch (err) {
    console.warn("[STI] fetchWebLinkLabels error:", err);
  }
  return result;
}

interface QuickActionDefinitionRecord {
  DeveloperName: string;
  MasterLabel: string;
  SobjectType: string;
}

/** Key of the returned map: "ObjectApiName.QuickActionDeveloperName". */
export async function fetchQuickActionLabels(
  apiHost: string,
  sessionId: string,
  objectApiNames: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const inClause = soqlInClause(objectApiNames);
  if (!inClause) return result;
  try {
    const rows = await toolingQuery<QuickActionDefinitionRecord>(
      apiHost, sessionId,
      `SELECT DeveloperName, MasterLabel, SobjectType FROM QuickActionDefinition WHERE SobjectType IN ${inClause}`
    );
    for (const row of rows) result.set(`${row.SobjectType}.${row.DeveloperName}`, row.MasterLabel);
    console.log(`[STI] QuickActionDefinition: ${result.size} base quick action label(s) resolved.`);
  } catch (err) {
    console.warn("[STI] fetchQuickActionLabels error:", err);
  }
  return result;
}

export async function fetchAppLabels(
  apiHost: string,
  sessionId: string,
  appNames: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const inClause = soqlInClause(appNames);
  if (!inClause) return result;
  try {
    const rows = await toolingQuery<NamedToolingRecord>(
      apiHost, sessionId,
      `SELECT DeveloperName, Label FROM CustomApplication WHERE DeveloperName IN ${inClause}`
    );
    for (const row of rows) result.set(row.DeveloperName, row.Label);
    console.log(`[STI] CustomApplication: ${result.size} base app label(s) resolved.`);
  } catch (err) {
    console.warn("[STI] fetchAppLabels error (the real field name may differ):", err);
  }
  return result;
}

/**
 * PATCH/POST against a Tooling API sobject, normalizing the two failure shapes the
 * Tooling API actually returns (a JSON array of {message, errorCode, fields} on a
 * clean 4xx, or occasionally a bare error string) into a single thrown Error with a
 * message safe to surface directly in the tooltip's edit UI.
 */
async function toolingWrite(
  apiHost: string,
  sessionId: string,
  method: "PATCH" | "POST",
  path: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${apiHost}/services/data/${API_VERSION}/tooling/${path}`, {
    method,
    headers: { Authorization: `Bearer ${sessionId}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // A successful PATCH returns 204 No Content — nothing to parse.
  const raw = await response.text();
  const data: unknown = raw ? JSON.parse(raw) : undefined;
  if (!response.ok) {
    const message =
      Array.isArray(data) && data[0] && typeof data[0].message === "string"
        ? data[0].message
        : raw || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function toolingGet(apiHost: string, sessionId: string, path: string): Promise<unknown> {
  const response = await fetch(`${apiHost}/services/data/${API_VERSION}/tooling/${path}`, {
    headers: { Authorization: `Bearer ${sessionId}` },
  });
  const raw = await response.text();
  const data: unknown = raw ? JSON.parse(raw) : undefined;
  if (!response.ok) {
    const message =
      Array.isArray(data) && data[0] && typeof data[0].message === "string"
        ? data[0].message
        : raw || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

/**
 * Reads the CURRENT value straight from the org for one language of a CustomLabel —
 * the live read the optimistic-concurrency check in saveCustomLabelTranslation compares
 * against, never the local cache. Also returns the ExternalStringLocalization row's Id
 * when one exists, in case the caller's own `entry.localizationIdsByLang` is stale (e.g.
 * someone else created the row after this browser last loaded the index) — that Id, not
 * the possibly-stale local one, is what the write path must PATCH against.
 */
async function fetchLiveCustomLabelValue(
  apiHost: string,
  sessionId: string,
  entry: LabelEntry,
  language: string
): Promise<{ value: string; localizationId?: string }> {
  if (!entry.id) throw new Error("Missing internal record id — refresh the index and try again.");

  if (language === CUSTOM_LABEL_BASE_LANGUAGE) {
    const row = (await toolingGet(apiHost, sessionId, `sobjects/ExternalString/${entry.id}`)) as { Value: string };
    return { value: row.Value ?? "" };
  }

  const knownId = entry.localizationIdsByLang?.[language];
  if (knownId) {
    const row = (await toolingGet(apiHost, sessionId, `sobjects/ExternalStringLocalization/${knownId}`)) as {
      Value: string;
    };
    return { value: row.Value ?? "", localizationId: knownId };
  }

  // No row known locally — confirm one genuinely doesn't exist rather than assuming it,
  // since another user could have added this exact translation after we last loaded.
  // soqlQuote is used even though both values come from our own trusted query results
  // / fixed language-code list, not free user input — cheap and one less thing to
  // reason about if that ever changes.
  const rows = await toolingQuery<{ Id: string; Value: string }>(
    apiHost, sessionId,
    `SELECT Id, Value FROM ExternalStringLocalization WHERE ExternalStringId = ${soqlQuote(entry.id)} AND Language = ${soqlQuote(language)}`
  );
  if (rows.length === 0) return { value: "" };
  return { value: rows[0].Value ?? "", localizationId: rows[0].Id };
}

/**
 * Saves one language's value for a CustomLabel entry (the only editable type today,
 * see isEditableLabelType in types.ts), with optimistic concurrency control: the LIVE
 * org value is read first and compared against `expectedValue` (what the editor started
 * from). A mismatch means someone else changed it since — the write is skipped entirely
 * and the live value is returned instead, so the caller can show it without a second
 * round trip. This is mandatory, not an edge-case nicety: silently overwriting a
 * concurrent change would lose that other person's edit with no trace.
 *
 * Once confirmed unchanged, the write itself is the same three-way routing as before:
 *   - Base language → PATCH ExternalString.Value directly (no ExternalStringLocalization
 *     row exists for the base language — it lives on the label record itself).
 *   - Another language with an existing row (per the live read, not the possibly-stale
 *     local cache) → PATCH that row's own Id.
 *   - Another language with no row yet → POST a new ExternalStringLocalization row,
 *     returning its new Id so the caller can update the in-memory entry.
 */
export async function saveCustomLabelTranslation(
  apiHost: string,
  sessionId: string,
  entry: LabelEntry,
  language: string,
  value: string,
  expectedValue: string
): Promise<{ conflict: true; currentValue: string } | { conflict?: false; newLocalizationId?: string }> {
  if (!entry.id) throw new Error("Missing internal record id — refresh the index and try again.");

  const live = await fetchLiveCustomLabelValue(apiHost, sessionId, entry, language);
  if (live.value !== expectedValue) {
    return { conflict: true, currentValue: live.value };
  }

  if (language === CUSTOM_LABEL_BASE_LANGUAGE) {
    await toolingWrite(apiHost, sessionId, "PATCH", `sobjects/ExternalString/${entry.id}`, { Value: value });
    return {};
  }

  if (live.localizationId) {
    await toolingWrite(apiHost, sessionId, "PATCH", `sobjects/ExternalStringLocalization/${live.localizationId}`, {
      Value: value,
    });
    return {};
  }

  const created = (await toolingWrite(apiHost, sessionId, "POST", "sobjects/ExternalStringLocalization", {
    ExternalStringId: entry.id,
    Language: language,
    Value: value,
  })) as { id: string };
  return { newLocalizationId: created.id };
}
