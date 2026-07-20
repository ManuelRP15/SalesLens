# Current state

*Read this first, every session, before anything else — it's short on purpose.*
*Update it last, every session, before ending — see `WORKFLOW.md` for the exact steps.*

**Last updated:** 2026-07-20

## Active work

`bug/translation-mode-editor` branch has this session's stabilization fixes complete
(Translation Mode editor + custom-field Setup navigation), pending real-org
verification before merge to `main`. `feature/keyboard-editing-shortcuts` (PHASE 17)
already merged to `main` this session. No Epic currently open.

## Git workflow (established this session)

`main` is kept stable; work happens on `feature/`/`bug/`/`refactor/` branches per
Epic/fix/refactor, merged back (fast-forward where possible) once real-org-verified.
Branch naming, commit, and PR conventions are documented in `WORKFLOW.md`'s "Git
workflow" section; a PR description template lives at
`.github/PULL_REQUEST_TEMPLATE.md`. The repo had no version control before 2026-07-20 —
the first commit on `main` is that pre-git snapshot.

## What just happened (most recent session — stabilization)

Real-org testing (the first this project has had) surfaced two genuine bugs, both
root-caused and fixed on `bug/translation-mode-editor`:

- **Translation Mode's editor opened and immediately closed itself (~1ms)** —
  editing was completely broken, not just glitchy. Root cause: `CandidateBlock`
  reported "not editing" to the content script on its own first render (before a
  separate mount effect had a chance to flip it to "editing"), which Translation
  Mode's `reconcileAfterEdit()` treated as "tear the tooltip down." Fixed by seeding
  `editingLang`/`editingBaseline` directly from `autoEditLanguage` in their `useState`
  initializers instead of a lagging mount effect — see `DECISIONS.md #50`.
- **Custom Field Setup navigation gave "Insufficient Privileges" for every custom
  field** — the URL used the field's API name, but Salesforce's real route for a
  custom field needs its `CustomField` record Id instead. Standard fields (API-name
  route) were unaffected. Fixed by fetching `CustomField.Id` via a new Tooling API
  call and routing custom fields through it — see `DECISIONS.md #51`. **This fix is a
  strong hypothesis, not yet confirmed against a real click** — same status as the
  CustomLabel URL below.

Also this session: merged PHASE 17 (Enter-to-edit keyboard shortcut, `DECISIONS.md
#49`) to `main`, and established the git workflow described above.

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
  agent, ever.** The two bugs above are the first real-org findings this project has
  had; every other "done" feature is still only confirmed by build/typecheck/unit
  tests. Don't report something as working end-to-end without saying this caveat.
- The CustomLabel Setup-navigation URL (PHASE 5, `DECISIONS.md #47`) and the new
  custom-field Id-based URL (`DECISIONS.md #51`) both specifically need a real-org
  click to confirm they open the expected page.
- The Translation Mode editor fix (`DECISIONS.md #50`) needs a real-org click to
  confirm the ~1ms-close bug is actually gone, not just theoretically fixed.
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

Real-org-test `bug/translation-mode-editor` (both fixes), then merge to `main`. After
that, next candidates (see `ROADMAP.md`'s status table): PHASE 16 (Workspace/package.xml
Builder, **Muy Alta** priority, large — needs its own dedicated session(s), not a quick
add-on), the rest of PHASE 17 (arrow-key navigation, blocked on PHASE 18's match list),
PHASE 18/19 (Translation Navigator, Hover History/Favorites).
