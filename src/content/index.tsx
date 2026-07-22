import { createRoot, type Root } from "react-dom/client";
import { deepElementFromPoint, resolveHoverTarget, guessObjectApiNameFromUrl, parentAcrossShadow, isElementInViewport } from "./dom-utils";
import { Tooltip } from "./Tooltip";
import tooltipCss from "./tooltip.css?inline";
import { startTranslationMode, stopTranslationMode, setBadgeScope, type AuditEntry, type BadgeScope, type TmStyle } from "./translation-mode";
import { AuditPanel, filterAuditEntries, type AuditFilter } from "./AuditPanel";
import auditPanelCss from "./audit-panel.css?inline";
import { normalizeBareKey } from "../shared/hotkeys";
import { resolveEscape, resolveNavKey, resolveOutsideClick, type InteractionSnapshot, type NavAction } from "./interaction";
import { allElementKeys, normalizeStoredWorkspace, pinnedKeys } from "../shared/workspace";
import type {
  LabelEntry,
  ResolveTextResponse,
  SaveTranslationRequest,
  SaveTranslationResponse,
  Settings,
  ToggleWorkspacePinRequest,
  ToggleWorkspacePinResponse,
} from "../shared/types";

function tmStyleFromSettings(s: Settings | undefined): TmStyle {
  return {
    preset: s?.tmPreset ?? "stacked",
    showFlags: s?.tmShowFlags ?? true,
    showLangCodes: s?.tmShowLangCodes ?? true,
    flagIdentical: s?.flagIdenticalTranslations ?? true,
  };
}

// ── Hover engine tuning ──────────────────────────────────────────────────────
// Debounce/fade-out (HOVER_DEBOUNCE_MS/CLEAR_GRACE_MS) apply ONLY to true Always Hover
// (no toggle key configured at all) — toggle mode's sticky pin and an active hold-peek
// both resolve with ZERO delay (each is an explicit "inspect now" signal) and never
// auto-clear on "nothing under the cursor" — see inspectAt()/handlePointerMove() and
// DECISIONS.md #56.
const HOVER_DEBOUNCE_MS = 120;
const CLEAR_GRACE_MS = 300;
const SCROLL_REINSPECT_MS = 80;
// Guided navigation (ROADMAP.md PHASE 18): scrollIntoView's "smooth" behavior has no
// completion callback, so the inspector opens after the verify-and-correct chain below
// has settled rather than on a true "scroll finished" signal — same pragmatic-timing
// comfort as the constants above, not a new kind of guess.
// How long to wait after triggering scrollIntoView before checking whether the
// target actually ended up properly visible (DECISIONS.md #61's sticky-header fix)
// — long enough for a "smooth" scroll to have settled in the common case.
const SCROLL_SETTLE_CHECK_MS = 350;
// A second, shorter wait after an actual corrective scroll, before it's safe to
// anchor the editor to the target's (now-final) rect.
const SCROLL_CORRECTION_SETTLE_MS = 220;
// Minimum clearance kept between the target and the viewport's top/bottom edges —
// not a large buffer, just enough that the target isn't touching pinned chrome or
// the viewport edge itself.
const SCROLL_VIEWPORT_MARGIN_PX = 12;
// Small jitter-smoothing margin around the tooltip's own edges — NOT a large "stay
// away" buffer (that was tried first and caused its own complaint: content the
// tooltip merely rendered near, not literally over, became unreachable without a
// hard reset). See isWithinTooltipZone() and handlePointerMove().
const TOOLTIP_OWNERSHIP_MARGIN_PX = 6;

let hoverTimer: number | undefined;
let clearTimer: number | undefined;
let scrollTimer: number | undefined;
let root: Root | undefined;
/** The audit panel's own independent React root — see `ensureShadowRoot`'s doc comment for why it shares a shadow root with `root` (the tooltip's) rather than getting a second one. */
let auditRoot: Root | undefined;
let shadowHost: HTMLDivElement | undefined;
/** The one closed ShadowRoot, kept explicitly because a CLOSED root is never readable back off its host (`host.shadowRoot` is null by design) — see `ensureShadowRoot`. */
let shadowRoot: ShadowRoot | undefined;
let isEnabled = false;
let activeLanguages: string[] = [];
let translationModeEnabled = false;
let tmStyle: TmStyle = tmStyleFromSettings(undefined);
let inspectorHotkey: string | null = "Alt";
let holdHotkey: string | null = "Shift";
let tmHotkey: string | null = "Alt+T";
/** True while Inspection Mode is toggled on (press the key once — see enterInspectionMode). Sticky, not continuous: DECISIONS.md #56 — once something is pinned, mouse movement alone no longer retargets it. */
let inspectionModeActive = false;
/** True while `holdHotkey` is physically held down — the "Minecraft shift" companion to the sticky toggle above: grants LIVE, zero-debounce retargeting while held, independent of `inspectionModeActive`, and freezes/pins on whatever's under the cursor the instant it's released. See DECISIONS.md #56. */
let holdKeyActive = false;
/** Last known cursor position — lets the engine resolve immediately on keydown/scroll, without waiting for the next mousemove. */
let lastMouseX = 0;
let lastMouseY = 0;
/** Text currently shown in the tooltip; same-text re-inspections are no-ops so the tooltip stays rock-stable instead of re-rendering/jumping. */
let currentTooltipText: string | null = null;
/**
 * The raw DOM element the pointer-move engine last actually did work for. This is the
 * cheap gate that replaced mouseover/mouseout entirely (see handlePointerMove): most
 * mousemove events land on the SAME element as the previous one (sitting still,
 * moving within one element's bounds), and comparing this needs no text extraction,
 * no attribute walks, nothing — just an identity check. mouseover was dropped because
 * its native "did we enter a new element" computation goes through Lightning's nested
 * (and sometimes closed) shadow trees and isn't reliable there; deepElementFromPoint
 * recomputes straight from coordinates every time, sidestepping that class of miss
 * entirely (the "Always Hover sometimes ignores elements" complaint).
 */
let lastRawElement: Element | null = null;
/** The tooltip's own current on-screen rect (plus margin), reported by Tooltip.tsx via onRectChange — see isWithinTooltipZone(). */
let tooltipRect: DOMRect | null = null;
/**
 * True while the tooltip's inline translation editor (PHASE 6) is open. Every path
 * that can touch the tooltip (clear, replace-with-a-different-target, mode exits)
 * checks this — it's what keeps a focused, mid-edit textarea from being yanked out
 * of the DOM, or the whole tooltip swapped for a different element's, while the user
 * is mid-keystroke or mid-save.
 */
let isEditingActive = false;
/**
 * True while a Translation Mode chip's click-triggered editor (the same Tooltip
 * component the hover engine uses, just summoned by a click instead of a hover) is
 * showing. Independent of `inspectionModeActive`/the hover engine entirely — the two
 * never run at once (Translation Mode suppresses the hover engine — see
 * isEngineLive()) but this needs its own open/close bookkeeping since nothing about
 * it is hover-driven.
 */
let tmEditorOpen = false;
/**
 * Args of the currently-shown hover/inspect tooltip (not the Translation Mode click-
 * editor — that one opens its own editor immediately via autoEditLanguage and has no
 * use for this). Kept so the Enter-to-edit shortcut (PHASE 17) can re-render the SAME
 * tooltip with a bumped `editTrigger` without re-resolving anything — the shortcut
 * only ever acts on what's already being shown, never triggers a new resolution.
 */
let lastTooltipArgs: { text: string; x: number; y: number; response: ResolveTextResponse } | null = null;
/** Bumped on every Enter-to-edit press; see `editTrigger` on Tooltip.tsx for why a counter, not a boolean. */
let editTriggerCounter = 0;
/** Args of the currently-open Translation Mode click-editor — mirrors `lastTooltipArgs` for the hover path, so Escape/outside-click (see `requestCancelEdit`) can re-render it too. No `language`: the cancel re-render deliberately omits `autoEditLanguage` so the fresh mount starts in view mode instead of re-opening the very edit being cancelled. */
let lastTmEditorArgs: { entry: LabelEntry; x: number; y: number; anchorEl?: Element } | null = null;
/** Bumped on every Escape/outside-click while an edit is in progress; see `cancelTrigger` on Tooltip.tsx. */
let cancelTriggerCounter = 0;
/** Bumped only when a genuinely fresh Tooltip MOUNT is wanted (a new editor); reused as-is when an already-open one is merely being updated — see renderTmTooltip. */
let tmMountKey = 0;

// ── Translation Audit ("Translate All" evolution, ROADMAP.md PHASE 18) ──────
/** Every on-page entry Translation Mode's own scan resolved, refreshed on every rescan (including the save-triggered one below) — see `handleAuditUpdate`. */
let auditEntries: AuditEntry[] = [];
let auditFilter: AuditFilter = "all";
/**
 * Free-text search over the page's entries (DECISIONS.md #62) — a SECOND, independent
 * axis on top of the filter tabs, not an alternative to them: "Account" + "Missing"
 * means missing entries matching Account. Session-local like every other piece of
 * panel state here, and reset on every Translation Mode activation.
 */
let auditSearch = "";
/** True while the panel's own search input holds focus — the one case where keyboard navigation and a text field legitimately share the keyboard, see `resolveNavKey`. */
let auditSearchFocused = false;
/** Selected metadata-type labels (`typeLabel()` strings, e.g. "Custom Field"). Empty = no type restriction. Third independent filter axis alongside the status tabs and the search box (DECISIONS.md #63). */
let auditTypeFilters: string[] = [];
/** Index into the CURRENTLY FILTERED list, not `auditEntries` itself — AuditPanel re-clamps it against the live filtered array on every render, so a save that shrinks the list can't leave this pointing past the end. */
let auditIndex = 0;
/** Collapsed by default (a small pill) — expands into the full panel on click. Reset to a fresh state (collapsed, "All", index 0) every time Translation Mode turns on, see `applyTranslationModeSetting`. */
let auditExpanded = false;
/**
 * Translation scope (ROADMAP.md PHASE 18 §4, DECISIONS.md #61): whether the ON-PAGE
 * inline badges show every matched field ("all", the classic Translation Mode
 * behavior and the sensible default) or only the audit panel's current target
 * ("current" — a decluttered view for working through the guided stepper without
 * every other field's badge competing for attention). Deliberately session-local,
 * NOT a persisted `Settings` field — this is a live workflow control the user flips
 * while actively using Translate All, not a stable cross-session preference; resets
 * to "all" every time Translation Mode turns on, same as the other audit UI state
 * above. Only affects the on-page badges — the panel's own list/counts always show
 * the full page regardless.
 */
let auditScope: BadgeScope = "all";
/** The floating highlight overlay's own live DOM node + the element it's currently tracking, so `positionHighlight` can resync on scroll/resize and `clearHighlight` can tear both down together. Real page DOM touch — same accepted, fully-reversible exception Translation Mode's badges and the Inspection Mode magnifier cursor already use. */
let highlightEl: HTMLDivElement | undefined;
let highlightTarget: Element | null = null;
let highlightRepositionHandler: (() => void) | undefined;
let auditEditorOpenTimer: number | undefined;
let auditScrollCorrectionTimer: number | undefined;
/**
 * Bumped by every audit state transition (navigate, filter, search, scope, collapse,
 * Translation Mode off). Guided navigation is a multi-step ASYNC chain — scroll, wait,
 * verify, correct, wait, open the inspector — and `clearTimeout` alone can't express
 * "abandon the chain that's already several steps in": each step re-checks this token
 * and bails if the world moved on. Without it, a slow chain from a previous target can
 * still pop its inspector open on top of the new one seconds later, which is exactly
 * the "stale modal attached to previous state" class of bug.
 */
let auditNavToken = 0;

document.addEventListener(
  "mousemove",
  (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    handlePointerMove(e.clientX, e.clientY);
  },
  { passive: true, capture: true }
);

const INSPECTOR_CURSOR_STYLE_ID = "sti-inspector-cursor";

/** Magnifier cursor over the WHOLE page — a per-element style is beaten by Salesforce's own cursor rules, a !important stylesheet is not. */
function setInspectorCursor(on: boolean) {
  const existing = document.getElementById(INSPECTOR_CURSOR_STYLE_ID);
  if (on && !existing) {
    const style = document.createElement("style");
    style.id = INSPECTOR_CURSOR_STYLE_ID;
    style.textContent = "*, *::before, *::after { cursor: zoom-in !important; }";
    document.documentElement.appendChild(style);
  } else if (!on && existing) {
    existing.remove();
  }
}

/**
 * The magnifier only means anything while actively SEARCHING for something to pin —
 * once something IS pinned (DECISIONS.md #56's sticky toggle mode), it just clutters
 * the view of a tooltip the user is now reading, not hunting for; real-org feedback
 * asked for it to disappear at that point in favor of the normal cursor. `holdKeyActive`
 * always counts as "searching" regardless of pin state (pressing hold to move an
 * already-pinned tooltip elsewhere IS active searching, even though something is still
 * showing at that exact instant); toggle mode alone only counts while nothing is
 * pinned yet. Called at every state transition that could flip this: entering/exiting
 * toggle mode, hold key down/up, a resolve landing, and the tooltip clearing.
 */
function updateInspectorCursor() {
  setInspectorCursor(holdKeyActive || (inspectionModeActive && currentTooltipText === null));
}

/** Matches a single configured key (`inspectorHotkey`/`holdHotkey`, e.g. "Alt", "Shift", "Control", "q") against a keydown/keyup event — shared by both, since both are bare (non-combo) hotkeys. */
function matchesBareKey(configured: string | null, e: KeyboardEvent): boolean {
  const normalized = normalizeBareKey(configured);
  if (!normalized) return false;
  return e.key.toUpperCase() === normalized;
}

/** Matches combos like "Alt+T", "Ctrl+Shift+I" — modifiers must match EXACTLY. */
function matchesCombo(combo: string, e: KeyboardEvent): boolean {
  const parts = combo.split("+");
  const key = parts[parts.length - 1];
  const needAlt = parts.includes("Alt");
  const needCtrl = parts.includes("Ctrl");
  const needShift = parts.includes("Shift");
  return (
    e.altKey === needAlt &&
    e.ctrlKey === needCtrl &&
    e.shiftKey === needShift &&
    e.key.toUpperCase() === key.toUpperCase()
  );
}

/** Always Hover (no toggle key configured) resolves continuously — unaffected by the sticky redesign below, it's a fundamentally different glance-and-go use case. Otherwise the engine is only live while actively pinned (toggle mode on) or actively searching (hold key held) — either way, disabled/Translation Mode always wins. */
function isEngineLive(): boolean {
  if (!isEnabled || translationModeEnabled) return false;
  return inspectorHotkey === null || inspectionModeActive || holdKeyActive;
}

function enterInspectionMode() {
  if (inspectionModeActive) return;
  inspectionModeActive = true;
  // Force a fresh resolve at the current position rather than trusting whatever
  // lastRawElement happened to hold from before the mode was entered.
  lastRawElement = null;
  inspectAt(lastMouseX, lastMouseY);
  updateInspectorCursor();
}

/**
 * The single exit path for Inspection Mode — used by the toggle key, Escape, clicking
 * outside the tooltip, losing window focus, and settings changes alike. Fires whenever
 * EITHER toggle mode is on OR a tooltip is currently pinned (DECISIONS.md #56) — the
 * latter covers a tooltip pinned purely via a standalone `holdHotkey` peek, with toggle
 * mode never engaged at all, which otherwise had no way to be dismissed. Guarding
 * `isEditingActive` HERE (rather than at every call site) is what makes all of those
 * paths safe to fire unconditionally mid-edit: this simply no-ops, the mode and the
 * tooltip stay exactly as they are, and whichever path tried to exit "wins" the next
 * time it fires after the edit actually finishes. Without a single shared guard, each
 * caller would need to remember the same rule — and any that forgot would either kill
 * a focused textarea mid-keystroke or leave the tooltip's fate permanently decoupled
 * from the mode, both real "inconsistent state" bugs.
 */
function exitInspectionMode() {
  if (isEditingActive) return;
  if (!inspectionModeActive && currentTooltipText === null) return;
  inspectionModeActive = false;
  setInspectorCursor(false);
  clearTooltip();
}

window.addEventListener(
  "keydown",
  (e) => {
    if (tmHotkey && !e.repeat && matchesCombo(tmHotkey, e)) {
      e.preventDefault();
      chrome.storage.local.get("settings", (stored) => {
        const s = (stored.settings ?? {}) as Settings;
        chrome.storage.local.set({
          settings: { ...s, translationModeEnabled: !s.translationModeEnabled },
        });
      });
      return;
    }
    // Escape's whole ladder is resolved in ONE place now (`interaction.ts`) instead of
    // five sequential branches that each had to re-derive the priority order — see
    // DECISIONS.md #63. preventDefault/stopPropagation while editing is safe (and was
    // added deliberately in #55): the editor's own local Escape handler is no longer
    // the only thing that can cancel a stuck edit, so swallowing the event here can't
    // strand one.
    if (e.key === "Escape") {
      const action = resolveEscape(interactionSnapshot());
      if (action === "none") return;
      if (action === "cancel-edit") {
        e.preventDefault();
        e.stopPropagation();
        requestCancelEdit();
      } else if (action === "close-tooltip") {
        // Covers both surfaces: the hover engine's pinned tooltip (toggle-pinned OR
        // standalone hold-peek — exitInspectionMode's own guard, #56, handles both)
        // and the Translate All inspector.
        exitInspectionMode();
        if (tmEditorOpen) closeTmEditor();
      } else if (action === "clear-search") {
        handleAuditSearchChange("");
      } else if (action === "collapse-panel") {
        handleAuditToggleExpanded();
      }
      return;
    }
    // Audit panel keyboard navigation (`#63`) — priority 4: `resolveNavKey` returns
    // "none" whenever an editor, a real page field, or simply "nothing to navigate"
    // outranks it, so this can never eat a keystroke meant for something else.
    if (!e.repeat && translationModeEnabled) {
      const nav = resolveNavKey(e.key, interactionSnapshot());
      if (nav !== "none") {
        e.preventDefault();
        handleAuditNavKey(nav);
        return;
      }
    }
    // Enter-to-edit (PHASE 17): only while Inspection Mode is on AND a tooltip is
    // actually showing — unlike the inspector/TM toggle keys above, this one stays
    // silent rather than globally capturing Enter, since Enter is far more likely to
    // collide with real page behavior (submitting a form, activating a focused
    // button) than Alt or Escape ever are.
    if (e.key === "Enter" && !e.repeat && inspectionModeActive && !isEditingActive && lastTooltipArgs && !isTypingInPage()) {
      e.preventDefault();
      requestEditShortcut();
      return;
    }
    // Hold-to-move (DECISIONS.md #56): press-and-hold grants live retargeting
    // regardless of toggle state — see isEngineLive()/handlePointerMove. `!e.repeat`
    // matters here (unlike a simple boolean flip, OS key-repeat firing keydown
    // continuously while held must not repeatedly force a resolve). Guarded by
    // isTypingInPage() since the default holdHotkey (Shift) is a real modifier used
    // constantly while typing (text selection, Shift+Enter) — must never hijack that.
    if (isEnabled && !translationModeEnabled && !e.repeat && !isTypingInPage() && matchesBareKey(holdHotkey, e)) {
      holdKeyActive = true;
      lastRawElement = null;
      inspectAt(lastMouseX, lastMouseY);
      updateInspectorCursor();
      return;
    }
    if (isEnabled && !translationModeEnabled && inspectorHotkey && !e.repeat && matchesBareKey(inspectorHotkey, e)) {
      if (inspectionModeActive) exitInspectionMode();
      else enterInspectionMode();
    }
  },
  true
);

window.addEventListener(
  "keyup",
  (e) => {
    if (holdKeyActive && matchesBareKey(holdHotkey, e)) {
      // Release freezes/pins the tooltip on whatever's currently shown — no further
      // action needed, just stop granting live retargeting (isEngineLive/
      // handlePointerMove read holdKeyActive directly).
      holdKeyActive = false;
      updateInspectorCursor();
    }
  },
  true
);

// Alt+Tab, clicking a native browser dialog, etc. — never leave Inspection Mode (and
// its magnifier cursor) stuck on when focus leaves the page entirely.
window.addEventListener("blur", () => {
  holdKeyActive = false;
  exitInspectionMode();
});

// A click OUTSIDE the tooltip ends Inspection Mode / closes the Translation Mode
// click-editor — the explicit "I'm done here" signal. The tooltip is now a SOLID
// surface (tooltip.css: pointer-events:auto), and because it lives in a CLOSED shadow
// root, every click that originates anywhere inside it retargets to `shadowHost` for
// this document-level listener. So the single `e.target === shadowHost` check keeps
// the tooltip open for ANY inside click, by construction — no rect/coordinate math
// that could go stale, which is exactly what made the earlier pointer-events:none +
// geometry approach (DECISIONS.md #45/#52) still close on some inside clicks. Only a
// click on genuinely different page content (target ≠ shadowHost), Escape, or the
// toggle key closes it now. See DECISIONS.md #54. While editing, an outside click used
// to only CANCEL the edit and leave the tooltip open (#55, a two-stage dismissal); it
// now closes outright — see the inline comment below and DECISIONS.md #62.
// exitInspectionMode() is called
// unconditionally (no `if (inspectionModeActive)` guard) — its own internal check
// (DECISIONS.md #56) already covers "close whatever's showing, toggle-pinned or
// standalone-hold-pinned alike," same reasoning as the Escape branch above.
document.addEventListener("click", (e) => {
  if (shadowHost && e.target === shadowHost) return;
  // Two-stage while editing, restored after `#62` regressed it into a single
  // destroy-everything gesture: the first outside click ends the EDIT and leaves the
  // metadata on screen to keep reading, the second closes the surface. Both surfaces
  // resolve through the same rule — see `resolveOutsideClick` (DECISIONS.md #63) for
  // the full reasoning and the regression tests that now pin it.
  const action = resolveOutsideClick(interactionSnapshot());
  if (action === "cancel-edit") {
    requestCancelEdit();
    return;
  }
  if (action === "close-tooltip") {
    exitInspectionMode();
    if (tmEditorOpen) closeTmEditor();
  }
});

// Scrolling moves the page under a stationary cursor without any mouse event — the
// engine's own live/editing checks live inside handlePointerMove, so this just needs
// to re-run it after a short debounce (scroll events fire very rapidly).
window.addEventListener(
  "scroll",
  () => {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => handlePointerMove(lastMouseX, lastMouseY), SCROLL_REINSPECT_MS);
  },
  { passive: true, capture: true }
);

function scheduleClear() {
  window.clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => clearTooltip(), CLEAR_GRACE_MS);
}

function cancelScheduledClear() {
  window.clearTimeout(clearTimer);
}

function loadRealCustomLabels() {
  chrome.runtime.sendMessage({
    type: "LOAD_LABELS",
    origin: window.location.origin,
    // Always in scope for standard-translation lookups, even if the admin has never
    // customized anything on this object via Translation Workbench/Rename Tabs and Labels.
    pageObjectApiName: guessObjectApiNameFromUrl(),
  });
}

const AUDIT_HIGHLIGHT_STYLE_ID = "sti-audit-highlight-style";

/** One-time keyframe definition for the highlight's brief "this is the one" pulse on activation, settling into a steady outline — see `highlightElement`. Injected once, removed alongside the rest of the audit UI when Translation Mode turns off. */
function ensureHighlightStylesheet() {
  if (document.getElementById(AUDIT_HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = AUDIT_HIGHLIGHT_STYLE_ID;
  style.textContent =
    "@keyframes sti-audit-pulse {" +
    "0% { box-shadow: 0 0 0 2px #1a56db, 0 0 0 2px rgba(26,86,219,.35); }" +
    "50% { box-shadow: 0 0 0 2px #1a56db, 0 0 0 10px rgba(26,86,219,.05); }" +
    "100% { box-shadow: 0 0 0 2px #1a56db, 0 0 0 6px rgba(26,86,219,.18); } }" +
    "#sti-audit-highlight { animation: sti-audit-pulse .6s ease-out; }";
  document.documentElement.appendChild(style);
}

/** Resyncs the highlight overlay to its target's LIVE rect — called on scroll/resize while a highlight is active, since `scrollIntoView`'s smooth animation fires many scroll events before settling. */
function positionHighlight() {
  if (!highlightEl || !highlightTarget) return;
  // A SELECTED item is not a hover target (DECISIONS.md #63): it keeps tracking its
  // element for as long as that element is on screen, and simply stops being drawn
  // once it isn't — rather than following it off the edge, where a rectangle clipped
  // against the viewport reads as a rendering glitch and, at the extremes, as a stray
  // line stuck to the side of the page. Nothing about the SELECTION changes here; the
  // panel's selected row is what states which item is current, and it stays put. Same
  // predicate the anchored modal uses, so the two can't disagree.
  const visible = isElementInViewport(highlightTarget);
  highlightEl.style.display = visible ? "" : "none";
  if (!visible) return;
  const rect = highlightTarget.getBoundingClientRect();
  highlightEl.style.left = `${rect.left - 4}px`;
  highlightEl.style.top = `${rect.top - 4}px`;
  highlightEl.style.width = `${Math.max(rect.width + 8, 4)}px`;
  highlightEl.style.height = `${Math.max(rect.height + 8, 4)}px`;
}

function clearHighlight() {
  window.clearTimeout(auditEditorOpenTimer);
  if (highlightRepositionHandler) {
    window.removeEventListener("scroll", highlightRepositionHandler, true);
    window.removeEventListener("resize", highlightRepositionHandler);
    highlightRepositionHandler = undefined;
  }
  highlightEl?.remove();
  highlightEl = undefined;
  highlightTarget = null;
}

/**
 * The guided-navigation "this is the one" marker (ROADMAP.md PHASE 18) — a single
 * floating overlay synced to the target's live rect via `positionHighlight`, rather
 * than a class/inline style applied to the target element itself: safer (never risks
 * fighting Salesforce's own CSS on the real element) and trivially reversible (just
 * remove the overlay node). Only ONE highlight exists at a time — a new call clears
 * the previous one first, which is exactly why the overlap problem that killed
 * Translation Mode's OWN v1 (dozens of simultaneous floating cards, `#19`) doesn't
 * apply here: guided navigation only ever highlights the ONE entry being worked on.
 */
function highlightElement(el: Element) {
  clearHighlight();
  ensureHighlightStylesheet();
  highlightTarget = el;
  highlightEl = document.createElement("div");
  highlightEl.id = "sti-audit-highlight";
  highlightEl.style.cssText =
    "position:fixed;z-index:2147483644;pointer-events:none;border-radius:6px;" +
    "box-shadow:0 0 0 2px #1a56db, 0 0 0 6px rgba(26,86,219,.18);" +
    "transition:left .2s,top .2s,width .2s,height .2s;";
  document.documentElement.appendChild(highlightEl);
  positionHighlight();
  highlightRepositionHandler = () => positionHighlight();
  window.addEventListener("scroll", highlightRepositionHandler, { passive: true, capture: true });
  window.addEventListener("resize", highlightRepositionHandler, { passive: true });
}

/** Literally the same function `AuditPanel` renders from (filter AND search) — imported rather than re-implemented, so "what the panel shows" and "what the panel's current target is" can never disagree. */
function currentFilteredAuditEntries(): AuditEntry[] {
  return filterAuditEntries(auditEntries, auditFilter, auditSearch, auditTypeFilters);
}

function currentAuditEntry(): AuditEntry | undefined {
  const list = currentFilteredAuditEntries();
  if (list.length === 0) return undefined;
  return list[Math.min(auditIndex, list.length - 1)];
}

/** Re-applies the translation-scope toggle to whatever the CURRENT entry now is — called after every navigation, filter change, rescan, and scope toggle itself, so "current only" mode never shows a stale target's badge. */
function updateBadgeScope(focusedElement?: Element | null) {
  setBadgeScope(auditScope, focusedElement !== undefined ? focusedElement : currentAuditEntry()?.element ?? null);
}

function renderAuditPanel() {
  ensureAuditHost().render(
    <AuditPanel
      entries={auditEntries}
      filter={auditFilter}
      onFilterChange={handleAuditFilterChange}
      search={auditSearch}
      onSearchChange={handleAuditSearchChange}
      typeFilters={auditTypeFilters}
      onTypeFiltersChange={handleAuditTypeFiltersChange}
      currentIndex={auditIndex}
      onNavigate={handleAuditNavigate}
      expanded={auditExpanded}
      onToggleExpanded={handleAuditToggleExpanded}
      scope={auditScope}
      onScopeChange={handleAuditScopeChange}
      workspaceElementKeys={workspaceElementKeySet}
      onAddFilteredToWorkspace={handleAddFilteredToWorkspace}
    />
  );
}

/**
 * "Add filtered to Workspace" (Workspace v4, `DECISIONS.md #68`) — pins every entry in
 * the CURRENT filtered/searched audit view that isn't already tracked (pinned OR
 * edited). Loops the existing single-element `toggleWorkspacePin` rather than adding a
 * new background message: raw-looping the toggle over ALREADY-pinned entries would
 * incorrectly unpin them, so the not-yet-tracked filter (against the same
 * `workspaceElementKeySet` the panel's own count/dot use, so the button never promises
 * a number it doesn't deliver) has to happen here regardless.
 */
function handleAddFilteredToWorkspace() {
  const targets = currentFilteredAuditEntries().filter(
    (e) => !workspaceElementKeySet.has(`${e.entry.type} ${e.entry.apiName}`)
  );
  void Promise.all(targets.map((e) => toggleWorkspacePin(e.entry)));
}

function handleAuditUpdate(entries: AuditEntry[]) {
  auditEntries = entries;
  renderAuditPanel();
  // A rescan can hand back a fresh element reference for the same logical entry
  // (Lightning re-rendered that part of the DOM) — resync scope to the CURRENT
  // entry's latest element rather than whatever `translation-mode.tsx` was last
  // told about, which could now be detached.
  updateBadgeScope();
}

/**
 * THE audit-side state transition (DECISIONS.md #62). Changing the filter, the search,
 * the scope, or collapsing the panel doesn't just re-render a list — it invalidates the
 * CONTEXT the currently-open inspector belongs to: it was opened for a specific target
 * reached through a specific view, and after the transition that target may not even be
 * in the list any more. So every one of those actions funnels through here, which
 * abandons any in-flight guided navigation, drops the highlight, and closes the
 * inspector cleanly — rather than each handler remembering its own subset of that
 * cleanup (the old shape, which is why some transitions left a stale modal behind).
 *
 * Deliberately NOT called by anything the user does INSIDE the inspector — those are
 * interactions, not transitions, and the inspector owns them entirely (see Tooltip's
 * `handleMouseDown`).
 */
function invalidateAuditContext() {
  auditNavToken++;
  window.clearTimeout(auditEditorOpenTimer);
  window.clearTimeout(auditScrollCorrectionTimer);
  clearHighlight();
  forceCloseInspector();
}

/**
 * Closes the tooltip/inspector regardless of whether an edit is currently open.
 * `clearTooltip()` on its own deliberately refuses to run mid-edit (an active edit owns
 * the tooltip — that guard is what protects a focused textarea from every incidental
 * clear), but an EXPLICIT state transition outranks that ownership: the user asked for
 * something that makes this editor meaningless, so it goes. Dropping the flag first is
 * safe because the unmount fires `CandidateBlock`'s own `onEditingActiveChange(false)`
 * cleanup immediately after, leaving nothing inconsistent behind.
 */
function forceCloseInspector() {
  if (!tmEditorOpen && currentTooltipText === null) return;
  isEditingActive = false;
  clearTooltip();
}

function handleAuditFilterChange(filter: AuditFilter) {
  invalidateAuditContext();
  auditFilter = filter;
  auditIndex = 0;
  renderAuditPanel();
  updateBadgeScope();
}

function handleAuditSearchChange(search: string) {
  invalidateAuditContext();
  auditSearch = search;
  auditIndex = 0;
  renderAuditPanel();
  updateBadgeScope();
}

function handleAuditTypeFiltersChange(types: string[]) {
  invalidateAuditContext();
  auditTypeFilters = types;
  auditIndex = 0;
  renderAuditPanel();
  updateBadgeScope();
}

function handleAuditScopeChange(scope: BadgeScope) {
  auditScope = scope;
  renderAuditPanel();
  updateBadgeScope();
}

function handleAuditToggleExpanded() {
  // Collapsing hides the very list the inspector's target was selected from — the
  // panel is back to a summary pill, so a modal still floating over the page belongs
  // to a context the user can no longer see or navigate. Expanding invalidates
  // nothing (there's no open target yet).
  if (auditExpanded) invalidateAuditContext();
  auditExpanded = !auditExpanded;
  renderAuditPanel();
}

/**
 * Finds the target's nearest REAL scrolling ancestor (an element that actually
 * overflows and scrolls) — piercing shadow boundaries via the same
 * `parentAcrossShadow` walk `dom-utils.ts` already uses for attribute lookups,
 * since Lightning nests scroll containers inside open shadow roots (a related
 * list's own internal scroll area, for instance) that a plain `parentElement` walk
 * would miss entirely. Falls back to the document's own scrolling element — plain
 * `window`/page scrolling — which covers the common case for most record-page
 * content. `Element.scrollBy` works identically whether the result is that
 * fallback or a real inner container, so callers never need to special-case it.
 */
function findScrollableAncestor(el: Element): Element {
  let node: Element | null = parentAcrossShadow(el);
  while (node) {
    const style = getComputedStyle(node);
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
    if (canScrollY) return node;
    node = parentAcrossShadow(node);
  }
  return document.scrollingElement ?? document.documentElement;
}

/**
 * How much of the viewport's TOP edge is currently obscured by pinned chrome
 * (Salesforce's sticky global header, a record page's compact/sticky highlights
 * panel once scrolled past its tall form, etc.) — sampled generically via
 * `deepElementFromPoint` (pierces shadow roots, the same primitive the hover engine
 * itself uses for hit-testing) rather than hardcoded Salesforce class names, which
 * could break across orgs/themes/releases. Checks `position: fixed`/`sticky` on the
 * hit element's own ancestor chain at a few x-offsets, since a single sample can
 * miss a header that doesn't span the full width.
 */
function measureTopObstruction(): number {
  let max = 0;
  for (const fx of [0.1, 0.5, 0.9]) {
    let node: Element | null = deepElementFromPoint(window.innerWidth * fx, 1);
    let hops = 0;
    while (node && hops < 10) {
      const style = getComputedStyle(node);
      if (style.position === "fixed" || style.position === "sticky") {
        const rect = node.getBoundingClientRect();
        if (rect.top <= 1 && rect.bottom > max) max = rect.bottom;
      }
      node = parentAcrossShadow(node);
      hops++;
    }
  }
  return max;
}

/**
 * Verify-and-correct pass, run once a `scrollIntoView` call should have settled
 * (DECISIONS.md #61) — never trust `scrollIntoView` alone against Salesforce's
 * pinned/sticky headers and nested scroll containers. Real-org bug: navigating from
 * a body element TO a header element visually identified and highlighted the right
 * target, but the actual viewport never moved — `scrollIntoView`'s built-in
 * ancestor walk can decide a `position: sticky` target is "already visible" (by its
 * own bounding-rect math) even when it's covered by other pinned chrome, or resolve
 * the wrong scrolling ancestor entirely in a nested-scroll-container page. This
 * measures where the target ACTUALLY ended up; if it's covered by pinned chrome at
 * the top or still past the bottom edge, applies a direct corrective scroll on the
 * target's REAL scrolling ancestor (not assumed to be the window). Returns whether
 * a correction was applied, so the caller can wait a little longer before anchoring
 * the editor to the target's rect. Symmetric by construction — it doesn't care
 * which direction the navigation came from, only where the target ended up.
 */
function ensureVisibleAboveObstruction(el: Element): boolean {
  const minTop = measureTopObstruction() + SCROLL_VIEWPORT_MARGIN_PX;
  const maxBottom = window.innerHeight - SCROLL_VIEWPORT_MARGIN_PX;
  const rect = el.getBoundingClientRect();
  if (rect.top >= minTop && rect.bottom <= maxBottom) return false;

  const delta = rect.top < minTop ? rect.top - minTop : rect.bottom - maxBottom;
  findScrollableAncestor(el).scrollBy({ top: delta, behavior: "auto" });
  return true;
}

/**
 * Scrolls to the target, highlights it, and opens the inspector on it. Navigating is a
 * state transition (`invalidateAuditContext`) — the PREVIOUS target's inspector closes
 * first, unconditionally, instead of being left floating over a page that has already
 * scrolled somewhere else.
 *
 * The whole chain is guarded by a navigation token: `scrollIntoView`'s smooth behavior
 * has no completion callback, so this is inherently "wait, then check, then maybe
 * correct, then open" — and every one of those steps must be abandonable the instant
 * the user clicks Next again or types in the search box.
 */
function handleAuditNavigate(index: number, entry: AuditEntry) {
  invalidateAuditContext();
  const token = auditNavToken;
  auditIndex = index;
  renderAuditPanel();
  updateBadgeScope(entry.element);
  entry.element.scrollIntoView({ behavior: "smooth", block: "center" });
  highlightElement(entry.element);
  auditScrollCorrectionTimer = window.setTimeout(() => {
    if (token !== auditNavToken) return;
    if (!ensureVisibleAboveObstruction(entry.element)) {
      openAuditInspector(entry, token);
      return;
    }
    // A corrective scroll can itself change what's obstructing the target: Lightning's
    // sticky highlights panel collapses/expands as the page scrolls, and correcting
    // inside a NESTED container can bring the target under chrome that wasn't in the
    // way when the first measurement was taken. One more verify-and-correct pass
    // settles those cases; a THIRD would be chasing an animation, not converging.
    auditEditorOpenTimer = window.setTimeout(() => {
      if (token !== auditNavToken) return;
      ensureVisibleAboveObstruction(entry.element);
      auditEditorOpenTimer = window.setTimeout(() => openAuditInspector(entry, token), SCROLL_CORRECTION_SETTLE_MS);
    }, SCROLL_CORRECTION_SETTLE_MS);
  }, SCROLL_SETTLE_CHECK_MS);
}

/**
 * Opens the SAME tooltip surface the hover engine uses, on the entry guided navigation
 * just landed on — ALWAYS, not only for editable problem entries (DECISIONS.md #62).
 *
 * The earlier behavior opened an editor for editable `missing`/`identical` entries and
 * showed nothing at all otherwise, which quietly split one interaction into two: for
 * some rows a click told you everything (type, API name, every language's value, Setup
 * link, edit), and for others it just scrolled the page and left you to go turn on
 * Dynamic Hover to find out what you were even looking at. That gap — not a missing
 * feature — was the real friction behind "should Translate All have its own inspect
 * action": the inspector was already there, just conditionally withheld. So the rule is
 * now uniform — navigate = see everything about this entry — and the ONLY thing status/
 * editability still decides is whether it lands pre-opened on the language that needs
 * work, or in read-only view mode. No second inspection system, no extra mode, no new
 * shortcut, no click that means something different depending on the row.
 */
function openAuditInspector(entry: AuditEntry, token: number) {
  if (token !== auditNavToken) return;
  // Something the user started in the meantime (e.g. clicking an on-page chip) owns
  // the tooltip — never rip a focused editor away for a scroll that finished late.
  if (isEditingActive) return;
  const problemLanguage = entry.editable
    ? entry.status === "missing"
      ? entry.missingLanguages[0]
      : entry.status === "identical"
        ? entry.identicalLanguages[0]
        : undefined
    : undefined;
  const rect = entry.element.getBoundingClientRect();
  renderTmTooltip(entry.entry, rect.left + 12, rect.bottom + 8, problemLanguage, entry.element);
}

function applyTranslationModeSetting(enabled: boolean) {
  translationModeEnabled = enabled;
  if (translationModeEnabled) {
    exitInspectionMode();
    clearTooltip();
    // Fresh audit state every time Translate All turns on — a stale filter/position
    // from a previous activation (possibly on a different page) would be confusing,
    // not helpful, to carry forward.
    auditEntries = [];
    auditFilter = "all";
    auditSearch = "";
    auditIndex = 0;
    auditExpanded = false;
    auditScope = "all";
    renderAuditPanel();
    startTranslationMode(activeLanguages, tmStyle, openTmEditor, handleAuditUpdate);
  } else {
    stopTranslationMode();
    // Turning Translate All off is the most total context change there is — the
    // inspector goes even mid-edit, same rule as every other transition.
    invalidateAuditContext();
    auditEntries = [];
    ensureAuditHost().render(null);
    document.getElementById(AUDIT_HIGHLIGHT_STYLE_ID)?.remove();
  }
}

function applyHotkeySettings(s: Settings | undefined) {
  inspectorHotkey = s?.inspectorHotkey === undefined ? "Alt" : s.inspectorHotkey;
  holdHotkey = s?.holdHotkey === undefined ? "Shift" : s.holdHotkey;
  tmHotkey = s?.tmHotkey === undefined ? "Alt+T" : s.tmHotkey;
  // Any settings change resets to a known state rather than trying to preserve an
  // active mode across a rebind — simpler and safer than reconciling "was the key
  // that's currently held down still the key that's configured."
  holdKeyActive = false;
  exitInspectionMode();
}

chrome.storage.local.get("settings", (stored) => {
  const s = stored.settings as Settings | undefined;
  isEnabled = s?.enabled ?? false;
  activeLanguages = s?.activeLanguages ?? [];
  tmStyle = tmStyleFromSettings(s);
  applyHotkeySettings(s);
  if (s?.translationModeEnabled) applyTranslationModeSetting(true);
});

/**
 * PHASE 16 v2 (`DECISIONS.md #66`): which elements are currently pinned to the
 * Workspace, so the tooltip can render "In Workspace" instead of "Add". Keys are
 * `"type apiName"` (shared/workspace.ts's pinnedKeys). Kept fresh by the storage
 * listener below; the toggle itself goes through the background (one writer for the
 * capture path), and each open tooltip additionally keeps its own local override so
 * the button flips instantly without waiting for the round trip.
 */
let workspacePinnedKeySet: ReadonlySet<string> = new Set();

/**
 * Every element (pinned OR edited) currently tracked in the Workspace — the audit
 * panel's "tracked in Workspace" marker (Workspace v3, `DECISIONS.md #67`). Same
 * loading/refresh discipline as `workspacePinnedKeySet` above, but since the audit
 * panel (unlike the tooltip) is a persistently-mounted surface, a change also
 * re-renders it — see the storage listener below.
 */
let workspaceElementKeySet: ReadonlySet<string> = new Set();

chrome.storage.local.get(["workspaceItems", "workspaceEdits"], (stored) => {
  const items = normalizeStoredWorkspace(stored.workspaceItems, stored.workspaceEdits);
  workspacePinnedKeySet = pinnedKeys(items);
  workspaceElementKeySet = allElementKeys(items);
});

function toggleWorkspacePin(entry: LabelEntry): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "WORKSPACE_TOGGLE_PIN", apiName: entry.apiName, labelType: entry.type } satisfies ToggleWorkspacePinRequest,
      (response: ToggleWorkspacePinResponse | undefined) => resolve(response?.pinned ?? false)
    );
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.workspaceItems) {
    const items = normalizeStoredWorkspace(changes.workspaceItems.newValue, undefined);
    workspacePinnedKeySet = pinnedKeys(items);
    workspaceElementKeySet = allElementKeys(items);
    // The audit panel, unlike the tooltip, stays mounted across renders — refresh it
    // only if it's already on screen (auditRoot exists), so this never mounts it
    // prematurely on a page where Translate All was never engaged.
    if (auditRoot) renderAuditPanel();
  }
  if (!changes.settings) return;
  const s = changes.settings.newValue as Settings | undefined;
  isEnabled = s?.enabled ?? false;
  activeLanguages = s?.activeLanguages ?? [];
  tmStyle = tmStyleFromSettings(s);
  applyHotkeySettings(s);
  if (!isEnabled) clearTooltip();

  const nextTranslationMode = s?.translationModeEnabled ?? false;
  if (nextTranslationMode !== translationModeEnabled) {
    applyTranslationModeSetting(nextTranslationMode);
  } else if (nextTranslationMode) {
    // Translation Mode stayed on but the languages or chip style may have changed.
    startTranslationMode(activeLanguages, tmStyle, openTmEditor, handleAuditUpdate);
  }
});

chrome.runtime.onMessage.addListener((message: { type: string }) => {
  if (message.type === "REQUEST_REFETCH") loadRealCustomLabels();
});

loadRealCustomLabels();

/**
 * One closed Shadow DOM root shared by the tooltip AND the audit panel (both are
 * independent `createRoot()` mounts inside it — see `ensureHost`/`ensureAuditHost`),
 * rather than a second closed shadow root: same isolation guarantee (CLAUDE.md rule
 * #3), one less shadow tree to manage, and — critically — two INDEPENDENT React
 * roots means rendering one never clears the other, unlike sharing a single root
 * would (`host.render()` replaces whatever was mounted there).
 */
function ensureShadowRoot(): ShadowRoot {
  // `shadowHost.shadowRoot` is ALWAYS null for a root attached in CLOSED mode — that
  // is the entire point of closed mode, and it silently broke this guard: every caller
  // created its OWN host, so the "one shared root" this comment promises was actually
  // two (`#sti-root` twice in the DOM), and `shadowHost` pointed at whichever was
  // created last. Since click ownership is decided by `e.target === shadowHost`
  // identity, every click inside the OTHER surface then read as an outside click and
  // dismissed the tooltip — the exact "clicking inside the modal closes it" regression,
  // which only appeared once Translate All (`#60`) introduced a second mount and made
  // two hosts possible. Keeping our own reference is the fix; see DECISIONS.md #63.
  if (shadowRoot) return shadowRoot;
  shadowHost = document.createElement("div");
  shadowHost.id = "sti-root";
  document.documentElement.appendChild(shadowHost);
  shadowRoot = shadowHost.attachShadow({ mode: "closed" });
  return shadowRoot;
}

function ensureHost(): Root {
  if (root) return root;
  const shadow = ensureShadowRoot();
  const style = document.createElement("style");
  style.textContent = tooltipCss;
  shadow.appendChild(style);
  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);
  root = createRoot(mountPoint);
  return root;
}

function ensureAuditHost(): Root {
  if (auditRoot) return auditRoot;
  const shadow = ensureShadowRoot();
  const style = document.createElement("style");
  style.textContent = auditPanelCss;
  shadow.appendChild(style);
  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);
  auditRoot = createRoot(mountPoint);
  return auditRoot;
}

function clearTooltip() {
  if (isEditingActive) return;
  currentTooltipText = null;
  tooltipRect = null;
  tmEditorOpen = false;
  lastTooltipArgs = null;
  lastTmEditorArgs = null;
  ensureHost().render(null);
  updateInspectorCursor();
}

/**
 * Re-checks whether the tooltip should still be showing, given the CURRENT mode
 * state — called exactly once, right after an edit finishes (onEditingActiveChange
 * firing `false`). While editing was blocking clearTooltip()/exitInspectionMode(),
 * the extension could have been disabled, Translation Mode turned on, or Inspection
 * Mode exited (e.g. via window blur) — any of which should have torn the tooltip
 * down at the time but couldn't. Without this, finishing an edit in one of those
 * situations would leave a stale tooltip nothing else would ever clear: the engine
 * being idle (isEngineLive() false) is exactly why no further hover/scroll event
 * would trigger a clear on its own.
 *
 * Root-caused bug fix: `isEngineLive()` alone isn't the right guard here — it's
 * ALWAYS false whenever Translation Mode is on (by design, TM suppresses the hover
 * engine entirely), which used to mean finishing ANY edit inside the TM/audit-panel
 * editor — even a completely benign one, like a textarea losing focus because the
 * user clicked a DIFFERENT row's Copy button inside the SAME tooltip — tore the
 * whole tooltip down immediately (`TranslationEditor`'s `onBlur={commit}` calls
 * `onCancel()` when the value is unchanged, which sets `editingLang` to `null` and
 * fires this reconcile). Dynamic Hover never hits this: there, `isEngineLive()`
 * stays TRUE while Inspection Mode is toggled on, so finishing an edit correctly
 * falls through to "keep showing it." The TM/audit editor's equivalent "should this
 * still be showing" signal is `tmEditorOpen`, not the hover engine's liveness at
 * all — checking it here is what brings this editor to true behavioral parity with
 * Dynamic Hover's persistence model, not a separate one bolted on beside it.
 */
function reconcileAfterEdit() {
  if (!isEngineLive() && !tmEditorOpen) clearTooltip();
}

/** Wraps the SAVE_TRANSLATION round trip in a Promise so Tooltip.tsx stays free of chrome.* calls — messaging is the content script's job, the tooltip only renders. */
function saveTranslation(
  entry: LabelEntry,
  language: string,
  value: string,
  expectedValue: string
): Promise<SaveTranslationResponse> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "SAVE_TRANSLATION",
        origin: window.location.origin,
        apiName: entry.apiName,
        labelType: entry.type,
        language,
        value,
        expectedValue,
      } satisfies SaveTranslationRequest,
      (response: SaveTranslationResponse | undefined) => {
        if (chrome.runtime.lastError || !response) {
          resolve({ ok: false, error: "Extension error — please try again." });
          return;
        }
        // A successful save happens inside this extension's own CLOSED shadow root,
        // so the page-level MutationObserver that normally re-triggers Translation
        // Mode's rescan never fires from it — without this explicit refresh, a saved
        // edit would leave the on-page badge AND the audit panel's counts stale until
        // some UNRELATED page mutation happened to retrigger a scan (ROADMAP.md
        // PHASE 18's concurrency section). `startTranslationMode` while already
        // running is already a safe "just rescan now" no-op path.
        if (response.ok && translationModeEnabled) {
          startTranslationMode(activeLanguages, tmStyle, openTmEditor, handleAuditUpdate);
        }
        resolve(response);
      }
    );
  });
}

/**
 * Opens the SAME Tooltip component the hover engine uses, anchored at a Translation
 * Mode chip's click position instead of a hover point — this is the whole point of
 * reusing it rather than building a second, parallel editing UI in translation-
 * mode.tsx's raw-DOM chips: concurrency control, keyboard shortcuts, the conflict
 * banner, all of it comes for free instead of being reimplemented and kept in sync.
 * `candidates=[entry]` + the full active-language list shows every configured
 * language for that one entry (not just the language clicked), with `autoEditLanguage`
 * pre-opening the one the user actually clicked.
 *
 * Always renders through a `null` pass first — a `key` on the root element passed to
 * `root.render()` has no remount effect (there's no sibling list for it to key
 * against), so without this, clicking the same chip a second time in a row would
 * update props on the already-mounted instance instead of remounting it, and the
 * mount-once `autoEditLanguage` effect in Tooltip.tsx would never fire again. Shared
 * by `openTmEditor` (opens editing on the clicked language) and `requestCancelEdit`
 * (remounts WITHOUT `autoEditLanguage`, landing in view mode — the TM editor's own
 * "cancel" mechanism, since it always force-remounts anyway).
 */
function renderTmTooltip(
  entry: LabelEntry,
  x: number,
  y: number,
  autoEditLanguage?: string,
  /** The page element this inspector is ABOUT — present for guided navigation (which always has one), absent for a chip click. Makes the modal element-anchored rather than point-anchored; see Tooltip.tsx's `anchorEl`. */
  anchorEl?: Element
) {
  tmEditorOpen = true;
  currentTooltipText = null;
  lastTmEditorArgs = { entry, x, y, anchorEl };
  // A genuinely NEW editor needs a fresh MOUNT, because `autoEditLanguage` is only
  // read in `CandidateBlock`'s useState initializers — clicking the same chip twice
  // has to re-open its editor, not just update props on the instance already there.
  // A changing `key` is what actually guarantees that: `root.render()` reconciles its
  // single child BY KEY, so a new key deletes the old fiber and mounts a new one. The
  // previous `render(null)` + `render(element)` pair was NOT a reliable remount —
  // React 18 batches both calls into one update and renders only the final element —
  // which is precisely why cancelling an edit on this surface silently did nothing
  // (see `requestCancelEdit`). Found with the dev harness; DECISIONS.md #63.
  tmMountKey++;
  ensureHost().render(tmTooltipElement(tmMountKey, entry, x, y, autoEditLanguage, anchorEl));
}

/**
 * The element itself, split out so `requestCancelEdit` can re-render the SAME mount
 * (same key) carrying only a bumped `cancelTrigger` — updating the live instance
 * rather than replacing it. That is what finally makes both surfaces cancel through
 * ONE mechanism: the hover path always used `cancelTrigger`, while this path relied on
 * a remount that didn't reliably happen.
 */
function tmTooltipElement(
  key: number,
  entry: LabelEntry,
  x: number,
  y: number,
  autoEditLanguage?: string,
  anchorEl?: Element
) {
  return (
    <Tooltip
      key={key}
      text={entry.apiName}
      x={x}
      y={y}
      candidates={[entry]}
      activeLanguages={activeLanguages}
      flagIdentical={tmStyle.flagIdentical}
      autoEditLanguage={autoEditLanguage}
      anchorEl={anchorEl}
      cancelTrigger={cancelTriggerCounter}
      onSaveTranslation={saveTranslation}
      workspacePinnedKeys={workspacePinnedKeySet}
      onToggleWorkspacePin={toggleWorkspacePin}
      onEditingActiveChange={(active) => {
        isEditingActive = active;
        if (!active) reconcileAfterEdit();
      }}
      onRectChange={(rect) => { tooltipRect = rect; }}
    />
  );
}

/** Guarded by `isEditingActive` — don't rip a focused editor out to open a different one. */
function openTmEditor(entry: LabelEntry, language: string, x: number, y: number) {
  if (isEditingActive) return;
  renderTmTooltip(entry, x, y, language);
}

function closeTmEditor() {
  if (!tmEditorOpen || isEditingActive) return;
  clearTooltip();
}

function showTooltip(text: string, x: number, y: number, response: ResolveTextResponse) {
  lastTooltipArgs = { text, x, y, response };
  ensureHost().render(
    <Tooltip
      text={text}
      x={x}
      y={y}
      candidates={response.candidates}
      activeLanguages={activeLanguages}
      flagIdentical={tmStyle.flagIdentical}
      onSaveTranslation={saveTranslation}
      workspacePinnedKeys={workspacePinnedKeySet}
      onToggleWorkspacePin={toggleWorkspacePin}
      onEditingActiveChange={(active) => {
        isEditingActive = active;
        if (!active) reconcileAfterEdit();
      }}
      onRectChange={(rect) => { tooltipRect = rect; }}
      editTrigger={editTriggerCounter}
      cancelTrigger={cancelTriggerCounter}
    />
  );
}

/**
 * True while the user is actually typing into a real page field — a native input/
 * textarea or a contenteditable, outside our own closed shadow DOM. Guards the
 * Enter-to-edit shortcut below: Inspection Mode can be toggled on while focus is
 * still sitting in an unrelated Salesforce field (nothing about entering the mode
 * moves focus), and this shortcut must never eat that Enter press — e.g. submitting
 * a search box or inserting a newline in a long-text field the user is mid-typing in.
 */
function isTypingInPage(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return false;
  // Focus inside our own CLOSED shadow root surfaces as the host element, never as the
  // real field — so this can only ever be true for a genuine PAGE field, which is
  // exactly the distinction it's asked to make.
  if (el === shadowHost) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

/** Class on the audit panel's search input — the one control inside our own UI that legitimately shares the keyboard with list navigation (see `resolveNavKey`). */
const SEARCH_INPUT_CLASS = "sti-audit-search-input";

/**
 * Is focus in the panel's OWN search box? Read straight off the shadow root's live
 * `activeElement` rather than tracked with React focus handlers and a module flag: a
 * flag can go stale (a re-render, a node React decides to replace, a focus change that
 * never fires the handler), and every one of those failures shows up as the keyboard
 * mysteriously doing the wrong thing. The DOM already knows the answer, and we hold the
 * only reference to this closed root, so just ask it. Note `document.activeElement`
 * cannot answer this — from outside, focus inside a closed root reads as the host.
 */
function isTypingInPanelSearch(): boolean {
  const active = shadowRoot?.activeElement as HTMLElement | null;
  return active?.classList.contains(SEARCH_INPUT_CLASS) ?? false;
}

/**
 * Builds the snapshot `interaction.ts` resolves ownership from. One place that reads
 * live module state, so the RULES themselves stay pure and testable — see
 * `interaction.ts`'s header for the hierarchy this feeds.
 */
function interactionSnapshot(): InteractionSnapshot {
  return {
    editing: isEditingActive,
    surface: tmEditorOpen ? "inspector" : currentTooltipText !== null ? "hover" : "none",
    panelExpanded: translationModeEnabled && auditExpanded,
    panelHasEntries: currentFilteredAuditEntries().length > 0,
    typingInPage: isTypingInPage(),
    typingInPanelSearch: isTypingInPanelSearch(),
    searchActive: auditSearch !== "",
  };
}

/**
 * Keyboard navigation lands on exactly the same `handleAuditNavigate` the Prev/Next
 * buttons and list rows call — no parallel path, so scroll correction, highlighting,
 * the internal list scroll and the inspector all behave identically however the user
 * got there. "activate" (Enter) re-navigates to the CURRENT entry rather than doing
 * something separate: after arrowing to a row, Enter means "take me there", which is
 * the same action a click on that row already performs.
 */
function handleAuditNavKey(action: NavAction) {
  const list = currentFilteredAuditEntries();
  if (list.length === 0) return;
  const current = Math.min(auditIndex, list.length - 1);
  const nextIndex =
    action === "next"
      ? Math.min(current + 1, list.length - 1)
      : action === "prev"
        ? Math.max(current - 1, 0)
        : current;
  handleAuditNavigate(nextIndex, list[nextIndex]);
}

/**
 * Escape or an outside click while an edit is in progress — cancels the edit, the
 * same outcome as clicking the row's own Cancel button. Before this existed, Escape
 * and outside-click were fully inert while editing (`isEditingActive` blocked
 * `exitInspectionMode`/`closeTmEditor` outright, to protect a mid-keystroke textarea)
 * and ONLY the Cancel button worked — confusing, since Escape/click-outside always
 * being able to back you out is standard UI convention (real-org feedback:
 * "no se quita el modal... solo dandole a cancel", see DECISIONS.md #55). Deliberately
 * matches Cancel's actual scope — cancels the EDIT, tooltip stays open in view mode —
 * not "also fully close the tooltip"; a second Escape/outside-click, now that editing
 * has stopped, falls through to the normal exit/close paths below on its own.
 *   - Hover path: re-renders the SAME tooltip with a bumped `cancelTrigger`, which
 *     CandidateBlock reacts to by cancelling.
 *   - Translation Mode path: the click-editor always force-remounts anyway (see
 *     `renderTmTooltip`), so remounting WITHOUT `autoEditLanguage` lands it in view
 *     mode directly — no `cancelTrigger` needed on this path.
 * A no-op if nothing is being edited.
 */
function requestCancelEdit() {
  if (!isEditingActive) return;
  cancelTriggerCounter++;
  if (lastTooltipArgs) {
    showTooltip(lastTooltipArgs.text, lastTooltipArgs.x, lastTooltipArgs.y, lastTooltipArgs.response);
  } else if (lastTmEditorArgs) {
    // SAME mount key on purpose — this updates the open tooltip so its `cancelTrigger`
    // effect fires, instead of trying to force a remount into view mode (which is what
    // silently failed before; see `renderTmTooltip`).
    const { entry, x, y, anchorEl } = lastTmEditorArgs;
    ensureHost().render(tmTooltipElement(tmMountKey, entry, x, y, undefined, anchorEl));
  }
}

/** Enter-to-edit (PHASE 17): re-shows the currently-inspected tooltip with a bumped `editTrigger`, which Tooltip.tsx's CandidateBlock reacts to by opening its first row's editor. A no-op if there's nothing showing, an edit is already active, or the user is typing elsewhere on the page. */
function requestEditShortcut() {
  if (isEditingActive || !inspectionModeActive || !lastTooltipArgs || isTypingInPage()) return;
  editTriggerCounter++;
  const { text, x, y, response } = lastTooltipArgs;
  showTooltip(text, x, y, response);
}

/**
 * Resolve whatever sits at (x, y) and show/keep/clear the tooltip accordingly.
 * Feel-critical details:
 * - Mid-edit → suspended entirely (lesson: retargeting to a different element's
 *   tooltip while a textarea is focused destroyed the in-progress edit with no
 *   warning; this is real "tooltip ownership" — an active edit owns the tooltip
 *   until it finishes).
 * - Same text as already shown → no-op: the tooltip stays rock-stable instead of
 *   re-rendering and jumping around while the pointer travels within an element.
 * - Nothing resolvable → ONLY true Always Hover (`inspectorHotkey === null`) fades it
 *   out after a grace period; toggle mode OR an active hold-peek instead just keep
 *   showing whatever was last resolved (DECISIONS.md #56 — the whole point of a
 *   pinned tooltip is that it only changes on a genuinely new target or an explicit
 *   exit, never on "the cursor currently happens to be over blank space" while hunting
 *   for the next thing to pin).
 */
function inspectAt(x: number, y: number) {
  if (isEditingActive) return;
  const target = resolveHoverTarget(x, y);
  if (!target) {
    if (inspectorHotkey === null) scheduleClear();
    return;
  }
  if (target.text === currentTooltipText) {
    cancelScheduledClear();
    return;
  }
  chrome.runtime.sendMessage(
    { type: "RESOLVE_TEXT", text: target.text, hints: target.hints },
    (response: ResolveTextResponse | undefined) => {
      if (isEditingActive) return; // an edit could have started while this round trip was in flight
      // No match (or context-based suppression) → show NOTHING (Always Hover) or
      // KEEP the last tooltip (toggle/hold) — never a wrong guess either way
      // (lesson #31's "controlled metadata only" bar).
      if (chrome.runtime.lastError || !response || response.candidates.length === 0) {
        if (inspectorHotkey === null) scheduleClear();
        return;
      }
      cancelScheduledClear();
      currentTooltipText = target.text;
      showTooltip(target.text, x, y, response);
      updateInspectorCursor();
    }
  );
}

/**
 * True while the cursor is within a SMALL margin of the tooltip's rendered box — just
 * enough to smooth over a single frame's pixel-boundary jitter right at its edge, not
 * a large dead zone. Real "am I over the tooltip" ownership is decided by identity
 * (`rawEl === shadowHost` in handlePointerMove below), which is exact and — since the
 * tooltip is now a SOLID surface (DECISIONS.md #54/#56, tooltip.css) — true across its
 * ENTIRE box, not just its buttons/textarea like when it used to be pass-through. This
 * margin only smooths the last sliver of travel right at the edge.
 */
function isWithinTooltipZone(x: number, y: number): boolean {
  if (!tooltipRect) return false;
  const m = TOOLTIP_OWNERSHIP_MARGIN_PX;
  return (
    x >= tooltipRect.left - m &&
    x <= tooltipRect.right + m &&
    y >= tooltipRect.top - m &&
    y <= tooltipRect.bottom + m
  );
}

/**
 * The single entry point every pointer-position change (mousemove, scroll) funnels
 * through. Layered checks, cheapest first:
 *  1. Mid-edit → do nothing at all (ownership: an active edit owns the tooltip).
 *  2. Engine not live (disabled, Translation Mode on, or neither toggle mode nor a
 *     hold-peek currently active) → nothing to do.
 *  3. Exact identity / small margin (#isWithinTooltipZone) — stay pinned while over the
 *     tooltip itself, now a solid surface end to end.
 *  4. Cheapest real gate: has the raw element under the cursor actually changed since
 *     last time? If not, skip ALL further work — no text extraction, no attribute
 *     walks, no messaging (this is what replaced native mouseover/mouseout, unreliable
 *     through Lightning's nested shadow trees).
 *  5. Mode-specific retargeting (DECISIONS.md #56):
 *     - Always Hover (`inspectorHotkey === null`): unchanged classic behavior — small
 *       debounce, continuous, fades out on nothing found.
 *     - `holdHotkey` held: LIVE, zero-debounce — the explicit "I'm searching" signal,
 *       regardless of toggle state.
 *     - Toggle mode on, not holding: STICKY — only resolves while NOTHING is pinned
 *       yet (`currentTooltipText === null`, i.e. right after toggling on); once
 *       something is shown, mouse movement alone never retargets it — only the hold
 *       key, Escape, or an outside click can move or close it.
 */
function handlePointerMove(x: number, y: number) {
  if (isEditingActive) return;
  if (!isEngineLive()) return;

  const rawEl = deepElementFromPoint(x, y);
  if (rawEl === shadowHost || isWithinTooltipZone(x, y)) {
    cancelScheduledClear();
    return;
  }
  if (rawEl === lastRawElement) return;
  lastRawElement = rawEl;

  if (inspectorHotkey === null) {
    // Always Hover: unchanged classic debounce.
    window.clearTimeout(hoverTimer);
    hoverTimer = window.setTimeout(() => inspectAt(x, y), HOVER_DEBOUNCE_MS);
  } else if (holdKeyActive) {
    // Holding = zero-debounce live peek, regardless of toggle state.
    window.clearTimeout(hoverTimer);
    inspectAt(x, y);
  } else if (inspectionModeActive && currentTooltipText === null) {
    // Toggle mode's first catch only — sticky once pinned.
    window.clearTimeout(hoverTimer);
    inspectAt(x, y);
  }
}
