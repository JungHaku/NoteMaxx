# NoteMaxx

A minimal, Notion-style notetaking app for forward-deployed engineers. Local-first: all pages live in the browser's localStorage — no accounts, no backend.

## Run it

```bash
npm install
npm run dev
```

Opens on http://localhost:5190.

## Desktop app

`~/Desktop/NoteMaxx.app` is a native macOS shell (Swift + WKWebView, source in `macos/`) — its own window, Dock icon, menu bar (⌘C/V/Z, ⌘R reload, ⌘W/⌘Q), and native dialogs.

It is fully self-contained: the production build is copied into the bundle at `Contents/Resources/app`, and a `WKURLSchemeHandler` serves it over `notemaxx://app/`. No Node, no localhost port, nothing outside the bundle — so the `.app` can be zipped and handed to someone else. (A custom scheme rather than `file://` is what keeps localStorage working; `file://` pages get an opaque origin and localStorage throws.)

Build both the app and a shareable zip:

```bash
npm run build:mac
```

That writes `~/Desktop/NoteMaxx.app` and `release/NoteMaxx.zip` (~300 KB). Run it after changing either the web code or `macos/main.swift`. The binary is universal (arm64 + x86_64) so it runs on Intel Macs too; requires macOS 12+.

To hack on the web code with HMR inside the app shell, run `npm run dev` and launch with `NOTEMAXX_DEV=1`. That loads `http://localhost:5190`, which is a different origin and so has its own separate notes.

### Sending it to someone

The app is signed ad-hoc, not with an Apple Developer certificate, so it isn't notarized. macOS Gatekeeper blocks unnotarized apps downloaded from the internet, and the recipient has to override it once:

**Right-click the app → Open → Open.** Double-clicking will just refuse.

On recent macOS the first attempt may still be blocked; then it's **System Settings → Privacy & Security → "Open Anyway"**. After that it launches normally forever.

Removing that friction entirely requires a paid Apple Developer account ($99/yr) to sign and notarize the bundle. The hosted version below has no such warning.

Note: each install has its own localStorage — notes do not sync between the app, a browser, or another machine.

## Hosted version

The same build is published to GitHub Pages, which is the zero-friction way to share it: works on any OS, nothing to install, no security warnings.

It ships a web manifest and a service worker, so it is installable ("Add to Dock" in Safari, the install icon in Chrome) and works offline after the first visit. The service worker discovers Vite's content-hashed assets by reading the shell at install time and precaches them.

Asset paths are relative (`base: './'` in `vite.config.ts`) so one build works from the app's `notemaxx://` scheme, a domain root, and the `/NoteMaxx/` Pages subpath alike.

Publish an update:

```bash
npm run deploy:web
```

That builds and force-pushes `dist/` to the `gh-pages` branch. (A Pages Actions workflow would deploy automatically on push instead, but pushing `.github/workflows/` needs the `workflow` OAuth scope — run `gh auth refresh -s workflow` first if you want to switch.)

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
