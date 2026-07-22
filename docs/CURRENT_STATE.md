# Current state

*Read this first, every session, before anything else — it's short on purpose.*
*Update it last, every session, before ending — see `WORKFLOW.md` for the exact steps.*

**Last updated:** 2026-07-22 (Workspace v4 — selection bug fixed at root, history, export/import, Undo — `DECISIONS.md #68`)

## The fact that governs everything else

**The local project directory IS the product** (`#64`). Implement, test, and verify in
this working tree; GitHub is version control + backup around it. Nothing is "delivered"
unless it is present and machine-verified here. Every factory session starts by
reconciling CURRENT PRODUCT STATE (`.factory/METHODOLOGY.md §0`).

## Product direction (settled, `#66`)

**Inspect + Translate All + Workspace** — three modes of one tool:
understand → translate → track/act on what you touched. Translation Health is
**gone from the product** (page, button, computation removed; its missing/identical
signals live on in the tooltip, Translation Mode, and the audit panel).

## Active work

`feature/workspace-integration` (off `main`) — **checked out locally; this IS the
current product state.** This session:
1. **Recovered Workspace v1 into the mainline.** PRs #13/#14 were merged in the wrong
   order on GitHub (#14 landed on the already-merged reset branch), so `main` never
   received Workspace v1 — this branch merges it back. Lesson: merge stacked PRs
   bottom-up, or let the base PR absorb the stack before merging.
2. **Removed Translation Health** entirely (`#66`).
3. **Workspace v2** (`#66`): "+ Workspace" pins on the inspector tooltip (works from
   hover AND from Translate All, since audit rows open the same inspector),
   per-language change detection against the index ("changed since captured", honest
   unknown state, freshness footer), product-consistent page (status rails, type
   chips, status tabs, search over names+values, Open-in-Setup links, relative times),
   popup button with live count, storage migrated `workspaceEdits` → `workspaceItems`.
4. **Workspace v3** (`#67`): the ELEMENT (type+apiName), not the edit row, is now the
   atomic unit — `ElementCard`s replace type-grouped flat rows, with a secondary
   "Activity" chronological view kept for the raw feed. New: self-invalidating
   per-element "reviewed" status (`workspaceReviewed`, own storage key, page-owned —
   background untouched), contextual multi-select with a sticky bulk action bar
   (export selection / mark reviewed / mark pending / remove), a transient "Saved ·
   Added to Workspace" tooltip notice on save, and a small "tracked in Workspace"
   indicator on Translate All's audit rows.
5. **Workspace v4** (`#68`), a real-usage follow-up pass: **fixed the multi-select
   checkbox bug at its root** (native `<input>` fighting label-forwarding + a
   `preventDefault` race → a plain custom button, one click event, no race — the ONE
   checkbox in the codebase built the old way). Added: per-element **edit History**
   (real going forward, honestly reconstructed for older rows), a scoped **export
   menu** (Workspace / current view / selected), a versioned **Workspace-state
   import/export envelope** with merge-or-replace, **single-level session-only Undo**
   for Remove/bulk-Remove/Clear, an accurate **"Added" vs. "Updated"** capture message
   (background now reports which), a richer **popup summary** (elements / needs
   review / changed) in place of an in-page drawer, and **"Add filtered to
   Workspace"** from Translate All.

## Known gaps / untested — check before assuming something works

- **Workspace capture + pins are real-org-untested** (`#65`/`#66`): page + logic are
  harness/unit verified; the live save→capture round trip, pin snapshots from a real
  index, and Setup links against a real org URL are not. Verify first.
- **Two content-script pieces are UNVERIFIED even in the harness, across two sessions
  now** (`#67`'s tooltip save notice + audit-panel dot, `#68`'s "Added"/"Updated"
  accuracy + the audit panel's "+ Add to Workspace" button): all four render inside the
  closed Shadow DOM the dev harness also uses (`#3`, correct isolation, not a bug), and
  a Browser-pane display fault (screenshot compositing unavailable) has blocked visual
  confirmation both times. Type-checked, zero console errors on page load/hover, reuses
  proven patterns — but actually look at all four (harness AND real org) before
  trusting them. **Everything else in v3+v4 WAS driven and visually confirmed** in
  `harness:workspace`, including three real interaction bugs `#68` found and fixed
  ONLY because it was actually driven there (native-checkbox selection, shift-range
  using the wrong order, History-toggle collapsing its own card) — a concrete argument
  for getting the content-script harness unblocked before trusting those four pieces.
- **The popup's new Workspace summary** (`#68`, `workspaceOverviewCounts`) has no
  harness at all in this project — logic is unit-tested, the UI itself is unverified.
- **`#63`'s interaction model**: harness-verified, still needs its real-org
  click-through (inside clicks, two-stage outside click, Escape ladder, scroll-anchored
  modal, keyboard nav).
- **PHASE 6b's deploy() pipeline is a real write** — re-test patching an EXISTING
  custom field/picklist translation and filling a MISSING one.
- **The `en_US`-base assumption** (`#41`, one `BASE_LANGUAGE` constant) — unverified
  against a non-English-base org.
- **QuickAction editing** only for object-specific custom actions (`#54`); PHASE 6c.
- Setup-navigation URLs (`#47`/`#51`) still need real-org confirmation — the Workspace
  page's "Open in Setup" links reuse exactly these.

## The dev harnesses

- `npm run harness` (port 5199) — the REAL content script on a Lightning-shaped page,
  `chrome.*` stubbed (`#63`). Use before claiming any interaction works. Now also stubs
  `WORKSPACE_TOGGLE_PIN` + `workspaceItems`. Still owes the closed-Shadow-DOM pieces
  above a real look — a Browser-pane fault has blocked it two sessions running.
- `npm run harness:workspace` (port 5200) — the REAL Workspace page with stubbed
  storage incl. drifted samples, an `editCount`-3 sample, a combined pin+edit element,
  a `workspaceReviewed` entry, a real 7-entry edit history (exercises the "+N earlier"
  cap), and a pre-v4-style row with no `history` field (`#65`–`#68`, gate G-PO). This
  harness has repeatedly earned its keep — three of `#68`'s bugs were only found by
  actually driving it.

## Immediate next step

1. **Get the content-script harness's Browser-pane fault fixed or worked around**,
   then look at all four unverified pieces above — the one thing two sessions in a row
   couldn't confirm themselves.
2. **Owner real-org round** (checklist in the PR): edit → appears in Workspace as an
   element card, capture message says Added then Updated on a second edit; pin from
   the tooltip (hover AND via a Translate All row); "+ Add filtered to Workspace" from
   the audit panel; mark something reviewed then edit it again and confirm it falls
   back to "needs review"; multi-select incl. shift-range across type sections; the
   three export scopes (Workspace / current view / selected); export → import round
   trip (merge and replace); Undo after a delete; check the drift line after changing
   a value in Setup + refreshing the index; Setup links; popup summary.
3. Merge the `feature/workspace-integration` PR (it carries the v1 recovery too).
4. Then, in order: **Safe Undo** (the deploy-backed one — write path, prerequisites now
   exist; not to be confused with v4's Workspace-tracking Undo, already shipped),
   PHASE 6c, PHASE 11's cosmetic remainder. Deferred-with-reasons list in ROADMAP
   PHASE 16.
