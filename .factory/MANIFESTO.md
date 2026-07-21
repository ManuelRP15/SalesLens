# The AI Software Factory

> This is the **router** for the factory — the equivalent of the project's `CLAUDE.md`,
> but for the *development methodology* rather than the *product*. It is short on purpose.
> Read it to understand what the factory is and how to operate it; everything else here
> is loaded on demand.

## What this is

A reusable, quality-first system for building software with AI agents under human
direction. It has **two layers**, kept deliberately separate so the methodology can move
to a new project without dragging this one's specifics along:

```
AI SOFTWARE FACTORY
├── Universal methodology        .factory/*.md        (portable — reused by every project)
│   ├── MANIFESTO.md   ← you are here (the router)
│   ├── METHODOLOGY.md          risk tiers, routing, quality gates, DoD, failure model
│   ├── AGENTS.md               the agent roster: role, trigger, inputs, outputs
│   ├── ARTIFACTS.md            handoff schemas + the run-log (observability)
│   └── EVOLUTION.md            V1 → V5 roadmap for the factory itself
│
├── Human Product Owner profile  .factory/owner/PROFILE.md   (portable across projects)
│       explicit + inferred product/UX/engineering preferences, with evidence + confidence
│
└── Project adapter              .factory/project/adapter.md  (per-project — NOT portable)
        binds the universal methodology to THIS project: stack, commands, risk profile,
        Definition of Done, and where the project's own knowledge lives (its docs/ set)
```

The current project — the Salesforce Translation Inspector — is the factory's **first
client**. Its `docs/` set (`CLAUDE.md`, `CURRENT_STATE.md`, `ARCHITECTURE.md`,
`DECISIONS.md`, `ROADMAP.md`, `PRODUCT.md`, `WORKFLOW.md`) is already an excellent
context architecture. **The factory does not replace it — it drives it.** The adapter
points at it; the factory reuses it as-is.

## How the human operates it

One entry point. In a Claude Code session:

```
/factory <what you want, in your own words>
```

That's the whole interface. Behind it, the orchestrator (the main agent, following the
`factory` skill) classifies the work, runs the *minimum effective workflow* for its risk,
verifies what it can, and reports back in exactly one of two shapes:

- **`DONE`** — implemented / verified / changed / tests / PR / what still needs a human.
- **`DECISION REQUIRED`** — a genuine product or architecture fork it must not guess.

To start the factory on a brand-new project instead: `/factory-init` (see
`init/NEW_PROJECT.md`).

## The one principle that overrides the rest

**Optimize for high-quality software consistent with the project's vision, not for
"the agents finished."** Correctness over speed, simplicity over cleverness, verification
over confidence, one answer or an honest escalation over a confident guess. A good
question that stops the line is a success, not a failure.

## The factory's own non-negotiables

1. **Never claim real-world verification the factory didn't perform.** Machine checks
   (typecheck / unit / build / harness) are the factory's to close. Anything requiring a
   live external system (here: a real Salesforce org) is handed to the human as an exact
   checklist — the factory stops at that boundary and says so. This is the project's #1
   historical failure mode (see `DECISIONS.md` — most bugs were "real-org reported");
   the factory is built around it, not in denial of it. See `METHODOLOGY.md` gate **G4**.
   And never report a user-facing epic DONE without a **demonstrated, observable outcome the
   user can reach** — code existing and green machine gates are not delivery. This is the
   run-1 lesson: an epic passed every gate while the product was unchanged. See gate **G-PO**.
2. **Run the minimum effective process for the risk.** Don't over-process a typo; don't
   under-process a write-path change. Routing is in `METHODOLOGY.md`, not improvised.
3. **The project's own rules win.** The adapter's non-negotiables (for STI, the 10 rules
   in `ARCHITECTURE.md` and the routing in `CLAUDE.md`) are inviolable. The factory adds
   process around them; it never overrides them.
4. **Explicit human instruction outranks everything, including the preference model.**
   Priority order is fixed — see `owner/PROFILE.md`. Inferred preferences inform; they
   never override a current instruction or a recorded project decision.
5. **Persist only durable knowledge.** Ephemeral execution context (logs, test output,
   scratch analysis) dies with the task. Decisions, state changes, and new preferences
   are written to the owning doc the same turn they're made.

## Reading order when you need more

- Operating a task → `METHODOLOGY.md` (routing + gates) is the one to know cold.
- Who does what → `AGENTS.md`.
- What a handoff looks like → `ARTIFACTS.md`.
- What the human prefers → `owner/PROFILE.md`.
- This project's specifics → `project/adapter.md` → then the project's own `docs/`.
