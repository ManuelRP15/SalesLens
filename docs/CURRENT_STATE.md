# Current state

*Read this first, every session, before anything else — it's short on purpose.*
*Update it last, every session, before ending — see `WORKFLOW.md` for the exact steps.*

**Last updated:** 2026-07-22 (Health removed + Workspace v2 — `DECISIONS.md #66`)

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

## Known gaps / untested — check before assuming something works

- **Workspace capture + pins are real-org-untested** (`#65`/`#66`): page + logic are
  harness/unit verified; the live save→capture round trip, pin snapshots from a real
  index, and Setup links against a real org URL are not. Verify first.
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
  `WORKSPACE_TOGGLE_PIN` + `workspaceItems`.
- `npm run harness:workspace` (port 5200) — the REAL Workspace page with stubbed
  storage incl. drifted samples (`#65`/`#66`, gate G-PO).

## Immediate next step

1. **Owner real-org round** (checklist in the PR): edit → appears in Workspace; pin
   from the tooltip (hover AND via a Translate All row); check the drift line after
   changing a value in Setup + refreshing the index; download package.xml; Setup links.
2. Merge the `feature/workspace-integration` PR (it carries the v1 recovery too).
3. Then, in order: **Safe Undo** (write path, prerequisites now exist), PHASE 6c,
   PHASE 11's cosmetic remainder. Deferred-with-reasons list in ROADMAP PHASE 16.
