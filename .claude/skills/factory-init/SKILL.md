---
name: factory-init
description: Initialize the AI Software Factory on a project it hasn't seen before. Invoke as `/factory-init` from the target repo. Analyzes the repository, infers the stack and architecture, asks only the critical questions it can't infer, and generates a project adapter plus minimal knowledge docs — leaving the project "ready for the first task". Use when onboarding the factory to a NEW project (not for running a task on an already-onboarded one — that's `/factory`).
---

# Factory init

Onboard the factory to this repository. Follow `.factory/init/NEW_PROJECT.md` in full — it
is the authoritative playbook; this skill is the trigger and a checklist.

## What NOT to touch
- The universal layer (`.factory/MANIFESTO.md`, `METHODOLOGY.md`, `AGENTS.md`,
  `ARTIFACTS.md`, `EVOLUTION.md`) — it's portable, reuse as-is.
- `.factory/owner/PROFILE.md` — if it's the same owner, universal preferences carry over.
  Do NOT copy project-specific decisions into it.
- The project's existing docs and structure — **preserve, adopt, do not reorganize.**

## Sequence (see `NEW_PROJECT.md` for the detail)
1. **Analyze the repo** — detect stack/framework/test-runner/build+deploy/entry points from
   manifests and config; read the README and any docs. Infer; don't ask what the repo answers.
2. **Identify architecture** — module boundaries, data flow, risk surfaces (auth, persistence,
   external APIs, anything irreversible), existing conventions to preserve.
3. **Ask only the critical questions**, batched into one decision, not a drip:
   product vision (if unstated), the Definition of Done (which commands gate a change), the
   **real-world verification boundary** (what only a human can verify against a live system —
   every project has one, name it), the high-risk areas (→ T3), and any hard non-negotiables.
4. **Generate `.factory/project/adapter.md`** from the template in `NEW_PROJECT.md`: identity,
   commands table (mark automatable vs. human-only), where knowledge lives, risk profile,
   non-negotiables, Definition of Done, current-state pointer. Keep it a router, not a dump.
5. **Establish minimal project knowledge** — if the project lacks it, create the smallest
   useful set (at least `CURRENT_STATE.md` + an append-only `DECISIONS.md`). No empty
   ceremony docs. If good docs exist, adopt them.
6. **Confirm and stop.** Present the adapter + new docs for approval. Do not start feature
   work — init ends at "ready for the first task." The first real task is a later `/factory`.

## Output
A short summary: detected stack + architecture, the adapter you wrote, any knowledge docs
created, the critical questions answered, and the named real-world verification boundary —
then "ready for the first task: run `/factory <goal>`."
