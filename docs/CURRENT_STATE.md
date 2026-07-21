# Current state

*Read this first, every session, before anything else — it's short on purpose.*
*Update it last, every session, before ending — see `WORKFLOW.md` for the exact steps.*

**Last updated:** 2026-07-21

## Active work

`feature/translation-audit` (off `main`) — Translation Audit v1 (`#60`), real-org bug
round (`#61`), production polish (`#62`), and now a **regression round + interaction
model (`#63`)**. Pending push/PR update (PR #7, still open). No other Epic open.

**Settled this session, no longer open questions:**
- **A CLOSED shadow root's `host.shadowRoot` is always `null`** — `ensureShadowRoot()`
  cached on exactly that, so it built a SECOND `#sti-root` host, and the
  `e.target === shadowHost` click-ownership check (`#54`) then failed for whichever
  surface's host wasn't created last. That is the real, long-standing cause of
  "clicking inside the modal closes it" — dormant until `#60` added a second mount.
  Identity-based ownership is only sound while there is exactly ONE identity.
- **Interaction ownership now lives in one place** (`content/interaction.ts`, pure +
  unit-tested), with the priority hierarchy documented in `ARCHITECTURE.md`. Listeners
  delegate; they no longer each re-derive priority.
- **Two-stage dismissal is correct and is restored** (`#55`, which `#62` wrongly
  collapsed into one gesture): an outside click is unambiguous about the EDIT ending,
  not about the user being done reading.
- **`render(null)` + `render(el)` is NOT a remount** in React 18 (both calls batch into
  one update) — the inspector's cancel path had been silently dead. Both surfaces now
  cancel through the same `cancelTrigger` mechanism; a changing `key` expresses a
  genuine remount.
- **Scroll behaviour decided:** the modal follows its subject (freezing while editing or
  while the pointer is over it, hiding when the subject leaves the viewport); the
  selection highlight tracks only while its element is on screen. One shared
  `isElementInViewport` predicate. A hover tooltip deliberately does not follow — it has
  no persistent subject.
- **Type filters are `typeLabel()` chips**, so Field and Custom Field are separate
  categories matching the row badges exactly; selecting both is the union.
- **Navigation shortcut CONFIGURATION deliberately not built** — see `ROADMAP.md`
  PHASE 17 for the trigger that should start it.

## Git workflow (established 2026-07-20)

`main` is kept stable; work happens on `feature/`/`bug/`/`refactor/` branches per
Epic/fix/refactor, merged back once real-org-verified. Conventions in `WORKFLOW.md`;
PR template at `.github/PULL_REQUEST_TEMPLATE.md`. Repo:
https://github.com/ManuelRP15/SalesLens.

**Branch/PR history:** `bug/editing-and-hover-polish` had TWO PRs on one branch (#4,
#5). `feature/quick-compare` was PR #6, merged. `feature/translation-audit` is PR #7,
still OPEN — `#61`, `#62` and `#63` all land as further commits on it.

## What just happened (most recent session — `DECISIONS.md #63`)

1. **Duplicate shadow host fixed** (the reported regression's root cause) —
   `ensureShadowRoot` keeps its own `ShadowRoot` reference.
2. **`content/interaction.ts`** — one priority model, pure functions, unit-tested;
   `index.tsx` builds a snapshot and dispatches.
3. **Outside-click/Escape restored to two stages**; Escape ladders one level per press.
4. **Inspector cancel path fixed** (`cancelTrigger` for both surfaces, explicit mount
   `key` where a remount is genuinely wanted).
5. **Modal anchored to its element while scrolling**; **highlight viewport-bounded**.
6. **Metadata-type chips**, ANDed with search + status tabs.
7. **Keyboard navigation** (arrows/Enter) with context-aware priority.
8. **Selected row lifts off the list** instead of being a shade.
9. **`dev-harness/` added** — first real-browser verification this project has ever had.

## New: the dev harness (`npm run harness`)

Runs the REAL content script against a Lightning-shaped page with `chrome.*` stubbed.
It found three bugs invisible to review in one session. **Use it before claiming any
interaction works.** See `ARCHITECTURE.md` for its limits — the tab is backgrounded, so
no scroll events, no `requestAnimationFrame`, no smooth scrolling; and resolution is
stubbed, so it proves INTERACTION only, never metadata correctness.

## Known gaps / untested — check before assuming something works

- **Still nothing verified against a real Salesforce org.** `#63`'s interaction work IS
  now verified in a real browser (see below), but metadata resolution, saves, and
  Lightning's actual DOM are not.
- **Verified in the harness this session** (so treat as working, re-confirm in a real
  org): inside clicks on both surfaces including across the other mount; two-stage
  outside click; Escape ladder; guided navigation opening the inspector; scroll-anchored
  following + highlight hide/restore; search × type × status filtering; every
  keyboard-ownership rule including the ones that must stay silent.
- **NOT verifiable in the harness, still unproven:** smooth-scroll animation (the
  decision behind it is unit-tested via `listScrollDelta`); the internal list's actual
  scrolling; sticky-header scroll correction against REAL Lightning chrome; anything
  requiring genuine focus events (the harness tab never has focus).
- **Sticky/pinned-header navigation is bounded, not proven** — two verify-and-correct
  passes; `ROADMAP.md` PHASE 18 states what a real fix would need.
- **PHASE 6b's deploy() pipeline is a real write to org metadata** — re-test patching an
  EXISTING custom field/picklist translation and filling a MISSING one.
- **Duplicated-translation detection designed but NOT implemented** — `ROADMAP.md` 18.
- **The `en_US`-base assumption backs four things** (`#41`, `#58`, `#59`, `#60`) via one
  `BASE_LANGUAGE` constant; still unverified against a non-English-base org.
- **QuickAction editing works only for object-specific custom actions** (`#54`);
  global/standard show "not supported yet". Deferred (PHASE 6c).
- Setup-navigation URLs (`#47`/`#51`) still need real-org confirmation.

## Immediate next step

Push `#63`'s commits to `feature/translation-audit` (PR #7) and get a real-org
click-through — the harness has taken the interaction model as far as it can go without
a live org. Once merged: **PHASE 16** (Workspace, **Muy Alta**, large — own session),
the Duplicated filter (small, well-specified, wants a real-org look at actual duplicate
clusters), PHASE 6c, PHASE 11's cosmetic remainder. Navigation shortcut configuration
waits for a reported collision (`ROADMAP.md` PHASE 17).
