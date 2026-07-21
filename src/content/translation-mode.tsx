import { collectTranslatableTargets, TRANSLATION_MODE_BADGE_ATTR } from "./dom-utils";
import { langAccent, langHue } from "./tooltip-constants";
import {
  BASE_LANGUAGE as BASE_LANG,
  isEditableEntry,
  type ContextHints,
  type LabelEntry,
  type ResolveTextsBulkResponse,
  type TmPreset,
} from "../shared/types";

/** Fired when the user clicks an editable chip — content/index.tsx opens the same editor the hover tooltip uses, anchored at (x, y). */
export type TmEditRequestHandler = (entry: LabelEntry, language: string, x: number, y: number) => void;

/** One overall status per on-page entry, in priority order — missing is strictly more actionable than identical, so an entry missing in one active language and identical in another still counts as "missing" for filtering purposes (ROADMAP.md PHASE 18, DECISIONS.md #60). */
export type AuditStatus = "missing" | "identical" | "complete";

/**
 * One de-duplicated logical translation entry currently ON THE PAGE, for the
 * Translate All audit panel (PHASE 18) — distinct from `BadgeTranslation` above,
 * which is per-(element, language) for badge rendering. `element` is the FIRST
 * DOM occurrence encountered during the scan (the same entry can legitimately
 * render more than once on a page, e.g. a field shown on both a detail panel and a
 * related list — only the first is ever the guided-navigation target, a deliberate
 * simplification, see ROADMAP.md PHASE 18's "Known Salesforce limitations").
 */
export interface AuditEntry {
  /** `apiName + type`, stable identity for de-duplication and for React list keys. */
  key: string;
  entry: LabelEntry;
  element: Element;
  missingLanguages: string[];
  identicalLanguages: string[];
  editable: boolean;
  status: AuditStatus;
}

export type AuditUpdateHandler = (entries: AuditEntry[]) => void;

// Short enough that opening a dropdown/menu annotates before the user closes it.
const RESCAN_DEBOUNCE_MS = 250;
// Elements that visually can't render appended children (or where doing so would be
// meaningless/disruptive) — skip inserting a badge into these even if they somehow
// report direct text.
const SKIP_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "OPTION", "IMG", "BR", "HR"]);

export interface TmStyle {
  preset: TmPreset;
  showFlags: boolean;
  showLangCodes: boolean;
  /** Mark chips whose value is byte-identical to the base-language value — see `Settings.flagIdenticalTranslations`. */
  flagIdentical: boolean;
}

const DEFAULT_TM_STYLE: TmStyle = { preset: "stacked", showFlags: true, showLangCodes: true, flagIdentical: true };

let isRunning = false;
let currentActiveLanguages: string[] = [];
let currentStyle: TmStyle = DEFAULT_TM_STYLE;
let currentOnEditRequest: TmEditRequestHandler | undefined;
let currentOnAuditUpdate: AuditUpdateHandler | undefined;
let mutationObserver: MutationObserver | undefined;
let rescanTimer: number | undefined;
let scanInFlight = false;
/** Element being annotated -> the badge span appended to it, so a rescan updates in place instead of duplicating. */
const injectedBadges = new Map<Element, HTMLSpanElement>();
/** Open shadow roots already attached to the CURRENT observer (mutations inside a shadow root don't bubble to document.body — lesson #39). Reset on every start, since each start creates a fresh observer. */
let observedShadowRoots = new WeakSet<ShadowRoot>();

interface BadgeTranslation {
  lang: string;
  value: string;
  /** No value at all for this active language — rendered as a distinct, dimmed placeholder instead of being silently omitted from the badge (PHASE 9 QA idea, ROADMAP.md). */
  missing?: boolean;
  /** Value is byte-identical to the base-language value — a possible "never actually translated" case, marked only when `TmStyle.flagIdentical` is on. */
  identical?: boolean;
}

const CHIP_BASE_CSS =
  "display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:0 7px;" +
  "font-size:10.5px;font-weight:400;line-height:16px;white-space:nowrap;box-sizing:border-box;";

// Every preset's chip MUST carry its own background: badges get injected into
// arbitrary Salesforce surfaces (blue buttons, colored headers...) and dark text
// with no background is invisible there (lesson #38). The near-white translucent
// background is imperceptible on white page areas but guarantees contrast on
// colored ones.
function chipCss(preset: TmPreset, lang: string): string {
  switch (preset) {
    case "tinted": {
      const h = langHue(lang);
      return (
        CHIP_BASE_CSS +
        `background:hsl(${h},70%,96%);border:1px solid hsl(${h},55%,86%);color:hsl(${h},45%,34%);`
      );
    }
    case "plain":
      return (
        "display:inline-flex;align-items:center;gap:4px;color:#706e6b;font-size:10.5px;font-weight:400;" +
        "white-space:nowrap;background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.05);" +
        "border-radius:6px;padding:0 5px;"
      );
    case "stacked":
      return (
        "display:inline-flex;align-items:center;gap:4px;color:#514f4d;font-size:10.5px;font-weight:400;" +
        "white-space:nowrap;background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.05);" +
        "border-radius:6px;padding:0 5px;"
      );
    case "subtle":
    default:
      return CHIP_BASE_CSS + "background:#f3f2f2;border:1px solid #e5e5e5;color:#514f4d;";
  }
}

/** Small colored dot marking the language — flags are emoji-unreliable on Windows (see tooltip-constants). */
function buildLangDot(lang: string): HTMLSpanElement {
  const dot = document.createElement("span");
  dot.style.cssText =
    `width:6px;height:6px;border-radius:50%;display:inline-block;flex:none;background:${langAccent(lang)};`;
  return dot;
}

/**
 * v3 badge design (lesson #33): quiet, SLDS-toned annotations that never compete
 * with the page. The default "stacked" preset places translations on their own
 * line UNDER the original label (the original product vision) instead of pushing
 * the layout sideways; "subtle"/"tinted" are inline pills; "plain" is inline
 * text. The previous purple rectangles were rejected in real-org testing.
 *
 * Editable entries (`isEditableEntry`, same rule as the hover tooltip) get a clickable
 * chip: a trailing "✏" plus a pointer cursor, opening the SAME edit UI the hover
 * tooltip uses (via onEditRequest → content/index.tsx's openTmEditor) rather than a
 * second, separately-built editing implementation living in raw DOM here. A "missing"
 * chip (no value at all for that language) is clickable too when editable — same
 * editor, just starting from an empty value.
 */
function buildBadge(entry: LabelEntry, translations: BadgeTranslation[], style: TmStyle): HTMLSpanElement {
  const editable = isEditableEntry(entry) && Boolean(currentOnEditRequest);
  const badge = document.createElement("span");
  badge.setAttribute(TRANSLATION_MODE_BADGE_ATTR, "true");
  const isStacked = style.preset === "stacked";
  // display:flex is block-level, so the "stacked" badge naturally starts on its
  // own line right under the original label — no width hacks needed.
  badge.style.cssText = isStacked
    ? "display:flex;flex-wrap:wrap;align-items:center;gap:2px 10px;margin-top:1px;line-height:1.5;" +
      "font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;" +
      "font-style:normal;font-weight:400;text-decoration:none;"
    : "display:inline-flex;flex-wrap:wrap;align-items:center;gap:4px;margin-left:6px;" +
      "vertical-align:baseline;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;" +
      "font-style:normal;font-weight:400;text-decoration:none;";

  translations.forEach(({ lang, value, missing, identical }, i) => {
    if (style.preset === "plain" && i > 0) {
      const sep = document.createElement("span");
      sep.textContent = "·";
      sep.style.cssText = "color:#c9c7c5;font-size:10.5px;";
      badge.appendChild(sep);
    }

    // A missing value is still clickable-to-edit when the type is editable (the
    // editor already handles an empty starting value — see Tooltip.tsx's
    // CandidateBlock, `entry.valuesByLang[lang] ?? ""`), so this doubles as the
    // "fill in a missing translation" entry point Translation Mode never had before.
    // Only a PRESENT value gets the pencil mark, though — an empty chip is already
    // visually an invitation to click, and a pencil next to "— missing —" read oddly.
    const clickable = editable;
    const chip = document.createElement("span");
    chip.style.cssText =
      chipCss(style.preset, lang) + (clickable ? "cursor:pointer;" : "") + (missing ? "opacity:.6;border-style:dashed;" : "");
    chip.title = missing
      ? editable
        ? `${lang} — no translation yet, click to add one`
        : `${lang} — no translation yet`
      : identical
        ? `${lang} — identical to the source language, might not be translated`
        : editable
          ? `${lang} — click to edit`
          : lang;

    if (style.showFlags) chip.appendChild(buildLangDot(lang));
    if (style.showLangCodes) {
      const code = document.createElement("span");
      code.textContent = lang;
      code.style.cssText = "font-size:9px;color:#a5a3a1;text-transform:uppercase;letter-spacing:.03em;flex:none;";
      chip.appendChild(code);
    }
    const text = document.createElement("span");
    text.textContent = missing ? "— missing —" : value;
    if (missing) text.style.cssText = "font-style:italic;";
    chip.appendChild(text);

    if (identical && !missing) {
      const warn = document.createElement("span");
      warn.textContent = "≈";
      warn.style.cssText = "color:#b8860b;font-size:10px;margin-left:1px;";
      chip.appendChild(warn);
    }

    if (clickable && !missing) {
      const pencil = document.createElement("span");
      pencil.textContent = "✏";
      pencil.style.cssText = "color:#1a56db;font-size:9px;margin-left:2px;opacity:.7;";
      chip.appendChild(pencil);
    }
    if (clickable) {
      // A chip is a real child of an arbitrary Salesforce element (a table cell, a
      // button, a link...) — without stopping propagation, a click here would ALSO
      // fire whatever the parent's own click behavior is (navigate, submit, toggle).
      chip.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        currentOnEditRequest?.(entry, lang, e.clientX, e.clientY);
      });
    }
    badge.appendChild(chip);
  });

  return badge;
}

function upsertBadge(element: Element, entry: LabelEntry, translations: BadgeTranslation[]) {
  const existing = injectedBadges.get(element);
  const fresh = buildBadge(entry, translations, currentStyle);
  if (existing && existing.isConnected) {
    existing.replaceWith(fresh);
  } else {
    element.appendChild(fresh);
  }
  injectedBadges.set(element, fresh);
}

function removeBadge(element: Element) {
  injectedBadges.get(element)?.remove();
  injectedBadges.delete(element);
}

function removeAllBadges() {
  for (const element of [...injectedBadges.keys()]) removeBadge(element);
}

function resolveTextsBulk(
  items: Array<{ text: string; hints: ContextHints }>
): Promise<ResolveTextsBulkResponse | undefined> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "RESOLVE_TEXTS_BULK", items },
      (response: ResolveTextsBulkResponse | undefined) => resolve(response)
    );
  });
}

function observeShadowRoot(shadowRoot: ShadowRoot) {
  if (!isRunning || !mutationObserver || observedShadowRoots.has(shadowRoot)) return;
  observedShadowRoots.add(shadowRoot);
  mutationObserver.observe(shadowRoot, { childList: true, subtree: true, characterData: true });
}

async function scan() {
  if (!isRunning || scanInFlight) return;
  scanInFlight = true;
  try {
    const targets = collectTranslatableTargets(document.body, observeShadowRoot).filter(
      (t) => !SKIP_TAGS.has(t.element.tagName)
    );
    const matchedElements = new Set<Element>();
    // Keyed by `apiName + type` — the audit panel (PHASE 18) needs ONE row per
    // logical entry, not one per DOM occurrence (the same field can legitimately
    // render twice on one page). First occurrence in scan order wins as the
    // navigation target; see AuditEntry's own doc comment.
    const auditByKey = new Map<string, AuditEntry>();

    if (targets.length > 0) {
      const response = await resolveTextsBulk(targets.map((t) => ({ text: t.text, hints: t.hints })));
      if (!isRunning) return;
      if (response) {
        response.results.forEach((result, i) => {
          if (result.candidates.length === 0) return;
          const entry = result.candidates[0];
          const element = targets[i].element;

          // Audit data is computed for EVERY resolved entry, regardless of whether
          // any active language has a value — unlike the badge-display gate below,
          // an entry with ZERO coverage in the user's chosen languages is exactly
          // the kind of gap the audit panel exists to surface, not noise to hide.
          const key = `${entry.apiName}::${entry.type}`;
          if (!auditByKey.has(key)) {
            const baseValue = entry.valuesByLang[BASE_LANG];
            const missingLanguages = currentActiveLanguages.filter((lang) => !entry.valuesByLang[lang]);
            const identicalLanguages = currentStyle.flagIdentical
              ? currentActiveLanguages.filter(
                  (lang) => lang !== BASE_LANG && baseValue !== undefined && entry.valuesByLang[lang] === baseValue
                )
              : [];
            auditByKey.set(key, {
              key,
              entry,
              element,
              missingLanguages,
              identicalLanguages,
              editable: isEditableEntry(entry),
              status: missingLanguages.length > 0 ? "missing" : identicalLanguages.length > 0 ? "identical" : "complete",
            });
          }

          // Skip the BADGE entirely if NONE of the active languages have anything —
          // avoids injecting an all-"missing" badge on elements the user's active
          // languages simply don't cover at all (still real noise for an inline page
          // annotation, unlike a partial gap on an otherwise-translated entry, which
          // the "missing" chip below now surfaces instead of silently dropping).
          const hasAnyValue = currentActiveLanguages.some((lang) => Boolean(entry.valuesByLang[lang]));
          if (!hasAnyValue) return;
          const baseValue = entry.valuesByLang[BASE_LANG];
          const translations: BadgeTranslation[] = currentActiveLanguages.map((lang) => {
            const value = entry.valuesByLang[lang];
            if (!value) return { lang, value: "", missing: true };
            const identical = currentStyle.flagIdentical && lang !== BASE_LANG && value === baseValue;
            return { lang, value, identical };
          });
          matchedElements.add(element);
          upsertBadge(element, entry, translations);
        });
      }
    }

    // Clean up badges for elements that no longer match (scrolled out, removed from
    // DOM, no longer resolve, or active languages changed and nothing's left to show).
    for (const element of [...injectedBadges.keys()]) {
      if (!matchedElements.has(element)) removeBadge(element);
    }

    currentOnAuditUpdate?.([...auditByKey.values()]);
  } finally {
    scanInFlight = false;
  }
}

function scheduleRescan() {
  window.clearTimeout(rescanTimer);
  rescanTimer = window.setTimeout(() => void scan(), RESCAN_DEBOUNCE_MS);
}

export function startTranslationMode(
  activeLanguages: string[],
  style?: TmStyle,
  onEditRequest?: TmEditRequestHandler,
  onAuditUpdate?: AuditUpdateHandler
): void {
  currentActiveLanguages = activeLanguages;
  currentStyle = style ?? DEFAULT_TM_STYLE;
  currentOnEditRequest = onEditRequest;
  currentOnAuditUpdate = onAuditUpdate;
  if (isRunning) {
    void scan();
    return;
  }
  isRunning = true;
  observedShadowRoots = new WeakSet<ShadowRoot>();

  // Lightning swaps visible content a lot (switching tabs within a record page,
  // lazy-loaded sections) without a full page navigation — re-scan when it does.
  // Mutations caused by our own badges are ignored so this can't loop on itself.
  mutationObserver = new MutationObserver((mutations) => {
    const relevant = mutations.some((m) =>
      ![...m.addedNodes, ...m.removedNodes].every(
        (n) => n instanceof Element && n.hasAttribute(TRANSLATION_MODE_BADGE_ATTR)
      )
    );
    if (relevant) scheduleRescan();
  });
  mutationObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  // Belt-and-braces for popovers rendered in shadow roots the scan hasn't
  // visited yet: any click (menu open, tab switch...) schedules a quick rescan.
  document.addEventListener("click", scheduleRescan, true);

  // First scan AFTER the observer exists, so every shadow root it discovers
  // gets attached to it (observeShadowRoot is a no-op without an observer).
  void scan();
}

export function stopTranslationMode(): void {
  if (!isRunning) return;
  isRunning = false;
  window.clearTimeout(rescanTimer);
  mutationObserver?.disconnect();
  mutationObserver = undefined;
  document.removeEventListener("click", scheduleRescan, true);
  removeAllBadges();
}
