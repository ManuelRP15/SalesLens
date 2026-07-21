# Human Product Owner — Preference Model

> A structured, **evidence-based** model of how this product owner thinks about software
> and product quality. Its purpose is to help agents *anticipate* likely preferences — not
> to replace the owner's judgment, and never to override an explicit instruction.
>
> **Portable.** This file lives above any single project. Universal preferences here are
> meant to inform future projects too; project-specific decisions stay in that project's
> `docs/DECISIONS.md`, not here.
>
> Built from a retrospective analysis of `docs/DECISIONS.md` (#28–#63), `PRODUCT.md`, and
> `WORKFLOW.md`. No fabricated evidence — every strongly-held item cites multiple
> independent decisions.

## Priority order (fixed — this is how conflicts resolve)

1. **Current explicit human instruction** — always wins.
2. **Explicit project-specific decisions** (`docs/DECISIONS.md`, non-negotiable rules).
3. **Explicit universal product principles** (`PRODUCT.md`, and the "Explicit" items below).
4. **Strongly inferred preferences** (below).
5. **Weakly inferred preferences** (below).
6. **Agent assumptions** — lowest; never silently acted on when anything above is unclear.

If a new decision conflicts with an inferred preference, **do not silently pick one** —
surface the conflict and, when it matters, escalate (`METHODOLOGY.md §4`).

## Confidence taxonomy

- **Explicit** — the owner stated it directly (it's a written principle or rule).
- **Strongly inferred** — a consistent pattern across ≥3 independent decisions.
- **Weakly inferred** — limited evidence; a hint, not a rule. Treat as a question to ask,
  not an answer to assume.

---

## Product & UX preferences

### P1 — Preserve the user's working context during an active workflow. `Strongly inferred → near-Explicit`
Do not destroy the surface the user is working in (an open editor, a pinned tooltip, a
modal) as a side effect of an interaction that isn't an explicit dismissal. A dismissal
must be unambiguous (outside click / Escape / toggle key); an interaction *inside* the
surface is never a dismissal.
- **Evidence:** `#42` (a mid-edit textarea must never disappear), `#50` (editor closed
  itself — a bug), `#52` (tooltip must persist through inside clicks), `#54` (tooltip made
  "solid"), `#55` + `#62` + `#63` (two-stage dismissal: an outside gesture ends the *edit*,
  not the *reading*), `#62` (mousedown-ownership so a blur can't tear the editor down).
- **This is the single most-repeated theme in the project's history.** Weight it heavily
  for any interaction/modal/editor design.
- **Scope:** universal UX preference. Project exception: an explicit *state transition*
  (`invalidateAuditContext`, `#62`) is allowed to close the surface — that's not incidental
  destruction, it's the user asking for something that makes the surface meaningless.

### P2 — Radical simplicity; never expose options just because they exist. `Explicit`
Prefer one well-chosen default over a matrix of switches. Progressive disclosure: advanced
capability stays built and correct but out of the default view.
- **Evidence:** `PRODUCT.md` (Simple Mode; "never dump information just because available"),
  `#56` (a single Advanced toggle chosen over per-type checkboxes; Copy SOQL/XML removed;
  the "✎ customized" mark removed — *"quiero mantener la extensión sencilla"*), `#57`
  (shortcut UI simplified to Enabled/Disabled), `#33` (chips must read as part of
  Salesforce's own UI, never compete with it).
- **Practical test:** if a feature adds a setting, ask whether a good default removes the
  need for the setting at all. The owner will usually prefer that.

### P3 — Zero false positives: one confident answer, or honest silence. Never a hedge. `Explicit`
A wrong answer destroys trust and doesn't earn it back. A ranked "N possible origins" list
is a wrong answer wearing a disclaimer. "Unknown origin" / silence beats a guess.
- **Evidence:** `PRODUCT.md` quality bar #2, `#28` (never show a possible-origins list —
  broken and re-fixed once), `ARCHITECTURE.md` rule #5. Also a project memory
  (`no-ambiguous-candidates`).
- **Scope:** universal — applies to any product decision where the tool asserts a fact.

### P4 — The product must feel instant. Speed is a bar, not polish. `Explicit`
Hover-to-tooltip 50–150ms, no spinners, no per-hover network calls, cache aggressively.
- **Evidence:** `PRODUCT.md` quality bar #1, `#40` ("the inspector must feel INSTANT — a
  core product bar, not polish"), `#56` (a synchronous settings mirror kept specifically to
  protect the hover-latency path).

### P5 — Leave no permanent trace; everything reversible. `Explicit`
The tool must not persist anything to the org or leave residue on the page when disabled.
- **Evidence:** `PRODUCT.md` quality bar #3, `ARCHITECTURE.md` rule #10 (`removeAllBadges`
  strips every injected node on toggle-off), `#19`.

### P6 — Features read as native to the host UI, never bolted on. `Strongly inferred`
Injected UI should be quiet, contextual, and visually part of the surrounding product.
- **Evidence:** `#33` (v2 purple rectangles rejected as "visually foreign"; v3 quiet
  SLDS-toned chips), `#38c` (chips must stay legible on colored surfaces), `#62.6` (a status
  *rail*, not a colored dashboard — "not a colored dashboard").

---

## Engineering preferences

### E1 — One rule at one choke point, not the same decision scattered per-case. `Strongly inferred`
When the same logic appears in several places, the owner consistently drives it to a single
authority and deletes the copies — and treats "N copies of a rule" as the actual bug.
- **Evidence:** `#56` (`isInSimpleScope` — one choke point, both hover and bulk go through
  it), `#62` (`invalidateAuditContext` one place; `filterAuditEntries` one exported
  function used by panel *and* content; a root `onMouseDown` replacing per-element guards),
  `#63` (`interaction.ts` — one priority model; `isElementInViewport` the one shared
  predicate), `#57` (`hotkeys.ts` — one normalization, two consumers, "can't drift apart").

### E2 — Fix the root cause, not the symptom. `Strongly inferred`
A patch that hides a symptom without a named root cause is not accepted as done.
- **Evidence:** `#63` (found the real duplicate-shadow-host cause *after* two symptom-patch
  rounds `#61`/`#62`), `#62` ("the root shape of the bug is…"), `#29` (suspect the DOM walk
  before concluding the attribute is absent).

### E3 — No half-finished features; defer cleanly instead of shipping a stub. `Strongly inferred → Explicit`
Better to scope a feature out and build it properly later than to ship it half-working.
- **Evidence:** `#28` ("no-half-finished-features stance" — dead CSS deleted, not left),
  `#41` (deferred the deploy() path rather than ship it half-built), `#56` (narrowed scope
  rather than keep an edit button that reliably fails).

### E4 — Analyze and endorse before implementing; challenge the request when warranted. `Strongly inferred → Explicit`
The owner wants proposals reasoned about, not obeyed. "Implement exactly as asked" without
understanding is a red flag; reading the affected code in full before changing it is expected.
- **Evidence:** `#56` ("explicitly analyzed and endorsed rather than blindly implemented as
  asked"), `#57` ("verified by reading `isEngineLive()`/`handlePointerMove()` in full before
  touching anything"), and the owner's own standing instruction: *"Do not blindly follow my
  assumptions… You have permission to challenge my assumptions."*

### E5 — Reality over confidence: verify against the real thing; distrust "it should work." `Strongly inferred → Explicit`
Almost every bug in this project was found in a real org or the real browser, not in review.
The owner built a dev harness specifically to stop trusting review for interaction code, and
tracks "verified vs. only-build-tested" obsessively.
- **Evidence:** the entire `dev-harness/` (`#63`, "use it before claiming any interaction
  works"), `CURRENT_STATE.md`'s permanent "Known gaps / untested" section, the recurring
  "NOT tested against a real org" caveat on nearly every decision.
- **This preference is why the factory's G4 verification boundary exists.** It is the single
  most important input to the factory's design.

### E6 — Reuse existing architecture; don't add abstractions without a real need. `Explicit`
- **Evidence:** the owner's stated engineering principles; `#59` (Quick Compare built as an
  enhancement to the existing tooltip, not a new panel); `ARCHITECTURE.md`'s "reference
  code, don't duplicate" discipline.

### E7 — Record the *why*, in the owning doc, the same turn. `Explicit`
Decisions get written to `DECISIONS.md`/`CURRENT_STATE.md` inline, not "later." A refactor
with no recorded reason is a landmine for a future session.
- **Evidence:** `CLAUDE.md` rule #9, `WORKFLOW.md`, project memory (`update-docs-inline`).

---

## Communication & process preferences

### C1 — Discuss in Spanish, ship in English. `Explicit`
Product conversation happens in Spanish; all code, comments, docs, and UI strings are
English, always (`ARCHITECTURE.md` standing rule). Direct quotes in `DECISIONS.md` preserve
the owner's Spanish wording — a signal of how a call was actually made.

### C2 — Depth over breadth; closed Epics and reduced debt over raw feature count. `Explicit`
- **Evidence:** `PRODUCT.md` Success-Metric framing; `#56` (scope narrowed deliberately to
  raise reliability).

### C3 — The owner is a high-leverage director, not a coder. `Explicit` (this brief)
Wants to own vision, product/UX calls, prioritization, and real-world acceptance testing —
and to delegate execution. Escalations should be crisp and decision-shaped (see the
`DECISION REQUIRED` format), answerable quickly.

### C4 — The local project is the source of truth; orchestration must stay simpler than the product. `Explicit` (2026-07-21 reset instruction)
Implementation, testing, and delivery happen in the owner's active local checkout; GitHub
is version control/backup/collaboration *around* it. Progress is measured ONLY by what
the real local product can do — "never confuse activity with progress"; a pile of
commits/PRs/reports with an unchanged local product is a failure, not throughput. Also
explicitly anti-sunk-cost: retire work that no longer fits the product rather than
force-complete it because effort was already spent.
- **Evidence:** the 2026-07-21 state-reset instruction (verbatim and extensive),
  `DECISIONS.md #64`, factory V1.2 (`METHODOLOGY.md §0`).

---

## Weakly inferred (hold loosely — ask, don't assume)

- **W1 — Working names are fine; defer renames.** "SalesLens" is carried as a working name
  rather than forced through the manifest. *(Evidence: `PRODUCT.md` — one data point.)*
- **W2 — Prefers small reusable mechanisms when a second use is plausible.** `#57` — the
  owner "explicitly asked to consider a small reusable mechanism rather than one-off logic."
  Could be an instance of E1 rather than its own preference.

---

## How this model is maintained (the learning loop)

The model improves from feedback, but **carefully** — a single correction is often
contextual, not a rule.

```
Agent proposes → human accepts / modifies / rejects → orchestrator notes the signal
   → is there a REPEATED pattern (≥3 independent instances)?  → yes → propose promotion
   → human approves the promotion → preference recorded/strengthened here
```

**Promotion rules:**
- A new observation starts as **Weakly inferred** (or a note in the run-log, not even here).
- It graduates to **Strongly inferred** only with ≥3 independent supporting decisions.
- It becomes **Explicit** only when the owner states it directly.
- **The factory never auto-promotes.** Changes to this file are proposed to the human and
  applied on approval — same guardrail as changes to the methodology itself (`EVOLUTION.md`),
  so the model can't silently drift away from what the owner actually thinks.
- A preference contradicted by a new explicit decision is **downgraded or removed**, with
  the contradicting evidence noted — the model reflects current thinking, not history.
