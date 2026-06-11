# @clio-browser/extension

The Chrome MV3 extension — the **only** Clio runtime in the pure-browser architecture.

For setup, usage, and the full project overview, see the [root README](../../README.md).

## Layout

```
apps/extension/
  wxt.config.ts          MV3 manifest + build config
  entrypoints/
    background.ts        service worker (short-task router only)
    content.tsx          in-page Companion Rail injection
    popup/               fallback popup for unsupported pages
    options/             extension settings & storage diagnostics
    offscreen/           SQLite WASM + Worker host
  src/
    engine/              local engine Worker (SQLite WASM + OPFS)
    rail/                in-page Companion Rail (UI, app logic, API)
    agent-runtime/       pi-mono adapter, providers, tools, citations
    tool-routing/        agent tool routing types
    suggestions/         reply suggestion engine
    ui/                  shared UI components
    shared/              cross-entry types & utilities
  poc/                   proof-of-concept harnesses
```

## Conventions

- Logs use a `[clio:<area>]` prefix (`bg`, `cs`, `offscreen`, `worker`, etc.).
- No `127.0.0.1`, no `localhost:*`, no pairing tokens — anywhere.
- Provider host access is declared in the manifest so Rail-side setup works without runtime permission prompts.
- WASM and Workers must stay within the `script-src 'self' 'wasm-unsafe-eval'` CSP; do not relax the CSP without discussion.
