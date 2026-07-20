# Current state

*Read this first, every session, before anything else — it's short on purpose.*
*Update it last, every session, before ending — see `WORKFLOW.md` for the exact steps.*

**Last updated:** 2026-07-21

## Active work

`feature/phase6b-metadata-deploy` has PHASE 6b (Metadata deploy() pipeline, 8 more
editable types) complete, docs updated, pending final verification + push. Everything
else this session (`bug/translation-mode-editor` PR #1, `bug/tooltip-click-through-closes`
PR #2) is already merged to `main`. No other Epic open.

**Open question, not yet decided:** whether to remove Copy SOQL/XML Member (PHASE 14,
`DECISIONS.md #48`) — raised 2026-07-21 on the theory that PHASE 16's Workspace will
make manual snippet-copying redundant. Recommended removing it; user hasn't confirmed
either way yet. Don't act on this without an explicit go-ahead.

## Git workflow (established 2026-07-20)

`main` is kept stable; work happens on `feature/`/`bug/`/`refactor/` branches per
Epic/fix/refactor, merged back once real-org-verified. Branch naming, commit, and PR
conventions are documented in `WORKFLOW.md`'s "Git workflow" section; a PR description
template lives at `.github/PULL_REQUEST_TEMPLATE.md`. Repo:
https://github.com/ManuelRP15/SalesLens.

## What just happened (most recent session — PHASE 6b + hover fix)

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
- **PHASE 6b's deploy() pipeline (`DECISIONS.md #53`) is the highest-stakes unverified
  item in the project** — it's a real write to org metadata, not just a UI behavior.
  Test on a sandbox/dev org before trusting broadly: both patching an EXISTING
  translation and filling in a MISSING one, for at least `FieldLabel` and one other
  type (e.g. `PicklistValue`).
- The tooltip persist-through-inside-clicks fix (`#52`) and the Translation Mode editor
  fix (`#50`) are both merged but still need a real-org click to confirm.
- The CustomLabel Setup-navigation URL (`#47`) and the custom-field Id-based URL
  (`#51`) both specifically need a real-org click to confirm they open the expected
  page.
- Custom Label base-language editing assumes the org's default language is always keyed
  `"en_US"` (`#41`) — untested against a non-English-base org.
- Buttons/quick actions/sections/related lists are implemented but explicitly flagged
  "not yet verified against a real org" in `ROADMAP.md` PHASE 4/9 notes.
- Enter-to-edit (PHASE 17, `#49`) has not been verified against a real org/keyboard.

## Immediate next step

Verify + push `feature/phase6b-metadata-deploy`, open its PR. Once the user has
real-org-tested PHASE 6b (sandbox first) and it's merged, decide the Copy SOQL/XML
question above, then next candidates (see `ROADMAP.md`'s status table): PHASE 16
(Workspace/package.xml Builder, **Muy Alta** priority, large — needs its own dedicated
session(s)), PHASE 6c (ObjectLabel/RelatedList), the rest of PHASE 17 (arrow-key
navigation, blocked on PHASE 18's match list).
