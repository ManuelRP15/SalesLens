# Roadmap

> Part of the STI doc set — start at [../CLAUDE.md](../CLAUDE.md) if you landed here
> directly. Decisions referenced as `#N` live in [DECISIONS.md](DECISIONS.md). **What's
> active right now lives in [CURRENT_STATE.md](CURRENT_STATE.md), not here** — this file
> is the backlog/history, not the session-to-session state.
>
> Read this in full only when scoping a new Epic or reprioritizing. Otherwise, jump
> straight to the phase you need via the table below or a heading search.

## Scope: Simple mode vs. Advanced (settled 2026-07-21, DECISIONS.md #56, PRODUCT.md)

The product's DEFAULT surface (hover, Translation Mode, Translation Health) is now
just objects, fields, picklist values, and Custom Labels — everything else (buttons,
quick actions, tabs, apps, record types, layout sections, related lists) is real,
stays built, and is reachable by turning Simple Mode off in the popup, but is no
longer what a new user sees by default. This changes what "done" means for several
phases below WITHOUT removing any of the work — PHASE 4/8/9/14's advanced-type
support and PHASE 6b's WebLink/QuickAction/etc. editing are unaffected code-wise, just
opt-in now. Read each phase's own status for the current picture; don't assume a phase
marked "done" before 2026-07-21 is off by default without checking.

## Status at a glance

| # | Phase | Status | Priority (if pending) |
|---|---|---|---|
| 4 | Tooltip productivity actions + reliability | ✅ done (advanced-type actions now opt-in, see Scope above) | — |
| 5 | Navigation to Setup | ✅ done (CustomLabel URL + custom-field Id-based URL both unverified) | — |
| 6 | Inline translation editing | ✅ v1 (Custom Labels) + 6b (8 more types via deploy()) done | 6c (ObjectLabel/RelatedList caseValues, global QuickAction) pending |
| 7 | Standard labels without Translation Workbench | ✅ done | — |
| 8 | Metadata-type detection + Metadata Lens | 🟡 detection heuristics done (advanced types opt-in), Lens pending | — |
| 9 | Translation Mode | 🟡 v4 done (display + Custom Label editing; advanced-type badges opt-in); missing/identical-to-source chip signals shipped 2026-07-21 (DECISIONS.md #58) | rest of QA Mode refinement (longer-term Screen Flows) pending |
| 10 | Translation Health | ❌ **REMOVED from the product 2026-07-22** (DECISIONS.md #66; v2 already retired in #64, archived at tag `archive/translation-health-v2`). Missing/identical signals live on in tooltip/Translation Mode/audit panel. | — |
| 11 | Language config UI + Quick Compare | 🟡 Quick Compare shipped 2026-07-21 (DECISIONS.md #59, closes PRODUCT.md MVP capability #2); language order/colors/icons/profiles still pending | — |
| 12 | Advanced Metadata Inspector | ⬜ pending | — |
| 13 | Smart Search | ⬜ pending | — |
| 14 | Productivity Actions | 🟡 Copy API Name done; Copy SOQL/XML **removed** 2026-07-21 (DECISIONS.md #56 — kept the extension simple per direct product feedback); export pending | — |
| 15 | Dependency Inspector | ⬜ pending | ⚠️ feasibility unconfirmed |
| 16 | Workspace / Metadata Basket / package.xml Builder | 🟢 v2 shipped 2026-07-22 (`DECISIONS.md #65`/`#66`): auto capture on save + inspector pins, change detection vs the index, product-consistent page (search/chips/tabs/Setup links), package.xml + JSON export, popup count | Safe Undo next; org audit info, sessions, JSON import deferred with reasons (see phase) |
| 17 | Keyboard-First Experience | 🟡 Enter-to-edit shipped; save/cancel already worked; hold-vs-toggle hover redesign shipped 2026-07-21 (DECISIONS.md #56); shortcut settings UX simplified + mutual conflict prevention shipped 2026-07-21 (DECISIONS.md #57); arrow-key navigation still pending | **Muy Alta** |
| 18 | Translation Audit & Guided Navigation ("Translate All" evolution, absorbs the old "Translation Navigator") | 🟡 v1 shipped 2026-07-21 (`#60`); first real-org bug round fixed same day (`#61`): sticky-header scroll correction, editor-closes-on-click root cause (Dynamic Hover parity), Complete-tab overflow, session-local translation scope toggle (All fields/Current only) | Duplicated filter designed but deferred (needs its own real-org check); Page Coverage stat line folded into the panel header instead of a separate feature |
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

**Narrowed further, 2026-07-21 (`DECISIONS.md #56`): `FieldLabel`/`PicklistValue`
editing is CUSTOM fields/picklists only, not standard ones.** Real-org testing hit
Salesforce's own rejections — "Cannot translate standard field: Account.Fax", "Can't
translate standard picklist Type with Custom Object Translations. Use Standard Value
Set instead." Standard picklists need an entirely different, unbuilt mechanism
(`StandardValueSetTranslation`); some standard fields aren't renamable via metadata at
all. Standard fields/picklists stay fully READABLE via hover (unaffected — that path
never touches `metadata-write.ts`), just without an edit button until a real
standard-value-set write path exists (tracked under PHASE 6c alongside
`ObjectLabel`/`RelatedList`).

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
- **PHASE 6c — `ObjectLabel`/`RelatedList` editing, global `QuickAction`, standard field/picklist editing** (added 2026-07-21, deferred out of PHASE 6b): (a) `ObjectLabel`/`RelatedList` need a safe patch-or-refuse strategy for `<caseValues>` when a language has multiple grammatical-case entries (German, Slavic...) — `FieldLabel`/`RecordType` already refuse cleanly via `assertNoGenderedCase` (`metadata-write.ts`) rather than risk corrupting the other cases; the object's own label needs the equivalent, then `RelatedList` (derived from the same node one hop removed) can ride on it. (b) **Global/standard quick actions** (surfaced 2026-07-21 real-org test, `DECISIONS.md #54`): their translations don't live in the object's `CustomObjectTranslation` (they fail deploy with "no QuickAction named X found") — object-specific custom quick actions work today, global ones show a clean "not supported yet" message. Real support needs the seeding to carry a global flag and a real-org-verified global `Translations` `<quickActions>` write path. (c) **Standard field/picklist editing** (surfaced 2026-07-21 real-org test, `DECISIONS.md #56`): standard fields are rejected outright by some Salesforce deploys ("Cannot translate standard field: Account.Fax"), and standard picklists need `StandardValueSetTranslation` — a completely different, unbuilt Metadata API type, not a variant of the existing `CustomObjectTranslation` path. Given Simple Mode's scope decision (see top of file), this is explicitly LOWER priority than 6c's other items — standard fields/picklists are still fully readable, just not editable, and that gap matters less now that the product's default surface centers on exactly these types.

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

**Translation QA Mode (2026-07-19 product review, ⭐⭐⭐⭐⭐ potential, the single
highest-rated idea in that review) — the first two concrete additions SHIPPED
2026-07-21 (`DECISIONS.md #58`):**
- ✅ **Missing-language chips**: a matched entry's badge now renders a chip for EVERY
  active language, not just the ones with a value — a language with none gets a
  dashed, dimmed "— missing —" placeholder instead of being silently absent, and is
  clickable-to-fill-in when the type is editable (reuses the existing empty-value
  editor path, no new mechanism).
- ✅ **Identical-to-source flagging**: a translation whose value is byte-identical to
  the base-language value gets a small "≈" mark — gated by
  `Settings.flagIdenticalTranslations` (default on), since some short strings
  (numbers, brand names, acronyms) are identical across languages legitimately and
  this project's "zero false positives" bar means that needs a real off-switch, not
  just a flag people learn to ignore.
- Still open: the tester-facing "check this screen in French and Dutch" summary view
  itself (today the signals live on individual chips, not yet rolled up into a
  per-page pass/fail read) — the underlying data is already there, this is a
  presentation layer on top.
- Longer-term, extend Translation Mode beyond Lightning Record Pages to **Screen
  Flows**, which have their own translation surface the extension doesn't touch yet.

### PHASE 10 — Translation Health — ❌ REMOVED FROM THE PRODUCT (2026-07-22, `DECISIONS.md #66`)

The dedicated Health page (v1: per-language Missing + Identical-to-source tables) was
**removed entirely** — page, popup button, background computation, `translationHealth`
storage, `TranslationHealthEntry` type — by explicit product decision: the in-context
surfaces (the tooltip's Quick Compare, Translation Mode's missing/identical chips, and
the Translate All audit panel's Missing/Identical filters) are where this capability
actually gets used, and the product direction is **Inspect + Translate All +
Workspace**, not a separate report page. This closes the retirement `#64` began (v2
was archived then; v1's surface is gone now).

**What survived, because it was never Health-specific:** the missing/identical
detection signals (`Settings.flagIdenticalTranslations`, `BASE_LANGUAGE` comparison)
live in the tooltip/Translation Mode/audit panel and are untouched. The archived v2
work remains at git tag `archive/translation-health-v2` (Duplicated-detection module +
tests) — if ever revived, the shape is an **Audit filter** (PHASE 18's deferred
"Duplicated filter"), not a report page.

### PHASE 11 — Language configuration UI + Quick Compare
Beyond the popup's language checkboxes: user-configurable language order, colors, and
icons (currently hardcoded in `tooltip-constants.ts`'s `langAccent`/`TYPE_COLORS`).
Would persist in `Settings` the same way `activeLanguages`/`enabled` already do — still
pending, and lower priority than most of what's left (see Positioning in `PRODUCT.md`:
per-user cosmetic customization isn't where this product's value lives).

**Quick Compare — shipped 2026-07-21 (`DECISIONS.md #59`), closes `PRODUCT.md` MVP
capability #2.** 2026-07-19 product review, ⭐⭐⭐⭐⭐ potential, called out as "visually
spectacular": a compact side-by-side view of one label's value across every active
language in one glance, with a warning mark on values identical to the source
language. Reassessed at implementation time: the tooltip's existing per-language rows
(a `10px 50px 1fr auto` CSS grid, `Tooltip.tsx`) were already the right "side by side,
one glance" bones — what shipped is the SAME view, not a new alternate mode:
- Every active language now gets a row, present or not (previously non-editable types
  — most of Simple Mode's own core scope — silently hid a language with no value at
  all; a missing one now shows a plain "Not translated" placeholder, matching the
  editable case's existing "—" + edit-affordance treatment).
- A value identical to the base-language value gets a small "≈" mark, the exact same
  signal and visual language as Translation Mode/Health's own (`#58`), gated by the
  same `Settings.flagIdenticalTranslations` — no new setting needed.

Deliberately did NOT add a separate compact/expanded display mode — the existing
vertical layout already reads as a scannable compare view once missing/identical are
visible (confirmed via a static mockup, see `#59`); a second layout would be exactly
the kind of "control without clear added value" the product philosophy warns against
unless real-org feedback says otherwise.

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

### PHASE 14 — Productivity Actions — Copy API Name/Translation done, rest deliberately cut
Copy API Name (PHASE 4) and Copy Translation (the per-language ⧉ icon, PHASE 4) are the
two actions that remain. **Copy SOQL and Copy XML Member shipped 2026-07-20, then
REMOVED 2026-07-21** (`DECISIONS.md #48` for the original build, `#56` for the
removal) — direct product feedback questioned whether they were pulling their weight
against the goal of keeping the extension simple, and PHASE 16's future Workspace will
cover the same underlying need (grab exactly what you touched for a package/manifest)
automatically rather than as a manual per-row action. **Copy Metadata Name and Copy
Full Path were never built** — both would copy the identical string Copy API Name
already does, so they'd have been redundant buttons, not new value (`DECISIONS.md #48`).

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
**🟢 v2 shipped 2026-07-22 (`DECISIONS.md #66`; v1 same week, `#65`).** The Workspace is
now integrated into the product's flow, not a side utility:
- **Capture, two paths:** every successful save (v1, automatic) + **"+ Workspace" pins
  from the inspector tooltip** (v2) — one affordance that serves BOTH discovery
  workflows, since audit rows open the same inspector ("navigate = inspect", `#62`).
  Pins snapshot every language value at capture time.
- **Change awareness:** the page compares captured values against `cachedEntries` and
  flags "changed since your edit / since you captured it" per language, with an honest
  "not in the current index" unknown state and a freshness footer. No new API calls.
- **The page speaks the product's visual language** (`workspace.css`): audit-panel
  status rails (edited blue / pinned slate / changed amber), tooltip type badges +
  language dots, search + typeLabel chips + status tabs (All/Edited/Pinned/Changed),
  Open-in-Setup links (via `lastOrgOrigin` + `setupPath`), relative times, two-stage
  clear. Popup button shows a live item count.

**Deliberately deferred, with reasons (`#66`):**
- **Safe Undo** — next in line; a write path (T3) wanting its own round with real-org
  verification. Its prerequisites (original values + drift detection) now exist.
- **"Last modified by" / org audit info** — investigated: reliably available ONLY for
  Custom Labels (Tooling API `ExternalString.LastModifiedBy`); the deploy()-backed
  types are not Tooling-queryable (`DECISIONS.md #6`) and the Metadata API exposes no
  per-node audit. A partial, per-type-availability feature was judged noise for now;
  if built, the UI must distinguish known/unknown/not-available per `#66`.
- **Named/multiple sessions & session sharing** — evaluated and rejected for now (P2
  radical simplicity): ONE rolling workspace + timestamps + "since <date>" + JSON
  export/import covers the real need until evidence of multi-session demand appears.
- **JSON import** (export ships), **bulk actions/multi-select**, **keyboard nav** on
  the page — all deferred until a real usage pattern asks for them.

Original phase spec kept below for those follow-ups.

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
inspector/Translation-Mode toggle keys.

### PHASE 17 additions — hold-vs-toggle hover redesign shipped (2026-07-21)
Direct real-org feedback: continuous retargeting on every mouse move (Inspection
Mode's behavior since lesson #43) made it too easy to accidentally lose a tooltip
mid-read, and felt unintentional rather than deliberate. **Replaced with two
independently configurable keys** (`DECISIONS.md #56`):
- `Settings.inspectorHotkey` (default Alt, unchanged storage key) now TOGGLES a
  **sticky pin**: press once, the first resolvable element the cursor reaches gets
  pinned — and STAYS pinned through further mouse movement alone. Only Escape, an
  outside click, or the hold key below can move or close it.
- `Settings.holdHotkey` (new, default Shift) is the "Minecraft shift" companion: hold
  it down for LIVE, zero-debounce retargeting — release to re-pin on whatever's
  under the cursor at that instant. Works independently of the toggle key, so it also
  functions as a fully standalone hold-to-peek (lesson #40's original mechanic,
  reintroduced as a real, permanent second mode rather than superseded).
- The magnifier cursor now only shows while actively "searching" (hold key held, or
  toggle mode on with nothing pinned yet) — hidden once something's pinned, in favor
  of the normal cursor, per direct feedback that it cluttered a tooltip being read.
- Escape/outside-click now also close a tooltip pinned purely via a standalone hold
  peek (toggle mode never engaged), which had no way to be dismissed before.

Still open: arrow-key navigation between matches (blocked on PHASE 18's ordered match
list) and further hotkey configurability (double-press-to-toggle, configurable grace
period). Real-org UNVERIFIED — this is a genuine interaction-model change, confirm the
full feel (pin, hold-to-move, magnifier show/hide, both close paths) before trusting it.

### PHASE 17 additions — shortcut settings UX simplified + conflict prevention shipped (2026-07-21)
Direct real-org feedback on the hold-vs-toggle redesign above: the popup's hotkey
controls read as confusing (`DECISIONS.md #57`) — disabling Hold to move tooltip's key
left its recorder displaying "Always on," a placeholder meant for the OTHER setting's
different null-meaning. Both `inspectorHotkey` and `holdHotkey` now present as a single
`ShortcutToggleRow` shape: an Enabled/Disabled pill switch + an activation-key recorder
that's dimmed/inert while disabled, no third "Always" mode implied. Behavior underneath
is unchanged (disabled `inspectorHotkey` still falls back to classic Always Hover,
exactly as before) — this was a UI relabel, not a logic change. New: the two shortcuts
can no longer be set to the same key — `shared/hotkeys.ts`'s `bareKeysConflict` rejects
the attempt inline with an explanation, and `pickAvailableBareKey` picks a safe
alternate when a shortcut is re-enabled and its own default would collide with the
other's current custom key.

### PHASE 18 — Translation Audit & Guided Navigation ("Translate All" evolution)
**Shipped v1, 2026-07-21 (`DECISIONS.md #60`).** Originally scoped (backlog ideas #5/#6)
as a read-only "Translation Navigator" list + separate "Page Coverage" stats panel.
Superseded by a richer, directly-requested vision: evolve "Translate All" (Translation
Mode, PHASE 9) from a display+edit mode into a full **audit and guided-fixing
workflow** — filter to what needs attention, step through issues one at a time, watch
the page scroll to and highlight each one, fix it with the existing editor, watch the
count go down, repeat. The two original backlog ideas are still in here, just folded
into the richer feature rather than built as their own separate panel: the list view
IS the Navigator, and a coverage summary lives in the panel's header instead of a
second UI.

**Why this, now:** the single highest-value remaining CORE capability after Quick
Compare (`#59`) closed MVP capability #2. Unlike net-new panels (Smart Search,
Workspace), this is a direct extension of Translation Mode — the exact scan
(`collectTranslatableTargets` + `RESOLVE_TEXTS_BULK`) and the exact editor
(`Tooltip.tsx`'s `CandidateBlock`, via `openTmEditor`) it already uses, plus the
missing/identical signals already built for `#58`/`#59`. No new metadata fetches, no
second editor, no competing state machine — see Technical architecture below for why
each of these was a reuse rather than a new build.

**Product goal:** open Translate All, immediately see which translations need
attention across the whole page (not just what's scrolled into view), filter to one
category, step through issues one by one with the page doing the scrolling/
highlighting for you, fix each with the same inline editor Translation Mode chips
already use, and watch the count shrink in real time — a guided audit, not manual
hunting.

**User flow:** Toggle Translate All on (popup button or `tmHotkey`) → a collapsed
counts pill appears bottom-right → expand it → pick a filter tab (All / Missing /
Identical / Complete) → the current filtered list and a "N of M" stepper appear →
click Next (or a list row) → the page scrolls the target into view and highlights it →
if the entry is editable, the SAME inline editor opens automatically, seeded on the
specific language that made the entry match the filter → save → the panel's counts
update immediately (no manual rescan) → click Next again → repeat until the filtered
list is empty.

**Technical architecture (the 7 questions from the session brief, answered from
reading the actual code, not assumed):**
1. **Current Translate All architecture:** `content/translation-mode.tsx`'s
   `scan()` walks the page (`collectTranslatableTargets`, NOT viewport-gated — it
   measures `getBoundingClientRect().width/height > 0`, so below-the-fold content is
   already included), resolves everything in one `RESOLVE_TEXTS_BULK` round trip, and
   injects an inline chip badge per matched element. Re-scans on a debounced
   `MutationObserver` (page DOM changes) and whenever `startTranslationMode()` is
   called again while already running (already-existing "just rescan" branch).
2. **How translations are discovered:** the SAME resolution pipeline as hover
   (`resolveText`/`applySimpleScope` in `background/index.ts`) — Simple Mode scoping,
   the reverse index, everything already applies with zero new code.
3. **DOM ↔ translation mapping:** `scan()` already produces `{element, entry}` pairs
   for every matched text on the page — this is the exact mapping "go to this issue"
   needs. It just wasn't kept around past building the badge; v1 keeps it.
4. **Reliably computable states:** per active language, an entry is `missing` (no
   value at all — same check as `#58`/`#59`), `identical` (byte-equal to the
   base-language value — same check, same `flagIdenticalTranslations` gate), or
   neither. One entry can be missing in one language and identical in another; v1
   assigns ONE overall status per entry for filtering, in priority order
   `missing > identical > complete` (missing is strictly more actionable).
   **Duplicated is reliably computable too** (see "Duplicates" below) but shipped
   as a designed-not-built extension, not v1 — see Deferred.
5. **Reusing scroll/highlight:** `Element.scrollIntoView({behavior:"smooth",
   block:"center"})` needs nothing new from the DOM layer; a new small highlight
   overlay (see Highlighting strategy) is the only new mechanism, and it's
   independent of resolution/DOM-mapping entirely.
6. **Reusing the editor:** `content/index.tsx`'s `openTmEditor(entry, language, x, y)`
   already opens `Tooltip.tsx`'s full editor (concurrency control, keyboard
   shortcuts, conflict banner) anchored at an (x, y) point — guided navigation just
   needs to compute an (x, y) from the target element's own rect instead of a real
   click event. Zero new editor code.
7. **Hover / Inspection Mode interaction:** already fully decoupled — the hover
   engine's `isEngineLive()` already returns `false` whenever `translationModeEnabled`
   is true, so Inspection Mode and the audit panel can never contend for the tooltip.
   No new mutual-exclusion logic needed.

**State model:** `translation-mode.tsx`'s `scan()` now ALSO builds a de-duplicated
(`apiName + type` key — the same logical entry can appear at multiple DOM locations;
v1 tracks the first-encountered element as the navigation target) list of
`AuditEntry { key, entry, element, missingLanguages, identicalLanguages, editable,
status }`, handed to `content/index.tsx` via a new `onAuditUpdate` callback parameter
on `startTranslationMode()` — the exact same "one scan, several consumers" shape the
badges themselves already use, not a parallel scan. `content/index.tsx` owns the
panel's own UI state (current filter, current index within the filtered list, expanded/
collapsed) as module-level variables, mirroring how every other piece of hover/TM state
already lives there.

**Filtering approach:** four tabs — **All, Missing, Identical, Complete** — deliberately
NOT the larger set floated in the brief (a "Needs attention" union tab was considered
and dropped: it adds a tab without adding information, since Missing/Identical are
already individually selectable, and Duplicated isn't shipped yet to fold in). Each tab
maps directly to a real, already-computed status — no synthetic buckets.

**Navigation approach:** a "`{Filter} — i of N`" stepper + Prev/Next, plus a scrollable
list of the current filter's entries (type badge + API name + status), click any row to
jump straight to it. The "current position" is an index into the CURRENT filtered
array — after a save changes that array's length (an entry drops out of "Missing" once
fixed), the index is clamped to the new length. This means the item that occupied the
NEXT slot becomes "current" for free, with no explicit "auto-advance" logic — matches
the brief's own worked example (`Missing: 12 → edit one → Missing: 11`) without the
panel yanking the page away from a user who might still be reading the result.

**DOM mapping strategy:** covered under Technical architecture point 3 — the
`{element, entry}` pairs `scan()` already builds are the ONLY mapping needed; v1 adds
no second lookup structure.

**Highlighting strategy:** a single floating overlay `<div>` (`position:fixed`,
`pointer-events:none`, injected directly into `document.documentElement` — the SAME
"transient, fully-reversible page DOM touch" exception Translation Mode's badges and
the Inspection Mode magnifier cursor already use, not a new kind of exception),
repositioned via the target's live `getBoundingClientRect()` on scroll/resize, with a
brief pulse animation on activation settling into a steady outline. Only ONE highlight
exists at a time (a new `highlightElement()` call clears the previous one first) — the
overlap problem that killed Translation Mode's OWN v1 (dozens of simultaneous floating
cards, `#19`) doesn't apply here, since guided navigation only ever highlights the ONE
entry currently being worked on.

**Editing integration:** the existing `openTmEditor`/`Tooltip.tsx` editor is the ONLY
editor — guided navigation computes an anchor point from the target element's own
`getBoundingClientRect()` (not a real click event) and calls the exact same function a
chip click would. For a `missing` entry, the editor opens pre-seeded on the SPECIFIC
missing language (not just the first one) — the language that made the entry match the
filter in the first place. Non-editable entries (standard fields/picklists,
`ObjectLabel` — see `DECISIONS.md #56`'s narrowing) still scroll/highlight so the user
can SEE the gap, but no editor auto-opens — there's nothing to write back to yet.

**Concurrency considerations:** unchanged — `saveTranslation`'s existing optimistic-
concurrency flow (`#42`, re-read-before-write, conflict banner) is untouched; guided
navigation is purely a new ENTRY POINT into the same save path, not a new one. What's
new: a successful save now triggers an explicit Translation Mode rescan (calling
`startTranslationMode()` again with the same args — already a safe no-op-if-already-
running "just rescan" path) so the panel's counts/list update immediately. This closes
a real, previously-unnoticed gap: an edit happens inside the extension's own CLOSED
shadow root, so the page-level `MutationObserver` that normally re-triggers a rescan
never fires from it — without this explicit trigger, a saved edit would leave the
on-page badge AND the audit panel stale until some unrelated page mutation happened to
retrigger a scan.

**Known Salesforce limitations:**
- Same "no automated real-org testing" limitation as everything else in this
  codebase — this is a genuine interaction-heavy feature (scroll timing, highlight
  positioning across Lightning's nested/shadow layouts) that needs a real click-through
  more than most.
- `scrollIntoView`'s "smooth" behavior has no completion callback, and (found in real-
  org testing, fixed in `#61` — see the additions section below) can't be trusted
  alone against Salesforce's pinned/sticky headers and nested scroll containers either.
  A verify-and-correct pass now runs after it should have settled.
- The de-duplication key (`apiName + type`) means only the FIRST on-page occurrence of
  a repeated entry (e.g. a field shown on both a detail panel and a related list) is
  ever the navigation target — a deliberate simplification, not a bug, but worth
  knowing if the same field appears twice and only one occurrence is reachable by
  scroll.

**Duplicates — designed, deliberately NOT shipped in v1:** re-read the brief's own
caution here before building this — "do not assume every repeated translation is a
problem." The reliable, safe definition arrived at: for a given active NON-base
language, group all on-page entries by their translated value; a group is only flagged
when it has 2+ DISTINCT entries (`apiName`+`type`) **whose BASE-LANGUAGE values differ
from each other**. If the base values are the SAME (e.g. multiple genuinely different
buttons/fields honestly named "Save" in English), an identical translation is EXPECTED,
not a bug, and must not be flagged — this is exactly the "legitimately expected" vs.
"different source labels incorrectly sharing a value" distinction the brief asked for,
and it's computable from data already fetched (no new API calls). Deferred to its own
follow-up specifically because it needs a first real-org look at what actual duplicate
clusters look like before trusting the panel to surface them — the same "don't guess at
a heuristic without real bad-data examples" discipline PHASE 10's QA Report v2 items
already follow. Implementing it is now a small, well-specified addition (one more pass
over `scan()`'s already-collected entries, one more filter tab) whenever that real-org
look happens.

**Future extensions (not this session):** the Duplicated filter above; extending
guided navigation to Translation Health's ORG-WIDE list (today's audit panel only
covers what's actually on the CURRENT page, by design — reaching an off-page entry
would require navigating Salesforce itself first, a materially different mechanism);
keyboard shortcuts for Next/Prev (ties into PHASE 17's existing hotkey infrastructure,
natural fit, not built yet); remembering filter/position across a page navigation
within the same record page (today's state is page-load-scoped, matching how
Translation Mode's own scan already resets).

### PHASE 18 additions — first real-org bug round shipped (`DECISIONS.md #61`, 2026-07-21)
Found via actual guided-navigation use on a real Lightning page, same day v1 shipped —
exactly the "needs a real click-through" caveat above paying off. Four fixes, each
root-caused rather than patched:

- **Sticky/pinned-header navigation fixed.** `scrollIntoView` alone couldn't be
  trusted against Salesforce's pinned headers and nested scroll containers — it could
  decide a `position: sticky` target was "already visible" by its own rect math, or
  scroll the wrong container, while the highlight overlay (computed independently via
  live `getBoundingClientRect()`) kept tracking correctly regardless, which is exactly
  why the target looked right but the viewport didn't move. Fixed with a
  verify-and-correct pass (`ensureVisibleAboveObstruction` in `content/index.tsx`) that
  measures where the target actually ended up and applies a direct corrective scroll on
  its REAL scrolling ancestor if it's covered by pinned chrome — generic (samples the
  live DOM for `position: fixed`/`sticky`, no hardcoded Salesforce selectors) and
  symmetric (doesn't care which direction the navigation came from). `dom-utils.ts`'s
  `parentAcrossShadow` was exported rather than reimplemented for the shadow-piercing
  ancestor walks this needed.
- **Editor-closes-on-click root cause found and fixed — a real Dynamic Hover parity
  gap, not a click-outside/shadow-DOM bug.** `reconcileAfterEdit()` used to check only
  `isEngineLive()`, which is ALWAYS false while Translation Mode is on — so finishing
  ANY edit inside the TM/audit editor (even a harmless textarea blur from clicking a
  different row's own button) unconditionally tore the whole tooltip down. Dynamic
  Hover never hit this because `isEngineLive()` stays true there. Fixed by also
  checking `!tmEditorOpen` — genuine parity, not a second interaction model. Navigating
  to a new entry (Next/Previous/a different filter) now explicitly cancels an
  in-progress edit first, matching Escape/outside-click's existing precedent (`#55`).
- **Complete tab overflow fixed structurally, not with a pixel patch.** The filter
  tabs row was `display: flex` with no wrap/shrink, so four pills with count badges
  could overflow past the panel's right edge once counts hit double digits. Switched
  to a 4-column CSS grid (always exactly matches the container's content width) and
  restructured each tab to stack its label above its count instead of fighting for
  width on one line.
- **Translation scope (all fields vs. current field), evaluated and shipped as a
  session-local toggle, not a persisted setting.** Both modes are real, requested, and
  cheap to support: "All fields" (default) is the existing behavior; "Current only"
  hides every on-page badge except the audit panel's current target, via a new
  presentational-only `setBadgeScope()` in `translation-mode.tsx` (no re-scan, no
  re-fetch — just toggling `display:none` on already-built badges). Lives as a
  single click-to-flip button in the panel's own header, not a `Settings` field — this
  is a live workflow control flipped mid-session, the same category as the panel's own
  filter/expanded state, not a stable cross-session preference.

Full write-up, including the exact root-cause reasoning for each: `DECISIONS.md #61`.

### PHASE 18 additions — production polish round shipped (`DECISIONS.md #62`, 2026-07-21)
Second real-org feedback round, focused on making the feature feel inevitable rather
than merely correct. Full reasoning per item in `DECISIONS.md #62`; the behaviour that
now holds:

- **Modal lifecycle rules (final).** The inspector stays open through EVERY interaction
  inside it — clicking metadata text, the type badge, Copy buttons, another language's
  edit pencil, Save, Cancel, editing and saving a value. That is enforced in ONE place
  (a root-level `onMouseDown` in `Tooltip.tsx` that swallows the focus-stealing default
  action while an edit is open), not per element. It closes only on: a click on page
  content outside it (one click, even mid-edit), Escape, or a state transition —
  navigate to another target, change filter, type in the search box, toggle scope,
  collapse the panel, turn Translate All off. All transitions funnel through
  `invalidateAuditContext()` in `content/index.tsx`; nothing else may close it.
- **Escape ladder:** cancel the edit → close the inspector → clear the search →
  collapse the panel. One level per press.
- **Internal list scrolling.** The panel's own list keeps the active row visible
  (`scrollRowIntoList` in `AuditPanel.tsx`) on Next/Prev, row selection, filtering and
  searching — scrolling ONLY its own container (never `scrollIntoView`, which would
  drag the Salesforce page along with it and fight guided navigation's own corrected
  scroll), smoothly, and only when the row isn't already comfortably visible.
- **Integrated search.** One box above the filter tabs, matching API name, displayed
  name, type label and every translated value. It is a second axis ON TOP of the
  filters (search + Missing = missing entries matching the search), and tab counts
  reflect the searched set so switching tabs mid-search isn't blind.
- **Status visual language.** Continuous colour rails on rows (bands of same-status
  rows are scannable in a way dots never were), the same rail on the current-target
  card, status colour on the ACTIVE tab only, per-row language-code suffixes
  (`ES FR`), and an active row marked by weight + tint + inset border. No filled
  status backgrounds, no permanently-coloured tab row — deliberately not a dashboard.
- **Translate All ↔ inspection: no new mechanism.** Navigating to ANY entry now opens
  the same inspector tooltip; status/editability only decide whether it opens
  pre-seeded on the problem language or read-only. The previous behaviour (inspector
  for editable problem entries, nothing at all for `complete`/non-editable ones) was
  the actual source of the "I have to exit Translate All and turn on Dynamic Hover"
  friction. No Inspect button, no new shortcut, no second inspection system.

**Known limitation — sticky/pinned headers (carried, now bounded).** The
verify-and-correct pass from `#61` runs TWICE (a correction inside a nested scroll
container can itself move the target under chrome that wasn't obstructing when the
first measurement was taken; Lightning's highlights panel changes height as the page
scrolls). Deliberately no third pass — past two this is chasing an animation, not
converging. If a real org still lands a target under pinned chrome after two passes,
the root cause is that Lightning's scroll-linked layout is still settling when we
measure, and the correct fix is a `scrollend`/obstruction-`MutationObserver`-driven
wait rather than more retries or a hardcoded Salesforce selector. Revisit here, in this
phase, only with a concrete reproduction from a real page.

**Still open in this phase:** the Duplicated filter (designed in full above, needs a
real-org look at actual duplicate clusters first); keyboard shortcuts for Next/Prev
(PHASE 17 infrastructure, natural fit, still not built); extending guided navigation to
Translation Health's org-wide list.


### PHASE 18 additions — regression round + interaction model (`DECISIONS.md #63`, 2026-07-21)
Triggered by a reported regression ("the Dynamic Hover modal used to survive clicks
inside it"). The cause was NOT in the click logic: `ensureShadowRoot()` cached on
`host.shadowRoot`, which is always `null` for a CLOSED root, so each mount built its own
`#sti-root` host and the `e.target === shadowHost` ownership check (`#54`) failed for
whichever surface's host wasn't created last. Full write-up in `DECISIONS.md #63`.

What now holds:

- **One shadow host, verified.** Both React roots genuinely share one closed root, as
  the architecture always claimed.
- **Interaction priority model** in `content/interaction.ts`, documented in
  `ARCHITECTURE.md` and unit-tested — including a regression test that pins BOTH
  surfaces to the same outside-click rule, which is what the `#62` regression escaped.
- **Two-stage dismissal restored** (`#55`): first outside click / Escape cancels the
  edit, the second closes. Escape ladders one level per press: cancel edit → close
  inspector → clear search → collapse panel.
- **Both surfaces cancel through ONE mechanism** (`cancelTrigger`). The inspector's old
  path relied on a `render(null)` "force remount" that React 18 batches away, so Escape
  and outside-click silently did nothing there.
- **The modal follows its subject** while scrolling (element-anchored via `anchorEl`),
  freezing while an edit is open or the pointer is over it, and hiding — never
  unmounting — while the subject is off screen. The hover tooltip deliberately does not
  follow: it has no persistent subject.
- **The selection highlight is viewport-bounded**: it tracks while its element is on
  screen and stops being drawn when it isn't, rather than following it off the edge. Same
  `isElementInViewport` predicate as the modal, so the two can never disagree.
- **Metadata-type chips** (`typeLabel()` strings — the same names the row badges show),
  multi-select, only for types present on the page, ANDed with search and the status
  tabs. Field and Custom Field are separate categories because the badges already split
  them that way; selecting both is the union.
- **Keyboard navigation**: Up/Down and Left/Right for prev/next, Enter to activate, all
  routed through the same `handleAuditNavigate` the buttons use. Silent while editing
  and while focus is in a real Salesforce field; inside the panel's search box Up/Down
  navigate but Left/Right stay with the caret.
- **The selected row lifts off the list** (white card, shadow, blue leading edge, ▸
  caret) instead of being a slightly different shade.

**A real-browser dev harness now exists** (`dev-harness/`, `npm run harness`) — see
`ARCHITECTURE.md` for what it is, what it found, and the limits that matter (backgrounded
tab: no scroll events, no rAF, no smooth scrolling).

### PHASE 17 additions — navigation shortcut configuration (designed, deliberately NOT built)
Requested alongside `#63`'s keyboard navigation, for compact/60% keyboards where arrows
need a modifier. Real concern, deliberately deferred: building a five-binding recorder UI
now means designing conflict rules against three existing shortcuts before a single
actual collision has been reported — configuration ahead of evidence, which PHASE 17
already had to simplify back down once (`#57`). Arrows and Enter are also the one set no
user has to learn.

Pick this up when a real collision is reported. It is a small addition: `ShortcutToggleRow`
(`#57`) already provides a conflict-checked recorder, `shared/hotkeys.ts` already provides
the comparison logic, and `interaction.ts`'s `resolveNavKey` is the single place that maps
a key to a navigation action — so making it read configured keys instead of hardcoded ones
touches one function, not the interaction model.


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

