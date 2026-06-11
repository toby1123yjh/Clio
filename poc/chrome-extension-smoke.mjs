#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const chromeCandidates = [
  process.env.CHROME_PATH,
  process.env.ProgramFiles
    ? join(process.env.ProgramFiles, "Google/Chrome/Application/chrome.exe")
    : undefined,
  process.env["ProgramFiles(x86)"]
    ? join(process.env["ProgramFiles(x86)"], "Google/Chrome/Application/chrome.exe")
    : undefined,
  process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe")
    : undefined,
].filter(Boolean);

const chromePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!chromePath) {
  throw new Error("Chrome executable not found. Set CHROME_PATH to run this POC.");
}

const extensionDir = resolve("apps/extension/.output/chrome-mv3");
if (!existsSync(join(extensionDir, "manifest.json"))) {
  throw new Error("Build output missing. Run pnpm build before poc:chrome-smoke.");
}

class CdpSession {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolveOpen, rejectOpen) => {
      this.socket.addEventListener("open", resolveOpen, { once: true });
      this.socket.addEventListener("error", rejectOpen, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolveMessage, rejectMessage } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) rejectMessage(new Error(message.error.message));
      else resolveMessage(message.result);
    });
  }

  call(method, params = {}, timeoutMs = 10_000) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolveMessage, rejectMessage) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectMessage(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolveMessage: (value) => {
          clearTimeout(timer);
          resolveMessage(value);
        },
        rejectMessage: (error) => {
          clearTimeout(timer);
          rejectMessage(error);
        },
      });
      this.socket.send(payload);
    });
  }

  close() {
    this.socket?.close();
  }
}

class BrowserSmokeBlockedError extends Error {
  constructor(message, diagnostics = {}) {
    super(message);
    this.name = "BrowserSmokeBlockedError";
    this.diagnostics = diagnostics;
  }
}

function createBoundedLog(maxLength = 20_000) {
  let value = "";
  return {
    append(chunk) {
      value = `${value}${chunk.toString()}`.slice(-maxLength);
    },
    read() {
      return value;
    },
  };
}

async function waitForFile(path, timeoutMs = 10_000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (existsSync(path)) return;
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 100));
  }
  throw new Error(`Timed out waiting for ${path}`);
}

async function launchChrome(profileDir) {
  const portFile = join(profileDir, "DevToolsActivePort");
  await rm(portFile, { force: true });
  const stderrLog = createBoundedLog();
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--enable-logging=stderr",
    "--vmodule=*extensions*=1,*extension*=1",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    "https://example.com",
  ];
  const processHandle = spawn(chromePath, args, {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  processHandle.stderr?.on("data", (chunk) => stderrLog.append(chunk));
  await waitForFile(portFile);
  const [port] = (await readFile(portFile, "utf8")).trim().split(/\r?\n/);
  return { processHandle, port, stderrLog };
}

async function stopChrome(processHandle) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) return;
  processHandle.kill("SIGTERM");
  const exited = await new Promise((resolveStop) => {
    processHandle.once("exit", resolveStop);
    setTimeout(() => resolveStop(false), 1000);
  });
  if (!exited && processHandle.exitCode === null && processHandle.signalCode === null) {
    processHandle.kill("SIGKILL");
  }
}

async function listTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`CDP target list failed: ${response.status}`);
  return response.json();
}

async function getBrowserVersion(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!response.ok) throw new Error(`CDP browser version failed: ${response.status}`);
  return response.json();
}

async function createPageTarget(port, url) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
  if (!response.ok) throw new Error(`CDP new target failed: ${response.status}`);
  return response.json();
}

function getExtensionIdFromUrl(url) {
  const match = /^chrome-extension:\/\/([^/]+)\//.exec(url);
  return match?.[1];
}

async function readRuntimeIdentity(target) {
  return evaluate(
    target.webSocketDebuggerUrl,
    `(() => ({
      runtimeId: chrome.runtime?.id,
      manifest: chrome.runtime?.getManifest?.(),
      href: location.href,
    }))()`,
    1_000,
  );
}

function summarizeExtensionLoadLog(log) {
  return log
    .split(/\r?\n/)
    .filter((line) =>
      /load-extension|disable-extensions|extension_service|manifest|Clio|chrome-mv3|\.output/i.test(
        line,
      ),
    )
    .slice(-24);
}

function summarizeRuntimeIdentity(identity) {
  if (!identity || identity.error) return identity;
  const manifest = identity.manifest ?? {};
  return {
    runtimeId: identity.runtimeId,
    href: identity.href,
    manifest: {
      manifest_version: manifest.manifest_version,
      name: manifest.name,
      version: manifest.version,
      background: manifest.background,
      permissions: manifest.permissions,
      host_permissions: manifest.host_permissions,
    },
  };
}

async function findServiceWorker(port, expectedManifest, stderrLog) {
  const started = performance.now();
  let lastDiagnostics = [];
  while (performance.now() - started < 10_000) {
    const targets = await listTargets(port);
    const workers = targets.filter(
      (target) => target.type === "service_worker" && target.url.startsWith("chrome-extension://"),
    );
    const urlMatchedWorker = workers.find((target) =>
      target.url.endsWith(`/${expectedManifest.background?.service_worker ?? ""}`),
    );
    if (urlMatchedWorker) {
      return {
        ...urlMatchedWorker,
        runtimeIdentity: {
          runtimeId: getExtensionIdFromUrl(urlMatchedWorker.url),
          href: urlMatchedWorker.url,
          manifest: {
            name: expectedManifest.name,
            version: expectedManifest.version,
            background: expectedManifest.background,
          },
        },
      };
    }
    lastDiagnostics = await Promise.all(
      workers.map(async (target) => ({
        type: target.type,
        url: target.url,
        title: target.title,
        runtime: summarizeRuntimeIdentity(
          await readRuntimeIdentity(target).catch((error) => ({
            error: error instanceof Error ? error.message : String(error),
          })),
        ),
      })),
    );
    const worker = lastDiagnostics.find((diagnostic) => {
      const manifest = diagnostic.runtime?.manifest;
      return (
        manifest?.name === expectedManifest.name &&
        manifest?.version === expectedManifest.version &&
        diagnostic.url.endsWith(`/${expectedManifest.background?.service_worker ?? ""}`)
      );
    });
    if (worker) {
      return {
        ...workers.find((target) => target.url === worker.url),
        runtimeIdentity: worker.runtime,
      };
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 100));
  }
  const extensionLoadLog = summarizeExtensionLoadLog(stderrLog?.read?.() ?? "");
  const chromeBlockedCommandLineLoad = extensionLoadLog.some((line) =>
    /--load-extension is not allowed|--disable-extensions-except is not allowed/i.test(line),
  );
  throw new BrowserSmokeBlockedError(
    chromeBlockedCommandLineLoad
      ? "Chrome rejected command-line unpacked extension loading; use Chrome for Testing, Chromium, or a headed manual load."
      : "Clio extension service worker target not found.",
    {
      expected: {
        name: expectedManifest.name,
        version: expectedManifest.version,
        serviceWorker: expectedManifest.background?.service_worker,
      },
      extensionTargets: lastDiagnostics,
      extensionLoadLog,
    },
  );
}

async function waitForServiceWorkerApi(workerTarget, timeoutMs = 10_000) {
  const started = performance.now();
  let lastApi;
  while (performance.now() - started < timeoutMs) {
    lastApi = await evaluate(
      workerTarget.webSocketDebuggerUrl,
      `(() => ({
        hasChrome: typeof chrome !== "undefined",
        runtimeId: chrome.runtime?.id,
        offscreenCreate: typeof chrome.offscreen?.createDocument,
      }))()`,
      1_000,
    ).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    if (lastApi.runtimeId && lastApi.offscreenCreate === "function") return lastApi;
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 100));
  }
  throw new Error(`Service worker extension API not ready: ${JSON.stringify(lastApi)}`);
}

async function evaluate(wsUrl, expression, timeoutMs = 10_000) {
  const session = new CdpSession(wsUrl);
  await session.open();
  try {
    await session.call("Runtime.enable", {}, timeoutMs);
    const result = await session.call(
      "Runtime.evaluate",
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
      },
      timeoutMs,
    );
    if (result.exceptionDetails) {
      const exception =
        result.exceptionDetails.exception?.description ??
        result.exceptionDetails.exception?.value ??
        result.exceptionDetails.text ??
        "Runtime.evaluate failed";
      throw new Error(exception);
    }
    return result.result.value;
  } finally {
    session.close();
  }
}

async function requestOffscreenDocument(workerTarget) {
  return evaluate(
    workerTarget.webSocketDebuggerUrl,
    `(() => {
      if (!chrome.offscreen?.createDocument) {
        throw new Error("chrome.offscreen.createDocument is unavailable in service worker");
      }
      const offscreenUrl = chrome.runtime.getURL("offscreen.html");
      globalThis.__clioPhase0OffscreenCreate = {
        status: "pending",
        offscreenUrl,
        startedAt: Date.now(),
      };
      chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: ["DOM_PARSER"],
          justification: "Phase 0 OPFS persistence smoke",
        })
        .then(() => {
          globalThis.__clioPhase0OffscreenCreate = {
            status: "resolved",
            offscreenUrl,
            finishedAt: Date.now(),
          };
        })
        .catch((error) => {
          globalThis.__clioPhase0OffscreenCreate = {
            status: "rejected",
            offscreenUrl,
            error: error instanceof Error ? error.message : String(error),
            finishedAt: Date.now(),
          };
        });
      return {
        offscreenUrl,
        createRequested: true,
        api: {
          getContexts: typeof chrome.runtime.getContexts,
          createDocument: typeof chrome.offscreen.createDocument,
        },
      };
    })()`,
    6_000,
  );
}

async function getOffscreenCreateStatus(workerTarget) {
  return evaluate(
    workerTarget.webSocketDebuggerUrl,
    "globalThis.__clioPhase0OffscreenCreate ?? null",
    1_000,
  );
}

async function findOffscreenTarget(port, offscreenUrl) {
  const started = performance.now();
  while (performance.now() - started < 10_000) {
    const targets = await listTargets(port);
    const offscreen = targets.find((target) => target.url === offscreenUrl);
    if (offscreen) return offscreen;
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 100));
  }
  throw new Error(`Offscreen target not found for ${offscreenUrl}`);
}

async function findPageTarget(port) {
  const targets = await listTargets(port);
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("Chrome page target not found");
  return page;
}

async function navigatePage(pageTarget, url) {
  const session = new CdpSession(pageTarget.webSocketDebuggerUrl);
  await session.open();
  try {
    await session.call("Page.navigate", { url }, 5_000);
  } finally {
    session.close();
  }
}

async function openPocExtensionPage(workerTarget, port, extensionId) {
  const url = `chrome-extension://${extensionId}/options.html`;
  const started = performance.now();
  await evaluate(
    workerTarget.webSocketDebuggerUrl,
    "(() => { chrome.runtime.openOptionsPage(); return true; })()",
    1_000,
  ).catch(() => null);
  await createPageTarget(port, url).catch(() => null);
  while (performance.now() - started < 10_000) {
    const targets = await listTargets(port);
    const page = targets.find((target) => target.type === "page" && target.url === url);
    if (page) {
      const ping = await waitForPocHost(page, "extension page", 10_000);
      return { target: page, url, ping };
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 100));
  }
  throw new Error(`POC extension page did not load: ${url}`);
}

async function ensureOffscreenDocument(workerTarget, port) {
  const request = await requestOffscreenDocument(workerTarget);
  try {
    const target = await findOffscreenTarget(port, request.offscreenUrl);
    const ping = await waitForPocHost(target, "Offscreen");
    return { request, target, ping };
  } catch (error) {
    const createStatus = await getOffscreenCreateStatus(workerTarget).catch((statusError) => ({
      status: "status-read-failed",
      error: statusError instanceof Error ? statusError.message : String(statusError),
    }));
    throw new Error(
      `Offscreen probe failed: ${
        error instanceof Error ? error.message : String(error)
      }; request=${JSON.stringify(request)}; createStatus=${JSON.stringify(createStatus)}`,
    );
  }
}

async function waitForPocHost(browserTarget, label, timeoutMs = 10_000) {
  const started = performance.now();
  let lastError = "not checked";
  while (performance.now() - started < timeoutMs) {
    try {
      return await runBrowserPoc(browserTarget, "window.__clioPhase0Poc.ping()", 1_000);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolveTimer) => setTimeout(resolveTimer, 100));
    }
  }
  const diagnostics = await evaluate(
    browserTarget.webSocketDebuggerUrl,
    `(() => ({
      href: location.href,
      readyState: document.readyState,
      hasHost: Boolean(window.__clioPhase0Poc),
      scripts: Array.from(document.scripts).map((script) => script.src),
      modulePreloads: Array.from(document.querySelectorAll('link[rel="modulepreload"]')).map((link) => link.href),
    }))()`,
    1_000,
  ).catch((error) => ({
    diagnosticsError: error instanceof Error ? error.message : String(error),
  }));
  throw new Error(
    `${label} POC host not ready after ${timeoutMs}ms: ${lastError}; diagnostics=${JSON.stringify(
      diagnostics,
    )}`,
  );
}

async function runBrowserPoc(browserTarget, expression, timeoutMs = 15_000) {
  return evaluate(
    browserTarget.webSocketDebuggerUrl,
    `(async () => {
      if (!window.__clioPhase0Poc) {
        throw new Error("Phase 0 POC host is not ready");
      }
      return await ${expression};
    })()`,
    timeoutMs,
  );
}

async function runServiceWorkerStorageCapabilities(workerTarget) {
  return evaluate(
    workerTarget.webSocketDebuggerUrl,
    `(() => ({
      poc: "service-worker-storage-capabilities",
      hasIndexedDb: typeof indexedDB !== "undefined",
      hasOpfs: typeof navigator.storage?.getDirectory === "function",
      hasWorker: typeof Worker !== "undefined",
      origin: location.origin,
      href: location.href,
    }))()`,
    1_000,
  );
}

async function runServiceWorkerIndexedDbFallback(workerTarget) {
  return evaluate(
    workerTarget.webSocketDebuggerUrl,
    `(async () => {
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
      function tokenize(text) {
        return Array.from(new Set(text.toLowerCase().match(/[\\p{L}\\p{N}]+/gu) ?? []));
      }
      function percentile(values, p) {
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
        return sorted[index] ?? 0;
      }
      const openRequest = indexedDB.open("clio-phase0-sw-poc-" + Date.now(), 1);
      openRequest.onupgradeneeded = () => {
        const db = openRequest.result;
        db.createObjectStore("chunks", { keyPath: "id" });
        db.createObjectStore("postings", { keyPath: "term" });
      };
      const db = await requestToPromise(openRequest);
      try {
        const writeTx = db.transaction(["chunks", "postings"], "readwrite");
        const chunks = writeTx.objectStore("chunks");
        const postings = writeTx.objectStore("postings");
        const index = new Map();
        for (let id = 0; id < 1000; id += 1) {
          const text = "Clio browser memory chunk " + id + " " + (id % 10 === 0 ? "retrieval target" : "ordinary text");
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
        if (hits !== 100) throw new Error("expected 100 hits, got " + hits);
        if (p95 >= 200) throw new Error("expected P95 < 200ms, got " + p95.toFixed(1) + "ms");
        return {
          poc: "POC-10",
          hostKind: "service-worker",
          chunks: 1000,
          query: "retrieval",
          hits,
          p95Ms: Number(p95.toFixed(2)),
        };
      } finally {
        db.close();
      }
    })()`,
    20_000,
  );
}

async function resultOrError(fn) {
  try {
    const value = await fn();
    return { status: "pass", ...value };
  } catch (error) {
    return {
      status: "fail",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const profileDir = await mkdtemp(join(tmpdir(), "clio-browser-cdp-"));
const persistedValue = `clio-opfs-${Date.now()}`;
const started = performance.now();
let firstChrome;
let secondChrome;
let summaryPrinted = false;
const summary = {
  status: "fail",
  chromePath,
};

try {
  firstChrome = await launchChrome(profileDir);
  summary.browserVersion = await getBrowserVersion(firstChrome.port);
  const manifest = JSON.parse(await readFile(join(extensionDir, "manifest.json"), "utf8"));
  const firstWorker = await findServiceWorker(firstChrome.port, manifest, firstChrome.stderrLog);
  const firstWorkerApi = await waitForServiceWorkerApi(firstWorker);
  const extensionId =
    firstWorker.runtimeIdentity?.runtimeId ?? getExtensionIdFromUrl(firstWorker.url);
  Object.assign(summary, {
    extensionId,
    serviceWorkerUrl: firstWorker.url,
    runtimeManifest: {
      name: firstWorker.runtimeIdentity?.manifest?.name,
      version: firstWorker.runtimeIdentity?.manifest?.version,
      background: firstWorker.runtimeIdentity?.manifest?.background,
    },
    manifest: {
      name: manifest.name,
      version: manifest.version,
      permissions: manifest.permissions,
      host_permissions: manifest.host_permissions,
      commands: Object.keys(manifest.commands ?? {}),
      content_security_policy: manifest.content_security_policy,
    },
  });
  summary.serviceWorkerApi = firstWorkerApi;
  const firstOffscreen = await ensureOffscreenDocument(firstWorker, firstChrome.port).catch(
    async (error) => {
      summary.offscreen = {
        status: "blocked",
        error: error instanceof Error ? error.message : String(error),
      };
      const page = await openPocExtensionPage(firstWorker, firstChrome.port, extensionId).catch(
        (pageError) => ({
          status: "blocked",
          error: pageError instanceof Error ? pageError.message : String(pageError),
        }),
      );
      if (page.target) {
        summary.extensionPage = {
          url: page.url,
          ping: page.ping,
        };
        summary.opfs = {
          extensionPageImmediate: await resultOrError(() =>
            runBrowserPoc(
              page.target,
              `window.__clioPhase0Poc.opfsWriteRead(${JSON.stringify(persistedValue)})`,
            ),
          ),
          note: "Extension-page OPFS is fallback evidence only; Offscreen OPFS remains blocked.",
        };
        summary.sqlite = await resultOrError(() =>
          runBrowserPoc(page.target, "window.__clioPhase0Poc.sqliteFts5()"),
        );
        summary.indexedDb = await resultOrError(() =>
          runBrowserPoc(page.target, "window.__clioPhase0Poc.indexedDbFallback()"),
        );
        summary.runtime = {
          extensionPage: await resultOrError(() =>
            runBrowserPoc(page.target, "window.__clioPhase0Poc.workerRuntimeCsp()"),
          ),
        };
      } else {
        summary.extensionPage = page;
        summary.opfs = {
          status: "blocked",
          error: "Offscreen and extension pages are not available in this headless Chrome run.",
        };
        summary.sqlite = {
          status: "blocked",
          error: "Browser extension page context is not available in this headless Chrome run.",
        };
        summary.serviceWorkerFallback = {
          storageCapabilities: await resultOrError(() =>
            runServiceWorkerStorageCapabilities(firstWorker),
          ),
          indexedDb: await resultOrError(() => runServiceWorkerIndexedDbFallback(firstWorker)),
        };
        summary.indexedDb = summary.serviceWorkerFallback.indexedDb;
      }
      summary.status = "blocked";
      summary.durationMs = Math.round(performance.now() - started);
      console.log(JSON.stringify(summary, null, 2));
      process.exitCode = 1;
      summaryPrinted = true;
      return null;
    },
  );
  if (!firstOffscreen) {
    // Offscreen is the hard Phase 0 blocker. Extension-page POCs above are
    // recorded only to decide whether an IndexedDB-first fallback is viable.
  } else {
    summary.offscreen = {
      first: {
        request: firstOffscreen.request,
        targetUrl: firstOffscreen.target.url,
        ping: firstOffscreen.ping,
      },
    };
    const firstRead = await resultOrError(() =>
      runBrowserPoc(
        firstOffscreen.target,
        `window.__clioPhase0Poc.opfsWriteRead(${JSON.stringify(persistedValue)})`,
      ),
    );
    const sqlite = await resultOrError(() =>
      runBrowserPoc(firstOffscreen.target, "window.__clioPhase0Poc.sqliteFts5()"),
    );
    const indexedDb = await resultOrError(() =>
      runBrowserPoc(firstOffscreen.target, "window.__clioPhase0Poc.indexedDbFallback()"),
    );
    const firstRuntime = await resultOrError(() =>
      runBrowserPoc(firstOffscreen.target, "window.__clioPhase0Poc.workerRuntimeCsp()", 30_000),
    );
    await stopChrome(firstChrome.processHandle);

    secondChrome = await launchChrome(profileDir);
    const secondWorker = await findServiceWorker(
      secondChrome.port,
      manifest,
      secondChrome.stderrLog,
    );
    const secondWorkerApi = await waitForServiceWorkerApi(secondWorker);
    summary.serviceWorkerUrlAfterRestart = secondWorker.url;
    summary.serviceWorkerApiAfterRestart = secondWorkerApi;
    const secondOffscreen = await ensureOffscreenDocument(secondWorker, secondChrome.port);
    summary.offscreen.second = {
      request: secondOffscreen.request,
      targetUrl: secondOffscreen.target.url,
      ping: secondOffscreen.ping,
    };
    const secondRead = await resultOrError(() =>
      runBrowserPoc(secondOffscreen.target, "window.__clioPhase0Poc.opfsRead()"),
    );
    const secondRuntime = await resultOrError(() =>
      runBrowserPoc(secondOffscreen.target, "window.__clioPhase0Poc.workerRuntimeCsp()", 30_000),
    );

    const opfsPassed =
      firstRead.status === "pass" &&
      secondRead.status === "pass" &&
      firstRead.value === persistedValue &&
      secondRead.value === persistedValue;
    if (firstRead.status === "pass" && secondRead.status === "pass" && !opfsPassed) {
      summary.opfs = {
        status: "fail",
        writeRead: firstRead,
        readAfterRestart: secondRead,
        error: "OPFS persisted value mismatch after Chrome restart",
      };
    } else {
      summary.opfs = {
        status: opfsPassed ? "pass" : "fail",
        writeRead: firstRead,
        readAfterRestart: secondRead,
      };
    }

    summary.sqlite = sqlite;
    summary.indexedDb = indexedDb;
    summary.runtime = {
      first: firstRuntime,
      second: secondRuntime,
    };
    summary.status =
      opfsPassed &&
      sqlite.status === "pass" &&
      indexedDb.status === "pass" &&
      firstRuntime.status === "pass" &&
      secondRuntime.status === "pass"
        ? "pass"
        : "fail";
    summary.durationMs = Math.round(performance.now() - started);
    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== "pass") process.exitCode = 1;
  }
} catch (error) {
  if (!summaryPrinted) {
    summary.durationMs = Math.round(performance.now() - started);
    if (error instanceof BrowserSmokeBlockedError) {
      summary.status = "blocked";
      summary.error = error.message;
      summary.extensionLoad = error.diagnostics;
    } else {
      summary.error = error instanceof Error ? error.message : String(error);
    }
    console.log(JSON.stringify(summary, null, 2));
    process.exitCode = 1;
  }
} finally {
  if (firstChrome?.processHandle && !firstChrome.processHandle.killed) {
    await stopChrome(firstChrome.processHandle);
  }
  if (secondChrome?.processHandle && !secondChrome.processHandle.killed) {
    await stopChrome(secondChrome.processHandle);
  }
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
