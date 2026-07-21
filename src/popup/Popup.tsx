import { useEffect, useState } from "react";
import { langAccent } from "../content/tooltip-constants";
import { DEFAULT_HOLD_HOTKEY, DEFAULT_INSPECTOR_HOTKEY, DEFAULT_TM_HOTKEY, type Settings, type TmPreset } from "../shared/types";

// NOTE: no flag emoji anywhere — Chrome on Windows renders 🇪🇸 as the letters
// "ES". The language marker is the same colored dot used by the tooltip and
// Translation Mode.
const ALL_LANGUAGES: { code: string; label: string }[] = [
  { code: "es", label: "Spanish" },
  { code: "en_US", label: "English" },
  { code: "fr", label: "French" },
  { code: "nl_NL", label: "Dutch" },
];

function LangDot({ code }: { code: string }) {
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        display: "inline-block",
        flex: "none",
        background: langAccent(code),
      }}
    />
  );
}

const MODIFIER_KEYS = new Set(["Alt", "Control", "Shift", "Meta"]);

/**
 * Click → "Press a key…" → records the next keystroke. `bareKey` mode captures a
 * single key (modifiers included — for hold-to-inspect); combo mode requires a
 * non-modifier key and prefixes the held modifiers (for toggles). Esc cancels.
 */
function HotkeyRecorder({
  value,
  bareKey,
  onChange,
}: {
  value: string | null;
  bareKey: boolean;
  onChange: (next: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      onKeyDown={(e) => {
        if (!recording) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") { setRecording(false); return; }
        if (bareKey) {
          onChange(e.key === "Control" ? "Ctrl" : e.key);
          setRecording(false);
          return;
        }
        if (MODIFIER_KEYS.has(e.key)) return; // keep holding, waiting for the real key
        const combo =
          (e.ctrlKey ? "Ctrl+" : "") +
          (e.altKey ? "Alt+" : "") +
          (e.shiftKey ? "Shift+" : "") +
          (e.key.length === 1 ? e.key.toUpperCase() : e.key);
        onChange(combo);
        setRecording(false);
      }}
      style={{
        fontFamily: "inherit",
        fontSize: 11,
        fontWeight: 600,
        color: recording ? "#a06400" : "#1a56db",
        background: recording ? "#fdf3e3" : "#eef3fd",
        border: "1px solid " + (recording ? "#f0d8a8" : "#d8e4fb"),
        borderRadius: 4,
        padding: "3px 8px",
        cursor: "pointer",
        minWidth: 70,
      }}
    >
      {recording ? "Press a key…" : value ?? "Always on"}
    </button>
  );
}

const TM_PRESETS: { value: TmPreset; label: string; hint: string }[] = [
  { value: "stacked", label: "Under the label", hint: "Translations on their own line below each label" },
  { value: "subtle", label: "Subtle pills", hint: "Neutral gray chips, blends with Salesforce" },
  { value: "tinted", label: "Tinted pills", hint: "A soft pastel tone per language" },
  { value: "plain", label: "Plain text", hint: "No chips — quiet inline text" },
];

export function Popup() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showTmSettings, setShowTmSettings] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response: Settings) => {
      setSettings(response);
    });
  }, []);

  function toggleLanguage(code: string) {
    if (!settings) return;
    const active = settings.activeLanguages.includes(code)
      ? settings.activeLanguages.filter((l) => l !== code)
      : [...settings.activeLanguages, code];
    const next = { ...settings, activeLanguages: active };
    setSettings(next);
    chrome.storage.local.set({ settings: next });
  }

  function toggleEnabled() {
    if (!settings) return;
    const next = { ...settings, enabled: !settings.enabled };
    setSettings(next);
    chrome.storage.local.set({ settings: next });
  }

  function toggleSimpleMode() {
    if (!settings) return;
    const next = { ...settings, simpleMode: !settings.simpleMode };
    setSettings(next);
    chrome.storage.local.set({ settings: next });
  }

  function toggleTranslationMode() {
    if (!settings) return;
    const next = { ...settings, translationModeEnabled: !settings.translationModeEnabled };
    setSettings(next);
    chrome.storage.local.set({ settings: next });
  }

  function updateTmSetting(patch: Partial<Settings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    chrome.storage.local.set({ settings: next });
  }

  function refreshIndex() {
    setRefreshing(true);
    // The actual fetch happens in the Salesforce tab's content script
    // (page context). We just ask it to reload.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id !== undefined) {
        chrome.tabs.sendMessage(tab.id, { type: "REQUEST_REFETCH" });
      }
      // Give the content script a moment to query and the background to
      // update lastIndexRefresh, then refresh the popup view.
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response: Settings) => {
          setSettings(response);
          setRefreshing(false);
        });
      }, 1200);
    });
  }

  if (!settings) {
    return <div style={{ padding: 16 }}>Loading…</div>;
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>
        Translation Inspector
      </h1>

      <button
        onClick={toggleEnabled}
        style={{
          width: "100%",
          padding: "10px 0",
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 6,
          border: "none",
          marginBottom: 14,
          cursor: "pointer",
          background: settings.enabled ? "#1a7f4e" : "#e5e5e5",
          color: settings.enabled ? "#fff" : "#444",
        }}
      >
        {settings.enabled ? "✔ Inspection enabled" : "Enable inspection"}
      </button>
      <div style={{ fontSize: 11, color: "#706e6b", marginBottom: 14, marginTop: -8 }}>
        {settings.enabled
          ? settings.inspectorHotkey
            ? `Press ${settings.inspectorHotkey} to pin a tooltip on whatever's under the cursor — it stays put, even as you move the mouse. ${
                settings.holdHotkey ? `Hold ${settings.holdHotkey} to move it elsewhere. ` : ""
              }Esc, click outside, or press ${settings.inspectorHotkey} again to close it.`
            : "Hover over any text on the page to see its origin."
          : "Enable it, then hover over any text on the page."}
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          padding: "6px 8px",
          marginBottom: 14,
          borderRadius: 6,
          background: "#fafaf9",
          border: "1px solid #e5e5e5",
          cursor: "pointer",
        }}
        title="Advanced types (buttons, quick actions, tabs, apps, record types, layout sections) stay fully built — this just keeps them out of the way until you need them."
      >
        <input type="checkbox" checked={settings.simpleMode} onChange={toggleSimpleMode} />
        <span>
          <strong>Simple mode</strong>
          <span style={{ color: "#706e6b" }}> — only objects, fields, picklists &amp; labels</span>
        </span>
      </label>

      <button
        onClick={toggleTranslationMode}
        style={{
          width: "100%",
          padding: "10px 0",
          fontSize: 13,
          fontWeight: 600,
          borderRadius: 6,
          border: "none",
          marginBottom: 14,
          cursor: "pointer",
          background: settings.translationModeEnabled ? "#7c3aed" : "#e5e5e5",
          color: settings.translationModeEnabled ? "#fff" : "#444",
        }}
      >
        {settings.translationModeEnabled ? "✔ Translation Mode on" : "Turn on Translation Mode"}
      </button>
      <div style={{ fontSize: 11, color: "#706e6b", marginBottom: 6, marginTop: -8 }}>
        Annotates every matching field/label on screen at once, for all active languages below — instead of relying on hover. Pauses the hover tooltip while on.
      </div>

      <button
        onClick={() => setShowTmSettings(!showTmSettings)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          marginBottom: showTmSettings ? 6 : 14,
          fontSize: 11,
          color: "#1a56db",
          cursor: "pointer",
        }}
      >
        {showTmSettings ? "▾ Display settings" : "▸ Display settings"}
      </button>

      {showTmSettings && (
        <div
          style={{
            border: "1px solid #e5e5e5",
            borderRadius: 6,
            padding: "8px 10px",
            marginBottom: 14,
            background: "#fafaf9",
          }}
        >
          <div style={{ fontSize: 10, textTransform: "uppercase", color: "#706e6b", marginBottom: 5 }}>
            Chip style
          </div>
          {TM_PRESETS.map(({ value, label, hint }) => (
            <label
              key={value}
              title={hint}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "2px 0", cursor: "pointer" }}
            >
              <input
                type="radio"
                name="tmPreset"
                checked={settings.tmPreset === value}
                onChange={() => updateTmSetting({ tmPreset: value })}
              />
              {label}
            </label>
          ))}
          <div style={{ borderTop: "1px solid #eee", margin: "6px 0" }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "2px 0", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.tmShowFlags}
              onChange={() => updateTmSetting({ tmShowFlags: !settings.tmShowFlags })}
            />
            Show language dots
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "2px 0", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={settings.tmShowLangCodes}
              onChange={() => updateTmSetting({ tmShowLangCodes: !settings.tmShowLangCodes })}
            />
            Show language codes
          </label>
        </div>
      )}

      <div style={{ fontSize: 11, textTransform: "uppercase", color: "#706e6b", marginBottom: 6 }}>
        Shortcuts
      </div>
      <div style={{ border: "1px solid #e5e5e5", borderRadius: 6, padding: "8px 10px", marginBottom: 14, background: "#fafaf9" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "2px 0" }}>
          <span style={{ fontSize: 12 }}>Toggle Inspection Mode</span>
          <span style={{ display: "flex", gap: 4 }}>
            <HotkeyRecorder
              value={settings.inspectorHotkey}
              bareKey
              onChange={(next) => updateTmSetting({ inspectorHotkey: next })}
            />
            {settings.inspectorHotkey && (
              <button
                type="button"
                title="Always Hover — inspector always active, no key or mode needed"
                onClick={() => updateTmSetting({ inspectorHotkey: null })}
                style={{ background: "none", border: "none", fontSize: 10, color: "#706e6b", cursor: "pointer", padding: 0 }}
              >
                Always
              </button>
            )}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 0 2px" }}>
          <span style={{ fontSize: 12 }} title="Hold this key to move the pinned tooltip to whatever's under the cursor while held — release to pin it there. Independent of Inspection Mode; works even while a tooltip is already open.">
            Hold to move tooltip
          </span>
          <span style={{ display: "flex", gap: 4 }}>
            <HotkeyRecorder
              value={settings.holdHotkey}
              bareKey
              onChange={(next) => updateTmSetting({ holdHotkey: next })}
            />
            {settings.holdHotkey && (
              <button
                type="button"
                title="Disable — the pinned tooltip can then only be closed (Esc/click outside), never moved"
                onClick={() => updateTmSetting({ holdHotkey: null })}
                style={{ background: "none", border: "none", fontSize: 10, color: "#706e6b", cursor: "pointer", padding: 0 }}
              >
                Off
              </button>
            )}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "4px 0 2px" }}>
          <span style={{ fontSize: 12 }}>Toggle Translate all</span>
          <HotkeyRecorder
            value={settings.tmHotkey}
            bareKey={false}
            onChange={(next) => updateTmSetting({ tmHotkey: next })}
          />
        </div>
        <button
          type="button"
          onClick={() =>
            updateTmSetting({
              inspectorHotkey: DEFAULT_INSPECTOR_HOTKEY,
              holdHotkey: DEFAULT_HOLD_HOTKEY,
              tmHotkey: DEFAULT_TM_HOTKEY,
            })
          }
          style={{ background: "none", border: "none", fontSize: 10, color: "#1a56db", cursor: "pointer", padding: "4px 0 0", display: "block" }}
        >
          Reset shortcuts to defaults
        </button>
      </div>

      <div style={{ fontSize: 11, textTransform: "uppercase", color: "#706e6b", marginBottom: 6 }}>
        Active languages
      </div>
      {ALL_LANGUAGES.map(({ code, label }) => (
        <label key={code} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 0" }}>
          <input
            type="checkbox"
            checked={settings.activeLanguages.includes(code)}
            onChange={() => toggleLanguage(code)}
          />
          <LangDot code={code} />
          {label}
        </label>
      ))}

      <button
        onClick={refreshIndex}
        disabled={refreshing}
        style={{
          marginTop: 14,
          width: "100%",
          padding: "6px 0",
          fontSize: 13,
          borderRadius: 4,
          border: "1px solid #d8dde6",
          background: refreshing ? "#f3f3f3" : "#fff",
          cursor: refreshing ? "default" : "pointer",
        }}
      >
        {refreshing ? "Refreshing…" : "Refresh index now"}
      </button>

      <div style={{ marginTop: 8, fontSize: 11, color: "#706e6b" }}>
        {settings.lastIndexRefresh
          ? `Last updated: ${new Date(settings.lastIndexRefresh).toLocaleTimeString()}`
          : "Index not built yet"}
      </div>

      <button
        onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("src/health/index.html") })}
        style={{
          marginTop: 10,
          width: "100%",
          padding: "6px 0",
          fontSize: 13,
          borderRadius: 4,
          border: "1px solid #d8dde6",
          background: "#fff",
          cursor: "pointer",
        }}
      >
        Open Translation Health
      </button>
    </div>
  );
}
