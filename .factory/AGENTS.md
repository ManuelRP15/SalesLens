# Agent roster — roles, triggers, inputs, outputs

> Who does what in the factory. Read this to know which role a phase belongs to and
> whether it runs **inline** (in the orchestrator's own context) or as a **spawned
> subagent** (isolated context). The routing that decides *which* roles a task uses lives
> in `METHODOLOGY.md`; this file defines the roles themselves.

## The inline-vs-subagent rule (token efficiency is a first-class concern)

A subagent starts cold: it re-establishes context, re-explores, reports back, and the
orchestrator then re-reads its report. That overhead is real. So:

- **Default to inline.** Most roles are *hats the orchestrator wears in sequence*, not
  separate processes. Framing, planning, building, verifying, documenting — the main
  agent already holds the context; spawning would only pay to rebuild it.
- **Spawn only when isolation genuinely pays:** (1) **fresh-eyes review** — a reviewer
  that did not write the code catches what the author's context blinds them to; (2) **a
  wide, independent investigation** — sweeping many files to answer one question, where
  only the conclusion matters; (3) **noisy tool output** — a verifier whose harness/test
  logs would otherwise flood the orchestrator's context.
- **Never** split one small job across parallel subagents, and never exceed a handful of
  spawns for a normal task. If one subagent can do it, use one.

Two roles ship as real subagent definitions (`.claude/agents/factory-reviewer.md`,
`.claude/agents/factory-verifier.md`) because they meet the bar above. The rest are inline
playbooks the orchestrator follows.

---

## Roles

### 0. Orchestrator — `/factory` (inline, always)
The main agent. Owns the whole task lifecycle: reads stable context, classifies the risk
tier, runs the minimum effective workflow, enforces gates, escalates, and reports. It does
**not** blindly run every role — it selects the minimum set for the tier. It is the only
role the human talks to.
- **In:** the human's request + `CURRENT_STATE.md` + `project/adapter.md`.
- **Out:** a `DONE` or `DECISION REQUIRED` report, and a run-log entry (`ARTIFACTS.md`).

### 1. Product / Requirements (inline)
Turns the request into a **TASK_SPEC**: outcome, acceptance criteria, scope boundaries,
and — critically — flags product forks the human must decide (checks against `PRODUCT.md`
and `owner/PROFILE.md`). Its job is to make ambiguity *visible*, not to resolve it by
guessing.
- **Trigger:** T2, T3 (T0/T1 fold this into a one-line framing).
- **In:** request, `PRODUCT.md`, `owner/PROFILE.md`, relevant `ROADMAP.md` phase.
- **Out:** `TASK_SPEC` (`ARTIFACTS.md`), possibly a `DECISION REQUIRED`.

### 2. Architect (inline; subagent only for wide investigations)
Decides *how*, reusing existing patterns. Names the files touched, the pattern to follow,
the trade-offs, and any architectural risk. Escalates high-risk design forks (T3) before
any code is written.
- **Trigger:** T2, T3.
- **In:** `TASK_SPEC`, `ARCHITECTURE.md`, relevant `DECISIONS.md` entries.
- **Out:** `PLAN` (`ARTIFACTS.md`): approach, files, pattern reused, risks, test strategy.

### 3. Builder (inline, always)
Implements the approved plan following the existing architecture and the project's
non-negotiables. Touches only what the task needs. Runs G2 machine checks as it goes.
- **In:** `PLAN` (or framing for T0/T1).
- **Out:** the diff; G2 result.

### 4. Reviewer — `factory-reviewer` (subagent — fresh eyes)
Reviews the diff for correctness, maintainability, duplication, regressions, edge cases,
error handling, and unnecessary complexity. Can **reject** with structured findings. Spawned
because a reviewer that didn't write the code is worth the context cost.
- **Trigger:** T2, T3. (T1 gets an inline self-review by the orchestrator.)
- **In:** the diff + `TASK_SPEC` + the project's non-negotiable rules.
- **Out:** `REVIEW_REPORT` (`ARTIFACTS.md`): findings ranked by severity, or "clean."

### 5. Verifier / QA — `factory-verifier` (subagent — isolates noisy output)
Closes gate **G4's machine side**: runs `vitest`, runs/exercises the **dev harness** for
interaction changes, writes missing tests, and reports **evidence** (what ran, what passed,
what it proves and what it does NOT). Explicitly separates machine-verified from
real-org-only, and drafts the **Manual Testing** checklist for the human side.
- **Trigger:** all tiers (inline for T0; subagent when harness/log output is heavy).
- **In:** the diff + `TASK_SPEC`'s acceptance criteria.
- **Out:** `QA_REPORT` (`ARTIFACTS.md`): evidence + the real-org checklist.

### 6. Debug / Fix (inline)
Engaged when a gate fails with a class-(a) implementation bug (`METHODOLOGY.md §3`).
Finds the **root cause** (not the symptom), fixes, re-runs the affected verification. Bound
by the 2-cycle loop guard — if it can't converge or the cause is class (b)/(c)/(d), it
escalates instead of patching.
- **In:** the failure (`QA_REPORT` / `REVIEW_REPORT` finding).
- **Out:** a fix + re-verification, or an escalation with attempts attached.

### 7. Documentation / State (inline, always at the end)
Closes **G5**: updates the owning `docs/*.md` per `WORKFLOW.md`'s ownership table — a new
`DECISIONS.md` entry for anything non-obvious, `ARCHITECTURE.md`'s file map if files moved,
`ROADMAP.md` phase status, and `CURRENT_STATE.md` **last, always**. Also updates the
run-log and proposes `owner/PROFILE.md` changes when a preference pattern emerged.
- **In:** everything the task produced.
- **Out:** doc edits; run-log entry; optional profile-update proposal.

### 8. Security / Permissions (inline or subagent — only when relevant)
Triggered by T3 or any change touching auth, the `sid` cookie, `host_permissions`, write
paths, or data exposure. For STI specifically: Salesforce permission models, the
optimistic-concurrency rule (`ARCHITECTURE.md` #9), and the "never leave a permanent trace"
bar (#10). Not run for typical UI/read-path work.
- **Out:** a security note folded into the `REVIEW_REPORT`, or a blocking finding.

---

## Not built yet (deliberately)

The brief lists up to ~10 possible roles. Building all of them now would be exactly the
premature complexity the brief warns against. A dedicated **UX/Product-Quality** reviewer
and a standalone **Regression** agent are the two most likely next additions — see
`EVOLUTION.md` for when they earn their place. Until then, UX review is the orchestrator
checking the diff against `owner/PROFILE.md`, and regression is the verifier widening its
test/harness sweep on T3.
