# Salesforce Translation Inspector

Chrome/Edge extension (Manifest V3): hover over any text in Salesforce Lightning to see
what metadata it comes from (Custom Label, field, object, tab, picklist value,
button...) and its translations in every configured language — editable in place for
Custom Labels, with optimistic concurrency so concurrent edits are never silently
overwritten.

**For architecture, product vision, decision history, and the development workflow,
see [`CLAUDE.md`](CLAUDE.md) and `docs/` — that's the source of truth this project is
built and maintained against, human or AI.** This file only covers running it locally.

## Install dependencies

```bash
npm install
```

## Develop (hot reload)

```bash
npm run dev
```

Then in `chrome://extensions`:
1. Enable "Developer mode".
2. "Load unpacked" → select the `dist/` folder Vite generates.
3. CRXJS keeps the extension in sync while `npm run dev` is running.

## Build for production

```bash
npm run build
```

Generates `dist/`, ready to load unpacked or zip for the Chrome Web Store.

## Unit tests

```bash
npm run test
```

Covers the reverse-index/disambiguation funnel (`resolveText`) and the Metadata API
zip/XML parsing — neither depends on Chrome or a real Salesforce session.

## Trying it against a real org

1. In the target org: **Setup → Session Settings → disable "Lock sessions to the domain
   in which they were first used."** (required — see `docs/ARCHITECTURE.md`.)
2. Load the extension (see above), open the popup, enable inspection.
3. Navigate to a Lightning record page and hover over any label/field/button.

See `docs/CURRENT_STATE.md` for what's currently verified against a real org vs. only
build/typecheck/test-verified.
