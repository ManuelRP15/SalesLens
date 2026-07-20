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

## Non-negotiable rules

Full rationale for each is in `docs/ARCHITECTURE.md`. Violating any of these breaks the
product, not just a feature:

1. Tooling/Metadata API fetches ALWAYS run in the **background** service worker, never
   the content script (CORS blocks it there).
2. The `sid` cookie is ALWAYS read in the background via `chrome.cookies.get()`.
3. The tooltip mounts in a **closed** Shadow DOM.
4. `resolveText` NEVER returns more than one candidate — one answer, or silence
   ("Unknown origin"), never a ranked shortlist. See `DECISIONS.md #28`.
5. Every Metadata API / SOAP call degrades gracefully (never throws to its caller) — one
   missing permission or unavailable feature can't break unrelated metadata types.
6. Zero false positives beats coverage. A wrong guess is worse than no answer.
7. Editing is scoped to Custom Labels only (see `DECISIONS.md #41`) — don't add an edit
   affordance for any other `LabelType` without first building the Metadata API
   `deploy()` pipeline that doesn't exist yet.
8. Update `docs/DECISIONS.md` and `docs/CURRENT_STATE.md` **in the same turn** a
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
