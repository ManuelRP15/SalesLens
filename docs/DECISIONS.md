# Decisions & lessons learned

> Part of the STI doc set — start at [../CLAUDE.md](../CLAUDE.md) if you landed here
> directly. **This file is append-only and meant to be grepped, not read end to end.**
> Search the index below for keywords relevant to your task, then jump to that entry's
> full write-up (`### #N`) — either with Grep/offset-read, or Ctrl+F if you're a human.
> New entries go at the bottom, in the same format: a short greppable title, tags,
> touched files, then the full "why" in prose. See WORKFLOW.md for when to add one.

## Index (48 entries)

- **#1** 401 from the background with the Lightning host — _tooling-api, auth_
- **#2** CORS from the content script — _cors_
- **#3** HttpOnly `sid` cookie — _auth_
- **#4** "Lock sessions to the domain" Setup toggle must be disabled — _auth_
- **#5** ExternalStringLocalization — _editing_
- **#6** `CustomObjectTranslation` / `Translations` / `GlobalValueSetTranslation` are not Tooling API objects. — _tooling-api, metadata-api_
- **#7** `CustomObjectTranslation` doesn't support the `*` wildcard — _metadata-api_
- **#8** `CustomObjectTranslation` has no top-level `label`/`pluralLabel` field. — _metadata-api_
- **#9** The retrieved zip only contains the *translated* value — _tooling-api, picklist_
- **#10** `FieldDefinition.DeveloperName` is unreliable — _tooling-api_
- **#11** `RecordType` is real CRM data, not a metadata-flavored object — _tooling-api, record-type_
- **#12** fast-xml-parser's classic "collapses a single repeated element to an object instead of a 1-item array" bug — _picklist, record-type, xml-parsing_
- **#13** `atob`/`TextDecoder`-based zip handling works fine in an MV3 service worker — _background_
- **#14** `CustomFieldTranslation`/`RecordTypeTranslation` don't always use a flat `<label>` tag (caseValues fallback) — _picklist, record-type_
- **#15** `retrieve()` only includes a field's `CustomFieldTranslation` (and, presumably, a record type's `RecordTypeTra… — _soap, metadata-api, picklist, record-type, xml-parsing_
- **#16** The `CustomObject`-sibling-unlock retrieve trick alone did NOT solve standard-field labels (see #21 instead) — _metadata-api_
- **#17** MV3 service workers get killed by Chrome after a short idle period (in practice, well under 2 minutes), and a… — _resolution, background, testing_
- **#18** A hover tooltip that needs to be clickable can't rely on `relatedTarget` chains. — _hover, tooltip-ui_
- **#19** A floating, absolutely-positioned overlay that annotates dozens of elements across a real page will overlap an…
- **#20** `web_accessible_resources` makes `@crxjs/vite-plugin` copy an extra HTML page into the build, but does *not* r… — _popup, translation-health_
- **#21** Salesforce's own out-of-the-box standard translations for standard objects/fields/picklist values (the ones th… — _soap, metadata-api, partner-api, picklist_
- **#22** `describeSObjects()` batches multiple object types into a single call (up to 100) — _soap, partner-api_
- **#23** The current record page's object (guessed from the URL, `guessObjectApiNameFromUrl()`) needs to be in scope fo… — _metadata-api_
- **#24** `resolveText`'s DOM-hint narrowing only checked one direction (`target.endsWith(candidate.apiName)`), so it si… — _resolution, tooltip-ui, testing_
- **#25** `describe-api.ts` was posting Partner-WSDL-namespaced SOAP envelopes (`urn:partner.soap.sforce.com`) to the EN… — _soap, partner-api, editing_
- **#26** Some ambiguity is genuinely resolvable from the DOM alone, via the tag name of well-known Salesforce base Ligh… — _resolution, translation-health_
- **#27** Real-org evidence (2026-07-19) doesn't stop at "which tag renders what" — it corrected a whole design assumpti…
- **#28** Product decision (2026-07-19) — _hover, resolution, tooltip-ui_
- **#29** `findAttributeUpwards` in `dom-utils.ts` was skipping every same-tree ancestor — _hover, resolution_
- **#30** The Custom-Label-vs-FieldLabel text collision is resolvable structurally — _resolution, picklist, record-type, dom-heuristics, testing_
- **#31** Product decision (2026-07-19) — _layout, hover, picklist, record-type, tooltip-ui_
- **#32** Metadata coverage expanded to custom buttons (WebLink), quick actions (QuickAction) and page layout section he… — _metadata-api, layout, sections, testing_
- **#33** Translation Mode v3 (2026-07-19) — _translation-mode, tooltip-ui, popup_
- **#34** `describeLayout()` + `LocaleOptions` is the master key to the rest of the record page — the same Partner API l… — _soap, metadata-api, partner-api, layout, buttons_
- **#35** A surface-context marker must match the exact UI element it means, not the container that wraps it — the "sect… — _layout, hover, picklist, dom-heuristics, sections_
- **#36** SOAP `describeLayout` does NOT honor `LocaleOptions` — the localized-layout channel is the REST layouts descri… — _soap, partner-api, layout, buttons, sections_
- **#37** FINAL, evidence-settled architecture for platform chrome (2026-07-20) — _partner-api, layout, resolution, picklist, sections_
- **#38** Product policy settled + four real-org UX bugs fixed (2026-07-20). — _partner-api, layout, translation-mode, hover, tooltip-ui_
- **#39** Second bug round on the same features + hold-to-inspect UX (2026-07-20). — _shadow-dom, layout, translation-mode, hover, tooltip-ui_
- **#40** Hold-to-inspect responsiveness rework (2026-07-20) — _hover, tooltip-ui_
- **#41** PHASE 6 inline editing (2026-07-20) — _tooling-api, metadata-api, picklist, record-type, editing_
- **#42** Optimistic concurrency control for edits (2026-07-20, product requirement, non-negotiable for production-readiness) — _resolution, editing, concurrency, tooltip-ui_
- **#43** Hover system replaced end to end (2026-07-20) — _translation-mode, hover, editing, tooltip-ui_
- **#44** Hover text detection now checks actual rendered glyph rects, not just the DOM box — _hover, dom-heuristics_
- **#45** Tooltip surface is pointer-events:none except its real controls, so it no longer blocks content it covers — _hover, tooltip-ui_
- **#46** Translation Mode chips can edit Custom Labels by reopening the hover tooltip's own editor — _translation-mode, editing, concurrency_
- **#47** PHASE 5 Navigate to Setup shipped — click the type badge to open Setup — _tooltip-ui_
- **#48** PHASE 14 Copy SOQL / Copy XML Member shipped for confidently-mapped types only — _tooling-api, metadata-api_

---

### #1 — 401 from the background with the Lightning host
**Tags:** tooling-api, auth

**401 from the background with the Lightning host**: the `sid` cookie from `*.lightning.force.com` is not valid for the REST/Tooling API. Always call `*.my.salesforce.com`. Solved with `toApiHost()`.

---

### #2 — CORS from the content script
**Tags:** cors

**CORS from the content script**: cross-origin fetch from the content script is blocked by CORS (the Authorization header triggers a preflight). The fetch runs in the background, which has `host_permissions`.

---

### #3 — HttpOnly `sid` cookie
**Tags:** auth

**HttpOnly `sid` cookie**: only readable from the background with `chrome.cookies.get()`, not from the content script.

---

### #4 — "Lock sessions to the domain"
**Tags:** —

**"Lock sessions to the domain"**: disable it in Setup → Session Settings → "Lock sessions to the domain in which they were first used".

---

### #5 — ExternalStringLocalization
**Tags:** editing

**ExternalStringLocalization**: Custom Label translations are rows of `ExternalStringLocalization` with `ExternalStringId` + `Language` + `Value`. They are NOT fields on `ExternalString`.

---

### #6 — `CustomObjectTranslation` / `Translations` / `GlobalValueSetTranslation` are not Tooling API objects.
**Tags:** tooling-api, metadata-api  
**Files:** `metadata-api.ts`

**`CustomObjectTranslation` / `Translations` / `GlobalValueSetTranslation` are not Tooling API objects.** Verified against the full alphabetical Tooling API object list — they don't appear there. The only programmatic access is the Metadata API (`listMetadata` + `retrieve` + `checkRetrieveStatus`), which is why `metadata-api.ts` exists.

---

### #7 — `CustomObjectTranslation` doesn't support the `*` wildcard
**Tags:** metadata-api

**`CustomObjectTranslation` doesn't support the `*` wildcard** in `retrieve()` — the exact `fullName`s (`ObjectApiName-language`) must be enumerated via `listMetadata` first. `Translations` (the global file), by contrast, **does** support `members: ["*"]` and returns one file per configured language in a single retrieve.

---

### #8 — `CustomObjectTranslation` has no top-level `label`/`pluralLabel` field.
**Tags:** metadata-api

**`CustomObjectTranslation` has no top-level `label`/`pluralLabel` field.** The object name translation (singular/plural) lives inside `caseValues`, keyed by grammatical case (`caseType = "Nominative"`, `plural = true/false`).

---

### #9 — The retrieved zip only contains the *translated* value
**Tags:** tooling-api, picklist

**The retrieved zip only contains the *translated* value**, never the base one — except for `picklistValues` / `valueTranslation`, which conveniently include both `masterLabel` (base) and `translation` in the same element. Everything else (field/object/record-type/tab/app labels) needs a separate, tightly scoped Tooling API / REST Query API call for the base value.

---

### #10 — `FieldDefinition.DeveloperName` is unreliable
**Tags:** tooling-api

**`FieldDefinition.DeveloperName` is unreliable** (often blank even for genuine custom fields when queried via the Tooling API) — don't filter on it; scope by `EntityDefinition.QualifiedApiName` instead and simply look up only the keys you already know you need.

---

### #11 — `RecordType` is real CRM data, not a metadata-flavored object
**Tags:** tooling-api, record-type

**`RecordType` is real CRM data, not a metadata-flavored object** — querying it via `/tooling/query/` throws `INVALID_FIELD` on `DeveloperName` (the Tooling API's view of `RecordType` lacks that column). It must be queried through the regular REST Query API (`/services/data/vXX.0/query/`), where the real `RecordType` sObject does expose `DeveloperName`.

---

### #12 — fast-xml-parser's classic "collapses a single repeated element to an object instead of a 1-item array" bug
**Tags:** picklist, record-type, xml-parsing

**fast-xml-parser's classic "collapses a single repeated element to an object instead of a 1-item array" bug**: solved with a dedicated parser instance configured with `isArray: (tagName) => ARRAY_TAGS.has(tagName)` for every tag that's inherently repeatable in the translation file schemas (`fields`, `caseValues`, `picklistValues`, `recordTypes`, `customTabs`, `customApplications`, `valueTranslation`, etc.), instead of relying on ad-hoc array-wrapping after the fact.

---

### #13 — `atob`/`TextDecoder`-based zip handling works fine in an MV3 service worker
**Tags:** background

**`atob`/`TextDecoder`-based zip handling works fine in an MV3 service worker** (no DOM needed): base64 → `Uint8Array` via `atob` + a manual byte loop, decompression via `fflate.unzipSync`, and text decoding via `fflate.strFromU8` (UTF-8 by default), which is required since translation values routinely contain accented characters.

---

### #14 — `CustomFieldTranslation`/`RecordTypeTranslation` don't always use a flat `<label>` tag (caseValues fallback)
**Tags:** picklist, record-type  
**Files:** `metadata-api.ts`

**`CustomFieldTranslation` (and the object-level name, and `RecordTypeTranslation`) don't always use a flat `<label>` tag.** For languages with grammatical gender (verified against real org data for Dutch, and Spanish behaves the same way), Salesforce omits `<label>` entirely and instead nests a `<caseValues>` list (same shape as the object-level singular/plural mechanism: `plural` + `value`, optionally `caseType`). `parseObjectTranslationFile` in `metadata-api.ts` falls back to extracting from `caseValues` whenever `label` is absent, for fields, record types, and the object name alike (`extractCaseLabels` helper). Also: `<caseType>` is only present when a language has more than one grammatical case (e.g. German Genitive/Dative) — when it's absent, the value **is** the base/nominative form and must not be filtered out. Filtering on `caseType === "Nominative"` unconditionally (skipping everything when the tag is missing) was the actual root cause of fields/record types/picklist values silently never appearing, even though the base labels were being resolved correctly and the zip genuinely contained the data.

---

### #15 — `retrieve()` only includes a field's `CustomFieldTranslation` (and, presumably, a record type's `RecordTypeTra…
**Tags:** soap, metadata-api, picklist, record-type, xml-parsing

**`retrieve()` only includes a field's `CustomFieldTranslation` (and, presumably, a record type's `RecordTypeTranslation`) inside `CustomObjectTranslation` when the corresponding `CustomField`/`RecordType` component is ALSO present in the same retrieve package.** Verified two ways: (a) an independent retrieve via Workbench requesting only `CustomObjectTranslation` reproduced the exact same incomplete file our extension got (ruling out any bug in our SOAP client/parsing); (b) retrieving the same `CustomObjectTranslation` member together with the object's `CustomField` components made the missing `CustomFieldTranslation` entries (real labels and picklist values) appear immediately. Untranslated fields show up as `<label><!-- Master Label --></label>` — an XML **comment**, not real text — which fast-xml-parser correctly drops, so `field.label` is empty/falsy and no bogus entry gets created; this is expected, not a bug. Fix: `fetchMetadataTranslationEntries` now fetches `fieldLabels`/`recordTypeLabels` (via `FieldDefinition`/`RecordType`) **before** calling `retrieveMetadataZip`, and feeds their keys in as `CustomField`/`RecordType` members alongside `CustomObjectTranslation` in the same retrieve package.

---

### #16 — The `CustomObject`-sibling-unlock retrieve trick alone did NOT solve standard-field labels (see #21 instead)
**Tags:** metadata-api

**The `CustomObject`-sibling-unlock trick (adding `CustomObject: <object>` to the retrieve package, the same pattern as lesson #15's `CustomField` trick) was a reasonable, Salesforce-guidance-backed hypothesis for surfacing standard field/object label overrides from "Rename Tabs and Labels" — but it wasn't sufficient on its own in practice** (real-org testing: still "Unknown Origin" for standard fields even after modifying them via Rename Tabs and Labels). It's kept in the retrieve package since it's harmless and may still help for some override cases, but it is **not** the mechanism that actually solves standard-field translations — see lesson #21, which is.

---

### #17 — MV3 service workers get killed by Chrome after a short idle period (in practice, well under 2 minutes), and a…
**Tags:** resolution, background, testing

**MV3 service workers get killed by Chrome after a short idle period (in practice, well under 2 minutes), and a module-level variable is not a caching strategy.** The reverse index must be persisted to `chrome.storage.local` and restored on module load, or the extension silently reverts to whatever the module-level variable's initializer was (here, mock data) until something re-triggers a full reload — no amount of "it worked when I tested it a minute ago" testing will catch this without leaving the tab idle for a few minutes first.

---

### #18 — A hover tooltip that needs to be clickable can't rely on `relatedTarget` chains.
**Tags:** hover, tooltip-ui

**A hover tooltip that needs to be clickable can't rely on `relatedTarget` chains.** The pointer crosses arbitrary unrelated elements on its way from the hovered element to a tooltip rendered at a fixed offset, each firing its own mouseout; checking `event.relatedTarget` only catches the *last* hop. A grace-period timer (schedule a clear on `mouseout`, cancel it on the tooltip's own `mouseenter`) is robust regardless of what's in between.

---

### #19 — A floating, absolutely-positioned overlay that annotates dozens of elements across a real page will overlap an…
**Tags:** —

**A floating, absolutely-positioned overlay that annotates dozens of elements across a real page will overlap and won't read as "attached" to anything**, no matter how carefully positions are computed — real UIs are too dense and dynamic for that to hold up. Appending a small element as the *last child of the actual matched element* (real DOM insertion, not a separate shadow-root overlay) trades away the "we never touch Salesforce's DOM" guarantee for something that actually reads as attached to the right thing, with zero manual positioning code — see PHASE 9 below.

---

### #20 — `web_accessible_resources` makes `@crxjs/vite-plugin` copy an extra HTML page into the build, but does *not* r…
**Tags:** popup, translation-health  
**Files:** `./main.tsx`, `vite.config.ts`

**`web_accessible_resources` makes `@crxjs/vite-plugin` copy an extra HTML page into the build, but does *not* run it through Vite's HTML entry-point transform** (the step that rewrites `<script src="./main.tsx">` into a hashed built asset, the way it does for `action.default_popup`). The symptom is a page that loads and shows nothing — the raw, untranspiled `./main.tsx` reference 404s silently. Fix: also declare the page explicitly in `vite.config.ts`'s `build.rollupOptions.input` (e.g. `{ health: "src/health/index.html" }`), which puts it through the same processing as the popup.

---

### #21 — Salesforce's own out-of-the-box standard translations for standard objects/fields/picklist values (the ones th…
**Tags:** soap, metadata-api, partner-api, picklist  
**Files:** `src/shared/describe-api.ts`

**Salesforce's own out-of-the-box standard translations for standard objects/fields/picklist values (the ones that "just exist" in every supported language, whether or not anyone has ever customized anything) are not exposed through `CustomObjectTranslation` at all — they come from the Partner API's `describeSObjects()` call with a `LocaleOptions` SOAP header** (`{ language: "fr" }`, etc.), which returns object `label`/`labelPlural`, every field's `label`, and every picklist value's `label`, all translated into whatever language `LocaleOptions` specifies — independent of the running user's own language, and independent of any Translation Workbench/Rename Tabs and Labels customization. This uses a different endpoint (`/services/Soap/u/{version}`, Partner WSDL namespace `urn:partner.soap.sforce.com` — see lesson #25, this was originally miswritten as `/c/` and didn't actually work until that fix) than the Metadata API (`/services/Soap/m/{version}`) — see `src/shared/describe-api.ts`. Practical consequence for the data model: `FieldLabel`/`ObjectLabel`/`PicklistValue` entries are now **seeded** from `describeSObjects` for every active language (plus the org's base language) covering literally every field/value describe knows about, and the `CustomObjectTranslation`-derived data (lesson #15) is layered on top as an override, tracked via `LabelEntry.customizedLanguages` so the UI can mark, per language, whether a given translation is Salesforce's stock one or an admin override.

---

### #22 — `describeSObjects()` batches multiple object types into a single call (up to 100)
**Tags:** soap, partner-api  
**Files:** `describe-api.ts`

**`describeSObjects()` batches multiple object types into a single call (up to 100)**, so the added cost of standard-translation lookups is one SOAP call per active language (plus one for the base language), not one per object — `fetchLocalizedDescribes` in `describe-api.ts` takes an array of object API names and returns all of them from one request.

---

### #23 — The current record page's object (guessed from the URL, `guessObjectApiNameFromUrl()`) needs to be in scope fo…
**Tags:** metadata-api

**The current record page's object (guessed from the URL, `guessObjectApiNameFromUrl()`) needs to be in scope for describe-based standard translations even when it has zero `CustomObjectTranslation` history** — otherwise `objectApiNames` (derived only from `listMetadata("CustomObjectTranslation")`) would stay empty for any object nobody has ever customized, and standard fields on it would never get looked up at all. `LOAD_LABELS` now carries `pageObjectApiName` from the content script through to `fetchMetadataTranslationEntries` for exactly this reason.

---

### #24 — `resolveText`'s DOM-hint narrowing only checked one direction (`target.endsWith(candidate.apiName)`), so it si…
**Tags:** resolution, tooltip-ui, testing  
**Files:** `index-builder.ts`

**`resolveText`'s DOM-hint narrowing only checked one direction (`target.endsWith(candidate.apiName)`), so it silently failed to disambiguate whenever `data-target-selection-name` carried a bare field/object name shorter than the candidate's full `Object.Field` apiName** (e.g. hint `"MasterRecordId"` against candidate apiName `"Account.MasterRecordId"` — the hint is shorter than the apiName, so `endsWith` in that direction is always false). Real-org feedback (2026-07-19): a genuinely ambiguous case — the text "Account" is simultaneously a real Custom Label value, a real standard field label, and the real object label — stayed a 3-way tie in the tooltip even though the hovered element likely did carry a usable hint. Fixed in `index-builder.ts` by checking both directions (`target.endsWith(apiName) || apiName.endsWith(target)`). A second, weaker tie-break was added for cases where even that doesn't fully narrow it down (including when `targetSelectionName` is simply absent for that element — confirmed happening in real testing): candidates belonging to the object of the page currently being viewed (`hints.pageObjectApiName`) are sorted first — this **never claims `highConfidence: true`** off of this signal alone (per the "zero false positives" quality bar — see Product quality bars above), it only makes the ambiguous list more useful to read. **True 100% disambiguation from rendered text alone is not achievable when Salesforce genuinely uses the identical string for multiple unrelated metadata items in the same org** (as in this example) — closing that gap further requires richer DOM signals than `data-target-selection-name` alone provides, which is real, open work (see PHASE 8's detection heuristics).

---

### #25 — `describe-api.ts` was posting Partner-WSDL-namespaced SOAP envelopes (`urn:partner.soap.sforce.com`) to the EN…
**Tags:** soap, partner-api, editing  
**Files:** `describe-api.ts`, `metadata-api.ts`

**`describe-api.ts` was posting Partner-WSDL-namespaced SOAP envelopes (`urn:partner.soap.sforce.com`) to the ENTERPRISE API endpoint (`/services/Soap/c/{version}`) instead of the Partner API endpoint (`/services/Soap/u/{version}`) — so every single `describeSObjects` call faulted, for every language including the base language, from the day PHASE 7 shipped.** This is the actual root cause behind "only English and the admin-customized languages show a standard translation" (2026-07-19 real-org confirmation): `/c/` is the **Enterprise** API — a WSDL generated per-org with a namespace specific to that org's schema — while `/u/` is the **Partner** API — the generic, org-independent WSDL whose namespace is always `urn:partner.soap.sforce.com`, which is what our envelope was already correctly built for. Posting the right namespace to the wrong endpoint produced Salesforce's generic dispatch fault, `No operation available for request {urn:partner.soap.sforce.com}describeSObjects` — a fault that reads like a permissions/session problem but is purely a wrong-URL bug, confirmed by the fact that it faulted identically for every language (including en_US) and by the fact that `metadata-api.ts`'s SOAP calls against `/services/Soap/m/` — same session, same request shape — worked the entire time. The `[STI] describeSObjects coverage by language: ...` diagnostic line (added the same day, still in the code) was what made this checkable in one glance instead of guessing. **Lesson for future SOAP work in this project: the two-letter path segment after `/services/Soap/` (`c`, `u`, `m`, `T` for Tooling, etc.) determines which WSDL/namespace the endpoint expects — a namespace mismatch here reliably produces this exact "No operation available" fault, not an auth error, which is what makes it easy to mis-diagnose as an org/permissions issue instead of a URL bug.**

---

### #26 — Some ambiguity is genuinely resolvable from the DOM alone, via the tag name of well-known Salesforce base Ligh…
**Tags:** resolution, translation-health  
**Files:** `index-builder.ts`

**Some ambiguity is genuinely resolvable from the DOM alone, via the tag name of well-known Salesforce base Lightning components — not every collision is an inherent data-model tie.** Real-org evidence (2026-07-19, after lesson #25's fix): the text "Account" still resolved to 3 tied candidates (a Custom Label, a field, and the object itself), and lesson #24's page-context tie-break could only reorder the guess, not resolve it — because in this specific case, `data-target-selection-name` was absent for that element. But the browser console (`[STI] element under cursor: ...`) showed the actual hovered tag name differed by source: this ambiguous "Account" came from a `<records-entity-label>` element, while the same string coming from an actual Custom Label came from a plain `<span>`. **`<records-entity-label>` is a Salesforce base component that renders the object's own label** — confirmed directly by the user against their real org (an initial guess here that it meant "the record's Name value, i.e. real record data, not a label" was wrong and was reverted the same day — see the correction noted in lesson #28). Fixed by threading `element.tagName` through as a new `ContextHints.elementTagName`, checked in `resolveText` (`index-builder.ts`): a match against `TAG_TYPE_HINTS` (currently `{"RECORDS-ENTITY-LABEL": "ObjectLabel"}`) narrows the candidate list down to that type before any other tie-break runs. **This generalizes well**: `records-entity-label` is a standard, non-customizable base component used consistently across the large majority of out-of-the-box Lightning Record Pages (Account, Contact, Opportunity, custom objects alike) — but it only solves ambiguity involving an ObjectLabel candidate, not every field-label-vs-custom-label collision, which has no similarly universal tag. **Only add more tags to `TAG_TYPE_HINTS` on the same evidence bar as this one — real DOM output from an actual org, ideally confirmed by the user directly rather than inferred from the component's name — never by guessing from Salesforce component-naming conventions alone**, per the same "don't guess at a heuristic without real bad-data examples" discipline used for PHASE 10's health checks.

---

### #27 — Real-org evidence (2026-07-19) doesn't stop at "which tag renders what" — it corrected a whole design assumpti…
**Tags:** —

**Real-org evidence (2026-07-19) doesn't stop at "which tag renders what" — it corrected a whole design assumption in the code, not just a data point.** When `TAG_TYPE_HINTS`' first entry was added (lesson #26), it was based on this session's own read of the browser console log (`element under cursor: RECORDS-ENTITY-LABEL`) plus an inference about what that tag "must" mean — reasonable-sounding, but wrong: the user, looking at the actual rendered page, immediately identified the true meaning ("es la label del objeto"). **Lesson: when a DOM-based inference is built from a console log alone rather than from someone actually looking at the rendered UI, treat the inference as provisional and say so, rather than shipping it with full confidence** — the fix here was one line to correct (the `TAG_TYPE_HINTS` value), but only because the code was structured to make tag→type mapping a single, isolated, swappable entry rather than baked into branching logic.

---

### #28 — Product decision (2026-07-19)
**Tags:** hover, resolution, tooltip-ui  
**Files:** `index-builder.ts`

**Product decision (2026-07-19): this project never shows a "N possible origins" list to the user, full stop — every hover/scan always resolves to exactly one answer, or to "Unknown origin" when there is truly no candidate at all.** This sharpens (doesn't contradict) the "zero false positives" quality bar above: showing several unranked candidates with a "⚠ N possible origins" warning was itself a form of the failure mode that bar exists to prevent — it reads as "we don't actually know," which the product's positioning ("the best tool to understand... with 100% reliability") cannot afford. `resolveText` (`index-builder.ts`) now runs every available signal — tag-type hint (lesson #26), `data-target-selection-name` (lesson #24), page-object relevance (lesson #24) — as a funnel that only ever narrows, never lists, and always returns `candidates.length <= 1`; when no signal fully confirms a single answer, it still commits to the single best-ranked guess rather than surfacing the shortlist, with `highConfidence: false` kept only as an internal/diagnostic signal (visible in the background console log, never in the UI). The `.sti-ambiguity-warning` CSS class and the "N possible origins" tooltip branch were deleted outright rather than left dead, per the project's no-half-finished-features stance. **Practical consequence for future work: every future disambiguation improvement (more `TAG_TYPE_HINTS` entries, PHASE 8's other heuristics) exists to make that single best guess MORE OFTEN CORRECT — never to reintroduce a multi-candidate list as a hedge.** The residual risk this accepts — a best-effort guess can still occasionally be wrong when the underlying text is a genuine, unresolvable collision — is real and was explicitly accepted by the user in favor of always committing to one answer; closing that residual gap further is exactly what PHASE 8's ongoing, evidence-gated tag/attribute heuristics are for.

---

### #29 — `findAttributeUpwards` in `dom-utils.ts` was skipping every same-tree ancestor
**Tags:** hover, resolution  
**Files:** `dom-utils.ts`

**`findAttributeUpwards` in `dom-utils.ts` was skipping every same-tree ancestor: it checked `getRootNode()` FIRST and, since in Lightning virtually every element lives inside some shadow tree, jumped straight from the hovered element to its shadow host — never visiting the element's own parents.** This is why `data-target-selection-name` came back `null` in real-org hover logs even for elements that plausibly had the attribute a few parents up in the same tree, quietly starving `resolveText` of its most reliable signal and forcing everything down to the weak tie-breaks. Fix: `parentAcrossShadow()` — `parentElement` always wins first; the shadow host is only the fallback once the current tree is exhausted (i.e. `parentElement` is null). `maxHops` also raised 6 → 20, since a correct walk now needs to cover Lightning's real nesting depth (the walk is cheap; the old low cap only existed because the broken walk ascended so fast). **Lesson: when an upward DOM walk must cross shadow boundaries, the boundary crossing is the LAST resort at the top of each tree, never the first move — and any "attribute is usually missing" symptom in Lightning deserves suspicion of the walk itself before concluding the attribute genuinely isn't there.**

---

### #30 — The Custom-Label-vs-FieldLabel text collision is resolvable structurally
**Tags:** resolution, picklist, record-type, dom-heuristics, testing  
**Files:** `dom-utils.ts`

**The Custom-Label-vs-FieldLabel text collision is resolvable structurally: a real field label always renders inside a field container, and a Custom Label whose text merely collides with it does not.** Real-org evidence (2026-07-19): free-standing texts "Account" and "Test" — actual Custom Label values — resolved as FieldLabel because same-text fields existed AND lesson #24's page-object tie-break boosted any FieldLabel belonging to the current page's object unconditionally, outranking `TYPE_PRIORITY`'s CustomLabel-first ordering. The fix has three parts, all in the same funnel (`resolveText` + `resolveFieldContext` in `dom-utils.ts`): **(a)** a new `ContextHints.fieldContext` classifies the element's ancestor chain — `"label"` (label side of a record-detail field: classes `slds-form-element__label`/`test-id__field-label`), `"value"` (value side: `slds-form-element__control`/`test-id__field-value`), `"item"` (inside a `records-record-layout-item`/`force-record-layout-item` container without a more specific marker), or `null` (no field container at all); **(b)** `resolveText` narrows on it — `"label"`/`"item"` → FieldLabel candidates, `"value"` → PicklistValue/RecordType (the only metadata that legitimately appears as a field's value; everything else on the value side is record data); **(c)** the page-object boost for FieldLabel/RecordType is now **gated on `fieldContext != null`** — "this field belongs to the page's object" is meaningless as a boost unless the DOM says the text is field-shaped at all, and the unconditional version of this boost was the exact mechanism behind the bug. The generic ObjectLabel page boost was removed outright: its one confirmed rendering (`records-entity-label`, lesson #26) is already handled by `TAG_TYPE_HINTS`. With no DOM evidence at all, `TYPE_PRIORITY` (CustomLabel first) decides — matching the intuition that free-standing text is far more likely a Custom Label than a field label rendered outside any field container. **The field-container marker classes/tags were CONFIRMED against the real org the same day** (user verified the Custom-Label-vs-field distinction now works). Known accepted edge: field labels rendered outside form-element containers (e.g. related-list column headers) get `fieldContext: null` and would lose a text collision against a Custom Label — acceptable for now, revisit with real evidence if it bites.

---

### #31 — Product decision (2026-07-19)
**Tags:** layout, hover, picklist, record-type, tooltip-ui  
**Files:** `content/index.tsx`

**Product decision (2026-07-19): the tooltip only ever appears over metadata the extension positively controls — everything else gets silence, including the old "Unknown origin" fallback, which was removed from the hover UI entirely.** Two mechanisms implement this: (a) no index match → no tooltip at all (`content/index.tsx` bails out before rendering); (b) **allowed-types-per-surface**: each recognized UI surface/context restricts which metadata types can legitimately render there — `button` → WebLink/QuickAction (standard button strings have NO extractable API — verified reasoning: UI API localizes only to the running user's language, and no supported API enumerates arbitrary-language platform UI strings), `navTab` (app navigation bar, `slds-context-bar`/`one-appnav`) → CustomTab/ObjectLabel/CustomApplication, `innerTab` (Details/Related/Activity/Chatter tabs, `role=tab`) → CustomLabel only, field `label`/`item` → FieldLabel, field `value` → PicklistValue/RecordType. When no candidate fits the surface's allowed set, the result is empty → silence. **Critical implementation detail caught by a test: the restriction must run BEFORE the single-candidate early return** — a text field whose stored data collides with exactly one Custom Label would otherwise slip through and resolve. **Real-org bug found the same day (2026-07-19): collapsible layout section headings render INSIDE a `<button>` (`slds-section__title-action` inside `h3.slds-section__title`), so the button surface was silently suppressing every section heading** — fixed with a dedicated `section` surface (allowed type: `LayoutSection` only), detected during the upward walk BEFORE the button flag can win, same during-walk precedence trick as `navTab`. Known accepted false negatives, documented deliberately: a Custom Label used as text inside a custom LWC button suppresses (button surface allows only WebLink/QuickAction); same for custom flexipage tab labels that aren't Custom Labels. The `navTab`/`innerTab`/button markers are SLDS-standard but share lesson #30's PROVISIONAL status until confirmed in this org's hover logs (`hints` JSON now includes `surfaceContext`).

---

### #32 — Metadata coverage expanded to custom buttons (WebLink), quick actions (QuickAction) and page layout section he…
**Tags:** metadata-api, layout, sections, testing

**Metadata coverage expanded to custom buttons (WebLink), quick actions (QuickAction) and page layout section headings (LayoutSection) — all three ride the existing CustomObjectTranslation pipeline** (2026-07-19): the translation zip already contained `webLinks`/`quickActions`/`layouts→sections` blocks (`ARRAY_TAGS` gained `sections` — it was missing, which would have hit the single-element-collapse bug of lesson #12). Base labels: WebLink via Tooling `SELECT Name, MasterLabel, PageOrSobjectType FROM WebLink`, QuickAction via Tooling `QuickActionDefinition` (both graceful-degradation wrapped, keyed `Object.Name`); **LayoutSection needs no base-label API call at all — the `<section>` tag inside the translation file IS the master name and doubles as the base value.** All three are sibling-unlocked in the retrieve package (lesson #15 pattern: `listMetadata` for WebLink/QuickAction/Layout, scoped to in-scope objects by fullName prefix — note Layout fullNames use `Object-Layout Name` with a hyphen, WebLink/QuickAction use `Object.Name` with a dot). Like tabs/apps, these are inherently admin-authored (no Salesforce standard baseline), so no `customizedLanguages` tracking. NOT yet verified against a real org — the sibling-unlock hypothesis for these three types follows the verified lesson #15 pattern but should be confirmed the first time a real org test exercises them.

---

### #33 — Translation Mode v3 (2026-07-19)
**Tags:** translation-mode, tooltip-ui, popup  
**Files:** `tooltip-constants.ts`

**Translation Mode v3 (2026-07-19): the v2 purple rectangles were rejected in real-org use — visually foreign to Salesforce and saturating on dense layouts.** v3 replaces them with quiet, SLDS-toned chips in three user-selectable presets (persisted in `Settings`, editable from a collapsible "Display settings" panel in the popup): `subtle` (default — neutral gray pills, `#f3f2f2` bg / `#e5e5e5` border / `#514f4d` text, fully rounded), `tinted` (per-language pastel pills via a stable hue map, `hsl(h,70%,96%)` bg — unknown languages get a deterministic hash-derived hue so colors never shift between rescans), and `plain` (no pills at all — quiet gray inline text with `·` separators). Two further toggles: show/hide flag emoji, show/hide language codes. The ✎ customized mark stays, smaller (9px). Design principle to preserve in any future iteration: **the chips must read as part of Salesforce's own UI, never compete with it** — small type (10.5px), full-round corners, no saturated colors on the default preset, and the per-language accent only as an opt-in.
    **v3.1 amendments (2026-07-19, same-day real-org feedback):** (a) **country flag emoji do NOT render on Windows** — Chrome on Windows lacks the regional-indicator glyphs, so 🇪🇸 displays as the letters "ES"; every flag usage (tooltip, Translation Mode, popup) was replaced with a small colored dot per language (`langAccent`/`langHue` in `tooltip-constants.ts`, stable hue map + deterministic hash fallback — the same hues the tinted preset uses). Do not reintroduce flag emoji anywhere. (b) A fourth preset, **`stacked` — translations on their own line UNDER the label — is the new default** (it matches the original product vision and saturates dense layouts far less than inline pills; user-confirmed as the preferred style: "más sencillo, más integrado, no molesta tanto"). Implementation note: the stacked badge is `display:flex` (block-level), so it naturally wraps to its own line under the label with zero width hacks. (c) The popup's "Show flags" toggle became "Show language dots" (same `tmShowFlags` storage key, no migration needed); language codes default to ON now since the dot alone doesn't name the language.

---

### #34 — `describeLayout()` + `LocaleOptions` is the master key to the rest of the record page — the same Partner API l…
**Tags:** soap, metadata-api, partner-api, layout, buttons  
**Files:** `describe-api.ts`, `metadata-translations.ts`

**`describeLayout()` + `LocaleOptions` is the master key to the rest of the record page — the same Partner API localization mechanism as lesson #21, applied to layouts** (2026-07-20). One `describeLayout(sObjectType)` call per object per language returns, fully localized into the requested language: **standard AND custom button labels** (`buttonLayoutSection.detailButtons`, each with `name`/`label`/`custom` — the ONLY supported way to read standard "New"/"Edit"/"Delete" labels in an arbitrary language; they exist in no translation-metadata file), **layout section headings** (`detailLayoutSections.heading` where `useHeading=true`), **related list titles** (`relatedLists` with `name`/`label`), and **quick actions** (`quickActionList.quickActionListItems`). Implementation (`fetchLocalizedLayout` in `describe-api.ts`, seeding in `metadata-translations.ts`): entries are seeded per active language exactly like fields — `StandardButton` (new type)/`WebLink`/`LayoutSection`/`RelatedList` (new type)/`QuickAction` — then `CustomObjectTranslation`-derived admin translations are overlaid with `customizedLanguages` tracking (✎). Two structural caveats: (a) **sections have no stable name in describeLayout, only their heading text** — cross-language matching is BY POSITION, valid only when the language's ordered section list has the same length as the base one; (b) **`quickActionName` may already carry an `Object.` prefix** — check before prefixing or keys double up. Cost: objects × languages SOAP calls, run fully in parallel. NOT yet verified against a real org (whether LocaleOptions genuinely localizes describeLayout the way it does describeSObjects) — the `[STI] describeLayout coverage by language: ...` log line is the one-glance check, same pattern as lesson #25's diagnostic.

---

### #35 — A surface-context marker must match the exact UI element it means, not the container that wraps it — the "sect…
**Tags:** layout, hover, picklist, dom-heuristics, sections

**A surface-context marker must match the exact UI element it means, not the container that wraps it — the "section" surface briefly matched the `slds-section` CONTAINER class, which wraps the section's entire field content, so every field inside any layout section walked up into `surfaceContext: "section"`, got restricted to `LayoutSection`, and was suppressed** (real-org regression, 2026-07-20: "picklists and fields outside sections work, fields inside sections are gone" — the hover inspector's bread-and-butter broken by one over-broad class match). Fix: match only the heading classes (`slds-section__title`, `slds-section__title-action`), never `slds-section` itself. **Generalized rule for every future surface marker: prefer the narrowest class/tag that identifies the labeled element itself; matching a layout wrapper one level too high silently converts a narrowing signal into a kill switch for everything inside it** — and the failure mode is invisible in unit tests (the walk is DOM-side), so any new surface marker needs a real-page hover check on BOTH the surface itself AND normal content nested under the same wrapper.

---

### #36 — SOAP `describeLayout` does NOT honor `LocaleOptions` — the localized-layout channel is the REST layouts descri…
**Tags:** soap, partner-api, layout, buttons, sections

**SOAP `describeLayout` does NOT honor `LocaleOptions` — the localized-layout channel is the REST layouts describe (`GET /services/data/vXX.0/sobjects/{obj}/describe/layouts/`) with the `Accept-Language` HTTP header** (real-org evidence, 2026-07-20: all four SOAP describeLayout calls succeeded — coverage `1/1` per language — but every language returned the running user's English labels, and `detailLayoutSections` parsed to 0 sections; `describeSObjects` + `LocaleOptions` localized fine in the same org, so `LocaleOptions` evidently only applies to `describeSObject(s)`, exactly what its documentation literally says). `fetchLocalizedLayout` was rewritten to REST — which also eliminates the whole XML-cardinality class of parsing bugs (JSON arrays are unambiguous) and is the likely fix for the sections-parsed-to-0 symptom. Amendments to lesson #34's model that came from the same log: **(a)** `Accept-Language` takes hyphenated HTTP tags (`nl-NL`, not `nl_NL`); **(b)** related-list "New"-type buttons belong to the RELATED object (`sfdc:StandardButton.Contact.NewContact` on an Account page) and come from `relatedLists[].buttons` in the same describe — parsed into `relatedListButtons` and seeded as that object's `StandardButton`/`WebLink` entries; **(c)** a button INSIDE an `lst-*` related-list card must classify as `button`, not `relatedList` — the walk's `sawButton` flag decides at the `LST-` boundary; **(d)** on Lightning pages with Dynamic Forms the visible sections are FLEXIPAGE field sections (`flexipage_fieldSection` in `data-target-selection-name`), not classic-layout sections — text-matching still works when their names coincide (typical after migration), but flexipage-only section labels are a genuinely separate metadata surface (future work if real orgs diverge); **(e)** platform action buttons OUTSIDE the layout — Follow (Chatter), productivity actions like View Website, activity-panel buttons like Show All Activities — have no per-language API at all and correctly stay silent; **(f)** the Tooling `WebLink` object has no `PageOrSobjectType` column (INVALID_FIELD) — scope through `EntityDefinition.QualifiedApiName`, the same pattern as `FieldDefinition`. Also added a one-glance diagnostic, same spirit as lesson #25's: `[STI] describeLayout localization check (Object.Button): en_US:"Delete" es:"Eliminar" ...` — if all languages print identical labels, localization is broken at the source and nothing downstream can work.

---

### #37 — FINAL, evidence-settled architecture for platform chrome (2026-07-20)
**Tags:** partner-api, layout, resolution, picklist, sections  
**Files:** `src/shared/platform-labels.ts`

**FINAL, evidence-settled architecture for platform chrome (2026-07-20): NO Salesforce API localizes layout/chrome labels into an arbitrary language — the REST `Accept-Language` attempt from lesson #36 ALSO returned identical English for all four languages in real-org testing (`localization check (Account.Edit): es:"Edit" nl_NL:"Edit" en_US:"Edit" fr:"Edit"`), and the REST API's official request-header documentation confirms no language mechanism exists at all.** Combined with LocaleOptions' documented scope (describeSObject(s) only — lesson #36), the complete truth table is: **field/object/picklist standard translations = describeSObjects + LocaleOptions (works, proven); layout/chrome labels in arbitrary languages = no API, full stop.** The architecture that follows: **(a)** `describeLayout` (REST) runs in the org's BASE language only, as an *inventory + base-label* source for buttons/sections/related lists/quick actions — per-language layout fetches were deleted (they burned calls to receive identical English); **(b)** **standard platform strings ship as a curated built-in catalog** (`src/shared/platform-labels.ts`, `PLATFORM_LABEL_ENTRIES`) — legitimate because platform strings are Salesforce's own translations, identical in every org in the world; the catalog both *enriches* layout-seeded `StandardButton` entries (matched by base label, so `Account.Edit` carries es/fr/nl values) and provides *standalone* entries for chrome with no layout identity (Follow, Upload Files, Refresh, Expand All, and the standard record-page tabs Details/Related/Activity/Chatter/News as a new `StandardTab` type); rules inside the file: only genuinely standard strings, only Salesforce's real UI translations, currently curated for es/fr/nl_NL; **(c)** **related list titles get per-language values from the related object's PLURAL LABEL** (describeSObjects data we already have), gated on the base label exactly matching the object's base plural label so admin-renamed lists stay base-only rather than guessed; **(d)** related-list sobjects join the describe scope (`allObjectApiNames`), so related objects' field labels (the Title:/Email:/Phone: labels inside related list cards) resolve too; **(e)** a new "more languages wins" tie-break in `resolveText` prefers the entry that actually carries translations when same-type twins collide. Separately settled by research: **Dynamic Forms / FlexiPage field-section labels are NOT translatable in Salesforce at all** (open IdeaExchange request) — the extension can only ever show their base label via a matching classic-layout section entry; `useHeading` filtering was also removed from section parsing (it dropped real sections — evidence pending on whether that alone explains sections=0, a debug log now prints the raw first-section JSON if still empty).

---

### #38 — Product policy settled + four real-org UX bugs fixed (2026-07-20).
**Tags:** partner-api, layout, translation-mode, hover, tooltip-ui

**Product policy settled + four real-org UX bugs fixed (2026-07-20).** **Policy — the source-of-truth hierarchy for translations, decided with the user after weighing "only show what's extractable from the org" vs. "keep the built-in catalog":** (1) org-extractable data is always the primary source (Tooling/Metadata/Partner APIs); (2) the built-in platform catalog is legitimate ONLY for closed, finite, org-invariant sets — standard buttons and standard tabs, which are Salesforce's own translations, identical in every org, and enumerable ("aquí sí se puede registrar TODOS los que tiene Salesforce"); (3) anything admin-authored (sections, renamed lists, custom anything) comes from the org or stays silent — no guessing, ever. The section-identity mess (classic layout section vs. flexipage section vs. a Custom Label deliberately sharing the same text) is already governed by the surface system: the "section" surface only ever resolves LayoutSection (a colliding Custom Label can't appear there), free-standing text never resolves LayoutSection, and a flexipage-only section that matches no classic-layout entry stays silent — being "completamente al día de todo lo que hace Salesforce" is NOT required because the surface restriction fails closed, not open. **Bug fixes, all real-org reported:** (a) **Translation Mode annotated only the viewport** — `collectTranslatableTargets`' visibility filter was position-gated; now only size-gated (`isRenderable`: width/height > 0), so the whole page (below the fold included) annotates up front, while display:none content (closed menus) still gets picked up by the MutationObserver when it opens; (b) **the hover tooltip could overflow any screen edge** — it now measures itself (`useLayoutEffect` + ref) and clamps horizontally / flips above the cursor on bottom overflow, with a guarded setPos to avoid re-render loops; (c) **Translation Mode chips were unreadable on colored surfaces** (dark text, no background, injected into a blue button) — every preset's chip now carries a near-white translucent background (`rgba(255,255,255,.92)`), imperceptible on white but contrast-guaranteeing on colored surfaces — a hard rule for any future badge styling; (d) **hovering empty space next to a label lost the tag hint** — when `extractOwnText` uses the wrapper-textContent fallback, `descendToTextOwner` now walks down to the element that actually owns the text before computing hints, so the wrapper DIV right of `records-entity-label` resolves identically to the label itself.

---

### #39 — Second bug round on the same features + hold-to-inspect UX (2026-07-20).
**Tags:** shadow-dom, layout, translation-mode, hover, tooltip-ui

**Second bug round on the same features + hold-to-inspect UX (2026-07-20).** Four fixes and one feature set, all real-org driven: **(a) tooltip STILL overflowed / rendered as a tall sliver near the right edge** — root cause: a `position:fixed` box with auto width SHRINKS to fit the space between `left` and the viewport edge, so near the right edge it compressed to one word per line, and the clamping logic then measured that deformed box; fix: `width:max-content` + `max-width:min(320px, calc(100vw - 16px))` keeps the natural size stable regardless of position, letting the clamp actually work. **(b) Translation Mode missed dropdown/popover content (quick actions menu)** — root cause: **mutations inside a shadow root do NOT bubble to a `document.body` MutationObserver** (shadow trees are separate observation scopes); fix: the scan walk now reports every open shadow root it discovers (`collectTranslatableTargets`' `onShadowRoot` hook) and the observer attaches to each (tracked in a per-start `WeakSet`), plus a capture-phase click listener scheduling a quick rescan as belt-and-braces, and the rescan debounce dropped 800ms → 250ms so menus annotate before the user closes them. **(c) the free-text "Account" Custom Label regressed to FieldLabel** — root cause: lesson #37's "more languages wins" tie-break was placed BEFORE type priority, so a 5-language FieldLabel beat the 2-language CustomLabel; fix: ranking is now pageBoost → type rank → language count, where type rank on a recognized surface is **the surface's own allowed-array order** (so `innerTab` prefers StandardTab over a colliding CustomLabel) and on free text is the global CustomLabel-first `TYPE_PRIORITY`; the language-count tie-break only ever picks the richer twin among same-ranked candidates (its original purpose). **(d) Feature: hold-to-inspect + shortcuts** — the hover inspector now activates while holding a configurable key (`Settings.inspectorHotkey`, default `Alt`, `null` = always-on), with a **page-wide magnifier cursor** injected via a `* { cursor: zoom-in !important }` stylesheet while held (a per-element style loses to Salesforce's own cursor rules; the stylesheet doesn't) — released on keyup AND window blur so it can never stick; Translation Mode toggles via a configurable combo (`Settings.tmHotkey`, default `Alt+T`) that flips `translationModeEnabled` in storage so every existing consumer (popup, content, badges) stays in sync for free; both configurable from a new "Shortcuts" popup section with a press-a-key recorder (bare-key mode for the hold key, modifier-combo mode for the toggle; Esc cancels) and a reset-to-defaults action. **Catalog verdict (user question answered honestly): there is NO authoritative, updated, machine-readable source of all Salesforce platform UI translations** — the catalog stays deliberately minimal (common buttons/tabs only); gaps like "Notes & Attachments"/"Partners" related lists should come from the plural-label mapping instead (org data), and if they don't, that's a pipeline bug to fix with logs, not a catalog entry to hand-author. Also hardened `fetchLocalizedDescribes` against one bad entity name faulting the whole batched call: on batch failure it falls back to per-object describes so a single invalid sObject can't take down every standard translation.

---

### #40 — Hold-to-inspect responsiveness rework (2026-07-20)
**Tags:** hover, tooltip-ui  
**Files:** `content/index.tsx`

**Hold-to-inspect responsiveness rework (2026-07-20): the inspector must feel INSTANT — this is a core product bar (speed, quality bar #1), not polish.** Real-org complaint: hovering an element and THEN pressing the key showed nothing (the flow was `mouseover`-driven only, and no mouse event fires on keydown), and the overall feel wasn't immediate. The rework, all in `content/index.tsx`'s new `inspectAt(x, y)` single entry point: **(a)** a passive capture `mousemove` listener tracks the last cursor position, and the inspector keydown fires `inspectAt` there IMMEDIATELY — press-over-element now works without moving the mouse; **(b)** while the key is held, hover resolution has **ZERO debounce** (holding the key IS the explicit request to inspect — the 120ms debounce only applies to always-on mode where casual mouse travel shouldn't resolve constantly); **(c)** re-inspecting the SAME text is a no-op that just cancels any pending clear — the tooltip stays rock-stable while the pointer travels within one element instead of re-rendering and jumping; **(d)** unresolvable spots schedule a grace-period clear instead of clearing instantly, so crossing gaps between labeled elements never flickers; **(e)** a scroll listener re-inspects under the stationary cursor (~80ms debounce) — scrolling moves the page under the pointer without any mouse event, which would otherwise leave a stale tooltip. Design principle to hold: **every input that changes what's under the cursor (mouse move, key press, scroll) must converge on the same immediate `inspectAt` path — event-specific shortcuts or debounces are only allowed when they demonstrably reduce noise, never latency in hold mode.**

---

### #41 — PHASE 6 inline editing (2026-07-20)
**Tags:** tooling-api, metadata-api, picklist, record-type, editing  
**Files:** `types.ts`, `content/index.tsx`

**PHASE 6 inline editing (2026-07-20): scoped to Custom Labels only, by explicit product decision, because the two editable-metadata worlds in this codebase have fundamentally different write paths.** Custom Label translations are standalone Tooling API records (`ExternalString`/`ExternalStringLocalization`) that PATCH/POST individually, no different in kind from any other Tooling API write. Every other type this project resolves (`FieldLabel`, `ObjectLabel`, `PicklistValue`, `RecordType`, `CustomTab`, `WebLink`, `LayoutSection`, ...) lives **inside a `CustomObjectTranslation`/`Translations`/`GlobalValueSetTranslation` XML file** (lesson #6 — these aren't Tooling API objects at all), and the only way to change one value in that file is a full Metadata API `deploy()`: fetch the current file, patch one field, re-zip, base64, `deploy()`, poll `checkDeployStatus`, handle partial failures — a materially different, unbuilt pipeline, not a bigger version of the same PATCH call. Building both in one session risked shipping the second one half-finished (violates the project's no-half-finished-features stance); Custom Label editing is fully production-shaped, the rest is explicitly deferred to a future phase with its own deploy pipeline, gated behind `isEditableLabelType()` in `types.ts` so the tooltip's edit button simply doesn't appear for types it can't actually fulfill.
    **Base-language routing depends on a pre-existing assumption, now load-bearing:** `fetchAllTranslations` (lesson #5) has always seeded a Custom Label's org-default value under the literal key `"en_US"`, regardless of the org's *actual* default language — a simplification nobody had to think about while the key was read-only. Editing makes it load-bearing: `saveCustomLabelTranslation` checks `language === "en_US"` to decide PATCH `ExternalString.Value` (the base record) vs. PATCH/POST `ExternalStringLocalization` (an actual translation row) — the two are different objects with different semantics, and the base language never has (or needs) a localization row. **If a real org whose default language isn't English ever shows the base value being edited through the wrong path, both the seeding code and this routing check need to move together** — this hasn't been tested against such an org.
    **New vs. existing translation rows are distinguished by data already fetched, not by a follow-up query:** `ExternalStringLocalization`'s own `Id` is now captured per language into `LabelEntry.localizationIdsByLang` at load time (previously only `ExternalStringId`, the parent, was read — the row's own Id was never kept because nothing needed to address that specific row before). A language with an Id there PATCHes; a language without one POSTs a new row, and the returned Id is folded back into the in-memory entry so a *second* edit to a language in the same session PATCHes correctly instead of attempting a duplicate POST.
    **A focused, mid-edit `<textarea>` cannot be allowed to disappear out from under the user** — the tooltip already had three independent paths that could tear it down (mouseleave's grace-period clear, window `blur`, the popup's enable/disable toggle), any of which firing mid-keystroke would yank the input out of the DOM. Rather than guard each call site, a single module-level `isEditingActive` flag (set via a `Tooltip` → `CandidateBlock` → content-script callback whenever a row's editor opens/closes) is checked inside `clearTooltip()` itself in `content/index.tsx` — every teardown path already funnels through that one function, so one guard covers all of them by construction instead of by discipline.
    **Save/Cancel buttons need `onMouseDown={(e) => e.preventDefault()}`, a standard but easy-to-miss inline-editing gotcha**: clicking a button next to a focused `<textarea>` fires the textarea's `blur` (as focus moves toward the button) *before* the button's own `click` handler runs — without the guard, a blur-triggered auto-save/cancel would race the button's own action and the button's handler would sometimes act on already-torn-down state. Suppressing the mousedown's default focus-shift keeps focus on the textarea until the click handler explicitly decides what happens.
    **Missing-translation rows are shown for editable entries only, which extends rather than reverses the PHASE 4 product decision that rejected per-row "— not translated —" text** (see PHASE 4 additions above): that decision was about passive clutter — a warning nobody asked for, superseded by Translation Health. Once a row has an actual one-click action attached to it (add the missing translation right here), showing it stops being noise and starts being the entry point to the feature; non-editable types keep the exact old behavior (missing languages simply don't get a row).

---

### #42 — Optimistic concurrency control for edits (2026-07-20, product requirement, non-negotiable for production-readiness)
**Tags:** resolution, editing, concurrency, tooltip-ui  
**Files:** `salesforce-api.ts`, `Tooltip.tsx`

**Optimistic concurrency control for edits (2026-07-20, product requirement, non-negotiable for production-readiness): saving now ALWAYS re-reads the live org value first and compares it to the value the editor started from — never the local cache.** Root problem: the local reverse index can be stale (another user's edit, or this browser's own last refresh) for an arbitrary amount of time, so writing based on "what we last loaded" risked silently clobbering someone else's concurrent change with no trace. `fetchLiveCustomLabelValue` (`salesforce-api.ts`) does a `GET` on the exact record right before `saveCustomLabelTranslation`'s PATCH/POST — `ExternalString.Value` for the base language, `ExternalStringLocalization.Value` by Id for a known translation row, or a scoped SOQL query for a language with no known row yet (confirming one wasn't created concurrently, rather than assuming). A mismatch aborts the write entirely and returns `{ conflict: true, currentValue }` instead of writing — `SaveTranslationRequest.expectedValue` carries the editor's starting value (captured once in `CandidateBlock`'s `editingBaseline` state at the moment "Edit" is clicked, distinct from the live-typed value) all the way from `Tooltip.tsx` through the content script to the background. On conflict, the background folds the real current value back into its own cache (`entry.valuesByLang[language] = result.currentValue`) before responding, and the UI adopts it immediately (`setLocalValues`) with a transient banner explaining why the edit didn't take — "permitir refrescar antes de volver a editar" is satisfied for free since the row already shows the fresh value the moment the conflict is reported, no separate refresh action needed. Cost: one extra GET per save (an explicit, deliberate tradeoff — the correctness guarantee is worth the latency, per the requirement being "obligatorio para considerar production-ready", not optional).

---

### #43 — Hover system replaced end to end (2026-07-20)
**Tags:** translation-mode, hover, editing, tooltip-ui  
**Files:** `Tooltip.tsx`, `content/index.tsx`, `dom-utils.ts`

**Hover system replaced end to end (2026-07-20): hold-to-inspect → click-to-toggle Inspection Mode, and mouseover/mouseout → a single coordinate-driven engine — a redesign, not a patch series, per explicit direction ("no quiero un conjunto de parches").** Four real problems drove this, all fixed by the same underlying architecture change rather than four separate special cases:
    **(a) "The tooltip switches to a nearby element while I'm trying to reach it" (hover ownership).** Fixed geometrically, not by predicting mouse trajectory: `Tooltip.tsx` now reports its own settled `getBoundingClientRect()` up to the content script via a new `onRectChange` prop (fires after every clamp/flip AND after any resize, e.g. opening the inline editor makes the box taller). `content/index.tsx` keeps this as `tooltipRect` and checks it FIRST, before any DOM lookup, in `isWithinTooltipZone()` — a rect expanded by `TOOLTIP_OWNERSHIP_MARGIN_PX` (24px). While the cursor is inside that zone, `handlePointerMove` never retargets, full stop, regardless of what element is technically underneath along the way. A second, exact fallback (`rawEl === shadowHost`) catches the rare case where the rect is one frame stale.
    **(b) "Always Hover sometimes ignores elements, needs exit+re-entry" (detection reliability).** Root cause: native `mouseover`/`mouseout` events, which the old code relied on exclusively, go through Lightning's nested (and sometimes closed) shadow trees and don't fire reliably for every real transition there. Fix: **removed `mouseover`/`mouseout` entirely.** A single `mousemove` listener now drives everything through `handlePointerMove(x, y)`, which calls `deepElementFromPoint(x, y)` (now exported from `dom-utils.ts`) — recomputed straight from coordinates every time, sidestepping shadow-retargeting quirks completely instead of trusting the browser's own "did we enter a new element" computation. A cheap identity check (`rawEl === lastRawElement`) skips ALL further work (text extraction, attribute walks, messaging) when the element hasn't actually changed — this is what keeps a per-mousemove-event architecture cheap despite mousemove firing far more often than mouseover did: most movement lands on the same element as the last check, and those are now near-free.
    **(c) Hold-to-inspect → Inspection Mode (deliberate redesign, not a bug fix): press the configured key once to toggle inspection on — no holding.** The tooltip becomes a stable, fully interactive "pinned" surface: while the mode is on, `inspectAt` NEVER auto-clears on "nothing resolvable under the cursor" (only Always Hover still fades out after `CLEAR_GRACE_MS`) — moving to a genuinely different resolvable element still updates the tooltip (navigation by moving the mouse, the explicit ask), but empty/unresolvable space in between just leaves the last tooltip showing. Exit is multi-path by design: re-press the same key, Escape, clicking anywhere outside the tooltip, or losing window focus — all funnel through one `exitInspectionMode()`. `Settings.inspectorHotkey` keeps its exact existing meaning and storage key (`null` = Always Hover, unchanged) — only the keydown *behavior* changed from hold-while-down to toggle-on-press, so this shipped as a behavior refinement of an existing setting, not a new one.
    **(d) Eliminating stuck/inconsistent states — two real bugs, not hypothetical:** (i) `CandidateBlock`'s `isEditingActive`-reporting `useEffect` had no cleanup function — if the component ever unmounted while `editingLang` was still set (a path that didn't exist before this session but easily could in the future), the content script's `isEditingActive` flag would stay `true` forever, permanently blocking `clearTooltip()`. Fixed by returning `() => onEditingActiveChange?.(false)` from the effect — the standard React fix, and now the correct one to reach for the moment an "active edit" boolean is threaded across a component boundary like this. (ii) A NEW latent stuck-tooltip path this session's other changes could have introduced: `exitInspectionMode()`/`clearTooltip()` correctly no-op while `isEditingActive`, but nothing previously re-evaluated tooltip visibility once editing finished — if the extension got disabled, Translation Mode got toggled on, or Inspection Mode got exited (e.g. via window blur) WHILE an edit was in flight, the tooltip would linger forever with no further event ever able to clear it (the engine being correctly idle is exactly why nothing would trigger a clear on its own). Fixed with `reconcileAfterEdit()` — called once, exactly when `onEditingActiveChange` fires `false` — which just checks `isEngineLive()` and clears if it's no longer true. One general reconciliation step closes every one of these paths at once instead of special-casing each.
    **Design principle established for all future hover work: ownership and mode-exit guards belong in ONE shared function each (`isWithinTooltipZone`, `exitInspectionMode`), never duplicated at each call site** — every place that tried to be clever about "don't clear/retarget in situation X" before this session was exactly where a state bug had been found; centralizing the guard is what makes new call sites safe by construction instead of by remembering.

---

### #44 — Hover text detection now checks actual rendered glyph rects, not just the DOM box
**Tags:** hover, dom-heuristics
**Files:** `dom-utils.ts`

**Real-org complaint (2026-07-20): the tooltip resolved text "by the long side, where the cursor genuinely wasn't over it — the DOM just detected it was."** Root cause: `resolveHoverTarget` trusted `document.elementFromPoint(x, y)` to mean "the cursor is over this element's text," but `elementFromPoint` returns the innermost element at a pixel regardless of whether that pixel is real ink or just padding/line-height/block-level whitespace — a wide label, a full-width table cell, a padded container all have DOM boxes far larger than their visible text. Fix: `isPointOverRenderedText(el, x, y)` builds a `Range` over `el`'s contents and checks `getClientRects()` — the text's actual painted rects (the same mechanism `document.caretRangeFromPoint` relies on internally) — against `(x, y)` with a small (2px) tolerance, called right after `descendToTextOwner` narrows to the real text-owning element. `resolveHoverTarget` now returns `null` (no match) when the cursor is technically within the element's box but nowhere near its rendered glyphs, instead of resolving anyway. Deliberately NOT applied to `collectTranslatableTargets` (Translation Mode's full-tree scan) — that mechanism has no cursor position at all, the fix is specific to point-based hover.

---

### #45 — Tooltip surface is pointer-events:none except its real controls, so it no longer blocks content it covers
**Tags:** hover, tooltip-ui
**Files:** `tooltip.css`, `content/index.tsx`

**Real-org complaint (2026-07-20): "when the tooltip lands on top of another scannable text, it doesn't get scanned — you have to click outside and re-click, or press Escape."** Root cause: `.sti-tooltip` was `pointer-events: auto` across its whole box (needed so its Copy/Edit buttons work), and lesson #43's tooltip-ownership check (`isWithinTooltipZone`) treated the ENTIRE rect+margin as permanently off-limits for retargeting, with no way to reach whatever the tooltip visually happened to be covering short of a hard reset. Fix, two parts: **(a)** `.sti-tooltip` itself is now `pointer-events: none`; `pointer-events: auto` is restored individually on each real control (`.sti-copy-btn`, `.sti-copy-icon-btn`, `.sti-copy-small-btn`, `.sti-edit-input`, `.sti-edit-save`, `.sti-edit-cancel`). Since `elementFromPoint` skips `pointer-events: none` elements entirely, hovering the tooltip's background now "sees through" to whatever real page element is actually there — including a genuinely different, resolvable target, which Inspection Mode correctly treats as "navigate here" per its existing philosophy, instead of that content being permanently unreachable. **(b)** `handlePointerMove`'s ownership check now computes `rawEl` FIRST and only treats it as "stay pinned" via an EXACT identity check (`rawEl === shadowHost`, which — because of (a) — is now only true when literally over a real control) OR the small geometric margin (`TOOLTIP_OWNERSHIP_MARGIN_PX`, reduced **24px → 6px**: with exact identity doing the real work, the margin's only remaining job is smoothing a single frame's pixel-boundary jitter approaching a control, not blocking a whole neighborhood). Side effect, correctly consistent with existing design: since a click on the tooltip's now-pass-through background reaches the real page element underneath, the existing click-outside listener (`e.target !== shadowHost`) naturally treats it as "clicked outside" and exits Inspection Mode / closes the Translation Mode editor — clicking through the tooltip onto real content IS "done with the tooltip, interacting with the page," matching `PRODUCT.md`'s "never interferes with Salesforce's own UI" principle more literally than before. Accepted tradeoff: while moving the mouse toward a specific control, a different resolvable element directly behind the tooltip's background along that path could theoretically cause a brief retarget — judged a much smaller cost than the blocking behavior it replaces, and the same-text no-op check in `inspectAt` already absorbs most of it.

---

### #46 — Translation Mode chips can edit Custom Labels by reopening the hover tooltip's own editor
**Tags:** translation-mode, editing, concurrency
**Files:** `translation-mode.tsx`, `content/index.tsx`, `Tooltip.tsx`

**Product ask (2026-07-20): "Translation Mode doesn't allow editing translations — wouldn't it make sense to let it edit concurrently, using the same logic as the hover tooltip?"** Translation Mode's chips are raw DOM (`buildBadge` in `translation-mode.tsx` — plain `<span>`s with inline styles, no React, no shadow root), architecturally unrelated to the hover `Tooltip` component (a React tree in a closed shadow root). Building a second editing implementation directly in that raw-DOM code would have duplicated everything PHASE 6/#41/#42 already built (concurrency control, keyboard shortcuts, the conflict banner) and required keeping two implementations in sync forever — rejected in favor of **reusing the exact same `Tooltip` component**, just summoned by a click instead of a hover. Mechanism: **(a)** editable (CustomLabel-only, same rule as everywhere else) chips get a trailing "✏", `cursor: pointer`, and a click listener with `stopPropagation`/`preventDefault` (a chip is a real child of an arbitrary Salesforce element — a table cell, a button, a link — so without this, clicking it would ALSO fire the parent's own click behavior); **(b)** `startTranslationMode` gained an optional `onEditRequest: (entry, language, x, y) => void` parameter, threaded through `buildBadge`; **(c)** `content/index.tsx`'s new `openTmEditor` renders the SAME `<Tooltip>` component at the click position with `candidates=[entry]` and the FULL active-language list (so the popover shows every configured language for that entry, not just the one clicked — natural access to sibling languages without reopening) and a new `autoEditLanguage` prop that pre-opens that one language's editor on mount instead of requiring a second click on its own Edit icon. **(d)** `openTmEditor` always renders through a `null` pass first (`host.render(null); host.render(<Tooltip .../>)`) — a `key` on the element passed to `root.render()` has no remount effect (there's no sibling list for it to key against), so without the forced null-render, clicking the SAME chip a second time in a row would update props on the already-mounted instance rather than remount it, and the mount-once `autoEditLanguage` effect would never re-fire. **(e)** A new `tmEditorOpen` flag, independent of `inspectionModeActive` (Translation Mode and the hover engine never run simultaneously, but this needed its own bookkeeping since nothing about it is hover-driven), wired into the same shared exit points established in lesson #43: the click-outside listener, the Escape keydown branch, and `clearTooltip()` itself (which now also resets `tmEditorOpen = false`, so every existing caller of `clearTooltip()` — including Translation Mode being turned off — correctly closes it for free). `openTmEditor`/`closeTmEditor` both guard on `isEditingActive`, same "ownership" discipline as lesson #43: an edit in progress can't be ripped out by a different chip click, and closing can't yank a focused textarea.

---

### #47 — PHASE 5 Navigate to Setup shipped — click the type badge to open Setup
**Tags:** tooltip-ui
**Files:** `tooltip-constants.ts`, `Tooltip.tsx`, `tooltip.css`

Shipped as originally scoped in the roadmap: `setupPath(entry)` (`tooltip-constants.ts`) returns a Setup deep-link path for `CustomLabel` (uses `entry.id`, already captured for PHASE 6 editing — `/lightning/setup/ExternalStrings/page?address=...ExternalString/{Id}/e`, URL-encoded via `encodeURIComponent` since the address query parameter's value itself contains a literal `#`), `FieldLabel`, and `ObjectLabel` (both standard Object Manager routes). Every other type returns `null` — no guessed URL pattern — and the badge simply isn't clickable for those, consistent with "silence over a wrong answer." The badge gets `pointer-events: auto` (an exception to lesson #45's tooltip-wide `none`) only when a URL exists, `cursor: pointer`, a "↗" hint, and an `onClick` that calls `window.open` at `${window.location.origin}${path}` — a new tab to the SAME org's own Setup, non-destructive, explicitly user-initiated. **NOT yet verified against a real org — the CustomLabel URL pattern specifically** (the Object Manager routes for FieldLabel/ObjectLabel are much more standard/commonly relied upon and lower-risk); confirm the Custom Label deep link actually opens the edit page before trusting it blindly.

---

### #48 — PHASE 14 Copy SOQL / Copy XML Member shipped for confidently-mapped types only
**Tags:** tooling-api, metadata-api
**Files:** `tooltip-constants.ts`, `Tooltip.tsx`, `tooltip.css`

Of the five "Copy X" ideas under PHASE 14, only two were built: **Copy SOQL** (`copySoql`) and **Copy XML Member** (`copyXmlMember`). "Copy Metadata Name" and "Copy Full Path" were deliberately skipped — reviewing the original backlog text, both would copy the exact same string `entry.apiName` already produces (shipped since PHASE 4's "Copy API Name"), so building them would have shipped confusing, redundant buttons rather than new value, against `PRODUCT.md`'s "never dump actions just because available" principle. `copySoql` reuses the EXACT field/object names already relied upon by the corresponding fetch query in `salesforce-api.ts` for every type it covers (CustomLabel, FieldLabel, ObjectLabel, RecordType, CustomTab, CustomApplication, WebLink, QuickAction) — never a newly-invented query shape — and returns `null` for types with no single queryable row (`PicklistValue` is part of a field's describe, not its own record; `StandardButton`/`LayoutSection`/`RelatedList`/`StandardTab` are platform/layout sub-elements). `copyXmlMember` maps `LabelType` → real Metadata API component type name (`CustomField`, `CustomObject`, `RecordType`, `CustomTab`, `CustomApplication`, `WebLink`, `QuickAction`) and returns a `<types>` block — **deliberately excludes `CustomLabel`**: `CustomLabels` is Salesforce's metadata type for the label bundle as a WHOLE (one file, `<members>*</members>`), individual labels are not separately addressable members, so a single-label XML snippet would be misleading, not just incomplete — getting this wrong would hand the user a snippet that silently fails to deploy correctly, exactly the wrong-guess class this project's quality bar exists to prevent. Both actions render as small labeled buttons (`CopySmallButton`, "SOQL"/"XML") next to the existing Copy API Name button, only when applicable (conditionally `null`), relying on the header's existing `flex-wrap` to avoid layout breakage rather than a new layout mechanism.

