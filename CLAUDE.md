# Salesforce Translation Inspector

Chrome/Edge MV3 extension. Hovering over Salesforce Lightning UI text shows what
metadata it is (Custom Label, field, object, picklist value, button...) and its
translations in every configured language, editable in place. TypeScript + React 18 +
Vite 5 + `@crxjs/vite-plugin`, no external UI framework.

This file is auto-loaded every session — keep it short. Everything else in `docs/` is
loaded **on demand**, by task type, per the table below. Don't read a doc "just in
case"; grep it, or skip it if the table doesn't call for it.

## 1. Always read first: `docs/CURRENT_STATE.md`

Tiny (~30 lines). Says what's active right now, what just happened, what's known-broken
or untested. Costs almost nothing and prevents redoing or contradicting recent work.

## 2. Then route by task type

| Task | Read in full | Grep only |
|---|---|---|
| **New feature / Epic** | `docs/ARCHITECTURE.md`, the relevant phase in `docs/ROADMAP.md` | `docs/DECISIONS.md` for your feature's domain keywords |
| **Bug fix** | — | `docs/DECISIONS.md` **first** (the bug is very likely already explained there), then the implicated `src/` file(s) |
| **Refactor / architecture change** | `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` (its index, then the entries that matter) | — |
| **"What should I build next?"** | `docs/ROADMAP.md` | — |
| **UX / product / positioning question** | `docs/PRODUCT.md` | — |
| **Anything unclear about process** | `docs/WORKFLOW.md` | — |

Full step-by-step for each session type (what to read, what to ask the user, what to
update afterward) is in **`docs/WORKFLOW.md`** — read it once if you're unsure how an
Epic/bug-fix/refactor session is supposed to start and end.

## Optional: run work through the AI Software Factory

`.factory/` is a reusable, quality-first orchestration layer that *drives* this doc set
(it doesn't replace it). The owner can invoke `/factory <goal>` to route a task through
risk-based tiers, explicit quality gates, machine verification, and an honest real-org
handoff. Its tiers map onto this project's session shapes (T1≈bug, T2≈Epic, T3≈refactor).
Start at `.factory/MANIFESTO.md`; the project binding is `.factory/project/adapter.md`.
Working directly per `docs/WORKFLOW.md` (no `/factory`) remains completely valid.

## Non-negotiable rules

Full rationale for each is in `docs/ARCHITECTURE.md`. Violating any of these breaks the
product, not just a feature:

1. Tooling/Metadata API fetches ALWAYS run in the **background** service worker, never
   the content script (CORS blocks it there).
2. The `sid` cookie is ALWAYS read in the background via `chrome.cookies.get()`.
3. The tooltip mounts in a **closed** Shadow DOM.
4. `resolveText` NEVER returns more than one candidate — one answer, or silence
   ("Unknown origin"), never a ranked shortlist. See `DECISIONS.md #28`.
5. Every Metadata API / SOAP call on the **read** path degrades gracefully (never
   throws to its caller) — one missing permission or unavailable feature can't break
   unrelated metadata types. **Write paths are the deliberate exception** (Custom Label
   saves, and PHASE 6b's `deploy()`-based saves for the other 8 editable types) — a
   save the user explicitly asked for THROWS on failure so the error reaches them,
   instead of silently vanishing; `background/index.ts`'s `saveTranslation()` is the
   one place that catches it and turns it into a user-facing message.
6. Zero false positives beats coverage. A wrong guess is worse than no answer.
7. Editing is scoped to `isEditableEntry()`'s set (`types.ts`) — type-level via
   `isEditableLabelType()` (9 of 13 `LabelType`s, `DECISIONS.md #41`, `#53`) AND, for
   `FieldLabel`/`PicklistValue` specifically, FIELD-level (custom `__c` only —
   standard fields/picklists need a different, unbuilt write mechanism, real Salesforce
   rejections confirmed this, `DECISIONS.md #56`). Always check entries with
   `isEditableEntry(entry)`, never just `isEditableLabelType(entry.type)` — the type
   alone isn't enough for those two types. `ObjectLabel`/`RelatedList` are deferred
   (their target, `<caseValues>`, needs safe multi-grammatical-case handling first);
   `StandardButton`/`StandardTab` are **permanently** non-editable — they're
   Salesforce's own platform-controlled translations, not admin-authored content, so
   there's nothing to write back to. Don't add an edit affordance for any type/case
   outside this set without a real write path backing it.
8. **Simple mode (`Settings.simpleMode`, default true) is the product's default
   surface** — only Object/Field/Picklist/Custom-Label translations show via hover,
   Translation Mode, and Translation Health unless the user opts into Advanced. Every
   other type (buttons, quick actions, tabs, apps, record types, layout sections)
   stays fully built and correct — filtered at ONE choke point
   (`background/index.ts`'s `applySimpleScope`/`isInSimpleScope`), never by skipping
   the underlying fetch/resolve logic. See `PRODUCT.md`/`DECISIONS.md #56`.
9. Update `docs/DECISIONS.md` and `docs/CURRENT_STATE.md` **in the same turn** a
   decision is made or a session ends — not "later," not "if there's time."

## Never do this

- Never paste source code into a doc. Reference `path/file.ts:123`; code is its own
  source of truth.
- Never read `docs/DECISIONS.md` or `docs/ROADMAP.md` end-to-end by default — both are
  designed to be grepped. `DECISIONS.md`'s index (top of the file) is the one part of
  it worth a full scan.
- Never duplicate a fact across two docs. Each doc owns a distinct kind of fact — see
  the ownership table in `docs/WORKFLOW.md` if you're about to write something down and
  aren't sure where it belongs.
- Never show the user a ranked list of "possible origins" for a hover result — one
  answer or nothing (rule #4 above; this one's worth repeating, it's been broken and
  re-fixed once already, see `DECISIONS.md #28`).
