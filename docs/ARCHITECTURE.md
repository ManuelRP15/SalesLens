# Architecture

> Part of the STI doc set — start at [../CLAUDE.md](../CLAUDE.md) if you landed here
> directly. **Read this in full before any Epic or architecture/refactor session; grep
> it for a targeted bug fix.** This is the HOW. `PRODUCT.md` is the WHY, `ROADMAP.md` is
> the WHAT'S NEXT, `DECISIONS.md` is the log of every non-obvious "why did we build it
> this way" moment referenced throughout this file as `#N`.

## Tech stack

TypeScript + React 18 + Vite 5 + `@crxjs/vite-plugin` v2 beta. Manifest V3 (Chrome,
Edge, Brave, Arc, Vivaldi). No external UI framework. Vitest for unit tests. `fflate`
(zip decompression) + `fast-xml-parser` (pure-JS XML parsing) — needed because the
Metadata API's `retrieve()` returns a base64 zip of XML files, and the background
service worker has no DOM (`DOMParser` isn't available there).

```json
permissions: ["storage", "activeTab", "cookies", "tabs"]
host_permissions: ["*.lightning.force.com/*", "*.my.salesforce.com/*", "*.salesforce.com/*"]
```

## File map

One line per file — its job, not its implementation. Update this table in the same
turn you add, remove, or repurpose a file (`WORKFLOW.md`'s doc-ownership rule).

### `src/shared/` — platform-agnostic, importable from background AND content

| File | Responsibility |
|---|---|
| `types.ts` | Every shared type: `LabelEntry`, `LabelType`, `Settings`, all `chrome.runtime` message request/response shapes, `isEditableLabelType()`. |
| `normalize.ts` | Text normalization (`normalizeText`/`normalizeTextLoose`) used to build and query the reverse index. |
| `index-builder.ts` | `buildReverseIndex()` + `resolveText()` — the disambiguation funnel. The single most important algorithm in the project; always returns 0 or 1 candidates, never a list (`DECISIONS.md #28`). |
| `index-builder.test.ts` | Unit tests for the funnel above — no Chrome/Salesforce dependency. |
| `salesforce-api.ts` | Tooling API + regular REST Query API: Custom Labels (`ExternalString`/`ExternalStringLocalization`), field/object/tab/app/webLink/quickAction base labels, and the CustomLabel write path (`saveCustomLabelTranslation`, `fetchLiveCustomLabelValue` for optimistic concurrency). |
| `metadata-api.ts` | Metadata API SOAP client (`listMetadata`/`retrieve`/`checkRetrieveStatus`) + zip/XML parsing of `CustomObjectTranslation`/`Translations`/`GlobalValueSetTranslation`. |
| `metadata-api.test.ts` | Unit tests for the XML/zip parsing above. |
| `metadata-translations.ts` | Orchestrator: seeds `FieldLabel`/`ObjectLabel`/`PicklistValue`/etc. from `describe-api.ts`'s standard translations, overlays `CustomObjectTranslation` zip content as customized overrides. |
| `describe-api.ts` | Partner API SOAP client (`describeSObjects` + `LocaleOptions`, `describeLayout` via REST): Salesforce's own standard/default translations, independent of any org customization. |
| `platform-labels.ts` | Curated built-in catalog of standard Salesforce platform UI strings (buttons, tabs) in es/fr/nl_NL — legitimate ONLY because these are Salesforce's own translations, identical in every org (`DECISIONS.md #37`). Never add anything admin-authored here. |
| `mock-data.ts` | Sample `LabelEntry[]` used when there's no real org session (dev/no-`sid` fallback). |

### `src/content/` — injected into `*.lightning.force.com/*` pages

| File | Responsibility |
|---|---|
| `index.tsx` | The hover engine (mousemove-driven, Inspection Mode / Always Hover, tooltip ownership zone — `DECISIONS.md #43`), mounts the tooltip, wires Translation Mode on/off, `SAVE_TRANSLATION` messaging. |
| `dom-utils.ts` | `deepElementFromPoint`/`extractOwnText` (hover), `resolveFieldContext`/`resolveSurfaceContext` (DOM-structure disambiguation hints), `collectTranslatableTargets` (Translation Mode's full-tree scan). |
| `Tooltip.tsx` | The tooltip React component — display, inline Custom Label editor, Copy buttons, reports its own rect via `onRectChange` for the hover-ownership zone. |
| `tooltip.css` | Styles injected into the closed Shadow DOM. |
| `tooltip-constants.ts` | `TYPE_LABELS`/`TYPE_COLORS`/`langAccent`/`displayApiName` — shared visual language between `Tooltip.tsx` and `translation-mode.tsx`. Also `setupPath`/`copySoql`/`copyXmlMember` — per-type generators for the tooltip's Setup-navigation and Copy SOQL/XML actions (PHASE 5/14), each returning `null` rather than guessing when a type has no confident mapping. |
| `translation-mode.tsx` | Translation Mode: bulk DOM scan, `RESOLVE_TEXTS_BULK`, inline translation chips appended directly to matched elements (real DOM injection, fully reversible on toggle-off). |

### `src/background/` — the MV3 service worker

| File | Responsibility |
|---|---|
| `index.ts` | Owns the reverse index (`allEntries` + `ReverseIndex`, persisted to `chrome.storage.local`), cookie/session handling, all `chrome.runtime.onMessage` routing (`LOAD_LABELS`, `RESOLVE_TEXT`, `RESOLVE_TEXTS_BULK`, `GET_SETTINGS`, `SAVE_TRANSLATION`), Translation Health computation. |

### `src/popup/` and `src/health/` — extension UI surfaces

| File | Responsibility |
|---|---|
| `popup/Popup.tsx` | Enable toggle, Translation Mode toggle, language selector, Shortcuts (hotkey recorder), Display settings, refresh button, link to Translation Health. |
| `health/Health.tsx` | Dedicated page (`chrome.tabs.create`): per-language missing-translation table, computed by the background on every index refresh. |
| `popup/main.tsx`, `health/main.tsx`, `*/index.html` | Standard React mount points — no logic. |

### Root config

`manifest.config.ts` (permissions, host_permissions, entry points), `vite.config.ts`
(build entries — anything opened via `chrome.tabs.create` rather than the manifest
directly, like `health/index.html`, must be listed here too, see `DECISIONS.md #20`),
`tsconfig.json`, `package.json`.

## Data flow

```
Content Script (Lightning page context)
  │
  ├─ On load: LOAD_LABELS → background, with window.location.origin + guessed page object
  ├─ Hover engine (Inspection Mode / Always Hover, DECISIONS.md #43):
  │     resolves whatever's under the cursor → RESOLVE_TEXT → background → renders tooltip
  ├─ Translation Mode: full-page scan → RESOLVE_TEXTS_BULK → background → inline chips
  ├─ Inline editor (Custom Labels only): SAVE_TRANSLATION → background → live UI update
  └─ Listens for REQUEST_REFETCH (popup's "Refresh index now")

Background Service Worker
  │
  ├─ LOAD_LABELS: page origin → API host → sid cookie → in parallel:
  │     • fetchAllTranslations (Tooling API): Custom Labels
  │     • fetchMetadataTranslationEntries (Metadata + Partner APIs): everything else
  │   → merges into one LabelEntry[], rebuilds the reverse index, persists to storage,
  │     recomputes Translation Health
  ├─ RESOLVE_TEXT / RESOLVE_TEXTS_BULK: reverse-index lookup → resolveText() → candidates
  ├─ SAVE_TRANSLATION: live-value conflict check → PATCH/POST → folds result back into
  │     the same in-memory index + storage (no separate "apply this edit" path)
  └─ GET_SETTINGS: reads chrome.storage.local

Popup
  └─ Every toggle/setting writes straight to chrome.storage.local; content script and
     background both listen via chrome.storage.onChanged — no direct messaging needed
     for settings.
```

## Non-negotiable rules

Breaking any of these breaks the product, not just one feature. Each has already cost a
real debugging session at least once (see the linked `DECISIONS.md` entry).

1. **All Tooling/Metadata API fetches happen in the background**, never the content
   script — cross-origin fetch with an Authorization header triggers a CORS preflight
   that the content script can't satisfy (`DECISIONS.md #2`). Destination host is always
   `*.my.salesforce.com`, never `*.lightning.force.com` (`#1`).
2. **The `sid` cookie is read only in the background**, via `chrome.cookies.get()` — the
   only context with access to HttpOnly cookies (`#3`). Requires "Lock sessions to the
   domain" disabled in the target org (`#4`).
3. **The tooltip mounts in a closed Shadow DOM** (`mode: "closed"`) so it never
   interferes with Lightning Design System styles.
4. **The reverse index lives in the background**, persisted to `chrome.storage.local`
   and restored on every service-worker wake-up — MV3 kills idle workers in well under
   2 minutes, and a module-level variable alone silently reverts to mock data
   (`#17`). The content script only ever triggers `LOAD_LABELS`/`RESOLVE_TEXT`.
5. **`resolveText` never returns more than one candidate.** Every signal (DOM hints,
   surface context, tag-type hints) narrows a funnel toward exactly one answer or
   silence — never a ranked, unresolved shortlist (`#28`). This is a product rule as
   much as a technical one; see `PRODUCT.md`'s Quality Bars.
6. **Every Metadata API / SOAP call degrades gracefully** (`[]`/`null`/empty `Map`, logs
   a `console.warn`, never throws to its caller) — one missing permission or an org
   without Translation Workbench can't break Custom Labels or anything else unrelated.
7. **Base (master) labels are always fetched separately from translated ones** — the
   Metadata API only ever returns the *translated* value; the base value needs its own
   tightly-scoped Tooling/REST query, limited to exactly the API names already
   discovered via `listMetadata` (`#9`).
8. **Editing is scoped to Custom Labels only.** Their translations are standalone
   Tooling API records (PATCH/POST-able individually). Every other `LabelType` lives
   inside a `CustomObjectTranslation`/`Translations`/`GlobalValueSetTranslation` XML
   file, only writable via a full Metadata API `deploy()` — a materially different,
   unbuilt pipeline (`#41`). Don't add an edit affordance for another type without
   building that pipeline first.
9. **Every translation write does optimistic concurrency control** — re-read the live
   org value immediately before writing, abort (don't overwrite) on mismatch (`#42`).
   Non-negotiable for any future write path too, not just this one.
10. **The `sti-` UI (tooltip, Translation Mode chips) never leaves a permanent trace.**
    Hover mode is inert by construction (closed Shadow DOM). Translation Mode's inline
    chip injection is the one deliberate exception — it touches Salesforce's real DOM —
    but stays inside this rule because `removeAllBadges()` strips every injected node
    the instant the mode toggles off. Any future DOM-injecting feature must keep that
    same guarantee.

## Capabilities at a glance

Full detail and status (done/pending/untested) for each of these lives in
`ROADMAP.md`, filed under the PHASE number linked below — this list is a map, not a
duplicate of that detail.

- **Hover Inspector** (PHASE 4/7) — tooltip with type, API name, translations.
- **Inline editing** (PHASE 6, Custom Labels only) — edit in the tooltip, optimistic
  concurrency, keyboard-first (Enter/Esc/Ctrl+S).
- **Translation Mode** (PHASE 9) — whole-page inline translation chips.
- **Translation Health** (PHASE 10) — dedicated page, org-wide missing-translation
  report.
- **Inspection Mode + Always Hover** (hover activation modes, `DECISIONS.md #43`) — see
  also PHASE 17 (Keyboard-First) for planned extensions.
- Metadata types resolved: Custom Labels, Field/Object/Picklist/RecordType labels
  (standard + customized), Custom Tabs/Apps, Buttons (standard + custom), Quick
  Actions, Layout Sections, Related Lists.

**Standing limitation:** standard-translation coverage for Field/Object/Picklist labels
requires the object to be either already known via `CustomObjectTranslation` history
or the object of the page currently being viewed (`pageObjectApiName`, guessed from the
URL — `DECISIONS.md #23`). An object the user has never visited and never customized
via Translation Workbench won't have been described yet — not a hard limitation, just
not proactively fetched ahead of time.

## Operational notes

- In the target org, **Setup → Session Settings → disable "Lock sessions to the domain
  in which they were first used."**
- `manifest.config.ts` includes `*.my.salesforce.com/*` in `host_permissions` — required
  for the background to fetch without CORS.
- The content script is only injected into `*.lightning.force.com/*`, never
  `*.my.salesforce.com/*`.
- Debug logs carry the `[STI]` prefix — filter by it in DevTools.
- Service worker: `chrome://extensions` → "Inspect views: service worker". Content
  script: F12 on the Salesforce tab.
- All source comments, identifiers, docs, and UI-facing strings are in English, always
  — regardless of the language used in conversation.
