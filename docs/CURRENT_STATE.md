# Current state

*Read this first, every session, before anything else — it's short on purpose.*
*Update it last, every session, before ending — see `WORKFLOW.md` for the exact steps.*

**Last updated:** 2026-07-21

## Active work

`bug/editing-and-hover-polish` now has FOUR rounds of real-org-driven fixes/changes
plus one same-branch roadmap item (see below) — verified (typecheck/tests/build),
pending push. PHASE 6b itself (`DECISIONS.md #53`) is already merged to `main`. No
other Epic open.

**Settled this session, no longer open questions:**
- **Product scope narrowed to Simple Mode** (`DECISIONS.md #56`, `PRODUCT.md`): default
  surface is objects/fields/picklists/Custom Labels; everything else stays built,
  reachable via a single Advanced toggle. `Settings.simpleMode`, default `true`.
- **Copy SOQL/XML Member removed entirely** (`#56`) — kept the extension simple per
  direct feedback; PHASE 16's future Workspace covers the same need automatically.
- The previously-paused "Pin Mode" hotkey idea is now BUILT, redesigned as two
  independent keys (toggle = sticky pin, hold = temporary live retarget) — see below.
- **Round 4** (`#57`/`#58`): the popup's confusing "Always"/"Off" hotkey UI is now a
  plain Enabled/Disabled + key-recorder shape with mutual conflict prevention, and
  Translation Mode/Translation Health now surface missing + identical-to-source
  signals instead of silently omitting them — both closed out below.

## Git workflow (established 2026-07-20)

`main` is kept stable; work happens on `feature/`/`bug/`/`refactor/` branches per
Epic/fix/refactor, merged back once real-org-verified. Branch naming, commit, and PR
conventions are documented in `WORKFLOW.md`'s "Git workflow" section; a PR description
template lives at `.github/PULL_REQUEST_TEMPLATE.md`. Repo:
https://github.com/ManuelRP15/SalesLens.

## What just happened (most recent session — 4 rounds on `bug/editing-and-hover-polish`)

**Round 4** (`DECISIONS.md #57`/`#58`) — shortcut settings UX fix (direct real-org
feedback on round 3's hover redesign) + one roadmap item picked and finished in the
same session:
- **Shortcut settings UX redesign (`#57`)**: the popup's Toggle Inspection Mode/Hold to
  move tooltip rows now use a shared `ShortcutToggleRow` — an Enabled/Disabled pill
  switch + a key recorder that's dimmed/inert while disabled — replacing the confusing
  "Always"/"Off" buttons (clicking Hold to move's "Off" previously left the recorder
  showing "Always on," a placeholder meant for the other setting's different
  null-meaning). Pure UI relabel — `content/index.tsx`'s actual hover-engine behavior
  is unchanged (disabled `inspectorHotkey` still falls back to classic Always Hover).
  New: the two shortcuts can't be set to the same key anymore (`shared/hotkeys.ts`'s
  `bareKeysConflict`/`pickAvailableBareKey`), with an inline explanation instead of a
  silent override.
- **Missing + identical-to-source signals (`#58`)**: picked from `ROADMAP.md`'s PHASE
  9/10 and `PRODUCT.md`'s still-open MVP capability #4 as the highest-value, lowest-risk
  next item — pure computation over already-fetched data, extends two features already
  near-production instead of opening new surface area. Translation Mode chips now show
  EVERY active language (a missing one gets a dashed "— missing —" chip, clickable to
  fill in when editable, instead of silently vanishing); a value identical to the base
  language gets a small "≈" mark. Translation Health gained a matching "Possibly
  untranslated" column. Both gated the same way: `Settings.flagIdenticalTranslations`
  (default on) controls the identical-flag specifically (a soft heuristic, not a hard
  rule); missing-language display is unconditional.

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
  `"en_US"` (`#41`) — untested against a non-English-base org. The new
  identical-to-source detection (`#58`) makes the SAME assumption (`HEALTH_BASE_LANG`
  in `background/index.ts`) — a non-English-base org would need this re-checked too.
- Enter-to-edit (PHASE 17, `#49`) has not been verified against a real org/keyboard.
- **The shortcut settings UX redesign (`#57`) needs a real popup click-through** —
  confirm the Enabled/Disabled switch reads clearly, the conflict message actually
  appears when trying to reuse the other shortcut's key, and re-enabling a shortcut
  after disabling it lands on a sensible key.
- **Missing/identical-to-source chips (`#58`) need a real-org visual check** — confirm
  the dashed "missing" chip doesn't clutter dense pages, the "≈" identical mark reads
  as a hint rather than an error, and clicking a missing chip on an editable type
  actually opens the editor with an empty starting value.

## Immediate next step

Push `bug/editing-and-hover-polish`, open its PR, and re-test on a sandbox org — the
hover redesign (`#56`), the shortcut settings UX (`#57`), the missing/identical chips
(`#58`), and PHASE 6b editing (custom fields/picklists only now) are the highest-value
things to confirm. Once merged, next candidates (see `ROADMAP.md`'s status table):
PHASE 16 (Workspace, **Muy Alta**, large — own dedicated session(s)), PHASE 6c
(ObjectLabel/RelatedList, global QuickAction, standard field/picklist editing —
deliberately lower priority now that Simple Mode centers the product on custom
fields/picklists), rest of PHASE 17 (arrow-key navigation, blocked on PHASE 18's match
list), rest of PHASE 10's QA Report v2 (Duplicated/Broken/Terminology — each needs real
bad-data examples before a heuristic is designed, not a guess).
