# Roadmap

> Part of the STI doc set — start at [../CLAUDE.md](../CLAUDE.md) if you landed here
> directly. Decisions referenced as `#N` live in [DECISIONS.md](DECISIONS.md). **What's
> active right now lives in [CURRENT_STATE.md](CURRENT_STATE.md), not here** — this file
> is the backlog/history, not the session-to-session state.
>
> Read this in full only when scoping a new Epic or reprioritizing. Otherwise, jump
> straight to the phase you need via the table below or a heading search.

## Status at a glance

| # | Phase | Status | Priority (if pending) |
|---|---|---|---|
| 4 | Tooltip productivity actions + reliability | ✅ done | — |
| 5 | Navigation to Setup | ✅ done (CustomLabel URL + custom-field Id-based URL both unverified) | — |
| 6 | Inline translation editing | ✅ v1 (Custom Labels) + 6b (8 more types via deploy()) done | 6c (ObjectLabel/RelatedList caseValues) pending |
| 7 | Standard labels without Translation Workbench | ✅ done | — |
| 8 | Metadata-type detection + Metadata Lens | 🟡 detection heuristics done, Lens pending | — |
| 9 | Translation Mode | 🟡 v4 done (display + Custom Label editing) | — |
| 10 | Translation Health | 🟡 v1 done, QA Report v2 pending | — |
| 11 | Language config UI + Quick Compare | ⬜ pending | — |
| 12 | Advanced Metadata Inspector | ⬜ pending | — |
| 13 | Smart Search | ⬜ pending | — |
| 14 | Productivity Actions | 🟡 Copy SOQL/XML done, export pending | — |
| 15 | Dependency Inspector | ⬜ pending | ⚠️ feasibility unconfirmed |
| 16 | Workspace / Metadata Basket / package.xml Builder | ⬜ pending | **Muy Alta** |
| 17 | Keyboard-First Experience | 🟡 Enter-to-edit shipped; save/cancel already worked; navigation + more hotkey config pending | **Muy Alta** |
| 18 | Translation Navigator & Page Coverage | ⬜ pending | Alta |
| 19 | Hover History & Favorites | ⬜ pending | Alta |
| 20 | Open in VS Code | ⬜ pending | ⚠️ needs a Native Messaging host — architecture decision first |
| 21 | Team Mode | ⬜ pending | ⚠️ needs a shared backend — architecture decision first |
| 22 | Plugin Architecture | ⬜ pending | long-term, not before PHASE 12 is underway |

## Product roadmap

### PHASE 4 additions — tooltip productivity actions + reliability fix (done)
First pass shipped a "Show all languages" tooltip toggle and inline "— not
translated —" text. Real-org feedback rejected both: the toggle didn't belong on a
transient hover tooltip (superseded by Translation Mode, PHASE 9), and missing
translations should be tracked globally, not spelled out per row (superseded by
Translation Health, PHASE 10). What actually shipped and stayed:
- **Copy API Name** button on each candidate block. Making it *reachable* required a
  real fix: the tooltip has `pointer-events: auto` and `content/index.tsx` no longer
  clears on the first `mouseout` — it schedules a clear after a ~300ms grace period
  (`scheduleClear`/`cancelScheduledClear`), which `shadowHost`'s `mouseenter` cancels
  once the pointer visually reaches the tooltip (closed shadow DOM retargets events
  from inside it to the host element for outside listeners). The previous
  `relatedTarget`-chasing approach only worked for the *exact last* element before the
  tooltip; any intermediate hop broke it. The grace-period approach doesn't care what's
  in between.
- **Field data type badge** — `FieldLabel` entries now carry `dataType` (from
  `FieldDefinition.DataType`, added to `fetchFieldLabels`'s existing SELECT), shown
  next to the type badge (e.g. "Field · Picklist").
- **Background state persistence (reliability fix)** — the reverse index used to live
  only in a module-level variable, so every time Chrome killed the idle MV3 service
  worker (roughly every ~2 minutes of inactivity in practice), it silently reset to
  mock data until a manual popup refresh re-triggered `LOAD_LABELS`. Fixed by
  persisting the computed `LabelEntry[]` to `chrome.storage.local` (`cachedEntries`)
  and restoring from it immediately on module load — no keepalive hacks, just closing
  the gap left by the normal MV3 lifecycle.

### PHASE 5 — Navigation to Setup (Metadata Navigation) — done
Shipped 2026-07-20. Clicking the tooltip's type badge opens the corresponding Setup URL
in a new tab, for `CustomLabel`, `FieldLabel`, and `ObjectLabel` — other types have no
guessed URL and stay non-clickable. See `DECISIONS.md #47` for the exact paths and
`setupPath()` in `tooltip-constants.ts`. **The CustomLabel URL specifically is NOT yet
verified against a real org** — confirm it before relying on it.

**2026-07-20 stabilization session:** real-org testing found the FieldLabel route gave
"Insufficient Privileges" for every custom field — fixed by routing custom fields
through their real `CustomField` Id instead of API name (`DECISIONS.md #51`); standard
fields are unchanged. **The custom-field Id-based route is also NOT yet verified
against a real org** — confirm it the same way the CustomLabel URL still needs
confirming.

### PHASE 6 — In-place translation editing (Inline Translation Editing) — v1 (Custom Labels) + 6b (8 more types) done
Shipped 2026-07-20 as an inline editor inside the existing hover tooltip (not a side panel
or modal — that original idea was superseded by something more directly integrated into
the flow): a "✏" button per language row swaps it for an auto-focused, auto-growing
`<textarea>`, saved via button/Enter/Ctrl+S or blur-with-changes, cancelled via
button/Escape/blur-without-changes. PATCHes/POSTs `ExternalString`/`ExternalStringLocalization`
directly from the **background** (same rule: `host_permissions`, no CORS), then folds the
result straight back into the live reverse index. Full implementation detail and the
key architecture decisions (scope, base-language routing, the mid-edit tooltip-teardown
guard, the blur/click race fix) are in lesson #41 — read it before touching this code.
**Hardened to production-ready the same day (lesson #42): every save now does optimistic
concurrency control** — the background re-reads the live org value immediately before
writing and aborts instead of overwriting if it no longer matches what the editor started
from, surfacing the real current value in the UI instead of silently clobbering a
concurrent change.

**PHASE 6b (2026-07-21): the deploy() pipeline scoped out of v1 is now built.**
`FieldLabel`, `RecordType`, `WebLink`, `QuickAction`, `LayoutSection`, `PicklistValue`
(both field-scoped and global-value-set), `CustomTab`, `CustomApplication` are all
editable through the exact same tooltip editor now, via a new write path
(`metadata-write.ts`'s `saveMetadataTranslation`) that retrieves the one relevant XML
file, patches or inserts the target node using a lossless `preserveOrder` XML
round-trip, and deploys it — full design, the sibling-unlock (lesson #15) correctness
requirement, and the safety reasoning behind every non-obvious choice are in
`DECISIONS.md #53`. **Two types stay deferred (`ObjectLabel`, `RelatedList` — their
target, `<caseValues>`, needs safe multi-grammatical-case handling first — tracked as
PHASE 6c) and two are PERMANENTLY non-editable (`StandardButton`, `StandardTab` —
Salesforce's own platform-controlled translations, not admin-authored content).**
**Real-org UNVERIFIED** — this is a genuine metadata write, confirm on a sandbox org
before trusting it broadly.

Also not in this v1: real-time on-page text replacement after saving (the original spec's
"live preview") — skipped because editing usually targets a language OTHER than the one
currently rendered on screen, so there's often no matching on-page text to replace at all,
and unlike everywhere else in this project, mutating Salesforce's real page DOM outright
(vs. Translation Mode's reversible badge injection) has no clean undo. The tooltip's own
displayed value, the background's index, and the persisted cache all update immediately
instead — see "What works" above.

**Backlog additions (2026-07-20 roadmap review):**
- **Keyboard-first save flow**: Enter to open the editor on the currently inspected element, Ctrl+S to save, Esc to cancel/close — same modifier-combo recorder infrastructure as `Settings.inspectorHotkey`/`tmHotkey` (lesson #40), extended rather than rebuilt (see PHASE 17).
- **Pre-save validation**: length limits, special-character/encoding checks, and duplicate-value warnings before the PATCH/POST fires — client-side only, no new API calls; needs the field's actual length constraint (already queryable via `FieldDefinition`, same source as the PHASE 8 Metadata Lens length column) rather than a guessed limit.
- **Smart Suggestions (bulk apply)**: when the same source value is being edited and the reverse index shows the identical string used as the base value for other entries too, offer "the same translation exists in N other places — apply the same edit there?" as a single-step confirmation, never an automatic bulk edit; only offered across entries of the same `LabelType`+language, to avoid conflating unrelated metadata that merely collides in text (the same discipline as lesson #30's collision handling).
- **Undo**: this phase's own per-edit undo is superseded by the org-aware **Safe Undo** mechanism in PHASE 16 (Workspace) — don't build a separate local-only undo here; the editor should record every edit into the Workspace as it happens, and Undo is offered from there.
- **PHASE 6c — `ObjectLabel`/`RelatedList` editing** (added 2026-07-21, deferred out of PHASE 6b): needs a safe patch-or-refuse strategy for `<caseValues>` when a language has multiple grammatical-case entries (German, Slavic...) — `FieldLabel`/`RecordType` already refuse cleanly via `assertNoGenderedCase` (`metadata-write.ts`) rather than risk corrupting the other cases; the object's own label needs the equivalent, then `RelatedList` (whose displayed value is derived from the same node one hop removed) can ride on it. Not urgent — no real-org pressure for it yet, unlike the 8 types PHASE 6b just shipped.

### PHASE 7 — Standard object/field labels without Translation Workbench (done)
Originally scoped as "out of scope entirely" — wrong. Real-org feedback ("standard fields always show Unknown Origin") forced a proper investigation, and there IS a metadata-driven source that works regardless of whether Translation Workbench/Rename Tabs and Labels has ever been touched: the **Partner API's `describeSObjects()` call with a `LocaleOptions` header** (`src/shared/describe-api.ts`) — this returns object/field/picklist-value labels translated into ANY language via Salesforce's own out-of-the-box professional translations, independent of the running user's own language and independent of any admin customization. See lessons #16, #21 and #25 below for the full mechanism, the endpoint bug that blocked it entirely until 2026-07-19, and how it combines with the `CustomObjectTranslation`-derived admin overrides from PHASE 4.

### PHASE 8 — Improved metadata-type detection + Metadata Lens
Two related tracks under one phase: detecting *what* an element is more reliably, and
showing *more* about it once known.

**Detection heuristics** for when there's no `data-target-selection-name`:
- ✅ **Tag-name-based detection is now real, not speculative** (lessons #26–#28,
  2026-07-19): `resolveText` recognizes `<records-entity-label>` as the object's
  own label and narrows straight to the `ObjectLabel` candidate. This is the
  validated pattern going forward for this whole bullet list:
  `ContextHints.elementTagName` already carries `element.tagName` through both
  the hover path and Translation Mode's scan, so adding another confirmed tag is
  a one-line addition to `TAG_TYPE_HINTS` in `index-builder.ts` — but **only on
  the same evidence bar**: real DOM output from an actual org, ideally confirmed
  by looking at the rendered page rather than inferred from the tag's name alone
  (lesson #27 — the first guess at what this specific tag meant was wrong).
- ✅ **Field-container context detection** (lesson #30, 2026-07-19, PROVISIONAL
  pending real-org marker confirmation): `resolveFieldContext` in `dom-utils.ts`
  classifies every hovered/scanned element as sitting on the label side, value
  side, or generic inside of a field container — or in none at all — and
  `resolveText` narrows on it (label/item → FieldLabel; value → PicklistValue/
  RecordType; none → no page-object boost for fields, so free-standing text
  defaults to CustomLabel via TYPE_PRIORITY). This is what fixed the real-org
  "Custom Labels 'Account'/'Test' reported as fields" bug. The page-object
  tie-break for FieldLabel/RecordType is now gated on this evidence.
- ✅ **Shadow-DOM upward walk fixed** (lesson #29, 2026-07-19):
  `findAttributeUpwards` no longer skips same-tree ancestors, so
  `data-target-selection-name` is actually found when present — expect
  `targetSelectionName` to be non-null far more often in hover logs now.
- Still open, same "confirm against a real org first" bar: URL patterns
  (`/lightning/r/{ObjectName}/` → probably an ObjectLabel in the header), other DOM
  attributes (`data-field-api-name`, `data-record-id`, `data-object-api-name` —
  used by Aura), `<lightning-formatted-text>` inside a field → probably a
  FieldLabel.
- Extend coverage to buttons, LWC- and Aura-specific components (Advanced Metadata Inspector).
- Per the "zero false positives" quality bar and the "never show a possible-origins
  list" product decision (lesson #28) above: every new heuristic here must narrow
  the single best guess, or fall back to "Unknown origin" — never widen back out
  into a multi-candidate list.

**Metadata Lens** (2026-07-19 product review, ⭐⭐⭐⭐⭐ potential): once a field is
identified with confidence, the tooltip should optionally show the technical detail
that today requires opening Object Manager — without cluttering the default view (see
"never dump information just because it's available" in `PRODUCT.md`'s Value
proposition; this is likely an opt-in expanded state, not the default hover card):
- Field length / precision
- Data type (already shown as a badge since PHASE 4 — extend, don't duplicate)
- Required / Unique / External ID flags
- Formula definition (read-only display, for formula fields)
- Help text (`FieldHelp` — not yet wired up; would reuse the same `CustomObjectTranslation` parser)
- Picklist value set membership (global vs. local)
- Created By / Last Modified (audit fields — `CreatedBy.Name`/`LastModifiedDate`, already exposed on most Tooling API metadata objects, no new query shape)
- Namespace / managed package origin (`NamespacePrefix`) — this is the concrete implementation of MVP capability #1's still-open "namespace display" item above
- ⚠️ Deployment status — no confirmed Tooling API field for this on the metadata types in scope; needs verification before promising it, don't ship a guess

Mechanically this is mostly additional columns on the existing `FieldDefinition` /
`EntityDefinition` Tooling API queries already made in `salesforce-api.ts` (`fetchFieldLabels`
et al.) — no new API surface, just a richer `LabelEntry` shape and tooltip layout.

**Also not implemented, deliberately low priority:** `ValidationRule` error messages
(same `CustomObjectTranslation` parser would cover it, just not wired up) and
`QuickAction`/`WebLink`/`WorkflowTask`/`ReportType`/`Scontrol`/`FlowDefinition` labels
beyond what's already covered — these are rarely plain hover-able text (mostly
buttons/icons already handled elsewhere), low value for the effort; the retrieved zip
already contains them (see `ARRAY_TAGS` in `metadata-api.ts`) if that changes.

**"Why Am I Seeing This?" provenance trace (2026-07-20 roadmap review, backlog idea #12):** an optional expanded tooltip view showing the chain that led to the resolved answer — e.g. hovered text → FieldLabel → CustomFieldTranslation → object → current Lightning Record Page. Feasibility is good: `resolveText`'s funnel (lessons #24/#26/#28/#30) already computes every signal used to reach the single answer (`surfaceContext`, `fieldContext`, `elementTagName`, page-object boost) — this feature is purely about **surfacing data already computed internally**, not collecting anything new. Useful both for debugging ambiguous cases and for building user trust in the single-answer policy (lesson #28).

### PHASE 9 — Translation Mode (done, v2 — inline badges)
Toggle in the popup (`Settings.translationModeEnabled`, mutually exclusive with the
hover tooltip — turning it on suppresses `handleMouseOver` entirely). Implementation
in `src/content/translation-mode.tsx` + `dom-utils.ts`'s `collectTranslatableTargets`.

**v1 used floating overlay cards positioned via `getBoundingClientRect()` in a second
shadow root, deliberately avoiding touching Salesforce's own DOM. Real-world testing
rejected it**: on a dense Lightning page the manually-computed positions overlapped
constantly, and a detached floating card has no strong visual link to the element it
annotates. v2 pivots to **inline injection right into the matched element** instead:
- A full-tree walk (including *open* shadow roots; LWC/Aura components use open ones,
  unlike our own closed extension roots) collects every element with its own direct
  text (deliberately stricter than the hover path's `extractOwnText`: no "wrapper
  fallback to full textContent", which in a full-tree walk would make a wrapper and
  its child both report the same text and produce duplicate badges),
  viewport-visibility filtered.
- All collected texts go through **one bulk message**, `RESOLVE_TEXTS_BULK`
  (background just maps the existing `resolveText` over each item — no new matching
  logic), instead of one `sendMessage` per on-screen element.
- For each match, a small `<span data-sti-injected="true">` is **appended as the last
  child of the real matched element** — a chip per active language (flag + value),
  inline-styled directly (no separate stylesheet, since this lives outside our shadow
  roots in Salesforce's own DOM). Being real sibling content right next to the
  original text is what makes "which field this belongs to" obvious — the tradeoff for
  giving up the "we never touch the page DOM" guarantee.
- Because it's normal document flow, **no manual positioning, no scroll/resize
  listeners are needed at all** — that whole class of bugs (overlap, drift) goes away
  by construction.
- A `Map<Element, HTMLSpanElement>` tracks each element's own badge so a re-scan
  updates it in place instead of duplicating; `collectTranslatableTargets` skips any
  element carrying `data-sti-injected` (via `TRANSLATION_MODE_BADGE_ATTR`) so the
  scanner never reprocesses its own output.
- Re-scanned via a ~800ms-debounced `MutationObserver` on `document.body` (mutations
  where every added/removed node is one of our own badges are ignored, so it can't
  loop on itself) so switching tabs within a record page (no full navigation) still
  refreshes what's shown.
- `LANG_FLAGS`/`TYPE_LABELS`/`TYPE_COLORS`/`displayApiName` live in
  `src/content/tooltip-constants.ts` so the hover tooltip and Translation Mode share
  the same visual language instead of duplicating constants.

**v3 (2026-07-19, lesson #33): chip redesign + user-configurable style.** The v2
purple rectangles were rejected as visually foreign/saturating. v3 ships three
presets — `subtle` (neutral SLDS-toned pills, default), `tinted` (stable pastel
hue per language), `plain` (quiet inline text with `·` separators) — plus
show-flags and show-language-codes toggles, all persisted in `Settings`
(`tmPreset`/`tmShowFlags`/`tmShowLangCodes`) and editable from the popup's
collapsible "Display settings" panel. Style changes re-render live while the mode
is on (the settings listener re-calls `startTranslationMode` with the new style).

Not yet done: language order/colors/icons customization (PHASE 11).

**v4 (2026-07-20): editable chips.** Custom Label chips (the only editable `LabelType`,
same rule as the hover tooltip) get a "✏" and are clickable — opens the SAME editor the
hover tooltip uses (concurrency control included), anchored at the click position, via
`content/index.tsx`'s `openTmEditor`. See `DECISIONS.md #46` for the full mechanism —
built by reusing the `Tooltip` component rather than a second implementation in
`translation-mode.tsx`'s raw-DOM chips. **2026-07-20 stabilization session:** real-org
testing found the editor opened and immediately closed itself (~1ms) — a genuine
state-timing bug, root-caused and fixed, see `DECISIONS.md #50`. v4 is now believed
stable; still needs a real-org click to confirm the fix.

**Future refinement — Translation QA Mode (2026-07-19 product review, ⭐⭐⭐⭐⭐
potential, the single highest-rated idea in that review):** the pitch is a tester
saying "check this screen is well translated in French and Dutch" and getting the
answer in seconds instead of switching languages and comparing by eye. Two concrete
additions to the existing inline-badge mechanism, both computable from data already in
the reverse index (no new API calls):
- Fields with no value for an active language get a visually distinct "missing"
  treatment on their badge (today, missing languages are silently absent from the
  badge row — they should stand out instead).
- A translation whose value is byte-identical to the source/base language gets marked
  suspicious (a real possible failure mode: someone copy-pasted the source value into
  the translation field instead of translating it) — configurable, since some short
  strings (numbers, brand names, acronyms) are identical across languages legitimately.
- Longer-term, extend Translation Mode beyond Lightning Record Pages to **Screen
  Flows**, which have their own translation surface the extension doesn't touch yet.

### PHASE 10 — Translation Health (done, v1)
Dedicated extension page, `src/health/index.html` (+ `main.tsx` + `Health.tsx`), opened
via a popup button (`chrome.tabs.create(chrome.runtime.getURL(...))`) — the popup
itself is too small for a real table. `web_accessible_resources` in
`manifest.config.ts` is what makes `@crxjs/vite-plugin` treat this extra HTML file as
a build entry; it's the standard crxjs v2 pattern for pages beyond the popup that get
opened via `chrome.tabs.create` rather than referenced directly in the manifest.
- Every time `setIndexFromRealData` runs, the background also computes
  `TranslationHealthEntry[]` — for each `LabelEntry`, which of `settings.activeLanguages`
  it has no value for — and persists it to `chrome.storage.local` (`translationHealth`).
  Deliberately checked against the user's *active* languages, not the union of every
  language seen across all entries: it's a more directly actionable question ("what's
  missing among the languages I said I care about") than a broader consistency audit.
- The health page reads that + `settings` from storage and renders one row per active
  language (missing count + a coverage bar), expandable into the actual list of
  `apiName (type)` missing that language.
- Not yet done: "identical to source language" detection and other consistency checks
  beyond plain missing-ness (still open, see `PRODUCT.md`'s MVP capability #4).

**Future refinement — QA / Localization Report v2 (2026-07-19 product review,
⭐⭐⭐⭐⭐ potential):** extend the current per-language missing-count table with:
- **Duplicated** detection: the same translated value used for two different
  `apiName`s in the same language, a common copy-paste mistake worth flagging.
- **Broken** detection: values containing leftover merge-field syntax, unresolved
  placeholders, or obviously truncated text — needs a concrete definition of "broken"
  before implementation; don't guess at a heuristic without real bad-data examples
  from an org.
- **Broken references** (2026-07-20 roadmap review, backlog idea #24): flag translations pointing at metadata that no longer exists in the org — stale entries surviving a rename/delete, detectable by cross-referencing the health computation against the latest `listMetadata` results already fetched on each refresh, no new API calls.
- **Terminology consistency checker** (2026-07-20 roadmap review, backlog idea #14 "AI Consistency Checker" — despite the name, this doesn't require an actual model): flag when the same source term (e.g. "Account", "Save") is translated inconsistently across different entries in the same language (e.g. "Cuenta" in one place, "Cliente" in another) — a clustering/grouping pass over the existing reverse index, not a new data source. Needs a concrete similarity/grouping definition confirmed against real inconsistency examples before implementation, same "don't guess at a heuristic" discipline as the Broken-detection bullet above.
- **Export** (CSV/JSON) of the report — same underlying need as PHASE 14's export item,
  should share one implementation.
- This ties directly into "identical to source language" detection above and the
  Translation QA Mode refinement in PHASE 9 — the per-page inline flagging and the
  org-wide report should be driven by the same underlying health computation in
  `background/index.ts`, not two separate implementations.

### PHASE 11 — Language configuration UI + Quick Compare
Beyond the popup's language checkboxes: user-configurable language order, colors, and
icons (currently hardcoded in `Tooltip.tsx`'s `LANG_FLAGS`/`TYPE_COLORS`), plus a
compact vs. expanded tooltip display mode. All persisted in `Settings` the same way
`activeLanguages`/`enabled` already are.

**Quick Compare** (2026-07-19 product review, ⭐⭐⭐⭐⭐ potential, called out as
"visually spectacular"): a compact side-by-side view of one label's value across every
active language in one glance (`EN Applicant / ES Solicitante / FR Applicant ⚠️ / NL
Aanvrager`), with a warning mark on values identical to the source language — this is
the concrete implementation of the still-open "highlight differences between
languages" item under Translation Inspector in `PRODUCT.md`'s MVP capabilities. Likely
lives as an expanded/alternate tooltip display mode gated by this phase's compact vs.
expanded setting, rather than a separate UI surface.

**Visibility configuration & user profiles (2026-07-20 roadmap review, backlog ideas #15/#16):** a settings panel to show/hide metadata types (Custom Labels, Field Labels, Picklists, Buttons, Validation Rules, etc.) — same `Settings`-persisted pattern as `activeLanguages`, default to showing only what's genuinely useful to most developers/QA rather than every type. On top of it, **preset profiles** (Developer / QA / Admin / Consultant) that flip a bundle of these visibility toggles at once rather than making the user configure each one individually — profiles are just named presets over the same underlying visibility settings, not a separate mechanism.

### PHASE 12 — Advanced Metadata Inspector
Broaden `LabelType` coverage further: buttons, LWC components, Aura components —
whatever can be reliably attributed to a metadata origin, following the same
architecture rules (background-only fetch, tightly scoped queries, graceful
degradation) established in PHASE 4.

### PHASE 13 — Smart Search
A search UI (popup or dedicated panel) to look up any Label, Field, Object, or API Name
directly from the extension, independent of hovering over it on the page — reuses the
existing reverse index, just adds a different entry point into it. Concretely (backlog
idea #23): Custom Labels, Fields, Objects, Picklist values, Validation Rules, and
Translations — anything already present as a `LabelEntry` in the reverse index; no new
metadata coverage required, this phase is purely a new entry point into data already
fetched.

### PHASE 14 — Productivity Actions — Copy actions done, export still pending
Copy API Name (PHASE 4) and Copy Translation (the per-language ⧉ icon, PHASE 4) were
already shipped. **Copy SOQL and Copy XML Member shipped 2026-07-20** — see
`DECISIONS.md #48` for exactly which `LabelType`s each covers and why (confident
Metadata API component mappings only, nothing guessed). **Copy Metadata Name and Copy
Full Path were deliberately NOT built** — both would copy the identical string Copy API
Name already does, so they'd have been redundant buttons, not new value (same
`DECISIONS.md #48` entry).

Still open: exporting information (CSV/JSON) for a given element or the whole loaded
index (2026-07-19 product review confirms this as ⭐⭐⭐⭐ — sounds minor, gets used
constantly in practice). Share the export implementation with PHASE 10's report export
rather than building it twice, and with PHASE 16's Workspace export once that exists.

### PHASE 15 — Dependency Inspector ("Where is this used?")
2026-07-19 product review, ⭐⭐⭐⭐ potential but flagged by the reviewer as "probably
very difficult" — speculative, needs a feasibility spike before committing to it.
Pitch: hover a Custom Label or field and see what actually references it —
`Referenced by: 12 Flows, 4 LWCs, 3 Validation Rules`. Extremely valuable for safe
maintenance/deprecation, but the only realistic data source is the **Dependency API**
(`MetadataComponentDependency` in the Tooling API), which has historically been
beta/pilot-only, incomplete for several component types, and org-dependent in
availability — this must be verified against a real target org (`SELECT ... FROM
MetadataComponentDependency` via Tooling API) before any implementation work starts.
If the API can't deliver reliable, complete results, ship nothing rather than a
partial/misleading dependency list — directly follows the "zero false positives"
quality bar in `PRODUCT.md`. Do not start building UI for this before the feasibility spike
confirms the data is trustworthy. Concretely, the "where is this used" surfaces a user
would expect (backlog idea #11, "Impact Analysis" — the same feature, more detailed
pitch): Lightning Record/App Pages, LWCs, Experience Cloud (Digital Experiences),
Flows, Quick Actions, and other Record Pages/Layouts referencing the same field or
label — the exact set the Dependency API can enumerate per component type is unknown
until the feasibility spike above runs; don't commit to this list in the UI until it's
confirmed.

### PHASE 16 — Workspace, Metadata Basket & Automatic package.xml Builder
**Muy Alta priority.** Backlog ideas #2 ("Package.xml Builder Automático") and #3
("Workspace Persistente"), the separately pasted "Workspace (Sesión de Trabajo)"
concept doc, and the chat-summarized "Metadata Basket" are the same feature described
at three levels of detail — consolidated here rather than duplicated across phases.

**What it is:** a persistent, silent, per-session Workspace that automatically tracks
everything the user touches — edited translations, inspected metadata, and every
metadata component needed to deploy those edits — without the user ever managing a
list by hand. Internally this is a **Metadata Basket**: a deduplicated collection of
metadata component identities (type + fullName), grouped by metadata type, that the
extension builds up on its own as a side effect of normal use.

**Explicitly not the product's core value proposition** — per direct product guidance,
this stays a frictionless "productivity bonus" layered on top of Translation QA +
Metadata Inspection, which remains the center of the product (see Positioning above).
It must never require its own workflow or attention from the user to function.

**How items enter the basket:**
- Every translation edited (once PHASE 6 ships) or metadata item explicitly
  marked/inspected adds itself and its underlying metadata dependencies automatically
  — e.g. editing a field's translation adds both the `CustomField` and the
  `Translations`/`CustomObjectTranslation` member, without the user needing to know
  that dependency exists (mirrors the exact `CustomField`-sibling-unlock relationship
  already reverse-engineered in lessons #15/#16, just run forward instead of
  backward).
- Deduplication is by metadata identity (type + fullName), not by edit — editing the
  same field's translation twice adds it to the basket once.
- Basket is grouped by metadata type when displayed or exported, matching
  package.xml's own `<types>` structure.

**Persistence:**
- `chrome.storage.local`, survives service-worker termination (same discipline as
  lesson #17's reverse-index persistence) and browser restarts.
- Optional JSON export/import for moving a Workspace between machines or archiving it
  — reuses the export mechanism shared with PHASE 10/14 rather than a separate
  implementation.
- No cross-session merge logic needed at MVP — one active Workspace at a time is
  enough; multi-Workspace/session-switching is not scoped here.

**UI:** a panel (popup section or dedicated page, TBD at implementation time — likely
the dedicated-page pattern from PHASE 10/Translation Health given the popup's size
constraints) showing: item count, filter by type, remove individual item, clear all,
"Download package.xml" button. Also surfaces the **before/after comparator** (backlog
idea #22, "Comparador de Cambios") for every modified translation — the original value
is already captured for Safe Undo below, so the diff view is free once that data
exists. Export Session (backlog idea #10 — package.xml/CSV/JSON/Markdown) is this same
panel's export action, sharing the implementation with PHASE 10/14 rather than a fourth
one.

**Safe Undo (per item, not a global "Revert Session"):**
1. The original value is captured at the moment of edit (already needed for the
   comparator above).
2. On Undo, the extension re-queries the *current* value from Salesforce first.
3. Restoration only proceeds if the current value still matches what the extension
   expects (i.e. nobody else changed it since); otherwise the operation is cancelled
   with a clear message instead of silently overwriting someone else's change.

This is the same "never guess, never silently overwrite" discipline as the rest of the
project's zero-false-positives bar — keep this mechanism exactly as specified in the
source concept, it's already correct.

**Analytics (backlog idea #27), as a small Workspace sub-feature, not a separate
phase:** since the Workspace already locally records every edit with a timestamp,
simple aggregate stats (translations edited, most-modified objects, session duration)
are a pure local computation over data already being collected — low risk, no new
tracking, add only if it doesn't distract from the basket/undo core.

**Filosofía (kept from the source concept — it already matches this project's
discipline):** the Workspace's purpose is not to allow reverting — it's to remember
automatically everything the user has done, build the deployment package
transparently, prevent forgotten dependencies, remove the need for manual tracking
lists, and reduce context-switching through the whole translation/maintenance
workflow. It should feel like a silent assistant, not a feature the user has to
operate.

### PHASE 17 — Keyboard-First Experience
**Muy Alta priority.** Backlog idea #4, extending rather than replacing the
hold-to-inspect + hotkey infrastructure already shipped in lesson #40, plus backlog
idea #17 ("Always On + Hotkeys") which asks for more configurability on that same
infrastructure.

Already shipped (lesson #40, do not rebuild): configurable hold-to-inspect key
(`Settings.inspectorHotkey`, default Alt, `null` = always-on), configurable
Translation Mode toggle combo (`Settings.tmHotkey`, default Alt+T), a press-a-key
recorder UI in the popup's Shortcuts section, a page-wide magnifier cursor while held,
zero-debounce resolution while the key is held, and an `inspectAt(x, y)` single entry
point that already unifies mouse/keydown/scroll.

What's still open, building on that foundation rather than duplicating it:
- **Editing shortcuts** (ties directly into PHASE 6): Enter to open the inline editor
  on the currently-inspected element, Ctrl+S to save, Esc to close/cancel.
- **Navigation shortcuts**: arrow keys to move the "currently inspected" element to
  the next/previous matched element on the page (needs an ordered list of matches,
  most naturally sourced from PHASE 18's Translation Navigator scan rather than a new
  one).
- **Further hotkey configurability** (idea #17's remaining asks beyond what lesson #40
  already covers): double-press-to-toggle as an alternative to hold, and a
  configurable grace/timeout period — both are refinements of the existing
  recorder/settings model, not new architecture.
- Design constraint to hold from lesson #40: every input path (mouse, key, scroll)
  must keep converging on one `inspectAt`-equivalent entry point — new shortcuts
  should call into existing flows (open editor, save, navigate index) rather than
  growing parallel code paths.

### PHASE 17 additions — Enter-to-edit shortcut shipped
Shipped 2026-07-20. Ctrl+S (save) and Escape (cancel) turned out to already work the
moment an editor is focused (PHASE 6's `TranslationEditor` already handled both) — the
only real gap was Enter opening the editor in the first place while Inspection Mode is
on and a tooltip is showing (no click). See `DECISIONS.md #49` for the mechanism
(`editTrigger` counter prop) and why it's guarded more narrowly than the existing
inspector/Translation-Mode toggle keys. Still open: arrow-key navigation between
matches (blocked on PHASE 18's ordered match list) and further hotkey configurability
(double-press-to-toggle, configurable grace period).

### PHASE 18 — Translation Navigator & Page Coverage
**Alta priority.** Backlog ideas #5 and #6, grouped together because both are
read-only, whole-page analyses built on the exact same scan the extension already
performs.

**Translation Navigator:** a panel listing every translatable text detected on the
current page (type, status, current value), reusing the full-tree scan
(`collectTranslatableTargets`) and bulk resolution (`RESOLVE_TEXTS_BULK`) already
built for Translation Mode (PHASE 9) — no new scanning or matching logic, just a list
UI over the same result set. Selecting an item scrolls it into view, highlights it,
and opens the tooltip — useful as a QA entry point independent of hovering.

**Translation Coverage:** page-level statistics computed from that same scan result —
total texts detected, translated / untranslated / falling back to source / unresolved
("Unknown origin") counts for the current screen. This is a per-page companion to
PHASE 10's org-wide Translation Health, not a replacement for it — Health answers
"what's missing across the org for my active languages," Coverage answers "how
well-translated is the exact screen I'm looking at right now."

### PHASE 19 — Hover History & Favorites
**Alta priority.** Backlog ideas #7 and #8, grouped as a pair of small local-list
panels sharing the same UI pattern: a scrollable list of metadata entries with quick
actions.

- **Hover History**: the last ~30 items inspected (hover or Translation Navigator
  selection), most-recent-first, each with "reopen" (re-shows the tooltip/detail),
  "copy API Name," and — once PHASE 6 ships — "edit again." Purely local,
  `chrome.storage.local`, capped ring buffer, no new data source.
- **Favorites**: user-pinned metadata entries (objects, fields, labels, picklists,
  validation rules) for instant access from a side panel, independent of the current
  page. Same storage pattern as History, difference is user-curated (add/remove)
  instead of automatic.
- Both are pure UI over data the extension already holds (reverse index entries) — no
  new API calls, no new resolution logic.

### PHASE 20 — Open in VS Code
Backlog idea #21. Flagged for a feasibility check before any implementation, unlike
most other "Productivity" ideas, which are low-risk UI-only additions.

⚠️ **Feasibility risk, different in kind from PHASE 15's:** a Chrome extension has no
direct filesystem access and cannot detect or read a local SFDX project on its own —
this would require either (a) a companion **Native Messaging host** (a small local
executable the extension talks to, which the user must separately install), or (b)
shelling out to a custom URI scheme VS Code registers (`vscode://file/...`), which
only works if the extension already knows the exact local file path, which it doesn't.
Don't scope implementation work here until one of those two mechanisms is confirmed to
reliably map a metadata API name to a real local file path — this is closer to "needs
an architecture decision" than "needs a query."

### PHASE 21 — Team Mode
Backlog idea #26. Flagged for the same reason as PHASE 20: this is an architecture
question before it's a feature.

⚠️ **Feasibility risk:** last editor, comments, locks, and shared pending-changes
visibility all require state shared *between different users' browsers* — every other
part of this project (Workspace included, PHASE 16) is deliberately local-only
(`chrome.storage.local`, no backend). Team Mode would need either a real backend
service or piggybacking on Salesforce itself as the shared store (e.g. a custom object
recording edit metadata) — the latter would be more consistent with the project's
"never require infrastructure beyond the org + the extension" posture so far, but
hasn't been evaluated. Do not start building this without first deciding where the
shared state lives; it changes the project's architecture, not just its feature set.

### PHASE 22 — Plugin Architecture
Backlog idea #28. Long-term structural note, not a scoped feature.

An extensible mechanism for adding new metadata-type inspectors without modifying the
core resolution funnel (`resolveText`, `index-builder.ts`) — relevant once `LabelType`
coverage broadens significantly (PHASE 12 and beyond) and the type-by-type
`if`/switch pattern currently used throughout `metadata-translations.ts`/
`index-builder.ts` starts costing more to extend than a plugin registration would. Not
worth designing before there's a second or third real consumer of the pattern —
revisit when PHASE 12's coverage expansion is actually underway, not before.

---

