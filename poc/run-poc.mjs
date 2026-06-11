#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { indexedDB } from "fake-indexeddb";

const selected = new Set(process.argv.slice(2).map((id) => id.padStart(2, "0")));
const shouldRun = (id) => selected.size === 0 || selected.has(id);

const results = [];

async function withFilteredSqlTrace(fn) {
  const originalLog = console.log;
  console.log = (...args) => {
    if (typeof args[0] === "string" && args[0].startsWith("SQL TRACE #")) return;
    originalLog(...args);
  };
  try {
    return await fn();
  } finally {
    console.log = originalLog;
  }
}

async function runPoc(id, name, fn) {
  if (!shouldRun(id)) return;
  const started = performance.now();
  try {
    const details = await withFilteredSqlTrace(fn);
    results.push({
      id: `POC-${id}`,
      name,
      status: "pass",
      durationMs: Math.round(performance.now() - started),
      ...details,
    });
  } catch (error) {
    results.push({
      id: `POC-${id}`,
      name,
      status: "fail",
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function toChineseBigrams(input) {
  return input.replace(/\p{Script=Han}+/gu, (segment) => {
    const chars = Array.from(segment);
    const bigrams = [];
    for (let index = 0; index < chars.length - 1; index += 1) {
      bigrams.push(`${chars[index]}${chars[index + 1]}`);
    }
    return `${segment} ${bigrams.join(" ")}`;
  });
}

async function sqliteSmoke() {
  const sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB("/poc-01.sqlite3", "ct");
  try {
    const integrity = db.selectValue("PRAGMA integrity_check");
    assert(integrity === "ok", `expected integrity_check=ok, got ${integrity}`);
    return {
      sqliteVersion: sqlite3.version.libVersion,
      notes:
        "Node smoke uses an in-memory/transient DB; MV3 production load still requires browser validation.",
    };
  } finally {
    db.close();
  }
}

async function fts5Smoke() {
  const sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB("/poc-03.sqlite3", "ct");
  try {
    db.exec(
      "CREATE VIRTUAL TABLE docs USING fts5(content, tokenize='unicode61 remove_diacritics 2')",
    );
    db.exec({
      sql: "INSERT INTO docs(content) VALUES (?)",
      bind: [toChineseBigrams("浏览器记忆 系统")],
    });
    const hits = db.selectValue("SELECT count(*) FROM docs WHERE docs MATCH '浏览'");
    assert(hits === 1, `expected Chinese bigram MATCH hit, got ${hits}`);
    return {
      sqliteVersion: sqlite3.version.libVersion,
      notes: "FTS5 table creation and Chinese bigram MATCH passed in SQLite WASM Node smoke.",
    };
  } finally {
    db.close();
  }
}

async function workerCpuSmoke() {
  const oneMbText = "Clio memory chunk ".repeat(Math.ceil((1024 * 1024) / 18));
  const workerCode = `
    const { parentPort } = require("node:worker_threads");
    function hashToken(token) {
      let hash = 2166136261;
      for (let index = 0; index < token.length; index += 1) {
        hash ^= token.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    }
    parentPort.on("message", (text) => {
      const chunks = [];
      for (let index = 0; index < text.length; index += 2048) {
        const chunk = text.slice(index, index + 2048);
        let simhash = 0;
        for (const token of chunk.split(/\\s+/)) simhash ^= hashToken(token);
        chunks.push({ offset: index, length: chunk.length, simhash });
      }
      parentPort.postMessage({ chunks: chunks.length });
    });
  `;

  const worker = new Worker(workerCode, { eval: true });
  let ticks = 0;
  let maxLagMs = 0;
  let expected = performance.now() + 10;
  const interval = setInterval(() => {
    const now = performance.now();
    maxLagMs = Math.max(maxLagMs, now - expected);
    expected = now + 10;
    ticks += 1;
  }, 10);

  try {
    const result = await new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.postMessage(oneMbText);
    });
    assert(result.chunks > 0, "worker returned no chunks");
    assert(ticks > 0, "main event loop did not tick during worker task");
    assert(maxLagMs < 100, `main event loop max lag too high: ${maxLagMs.toFixed(1)}ms`);
    return {
      chunks: result.chunks,
      maxMainLoopLagMs: Number(maxLagMs.toFixed(1)),
      notes:
        "Node worker_threads smoke; browser Worker validation still belongs to extension manual/automated browser pass.",
    };
  } finally {
    clearInterval(interval);
    await worker.terminate();
  }
}

async function cspStaticCheck() {
  const manifest = JSON.parse(
    await readFile("apps/extension/.output/chrome-mv3/manifest.json", "utf8"),
  );
  const csp = manifest.content_security_policy?.extension_pages ?? "";
  const commandNames = Object.keys(manifest.commands ?? {});
  assert(csp.includes("'wasm-unsafe-eval'"), "manifest CSP missing wasm-unsafe-eval");
  assert(csp.includes("worker-src 'self'"), "manifest CSP missing worker-src self");
  assert(Array.isArray(manifest.host_permissions), "manifest host_permissions must be an array");
  assert(
    manifest.host_permissions.includes("<all_urls>"),
    "manifest host_permissions must allow provider Base URLs upfront",
  );
  for (const command of ["open_rail", "command_palette", "save_page"]) {
    assert(commandNames.includes(command), `manifest commands missing ${command}`);
  }
  return {
    csp,
    hostPermissions: manifest.host_permissions,
    commands: commandNames,
    notes:
      "Static production manifest check passed; runtime CSP console validation still requires loading the extension.",
  };
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function openIndexedDb() {
  const request = indexedDB.open(`clio-poc-${Date.now()}`, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    db.createObjectStore("chunks", { keyPath: "id" });
    db.createObjectStore("postings", { keyPath: "term" });
  };
  return requestToPromise(request);
}

function tokenize(text) {
  return Array.from(new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []));
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

async function indexedDbFallbackSmoke() {
  const db = await openIndexedDb();
  try {
    const writeTx = db.transaction(["chunks", "postings"], "readwrite");
    const chunks = writeTx.objectStore("chunks");
    const postings = writeTx.objectStore("postings");
    const index = new Map();
    for (let id = 0; id < 1000; id += 1) {
      const text = `Clio browser memory chunk ${id} ${id % 10 === 0 ? "retrieval target" : "ordinary text"}`;
      chunks.put({ id, text });
      for (const term of tokenize(text)) {
        const ids = index.get(term) ?? [];
        ids.push(id);
        index.set(term, ids);
      }
    }
    for (const [term, ids] of index) postings.put({ term, ids });
    await transactionDone(writeTx);

    const timings = [];
    let hits = 0;
    for (let run = 0; run < 50; run += 1) {
      const started = performance.now();
      const readTx = db.transaction("postings", "readonly");
      const row = await requestToPromise(readTx.objectStore("postings").get("retrieval"));
      await transactionDone(readTx);
      hits = row?.ids?.length ?? 0;
      timings.push(performance.now() - started);
    }
    const p95 = percentile(timings, 95);
    assert(hits === 100, `expected 100 hits, got ${hits}`);
    assert(p95 < 200, `expected P95 < 200ms, got ${p95.toFixed(1)}ms`);
    return {
      chunks: 1000,
      query: "retrieval",
      hits,
      p95Ms: Number(p95.toFixed(2)),
      notes:
        "fake-indexeddb validates fallback data model and timing in Node; browser IDB timing still needs extension validation.",
    };
  } finally {
    db.close();
  }
}

async function pdfJsSmoke() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 44 >> stream
BT /F1 24 Tf 72 72 Td (Hello Clio PDF) Tj ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000335 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
405
%%EOF`;
  const bytes = new TextEncoder().encode(pdf);
  const document = await pdfjs.getDocument({ data: bytes, disableWorker: true, verbosity: 0 })
    .promise;
  const page = await document.getPage(1);
  const text = await page.getTextContent();
  const chars = text.items.map((item) => item.str).join("");
  assert(chars.includes("Hello Clio PDF"), "pdf.js did not extract expected text");
  return {
    pages: document.numPages,
    extractedText: chars,
    offsets: [{ page: 1, charStart: 0, charEnd: chars.length }],
    notes:
      "Node pdf.js smoke passed on a tiny fixture; 5MB Offscreen/browser target remains a blocking browser validation.",
  };
}

async function phase3aAgentMockSmoke() {
  const files = {
    runtimeTypes: await readFile("apps/extension/src/agent-runtime/types.ts", "utf8"),
    mockRuntime: await readFile("apps/extension/src/agent-runtime/mock-runtime.ts", "utf8"),
    streamClient: await readFile("apps/extension/src/agent-runtime/stream-client.ts", "utf8"),
    railState: await readFile("apps/extension/src/rail/app/rail-state.ts", "utf8"),
    content: await readFile("apps/extension/entrypoints/content.tsx", "utf8"),
    background: await readFile("apps/extension/entrypoints/background.ts", "utf8"),
    offscreen: await readFile("apps/extension/entrypoints/offscreen/main.ts", "utf8"),
    agentRunHost: await readFile("apps/extension/src/agent-runtime/agent-run-host.ts", "utf8"),
  };

  for (const eventName of [
    "run_started",
    "text_delta",
    "citation",
    "world_knowledge",
    "run_completed",
    "run_failed",
    "run_cancelled",
  ]) {
    assert(files.runtimeTypes.includes(eventName), `AgentStreamEvent missing ${eventName}`);
  }
  for (const eventName of [
    "run_started",
    "text_delta",
    "citation",
    "world_knowledge",
    "run_completed",
    "run_cancelled",
  ]) {
    assert(files.mockRuntime.includes(eventName), `Mock runtime missing ${eventName}`);
  }

  assert(
    files.railState.includes("START_AGENT_RUN") &&
      files.railState.includes("APPLY_AGENT_EVENT") &&
      files.railState.includes("CLEAR_DIALOGUE") &&
      files.railState.includes('case "run_failed"'),
    "Rail reducer missing agent streaming events",
  );
  assert(
    files.content.includes("buildAttachedEvidence") && files.content.includes("openAgentStream"),
    "Content composition layer is not wired to context attachment + stream client",
  );
  assert(
    files.background.includes("chrome.runtime.onConnect") &&
      files.background.includes("handleAgentStreamPort") &&
      files.background.includes("routeAgentRunRequest") &&
      files.offscreen.includes("AgentRunHost") &&
      files.agentRunHost.includes("IAgentRuntime"),
    "Agent stream port is not routed to the trusted runtime host",
  );
  assert(
    !files.content.includes("document.body.innerText ??") &&
      !files.content.includes("Agent runtime is not connected yet."),
    "Content script still has blocked placeholder or raw body fallback",
  );

  return {
    streamEvents: 7,
    runtimeBoundary: "chrome.runtime.Port",
    notes:
      "Static Phase 3A smoke confirms typed stream boundary, Rail reducer states, and content evidence wiring.",
  };
}

async function phase3bGeminiProviderSmoke() {
  const files = {
    packageJson: JSON.parse(await readFile("apps/extension/package.json", "utf8")),
    runtime: await readFile("apps/extension/src/agent-runtime/browser-pi-runtime.ts", "utf8"),
    piAgentCoreAdapter: await readFile(
      "apps/extension/src/agent-runtime/pi-agent-core-run-adapter.ts",
      "utf8",
    ),
    citationMarkers: await readFile("apps/extension/src/agent-runtime/citation-markers.ts", "utf8"),
    settings: await readFile("apps/extension/src/agent-runtime/provider-settings.ts", "utf8"),
    background: await readFile("apps/extension/entrypoints/background.ts", "utf8"),
    offscreen: await readFile("apps/extension/entrypoints/offscreen/main.ts", "utf8"),
    wxt: await readFile("apps/extension/wxt.config.ts", "utf8"),
  };

  assert(
    files.packageJson.dependencies["@earendil-works/pi-ai"] &&
      files.packageJson.dependencies["@earendil-works/pi-agent-core"],
    "pi-ai and pi-agent-core dependencies must be installed in the extension package",
  );
  assert(
    files.runtime.includes("BrowserPiAgentRuntime") &&
      files.runtime.includes("PROVIDER_CONFIG_REQUIRED") &&
      files.piAgentCoreAdapter.includes("PiAgentCoreRunAdapter") &&
      files.piAgentCoreAdapter.includes("@earendil-works/pi-agent-core") &&
      files.piAgentCoreAdapter.includes("streamSimpleGoogle") &&
      files.piAgentCoreAdapter.includes("PROVIDER_CONFIG_REQUIRED") &&
      files.citationMarkers.includes("[[cite:"),
    "Provider runtime/adapters are missing setup or citation validation",
  );
  assert(
    files.settings.includes("apiKeyConfigured") && files.settings.includes("apiKey: config.apiKey"),
    "Provider settings must expose key presence and echo saved API keys for Settings UI",
  );
  assert(
    files.background.includes("routeAgentRunRequest") &&
      files.offscreen.includes("PiAgentCoreRunAdapter") &&
      !files.background.includes("new MockAgentRuntime"),
    "Background/Offscreen must route agent streams through the provider adapter",
  );
  assert(
    files.wxt.includes('"<all_urls>"'),
    "manifest host_permissions must allow provider Base URLs upfront",
  );

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      provider: "gemini",
      realNetwork: "skipped",
      notes:
        "Static 3B provider boundary passed. Set GEMINI_API_KEY to run the optional real Gemini smoke.",
    };
  }

  const { streamGoogle } = await import(
    pathToFileURL(
      resolve("apps/extension/node_modules/@earendil-works/pi-ai/dist/providers/google.js"),
    ).href
  );
  const model = process.env.CLIO_GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const stream = streamGoogle(
    {
      id: model,
      name: model,
      api: "google-generative-ai",
      provider: "google",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      reasoning: model.includes("2.5") || model.includes("3"),
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 1048576,
      maxTokens: 8192,
    },
    {
      systemPrompt: "You are a short connection smoke test.",
      messages: [
        {
          role: "user",
          content: "Reply with one short sentence: Clio Gemini smoke ok.",
          timestamp: Date.now(),
        },
      ],
    },
    { apiKey, maxTokens: 32, maxRetries: 0, temperature: 0 },
  );

  let textLength = 0;
  for await (const event of stream) {
    if (event.type === "text_delta") textLength += event.delta.length;
    if (event.type === "error") {
      throw new Error(event.error?.errorMessage ?? "Gemini smoke failed");
    }
  }

  assert(textLength > 0, "Gemini smoke returned no text");
  return {
    provider: "gemini",
    model,
    realNetwork: "pass",
    textLength,
    notes: "Real Gemini smoke passed through pi-ai google provider.",
  };
}

async function phase3cSessionsSmoke() {
  const files = {
    rpc: await readFile("apps/extension/src/shared/rpc.ts", "utf8"),
    worker: await readFile("apps/extension/src/engine/local-engine.worker.ts", "utf8"),
    content: await readFile("apps/extension/entrypoints/content.tsx", "utf8"),
    background: await readFile("apps/extension/entrypoints/background.ts", "utf8"),
    offscreen: await readFile("apps/extension/entrypoints/offscreen/main.ts", "utf8"),
    agentRunHost: await readFile("apps/extension/src/agent-runtime/agent-run-host.ts", "utf8"),
    piAgentCoreAdapter: await readFile(
      "apps/extension/src/agent-runtime/pi-agent-core-run-adapter.ts",
      "utf8",
    ),
    railShell: await readFile("apps/extension/src/rail/components/RailShell.tsx", "utf8"),
    railState: await readFile("apps/extension/src/rail/app/rail-state.ts", "utf8"),
    chatSessionApi: await readFile("apps/extension/src/rail/api/chat-session.ts", "utf8"),
  };

  for (const table of ["sessions", "session_evidence", "messages"]) {
    assert(files.worker.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `missing ${table} table`);
  }
  for (const kind of [
    "createChatSession",
    "listChatSessions",
    "loadChatSession",
    "claimChatSession",
    "appendSessionEvidence",
    "upsertChatMessage",
    "updateChatMessage",
    "clearQueuedChatMessages",
    "recoverInterruptedChatSession",
  ]) {
    assert(files.rpc.includes(kind), `Engine RPC missing ${kind}`);
    assert(files.worker.includes(kind), `Local Engine handler missing ${kind}`);
  }
  assert(
    files.chatSessionApi.includes("chrome.storage.session") &&
      files.chatSessionApi.includes("activeSessionKey") &&
      !files.chatSessionApi.includes("chrome.storage.local"),
    "Active session adapter must store ids in browser session storage, not chat bodies",
  );
  assert(
    files.railShell.includes("ChatHistoryPanel") &&
      files.railShell.includes("onOpenSession") &&
      !files.railShell.includes("Conversation history is not connected yet."),
    "Chat History panel is still a placeholder",
  );
  assert(
    files.content.includes("createOrLoadSessionForTurn") &&
      files.content.includes("LOAD_CHAT_SESSION") &&
      files.chatSessionApi.includes("appendSessionEvidence"),
    "Content script is not wired to durable sessions and evidence append",
  );
  assert(
    files.rpc.includes("CLIO_AGENT_RUN_REQUEST") &&
      files.rpc.includes("CLIO_AGENT_RUN_EVENT") &&
      files.background.includes("agentStreamSubscribers") &&
      files.background.includes("routeAgentRunRequest") &&
      !files.background.includes("activeAgentRuns") &&
      files.offscreen.includes("AgentRunHost") &&
      files.offscreen.includes("PiAgentCoreRunAdapter") &&
      files.agentRunHost.includes("activeRuns") &&
      files.agentRunHost.includes("startNextQueuedFollowUp") &&
      files.piAgentCoreAdapter.includes("@earendil-works/pi-agent-core") &&
      !files.background.includes(
        "onDisconnect.addListener(() => {\n    activeRun?.abortController.abort();",
      ),
    "Offscreen run host or non-aborting stream routing is missing",
  );
  assert(
    files.chatSessionApi.includes("enqueueSessionFollowUp") &&
      files.chatSessionApi.includes("retryInterruptedAssistant") &&
      files.chatSessionApi.includes("clearError: true") &&
      files.railShell.includes("Queue a follow-up") &&
      !files.content.includes("Stop the current answer before asking another question."),
    "Follow-up queue or in-place retry wiring is missing",
  );
  assert(
    files.railState.includes("hasUnresolvedInterruptedAnswer") &&
      files.railShell.includes("Resolve interrupted answer first.") &&
      files.content.includes("hasUnresolvedInterruptedAnswer") &&
      files.chatSessionApi.includes("stopInterruptedAssistant") &&
      files.chatSessionApi.includes("Use Retry, Stop, or Clear before continuing.") &&
      files.rpc.includes("clearRetry") &&
      files.worker.includes("payload.clearRetry") &&
      files.content.includes("clearQueuedChatMessages"),
    "Unresolved interrupted guard or Stop resolution wiring is missing",
  );
  assert(
    !files.railShell.includes("@earendil-works/pi-ai") &&
      !files.railShell.includes("@earendil-works/pi-agent-core") &&
      !files.content.includes("@earendil-works/pi-ai") &&
      !files.content.includes("@earendil-works/pi-agent-core"),
    "Rail/content must remain provider-agnostic",
  );

  return {
    tables: ["sessions", "session_evidence", "messages"],
    historyLimit: 30,
    runLifetime:
      "offscreen runtime owns active runs; background ports subscribe; queued follow-ups chain",
    notes:
      "Static 3C-A smoke confirms durable session schema/RPC, Chat History wiring, one-shot context attachment, offscreen run host routing, queued follow-up wiring, interrupted resolution, and non-aborting Port disconnect behavior.",
  };
}

await runPoc("01", "SQLite WASM initialization and integrity check", sqliteSmoke);
await runPoc("03", "SQLite FTS5 availability and Chinese bigram MATCH", fts5Smoke);
await runPoc("05", "Worker CPU isolation smoke", workerCpuSmoke);
await runPoc("06", "MV3 production manifest CSP static check", cspStaticCheck);
await runPoc("10", "IndexedDB inverted-index fallback smoke", indexedDbFallbackSmoke);
await runPoc("11", "pdf.js text extraction smoke", pdfJsSmoke);
await runPoc(
  "31",
  "Phase 3A mock agent runtime vertical slice static smoke",
  phase3aAgentMockSmoke,
);
await runPoc("32", "Phase 3B Gemini provider thin adapter gated smoke", phase3bGeminiProviderSmoke);
await runPoc("33", "Phase 3C-A durable sessions and history static smoke", phase3cSessionsSmoke);

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));

if (results.some((result) => result.status === "fail")) {
  process.exitCode = 1;
}
