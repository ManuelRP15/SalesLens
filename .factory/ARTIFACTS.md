# Artifacts & observability

> How agents hand off to each other, and how a run stays understandable. The principle:
> agents communicate through **concise structured artifacts and state transitions**, not
> long conversational chains — low tokens, high traceability, easy recovery.

## Design rules for every artifact

- **Bounded.** A handoff is a form to fill, not an essay. If a field is empty, write
  "none" — don't pad. Most artifacts fit on one screen.
- **Ephemeral by default.** Artifacts live in the run-log for the current task
  (`runs/<branch>.md`) and are discarded when the task closes. Only **durable knowledge**
  graduates into `docs/` (a `DECISIONS.md` entry, a `ROADMAP.md` status, a `PROFILE.md`
  preference). The distinction is `MANIFESTO.md` non-negotiable #5.
- **In English, always.** Product discussion with the human may be in Spanish; every
  artifact, doc, comment, and code identifier is English (`ARCHITECTURE.md`'s standing rule).

## The chain

```
REQUEST → TASK_SPEC → PLAN → (build) → REVIEW_REPORT → QA_REPORT → [FIX_REQUEST → …] → FINAL_REPORT
```

Lower tiers skip stages: T0 is `REQUEST → build → FINAL_REPORT`; T1 adds a QA_REPORT.

### TASK_SPEC (Product/Requirements → Architect)
```
Goal:            what the human wants, one sentence
Acceptance:      - bullet criteria, each independently checkable
Out of scope:    what this task deliberately does NOT do
Product forks:   any decision that needs the human (or "none")
Tier:            T0 | T1 | T2 | T3   + the routing signal that set it
```

### PLAN (Architect → Builder)
```
Approach:        the how, in 2–4 lines
Files:           path — what changes there
Pattern reused:  the existing abstraction/rule being followed (never invent without need)
Risks:           architectural or regression risks; the non-negotiables in play
Verify by:       unit test | harness | real-org-only (which, per G4)
```

### REVIEW_REPORT (Reviewer → Orchestrator)
```
Verdict:         clean | changes-requested
Findings:        [severity] file:line — the defect → the fix   (ranked; empty if clean)
```

### QA_REPORT (Verifier → Orchestrator)
```
Ran:             the commands / harness scenarios executed
Machine-verified: what passed and WHAT IT PROVES
Not verified:    what remains real-org-only (G4's human side)
Manual checklist: exact steps for the human — click X, expect Y   (this is the G7 handoff)
```

### FIX_REQUEST (Orchestrator → Debug/Fix)
```
Failure class:   (a)–(f) per METHODOLOGY §3
Symptom:         what failed
Root cause:      named — or "unknown, needs investigation" (which caps retries)
```

### FINAL_REPORT — what the human sees
Exactly one of the two shapes from `MANIFESTO.md`. `DONE`:
```
DONE
Implemented:     …
Verified:        machine: … | real-org needed: … (the checklist)
Changed:         files + docs touched
Tests:           pass/added
PR:              branch / link, or "not opened — <why>"
Needs decision:  none | <the fork>
```

## Observability — the run-log

One append-only file per task branch: **`runs/<branch-name>.md`**. It is the factory's
"what happened and why" — cheap, greppable, git-ignored (it's ephemeral scaffolding, not
project knowledge).

```
# run: feature/<name>
tier: T2   started: <date>
- [phase] one line: what was decided/done  (timestamps optional)
- gate G2: pass
- ESCALATED: <the DECISION REQUIRED, and the human's answer>
- gate G4: machine ✓ (harness: inside-click survives edit) | real-org: 3-step checklist handed off
- FINAL: done, PR #N, real-org pending
```

The human can read one file to know: what tier, which phase it's in, what was decided,
what failed and was retried, why it escalated, and where it's blocked. That is the whole
observability requirement for V1 — **no dashboard** (the brief: "do not overbuild a
dashboard prematurely"). The run-log graduates to a richer view only if a real need
appears (`EVOLUTION.md`).

## What is NOT an artifact

Logs, raw test output, screenshots, exploratory greps, intermediate reasoning. These are
**ephemeral execution context** (`MANIFESTO.md` #5) — they inform the current step and are
then dropped. They never become project memory, and they never get pasted into a `docs/`
file (`CLAUDE.md`: "Never paste source code / raw output into a doc").
