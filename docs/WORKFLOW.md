# Workflow

> Part of the STI doc set — start at [../CLAUDE.md](../CLAUDE.md) if you landed here
> directly. This is the process spec: how a session should start, what it should read,
> what it should update, and how it should end — for each of the four session shapes
> this project actually has. Read it once to internalize the pattern; after that,
> `CLAUDE.md`'s routing table is enough of a reminder.

## Why this doc set is shaped the way it is

Six documents, each owning one kind of fact, plus `CLAUDE.md` as the always-loaded
router. The shape follows one idea: **separate by how often a fact changes**, because
that determines whether it's safe to load by default or must be actively sought out.

| Doc | Changes | Loaded |
|---|---|---|
| `CLAUDE.md` | Rarely (a new rule, a new doc) | **Every session, automatically** |
| `CURRENT_STATE.md` | Every session | Every session, first thing, on purpose (it's tiny) |
| `PRODUCT.md` | Rarely (a real product-direction decision) | On demand — feature work, roadmap calls |
| `ARCHITECTURE.md` | Occasionally (a new module, a new rule) | On demand — Epics, refactors; grepped for bug fixes |
| `ROADMAP.md` | Every Epic (status changes) | On demand — scoping work, never read cover to cover |
| `DECISIONS.md` | Every session that learns something non-obvious | **Grepped, never read in full** — its index is the only part meant for a full scan |

A monolithic doc forces you to load everything to get anything. A doc per volatility
tier means a two-line bug fix costs a grep and a `CURRENT_STATE.md` read, not a 15,000-
token architecture reload — and a real Epic still gets the full picture, because the
routing table in `CLAUDE.md` says so for that task type.

## Fact ownership — where something belongs, so it's never written twice

| Kind of fact | Lives in | Never in |
|---|---|---|
| Why the product exists, quality bars, positioning | `PRODUCT.md` | anywhere else |
| Tech stack, file responsibilities, non-negotiable rules, data flow | `ARCHITECTURE.md` | anywhere else |
| A root-cause bug writeup, a non-obvious "why we built it this way" | `DECISIONS.md` | anywhere else — not even as a comment duplicate; a short code comment pointing at `DECISIONS.md #N` is fine, a full retelling in two places is not |
| What's built, what's backlog, priority order | `ROADMAP.md` | `ARCHITECTURE.md` (no "what works" checklists there — that's what ROADMAP's phase status is for) |
| What's active RIGHT NOW, known-untested items | `CURRENT_STATE.md` | `ROADMAP.md` (no "current focus" section there — see `DECISIONS.md`-style history instead once it's done) |
| Source code | `src/` | **never** in a doc — reference `file.ts:123`, don't paste |
| How to run/build/test locally | `README.md` (human-facing, not part of this set) | — |

## Session shape 1 — Epic (new feature / capability)

**Start:**
1. `CLAUDE.md` (automatic) → `CURRENT_STATE.md` (always).
2. Read the relevant phase(s) in `ROADMAP.md` — grep by phase number/name, don't read
   the whole file.
3. Read `ARCHITECTURE.md` in full if the Epic touches the background/content/shared
   boundary, adds a message type, or adds a metadata type. For a narrower Epic
   (e.g. a popup-only UI change), grep the file map instead.
4. Grep `DECISIONS.md` for the Epic's domain keywords (e.g. "hover", "SOAP",
   "concurrency", "translation-mode") — check the index first, then open the specific
   entries that look relevant. The goal: don't re-run an investigation that's already
   on record.
5. If the Epic is user-facing, skim `PRODUCT.md`'s Quality Bars — every new feature is
   judged against Speed / Zero False Positives / No Permanent Trace.
6. **What the user should provide:** the goal in their own words, any explicit scope
   boundaries ("don't touch X yet"), and — critically — flag it up front if a choice
   needs their call (new architecture, a scope tradeoff, anything genuinely ambiguous).
   Ask via a real question before building, the way scope was confirmed for Custom-
   Label-only editing and the DECISIONS.md #43 hover rewrite.
7. **What you can infer without asking:** which files are touched (from the file map),
   which existing pattern to reuse (from `ARCHITECTURE.md`'s rules + `DECISIONS.md`),
   whether something is small enough to just build vs. needs a design pass first.

**During implementation:** follow the non-negotiable rules in `CLAUDE.md`/
`ARCHITECTURE.md` without re-verifying them from scratch — they're rules precisely so
they don't need re-deriving. Build, typecheck (`npx tsc --noEmit`), run `npx vitest
run`, `npm run build` before considering anything done.

**End (every one of these, every time, same turn — not "later"):**
1. Verify build/typecheck/tests pass.
2. `DECISIONS.md`: append an entry for anything non-obvious this Epic discovered or
   decided (new numbered `### #N`, tags, files, the "why"). Skip this only if genuinely
   nothing surprising happened.
3. `ARCHITECTURE.md`: update the file map if files were added/renamed/repurposed; add a
   rule if a new non-negotiable constraint was established.
4. `ROADMAP.md`: mark the phase done/in-progress, add a new phase if the Epic wasn't
   already tracked, adjust priority if this Epic changed what should come next.
5. `CURRENT_STATE.md`: **always last, always.** What got done, any caveat ("not tested
   against a real org"), the immediate next step or "none queued."
6. Report to the user with a short summary — not a re-explanation of what's already in
   the docs.

## Session shape 2 — Bug fix

Deliberately lighter than an Epic — most of an Epic's read list doesn't apply.

**Start:** `CURRENT_STATE.md` (always). Then **grep `DECISIONS.md` first**, before
reading any code — a large fraction of bugs in this project are re-discoveries of
something already root-caused (SOAP endpoint quirks, shadow-DOM traversal, event
ordering...). Then read/grep only the specific implicated file(s). Skip `PRODUCT.md`,
`ROADMAP.md`, and a full `ARCHITECTURE.md` read entirely unless the fix turns out to be
architectural (in which case, treat it as shape 3 instead).

**End:** fix + verify (build/typecheck/tests). Update `DECISIONS.md` only if the root
cause is genuinely new information (not already covered by an existing entry — extend
that entry instead of duplicating). Update `CURRENT_STATE.md`'s "known gaps" list only
if this changes it. Don't touch `ROADMAP.md`/`PRODUCT.md`/`ARCHITECTURE.md` unless the
bug revealed a rule needs to change.

## Session shape 3 — Refactor / architecture change

The heaviest session shape — this is the one time `ARCHITECTURE.md` gets read
genuinely in full, plus `DECISIONS.md`'s full index (skim every title, open whatever's
relevant) so the refactor doesn't undo a hard-won fix without realizing it.

**Start:** `CURRENT_STATE.md` → `ARCHITECTURE.md` in full → `DECISIONS.md` index in
full (not every entry body — the index alone is enough to spot landmines).

**During:** `ARCHITECTURE.md` gets updated **inline, as decisions are made** — not
after. This matches how this project has always preferred to work: a rule or the file
map changes the same turn the code changes, not in a batch at the end.

**End:** same as an Epic's end steps, plus: `DECISIONS.md` gets a mandatory new entry
explaining the WHY of the refactor (a refactor with no recorded reason is exactly the
kind of thing a future session might undo by accident).

## Session shape 4 — Documentation-only session

(Like this one.) Read whatever's being restructured, in full — the whole point is
consistency across the doc set, so partial reads are the wrong economy here. End the
same way: `CURRENT_STATE.md` updated to reflect the doc change itself, so the next
session knows the doc set changed and why.

## Git workflow

The project uses git as of 2026-07-20 (see `DECISIONS.md` for when — `CURRENT_STATE.md`
always has the current branch situation). `main` is kept stable; real work happens on a
branch per Epic/fix/refactor, merged back once verified.

**Branch naming** — prefix by session shape:
- `feature/<name>` — an Epic (session shape 1), e.g. `feature/workspace`,
  `feature/keyboard-editing-shortcuts`.
- `bug/<name>` — a bug fix (session shape 2), e.g. `bug/hover-ownership`,
  `bug/translation-mode-editor`.
- `refactor/<name>` — an architecture change (session shape 3), e.g.
  `refactor/hover-state-machine`.

Don't accumulate unrelated changes on one branch — a session that fixes two unrelated
bugs branches twice, not once, UNLESS the session is explicitly framed as one themed
unit of stabilization work (e.g. "this session is bug fixes + doc/process cleanup,
ship it as one PR") — judgment call, but the default is one branch per independent
change.

**Commits** — one coherent change per commit, message explains *why* over *what* (the
diff already shows what). No `--no-verify`, no force-push to `main` without the user's
explicit go-ahead.

**Pull Requests** — every finished branch gets a PR description (even if there's no
actual GitHub remote yet and it's just presented in-session) covering:
Summary, Motivation, Architecture, Documentation (which `docs/*.md` files changed),
Manual Testing (exactly what the user should verify in a real org — this project has
no way to test against Salesforce itself), Known Issues, Suggested Next Epic (from
`ROADMAP.md`'s priority table).

**Merging** — the user (Product Owner/QA) decides when a branch is actually
real-org-verified enough to merge; don't merge on the agent's own initiative without
that confirmation unless explicitly told to. Prefer `--ff-only` merges to `main` when
the branch is a direct descendant (keeps history linear); ask before anything that
would need a merge commit or rebase.

## How to add a `DECISIONS.md` entry

Append at the bottom, in this exact shape (the index at the top of that file is
generated from entries shaped like this — keep it consistent by hand now that the
one-time migration script is gone):

```
### #N — Short, greppable title (what happened, not just a category)
**Tags:** lowercase-kebab, keywords, someone-would-grep-for
**Files:** `path/to/file.ts`, `other/file.tsx`

Full explanation: what the problem/decision was, why the obvious approach didn't work
(if applicable), what the fix/decision actually is, and any caveat future work should
know about. As long as it needs to be — this file is meant to be grepped, not read
end to end, so entry length isn't a token cost most sessions ever pay.
```

Then add the matching one-line bullet to the Index section at the top of the file.
