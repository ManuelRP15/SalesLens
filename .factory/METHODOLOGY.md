# Methodology — routing, gates, and the failure model

> The operational core of the factory. Read this cold; the rest is reference. It answers
> three questions: *how much process does this task need* (risk tiers + routing), *what
> "done" means* (quality gates), and *what to do when something goes wrong* (failure
> model + escalation).

---

## 1. Risk tiers — how much process

Every task is classified into exactly one tier **before** work starts. The tier decides
the workflow. When signals disagree, **take the higher tier** — under-processing a
risky change is the expensive mistake, over-processing a trivial one only wastes tokens.

| Tier | What it is | Maps to STI session shape |
|---|---|---|
| **T0 — Trivial** | One file, no logic: a string, a comment, a doc typo, a constant. Zero regression surface. | (none — too small to have one) |
| **T1 — Small** | A localized change using an existing pattern; a bug fix; low regression risk; **fully verifiable by unit test or the dev harness.** | Bug fix (shape 2) |
| **T2 — Feature** | A new capability, or a change spanning several files, or one with a real design choice. | Epic (shape 1) |
| **T3 — High-risk** | Architecture change; touches a **write path**, auth/permissions, or user data; irreversible; cross-cutting; or reopens a settled decision. | Refactor (shape 3) |

### Routing signals — what pushes a task UP a tier

Read the request, then check the diff surface. Any one of these forces at least the tier
named:

- Touches a **write path** → **T3.** For STI: `metadata-write.ts`, the write functions in
  `salesforce-api.ts` (`saveCustomLabelTranslation`), or `background/index.ts`'s
  `saveTranslation`. Writes hit a real org and are the deliberate exception to graceful
  degradation (`ARCHITECTURE.md` rule #6) — they get the most process.
- Touches **interaction / shadow-DOM / hover ownership** → **T2 minimum, and G4 REQUIRES
  the harness.** This code (`content/index.tsx`, `interaction.ts`, `Tooltip.tsx`,
  `AuditPanel.tsx`) has produced more "invisible on review, found in a real browser" bugs
  than anything else in the project (`DECISIONS.md #50, #54, #55, #61, #62, #63`). Review
  alone is not verification here.
- Adds a **new `chrome.runtime` message type** or a **new metadata `LabelType`** → **T2**,
  and `ARCHITECTURE.md` must be read in full (per `CLAUDE.md`'s routing).
- **Requirements are ambiguous**, or more than one valid product answer exists → escalate
  at gate **G0** regardless of tier; do not pick silently.
- Reopens or contradicts a recorded decision (`DECISIONS.md`) or a non-negotiable rule →
  **T3**, human gate mandatory.

### Workflow per tier

The orchestrator runs these phases. **Phases marked `[inline]` run in the main agent**
(cheap, no context re-establishment). **Phases marked `[subagent]` are spawned** only
when isolation genuinely pays for itself. See `AGENTS.md` for each role.

```
T0  Build[inline] → G2 machine checks → G5 docs (only if a rule/state changed) → report

T1  Frame[inline] → Build[inline] → G2 → G4 verify (unit/harness) → self-review[inline]
    → G5 docs → G6 commit → report

T2  Frame → TASK_SPEC → Plan (architect)[inline, or subagent if wide]
    → [G0/G1 human gate IF design is ambiguous or a fork exists]
    → Build[inline] → G2 → G4 verify
    → Review (reviewer)[subagent — fresh eyes] → fix loop
    → G5 docs → G6 PR → G7 hand real-org checklist to human

T3  = T2, plus: G1 human gate is MANDATORY before Build
    → Security/permissions pass[inline, or subagent] where auth/data/write is involved
    → Regression check (broader test/harness sweep)
    → G7 human acceptance is MANDATORY (never merge on the factory's initiative)
```

The default is **do the least that still closes every required gate for the tier.** If a
T2 turns out to be one obvious line with an existing test, collapse toward T1 — but say so.

---

## 2. Quality gates — the Definition of Done

A task is **done** only when every gate its tier requires is closed. "It compiles" closes
exactly one gate.

| Gate | Name | Closed when | Required for |
|---|---|---|---|
| **G0** | Requirements | Acceptance criteria are explicit and unambiguous; no unresolved product fork. Ambiguity here → escalate, don't proceed. | all |
| **G1** | Architecture | Approach reuses existing patterns; no abstraction added without a real need; every project non-negotiable respected. | T2, T3 |
| **G2** | Implementation | `npx tsc --noEmit` clean, `npx vitest run` green, `npm run build` succeeds. Unrelated files untouched. | all |
| **G3** | Review | Correctness, duplication, edge cases, error handling, regressions reviewed; findings fixed or consciously deferred with a reason. | T2, T3 (T1: inline self-review) |
| **G4** | Verification | The change is *actually exercised* — see the boundary below. | all |
| **G5** | Documentation | The right `docs/*.md` updated per `WORKFLOW.md`'s ownership table, same turn. | any task that changed a rule, decision, state, or roadmap item |
| **G6** | Delivery | Focused commit(s), correctly-named branch, PR body per `.github/PULL_REQUEST_TEMPLATE.md`. | T1+ (T0 usually rides an existing branch) |
| **G7** | Human acceptance | The human has verified real-world behavior and accepted. | T2, T3, and anything real-org-dependent |

### G4 — the honest verification boundary (the heart of the factory)

Verification splits in two, and the factory is scrupulous about which side it's on:

- **Machine-verifiable — the factory closes this itself.** Pure logic → a unit test
  (`vitest`). Interaction / ownership / scroll / shadow-DOM → the **dev harness**
  (`npm run harness`, see `ARCHITECTURE.md`), because jsdom cannot express the browser
  behaviors these bugs live in. If a change is machine-verifiable and the factory did not
  exercise it, **G4 is not closed** — no exceptions, no "should work."

- **Real-world-only — the factory CANNOT close this; it hands off.** Anything that needs
  a live Salesforce org: metadata resolution correctness, actual saves, real Lightning
  DOM, genuine focus events, smooth-scroll animation. The factory **never marks these
  verified.** It produces the exact **Manual Testing** checklist (what to click, in what
  order, expected result) and stops at G7. Reporting "done, unverified against a real org"
  with that checklist *is* the correct closure of G4 for this side of the boundary.

This boundary is not a limitation to apologize for — it is the discipline the project's
whole history asked for. Read `CURRENT_STATE.md`'s "Known gaps / untested" list: that list
is G4's real-world side, tracked honestly, and the factory keeps it that way.

---

## 3. Failure model — what to do when a gate won't close

Don't "fix harder." First **classify the failure**, because the right response differs:

| Failure class | Signal | Response |
|---|---|---|
| **(a) Implementation bug** | Test/harness fails, logic wrong, typo-level cause. | Self-correct. **Budget: 2 cycles.** |
| **(b) Missing requirement** | The spec didn't say what to do in this case. | **Stop. Escalate (G0).** Don't invent the answer. |
| **(c) Architectural mismatch** | The change fights the existing design; the fix keeps growing. | **Stop. Escalate (G1)** with the mismatch named. Don't reshape architecture silently. |
| **(d) Product ambiguity** | Two valid behaviors, a UX fork, a taste call. | **Stop. Escalate** with options + recommendation. |
| **(e) Environment / tooling** | Build tool, dependency, sandbox, external service down. | Report the tooling problem plainly. Don't loop; don't work around it destructively. |
| **(f) Wrong test / wrong spec** | The code is right; the test or acceptance criterion is wrong. | Fix the test/spec, and **say so explicitly** — never quietly weaken a test to make it pass. |

**Loop guard.** The same failure signature twice, or 2 self-correction cycles on class
(a) without convergence, → **stop and escalate** with both attempts attached. The factory
must be able to say *"I cannot safely continue without human input"* — and treat that as a
successful outcome, not a failed one.

**Root cause over symptom.** A fix that patches the observed symptom without a named root
cause is not done (`DECISIONS.md #63` is the canonical lesson: two symptom-patch rounds
`#61`/`#62` preceded finding the real duplicate-shadow-host cause). If you can't name the
root cause, you're in class (c) or still in class (a) — you are not finished.

---

## 4. Escalation protocol — the DECISION REQUIRED block

When any gate says "a human must decide," the factory stops and emits exactly this, kept
short enough to answer on a phone:

```
DECISION REQUIRED

Context:        one or two lines — what's being built, where it stalled
Problem:        the specific fork, stated neutrally
Option A:       … (consequence)
Option B:       … (consequence)
Recommendation: A or B
Why:            the one reason that decides it
Impact:         what's blocked until this is answered; reversibility
```

The human answers; the factory records the decision in `DECISIONS.md` if it's durable,
and — if the answer reveals a repeated pattern — proposes a `owner/PROFILE.md` update
(never auto-promotes; see that file's promotion rule). Then it resumes from the stalled
gate, not from the top.

---

## 5. What the factory is NOT allowed to do

- Merge to `main` on its own initiative (G7 is the human's — `WORKFLOW.md`).
- Force-push, `--no-verify`, or weaken a test to make a gate pass.
- Add a metadata type / edit affordance without a real write path (`ARCHITECTURE.md`
  rule #8).
- Claim a hover/interaction change works without the harness (§2, G4).
- Reintroduce a multi-candidate "possible origins" list (`ARCHITECTURE.md` rule #5).
- Spawn subagents for work the main agent could finish in a few tool calls (`AGENTS.md`).
