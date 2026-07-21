# Current state

*Read this first, every session, before anything else — it's short on purpose.*
*Update it last, every session, before ending — see `WORKFLOW.md` for the exact steps.*

**Last updated:** 2026-07-21

## Active work

`feature/translation-audit` (off `main`, which now has PHASE 6b + rounds 1-4/`#53`-`#58`
+ Quick Compare/`#59` all merged) — Translation Audit & Guided Navigation v1 shipped
(`DECISIONS.md #60`, `ROADMAP.md` PHASE 18), verified (typecheck/tests/build + a
static visual mockup check), pending push/PR. No other Epic open.

**Settled this session, no longer open questions:**
- **PHASE 18 rewritten and absorbed into "Translate All"'s evolution** — the old,
  narrower "Translation Navigator & Page Coverage" scope (a read-only list + separate
  stats panel) is superseded by a richer, directly-requested guided-audit workflow:
  filter to what needs attention, step through issues, the page scrolls to and
  highlights each one, the existing editor opens pre-seeded on the exact problem
  language, save, the count updates live, repeat. Full technical plan (7 architecture
  questions answered from reading the actual code, not assumed) is in `ROADMAP.md`
  PHASE 18 — written BEFORE implementation, per this session's own instructions.
- **Duplicated-translation detection designed but deliberately deferred** — a reliable
  definition was worked out (flag only when 2+ distinct on-page entries share a
  translated value AND their base-language values differ from each other; same value
  with the same base is EXPECTED, not a bug) but needs a first real-org look at actual
  duplicate clusters before shipping, same bar PHASE 10's QA Report v2 already follows.
  Full definition is in `ROADMAP.md` PHASE 18, ready as a small follow-up.
- **A real, previously-unnoticed gap fixed as part of this work**: saving a
  translation happens inside this extension's own CLOSED shadow root, so the
  page-level `MutationObserver` that normally re-triggers Translation Mode's rescan
  never fired from it — a saved edit left the on-page badge (and would have left the
  new audit panel) stale until an unrelated page mutation happened to retrigger a
  scan. Fixed with an explicit rescan right after a successful save.

## Git workflow (established 2026-07-20)

`main` is kept stable; work happens on `feature/`/`bug/`/`refactor/` branches per
Epic/fix/refactor, merged back once real-org-verified. Branch naming, commit, and PR
conventions are documented in `WORKFLOW.md`'s "Git workflow" section; a PR description
template lives at `.github/PULL_REQUEST_TEMPLATE.md`. Repo:
https://github.com/ManuelRP15/SalesLens.

**Note on branch/PR history:** `bug/editing-and-hover-polish` went through TWO
separate PRs on one branch name (PR #4 then PR #5, since a merged PR can't be reopened
for later commits). `feature/quick-compare` was PR #6, cleanly merged. Each Epic since
has used a fresh `feature/*` branch off the latest `main` — keep doing this rather than
reusing a branch name after it's merged once.

## What just happened (most recent session — Translation Audit, `DECISIONS.md #60`)

Chosen as the single most important remaining core capability per this session's own
explicit instructions: not the next roadmap number, but the one that most directly
serves "core Fields/Labels/Objects inspection" and highest value to a real
developer/QA user, completable to production quality in one sitting. "Translate All"
(Translation Mode) already displayed and let you edit translations; what it couldn't
do was tell you WHAT needed fixing across a whole page and walk you through fixing it
— exactly the gap this closes, and exactly why PHASE 18 (previously a separate,
smaller "Navigator" idea) was the right home to rewrite rather than starting a new
phase number.

**Architecture, all reuse — see `#60`/`ROADMAP.md` PHASE 18 for the full reasoning:**
- `translation-mode.tsx`'s existing scan (already walks the FULL page, not just the
  viewport) now also builds a de-duplicated `AuditEntry[]` (one row per logical
  entry — `apiName + type` — not per DOM occurrence), handed to `content/index.tsx`
  via a new `onAuditUpdate` callback. Same scan, one more consumer alongside the
  existing inline badges.
- New `AuditPanel.tsx` + `audit-panel.css`: a collapsed pill by default, expanding
  into **All / Missing / Identical / Complete** filter tabs, a `"{Filter} — i of N"`
  Prev/Next stepper, and a clickable list — mounted as a SECOND independent React
  root sharing the tooltip's existing closed shadow host (`ensureShadowRoot()`
  refactor in `content/index.tsx`), so rendering one can never clear the other.
- New highlight overlay (`highlightElement`/`positionHighlight`/`clearHighlight`) — a
  single floating div synced to the target's live rect, pulsing briefly then settling
  into a steady outline. Only one ever exists, so the "many overlapping floating
  things" problem that killed Translation Mode's OWN v1 (`#19`) doesn't recur.
- Editing integration is 100% the existing `openTmEditor` — guided navigation computes
  an anchor point from the target's own rect instead of a click event, and opens on
  the SPECIFIC missing/identical language that made the entry match the filter. No
  second editor, no new concurrency logic.

## Earlier — Quick Compare (`#59`) and rounds 1-4 (`#53`-`#58`, now on `main`)

**Quick Compare** (`#59`): the hover tooltip now shows every active language per
candidate (present or missing) and marks a value identical to the source language —
closed `PRODUCT.md`'s MVP capability #2. `shared/types.ts` gained a centralized
`BASE_LANGUAGE` constant, replacing three independent local copies.

**Round 4** (`#57`/`#58`): the popup's shortcut settings redesigned (Enabled/Disabled
switch + key recorder, mutual conflict prevention). Translation Mode/Translation
Health gained missing + identical-to-source signals.

**Round 3** (`#56`): Simple Mode default scope; `FieldLabel`/`PicklistValue` editing
narrowed to custom (`__c`) only; hover engine redesigned into two independent keys
(toggle = sticky pin, hold = temporary live retarget); tooltip simplified.

**Round 2** (`#55`) / **Round 1** (`#54`) / **PHASE 6b** (`#53`): metadata-edit bug
fixes, tooltip made a solid surface, PHASE 6b's `deploy()` editing pipeline for 8
non-Custom-Label types. Full detail in `DECISIONS.md`.

## Known gaps / untested — check before assuming something works

- **Nothing in this codebase has been verified against a real Salesforce org by the
  agent, ever.** Every "done" feature is confirmed only by build/typecheck/unit tests
  (plus, for UI changes, a static HTML mockup reproducing the exact markup/CSS) unless
  stated otherwise. Don't report something as working end-to-end without this caveat.
- **Translation Audit (`#60`) is the highest-priority thing to re-test** — the most
  interaction-heavy feature shipped yet: scroll timing, highlight positioning across
  Lightning's nested/shadow layouts, and the fixed 450ms "has the smooth scroll
  settled" guess before auto-opening the editor. Test: toggle Translate All on, expand
  the panel, step through Missing with Next, confirm the page scrolls to and
  highlights each field, the editor opens on the right language, saving updates the
  count immediately, and Escape collapses the panel.
- **Duplicated-translation detection is designed but NOT implemented** — see
  `ROADMAP.md` PHASE 18 for the exact algorithm when picked up next.
- **Quick Compare (`#59`) needs a real-org visual check** — extra rows on standard
  fields/objects/picklists, the "≈" mark, "Not translated" vs "—".
- **The `en_US`-base assumption now backs FOUR things** (Custom Label base-language
  editing `#41`, Translation Health/Mode's identical-flag `#58`, Quick Compare's
  identical-flag `#59`, and the audit panel's identical-flag `#60`) — all from the
  same centralized `BASE_LANGUAGE` constant, so a non-English-base org fix is one
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

Push `feature/translation-audit`, open its PR, and get a real-org pass — Translation
Audit (`#60`) is the highest-value AND highest-risk thing to confirm (see the click-
through checklist above), ideally alongside the still-unconfirmed `#56`/`#57`/`#59`
and PHASE 6b editing while a real org session is already happening. Once merged, next
candidates (see `ROADMAP.md`'s status table): **PHASE 16** (Workspace, **Muy Alta**,
large — own dedicated session(s)), the Duplicated filter designed in PHASE 18 above
(small, well-specified, needs a real-org look first), PHASE 6c (ObjectLabel/
RelatedList, global QuickAction, standard field/picklist editing — deliberately lower
priority), rest of PHASE 17 (arrow-key navigation — could now reuse the audit panel's
own filtered-list ordering instead of needing a separate one), PHASE 11's remaining
half (language order/colors/icons — deliberately low priority, cosmetic).
