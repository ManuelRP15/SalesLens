# Current state

*Read this first, every session, before anything else — it's short on purpose.*
*Update it last, every session, before ending — see `WORKFLOW.md` for the exact steps.*

**Last updated:** 2026-07-21

## Active work

`bug/editing-and-hover-polish` now has THREE rounds of real-org-driven fixes/changes
(see below) — verified (typecheck/tests/build), pending push. PHASE 6b itself
(`DECISIONS.md #53`) is already merged to `main`. No other Epic open.

**Settled this session, no longer open questions:**
- **Product scope narrowed to Simple Mode** (`DECISIONS.md #56`, `PRODUCT.md`): default
  surface is objects/fields/picklists/Custom Labels; everything else stays built,
  reachable via a single Advanced toggle. `Settings.simpleMode`, default `true`.
- **Copy SOQL/XML Member removed entirely** (`#56`) — kept the extension simple per
  direct feedback; PHASE 16's future Workspace covers the same need automatically.
- The previously-paused "Pin Mode" hotkey idea is now BUILT, redesigned as two
  independent keys (toggle = sticky pin, hold = temporary live retarget) — see below.

## Git workflow (established 2026-07-20)

`main` is kept stable; work happens on `feature/`/`bug/`/`refactor/` branches per
Epic/fix/refactor, merged back once real-org-verified. Branch naming, commit, and PR
conventions are documented in `WORKFLOW.md`'s "Git workflow" section; a PR description
template lives at `.github/PULL_REQUEST_TEMPLATE.md`. Repo:
https://github.com/ManuelRP15/SalesLens.

## What just happened (most recent session — 3 rounds on `bug/editing-and-hover-polish`)

**Round 3** (`DECISIONS.md #56`) — product scope + hover redesign + tooltip cleanup,
prompted by the user questioning whether the project was chasing too much metadata
breadth:
- **Simple Mode**: `isInSimpleScope()` (`types.ts`) filters `RESOLVE_TEXT`/
  `RESOLVE_TEXTS_BULK`/Translation Health at ONE choke point in `background/index.ts`
  (`applySimpleScope`) — hover, Translation Mode, and Translation Health all respect it
  automatically. A synchronous `cachedSettings` mirror (kept fresh via
  `chrome.storage.onChanged`) avoids an async storage read on the hot hover path.
  Toggle lives in the popup, prominent, default on.
- **`FieldLabel`/`PicklistValue` editing narrowed to custom (`__c`) only** —
  `isEditableEntry(entry)` (`types.ts`) supersedes bare `isEditableLabelType(type)` for
  these two types; standard fields/picklists stay fully readable, just not editable
  (real Salesforce rejections confirmed they need a different, unbuilt write
  mechanism — `StandardValueSetTranslation` for picklists).
- **Hover engine redesigned**: `inspectorHotkey` (Alt) now toggles a STICKY pin — once
  something's pinned, mouse movement alone never retargets it. A new, independent
  `holdHotkey` (Shift) grants temporary live retargeting while held, pinning on
  release — works standalone too (toggle mode never needs to be on). Magnifier cursor
  now hides once something's pinned. Escape/outside-click can now close a
  standalone-hold-pinned tooltip too (previously had no way to be dismissed).
  **Real-org UNVERIFIED — a genuine interaction-model change, not a bug fix.**
- **Tooltip simplified**: the "✎ customized" mark removed (both hover rows and TM
  chips); Copy SOQL/Copy XML Member removed entirely (buttons + the now-dead
  `tooltip-constants.ts` functions).

**Round 2** (`DECISIONS.md #55`), found by testing round 1's fix:
- **Standard field/picklist edits failed** — "Element fields is duplicated at this
  location in type CustomObjectTranslation." `locateOrCreateBlock`'s insert path
  blindly appended new XML nodes at the very end of the document, breaking Salesforce's
  XSD requirement that repeated elements (`<fields>`) stay contiguous. Fixed with
  `insertContainerNode`, which keeps same-tag siblings adjacent; regression-tested
  against the exact real-org shape. (Superseded in practice by round 3's narrowing —
  standard field editing is no longer offered at all — but the fix is real and still
  applies to every OTHER insert case: custom fields/picklists, record types, etc.)
- **Escape and outside-click did nothing while an edit was in progress** — only Cancel
  worked. Fixed with a `cancelTrigger` counter (mirrors PHASE 17's `editTrigger`) so
  `content/index.tsx` can cancel the edit with no dependency on DOM focus.

**Round 1** (`DECISIONS.md #54`):
- **Editing a metadata translation blanked the row and dropped the language** — the
  concurrency check compared the deployable file's override against the tooltip's
  (often standard, not-in-that-file) displayed value. Fixed by comparing against the
  expected override instead.
- **The tooltip closed on any click inside it** — made it a solid surface
  (`pointer-events: auto`); superseded again by round 3's hold/toggle redesign but the
  solid-surface fix itself is unchanged and still load-bearing.
- **QuickAction limitation surfaced**: global/standard actions can't be written via the
  object's CustomObjectTranslation — clean "not supported yet" message instead of a raw
  error. Object-specific custom quick actions still work.

## Earlier this session — PHASE 6b + hover fix (now merged to `main`)

**PHASE 6b shipped** (`DECISIONS.md #53`) — editing extended from Custom-Labels-only to
8 more `LabelType`s via a new Metadata API `deploy()` pipeline (`metadata-write.ts`).
Real-org testing (rounds 1–3 above) found and fixed real bugs in this pipeline; treat
the ORIGINAL PHASE 6b entry as historical context, `#54`/`#55`/`#56` as the current
state of what actually works.

Previous session (2026-07-20, stabilization): fixed Translation Mode's editor
immediately closing itself (`#50`) and custom-field Setup navigation
("Insufficient Privileges", `#51`), merged PHASE 17 (Enter-to-edit, `#49`), established
the git workflow above (PR #1, merged).

Previous session: a batch of hover polish + two new capabilities (`#44`–`#48`): hover
glyph-rect fine-tuning, Translation Mode Custom Label editing, PHASE 5 Setup
navigation, PHASE 14 Copy SOQL/XML (later removed, see round 3 above).

Previous session: documentation architecture rebuilt (`CLAUDE.md` + `docs/*.md`) and
hover/editing stabilization (optimistic concurrency, Inspection Mode) — `#41`–`#43`.

## Known gaps / untested — check before assuming something works

- **Nothing in this codebase has been verified against a real Salesforce org by the
  agent, ever.** Every "done" feature is confirmed only by build/typecheck/unit tests
  unless stated otherwise below. Don't report something as working end-to-end without
  saying this caveat.
- **The hover engine redesign (`#56`) is the highest-priority thing to re-test** — a
  genuine interaction-model change (sticky toggle pin, independent hold-to-move,
  magnifier show/hide, both close paths for toggle-pinned AND standalone-hold-pinned
  tooltips). Test: toggle key pins and stays pinned through mouse movement; hold key
  moves it live and re-pins on release; hold key works even with toggle mode off;
  Escape/outside-click close both cases; magnifier only shows while searching.
- **PHASE 6b's deploy() pipeline is a real write to org metadata** — still high-stakes.
  Three real-org bugs found and fixed (`#54`, `#55`, `#56`'s narrowing). Re-test on a
  sandbox/dev org: patch an EXISTING custom field/picklist translation AND fill in a
  MISSING one. Standard fields/picklists should no longer show an edit button at all
  (confirm they don't — that's the fix, not a gap).
- **QuickAction editing works only for object-specific custom actions** — global/
  standard actions show a "not supported yet" message (`#54`). Deferred (PHASE 6c).
- **Simple Mode's default-on scoping (`#56`) needs a real-org check** — toggle it off
  and confirm advanced types (buttons, quick actions, etc.) still resolve exactly as
  before; toggle it on and confirm they cleanly disappear from hover/TM/Health.
- The Translation Mode editor fix (`#50`) still needs a real-org click to confirm.
- The CustomLabel Setup-navigation URL (`#47`) and the custom-field Id-based URL
  (`#51`) both specifically need a real-org click to confirm they open the expected
  page.
- Custom Label base-language editing assumes the org's default language is always keyed
  `"en_US"` (`#41`) — untested against a non-English-base org.
- Enter-to-edit (PHASE 17, `#49`) has not been verified against a real org/keyboard.

## Immediate next step

Push `bug/editing-and-hover-polish`, open its PR, and re-test on a sandbox org — the
hover redesign and PHASE 6b editing (custom fields/picklists only now) are the two
highest-value things to confirm. Once merged, next candidates (see `ROADMAP.md`'s
status table, now updated for Simple Mode scope): PHASE 16 (Workspace, **Muy Alta**,
large — own dedicated session(s)), PHASE 6c (ObjectLabel/RelatedList, global
QuickAction, standard field/picklist editing — deliberately lower priority now that
Simple Mode centers the product on custom fields/picklists), rest of PHASE 17
(arrow-key navigation, blocked on PHASE 18's match list).
