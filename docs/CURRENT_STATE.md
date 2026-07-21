# Current state

*Read this first, every session, before anything else — it's short on purpose.*
*Update it last, every session, before ending — see `WORKFLOW.md` for the exact steps.*

**Last updated:** 2026-07-21

## Active work

`feature/quick-compare` (off `main`, which now has PHASE 6b + rounds 1-4/`#53`-`#58`
all merged) — Quick Compare shipped (`DECISIONS.md #59`), verified
(typecheck/tests/build + a static visual mockup check), pending push/PR. No other
Epic open.

**Settled this session, no longer open questions:**
- **Quick Compare closes `PRODUCT.md`'s MVP capability #2** (Translation Inspector) —
  the hover tooltip now shows every active language per candidate (present or
  missing, not just for editable types) and marks a value identical to the source
  language, reusing `#58`'s `Settings.flagIdenticalTranslations` rather than adding a
  new setting. Built as an enhancement to the existing tooltip rows, not a new
  display mode or panel.
- **`BASE_LANGUAGE` centralized** in `shared/types.ts` — `metadata-translations.ts`,
  `background/index.ts`, `content/translation-mode.tsx`, and the new usage in
  `Tooltip.tsx` all import the one constant instead of each declaring their own
  `"en_US"` copy. `salesforce-api.ts`'s write-path `CUSTOM_LABEL_BASE_LANGUAGE`
  deliberately left alone (same value, different concern, write-path code doesn't get
  touched for an unrelated read-side cleanup).
- **PHASE 11's OTHER half (language order/colors/icons, visibility profiles) stays
  explicitly deferred** — lower value, adds settings surface the product philosophy
  discourages unless there's a clear need; not built this session.
- Two stale doc lines fixed while in the area: `PRODUCT.md`'s MVP capability #3
  (Translation Mode) said "not started," years out of date (it shipped through v4
  long ago) — corrected.

## Git workflow (established 2026-07-20)

`main` is kept stable; work happens on `feature/`/`bug/`/`refactor/` branches per
Epic/fix/refactor, merged back once real-org-verified. Branch naming, commit, and PR
conventions are documented in `WORKFLOW.md`'s "Git workflow" section; a PR description
template lives at `.github/PULL_REQUEST_TEMPLATE.md`. Repo:
https://github.com/ManuelRP15/SalesLens.

**Note on this branch's PR history:** `bug/editing-and-hover-polish` (rounds 1-4)
went through TWO separate PRs on the same branch name — PR #4 (rounds 1-2, merged
mid-session) and PR #5 (rounds 3-4, opened after PR #4 had already merged, since a
merged PR can't be reopened for later commits on the same branch). If a future session
reuses a branch name after merging it once, check whether a fresh PR is needed rather
than assuming the old one still applies.

## What just happened (most recent session — Quick Compare, `DECISIONS.md #59`)

Picked as the single highest-value remaining CORE capability after reassessing the
project fresh (previous session's work — `#53`-`#58` — was confirmed merged to `main`
first). Reasoning: it's the last open item in an MVP-tier (not premium) capability,
it deepens the tooltip itself (the product's primary, already-core surface) rather
than adding a new panel, and it needed zero new settings — see `#59` for the full
write-up. Concretely:
- `Tooltip.tsx`'s `CandidateBlock` now renders a row for EVERY active language on
  every candidate, not just editable ones — a missing language on a non-editable
  (mostly standard/read-only) entry now shows a plain "Not translated" placeholder
  instead of being silently omitted, matching what Translation Mode/Health already do
  since `#58`.
- A value identical to the base-language (`en_US`) value gets a small "≈" mark,
  gated by the existing `Settings.flagIdenticalTranslations` toggle, threaded through
  as a new `flagIdentical` prop on `Tooltip`/`CandidateBlock` (sourced from
  `content/index.tsx`'s already-computed `tmStyle.flagIdentical` — no new settings
  read, no new module-level state).
- `shared/types.ts` gained `BASE_LANGUAGE = "en_US"`, replacing three independent
  local copies of the same literal (`metadata-translations.ts`, `background/index.ts`,
  `content/translation-mode.tsx`) — a small refactor done because this session would
  otherwise have added a FOURTH copy in `Tooltip.tsx`.
- Explicitly did NOT build a separate compact/expanded tooltip mode or PHASE 11's
  language-config settings (order/colors/icons/profiles) — see #59/ROADMAP.md for why.

## Earlier — rounds 1-4 (`#53`-`#58`, now on `main`)

**Round 4** (`#57`/`#58`): the popup's shortcut settings (Toggle Inspection Mode /
Hold to move tooltip) redesigned from confusing "Always"/"Off" buttons to a shared
Enabled/Disabled switch + key recorder, with mutual conflict prevention
(`shared/hotkeys.ts`). Translation Mode/Translation Health gained the missing +
identical-to-source signals that `#59` above then brought to the tooltip too.

**Round 3** (`#56`): Simple Mode (`Settings.simpleMode`, default on) scopes hover/
Translation Mode/Translation Health to objects/fields/picklists/Custom Labels by
default; `FieldLabel`/`PicklistValue` editing narrowed to custom (`__c`) only;
hover engine redesigned into two independent keys (toggle = sticky pin, hold =
temporary live retarget); tooltip simplified (customized mark + Copy SOQL/XML
removed).

**Round 2** (`#55`): standard-field XSD insert-order bug fixed; Escape/outside-click
now cancel an in-progress edit.

**Round 1** (`#54`): metadata-edit blanking bug fixed (concurrency check compared
against the wrong baseline); tooltip made a solid surface so clicks inside it don't
close it; QuickAction limitation (global/standard actions unsupported) surfaced with
a clean message.

**PHASE 6b** (`#53`, earlier still): editing extended from Custom-Labels-only to 8
more `LabelType`s via a Metadata API `deploy()` pipeline.

## Known gaps / untested — check before assuming something works

- **Nothing in this codebase has been verified against a real Salesforce org by the
  agent, ever.** Every "done" feature is confirmed only by build/typecheck/unit tests
  (plus, for this session's UI change, a static HTML mockup reproducing the exact
  markup/CSS — not the same as a real hover in a real org) unless stated otherwise.
  Don't report something as working end-to-end without saying this caveat.
- **Quick Compare (`#59`) needs a real-org visual check first** — confirm the extra
  rows (now showing on standard fields/objects/picklists too) don't feel cluttered in
  practice, the "≈" mark reads as a hint rather than an error, and "Not translated"
  vs "—" is the right distinction between read-only and editable missing rows.
- **The `en_US`-base assumption now backs THREE things** (Custom Label base-language
  editing `#41`, Translation Health/Mode's identical-flag `#58`, and Quick Compare's
  identical-flag `#59`) — all from the same centralized `BASE_LANGUAGE` constant now,
  so a non-English-base org fix is one change, but still unverified against one.
- **The hover engine redesign (`#56`)** — sticky toggle pin, independent hold-to-move,
  magnifier show/hide, both close paths — still needs its first real-org click-through.
- **PHASE 6b's deploy() pipeline is a real write to org metadata** — still high-stakes,
  re-test patching an EXISTING custom field/picklist translation and filling in a
  MISSING one; standard fields/picklists should show no edit button at all.
- **QuickAction editing works only for object-specific custom actions** — global/
  standard actions show a "not supported yet" message (`#54`). Deferred (PHASE 6c).
- **Simple Mode's default-on scoping (`#56`)** and **the shortcut settings UX (`#57`)**
  both still need their first real popup/hover click-through.
- The Translation Mode editor fix (`#50`), Enter-to-edit (`#49`), the CustomLabel/
  custom-field Setup-navigation URLs (`#47`/`#51`) all still need real-org confirmation
  — carried over, unrelated to this session's work.

## Immediate next step

Push `feature/quick-compare`, open its PR, and get a real-org pass — Quick Compare
(`#59`) is the highest-value thing to confirm, ideally alongside the still-unconfirmed
`#56`/`#57` (hover redesign, shortcut UX) and PHASE 6b editing while a real org session
is already happening. Once merged, next candidates (see `ROADMAP.md`'s status table):
**PHASE 16** (Workspace, **Muy Alta**, large — own dedicated session(s)), **PHASE 18**
(Translation Navigator & Page Coverage, Alta — a read-only whole-page view reusing
Translation Mode's own scan, no new metadata work), PHASE 6c (ObjectLabel/RelatedList,
global QuickAction, standard field/picklist editing — deliberately lower priority),
rest of PHASE 17 (arrow-key navigation, blocked on PHASE 18's match list), PHASE 11's
remaining half (language order/colors/icons — deliberately low priority, cosmetic).
