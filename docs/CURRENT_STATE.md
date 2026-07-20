# Current state

*Read this first, every session, before anything else — it's short on purpose.*
*Update it last, every session, before ending — see `WORKFLOW.md` for the exact steps.*

**Last updated:** 2026-07-20

## Active work

Nothing in progress. `feature/keyboard-editing-shortcuts` branch has the Enter-to-edit
shortcut complete and ready to merge to `main` (first branch under the new git
workflow — see below). No Epic currently open.

## Process change (this session)

The project now uses git, with `main` kept stable and work done on
`feature/`/`bug/`/`refactor/` branches per Epic/fix — previously the codebase had no
version control at all. The initial commit on `main` is the pre-git snapshot; the
Enter-to-edit shortcut below is the first branch-based piece of work.

## What just happened (most recent session)

**PHASE 17: Enter-to-edit keyboard shortcut shipped** (`DECISIONS.md #49`) — Enter opens
the inline editor on the currently-inspected tooltip's first language row while
Inspection Mode is on; Ctrl+S (save) and Escape (cancel) turned out to already work
once an editor is focused, so this closed the one real gap. Arrow-key navigation
between matches and further hotkey configurability remain open, blocked on PHASE 18's
match list.

Previous session: a batch of hover polish + two new capabilities, self-scoped from the
roadmap in one sitting (see `DECISIONS.md #44–#48`):
- **Hover fine-tuning**: text resolution now checks actual rendered glyph rects, not
  just the DOM box (fixes resolving text the cursor wasn't really over, `#44`); the
  tooltip's non-interactive surface is `pointer-events: none` so it no longer
  permanently blocks reaching content it happens to cover (`#45`).
- **Translation Mode can now edit Custom Labels**: editable chips reopen the SAME
  hover-tooltip editor (concurrency control included) anchored at the click — not a
  second implementation (`#46`).
- **PHASE 5 (Navigate to Setup) shipped** — click the type badge (`#47`).
- **PHASE 14's Copy SOQL / Copy XML Member shipped**, scoped to types with a confident
  Metadata API mapping only (`#48`).

Previous session: documentation architecture rebuilt (`CLAUDE.md` + `docs/*.md`,
replacing the old `STI-*.md` set) and hover/editing stabilization (optimistic
concurrency, Inspection Mode) — see `DECISIONS.md #41–#43`.

## Known gaps / untested — check before assuming something works

- **Nothing in this codebase has been verified against a real Salesforce org by the
  agent, ever.** Every "done" feature is done as far as build/typecheck/unit tests can
  confirm — real-org behavior (SOAP quirks, actual field data, actual concurrent edits,
  actual mouse/hover feel) needs the user to check it. Don't report something as
  working end-to-end without saying this caveat.
- The CustomLabel Setup-navigation URL (PHASE 5, `DECISIONS.md #47`) specifically needs
  a real-org click to confirm it opens the edit page as expected.
- Custom Label base-language editing assumes the org's default language is always keyed
  `"en_US"` (`DECISIONS.md #41`) — untested against a non-English-base org.
- Editing (hover tooltip AND Translation Mode chips) is Custom Labels only; every other
  `LabelType` has no edit affordance at all by design (`DECISIONS.md #41`, `CLAUDE.md`
  rule #7).
- Buttons/quick actions/sections/related lists (`WebLink`, `StandardButton`,
  `QuickAction`, `LayoutSection`, `RelatedList`) are implemented but explicitly flagged
  "not yet verified against a real org" in `ROADMAP.md` PHASE 4/9 notes.

- Enter-to-edit (PHASE 17, `DECISIONS.md #49`) has not been verified against a real
  org/keyboard either — same caveat as everything else on this list.

## Immediate next step

Merge `feature/keyboard-editing-shortcuts` once real-org-tested. After that, next
candidates (see `ROADMAP.md`'s status table): PHASE 16 (Workspace/package.xml Builder,
**Muy Alta** priority, large — needs its own dedicated session(s), not a quick add-on),
the rest of PHASE 17 (arrow-key navigation, blocked on PHASE 18's match list), PHASE
18/19 (Translation Navigator, Hover History/Favorites).
