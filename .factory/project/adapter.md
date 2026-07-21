# Project Adapter — Salesforce Translation Inspector

> **Layer 2.** This is the interface between the universal factory (`../*.md`) and THIS
> project. It is the ONE project-specific file the factory reads to bind itself; everything
> below either states a machine-usable fact or points at where the project already owns
> that knowledge. **It does not duplicate the `docs/` set — it routes to it.**
>
> To run the factory on a different project, you write a *different* adapter. The universal
> layer and `owner/PROFILE.md` stay untouched. See `../init/NEW_PROJECT.md`.

## Identity

- **Project:** Salesforce Translation Inspector (product working name: *SalesLens*).
- **What it is:** Chrome/Edge MV3 extension. Hover over Salesforce Lightning text → see the
  metadata it comes from and its translations in every configured language, editable in place.
- **Stack:** TypeScript + React 18 + Vite 5 + `@crxjs/vite-plugin` v2 (beta), Manifest V3.
  No external UI framework. Vitest for unit tests. `fflate` + `fast-xml-parser`.

## Commands (the factory's machine-verifiable gate — G2/G4)

| Purpose | Command | Gate |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | G2 |
| Unit tests | `npx vitest run` (or `npm test`) | G2 / G4 (logic) |
| Build | `npm run build` | G2 |
| **Interaction harness** | `npm run harness` → real browser at port 5199 | **G4 (interaction)** |
| Dev (live extension) | `npm run dev` → load unpacked `dist/` | manual |

- **G4 machine side is fully available:** typecheck + unit + build + harness all run here.
- **G4 real-world side is NOT automatable:** there is no way to test against Salesforce from
  the factory. Real-org verification is always a human handoff (G7). This is the project's
  defining constraint — see `../METHODOLOGY.md §2`.

## Where this project's knowledge already lives (route here — do not re-derive)

The factory reuses the existing doc set as the project's context store. `CLAUDE.md` is the
router; it is auto-loaded every session and already encodes task-type routing. **Read on
demand, per `CLAUDE.md`'s table — never wholesale.**

| Need | Read |
|---|---|
| What's active right now / known-untested | `docs/CURRENT_STATE.md` (always first) |
| Why the product exists, quality bars, positioning | `docs/PRODUCT.md` |
| How it's built, file map, the 10 non-negotiable rules, data flow | `docs/ARCHITECTURE.md` |
| Every non-obvious "why we did it this way" | `docs/DECISIONS.md` (grep the index, never read whole) |
| What's built / backlog / priority | `docs/ROADMAP.md` (grep by phase) |
| How a session should start/end per shape | `docs/WORKFLOW.md` |

The factory's tiers map onto `WORKFLOW.md`'s session shapes: **T1 ≈ bug fix, T2 ≈ Epic,
T3 ≈ refactor** (`../METHODOLOGY.md §1`). Follow `WORKFLOW.md`'s start/end steps for the
matching shape — the factory adds gates and routing *around* them, it does not replace them.

## Risk profile — what makes a change high-risk HERE

The universal routing signals (`../METHODOLOGY.md §1`) instantiate for this project as:

- **Write paths (→ T3):** `src/shared/metadata-write.ts`, the write functions in
  `src/shared/salesforce-api.ts`, `background/index.ts`'s `saveTranslation`. These hit a
  real org and THROW on failure by design (rule #6). Optimistic-concurrency (rule #9) is
  mandatory on any write.
- **Interaction / shadow-DOM (→ T2 min, harness REQUIRED at G4):** `src/content/index.tsx`,
  `interaction.ts`, `Tooltip.tsx`, `AuditPanel.tsx`, `dom-utils.ts`. Historically the
  densest source of review-invisible bugs.
- **Resolution correctness (→ zero-false-positive bar):** `src/shared/index-builder.ts`
  (`resolveText` — must return 0 or 1 candidate, never a list, rule #5).
- **New message type / new `LabelType` (→ T2, full `ARCHITECTURE.md` read):** the
  background/content boundary in `types.ts` + `background/index.ts`.

## Project non-negotiables (the factory must never violate these)

These are `docs/ARCHITECTURE.md`'s 10 rules and `CLAUDE.md`'s. The factory treats them as
inviolable constraints on every plan (`MANIFESTO.md` non-negotiable #3). Summarized so the
orchestrator has them without a full read; the authoritative text is in `ARCHITECTURE.md`:

1. Tooling/Metadata fetches run in the **background**, never the content script (CORS).
2. `sid` cookie read only in the background via `chrome.cookies.get()`.
3. Tooltip mounts in a **closed** Shadow DOM.
4. Reverse index lives in the background, persisted to `chrome.storage.local`.
5. `resolveText` returns **0 or 1** candidate — never a ranked shortlist.
6. Read paths **degrade gracefully** (never throw); **write paths are the exception** (throw).
7. Base labels fetched separately from translated ones.
8. Editing gated by `isEditableEntry()` (type-level AND field-level `__c`) — not just type.
9. Every write does **optimistic concurrency control**.
10. UI leaves **no permanent trace** (closed Shadow DOM; `removeAllBadges()` on toggle-off).
11. (Product) Simple Mode is the default surface; advanced types stay built, filtered at one
    choke point (`isInSimpleScope`).

## Definition of Done for this project

The universal gates (`../METHODOLOGY.md §2`) with these project bindings:
- **G2:** `npx tsc --noEmit` clean · `npx vitest run` green · `npm run build` succeeds.
- **G4 machine:** logic → a `vitest` test; interaction → exercised in `npm run harness`.
- **G4 real-world:** a Manual Testing checklist per `.github/PULL_REQUEST_TEMPLATE.md`.
- **G-PO (Product Outcome):** the user-facing surface must be **rendered and observed**, not
  just built — the content-script UI via the dev-harness; a standalone page (e.g. Translation
  Health) via a preview harness that stubs `chrome.storage` and mounts the real component
  (`health-harness/`, `DECISIONS.md #64`); read it back (`read_page`/`get_page_text`) or
  screenshot. And state **which runnable artifact** the user loads to see it (branch + `dist/`).
  A green build on an unmerged branch is not a delivered outcome.
- **G5:** `DECISIONS.md` + `CURRENT_STATE.md` (always) per `WORKFLOW.md` ownership.
- **G6:** branch `feature/|bug/|refactor/<name>`; PR body per the template.
- **G7:** the owner confirms real-org behavior before merge — never merge on factory initiative.

## Current state pointer

Don't hardcode status here (it changes every session and would rot). The live answer to
"what's active, what's next, what's unverified" is always `docs/CURRENT_STATE.md`, read first.
