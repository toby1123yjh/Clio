#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createReadStream, existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";

const workspaceRoot = resolve("..");
const extensionDir = resolve("apps/extension/.output/chrome-mv3");
const manifestPath = join(extensionDir, "manifest.json");
const outputDir = resolve("poc/output/phase2a-ui");
const reportPath = resolve("poc/phase2a-ui-visual-report.md");

const viewport = { width: 2048, height: 960 };
const prototypeStates = [
  {
    id: "agent-home",
    title: "Agent Home reference",
    path: "/design/ui-design/v1/clio_rail_v1/code.html",
    screenshot: "phase2a-reference-agent-home.png",
  },
  {
    id: "collapsed",
    title: "Collapsed reference",
    path: "/design/ui-design/v1/clio_rail_v1/collapsed.html",
    screenshot: "phase2a-reference-collapsed.png",
  },
  {
    id: "knowledge-base",
    title: "Knowledge Base reference",
    path: "/design/ui-design/v1/clio_rail_v1/knowledge-base.html",
    screenshot: "phase2a-reference-knowledge-base.png",
  },
  {
    id: "selection",
    title: "Selection reference",
    path: "/design/ui-design/v1/clio_rail_v1/selection.html",
    screenshot: "phase2a-reference-selection.png",
  },
];

const actualStates = [
  {
    id: "collapsed",
    title: "Actual collapsed entry",
    screenshot: "phase2a-actual-collapsed.png",
    waitFor: "collapsed",
  },
  {
    id: "selection",
    title: "Actual selection mini UI",
    screenshot: "phase2a-actual-selection.png",
    action: showSelectionMiniUi,
    waitFor: "selection-mini-ui",
  },
  {
    id: "agent-home",
    title: "Actual Agent Home",
    screenshot: "phase2a-actual-agent-home.png",
    action: openRailFromCollapsed,
    waitFor: "agent-home",
  },
  {
    id: "selection-chip",
    title: "Actual Agent Home selection chip",
    screenshot: "phase2c-actual-selection-chip.png",
    action: openRailFromSelectionMiniUi,
    waitFor: "selection-chip",
  },
  {
    id: "command-palette",
    title: "Actual command palette",
    screenshot: "phase2b-actual-command-palette.png",
    action: openCommandPaletteFromCollapsed,
    waitFor: "command-palette",
  },
  {
    id: "knowledge-base",
    title: "Actual Knowledge Base",
    screenshot: "phase2a-actual-knowledge-base.png",
    action: openKnowledgeBaseFromCollapsed,
    clipSelector: '[data-clio-view="knowledge-base"]',
    waitFor: "knowledge-base",
  },
];

const browserCandidates = [
  ["CHROME_FOR_TESTING_PATH", process.env.CHROME_FOR_TESTING_PATH],
  ["CHROMIUM_PATH", process.env.CHROMIUM_PATH],
  ...findPlaywrightChromiumCandidates(),
  ["CHROME_PATH", process.env.CHROME_PATH],
  [
    "ProgramFiles Chrome",
    process.env.ProgramFiles
      ? join(process.env.ProgramFiles, "Google/Chrome/Application/chrome.exe")
      : undefined,
  ],
  [
    "ProgramFiles(x86) Chrome",
    process.env["ProgramFiles(x86)"]
      ? join(process.env["ProgramFiles(x86)"], "Google/Chrome/Application/chrome.exe")
      : undefined,
  ],
  [
    "LOCALAPPDATA Chrome",
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe")
      : undefined,
  ],
  [
    "ProgramFiles Edge",
    process.env.ProgramFiles
      ? join(process.env.ProgramFiles, "Microsoft/Edge/Application/msedge.exe")
      : undefined,
  ],
].filter(([, candidate]) => candidate && existsSync(candidate));

function findPlaywrightChromiumCandidates() {
  const roots = [
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : undefined,
    process.env.USERPROFILE ? join(process.env.USERPROFILE, ".cache/ms-playwright") : undefined,
  ].filter(Boolean);
  const candidates = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("chromium-")) continue;
      const executablePath = join(root, entry.name, "chrome-win64", "chrome.exe");
      if (existsSync(executablePath)) candidates.push([`Playwright ${entry.name}`, executablePath]);
    }
  }
  return candidates;
}

if (browserCandidates.length === 0) {
  throw new Error(
    "No Chrome/Chromium executable found. Set CHROME_FOR_TESTING_PATH, CHROMIUM_PATH, or CHROME_PATH.",
  );
}

class CdpSession {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = [];
    this.events = [];
  }

  async open() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolveOpen, rejectOpen) => {
      this.socket.addEventListener("open", resolveOpen, { once: true });
      this.socket.addEventListener("error", rejectOpen, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolveMessage, rejectMessage } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) rejectMessage(new Error(message.error.message));
        else resolveMessage(message.result);
        return;
      }
      if (!message.method) return;
      if (
        message.method === "Runtime.exceptionThrown" ||
        message.method === "Runtime.consoleAPICalled" ||
        message.method === "Log.entryAdded"
      ) {
        this.events.push({
          method: message.method,
          params: message.params,
        });
        this.events = this.events.slice(-30);
      }
      for (const waiter of [...this.eventWaiters]) {
        if (waiter.method !== message.method) continue;
        this.eventWaiters = this.eventWaiters.filter((entry) => entry !== waiter);
        clearTimeout(waiter.timer);
        waiter.resolveEvent(message.params ?? {});
      }
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

  waitForEvent(method, timeoutMs = 10_000) {
    return new Promise((resolveEvent, rejectEvent) => {
      const timer = setTimeout(() => {
        this.eventWaiters = this.eventWaiters.filter(
          (entry) => entry.resolveEvent !== resolveEvent,
        );
        rejectEvent(new Error(`CDP event ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.eventWaiters.push({ method, resolveEvent, timer });
    });
  }

  close() {
    this.socket?.close();
  }
}

class AcceptanceBlockedError extends Error {
  constructor(message, diagnostics = {}) {
    super(message);
    this.name = "AcceptanceBlockedError";
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

async function startStaticServer() {
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/__clio_phase2a_fixture.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(renderFixtureHtml());
        return;
      }
      const decoded = decodeURIComponent(url.pathname);
      const filePath = resolve(workspaceRoot, `.${decoded}`);
      const rootWithSep = `${workspaceRoot}${sep}`;
      if (filePath !== workspaceRoot && !filePath.startsWith(rootWithSep)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      if (!existsSync(filePath)) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.writeHead(200, { "content-type": contentType(filePath) });
      createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

function contentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "text/javascript; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function renderFixtureHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Clio Phase 2A Fixture</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.025), transparent 70%),
        repeating-linear-gradient(0deg, rgba(255,255,255,0.028) 0px, rgba(255,255,255,0.028) 12px, transparent 12px, transparent 36px),
        #0d1117;
      color: #d6d9df;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(760px, calc(100vw - 72px));
      margin: 0 auto;
      padding: 68px 32px;
      line-height: 1.75;
    }
    .eyebrow {
      color: #7e8796;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 18px 0;
      color: #f0f3f7;
      font-size: 32px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    p { font-size: 17px; }
    ::selection { background: rgba(163, 222, 254, 0.28); color: #f8fbff; }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">example.com/article - 4 min read</div>
    <h1>Five-layer browser-native memory architecture</h1>
    <p id="selection-target">Clio keeps page evidence close to the browsing moment. The selected passage should stay focused, explicit, and small enough for the assistant to answer without reading unrelated page noise.</p>
    <p>Raw stores immutable evidence, Retrieval finds anchored passages, Working keeps current conversation context, Compiled turns repeated signals into durable insight, and Governance keeps privacy decisions visible.</p>
    <p>The Rail should feel attached to the page, shifting content when open and returning the page to full width when collapsed.</p>
  </main>
</body>
</html>`;
}

async function waitForFile(path, timeoutMs = 10_000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (existsSync(path)) return;
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 100));
  }
  throw new Error(`Timed out waiting for ${path}`);
}

async function launchBrowser(executablePath, profileDir, extraArgs = []) {
  const portFile = join(profileDir, "DevToolsActivePort");
  await rm(portFile, { force: true });
  const stderrLog = createBoundedLog();
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profileDir}`,
    ...extraArgs,
    "about:blank",
  ];
  const processHandle = spawn(executablePath, args, {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  processHandle.stderr?.on("data", (chunk) => stderrLog.append(chunk));
  await waitForFile(portFile);
  const [port] = (await readFile(portFile, "utf8")).trim().split(/\r?\n/);
  return { processHandle, port, stderrLog, executablePath };
}

async function stopBrowser(processHandle) {
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

async function browserVersion(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!response.ok) throw new Error(`CDP browser version failed: ${response.status}`);
  return response.json();
}

async function firstPageTarget(port) {
  const targets = await listTargets(port);
  const page = targets.find((target) => target.type === "page");
  if (!page) throw new Error("No page target found");
  return page;
}

async function pageSession(port) {
  const target = await firstPageTarget(port);
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  await session.call("Page.enable");
  await session.call("Runtime.enable");
  await session.call("Log.enable").catch(() => undefined);
  await session.call("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  return session;
}

async function navigate(session, url) {
  const load = session.waitForEvent("Page.loadEventFired", 15_000).catch(() => undefined);
  await session.call("Page.navigate", { url }, 10_000);
  await load;
  await waitForCondition(session, "document.readyState === 'complete'", 10_000);
}

async function evaluate(session, expression, timeoutMs = 10_000) {
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
}

async function evaluateInTarget(target, expression, timeoutMs = 10_000) {
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  try {
    return await evaluate(session, expression, timeoutMs);
  } finally {
    session.close();
  }
}

async function waitForCondition(session, expression, timeoutMs = 10_000) {
  const started = performance.now();
  let lastError = "";
  while (performance.now() - started < timeoutMs) {
    try {
      if (await evaluate(session, `Boolean(${expression})`, 1_000)) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 100));
  }
  throw new Error(`Timed out waiting for condition: ${expression}; ${lastError}`);
}

async function captureScreenshot(session, screenshotName, clipSelector) {
  const clip =
    clipSelector === undefined
      ? undefined
      : await evaluate(
          session,
          `(() => {
            const root = document.querySelector("#clio-toolbox-root")?.shadowRoot;
            const element = root?.querySelector(${JSON.stringify(clipSelector)});
            if (!element) throw new Error("Clip target not found");
            const rect = element.getBoundingClientRect();
            const x = Math.max(0, rect.left);
            const y = Math.max(0, rect.top);
            return {
              x,
              y,
              width: Math.max(1, Math.min(rect.width, window.innerWidth - x)),
              height: Math.max(1, Math.min(rect.height, window.innerHeight - y)),
              scale: 1,
            };
          })()`,
        );
  const result = await session.call(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: false, ...(clip === undefined ? {} : { clip }) },
    10_000,
  );
  const path = join(outputDir, screenshotName);
  await writeFile(path, Buffer.from(result.data, "base64"));
  return path;
}

async function capturePrototypeReferences(baseUrl, browserPath) {
  const profileDir = await mkdtemp(join(tmpdir(), "clio-phase2a-reference-"));
  let browser;
  try {
    browser = await launchBrowser(browserPath, profileDir);
    const session = await pageSession(browser.port);
    try {
      const screenshots = [];
      for (const state of prototypeStates) {
        await navigate(session, `${baseUrl}${state.path}`);
        const path = await captureScreenshot(session, state.screenshot);
        screenshots.push({ ...state, path });
      }
      return {
        status: "pass",
        browser: await browserVersion(browser.port),
        screenshots,
      };
    } finally {
      session.close();
    }
  } finally {
    if (browser) await stopBrowser(browser.processHandle);
    await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

async function captureActualExtension(baseUrl, manifest) {
  const attempts = [];
  for (const [label, executablePath] of browserCandidates) {
    const profileDir = await mkdtemp(join(tmpdir(), "clio-phase2a-extension-"));
    let browser;
    try {
      browser = await launchBrowser(executablePath, profileDir, [
        "--enable-logging=stderr",
        "--vmodule=*extensions*=1,*extension*=1",
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
      ]);
      const version = await browserVersion(browser.port);
      const worker = await findClioServiceWorker(browser.port, manifest, browser.stderrLog);
      const session = await pageSession(browser.port);
      try {
        const screenshots = [];
        for (const state of actualStates) {
          try {
            await navigate(session, `${baseUrl}/__clio_phase2a_fixture.html`);
            await waitForActualState(session, "collapsed");
            if (state.action) await state.action(session);
            await waitForActualState(session, state.waitFor);
            await new Promise((resolveTimer) => setTimeout(resolveTimer, 250));
            const path = await captureScreenshot(session, state.screenshot, state.clipSelector);
            screenshots.push({ ...state, path });
          } catch (error) {
            const debug = await readActualDebug(session).catch((debugError) => ({
              debugError: debugError instanceof Error ? debugError.message : String(debugError),
            }));
            throw new Error(
              `Actual state ${state.id} failed: ${
                error instanceof Error ? error.message : String(error)
              }; debug=${JSON.stringify(debug)}`,
            );
          }
        }
        return {
          status: "pass",
          browserLabel: label,
          browserPath: executablePath,
          browser: version,
          runtimeManifest: worker.runtimeIdentity?.manifest,
          serviceWorkerUrl: worker.url,
          screenshots,
        };
      } finally {
        session.close();
      }
    } catch (error) {
      attempts.push({
        label,
        executablePath,
        status: error instanceof AcceptanceBlockedError ? "blocked" : "fail",
        error: error instanceof Error ? error.message : String(error),
        diagnostics: error instanceof AcceptanceBlockedError ? error.diagnostics : undefined,
      });
    } finally {
      if (browser) await stopBrowser(browser.processHandle);
      await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
  const last = attempts.at(-1);
  return {
    status: "blocked",
    error: last?.error ?? "No browser candidate could load the Clio extension.",
    attempts,
  };
}

async function findClioServiceWorker(port, expectedManifest, stderrLog) {
  const started = performance.now();
  let lastDiagnostics = [];
  while (performance.now() - started < 10_000) {
    const targets = await listTargets(port);
    const workers = targets.filter(
      (target) => target.type === "service_worker" && target.url.startsWith("chrome-extension://"),
    );
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
  throw new AcceptanceBlockedError(
    chromeBlockedCommandLineLoad
      ? "Browser rejected command-line unpacked extension loading."
      : "Clio extension runtime manifest was not found.",
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

async function readRuntimeIdentity(target) {
  return evaluateInTarget(
    target,
    `(() => ({
      runtimeId: chrome.runtime?.id,
      manifest: chrome.runtime?.getManifest?.(),
      href: location.href,
    }))()`,
    1_000,
  );
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

async function waitForActualState(session, state) {
  const expressions = {
    collapsed:
      "document.querySelector('#clio-toolbox-root')?.shadowRoot?.querySelector('[data-clio-rail-state=\"collapsed\"]')",
    "agent-home":
      "document.querySelector('#clio-toolbox-root')?.shadowRoot?.querySelector('[data-clio-view=\"agent-home\"]')",
    "knowledge-base":
      "document.querySelector('#clio-toolbox-root')?.shadowRoot?.querySelector('[data-clio-view=\"knowledge-base\"]')",
    "selection-mini-ui":
      "document.querySelector('#clio-toolbox-root')?.shadowRoot?.querySelector('[data-clio-selection-mini-ui=\"true\"]')",
    "selection-candidate":
      "document.querySelector('#clio-toolbox-root')?.shadowRoot?.querySelector('[data-clio-selection-candidate=\"true\"]')",
    "selection-chip":
      "document.querySelector('#clio-toolbox-root')?.shadowRoot?.querySelector('[data-clio-selection-chip=\"true\"]')",
    "command-palette":
      "document.querySelector('#clio-toolbox-root')?.shadowRoot?.querySelector('[data-clio-command-palette=\"true\"]')",
  };
  try {
    await waitForCondition(session, expressions[state], 12_000);
  } catch (error) {
    const debug = await readActualDebug(session).catch((debugError) => ({
      debugError: debugError instanceof Error ? debugError.message : String(debugError),
    }));
    const events = (session.events ?? []).map((event) => summarizeCdpEvent(event));
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; debug=${JSON.stringify({
        ...debug,
        events,
      })}`,
    );
  }
}

async function readActualDebug(session) {
  const debug = await evaluate(
    session,
    `(() => {
      const root = document.querySelector("#clio-toolbox-root")?.shadowRoot;
      return {
        selectionText: window.getSelection()?.toString() ?? "",
        hasRoot: Boolean(root),
        rootHtmlSnippet: root?.innerHTML?.slice(0, 500) ?? "",
        railState: root?.querySelector("[data-clio-rail-state]")?.getAttribute("data-clio-rail-state") ?? null,
        railView: root?.querySelector("[data-clio-view]")?.getAttribute("data-clio-view") ?? null,
        hasSelectionMini: Boolean(root?.querySelector('[data-clio-selection-mini-ui="true"]')),
        hasCommandPalette: Boolean(root?.querySelector('[data-clio-command-palette="true"]')),
      };
    })()`,
    1_000,
  );
  return {
    ...debug,
    events: (session.events ?? []).map((event) => summarizeCdpEvent(event)),
  };
}

function summarizeCdpEvent(event) {
  if (event.method === "Runtime.exceptionThrown") {
    return {
      method: event.method,
      text: event.params?.exceptionDetails?.text,
      description: event.params?.exceptionDetails?.exception?.description,
    };
  }
  if (event.method === "Runtime.consoleAPICalled") {
    return {
      method: event.method,
      type: event.params?.type,
      args: event.params?.args?.map((arg) => arg.value ?? arg.description).slice(0, 4),
    };
  }
  if (event.method === "Log.entryAdded") {
    return {
      method: event.method,
      level: event.params?.entry?.level,
      text: event.params?.entry?.text,
    };
  }
  return event;
}

async function openRailFromCollapsed(session) {
  await evaluate(
    session,
    `(() => {
      window.getSelection()?.removeAllRanges();
      document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
      const root = document.querySelector("#clio-toolbox-root")?.shadowRoot;
      const button = root?.querySelector('[data-clio-rail-state="collapsed"]');
      if (!button) throw new Error("Collapsed Clio handle not found");
      const rect = button.getBoundingClientRect();
      button.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        pointerId: 1,
        pointerType: "mouse",
      }));
      window.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        pointerId: 1,
        pointerType: "mouse",
      }));
      return true;
    })()`,
  );
}

async function openKnowledgeBase(session) {
  await evaluate(
    session,
    `(() => {
      window.getSelection()?.removeAllRanges();
      document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
      const root = document.querySelector("#clio-toolbox-root")?.shadowRoot;
      const button =
        root?.querySelector('button[aria-label="Knowledge"]') ??
        root?.querySelector('[data-clio-panel="toolbox"] button');
      if (!button) throw new Error("Knowledge Base navigation button not found");
      button.click();
      return true;
    })()`,
  );
}

async function openKnowledgeBaseFromCollapsed(session) {
  await openRailFromCollapsed(session);
  await waitForActualState(session, "agent-home");
  await openKnowledgeBase(session);
}

async function openCommandPaletteFromCollapsed(session) {
  await openRailFromCollapsed(session);
  await waitForActualState(session, "agent-home");
  await evaluate(
    session,
    `(() => {
      const root = document.querySelector("#clio-toolbox-root")?.shadowRoot;
      const button = root?.querySelector('button[aria-label="Actions"]');
      if (!button) throw new Error("Actions button not found");
      button.click();
      return true;
    })()`,
  );
}

async function openRailFromSelectionMiniUi(session) {
  await showSelectionMiniUi(session);
  await waitForActualState(session, "selection-mini-ui");
  await evaluate(
    session,
    `(() => {
      const root = document.querySelector("#clio-toolbox-root")?.shadowRoot;
      const button = root?.querySelector('[data-clio-selection-mini-ui="true"] button[aria-label="Add selection"]');
      if (!button) throw new Error("Selection Add button not found");
      button.click();
      return true;
    })()`,
  );
  await waitForActualState(session, "selection-candidate");
  await evaluate(
    session,
    `(() => {
      const root = document.querySelector("#clio-toolbox-root")?.shadowRoot;
      const button = root?.querySelector('[data-clio-selection-candidate="true"]');
      if (!button) throw new Error("Selection candidate button not found");
      button.click();
      return true;
    })()`,
  );
}

async function showSelectionMiniUi(session) {
  const rect = await evaluate(
    session,
    `(() => {
      const target = document.querySelector("#selection-target");
      if (!target) throw new Error("Selection fixture target not found");
      const rect = target.getBoundingClientRect();
      return {
        startX: Math.round(rect.left + 12),
        startY: Math.round(rect.top + Math.min(24, rect.height / 2)),
        endX: Math.round(Math.min(rect.right - 12, rect.left + 520)),
        endY: Math.round(rect.top + Math.min(24, rect.height / 2)),
      };
    })()`,
  );
  await session.call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: rect.startX,
    y: rect.startY,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await session.call("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: Math.round((rect.startX + rect.endX) / 2),
    y: rect.endY,
    button: "left",
    buttons: 1,
  });
  await session.call("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: rect.endX,
    y: rect.endY,
    button: "left",
    buttons: 1,
  });
  await session.call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: rect.endX,
    y: rect.endY,
    button: "left",
    buttons: 0,
    clickCount: 1,
  });
}

function screenshotLink(path) {
  return path ? `\`${relative(resolve("."), path).replaceAll("\\", "/")}\`` : "not captured";
}

async function writeReport({ generatedAt, reference, actual }) {
  const lines = [
    "# Phase 2A UI Visual Acceptance Report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Reference Screenshots",
    "",
    `Status: ${reference.status}`,
    "",
    "| State | Screenshot |",
    "|---|---|",
    ...reference.screenshots.map((item) => `| ${item.title} | ${screenshotLink(item.path)} |`),
    "",
    "## Actual Extension Screenshots",
    "",
    `Status: ${actual.status}`,
    "",
  ];

  if (actual.status === "pass") {
    lines.push(
      `Browser: ${actual.browser?.Browser ?? "unknown"}`,
      `Runtime manifest: ${actual.runtimeManifest?.name ?? "unknown"} ${actual.runtimeManifest?.version ?? ""}`,
      `Service worker: \`${actual.serviceWorkerUrl}\``,
      "",
      "| State | Screenshot |",
      "|---|---|",
      ...actual.screenshots.map((item) => `| ${item.title} | ${screenshotLink(item.path)} |`),
      "",
      "## Conclusion",
      "",
      "Actual extension UI screenshots were captured after verifying the Clio runtime manifest identity.",
      "",
    );
  } else {
    lines.push(
      `Blocked reason: ${actual.error}`,
      "",
      "```json",
      JSON.stringify(actual.attempts ?? actual, null, 2),
      "```",
      "",
      "## Manual Screenshot Fallback",
      "",
      "1. Run `pnpm build` from `Clio-browser/`.",
      "2. Load `apps/extension/.output/chrome-mv3` as an unpacked extension in a browser that permits local unpacked extensions.",
      "3. Open any normal `http://` or `https://` article page.",
      "4. Capture collapsed, Agent Home, Knowledge Base, command palette, and selected-text mini UI states.",
      "5. Compare them against the reference screenshots in `poc/output/phase2a-ui/`.",
      "",
      "## Conclusion",
      "",
      "Reference screenshots were captured, but actual extension screenshots are blocked until an extension-capable browser is available.",
      "",
    );
  }

  await writeFile(reportPath, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const started = performance.now();
  await mkdir(outputDir, { recursive: true });
  const server = await startStaticServer();
  const browserPath = browserCandidates[0][1];
  try {
    const generatedAt = new Date().toISOString();
    const reference = await capturePrototypeReferences(server.baseUrl, browserPath);
    const manifest = existsSync(manifestPath)
      ? JSON.parse(await readFile(manifestPath, "utf8"))
      : null;
    const actual =
      manifest === null
        ? {
            status: "blocked",
            error: "Build output missing. Run pnpm build before poc:phase2a-ui.",
            attempts: [],
          }
        : await captureActualExtension(server.baseUrl, manifest);
    await writeReport({ generatedAt, reference, actual });
    const summary = {
      status: actual.status === "pass" ? "pass" : "blocked",
      reportPath,
      outputDir,
      referenceScreenshots: reference.screenshots.map((item) => basename(item.path)),
      actualScreenshots:
        actual.status === "pass" ? actual.screenshots.map((item) => basename(item.path)) : [],
      error: actual.status === "pass" ? undefined : actual.error,
      durationMs: Math.round(performance.now() - started),
    };
    console.log(JSON.stringify(summary, null, 2));
    if (summary.status !== "pass") process.exitCode = 1;
  } finally {
    await server.close();
  }
}

await main();
