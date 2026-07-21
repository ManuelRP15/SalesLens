# Current state

*Read this first, every session, before anything else — it's short on purpose.*
*Update it last, every session, before ending — see `WORKFLOW.md` for the exact steps.*

**Last updated:** 2026-07-21

## Active work

**`feature/translation-health-v2` (this branch) — Translation Health v2: Duplicated-value
detection (`#64`), the AI Software Factory's first end-to-end epic — reported DONE once
while invisible, then completed properly (see `#64`'s completion round).** Shipped: pure
`computeDuplicateClusters` (`shared/duplicate-detection.ts`, 15 unit tests); a "Duplicated"
column + cluster detail AND an at-a-glance overview strip in the Health page; and
`seedHealthIfMissing()` so Health populates from mock data in dev (never a dead page).
**Machine-verified** (tsc/85 tests/build) AND **harness-verified** — a new `health-harness/`
renders the real `<Health/>` in a browser and confirmed the clusters, Simple-Mode scoping,
and overview on screen. **Real-org signal-usefulness still UNVERIFIED** (checklist in PR #9). Branched off
the factory branch, so its docs baseline predates the in-flight `#62`/`#63`; the DECISIONS
numbering (`#64`, skipping `#62`/`#63`) and this section will need trivial reconciliation
when `feature/translation-audit` merges. Immediate next step: real-org check of the Health
page; then the deferred audit-panel Duplicated filter becomes decidable from real clusters.

The prior in-flight line, still true on its own branch:

`feature/translation-audit` (off `main`, which now has PHASE 6b + rounds 1-4/`#53`-`#58`
+ Quick Compare/`#59` all merged) — Translation Audit v1 (`#60`) shipped, then
**real-org tested by the user and its first bug round fixed same day** (`#61`):
sticky-header scroll correction, editor-closes-on-click root cause (Dynamic Hover
parity), Complete-tab overflow, and a session-local translation scope toggle. Verified
(typecheck/tests/build + static visual mockups); pending push/PR update. No other
Epic open.

**Settled this session, no longer open questions:**
- **Translation Audit's core interaction model is now real-org CONFIRMED WORKING**
  ("working very well overall," direct feedback) — the four issues below were found
  by actually using it on a real Lightning page, not new gaps in the concept itself.
- **The sticky-header scroll bug's actual root cause**: `scrollIntoView` alone isn't
  reliable against `position: sticky`/pinned Salesforce chrome and nested scroll
  containers — it can decide a sticky target is "already visible" by its own rect
  math, or scroll the wrong container, while the highlight overlay (independent,
  rect-based) keeps tracking correctly regardless. Fixed with a verify-and-correct
  pass, not a bigger reliance on `scrollIntoView`.
- **The "modal closes on click" bug's actual root cause**: NOT a click-outside/shadow-
  DOM issue (that mechanism, `#54`, was never broken) — `reconcileAfterEdit()` was
  checking only `isEngineLive()`, which is always false while Translation Mode is on,
  so finishing ANY edit inside the TM/audit editor (even a harmless blur from clicking
  a different row's own button) tore the whole tooltip down. One-line fix
  (`&& !tmEditorOpen`) brings it to genuine parity with Dynamic Hover, which never had
  this bug because its own liveness check stays true.
- **Translation scope (all fields vs. current field) evaluated and shipped as a
  session-local UI toggle, not a persisted `Settings` field** — a live workflow
  control (declutter the page's badges down to the current target) belongs with the
  panel's own already-session-local filter/expanded state, not in the popup.

## Git workflow (established 2026-07-20)

`main` is kept stable; work happens on `feature/`/`bug/`/`refactor/` branches per
Epic/fix/refactor, merged back once real-org-verified. Branch naming, commit, and PR
conventions are documented in `WORKFLOW.md`'s "Git workflow" section; a PR description
template lives at `.github/PULL_REQUEST_TEMPLATE.md`. Repo:
https://github.com/ManuelRP15/SalesLens.

**Note on branch/PR history:** `bug/editing-and-hover-polish` went through TWO
separate PRs on one branch name (PR #4 then PR #5). `feature/quick-compare` was PR #6,
cleanly merged. `feature/translation-audit` is PR #7, still OPEN — this session's bug
fixes land as additional commits on the SAME branch/PR rather than a new one, since the
PR hadn't merged yet when the user's real-org testing found these issues.

## What just happened (most recent session — Translation Audit bug round, `DECISIONS.md #61`)

Direct real-org feedback on `#60`, investigated for root cause per explicit
instruction rather than patched superficially — all four fixes below trace to a
specific, understood cause, not a guess:

1. **Sticky/pinned-header navigation.** `content/index.tsx` gained
   `ensureVisibleAboveObstruction()` (+ `findScrollableAncestor()`,
   `measureTopObstruction()`) — a verify-and-correct pass run after `scrollIntoView`
   should have settled. Measures where the target actually ended up, detects pinned
   chrome generically (samples the live DOM for `position: fixed`/`sticky`, no
   hardcoded Salesforce selectors), and applies one corrective `scrollBy` on the
   target's REAL scrolling ancestor if needed. Symmetric — doesn't care which
   direction the navigation came from. `dom-utils.ts`'s `parentAcrossShadow` was
   exported (not reimplemented) for the shadow-piercing ancestor walks this needed.
2. **Editor-closes-on-click.** `reconcileAfterEdit()` now checks `!isEngineLive() &&
   !tmEditorOpen` instead of just `!isEngineLive()` — see root cause above. Also:
   Next/Previous/filter-change now explicitly cancel an in-progress edit first
   (matching Escape/outside-click's existing `#55` precedent), since `openTmEditor`'s
   own `isEditingActive` guard previously meant navigating away mid-edit silently
   refused to open the new target's editor at all.
3. **Complete-tab overflow.** `audit-panel.css`'s tabs row is now a 4-column CSS grid
   (always exactly matches the container width, unlike flex's overflow-prone default)
   with each tab's label stacked above its count instead of competing for width
   inline — fixes both the overflow AND awkward truncation with realistic double-digit
   counts.
4. **Translation scope toggle** (`AuditPanel`'s header, `translation-mode.tsx`'s new
   `setBadgeScope()`) — "All fields" (default) vs. "Current only," a pure
   `display:none` visibility toggle over already-built badges, zero re-scanning.
   Session-local, resets to "all" each Translation Mode activation.

## Earlier — Translation Audit v1 (`#60`), Quick Compare (`#59`), rounds 1-4 (`#53`-`#58`)

**Translation Audit v1** (`#60`): "Translate All" evolved from display+edit into a
guided audit workflow — filter to Missing/Identical/Complete, step through issues, the
page scrolls to and highlights each one, the existing editor opens pre-seeded on the
exact problem language, save, the count updates live.

**Quick Compare** (`#59`): the hover tooltip shows every active language per candidate
and marks a value identical to the source language — closed `PRODUCT.md` MVP
capability #2. Centralized `BASE_LANGUAGE` in `shared/types.ts`.

**Round 4** (`#57`/`#58`) / **Round 3** (`#56`) / **Round 2** (`#55`) / **Round 1**
(`#54`) / **PHASE 6b** (`#53`): shortcut settings UX, Simple Mode, hover engine
redesign, metadata-edit bug fixes, PHASE 6b's `deploy()` editing pipeline. Full detail
in `DECISIONS.md`.

## Known gaps / untested — check before assuming something works

- **Nothing in this codebase has been verified against a real Salesforce org by the
  agent, ever** — every fix in this session was root-caused via code reading/tracing
  and confirmed only by build/typecheck/unit tests + static mockups, NOT by watching
  it work live, even though the BUG reports themselves came from real-org use.
- **This session's four fixes need a real-org re-confirmation** (the user found the
  original bugs live; the FIXES themselves haven't been clicked through yet):
  - Sticky-header scroll: test Header→Body, Body→Header, Header→Header, Body→Body,
    and specifically a compact/sticky highlights panel and any nested-scroll related
    list.
  - Editor persistence: click a different row's Copy/Edit button while a textarea is
    focused, edit and save, click inputs/textarea/buttons throughout — confirm it
    never disappears except via outside-click/Escape/Next/Previous/navigating away.
  - Complete-tab alignment: confirm visually at realistic (including double-digit)
    counts.
  - Scope toggle: confirm "Current only" hides other badges but not the current
    target's own, and that toggling it mid-edit doesn't disturb the open editor.
- **Duplicated-translation detection is designed but NOT implemented** — see
  `ROADMAP.md` PHASE 18 for the exact algorithm when picked up next.
- **The `en_US`-base assumption now backs FOUR things** (`#41`, `#58`, `#59`, `#60`) —
  one centralized `BASE_LANGUAGE` constant, so a non-English-base org fix is one
  change, but still unverified against one.
- **The hover engine redesign (`#56`)** and **the shortcut settings UX (`#57`)** both
  still need their first real-org click-through.
- **PHASE 6b's deploy() pipeline is a real write to org metadata** — still high-stakes,
  re-test patching an EXISTING custom field/picklist translation and filling in a
  MISSING one.
- **QuickAction editing works only for object-specific custom actions** — global/
  standard actions show a "not supported yet" message (`#54`). Deferred (PHASE 6c).
- The Translation Mode editor fix (`#50`), Enter-to-edit (`#49`), the CustomLabel/
  custom-field Setup-navigation URLs (`#47`/`#51`) all still need real-org confirmation
  — carried over, unrelated to this session's work.

## Immediate next step

Push the new commits to `feature/translation-audit` (PR #7, still open) and get the
user's re-confirmation on the four fixes above — this is the highest-value thing to
close out before considering Translation Audit production-ready. Once merged, next
candidates (see `ROADMAP.md`'s status table): **PHASE 16** (Workspace, **Muy Alta**,
large — own dedicated session(s)), the Duplicated filter designed in PHASE 18 (small,
well-specified, needs a real-org look at actual duplicate clusters first), PHASE 6c
(ObjectLabel/RelatedList, global QuickAction, standard field/picklist editing —
deliberately lower priority), rest of PHASE 17 (arrow-key navigation, keyboard
shortcuts for the audit stepper), PHASE 11's remaining half (language order/colors/
icons — deliberately low priority, cosmetic).
