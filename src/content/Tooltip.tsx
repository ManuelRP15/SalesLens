import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BASE_LANGUAGE, isEditableEntry, type LabelEntry, type SaveTranslationResponse } from "../shared/types";
import { TYPE_COLORS, displayApiName, langAccent, setupPath, typeLabel } from "./tooltip-constants";

interface TooltipProps {
  text: string;
  x: number;
  y: number;
  /** Always 0 or 1 entries — see resolveText in index-builder.ts; this project never shows a "N possible origins" list. */
  candidates: LabelEntry[];
  activeLanguages: string[];
  /** Mark a value identical to the base-language value with a small "≈" hint — mirrors Translation Mode/Health's own signal (`Settings.flagIdenticalTranslations`), so the same soft warning reads consistently everywhere translations are shown. Defaults to on (matches the setting's own default) so callers that don't thread it through yet degrade to the common case rather than silently losing the signal. */
  flagIdentical?: boolean;
  onSaveTranslation?: (
    entry: LabelEntry,
    language: string,
    value: string,
    expectedValue: string
  ) => Promise<SaveTranslationResponse>;
  /** Fires whenever any row's inline editor opens/closes, so the host page can pin the tooltip open while the user is typing. */
  onEditingActiveChange?: (active: boolean) => void;
  /**
   * Fires with the tooltip's current on-screen rect whenever it (re)settles — after the
   * initial clamp/flip and after any resize (e.g. switching to the taller inline
   * editor). `null` on unmount. The host page uses this as a hover-ownership zone: while
   * the cursor is within the rect (plus a margin), it never retargets to whatever
   * element is technically underneath — the tooltip behaves as one solid destination
   * instead of losing to a nearby element on the way to it.
   */
  onRectChange?: (rect: DOMRect | null) => void;
  /**
   * When set, the matching language row opens directly in edit mode on mount instead
   * of requiring a click on its "Edit" icon first — used when this Tooltip instance was
   * summoned by clicking an editable Translation Mode chip rather than by hovering (the
   * click already expressed clear intent to edit that exact language).
   */
  autoEditLanguage?: string;
  /**
   * A monotonically increasing counter — each new value (vs. the one seen on the
   * previous render) is a one-shot "open the editor now" request from a keyboard
   * shortcut (PHASE 17: Enter while Inspection Mode is on and a tooltip is showing).
   * A counter rather than a boolean because the tooltip can stay mounted with the
   * same candidate across repeated presses; a boolean flip back to `false` wouldn't
   * produce a second edge to react to. No-ops if already editing or the candidate
   * isn't editable — same silent-no-op philosophy as every other guard in this file.
   */
  editTrigger?: number;
  /**
   * Same counter pattern as `editTrigger`, opposite direction: each new value is a
   * one-shot "cancel whatever's being edited right now" request — Escape or an
   * outside click while an edit is in progress (content/index.tsx). Before this
   * existed, Escape/outside-click were fully inert while editing (by design, to
   * protect a mid-keystroke textarea from being ripped out) and ONLY the row's own
   * Cancel button worked — confusing, since normal UI convention is that Escape/
   * click-outside always let you back out. A counter (not a boolean) for the same
   * reason as `editTrigger`: repeated presses need repeated edges to react to. No-op
   * if nothing is currently being edited.
   */
  cancelTrigger?: number;
}

/** Copies to the clipboard, falling back to a hidden textarea if the Clipboard API is unavailable/blocked. */
async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}

function CopyButton({ value, title = "Copy API Name" }: { value: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="sti-copy-btn"
      title={title}
      onClick={async () => {
        const ok = await copyToClipboard(value);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }
      }}
    >
      {copied ? "✓ Copied" : "Copy"}
    </button>
  );
}

/** Compact icon-only variant for inline use next to a translation value, where a full "Copy" label would crowd the row. */
function CopyIconButton({ value, title }: { value: string; title: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="sti-copy-icon-btn"
      title={title}
      aria-label={title}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copyToClipboard(value);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }
      }}
    >
      {copied ? "✓" : "⧉"}
    </button>
  );
}

type EditStatus = "idle" | "saving" | "error";

function editLabel(lang: string, currentValue: string): string {
  return currentValue ? `Edit ${lang} translation` : `Add ${lang} translation`;
}

interface TranslationEditorProps {
  initialValue: string;
  status: EditStatus;
  errorMessage?: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  /** "Saving…" (Custom Labels, a near-instant Tooling API PATCH) or "Deploying…" (PHASE 6b's other 8 types, a slower retrieve-then-deploy() round trip) — sets user expectations correctly, since the latter can take several seconds. */
  savingLabel: string;
}

/**
 * The inline editor a language row swaps to on "Edit". Save fires on the Save
 * button, Enter (without Shift), Ctrl/Cmd+S, or losing focus with a changed value —
 * whichever the user reaches for first. Escape and losing focus with an UNCHANGED
 * value both cancel without a network call. The Save/Cancel buttons use onMouseDown
 * preventDefault so clicking them doesn't blur the textarea first and race the
 * blur-triggered commit against the button's own click handler.
 */
function TranslationEditor({ initialValue, status, errorMessage, onSave, onCancel, savingLabel }: TranslationEditorProps) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saving = status === "saving";

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.focus();
    node.select();
  }, []);

  // Auto-grow with content instead of scrolling inside a fixed-height box —
  // Custom Label values are short in the common case but not length-limited.
  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  function commit() {
    if (saving) return;
    if (value === initialValue) {
      onCancel();
      return;
    }
    onSave(value);
  }

  return (
    <div className="sti-edit-wrap">
      <textarea
        ref={textareaRef}
        className="sti-edit-input"
        rows={1}
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            commit();
          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            commit();
          }
        }}
      />
      <div className="sti-edit-actions">
        <button
          type="button"
          className="sti-edit-save"
          disabled={saving}
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
        >
          {saving ? savingLabel : "Save"}
        </button>
        <button
          type="button"
          className="sti-edit-cancel"
          disabled={saving}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancel}
        >
          Cancel
        </button>
        {status === "error" && <span className="sti-edit-error">{errorMessage}</span>}
      </div>
    </div>
  );
}

function CandidateBlock({
  entry,
  activeLanguages,
  flagIdentical = true,
  onSaveTranslation,
  onEditingActiveChange,
  autoEditLanguage,
  editTrigger,
  cancelTrigger,
}: {
  entry: LabelEntry;
  activeLanguages: string[];
  flagIdentical?: boolean;
  onSaveTranslation?: TooltipProps["onSaveTranslation"];
  onEditingActiveChange?: TooltipProps["onEditingActiveChange"];
  autoEditLanguage?: string;
  editTrigger?: number;
  cancelTrigger?: number;
}) {
  const colors = TYPE_COLORS[entry.type];
  const editable = isEditableEntry(entry);
  const setupHref = setupPath(entry);

  // Edits land here first so this specific tooltip instance reflects them
  // immediately; the background's own index is already the source of truth for
  // every future hover/scan by the time onSaveTranslation resolves.
  const [localValues, setLocalValues] = useState<Record<string, string> | null>(null);
  const valuesByLang = localValues ?? entry.valuesByLang;

  // `autoEditLanguage` seeds editingLang/editingBaseline directly in these
  // initializers (not via a separate mount effect that called startEdit — see
  // DECISIONS.md #50 for why that was a real bug, not just a style choice): the
  // very FIRST render must already report "editing" via the effect right below,
  // or a Translation-Mode-summoned editor gets torn down before it ever shows.
  const [editingLang, setEditingLang] = useState<string | null>(autoEditLanguage ?? null);
  const [editStatus, setEditStatus] = useState<EditStatus>("idle");
  const [editError, setEditError] = useState<string | undefined>(undefined);
  // The value shown when editing started — the optimistic-concurrency baseline sent
  // to the background, distinct from `value` (what the user has typed since).
  const [editingBaseline, setEditingBaseline] = useState<string>(
    autoEditLanguage ? entry.valuesByLang[autoEditLanguage] ?? "" : ""
  );
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);

  // Deliberately keyed on editingLang alone: onEditingActiveChange is a stable
  // closure for the lifetime of this rendered tooltip (index.tsx only creates a new
  // one per hover/inspect event, not on CandidateBlock's own local re-renders).
  // The cleanup function is what makes this safe: without it, a CandidateBlock that
  // unmounts WHILE editingLang is still set (e.g. some future code path replaces the
  // tooltip without going through cancelEdit first) would leave the content script's
  // module-level `isEditingActive` flag stuck `true` forever, permanently blocking
  // clearTooltip() — a real "stuck tooltip" class of bug, not a hypothetical one.
  //
  // This effect ALSO reports "not editing" (`false`) on every unmount/mode-change
  // where editingLang is null — which content/index.tsx's `reconcileAfterEdit`
  // treats as "the engine isn't live, tear the tooltip down" whenever Translation
  // Mode is on (its hover engine is never "live" by design). That's exactly why
  // editingLang must ALREADY be non-null on this component's very first render
  // when `autoEditLanguage` is set, rather than becoming non-null a render later —
  // see the useState initializers above.
  useEffect(() => {
    onEditingActiveChange?.(editingLang !== null);
    return () => onEditingActiveChange?.(false);
  }, [editingLang, onEditingActiveChange]);

  // Every active language gets a row, present or not (Quick Compare, DECISIONS.md
  // #59) — PHASE 4's original "only show languages that already have a value"
  // behavior for non-editable types silently hid the exact gap Translation Health
  // and Translation Mode's own "missing" chips (#58) now surface elsewhere, which
  // made the hover tooltip — the PRIMARY inspection surface — the one place still
  // pretending nothing was missing. Editable types already showed every active
  // language (a missing one is directly actionable, one click away); non-editable
  // ones now do too, just without an edit affordance on the empty ones.
  const langCodes = activeLanguages.length > 0 ? activeLanguages : Object.keys(valuesByLang);
  const baseValue = valuesByLang[BASE_LANGUAGE];

  function startEdit(lang: string) {
    if (editStatus === "saving") return;
    setEditingLang(lang);
    setEditingBaseline(valuesByLang[lang] ?? "");
    setEditStatus("idle");
    setEditError(undefined);
  }

  // PHASE 17 keyboard shortcut (Enter while inspecting): opens the FIRST row in
  // display order, not a "smartest guess" — predictable beats clever for a shortcut
  // the user will invoke without looking. No-ops (by construction, not by an extra
  // check) if there's no row to open, an edit is already in progress, or the type
  // isn't editable at all — `editable` gates `langCodes` itself for non-editable
  // types via the surrounding component, and `startEdit` is simply never reached.
  const editTriggerSeenRef = useRef(editTrigger);
  useEffect(() => {
    if (editTrigger === undefined || editTrigger === editTriggerSeenRef.current) return;
    editTriggerSeenRef.current = editTrigger;
    if (editingLang !== null || !editable) return;
    const firstLang = langCodes[0];
    if (firstLang) startEdit(firstLang);
  }, [editTrigger]);

  // Escape / outside-click cancel request (content/index.tsx) — see cancelTrigger's
  // doc comment above for why this exists. No-op if nothing is being edited.
  const cancelTriggerSeenRef = useRef(cancelTrigger);
  useEffect(() => {
    if (cancelTrigger === undefined || cancelTrigger === cancelTriggerSeenRef.current) return;
    cancelTriggerSeenRef.current = cancelTrigger;
    if (editingLang === null) return;
    cancelEdit();
  }, [cancelTrigger]);

  function cancelEdit() {
    setEditingLang(null);
    setEditStatus("idle");
    setEditError(undefined);
  }

  async function saveEdit(lang: string, value: string) {
    if (!onSaveTranslation) return;
    setEditStatus("saving");
    const response = await onSaveTranslation(entry, lang, value, editingBaseline);

    if (response.conflict) {
      // Someone else changed this language while the editor was open — the write
      // never happened. Adopt the real current value (background already read it
      // live) and drop back to view mode instead of overwriting it; a transient
      // banner explains why the edit didn't take, same pattern as the Copy buttons'
      // "✓ Copied" flash elsewhere in this file.
      setLocalValues({ ...valuesByLang, [lang]: response.currentValue ?? "" });
      setEditingLang(null);
      setEditStatus("idle");
      setEditError(undefined);
      setConflictNotice(`${lang} was changed by someone else — updated to their value instead of overwriting it.`);
      setTimeout(() => setConflictNotice(null), 6000);
      return;
    }

    if (response.ok) {
      setLocalValues({ ...valuesByLang, [lang]: value });
      setEditingLang(null);
      setEditStatus("idle");
      setEditError(undefined);
    } else {
      setEditStatus("error");
      setEditError(response.error ?? "Save failed.");
    }
  }

  return (
    <div className="sti-candidate" style={{ borderLeftColor: colors.color }}>
      <div className="sti-candidate__header">
        <span
          className="sti-badge"
          style={{
            background: colors.bg,
            color: colors.color,
            cursor: setupHref ? "pointer" : undefined,
            pointerEvents: setupHref ? "auto" : undefined,
          }}
          title={setupHref ? "Open in Setup" : undefined}
          onClick={
            setupHref
              ? (e) => {
                  e.stopPropagation();
                  window.open(`${window.location.origin}${setupHref}`, "_blank", "noopener");
                }
              : undefined
          }
        >
          {typeLabel(entry)}
          {setupHref && <span className="sti-badge__setup-hint"> ↗</span>}
        </span>
        {entry.dataType && <span className="sti-field-type">{entry.dataType}</span>}
        <code className="sti-tooltip__apiname" title={entry.apiName}>{displayApiName(entry)}</code>
        <CopyButton value={entry.apiName} />
      </div>
      {conflictNotice && <div className="sti-conflict-notice">{conflictNotice}</div>}
      {langCodes.length > 0 ? (
        <ul className="sti-tooltip__translations">
          {langCodes.map((lang) => {
            const value = valuesByLang[lang] ?? "";
            const missing = !value;
            // A value that matches the base language is only worth flagging for a
            // language that ISN'T the base itself, and only once there's an actual
            // base value to compare against (some entries have none in the active
            // set at all) — same computation Translation Mode/Health already apply.
            const identical =
              flagIdentical && !missing && lang !== BASE_LANGUAGE && baseValue !== undefined && value === baseValue;
            const isEditingThis = editingLang === lang;
            return (
              <li key={lang}>
                <span className="sti-lang-dot" style={{ background: langAccent(lang) }} />
                <span className="sti-lang-code">{lang}</span>
                {isEditingThis ? (
                  <TranslationEditor
                    initialValue={value}
                    status={editStatus}
                    errorMessage={editError}
                    onSave={(v) => saveEdit(lang, v)}
                    onCancel={cancelEdit}
                    savingLabel={entry.type === "CustomLabel" ? "Saving…" : "Deploying…"}
                  />
                ) : (
                  <>
                    <span
                      className={`sti-lang-value${missing ? " sti-lang-value--empty" : ""}`}
                      title={identical ? "Identical to the source language — might not be translated" : undefined}
                    >
                      {missing ? (editable ? "—" : "Not translated") : value}
                      {identical && <span className="sti-identical-mark">≈</span>}
                    </span>
                    <span className="sti-lang-actions">
                      {value && <CopyIconButton value={value} title={`Copy ${lang} value`} />}
                      {editable && (
                        <button
                          type="button"
                          className="sti-copy-icon-btn"
                          title={editLabel(lang, value)}
                          aria-label={editLabel(lang, value)}
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(lang);
                          }}
                        >
                          ✏
                        </button>
                      )}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="sti-tooltip__unknown">No translation for the selected languages</div>
      )}
    </div>
  );
}

export function Tooltip({ text, x, y, candidates, activeLanguages, flagIdentical, onSaveTranslation, onEditingActiveChange, onRectChange, autoEditLanguage, editTrigger, cancelTrigger }: TooltipProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: x + 12, top: y + 16 });

  // Keep the tooltip fully on screen: measure the rendered box and clamp
  // horizontally; if it would overflow the bottom, flip it above the cursor.
  // The guarded setPos (only when values change) prevents a re-render loop.
  // Also reports the settled rect on every measurement (position changes AND size
  // changes, e.g. opening the inline editor) — see onRectChange's doc comment.
  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const margin = 8;
    let left = x + 12;
    let top = y + 16;
    if (left + rect.width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = Math.max(margin, y - rect.height - 12);
    }
    setPos((prev) => (prev.left === left && prev.top === top ? prev : { left, top }));
    onRectChange?.(rect);
  });

  useEffect(() => () => onRectChange?.(null), [onRectChange]);

  return (
    <div ref={rootRef} className="sti-tooltip" style={{ left: pos.left, top: pos.top }} role="tooltip">
      <div className="sti-tooltip__title">
        <span>{text}</span>
        <CopyIconButton value={text} title="Copy displayed text" />
      </div>

      {candidates.map((entry) => (
        <CandidateBlock
          key={entry.apiName + entry.type}
          entry={entry}
          activeLanguages={activeLanguages}
          flagIdentical={flagIdentical}
          onSaveTranslation={onSaveTranslation}
          onEditingActiveChange={onEditingActiveChange}
          autoEditLanguage={autoEditLanguage}
          editTrigger={editTrigger}
          cancelTrigger={cancelTrigger}
        />
      ))}
    </div>
  );
}
