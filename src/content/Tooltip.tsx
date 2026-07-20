import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isEditableLabelType, type LabelEntry, type SaveTranslationResponse } from "../shared/types";
import { TYPE_COLORS, copySoql, copyXmlMember, displayApiName, langAccent, setupPath, typeLabel } from "./tooltip-constants";

interface TooltipProps {
  text: string;
  x: number;
  y: number;
  /** Always 0 or 1 entries — see resolveText in index-builder.ts; this project never shows a "N possible origins" list. */
  candidates: LabelEntry[];
  activeLanguages: string[];
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

/** Small labeled variant for secondary copy actions (Copy SOQL, Copy XML Member) — lighter weight than CopyButton, more identifiable than an icon alone since there's no obvious single glyph for "SOQL" or "XML member". */
function CopySmallButton({ value, label, title }: { value: string; label: string; title: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="sti-copy-small-btn"
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
      {copied ? "✓" : label}
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
  onSaveTranslation,
  onEditingActiveChange,
  autoEditLanguage,
  editTrigger,
}: {
  entry: LabelEntry;
  activeLanguages: string[];
  onSaveTranslation?: TooltipProps["onSaveTranslation"];
  onEditingActiveChange?: TooltipProps["onEditingActiveChange"];
  autoEditLanguage?: string;
  editTrigger?: number;
}) {
  const colors = TYPE_COLORS[entry.type];
  const editable = isEditableLabelType(entry.type);
  const setupHref = setupPath(entry);
  const soql = copySoql(entry);
  const xmlMember = copyXmlMember(entry);

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

  // Non-editable types keep the original behavior exactly: only languages that
  // already have a recorded value show up as a row (PHASE 4's deliberate "no
  // per-row missing-translation clutter" decision — see Translation Health instead).
  // Editable types show every ACTIVE language, including ones with no value yet,
  // because for them a "missing" row is no longer just a warning — it's something
  // the user can act on directly, one click away.
  const langCodes =
    editable && activeLanguages.length > 0
      ? activeLanguages
      : Object.keys(valuesByLang).filter((lang) => activeLanguages.length === 0 || activeLanguages.includes(lang));

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
        {soql && <CopySmallButton value={soql} label="SOQL" title="Copy a SELECT for this metadata row" />}
        {xmlMember && <CopySmallButton value={xmlMember} label="XML" title="Copy a package.xml <types> block for this component" />}
      </div>
      {conflictNotice && <div className="sti-conflict-notice">{conflictNotice}</div>}
      {langCodes.length > 0 ? (
        <ul className="sti-tooltip__translations">
          {langCodes.map((lang) => {
            const value = valuesByLang[lang] ?? "";
            const isCustomized = entry.customizedLanguages?.includes(lang);
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
                    <span className={`sti-lang-value${value ? "" : " sti-lang-value--empty"}`}>
                      {value || "—"}
                      {isCustomized && (
                        <span className="sti-customized-mark" title="Customized (Translation Workbench / Rename Tabs and Labels)">
                          ✎
                        </span>
                      )}
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

export function Tooltip({ text, x, y, candidates, activeLanguages, onSaveTranslation, onEditingActiveChange, onRectChange, autoEditLanguage, editTrigger }: TooltipProps) {
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
          onSaveTranslation={onSaveTranslation}
          onEditingActiveChange={onEditingActiveChange}
          autoEditLanguage={autoEditLanguage}
          editTrigger={editTrigger}
        />
      ))}
    </div>
  );
}
