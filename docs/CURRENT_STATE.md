# Current state

*Read this first, every session, before anything else — it's short on purpose.*
*Update it last, every session, before ending — see `WORKFLOW.md` for the exact steps.*

**Last updated:** 2026-07-22 (state reset `#64` + Workspace v1 `#65`)

## The fact that governs everything else

**The local project directory IS the product** (`#64`). Implement, test, and verify in
this working tree; GitHub is version control + backup around it. Nothing is "delivered"
unless it is present and machine-verified here. Every factory session starts by
reconciling CURRENT PRODUCT STATE (`.factory/METHODOLOGY.md §0`).

## Active work

`feature/workspace` (off `refactor/local-state-reset`, off `main`) — **checked out
locally; this IS the current product state.** Two things happened in one session:
1. The reset (`#64`): landed `#63` (was uncommitted), reverted Translation Health v2
   out of the mainline (epic retired + archived), factory V1.2.
2. **Workspace v1 shipped (`#65`, PHASE 16):** every successful translation save is
   captured automatically; the Workspace page (popup → "Open Workspace") shows
   before/after per edit and exports package.xml/JSON. Awaiting real-org testing.

## Git state after the reset

- **Open PRs:** `refactor/local-state-reset` → `main` (merge this one first), then
  `feature/workspace` stacked on it. No other branches exist, local or remote — stale
  fully-merged ones were pruned (`#64`).
- **Translation Health v2 is archived, not lost:** git tag `archive/translation-health-v2`
  (duplicate-detection module + tests + health-harness). The `sti_health_v2` side
  worktree was removed; side worktrees are no longer how work is done here.
- `origin/main` still contains the health-v2 merge until the reset PR (which reverts it)
  is merged. After that, `main` == the real local product line again.
- Conventions unchanged (`WORKFLOW.md`); repo: https://github.com/ManuelRP15/SalesLens.

## What just happened (`#64`)

1. Repo reconciled to local reality — the "ghost progress" of work merged on GitHub but
   absent from the local project is eliminated, and the methodology now prevents it.
2. **Translation Health epic (v2 / QA Report) retired** — owner product call, anti-sunk-
   cost; Translation Audit (`#60`–`#63`) is the product's real QA surface. See `#64` for
   the reasons and the revival path (Audit filter, not a Health column).
3. Factory V1.2 — local-first delivery, mandatory session-start reconciliation, worktrees
   demoted to a rare, explicitly-integrated-back exception.

## The dev harness (`npm run harness`)

Runs the REAL content script against a Lightning-shaped page with `chrome.*` stubbed
(`#63`). **Use it before claiming any interaction works.** Limits (see
`ARCHITECTURE.md`): the tab is backgrounded — no native scroll events, no
`requestAnimationFrame`, no smooth scrolling; resolution is stubbed, so it proves
INTERACTION only, never metadata correctness.

## Known gaps / untested — check before assuming something works

- **Workspace capture is real-org-only** (`#65`): the page + logic are harness/unit
  verified, but nothing has exercised a real save→capture→page round trip yet. The
  first real-org edit should appear in the Workspace on its own — verify that first.
- **Nothing is verified against a real Salesforce org since `#61`/`#62`.** `#63`'s
  interaction work is harness-verified (inside clicks on both surfaces, two-stage outside
  click, Escape ladder, guided navigation, scroll-anchored following, filters, keyboard
  ownership); metadata resolution, saves, and Lightning's real DOM are not.
- **NOT verifiable in the harness:** smooth-scroll animation, real focus events,
  sticky-header correction against real Lightning chrome (bounded at two passes, see
  `ROADMAP.md` PHASE 18).
- **PHASE 6b's deploy() pipeline is a real write to org metadata** — re-test patching an
  EXISTING custom field/picklist translation and filling a MISSING one.
- **The `en_US`-base assumption backs four things** (`#41`, `#58`, `#59`, `#60`) via one
  `BASE_LANGUAGE` constant; still unverified against a non-English-base org.
- **QuickAction editing works only for object-specific custom actions** (`#54`);
  global/standard show "not supported yet". Deferred (PHASE 6c).
- Setup-navigation URLs (`#47`/`#51`) still need real-org confirmation.

## Immediate next step

1. **Owner real-org round:** load `dist/` from this branch, click through `#63`'s
   interaction model AND `#65`'s Workspace (edit → appears in Workspace → download
   package.xml). Checklists are in the two open PRs.
2. Merge the reset PR first, then the Workspace PR.
3. After that: Workspace follow-ups in order (Safe Undo → tooltip "add to Workspace" →
   JSON import, see PHASE 16), PHASE 6c, PHASE 11's cosmetic remainder.
