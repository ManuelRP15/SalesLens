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
