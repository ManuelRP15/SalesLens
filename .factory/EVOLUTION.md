# Evolution roadmap — V1 → V5

> Where the factory goes next, and — as important — what it deliberately does NOT build
> yet. The rule throughout: **a capability earns its place by a demonstrated need, not by
> appearing on this list.** Each version should prove its value before the next is built.

## Governance (applies to every version)

The factory may **propose** improvements to its own methodology; it may not **silently
change** it. Any edit to the universal layer (`METHODOLOGY.md`, `AGENTS.md`, gates, routing)
or to `owner/PROFILE.md` is proposed to the human and applied on approval. This is the
guardrail that stops the factory from quietly degrading its own standards while chasing
throughput. Self-improvement is a suggestion engine, not an autonomous rewrite.

---

## Run 1 retrospective — what the first real epic taught (V1.1)

The first production epic (Translation Health "Duplicated detection") was reported **DONE**
while the user-facing product was **practically unchanged**. Owning that failure produced
two V1.1 improvements, both now landed.

### A. The Product Outcome gate (fix shipped)

**Root cause:** the factory's Definition of Done had no gate for *"did the user actually
gain the intended behavior?"*. Every machine/review/docs gate passed while the outcome was
undelivered — the change was stranded on an unmerged branch, the surface only populated from
live data the factory can't produce, and the sample data didn't exercise the feature.
**Fix:** `METHODOLOGY.md` now has **gate G-PO (Product Outcome)** + a **verification-tier
ladder** (code-exists < machine < harness < real-org < product-outcome-observed), the
orchestrator skill enforces both, and the report format requires stating *what the user
gained* and *where they see it*. Demonstrated its worth immediately: building a preview
harness to satisfy G-PO caught a real render bug the machine gates never saw.

### B. Token efficiency — run 1 as a BASELINE, not the target

Run 1 spent far more context than steady-state should. Where it went, and the fix:

| Waste in run 1 | Fix (now factory practice) |
|---|---|
| **Broad upfront ingestion** — read most of the doc set at once. | Some was unavoidable for a *first* run; steady state uses **targeted retrieval**: `CURRENT_STATE.md` first, then grep/route per the adapter table — full docs only when the task type demands it. |
| **Path-duplicated reads** — read `Health.tsx`/`background`/`types` from the primary path while planning, then **re-read** them from the worktree path before editing. | **One working location per task; read each file once.** Don't split reads across a worktree and its primary. |
| **Subagent context reconstruction** — the reviewer cold-started and **re-read `ARCHITECTURE`/`DECISIONS`/`PROFILE`** the main agent already held (~85k tokens for a ~400-line diff). | Don't spawn when the main session holds the context; if you do, **pass the needed context inline** (the diff + the specific rules) and tell it *not* to re-ingest the doc set. For a small diff, inline self-review is cheaper and sufficient. |
| **Tooling thrash** — repeated junction attempts (class-e) before falling back to `npm ci`. | Classify class-(e) fast and switch approach; don't retry a failing environment op. |
| **Redundant full-suite runs.** | **Targeted tests while iterating, full suite once at the end.** |

**Explicit evolution goal (tracked here):** *each iteration should deliver equal or better
software quality with less unnecessary context consumption and fewer redundant operations.*
The factory should get better at answering **"what do I need to know to do this task well?"**
rather than "read everything just in case." Concrete levers: targeted retrieval over broad
ingestion; reuse in-session context; scale analysis and agent count to the risk tier; persist
durable knowledge to `docs/` (already the system) so it's never re-derived; prefer the
smallest agent set that reaches the required quality.

**Guardrail — the priority order is fixed and efficiency is LAST:** correct product outcome
> quality/robustness > proper verification > efficient context use. Never trade any of the
first three for tokens. A cheaper run that ships an unverified or invisible outcome is the
run-1 failure again, not progress.

---

## Run 2 retrospective — ghost progress (V1.2)

Run 2 (Translation Health v2) passed its gates, merged on GitHub, and was reported
complete — while the owner's local project directory contained none of it, and the real
local product tip (~2,400 uncommitted lines of `#63`) sat unmanaged in the working tree.
The owner ordered a full state reset (`docs/DECISIONS.md #64`) and retired the epic.

**Root cause (orchestration, not implementation):** the factory defined delivery in Git
terms (commits, PR, merge) instead of product terms (present in the tree the owner runs).
A separate worktree became both the working and the delivery location; no gate ever asked
*"is this in the owner's actual project?"* — G-PO v1.1 even accepted "worktree" as an
answer to "where does the user run it".

**Fixes (V1.2, all landed):**
- `METHODOLOGY.md §0` — mandatory session-start CURRENT-PRODUCT-STATE reconciliation
  (local dir, branch, working-tree content, does it run, roadmap state, next work).
- Delivery redefined: present + machine-verified in the **active local checkout**; side
  worktrees are a rare exception and never a delivery location; G-PO's "runnable
  artifact" must be the local tree. `MANIFESTO.md` non-negotiable #0.
- Uncommitted local changes are PRODUCT STATE — reconciled first, never bypassed.

**What went well, kept:** the archive-tag + revert pattern retired the epic without losing
reusable work (`archive/translation-health-v2` preserves the duplicate-detection module +
tests + preview harness); the run-1 G-PO preview-harness pattern remains valid.

**Standing discipline promoted from this run (owner instruction):**
- **After each substantial epic, a SHORT retrospective here** — what went well / what
  failed / what was token-expensive / which verification earned its place / which didn't.
  Promote a lesson into methodology only when it is a reusable principle, not a one-off.
- **Don't self-modify the factory on every wobble.** First solve the product problem;
  then classify the failure (implementation bug / verification gap / context problem /
  orchestration problem / methodology problem) and change methodology only for the
  genuinely systemic class. Evidence over reflex; small targeted amendments over
  architectural expansion.
- **Full priority order (fixed):** correct product outcome > UX & product quality >
  verification & regression safety > architecture & maintainability > documentation >
  Git/GitHub hygiene > token efficiency. Each matters; conflicts resolve upward.
- **Never confuse activity with progress:** commits, agents, reports, and tokens are
  cost, not output. The only measure is what the user can now do better, visible in the
  real local product.

---

## V1 — Orchestrated development (this version) ✅

**What it is:** a single human entry point (`/factory`), risk-based routing, explicit
quality gates with an honest verification boundary, structured artifacts + a run-log for
observability, an evidence-based owner preference model, a reusable project adapter, and a
new-project init playbook. Built on Claude Code's native substrate (skills + subagents +
the existing docs), not a parallel framework.

**Deliberately NOT in V1:** a UX-quality agent, a standalone regression agent, a metrics
dashboard, parallel multi-agent pipelines, cross-project orchestration. All of these are
premature until V1 is used on real tasks and its friction is observed.

**Exit criterion:** the owner has run `/factory` on several real STI tasks and the loop
(classify → minimum workflow → verify machine side → hand off real-org checklist → docs →
PR) feels reliable and low-friction.

---

## V2 — Sharper context & preference routing

**Trigger to start:** V1 escalates or mis-routes often enough to notice a pattern.

- **Preference feedback loop, active.** After each accept/modify/reject, the orchestrator
  logs the signal; when a pattern crosses the ≥3-instance bar, it proposes a `PROFILE.md`
  promotion (still human-approved). The model starts *anticipating* UX calls, not just
  recording them.
- **Finer context routing.** Cache the stable project context (adapter + non-negotiables)
  so it isn't re-read per task; route `DECISIONS.md`/`ARCHITECTURE.md` sections by the
  task's touched files automatically instead of by hand.
- **A real UX/Product-Quality reviewer role** (`AGENTS.md` lists it as not-yet-built) — once
  there's a body of UX findings worth systematizing against `PROFILE.md`'s P-series.

**Exit criterion:** routing and context selection need noticeably less hand-holding; the
preference model has correctly predicted at least a few of the owner's calls in advance.

---

## V3 — More autonomous QA & self-correction

**Trigger:** the machine-verifiable surface grows (more unit-testable logic, a richer
harness) such that more of G4 can close without a human.

- **Verifier writes more of its own tests** and widens harness scenarios automatically for
  the touched area; a standalone **regression sweep** on T3.
- **Tighter self-correction:** failure classification (`METHODOLOGY.md §3`) drives the fix
  loop more autonomously within the 2-cycle guard, with clearer "this is class (c), escalate"
  detection so it stops fixing the wrong problem earlier.
- **Harness reach extended** toward the limits `ARCHITECTURE.md` documents (scroll events,
  focus) so more real-org-only items move to the machine side — shrinking the handoff, never
  by faking it.

**Exit criterion:** for machine-verifiable work, the factory closes G4 itself in the large
majority of cases and only hands off what genuinely needs a live org.

---

## V4 — Multi-project support

**Trigger:** a second real project wants the factory (the brief's explicit long-term goal).

- **`/factory-init` proven on a non-Salesforce repo** — a different stack, its own adapter,
  its own real-world boundary — with zero Salesforce assumptions leaking in.
- **The owner profile shared across projects**, project decisions kept isolated — validating
  the portable/project-specific split the architecture was built around from day one.
- Per-project run-logs and adapters coexist; the universal layer is versioned so an
  improvement made for one project is available to all.

**Exit criterion:** two projects run on one universal layer + one owner profile, and a
methodology improvement made in one benefits both without cross-contaminating their specifics.

---

## V5 — Highly autonomous factory

**Trigger:** V2–V4 have made routing, verification, and self-correction trustworthy.

- The large majority of *machine-verifiable* execution runs end-to-end autonomously; the
  human is reliably involved only at the points where judgment has the highest value
  (product forks, high-risk architecture, real-world acceptance).
- The factory anticipates likely owner preferences well enough to pre-empt many small UX
  calls — while still recognizing *"this is a genuinely new decision; the model is
  insufficient"* and escalating exactly then.
- Self-improvement proposals are routine and high-quality; the human's role on the
  methodology becomes review-and-approve, not authorship.

**The ceiling is deliberate.** "Highly autonomous" is not "unsupervised." The real-world
verification boundary (G4) and the human-acceptance gate (G7) do not disappear at V5 — they
are the point. A factory that removed them would be optimizing for "the agents finished,"
which `MANIFESTO.md` names as the one thing never to optimize for.

---

## Prioritization principle

Progress is **V1 → V2 → V3** before **V4**. Deepen the single-project quality loop until
it's genuinely trustworthy *before* spreading to multiple projects — depth over breadth,
which is also the owner's own product preference (`PROFILE.md` C2). Multi-project support
built on a shaky quality loop would just multiply the shakiness.
