# NoteMaxx

A minimal, Notion-style notetaking app for forward-deployed engineers. Local-first: all pages live in the browser's localStorage — no accounts, no backend.

## Run it

```bash
npm install
npm run dev
```

Opens on http://localhost:5190.

## Desktop app

`~/Desktop/NoteMaxx.app` is a native macOS shell (Swift + WKWebView, source in `macos/`) — its own window, Dock icon, menu bar (⌘C/V/Z, ⌘R reload, ⌘W/⌘Q), and native dialogs. On launch:

- If something is already serving port 5190 (e.g. `npm run dev`), it shows that — the live dev version, HMR included.
- Otherwise it starts a tiny static server for the production build staged in `~/Library/Application Support/NoteMaxx` (Desktop is TCC-protected, so the server can't run from the project folder). The server stops when the app quits.

After changing the web code, refresh what the app serves:

```bash
npm run deploy:app
```

After changing the native shell (`macos/main.swift`), rebuild the bundle:

```bash
npm run build:mac
```

Note: the native app's WKWebView has its own localStorage, separate from any browser — notes created in a browser tab won't appear in the app, and vice versa.

## Features (MVP)

- **Block editor** — type `/` in any empty block for headings, to-dos, bulleted/numbered lists, code, quotes, callouts, dividers
- **Markdown shortcuts** — `# `, `## `, `### `, `- `, `1. `, `[] `, `> `, ` ``` `, `---`
- **Keyboard-native** — Enter splits blocks, Backspace at start merges/demotes, arrows move between blocks
- **FDE templates** — customer meeting, deployment runbook, incident log, discovery notes (offered on every fresh page)
- **Pages sidebar** — pin, delete, full-text search across titles and content
- **Quick switcher** — ⌘K (or ⌘P) to jump to any page by title or content, or create a page from the query
- **Block reordering** — drag the ⋮⋮ handle in the left gutter, or ⌘⇧↑ / ⌘⇧↓ to move the current block
- **Multi-block selection** — drag across blocks (or shift-click, or ⌘A twice) to select whole blocks; ⌘C copies them as Markdown, Backspace deletes them, Escape clears
- **Duplicate page** — hover a page in the sidebar and hit the copy icon; full deep copy, independently editable
- **Copy as Markdown** — topbar button copies the whole page as Markdown (headings, lists, `- [ ]` to-dos, code fences)
- **Autosave** — debounced to localStorage, ~250ms after last keystroke

## Iteration ideas

- Tags / customer field on pages, filterable in sidebar
- Optional sync backend (Supabase) for multi-device
