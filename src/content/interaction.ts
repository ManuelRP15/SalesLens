/**
 * THE interaction priority model (DECISIONS.md #63).
 *
 * The content script now hosts several interaction systems that all want the same
 * events: the hover engine, the Translate All inspector, the inline translation
 * editor, the audit panel's search box and list, and the Salesforce page underneath.
 * Every regression this feature has had came from one of them deciding, locally, that
 * an event was "theirs" — the tooltip closing on a click it should have owned, an edit
 * being cancelled by a keystroke meant for a textarea, a stale modal outliving the
 * state that produced it.
 *
 * So ownership is decided HERE, once, by pure functions over a snapshot of the world,
 * rather than by a chain of `if` statements at each listener. `content/index.tsx`
 * builds the snapshot, asks, and dispatches. Two consequences that matter:
 *   - The rules are unit-testable without a DOM (see `interaction.test.ts`), which is
 *     what makes "we broke Dynamic Hover again" a test failure instead of a bug report.
 *   - Adding a surface means adding a case here, where the whole hierarchy is visible,
 *     instead of another local condition somewhere that happens to look right.
 *
 * ## The hierarchy (highest priority first)
 *
 * 1. **An active text editor.** While a translation is being edited, native input
 *    behaviour wins outright: arrows move the caret, Enter/Escape belong to the
 *    editor, and no navigation shortcut may fire. The one thing an outside gesture may
 *    do is CANCEL the edit — never destroy the surface around it in the same gesture.
 * 2. **The modal surface itself.** Anything inside our own UI is an interaction, not a
 *    dismissal; the surface stays. This is enforced structurally (closed shadow root →
 *    every inside click retargets to the host) rather than by geometry.
 * 3. **The explicit Translate All selection.** A selected entry is a persistent
 *    context the user chose. It survives scrolling, page mutation and rescans; only an
 *    explicit state transition retires it.
 * 4. **Audit panel keyboard navigation.** Live only when nothing above owns the event
 *    AND the user isn't typing anywhere.
 * 5. **The hover engine.** Contextual inspection when nothing stronger is active; it
 *    is already suppressed wholesale while Translation Mode is on.
 * 6. **The Salesforce page.** Everything not claimed above reaches it untouched.
 */

/** Which surface the tooltip currently represents — the two summon paths need different cancel mechanics, and nothing else. */
export type TooltipSurface = "none" | "hover" | "inspector";

/**
 * Everything the rules below are allowed to consider. Deliberately a flat snapshot of
 * booleans rather than a reference to live module state: a rule that can only see what
 * it was handed can't accidentally depend on something it never declared.
 */
export interface InteractionSnapshot {
  /** A translation editor is open and owns the keyboard (priority 1). */
  editing: boolean;
  /** What the tooltip currently is, if anything. */
  surface: TooltipSurface;
  /** Translate All is on and its panel is expanded (keyboard navigation is only meaningful then). */
  panelExpanded: boolean;
  /** The panel's filtered list currently has at least one entry to navigate. */
  panelHasEntries: boolean;
  /** Focus is in a real page input/textarea/contenteditable — never steal keys from Salesforce's own fields. */
  typingInPage: boolean;
  /** Focus is in the panel's OWN search box: typing must reach it, but navigation keys should still drive the list (see `resolveKey`). */
  typingInPanelSearch: boolean;
  /** The panel's search box currently has text in it. */
  searchActive: boolean;
}

/** What an outside click (or Escape) should do, given the snapshot. */
export type DismissAction = "none" | "cancel-edit" | "close-tooltip" | "clear-search" | "collapse-panel";

/**
 * A click on genuinely different page content — i.e. NOT inside our own UI; the caller
 * establishes that structurally via shadow-host identity, never by coordinates.
 *
 * Two-stage by design (restores DECISIONS.md #55, which `#62` broke): while an edit is
 * open, the FIRST outside click cancels only the edit and leaves the tooltip standing;
 * a second one closes it. `#62` collapsed this into a single "close everything"
 * gesture on the theory that an outside click is unambiguous — which was wrong on the
 * evidence: it is unambiguous about the EDIT ending, not about the user being finished
 * with the metadata they were reading. The common real motion is "click away to stop
 * editing, keep reading the values" — and it silently destroyed the surface instead.
 * That regression is exactly why these rules now live in one tested place.
 */
export function resolveOutsideClick(s: InteractionSnapshot): DismissAction {
  if (s.editing) return "cancel-edit";
  if (s.surface !== "none") return "close-tooltip";
  return "none";
}

/**
 * Escape unwinds ONE level per press, in the order the user built the state up. Same
 * first step as an outside click (the edit is always the innermost thing), then the
 * tooltip, then the panel's search, then the panel itself.
 */
export function resolveEscape(s: InteractionSnapshot): DismissAction {
  if (s.editing) return "cancel-edit";
  if (s.surface !== "none") return "close-tooltip";
  if (s.panelExpanded && s.searchActive) return "clear-search";
  if (s.panelExpanded) return "collapse-panel";
  return "none";
}

/** Audit-panel navigation actions, resolved from a raw key. */
export type NavAction = "none" | "next" | "prev" | "activate";

/**
 * Keyboard navigation for the audit panel (`#63`). The rules that matter are the ones
 * that DON'T fire:
 *
 * - **While editing → never.** Arrows move the caret, Enter commits, Escape cancels;
 *   all of that is the editor's, and this returns "none" so those keys are never even
 *   inspected here (priority 1).
 * - **While focus is in a real page field → never.** Entering Translation Mode doesn't
 *   move focus, so a Salesforce search box can easily still have it; hijacking arrows
 *   there would break the page.
 * - **While focus is in the panel's OWN search box → arrows still navigate, but
 *   nothing else does.** This is the one deliberate exception, and it's the whole
 *   point of the search box: type to narrow, then arrow straight down into the
 *   results without reaching for the mouse. Up/Down are safe to claim there because a
 *   single-line input has no vertical caret movement to lose; Left/Right are NOT
 *   claimed, because they DO move the caret in a text field the user is editing.
 *
 * Up/Down and Left/Right are intentionally synonyms rather than two different axes:
 * the list is one-dimensional, so "previous/next" is the only real motion, and a
 * second axis would just be two ways to do the same thing with different names.
 */
export function resolveNavKey(key: string, s: InteractionSnapshot): NavAction {
  if (s.editing || s.typingInPage) return "none";
  if (!s.panelExpanded || !s.panelHasEntries) return "none";

  const inSearch = s.typingInPanelSearch;
  switch (key) {
    case "ArrowDown":
      return "next";
    case "ArrowUp":
      return "prev";
    case "ArrowRight":
      return inSearch ? "none" : "next";
    case "ArrowLeft":
      return inSearch ? "none" : "prev";
    case "Enter":
      return "activate";
    default:
      return "none";
  }
}
