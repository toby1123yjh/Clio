# Clio Browser

> Your browser remembers nothing. Your AI makes things up. **Clio fixes both.**

**English** | [简体中文](./README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg)](https://developer.chrome.com/docs/extensions/develop/migrate)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange.svg)](#status--roadmap)
[![Built with WXT](https://img.shields.io/badge/built%20with-WXT-67d7c4.svg)](https://wxt.dev)

Clio captures what you read into a private, local knowledge base, then answers your questions **grounded in those pages — with every claim linked back to the exact source.** No hallucinated citations. No raw content leaving your browser.

It's a single Chrome extension (Manifest V3). No desktop app, no local server, no account.

<p align="center">
  <!-- TODO: replace with docs/screenshots/hero.png once captured -->
  <img src="https://placehold.co/860x480/f5f5f4/57534e?text=Clio+Rail+%E2%80%94+grounded+answer+with+citations" alt="Clio's in-page Rail answering a question with a citation back to the source" width="860">
</p>

## How Clio is different

Clio isn't a cloud assistant or a web answer engine — it turns **your own reading** into the source of truth.

| | Cloud assistants<br/>(Monica, Glarity…) | Web answer engines<br/>(Perplexity…) | **Clio** |
|---|:---:|:---:|:---:|
| Your page content | processed in the cloud | — | **stays in your browser** |
| Answers grounded in | the current page | the public web | **your captured reading** |
| Citations point to | the page, when shown | web pages | **your own saved sources** |
| Getting started | account + subscription | account | **install + your own key** |

## Features

- 📥 **One-click capture** — save the current page or a selection into local memory (`Alt+Shift+S`). Content is extracted cleanly with Mozilla Readability.
- 🧠 **Local knowledge base** — pages, chunks, and selections stored in SQLite WASM over OPFS. Fully offline, survives browser restarts.
- 🔎 **Search your reading** — full-text search across everything you've captured.
- 💬 **In-page Companion Rail** — a Shadow-DOM panel injected into the page (`Alt+Shift+C`); chat about the current page or your memory without leaving the tab.
- 📚 **Grounded answers with citations** — streaming responses that cite the local chunks they're built on; click a citation to jump back to the source.
- 🛠️ **Agent tooling** — an in-browser agent loop ([pi-mono](https://github.com/earendil-works/pi)) with tools for memory search, page summarization, web search, and image generation.
- 💡 **Reply suggestions & command palette** — context-aware suggestions plus a `Ctrl/Cmd+Shift+K` command palette.
- ✍️ **Rich rendering** — Markdown, GFM, math (KaTeX), and Mermaid diagrams in answers.
- 🔑 **Bring your own key** — any OpenAI-compatible provider (OpenAI, DeepSeek, Groq, custom base URL…) plus native Google Gemini. Keys stay in local extension storage.

## Screenshots

> 🚧 Placeholders — real screenshots coming soon. To contribute one, see [`docs/screenshots/`](docs/screenshots/).

| Capture a page | Ask, grounded in your memory | Search your library |
|:---:|:---:|:---:|
| ![Capture](https://placehold.co/420x280/f5f5f4/57534e?text=Capture) | ![Ask](https://placehold.co/420x280/f5f5f4/57534e?text=Cited+answer) | ![Memory](https://placehold.co/420x280/f5f5f4/57534e?text=Memory+Library) |

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

The stateful work (storage, indexing, retrieval) lives in an **Offscreen Document + Worker** so it survives the Service Worker being recycled. The agent loop runs entirely in the browser and is the only component that talks to a remote model — and only ever with the minimal retrieved context for your question.

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

### Option A — Install the prebuilt extension (recommended)

1. Download `clio-chrome-mv3.zip` from the [Releases page](https://github.com/toby1123yjh/Clio/releases).
2. Unzip it.
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the unzipped folder.
4. Press `Alt+Shift+C` on any page to open the Rail.

### Option B — Build from source

Requires **Node.js ≥ 20.10** and **pnpm 9** (`corepack enable`).

```bash
pnpm install
pnpm dev        # WXT dev mode, rebuilds on change
pnpm build      # production build → apps/extension/.output/chrome-mv3
pnpm zip        # package a Chrome Web Store-ready zip
```

Then load `apps/extension/.output/chrome-mv3` via **Load unpacked** as above.

## Configuration

Clio needs a model provider to answer questions — set one up in two ways:

1. **In the extension (recommended).** Open Clio's Settings and enter your provider, API key, base URL, and model. Keys are saved in local extension storage.
2. **Dev defaults via `.env.local`.** For local development, pre-fill defaults in an ignored `apps/extension/.env.local`:
   ```bash
   VITE_CLIO_OPENAI_API_KEY=sk-...
   VITE_CLIO_OPENAI_BASE_URL=https://api.openai.com/v1   # or any OpenAI-compatible endpoint
   VITE_CLIO_OPENAI_MODEL=gpt-4o-mini
   ```

> Capture, local storage, and search work **without any API key** — a provider is only needed for LLM answers.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt+Shift+C` | Open / focus the Clio Rail |
| `Ctrl+Shift+K` (`Cmd+Shift+K` on macOS) | Command palette |
| `Alt+Shift+S` | Save the current page to memory |

## Project structure

```text
Clio-browser/
├─ apps/extension/            Chrome MV3 extension (WXT)
│  ├─ entrypoints/            background · content (Rail) · offscreen · options · popup
│  └─ src/
│     ├─ engine/              local engine Worker (SQLite WASM + OPFS)
│     ├─ rail/                in-page Companion Rail (UI, app logic, API)
│     ├─ agent-runtime/       pi-mono adapter, providers, tools, citations
│     ├─ suggestions/         reply suggestion engine
│     ├─ ui/ · shared/        shared components, types & utilities
├─ poc/                       proof-of-concept harnesses
├─ tests/e2e/                 Playwright extension E2E
└─ scripts/                   local dev helpers
```

## Testing

```bash
pnpm typecheck     # tsc across the workspace
pnpm lint          # Biome
pnpm test          # Vitest unit tests
pnpm e2e:extension # build + drive the real extension in Chrome via Playwright
```

The E2E run needs a provider key (`CLIO_OPENAI_API_KEY`) and accepts options like `CLIO_OPENAI_BASE_URL`, `CLIO_E2E_BROWSER`, and `CHROME_PATH`.

## Privacy

- Captured page content is stored **only in your browser** (OPFS / extension storage).
- Remote models receive only the **minimal retrieved context** for a question — never your full library.
- API keys live in local extension storage; the Rail UI does not embed them in page context.
- No telemetry, no `localhost` server, no cross-device sync.

## Status & roadmap

Clio is **early and under active development** (`v0.0.1`). The core loop — capture → local memory → full-text search → grounded, cited Q&A — works today. Planned next:

- [ ] Local embeddings + hybrid (FTS + vector + RRF) semantic search
- [ ] RAG intent/retrieval routing with an inspectable trace
- [ ] Full Options page: provider management, privacy presets, upload preview, domain rules
- [ ] Knowledge lifecycle (stale / archived / superseded) + golden-set evaluation
- [ ] Import / export and a Chrome Web Store release

## Contributing

Issues and pull requests are welcome! Before opening a PR, please run `pnpm typecheck`, `pnpm lint`, and `pnpm test`. For larger changes, opening an issue to discuss first is appreciated.

## License

[MIT](./LICENSE) © 2026 Clio Browser contributors.

Built on [pi-mono](https://github.com/earendil-works/pi), [WXT](https://wxt.dev), and [SQLite WASM](https://sqlite.org/wasm).
