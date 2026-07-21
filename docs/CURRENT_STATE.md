# Current state

*Read this first, every session, before anything else — it's short on purpose.*
*Update it last, every session, before ending — see `WORKFLOW.md` for the exact steps.*

**Last updated:** 2026-07-21

## Active work

`bug/editing-and-hover-polish` now has TWO rounds of fixes from real-org testing of
PHASE 6b (see below) — verified (typecheck/tests/build), pending push. PHASE 6b itself
(`DECISIONS.md #53`) is already merged to `main`. No other Epic open.

**Open questions, not yet decided — don't act on either without explicit confirmation:**
- Whether to remove Copy SOQL/XML Member (PHASE 14, `DECISIONS.md #48`) — raised
  2026-07-21 on the theory that PHASE 16's Workspace will make manual snippet-copying
  redundant. Recommended removing it.
- **Whether to narrow the product's active metadata scope** to just objects, fields
  (standard + custom), custom fields, picklist values, and Custom Labels — raised
  2026-07-21 by the user after the standard-field/QuickAction bugs, questioning whether
  covering every metadata type (buttons, quick actions, tabs, apps, record types,
  layout sections...) is worth the edge-case cost. Agent's recommendation: yes, narrow
  it — nothing already built would be ripped out, just deprioritized for further
  fixes/polish. Awaiting explicit go-ahead before updating `PRODUCT.md`/`ROADMAP.md`.
- **A new "Pin Mode" hotkey** (configurable key that locks the tooltip onto one field,
  not retargeting on mouse move, distinct from the existing transient Inspection Mode)
  was requested 2026-07-21 but deliberately NOT built this session — paused pending the
  scope question above, since building new hotkey-configuration complexity while
  actively discussing whether to cut scope would be premature.

## Git workflow (established 2026-07-20)

`main` is kept stable; work happens on `feature/`/`bug/`/`refactor/` branches per
Epic/fix/refactor, merged back once real-org-verified. Branch naming, commit, and PR
conventions are documented in `WORKFLOW.md`'s "Git workflow" section; a PR description
template lives at `.github/PULL_REQUEST_TEMPLATE.md`. Repo:
https://github.com/ManuelRP15/SalesLens.

## What just happened (most recent session — two rounds of real-org fixes for PHASE 6b)

**Round 1** (`DECISIONS.md #54`):
- **Editing a metadata translation blanked the row and dropped the language.** The
  optimistic-concurrency check compared the deployable file's admin OVERRIDE against
  the tooltip's displayed value — but the displayed value is usually Salesforce's
  STANDARD translation, which isn't in that file at all, so every such save reported a
  bogus conflict and adopted the empty value. Fixed by comparing against the expected
  override (empty when the shown value was standard), plus marking the language
  customized after a successful save so a second edit doesn't re-trigger it.
- **The tooltip still closed on a click inside it.** Made it a solid surface
  (`pointer-events: auto`) so any inside click retargets to the closed shadow host and
  the `e.target === shadowHost` check keeps it open — no stale geometry. Reverses
  #45/#52's pass-through approach (accepted tradeoff: can't click *through* it anymore).
  Also removed a per-pointer-move `console.log` that hurt hover responsiveness.
- **QuickAction limitation surfaced:** global/standard actions (New Contact, Log a
  Call…) can't be written via the object's CustomObjectTranslation and now fail with a
  clear "not supported yet" message instead of a raw metadata error. Object-specific
  custom quick actions still work. Full global-QA support deferred (needs a real-org-
  verified `Translations` write path).

**Round 2** (`DECISIONS.md #55`), found by testing round 1's fix:
- **Standard field/picklist edits still failed** — "Element fields is duplicated at
  this location in type CustomObjectTranslation." `locateOrCreateBlock`'s insert path
  blindly appended new XML nodes at the very end of the document, breaking Salesforce's
  XSD requirement that repeated elements (`<fields>`) stay contiguous — it split the
  group the moment ANY later-in-schema element (`<validationRules>`, `<webLinks>`...)
  already existed after it. This is exactly why custom fields "worked" (patching an
  existing, already-contiguous override) while standard fields (almost always a
  first-time insert) failed. Fixed with a new `insertContainerNode` that keeps same-tag
  siblings adjacent; regression-tested against the exact real-org shape.
- **Escape and outside-click did nothing while an edit was in progress** — only the
  Cancel button worked, which the user correctly flagged as unintuitive. Root cause:
  the fallback relied on the focused textarea's own local Escape handler, but a
  disabled-during-save Save button steals focus away and it doesn't return on error.
  Fixed with a `cancelTrigger` counter (mirrors PHASE 17's `editTrigger`) that lets
  `content/index.tsx` explicitly cancel the edit with no dependency on DOM focus.
  Deliberately scoped to match Cancel's own behavior (cancels the edit, tooltip stays
  open) — a second Escape/outside-click then closes it via the normal path.

## Earlier this session — PHASE 6b + hover fix

**PHASE 6b shipped** (`DECISIONS.md #53`) — editing extended from Custom-Labels-only to
9 of 13 `LabelType`s: `FieldLabel`, `RecordType`, `WebLink`, `QuickAction`,
`LayoutSection`, `PicklistValue` (both field-scoped and global-value-set), `CustomTab`,
`CustomApplication` now save through a new Metadata API `deploy()` pipeline
(`metadata-write.ts`), alongside Custom Label's existing Tooling API PATCH path. Same
shared tooltip editor, same optimistic-concurrency discipline, same
`isEditableLabelType()` gate — almost no UI code changed. `ObjectLabel`/`RelatedList`
stay deferred (PHASE 6c, `<caseValues>` grammatical-case complexity);
`StandardButton`/`StandardTab` are permanently non-editable (Salesforce's own
platform-controlled translations, not admin content). Unit-tested (preserveOrder
patch/insert/fresh-document logic, 12 new tests) but **NOT real-org verified — this is
a genuine write to org metadata, confirm on a sandbox/dev org first**, starting with
one `FieldLabel` edit.

**Also this session:** fixed the tooltip closing on any click inside it, even
pass-through clicks that hit real page content underneath (`DECISIONS.md #52`, PR #2,
merged) — reverses lesson #45's old tradeoff per direct product feedback.

Previous session (2026-07-20, stabilization): fixed Translation Mode's editor
immediately closing itself (`#50`) and custom-field Setup navigation
("Insufficient Privileges", `#51`), merged PHASE 17 (Enter-to-edit, `#49`), established
the git workflow above (PR #1, merged).

Previous session: a batch of hover polish + two new capabilities (`#44`–`#48`): hover
glyph-rect fine-tuning, Translation Mode Custom Label editing, PHASE 5 Setup
navigation, PHASE 14 Copy SOQL/XML.

Previous session: documentation architecture rebuilt (`CLAUDE.md` + `docs/*.md`) and
hover/editing stabilization (optimistic concurrency, Inspection Mode) — `#41`–`#43`.

## Known gaps / untested — check before assuming something works

- **Nothing in this codebase has been verified against a real Salesforce org by the
  agent, ever.** Every "done" feature is confirmed only by build/typecheck/unit tests
  unless stated otherwise below. Don't report something as working end-to-end without
  saying this caveat.
- **PHASE 6b's deploy() pipeline is a real write to org metadata** — still the
  highest-stakes area. Two real-org bugs found and fixed (`#54`, `#55`), but this needs
  a fresh sandbox/dev org re-test: patch an EXISTING translation AND fill in a MISSING
  one, for both a STANDARD and a CUSTOM field/picklist (the duplicate-fields bug
  specifically hit standard/first-time inserts). Confirm the value doesn't vanish, a
  second consecutive edit doesn't false-conflict, and the deploy doesn't error.
- **Escape/outside-click-to-cancel during an edit (`#55`) needs a real-org click to
  confirm** — logically sound, unit-tested indirectly via the same patterns as
  everything else in `Tooltip.tsx`, but this specific interaction (disabled Save button
  stealing focus, then Escape/outside-click recovering) hasn't been clicked through.
- **QuickAction editing works only for object-specific custom actions** — global/
  standard actions (New Contact, Log a Call…) show a "not supported yet" message
  (`#54`). Full global-QA support is deferred.
- The tooltip solid/persist fix (`#54`, supersedes `#52`) and the Translation Mode
  editor fix (`#50`) still need a real-org click to confirm.
- The CustomLabel Setup-navigation URL (`#47`) and the custom-field Id-based URL
  (`#51`) both specifically need a real-org click to confirm they open the expected
  page.
- Custom Label base-language editing assumes the org's default language is always keyed
  `"en_US"` (`#41`) — untested against a non-English-base org.
- Buttons/quick actions/sections/related lists are implemented but explicitly flagged
  "not yet verified against a real org" in `ROADMAP.md` PHASE 4/9 notes.
- Enter-to-edit (PHASE 17, `#49`) has not been verified against a real org/keyboard.

## Immediate next step

Push `bug/editing-and-hover-polish`, open its PR, and re-test on a sandbox org: PHASE
6b editing (standard AND custom field/picklist, both patch and insert cases) and the
Escape/outside-click-cancels-an-edit fix. Once merged, get the user's answer on the two
open questions above (scope narrowing, Copy SOQL/XML) — the scope answer in particular
should shape what "next" even means, so resolve it before picking a next Epic. If scope
narrows, PHASE 16/6c/17/18/19 all need re-evaluating against the new boundary rather
than assumed as-is.
