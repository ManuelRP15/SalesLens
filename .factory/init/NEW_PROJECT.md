# Initializing the factory on a new project

> How to point the universal factory at a project it has never seen. The goal: infer the
> project (don't assume Salesforce), ask only what can't be inferred, and produce the
> minimal knowledge structure the factory needs — nothing more. Invoked via `/factory-init`.

## What stays and what's new

- **Stays, untouched:** the whole universal layer (`.factory/MANIFESTO.md`,
  `METHODOLOGY.md`, `AGENTS.md`, `ARTIFACTS.md`, `EVOLUTION.md`) and — if this owner is the
  same person — `.factory/owner/PROFILE.md`. Universal preferences (simplicity, low-friction
  UX, reality-over-confidence…) carry over; they are not Salesforce-specific.
- **New per project:** a fresh `.factory/project/adapter.md`, plus whatever minimal
  project-knowledge docs the project lacks. **Salesforce-specific decisions, APIs, and UI
  patterns do NOT carry over** — they stay in the old project's `docs/`.

## The init sequence

1. **Analyze the repository.** Detect the stack from manifests (`package.json`,
   `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`, `Gemfile`…), the framework, the
   entry points, the test runner, the build/deploy scripts, and the directory shape. Read
   the README and any existing docs. Infer, don't ask, wherever the repo answers it.
2. **Identify the architecture.** The module boundaries, the data flow, the obvious risk
   surfaces (auth, persistence, external APIs, anything irreversible). Note existing
   conventions to preserve — **do not reorganize a project's existing docs or structure.**
3. **Ask only the critical questions** (via a single batched decision, not a drip):
   - Product vision / who it's for — if the repo doesn't already state it.
   - The Definition of Done: what commands gate a change (test/build/lint/typecheck), and
     what — if anything — can only be verified by a human against a live system (the G4
     real-world boundary; every project has one, name it).
   - The risk profile: which files/areas are high-risk (write paths, auth, data, irreversible
     actions) → these map to T3.
   - Any hard constraints or non-negotiables the factory must never violate.
4. **Generate the adapter.** Fill `.factory/project/adapter.md` for the new project from the
   template below: identity, commands table, where knowledge lives, risk profile,
   non-negotiables, Definition of Done. Keep it a *router*, not a knowledge dump.
5. **Establish minimal project knowledge.** If the project has no equivalent of STI's doc
   set, create the smallest useful version: at least a `CURRENT_STATE.md` (what's active)
   and a `DECISIONS.md` (append-only, greppable). Add `ARCHITECTURE.md`/`ROADMAP.md`/
   `PRODUCT.md` only if the project is large enough to need them — **do not create empty
   ceremony docs.** If the project already has good docs, adopt them; don't duplicate.
6. **Confirm and stop.** Present the adapter + any new docs for approval. Do not start
   feature work in the init session — initialization ends at "ready for the first task."

## Adapter template (copy into `.factory/project/adapter.md`)

```
# Project Adapter — <name>
## Identity            — what it is, stack, one-line purpose
## Commands            — table: typecheck | test | build | lint | run  → command + gate
                         Mark which are automatable vs. human-only (the G4 boundary).
## Where knowledge lives — route to the project's own docs; don't re-derive
## Risk profile        — what makes a change T3 here (write paths, auth, data, irreversible)
## Non-negotiables     — inviolable constraints the factory must respect
## Definition of Done  — the universal gates bound to this project's commands/docs
## Current state pointer — the one file that always answers "what's active" (never hardcode)
```

## Principles for init

- **Infer over interrogate.** The owner should not re-explain what the repo already says
  (`WORKFLOW.md`'s own rule, generalized).
- **Preserve, don't reorganize.** Existing conventions and docs are assets; adopt them.
- **Minimal structure.** The smallest knowledge set that lets the factory route correctly.
  A tiny project may need only an adapter and a `CURRENT_STATE.md`.
- **Name the real-world boundary explicitly.** Every project has verification the factory
  can't do itself (a live org, a device, a paid API, a production deploy). Getting this
  boundary right at init is what keeps the factory honest later (G4).
