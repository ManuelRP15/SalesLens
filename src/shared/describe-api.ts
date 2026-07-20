import { XMLParser } from "fast-xml-parser";

const PARTNER_API_VERSION = "61.0";
const PARTNER_NS = "urn:partner.soap.sforce.com";

const REST_API_VERSION = "v61.0";

const partnerXmlParser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  isArray: (tagName) => ["result", "fields", "picklistValues"].includes(tagName),
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
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

/**
 * Partner API SOAP call with a LocaleOptions header, which returns describe labels
 * (field labels, picklist value labels, object label/labelPlural) translated into
 * ANY language, independent of the running user's own language — this is how
 * Salesforce's own out-of-the-box standard translations get surfaced, as opposed to
 * CustomObjectTranslation (metadata-api.ts) which only carries admin-entered
 * overrides (Translation Workbench / Rename Tabs and Labels).
 */
async function describeSoapCall(
  apiHost: string,
  sessionId: string,
  language: string,
  bodyInner: string
): Promise<any> {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns="${PARTNER_NS}">
  <soapenv:Header>
    <SessionHeader><sessionId>${escapeXml(sessionId)}</sessionId></SessionHeader>
    <LocaleOptions><language>${escapeXml(language)}</language></LocaleOptions>
  </soapenv:Header>
  <soapenv:Body>
    ${bodyInner}
  </soapenv:Body>
</soapenv:Envelope>`;

  // "/c/" is the ENTERPRISE API endpoint (a per-org generated WSDL, different
  // namespace per org). The Partner WSDL — the generic, org-independent one whose
  // namespace is urn:partner.soap.sforce.com (see PARTNER_NS above) — lives at
  // "/u/". Posting a Partner-namespaced envelope to "/c/" is why Salesforce used to
  // reject every describeSObjects call with "No operation available for request
  // {urn:partner.soap.sforce.com}describeSObjects": that endpoint's dispatcher has
  // no operation registered under that namespace at all (confirmed via real-org
  // testing, 2026-07-19 — every language, including en_US, faulted identically).
  const response = await fetch(`${apiHost}/services/Soap/u/${PARTNER_API_VERSION}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=UTF-8",
      SOAPAction: '""',
    },
    body: envelope,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Partner API SOAP ${response.status}: ${text.slice(0, 500)}`);
  }
  const parsed = partnerXmlParser.parse(text);
  const body = parsed?.Envelope?.Body;
  if (body?.Fault) {
    throw new Error(`Partner API SOAP fault: ${JSON.stringify(body.Fault)}`);
  }
  return body;
}

export interface LocalizedFieldInfo {
  label: string;
  picklistValues: Array<{ value: string; label: string }>;
}

export interface LocalizedObjectInfo {
  label: string;
  labelPlural: string;
  fields: Map<string, LocalizedFieldInfo>;
}

/**
 * Batches every object into ONE describeSObjects() call for the given language
 * (max 100 objects per call, per Salesforce's documented limit — our scope is always
 * far smaller than that). Never throws: returns an empty map on any failure so a
 * single bad language/permission issue can't take down the rest of the pipeline.
 */
async function describeSObjectsBatch(
  apiHost: string,
  sessionId: string,
  objectApiNames: string[],
  language: string,
  result: Map<string, LocalizedObjectInfo>
): Promise<void> {
  const body = `<describeSObjects xmlns="${PARTNER_NS}">${objectApiNames
    .map((name) => `<sObjectType>${escapeXml(name)}</sObjectType>`)
    .join("")}</describeSObjects>`;
  const soapBody = await describeSoapCall(apiHost, sessionId, language, body);
  const results = asArray(soapBody?.describeSObjectsResponse?.result);
  for (const r of results) {
    if (!r?.name) continue;
    const fields = new Map<string, LocalizedFieldInfo>();
    for (const f of asArray(r.fields)) {
      if (!f?.name) continue;
      fields.set(f.name, {
        label: f.label ?? f.name,
        picklistValues: asArray(f.picklistValues)
          .filter((pv: any) => pv?.value)
          .map((pv: any) => ({ value: pv.value, label: pv.label ?? pv.value })),
      });
    }
    result.set(r.name, { label: r.label ?? r.name, labelPlural: r.labelPlural ?? r.label ?? r.name, fields });
  }
}

export async function fetchLocalizedDescribes(
  apiHost: string,
  sessionId: string,
  objectApiNames: string[],
  language: string
): Promise<Map<string, LocalizedObjectInfo>> {
  const result = new Map<string, LocalizedObjectInfo>();
  if (objectApiNames.length === 0) return result;
  try {
    await describeSObjectsBatch(apiHost, sessionId, objectApiNames, language, result);
  } catch (batchErr) {
    // A single invalid sObject name faults the ENTIRE batched call (INVALID_TYPE)
    // — and the scope now includes related-list sobjects that may not all be
    // describable. Fall back to per-object calls so one bad name can't take
    // down every standard translation (lesson #39).
    console.warn(`[STI] describeSObjects(${language}) batch failed, retrying per object:`, batchErr);
    await Promise.all(
      objectApiNames.map(async (name) => {
        try {
          await describeSObjectsBatch(apiHost, sessionId, [name], language, result);
        } catch {
          console.warn(`[STI] describeSObjects(${language}): ${name} is not describable, skipped.`);
        }
      })
    );
  }
  console.log(`[STI] describeSObjects(${language}): ${result.size} object(s) resolved.`);
  return result;
}

export interface LocalizedLayoutInfo {
  /** Standard AND custom buttons on the object's layouts, with per-language labels. */
  buttons: Array<{ name: string; label: string; custom: boolean }>;
  /** Section headings in layout order (only sections with useHeading=true). Match across languages BY POSITION. */
  sections: string[];
  /** Related list titles, keyed by list name. `sobject` is the related object the list shows. */
  relatedLists: Array<{ name: string; label: string; sobject: string | null }>;
  /** Buttons shown on related list cards — they belong to the RELATED object (e.g. Contact's "New"). */
  relatedListButtons: Array<{ sobject: string; name: string; label: string; custom: boolean }>;
  /** Quick actions surfaced on the layout. Names may already carry an "Object." prefix. */
  quickActions: Array<{ name: string; label: string }>;
}

/**
 * REST layouts describe with the Accept-Language header — the REST API's
 * documented localized-describe mechanism. Returns the object's layouts with
 * every user-visible label — standard/custom buttons, section headings, related
 * list titles (and their buttons), quick actions — in the requested language.
 * This is the only supported way to read STANDARD button labels ("New",
 * "Edit"...) in an arbitrary language: Salesforce's own platform translations,
 * not extractable through any translation-metadata file.
 *
 * NOTE: the first implementation used SOAP describeLayout + LocaleOptions — the
 * calls succeeded but every language came back in the running user's language
 * and sections parsed empty (lesson #36); LocaleOptions only localizes
 * describeSObject(s). Never throws; null on failure.
 */
export async function fetchLocalizedLayout(
  apiHost: string,
  sessionId: string,
  objectApiName: string,
  language: string
): Promise<LocalizedLayoutInfo | null> {
  try {
    const url = `${apiHost}/services/data/${REST_API_VERSION}/sobjects/${encodeURIComponent(objectApiName)}/describe/layouts/`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${sessionId}`,
        // HTTP language tags use hyphens: nl_NL → nl-NL.
        "Accept-Language": language.replace(/_/g, "-"),
      },
    });
    if (!response.ok) {
      console.warn(`[STI] describe/layouts ${objectApiName} (${language}): HTTP ${response.status}`);
      return null;
    }
    const data = (await response.json()) as any;

    const buttons = new Map<string, { name: string; label: string; custom: boolean }>();
    const relatedLists = new Map<string, { name: string; label: string; sobject: string | null }>();
    const relatedListButtons = new Map<string, { sobject: string; name: string; label: string; custom: boolean }>();
    const quickActions = new Map<string, { name: string; label: string }>();
    const sections: string[] = [];

    const layouts = (Array.isArray(data?.layouts) ? data.layouts : []) as any[];
    for (const layout of layouts) {
      for (const b of (layout?.buttonLayoutSection?.detailButtons ?? []) as any[]) {
        if (b?.name && b?.label) buttons.set(b.name, { name: b.name, label: b.label, custom: Boolean(b.custom) });
      }
      for (const s of (layout?.detailLayoutSections ?? []) as any[]) {
        // Any non-empty heading counts — filtering on useHeading turned out to
        // drop real sections in real-org testing (lesson #37).
        if (s?.heading) sections.push(s.heading);
      }
      for (const rl of (layout?.relatedLists ?? []) as any[]) {
        const sobject = (rl?.sobject as string | undefined) ?? null;
        if (rl?.name && rl?.label) relatedLists.set(rl.name, { name: rl.name, label: rl.label, sobject });
        for (const b of (rl?.buttons ?? []) as any[]) {
          if (b?.name && b?.label) {
            const buttonSobject = sobject ?? objectApiName;
            relatedListButtons.set(`${buttonSobject}.${b.name}`, {
              sobject: buttonSobject,
              name: b.name,
              label: b.label,
              custom: Boolean(b.custom),
            });
          }
        }
      }
      for (const qa of (layout?.quickActionList?.quickActionListItems ?? []) as any[]) {
        if (qa?.quickActionName && qa?.label) {
          quickActions.set(qa.quickActionName, { name: qa.quickActionName, label: qa.label });
        }
      }
    }

    // Evidence for the next debugging round if sections still come back empty:
    // show the raw shape of the first layout, so we can see what the real tag
    // names/values are instead of guessing (lesson #27 discipline).
    if (sections.length === 0 && layouts[0]) {
      const firstSection = layouts[0]?.detailLayoutSections?.[0];
      console.log(
        `[STI] describe/layouts(${objectApiName}) sections debug — layout keys: [${Object.keys(layouts[0]).join(", ")}]; ` +
          `first detail section: ${JSON.stringify(firstSection ?? null)?.slice(0, 400)}`
      );
    }

    return {
      buttons: [...buttons.values()],
      sections,
      relatedLists: [...relatedLists.values()],
      relatedListButtons: [...relatedListButtons.values()],
      quickActions: [...quickActions.values()],
    };
  } catch (err) {
    console.warn(`[STI] fetchLocalizedLayout(${objectApiName}, ${language}) error:`, err);
    return null;
  }
}
