# Clio Browser

> **Evidence-first, browser-only knowledge companion.** Capture, recall, and ground answers in your own reading — without a desktop app, a local server, or your raw content ever leaving the browser by default.

**English** | [简体中文](./README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg)](https://developer.chrome.com/docs/extensions/develop/migrate)
[![Built with WXT](https://img.shields.io/badge/Built%20with-WXT-67d7c4.svg)](https://wxt.dev)

---

## What is Clio?

Clio is a **pure Chrome extension** (Manifest V3) that turns your everyday reading into a private, searchable knowledge base — and then lets a large language model answer your questions **grounded in that knowledge, with citations back to the original source**.

Everything that matters runs in your browser:

- **Capture** the page you're reading (or just a selection) into a local store.
- **Recall** it later with full-text search over your own memory.
- **Ask** questions about the current page or your whole library; answers stream in with clickable citations.

There is **no desktop app, no local sidecar, no `localhost` server, and no pairing token**. You install one extension and you're done.

## Why evidence-first?

LLMs are confident even when they're wrong. Clio is built around a single rule: **an answer is only as good as the source it can point to.**

- Raw page content is stored **locally** (SQLite WASM + OPFS).
- The remote model only ever receives the **minimal retrieved context** needed to answer — not your whole library.
- Every answer carries **citations** that jump back to the exact source page or saved record. No supporting source → no fabricated citation.

## Features

- 📥 **One-click capture** — save the current page or a text selection into local memory (`Alt+Shift+S`). Content is extracted with Mozilla Readability.
- 🧠 **Local knowledge base** — pages, chunks, and selections stored in SQLite WASM over OPFS, fully offline, survives browser restarts.
- 🔎 **Search your reading** — full-text keyword search across everything you've captured.
- 💬 **In-page Companion Rail** — a Shadow-DOM UI injected into the page (`Alt+Shift+C`); chat about the current page or your memory without leaving the tab.
- 📚 **Grounded Q&A with citations** — streaming answers that cite the local chunks they're built on; click a citation to jump back to the source.
- 🛠️ **Agent tooling** — an in-browser agent loop (powered by [pi-mono](https://github.com/earendil-works/pi)) with tools for memory search, page summarization, web search, and image generation.
- 💡 **Reply suggestions & command palette** — context-aware suggestions plus a `Ctrl/Cmd+Shift+K` command palette.
- ✍️ **Rich rendering** — Markdown, GFM, math (KaTeX), and Mermaid diagrams in answers.
- 🔑 **Bring your own key** — any OpenAI-compatible provider (OpenAI, DeepSeek, Groq, custom base URL…) plus native Google Gemini. Keys stay in local extension storage.

## How it works

```text
┌──────────────────────────────────────────────────────────────┐
│  Web page (any site)                                           │
│    └── In-page Companion Rail   (content script · Shadow DOM)  │
│          │   capture · ask · cite                              │
│          ▼                                                     │
│  Background Service Worker      (short-task router only)       │
│          │                                                     │
│          ▼                                                     │
│  Offscreen Document ── Web Worker                              │
│    └── Local Engine: SQLite WASM + OPFS                        │
│         (pages · chunks · selections · full-text index)        │
│          │                                                     │
│          ▼                                                     │
│  Agent Runtime (pi-mono, in-browser)                           │
│    └── Remote LLM   ◀── receives minimal retrieved context     │
└──────────────────────────────────────────────────────────────┘
```

The heavy, stateful work (storage, indexing, retrieval) lives in an **Offscreen Document + Worker** so it survives the Service Worker being recycled. The Service Worker only routes short tasks. The agent loop runs entirely in the browser and is the only component that talks to a remote model.

## Tech stack

| Area | Choice |
|---|---|
| Extension framework | [WXT](https://wxt.dev) (MV3) |
| UI | React 18, Tailwind CSS 3, Radix UI, lucide-react |
| Local storage | [@sqlite.org/sqlite-wasm](https://sqlite.org/wasm) + OPFS |
| Content extraction | [@mozilla/readability](https://github.com/mozilla/readability) |
| Agent runtime | [pi-mono](https://github.com/earendil-works/pi) (`@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`) |
| Rendering | react-markdown, remark-gfm, remark/rehype-math, KaTeX, Mermaid |
| Tooling | pnpm workspace, TypeScript, Biome, Vitest, Playwright |

## Getting started

### Prerequisites

- **Node.js** ≥ 20.10
- **pnpm** 9 (`corepack enable` will provide it)
- **Google Chrome** (or a Chromium build)

### Install & run

```bash
pnpm install

# WXT dev mode — rebuilds on change
pnpm dev

# Production build → apps/extension/.output/chrome-mv3
pnpm build

# Chrome Web Store-ready zip
pnpm zip
```

### Load the extension in Chrome

1. Run `pnpm build` (or `pnpm dev`).
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select `apps/extension/.output/chrome-mv3`.
4. Click the Clio toolbar icon (or press `Alt+Shift+C`) on any page to open the Rail.

## Configuration

Clio needs a model provider to answer questions. You can configure one in two ways:

**1. In the extension (recommended).** Open Clio's Settings and enter your provider, API key, base URL, and model. Keys are saved in local extension storage.

**2. Dev defaults via `.env.local`.** For local development you can pre-fill defaults in an ignored `apps/extension/.env.local`:

```bash
VITE_CLIO_OPENAI_API_KEY=sk-...
VITE_CLIO_OPENAI_BASE_URL=https://api.openai.com/v1   # or any OpenAI-compatible endpoint
VITE_CLIO_OPENAI_MODEL=gpt-4o-mini
```

The E2E harness reads non-`VITE_` equivalents (`CLIO_OPENAI_API_KEY`, `CLIO_OPENAI_BASE_URL`, `CLIO_OPENAI_MODEL`, …). See [Testing](#testing).

> Capture, local storage, and search work **without any API key**. A provider is only required for LLM answers.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+C` | Open / focus the Clio Toolbox (Rail) |
| `Ctrl+Shift+K` (`Cmd+Shift+K` on macOS) | Command palette |
| `Alt+Shift+S` | Save the current page to memory |

## Project structure

```text
Clio-browser/
├─ apps/
│  └─ extension/              Chrome MV3 extension (WXT)
│     ├─ entrypoints/         background · content (Rail) · offscreen · options · popup
│     └─ src/
│        ├─ engine/           local engine Worker (SQLite WASM + OPFS)
│        ├─ rail/             in-page Companion Rail (UI, app logic, API)
│        ├─ agent-runtime/    pi-mono adapter, providers, tools, citations
│        ├─ tool-routing/     agent tool routing types
│        ├─ suggestions/      reply suggestion engine
│        ├─ ui/               shared UI components
│        └─ shared/           cross-entry types & utilities
├─ poc/                       proof-of-concept harnesses
├─ tests/e2e/                 Playwright extension E2E
└─ scripts/                   local dev helpers
```

## Testing

```bash
pnpm typecheck        # tsc across the workspace
pnpm lint             # Biome
pnpm test             # Vitest unit tests

# Full extension E2E: builds the extension, launches a fresh Chrome
# profile with it loaded, and drives the in-page Rail with Playwright.
pnpm e2e:extension
```

The E2E run needs a real provider key (`CLIO_OPENAI_API_KEY`) and accepts options such as `CLIO_OPENAI_BASE_URL`, `CLIO_OPENAI_MODEL`, `CLIO_E2E_BROWSER`, `CHROME_PATH`, and `CLIO_E2E_TARGET_URL`. If installed Chrome rejects the unpacked-extension flags, rerun with `CLIO_E2E_BROWSER=chromium` or point `CHROME_PATH` / `PLAYWRIGHT_CHROMIUM_PATH` at Chrome for Testing.

## Privacy

- Captured page content is stored **only in your browser** (OPFS / extension storage).
- Remote models receive only the **minimal retrieved context** for a given question, never your full library.
- API keys live in local extension storage; the Rail UI does not embed them in page context.
- No telemetry, no `localhost` server, no cross-device sync.

## Status & roadmap

Clio is **early and under active development** (extension version `0.0.1`). The core loop — capture → local memory → full-text search → grounded, cited Q&A — works today. On the roadmap:

- Local embeddings + hybrid (FTS + vector + RRF) semantic search
- RAG intent/retrieval routing with an inspectable trace
- A full Options page: provider management, privacy presets, upload preview, domain rules
- Knowledge lifecycle (stale / archived / superseded) and a golden-set evaluation harness
- Import / export and a Chrome Web Store release

## Contributing

Issues and pull requests are welcome. Before opening a PR, please run `pnpm typecheck`, `pnpm lint`, and `pnpm test`. This is an early-stage project, so opening an issue to discuss larger changes first is appreciated.

## License

[MIT](./LICENSE) © 2026 Clio Browser contributors.

Built on [pi-mono](https://github.com/earendil-works/pi), [WXT](https://wxt.dev), and [SQLite WASM](https://sqlite.org/wasm).
