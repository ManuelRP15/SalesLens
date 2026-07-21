import type { ContextHints } from "../shared/types";

export interface HoverTarget {
  text: string;
  hints: ContextHints;
}

/**
 * Lightning renders almost everything inside Shadow DOM (LWC), sometimes nested
 * Shadow DOM (one lwc inside another). document.elementsFromPoint() doesn't pierce
 * shadow roots on its own unless queried recursively.
 */
export function deepElementFromPoint(x: number, y: number): Element | null {
  let el: Element | null = document.elementFromPoint(x, y);

  // Descend while the found element has an open shadowRoot
  while (el && (el as HTMLElement).shadowRoot) {
    const shadowRoot = (el as HTMLElement).shadowRoot!;
    const nested = shadowRoot.elementFromPoint(x, y);
    if (!nested || nested === el) break;
    el = nested;
  }

  return el;
}

/** Extracts the most specific visible text of the element (without descending into children if it's already a leaf) */
function extractOwnText(el: Element): string {
  // Prefer the node's direct text, not its descendants', so we don't
  // accidentally capture entire containers.
  const directText = Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent ?? "")
    .join(" ");

  const own = directText.trim();
  if (own) return own;

  // If the node has no text of its own (it's a wrapper), use the full
  // textContent, but only if it's reasonably short (avoids capturing whole tables).
  const full = (el.textContent ?? "").trim();
  return full.length > 0 && full.length < 200 ? full : "";
}

/**
 * Next ancestor, crossing a shadow boundary ONLY when the current tree is
 * exhausted. The previous version of this logic checked `getRootNode()` first
 * and jumped straight to the shadow host whenever the node lived inside any
 * shadow tree — which is always, in Lightning — skipping every intermediate
 * parent in the same tree (see lesson #29). `parentElement` must win first;
 * the host is only the fallback at the top of the current tree.
 */
export function parentAcrossShadow(node: Element): Element | null {
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** Looks upwards (including across shadow boundaries) for a useful data attribute. */
function findAttributeUpwards(
  start: Element,
  attribute: string,
  maxHops = 20
): string | null {
  let node: Element | null = start;
  let hops = 0;

  while (node && hops < maxHops) {
    const value = node.getAttribute?.(attribute);
    if (value) return value;
    node = parentAcrossShadow(node);
    hops += 1;
  }

  return null;
}

export type FieldContext = "label" | "value" | "item";

// CONFIRMED against a real org (2026-07-19): the Custom-Label-vs-field-label
// distinction works with these markers (lesson #30).
// - "slds-form-element__label" is the SLDS-standard class on the label side of any
//   form element; "test-id__field-label" is its widely-observed companion in
//   Lightning record detail output.
// - "slds-form-element__control" / "test-id__field-value" are the value-side twins.
// - records-record-layout-item (LWC) / force-record-layout-item (Aura) are the
//   per-field containers on record detail layouts.
const FIELD_LABEL_MARKER_CLASSES = ["test-id__field-label", "slds-form-element__label"];
const FIELD_VALUE_MARKER_CLASSES = ["test-id__field-value", "slds-form-element__control"];
const FIELD_ITEM_TAGS = new Set(["RECORDS-RECORD-LAYOUT-ITEM", "FORCE-RECORD-LAYOUT-ITEM"]);

/**
 * Classifies the hovered/scanned element by the field container it sits in, if
 * any: "label" (the label side of a record-detail field), "value" (the value
 * side), "item" (inside a field container but neither marker seen yet), or null
 * (no field container in the ancestor chain at all — e.g. free-standing text
 * rendered by a custom component). This is the signal that lets resolveText
 * separate "a field's label" from "a Custom Label whose text happens to match a
 * field's label" — the two live in structurally different DOM even when the
 * rendered text is identical.
 */
export function resolveFieldContext(start: Element, maxHops = 20): FieldContext | null {
  let node: Element | null = start;
  let hops = 0;

  while (node && hops < maxHops) {
    const classList = node.classList;
    if (classList) {
      if (FIELD_LABEL_MARKER_CLASSES.some((c) => classList.contains(c))) return "label";
      if (FIELD_VALUE_MARKER_CLASSES.some((c) => classList.contains(c))) return "value";
    }
    if (FIELD_ITEM_TAGS.has(node.tagName)) return "item";
    node = parentAcrossShadow(node);
    hops += 1;
  }

  return null;
}

export type SurfaceContext = "button" | "navTab" | "innerTab" | "section" | "relatedList";

const BUTTON_TAGS = new Set([
  "BUTTON",
  "LIGHTNING-BUTTON",
  "LIGHTNING-BUTTON-MENU",
  "LIGHTNING-BUTTON-ICON",
  "LIGHTNING-BUTTON-GROUP",
]);

/**
 * Classifies the UI surface the element sits on. "navTab" (an item of the app
 * navigation bar — `slds-context-bar` in SLDS, `one-appnav` host) is decided
 * during the walk because nav items are ALSO buttons/tab-roles internally and
 * must win over both. "button"/"innerTab" are decided after the walk completes
 * without hitting the nav bar.
 *
 * PROVISIONAL (lesson #27 discipline): these surface markers are SLDS-standard
 * but not yet confirmed against this org's real DOM — verify via the hover log's
 * hints JSON (surfaceContext) on a real button, a nav bar item, and an inner tab
 * before treating them as settled. The field-container markers above ARE
 * confirmed; these are the next batch awaiting the same confirmation.
 */
export function resolveSurfaceContext(start: Element, maxHops = 15): SurfaceContext | null {
  let node: Element | null = start;
  let hops = 0;
  let sawButton = false;
  let sawTab = false;

  while (node && hops < maxHops) {
    const classList = node.classList;
    if (
      classList?.contains("slds-context-bar__item") ||
      classList?.contains("slds-context-bar") ||
      node.tagName === "ONE-APPNAV" ||
      node.tagName === "ONE-APP-NAV-BAR"
    ) {
      return "navTab";
    }
    // Collapsible layout section headings render INSIDE a button
    // (slds-section__title-action within h3.slds-section__title) — this must be
    // decided during the walk, before the button flag wins, or every section
    // heading would be suppressed as an uncovered button.
    // ONLY the title classes — NOT the whole "slds-section" container, which
    // wraps the section's field content too: matching it suppressed every field
    // inside a section as a non-LayoutSection (real-org regression, lesson #35).
    if (
      classList?.contains("slds-section__title") ||
      classList?.contains("slds-section__title-action")
    ) {
      return "section";
    }
    // Related list cards: their LWC components are namespaced lst-* (e.g.
    // lst-related-list-single-container) — CONFIRMED in real-org hover logs
    // (2026-07-20). A button INSIDE the card (New, Show Actions...) must still
    // classify as a button, not as the related list title — sawButton records
    // that the walk already passed through a button on the way up.
    if (node.tagName.startsWith("LST-")) {
      return sawButton ? "button" : "relatedList";
    }
    if (
      BUTTON_TAGS.has(node.tagName) ||
      node.getAttribute?.("role") === "button" ||
      classList?.contains("slds-button")
    ) {
      sawButton = true;
    }
    if (
      node.getAttribute?.("role") === "tab" ||
      node.tagName === "LIGHTNING-TAB-BAR" ||
      classList?.contains("slds-tabs_default__link") ||
      classList?.contains("slds-vertical-tabs__link")
    ) {
      sawTab = true;
    }
    node = parentAcrossShadow(node);
    hops += 1;
  }

  if (sawButton) return "button";
  if (sawTab) return "innerTab";
  return null;
}

export function guessObjectApiNameFromUrl(): string | null {
  // E.g.: https://foo.lightning.force.com/lightning/r/Account/001.../view
  const match = window.location.pathname.match(/\/lightning\/r\/([^/]+)\//);
  return match ? match[1] : null;
}

export interface ScannedTarget {
  text: string;
  element: Element;
  hints: ContextHints;
}

const STI_ROOT_IDS = new Set(["sti-root", "sti-translation-mode-root"]);

/** Marks Translation Mode's own inline badges so the scanner never re-processes its own output. */
export const TRANSLATION_MODE_BADGE_ATTR = "data-sti-injected";

/** Stricter than extractOwnText: only the element's own direct text, no wrapper fallback. */
function extractDirectText(el: Element): string {
  const directText = Array.from(el.childNodes)
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent ?? "")
    .join(" ");
  return directText.trim();
}

/**
 * Renderable = has real layout size. Deliberately NOT viewport-gated: Translation
 * Mode must annotate the WHOLE page up front (content below the scroll fold
 * included), not chase the viewport with delayed re-scans — real-org feedback
 * (lesson #38). display:none content (closed menus, unopened dropdowns) still
 * measures 0×0 and is picked up by the MutationObserver re-scan when it opens.
 */
function isRenderable(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Walks the live DOM (including open shadow roots — LWC/Aura components use open
 * ones, unlike our own closed extension roots) collecting every element that has
 * its own direct text, for Translation Mode's full-screen scan.
 *
 * Deliberately stricter than resolveHoverTarget's extractOwnText (no "wrapper
 * fallback to full textContent"): in a single point-based hover lookup that
 * fallback is harmless, but in a full-tree walk it would make both a wrapper and
 * its child report the same text, producing duplicate overlay cards.
 */
export function collectTranslatableTargets(
  root: Element = document.body,
  onShadowRoot?: (shadowRoot: ShadowRoot) => void
): ScannedTarget[] {
  const results: ScannedTarget[] = [];
  const pageObjectApiName = guessObjectApiNameFromUrl();

  function walk(node: Element) {
    if (STI_ROOT_IDS.has(node.id) || node.hasAttribute(TRANSLATION_MODE_BADGE_ATTR)) return;

    const shadow = (node as HTMLElement).shadowRoot;
    if (shadow) {
      // Mutations INSIDE a shadow root do not bubble to a document.body
      // observer — the caller can use this hook to observe each open root it
      // discovers (Translation Mode's dropdown/popover coverage, lesson #39).
      onShadowRoot?.(shadow);
      for (const child of Array.from(shadow.children)) walk(child);
    }

    if (isRenderable(node)) {
      const text = extractDirectText(node);
      if (text) {
        results.push({
          text,
          element: node,
          hints: {
            targetSelectionName: findAttributeUpwards(node, "data-target-selection-name"),
            pageObjectApiName,
            elementTagName: node.tagName,
            fieldContext: resolveFieldContext(node),
            surfaceContext: resolveSurfaceContext(node),
          },
        });
      }
    }

    for (const child of Array.from(node.children)) walk(child);
  }

  for (const child of Array.from(root.children)) walk(child);
  return results;
}

/**
 * When extractOwnText fell back to a WRAPPER's full textContent (the hovered
 * element had no direct text of its own — e.g. empty space right next to the
 * label), descend to the element that actually owns that text, so the context
 * hints (tag name, field/surface context) describe the real labeled element
 * instead of an anonymous wrapper. Real-org bug: hovering just right of the
 * object label hit a DIV and lost the records-entity-label tag hint (lesson #38).
 */
function descendToTextOwner(start: Element, text: string): Element {
  const normalized = text.replace(/\s+/g, " ").trim();
  let current = start;
  let guard = 0;
  while (guard++ < 15) {
    const owner = Array.from(current.children).find(
      (child) => (child.textContent ?? "").replace(/\s+/g, " ").trim() === normalized
    );
    if (!owner) break;
    current = owner;
  }
  return current;
}

/**
 * True only when (x, y) actually falls on a rendered glyph of el's text, not merely
 * somewhere inside el's DOM box. `elementFromPoint` returns the innermost element at a
 * pixel regardless of whether that pixel is real ink or just padding/line-height/
 * block-level whitespace around short text inside a wide box — a large label, a
 * full-width table cell, a padded container — so without this check, hovering empty
 * space nowhere near the visible word still resolved it. `Range.getClientRects()`
 * gives the text's actual painted rects (can be multiple for wrapped/multi-line text),
 * which is the same mechanism `document.caretRangeFromPoint` relies on internally, just
 * exposed as a yes/no test instead of a caret position. A small tolerance absorbs
 * sub-pixel/antialiasing edge cases, not sloppy hit-testing.
 */
function isPointOverRenderedText(el: Element, x: number, y: number, tolerance = 2): boolean {
  const range = document.createRange();
  range.selectNodeContents(el);
  const rects = range.getClientRects();
  for (const rect of rects) {
    if (
      x >= rect.left - tolerance &&
      x <= rect.right + tolerance &&
      y >= rect.top - tolerance &&
      y <= rect.bottom + tolerance
    ) {
      return true;
    }
  }
  return false;
}

export function resolveHoverTarget(x: number, y: number): HoverTarget | null {
  let el = deepElementFromPoint(x, y);
  if (!el) return null;

  const text = extractOwnText(el);
  if (!text) return null;

  // Only when the wrapper fallback produced the text (no direct text of its own).
  if (!extractDirectText(el)) el = descendToTextOwner(el, text);

  // Reject a match whose DOM box happens to cover (x, y) but whose actual rendered
  // text doesn't — e.g. hovering the blank right-hand portion of a full-width label.
  if (!isPointOverRenderedText(el, x, y)) return null;

  const targetSelectionName = findAttributeUpwards(
    el,
    "data-target-selection-name"
  );

  return {
    text,
    hints: {
      targetSelectionName,
      pageObjectApiName: guessObjectApiNameFromUrl(),
      elementTagName: el.tagName,
      fieldContext: resolveFieldContext(el),
      surfaceContext: resolveSurfaceContext(el),
    },
  };
}
