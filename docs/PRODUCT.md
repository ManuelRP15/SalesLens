# Product

> Part of the STI doc set — start at [../CLAUDE.md](../CLAUDE.md) if you landed here
> directly. **Read this before any user-facing feature work or roadmap prioritization
> call.** Not needed for bug fixes or pure refactors. This is the WHY; `ARCHITECTURE.md`
> is the HOW; `ROADMAP.md` is the WHAT'S NEXT.

## Product vision: SalesLens (working name)

This is the long-term product vision for the extension, captured here so every future
session starts from the same north star instead of re-deriving it. "SalesLens" is a
**working name** — it hasn't replaced the extension's actual name/manifest yet; treat
it as the vision's codename until a rename is explicitly requested.

### Goal
Build the definitive tool for inspecting Salesforce translations and metadata directly
from the UI, without switching language, navigating through Setup, or losing the
context of the current page.

### Guiding principle: modular architecture
Don't implement every capability below at once. Each capability (Hover Inspector,
Translation Inspector, Translation Mode, Translation Health, etc.) should be its own
independent module that can be enabled, extended, or skipped in a given phase without
entangling the others. This keeps the project maintainable and lets the roadmap react
to real user feedback instead of a fixed master plan.

### MVP capabilities (must-have)

1. **Hover Inspector** — hovering over any Salesforce text shows a tooltip with everything
   available about it: element type (Custom Label, Field, Object, Picklist, etc.), API
   Name, translation origin (Custom Label, Translation Workbench, Rename Tabs & Labels...,
   when it can be determined), namespace (if applicable), and a button to copy the API
   Name.
   *Status: type, API Name and translations shipped since PHASE 4. Copy-API-Name button
   added in PHASE 4 (see ROADMAP.md). Namespace display and precise "translation origin"
   labeling (beyond the type badge itself) are still open — tracked under PHASE 8/12.*

2. **Translation Inspector** — instantly see an element's translations without switching
   the user's own language: choose which languages to show, compare several languages
   at once, highlight missing translations, highlight differences between languages,
   always keeping the current screen's context.
   *Status: language selection (popup) and multi-language display shipped since PHASE 4.
   "Show all languages" override and missing-translation highlighting added in PHASE 4
   (see ROADMAP.md PHASE 4 additions). Highlighting differences between languages is still open.*

3. **Translation Mode** — an optional mode that transforms the whole UI: instead of
   relying on hover, it shows each label's selected translations right underneath it
   (e.g. "Applicant" followed by "🇪🇸 Solicitante", "🇫🇷 Demandeur"). Ideal for QA,
   functional testing, and translation review. Must be easy to toggle on/off.
   *Status: not started — a distinct future module (see PHASE 9).*

4. **Translation Health** — automatically analyze translation quality: untranslated
   languages, empty translations, translations identical to the source language
   (configurable), possible inconsistencies. Show discreet visual warnings.
   *Status: missing-translation highlighting (tooltip since PHASE 4, distinct
   "missing" chips in Translation Mode + org-wide health table since PHASE 9/10) and
   identical-to-source-language detection (configurable via
   `Settings.flagIdenticalTranslations`) both shipped 2026-07-21 (DECISIONS.md #58).
   Other consistency checks (duplicated values, broken/truncated text) still open,
   see ROADMAP.md PHASE 10's QA Report v2.*

5. **Language configuration** — each user can choose their primary languages, their
   order, colors, icons, and compact vs. expanded mode; the extension remembers these
   preferences.
   *Status: active-language selection persisted via `chrome.storage.local` since PHASE 4.
   Order/colors/icons/compact-expanded mode are still open (see PHASE 11).*

### Premium capabilities (V2, later)

6. **Inline Translation Editing** — if technically possible, edit translations directly
   from the tooltip without opening Setup, saving immediately. *(= ROADMAP.md PHASE 6.)*
7. **Metadata Navigation** — open the corresponding field/object/Custom Label/metadata
   in Setup when possible. Secondary — should not become the product's focus.
   *(= ROADMAP.md PHASE 5.)*
8. **Advanced Metadata Inspector** — broaden support to Custom Objects, Standard Objects,
   Custom Fields, Standard Fields, Picklists, Record Types, Tabs, Buttons, LWC (if
   possible), Aura (if possible). *(extends ROADMAP.md PHASE 8.)*
9. **Smart Search** — search any Label, Field, Object, or API Name from within the
   extension itself.
10. **Productivity Actions** — quick actions: copy API Name, copy Label, copy translation,
    open metadata, export information. *(Copy API Name shipped in PHASE 4; the rest —
    copy Label/translation, export — still open, see PHASE 14.)*

### Product philosophy
The extension should **not** center on "open Setup faster." It should center on
**"understand any Salesforce element without leaving the current screen."** The
priority is reducing context switches and saving time during development, testing,
and QA.

### Design principles
Very clean. Modern tooltip. Dark and light themes. Very fast. Never interferes with
Salesforce's own UI/behavior. Appears instantly. Never reloads the page.

### Product quality bars (non-negotiable, 2026-07-19 product review)
Past a certain point, small product decisions matter more than new features. These
three bars are what separate "a nice hover tooltip" from something a senior Salesforce
architect would actively recommend to a colleague:

1. **Speed.** Hover-to-tooltip must feel instant (target 50–150ms), no loading spinners,
   metadata must be cached (never re-fetched on every hover), no redundant API calls.
   It has to feel native to the page, not bolted on. This is already the direction the
   reverse-index/background-cache architecture takes; treat any future feature that adds
   per-hover network calls as a regression against this bar.
2. **Zero false positives.** This matters more than coverage. If the tooltip says
   "Custom Label" and it turns out to be a field, trust is gone — and it doesn't come
   back after one bad guess. **"Unknown origin" is always the correct fallback over a
   wrong guess.** Any future heuristic-based detection (PHASE 8's DOM-attribute/URL
   heuristics, for instance) must bias toward under-claiming, not over-claiming.
   **Sharpened into an explicit product rule (2026-07-19, lesson #28): the tooltip
   never shows a "N possible origins" list.** Every resolution collapses to exactly
   one answer, or to "Unknown origin" — a ranked-but-unresolved shortlist reads as
   "we don't know" just as much as a wrong guess does, and has no place here either.
   See `resolveText` in `index-builder.ts`.
3. **Never leave a permanent trace in the org, and leave none on the page when
   disabled.** The extension must not create/modify any Salesforce configuration.
   Hover mode already satisfies this by construction (closed Shadow DOM, nothing
   persisted to the page). Translation Mode's inline badge injection (PHASE 9, lesson
   #19) is a deliberate, narrower exception — it does touch Salesforce's real DOM — but
   it stays inside this bar because it's fully reversible: `removeAllBadges()` strips
   every injected node the moment the mode is toggled off (see
   `src/content/translation-mode.tsx`). Any future DOM-injecting feature must keep that
   same guarantee: toggle off → zero residue.

### Core metadata scope — Simple mode (settled 2026-07-21, DECISIONS.md #56)
The product's actual day-to-day value lives in **objects, fields (standard and custom),
picklist values, and Custom Labels** — that's where a translator or developer is
actually looking when they're chasing a translation gap. Buttons, quick actions, tabs,
apps, record types, and layout sections are real and stay fully built, but they carry
disproportionate edge-case risk for how rarely they're the actual thing someone's
hunting for (global-vs-object-specific quick actions, standard-vs-custom picklist
write mechanisms, platform-controlled strings with no admin value to show at all).
**"Simple mode" (default ON) is the product's default surface** — hover, Translation
Mode, and Translation Health only show the core four types unless the user explicitly
opts into "Advanced" (a single toggle, not a matrix of per-type switches — matching the
"never dump options just because available" restraint below). This is a scope decision
about what's DEFAULT, not what's BUILT: nothing already shipped gets removed, it's
just not the first thing a new user sees. Depth over breadth, explicitly — see the
Success Metric framing in the top-level session instructions this project now runs
under: closed Epics and reduced technical debt over raw feature count.

### Positioning
The extension should **not** be pitched as "open Setup faster." The sharper framing,
validated in the 2026-07-19 product review:

> "The best tool to understand and review Salesforce's presentation and localization
> layer."

Elevator pitch: *"Stop switching languages, opening Setup, and searching metadata.
Understand every Salesforce page in seconds."* And if forced to pick the one reason a
developer would tell a colleague to install it: *"It saves us a ton of time when we
review translations and figure out where a piece of text actually comes from."*

### Target audience
Primary: Salesforce Developers, Technical Consultants, Solution Architects.
Secondary: Salesforce Admins, Functional Consultants, QA/Testers, Translation Teams.

### Value proposition
Instead of forcing the user to switch language, open Setup, search metadata, and lose
context, the extension surfaces all the relevant information right where the user is
already working — a productivity tool meant to stay installed permanently, cutting
down the time spent locating metadata and reviewing translations on international
Salesforce projects. The goal is explicitly **not** "show translations" as an end in
itself — it's resolving real translation incidents and understanding any Salesforce
element without leaving the page. Corollary: the tooltip must never dump information
just because it's available — only what's useful and actionable belongs in it (see
"Zero false positives" above — the same restraint applies to noise, not just to wrong
answers).

### Long-term aspiration: a "developer mode" for any Lightning page
If metadata-type detection (PHASE 8) becomes reliable enough, the extension could grow
into something broader than a translation tool: a single toggle that turns any Lightning
Record Page into an enriched view carrying all the relevant technical information
(field type, length, required-ness, formula, help text, API name, translation origin —
see "Metadata Lens" in PHASE 8). This is a real north star, but explicitly **not** to be
chased before the translation/metadata-resolution core is excellent — get PHASE 4/7/8's
detection accuracy right first, expand scope only after.

---

