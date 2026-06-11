#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { loadClioLocalEnv } from "../scripts/local-env.mjs";

loadClioLocalEnv();

const chromeCandidates = [
  process.env.CHROME_PATH,
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ms-playwright/chromium-1200/chrome-win64/chrome.exe")
    : undefined,
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
  throw new Error("Chrome/Chromium executable not found. Set CHROME_PATH to run this smoke.");
}

const extensionDir = resolve("apps/extension/.output/chrome-mv3");
if (!existsSync(join(extensionDir, "manifest.json"))) {
  throw new Error("Build output missing. Run pnpm build before this smoke.");
}

const openAiChatConfig = readOpenAIChatConfig();

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
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 80));
  }
  throw new Error(`Timed out waiting for ${path}`);
}

async function launchChrome(profileDir, pageUrl) {
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
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    pageUrl,
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

async function evaluate(target, expression, timeoutMs = 10_000) {
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  try {
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

async function sendMouseClick(target, x, y) {
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  try {
    await session.call("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      clickCount: 1,
      type: "mousePressed",
      x,
      y,
    });
    await session.call("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 0,
      clickCount: 1,
      type: "mouseReleased",
      x,
      y,
    });
  } finally {
    session.close();
  }
}

async function sendEnterKey(target) {
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  try {
    const params = {
      code: "Enter",
      key: "Enter",
      nativeVirtualKeyCode: 13,
      windowsVirtualKeyCode: 13,
    };
    await session.call("Input.dispatchKeyEvent", { ...params, type: "keyDown" });
    await session.call("Input.dispatchKeyEvent", { ...params, type: "keyUp" });
  } finally {
    session.close();
  }
}

async function insertText(target, text) {
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  try {
    await session.call("Input.insertText", { text });
  } finally {
    session.close();
  }
}

async function waitForPageTarget(port, urlPrefix, timeoutMs = 10_000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const targets = await listTargets(port);
    const page = targets.find(
      (target) => target.type === "page" && target.url.startsWith(urlPrefix),
    );
    if (page) return page;
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 80));
  }
  throw new Error(`Page target not found for ${urlPrefix}`);
}

async function waitForExtensionWorker(port, timeoutMs = 10_000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const targets = await listTargets(port);
    const worker = targets.find(
      (target) =>
        target.type === "service_worker" &&
        target.url.startsWith("chrome-extension://") &&
        target.url.endsWith("/background.js"),
    );
    if (worker) return worker;
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 80));
  }
  throw new Error("Clio extension service worker target not found.");
}

async function waitForCondition(target, expression, label, timeoutMs = 10_000) {
  const started = performance.now();
  let lastValue;
  while (performance.now() - started < timeoutMs) {
    lastValue = await evaluate(target, expression, 1_000).catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
    if (lastValue === true) return;
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 80));
  }
  throw new Error(`${label} not reached; last=${JSON.stringify(lastValue)}`);
}

function startFixtureServer() {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Clio Rail click smoke</title>
          <style>
            body { margin: 0; font-family: Arial, sans-serif; line-height: 1.5; }
            main { max-width: 720px; padding: 48px; }
            p { font-size: 18px; }
          </style>
        </head>
        <body>
          <main>
            <h1>Clio Rail click smoke</h1>
            <p>This local page is used to verify that the injected Rail can receive real pointer clicks.</p>
            <p id="sample">The quick brown fox jumps over the lazy dog. Clio should not let page CSS resize its launcher.</p>
          </main>
        </body>
      </html>`);
  });
  return new Promise((resolveServer, rejectServer) => {
    server.on("error", rejectServer);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolveServer({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}

function selectorDiagnosticsExpression(selector) {
  return `(() => {
    const host = document.querySelector("#clio-toolbox-root");
    const shadow = host?.shadowRoot;
    const element = shadow?.querySelector(${JSON.stringify(selector)});
    if (!host || !shadow || !element) {
      return {
        exists: Boolean(element),
        hostExists: Boolean(host),
        shadowExists: Boolean(shadow),
        selector: ${JSON.stringify(selector)},
      };
    }
    const rect = element.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const topElement = shadow.elementFromPoint(center.x, center.y);
    const computed = getComputedStyle(element);
    return {
      exists: true,
      selector: ${JSON.stringify(selector)},
      rect: {
        left: Number(rect.left.toFixed(2)),
        top: Number(rect.top.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      },
      center,
      topElement: topElement
        ? {
            tagName: topElement.tagName,
            ariaLabel: topElement.getAttribute("aria-label"),
            title: topElement.getAttribute("title"),
            dataRailState: topElement.getAttribute("data-clio-rail-state"),
            dataPanel: topElement.getAttribute("data-clio-panel"),
            className: String(topElement.getAttribute("class") ?? ""),
          }
        : null,
      computed: {
        display: computed.display,
        pointerEvents: computed.pointerEvents,
        position: computed.position,
        width: computed.width,
        height: computed.height,
        fontSize: computed.fontSize,
        transform: computed.transform,
        zIndex: computed.zIndex,
      },
    };
  })()`;
}

function railSnapshotExpression() {
  return `(() => {
    const host = document.querySelector("#clio-toolbox-root");
    const shadow = host?.shadowRoot;
    if (!host || !shadow) return { hostExists: Boolean(host), shadowExists: Boolean(shadow) };
    const expanded = shadow.querySelector("[data-clio-rail-state='expanded']");
    const collapsed = shadow.querySelector("[data-clio-rail-state='collapsed']");
    const buttons = Array.from(shadow.querySelectorAll("button")).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        label: button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "",
        title: button.getAttribute("title"),
        disabled: button.disabled,
        rect: {
          left: Number(rect.left.toFixed(2)),
          top: Number(rect.top.toFixed(2)),
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2)),
        },
      };
    });
    return {
      hostExists: true,
      shadowExists: true,
      state: expanded ? "expanded" : collapsed ? "collapsed" : "missing",
      view: expanded?.getAttribute("data-clio-view") ?? null,
      buttons,
    };
  })()`;
}

function buttonSelector(label) {
  return `button[aria-label='${label.replaceAll("'", "\\'")}']`;
}

function buttonByTextExpression(text, occurrence = 0, scrollIntoView = false) {
  return `(() => {
    const host = document.querySelector("#clio-toolbox-root");
    const shadow = host?.shadowRoot;
    if (!host || !shadow) return null;
    const matches = Array.from(shadow.querySelectorAll("button")).filter((button) => {
      const value = (button.textContent ?? "").replace(/\\s+/g, " ").trim();
      return value === ${JSON.stringify(text)};
    });
    const button = matches[${occurrence}] ?? null;
    if (!button) return null;
    if (${scrollIntoView ? "true" : "false"}) {
      button.scrollIntoView({ block: "center", inline: "center" });
    }
    const rect = button.getBoundingClientRect();
    return {
      text: (button.textContent ?? "").replace(/\\s+/g, " ").trim(),
      rect: {
        left: Number(rect.left.toFixed(2)),
        top: Number(rect.top.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      },
      center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    };
  })()`;
}

function providerFormButtonByTextExpression(provider, text, scrollIntoView = false) {
  return `(() => {
    const shadow = document.querySelector("#clio-toolbox-root")?.shadowRoot;
    const form = shadow?.querySelector(${JSON.stringify(`[data-clio-provider-form='${provider}']`)});
    if (!form) return null;
    const button = Array.from(form.querySelectorAll("button")).find((candidate) => {
      const value = (candidate.textContent ?? "").replace(/\\s+/g, " ").trim();
      return value === ${JSON.stringify(text)};
    }) ?? null;
    if (!button) return null;
    if (${scrollIntoView ? "true" : "false"}) {
      button.scrollIntoView({ block: "center", inline: "center" });
    }
    const rect = button.getBoundingClientRect();
    return {
      text: (button.textContent ?? "").replace(/\\s+/g, " ").trim(),
      disabled: button.disabled,
      rect: {
        left: Number(rect.left.toFixed(2)),
        top: Number(rect.top.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      },
      center: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    };
  })()`;
}

function composerHasTextExpression(text) {
  return `(() => {
    const host = document.querySelector("#clio-toolbox-root");
    const shadow = host?.shadowRoot;
    const textarea = shadow?.querySelector("textarea[data-clio-composer-input='true']");
    return textarea?.value === ${JSON.stringify(text)};
  })()`;
}

function sendButtonReadyExpression() {
  return `(() => {
    const shadow = document.querySelector("#clio-toolbox-root")?.shadowRoot;
    const button = shadow?.querySelector("button[title='Send']");
    return Boolean(button && !button.disabled);
  })()`;
}

function selectProviderExpression(provider) {
  return `(() => {
    const shadow = document.querySelector("#clio-toolbox-root")?.shadowRoot;
    const select = shadow?.querySelector("#clio-rail-active-provider");
    if (!select) return null;
    select.value = ${JSON.stringify(provider)};
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { value: select.value };
  })()`;
}

function openAiChatResultExpression(expected) {
  return `(() => {
    const shadow = document.querySelector("#clio-toolbox-root")?.shadowRoot;
    if (!shadow) return { ready: false, reason: "shadow root missing" };
    const messages = Array.from(shadow.querySelectorAll("[data-clio-dialogue-role]")).map(
      (element) => ({
        role: element.getAttribute("data-clio-dialogue-role"),
        status: element.getAttribute("data-clio-dialogue-status"),
        text: (element.textContent ?? "").replace(/\\s+/g, " ").trim(),
      }),
    );
    const matching = messages.find(
      (message) =>
        message.role === "assistant" &&
        message.text.toLowerCase().includes(${JSON.stringify(expected)}),
    );
    if (matching?.status === "completed") return true;
    const failed = messages.find((message) => message.role === "assistant" && message.status === "failed");
    if (failed) return { ready: false, failed: failed.text.slice(0, 500) };
    if (matching) return { ready: false, pending: matching.status };
    return { ready: false, messages: messages.slice(-4) };
  })()`;
}

async function clickSelector(target, selector, label) {
  const diagnostics = await evaluate(target, selectorDiagnosticsExpression(selector), 2_000);
  if (!diagnostics.exists) {
    throw new Error(`${label} not found: ${JSON.stringify(diagnostics)}`);
  }
  const { center, topElement } = diagnostics;
  if (topElement === null) {
    throw new Error(`${label} center has no shadow top element: ${JSON.stringify(diagnostics)}`);
  }
  await sendMouseClick(target, center.x, center.y);
  return diagnostics;
}

function readOpenAIChatConfig() {
  const apiKey = process.env.CLIO_OPENAI_API_KEY?.trim();
  if (!apiKey) return undefined;
  return {
    apiKey,
    baseUrl: process.env.CLIO_OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
    model: process.env.CLIO_OPENAI_MODEL?.trim() || "gpt-5.5",
  };
}

async function seedOpenAIProviderConfig(port, config) {
  const worker = await waitForExtensionWorker(port);
  const updatedAt = new Date().toISOString();
  const result = await evaluate(
    worker,
    `new Promise((resolve) => {
      chrome.storage.local.set({
        "clio:provider:active": { provider: "openai", schemaVersion: 2, updatedAt: ${JSON.stringify(updatedAt)} },
        "clio:provider:openai-official": {
          provider: "openai",
          apiKey: ${JSON.stringify(config.apiKey)},
          model: ${JSON.stringify(config.model)},
          baseUrl: ${JSON.stringify(config.baseUrl)},
          updatedAt: ${JSON.stringify(updatedAt)}
        }
      }, () => {
        const error = chrome.runtime.lastError?.message;
        resolve({ ok: !error, error });
      });
    })`,
    5_000,
  );
  if (!result?.ok) {
    throw new Error(`Failed to seed OpenAI provider config: ${result?.error ?? "unknown error"}`);
  }
}

async function runOpenAIChatSmoke(page, port, summary) {
  if (!openAiChatConfig) {
    summary.checks.push({
      name: "openai-chat-smoke",
      status: "skipped",
      reason: "Set CLIO_OPENAI_API_KEY to run the real OpenAI chat smoke.",
    });
    return;
  }

  await seedOpenAIProviderConfig(port, openAiChatConfig);
  summary.checks.push({
    name: "openai-provider-seeded",
    status: "pass",
    model: openAiChatConfig.model,
    baseUrlOrigin: new URL(openAiChatConfig.baseUrl).origin,
  });

  const prompt = "Reply with exactly: clio openai chat smoke ok";
  const expected = "clio openai chat smoke ok";
  await clickSelector(page, "textarea[data-clio-composer-input='true']", "Composer input");
  await insertText(page, prompt);
  await waitForCondition(page, composerHasTextExpression(prompt), "Composer text input", 3_000);
  await waitForCondition(page, sendButtonReadyExpression(), "Composer send button ready", 3_000);
  await sendEnterKey(page);
  await waitForCondition(
    page,
    openAiChatResultExpression(expected),
    "OpenAI chat response",
    120_000,
  );
  summary.checks.push({
    name: "openai-chat-smoke",
    status: "pass",
    matchedExpected: true,
  });
}

const started = performance.now();
const profileDir = await mkdtemp(join(tmpdir(), "clio-rail-click-"));
let chrome;
let fixture;
const summary = {
  status: "fail",
  chromePath,
  extensionDir,
  checks: [],
};

try {
  fixture = await startFixtureServer();
  summary.fixtureUrl = fixture.url;
  chrome = await launchChrome(profileDir, fixture.url);
  const page = await waitForPageTarget(chrome.port, fixture.url);
  await waitForCondition(
    page,
    `Boolean(document.querySelector("#clio-toolbox-root")?.shadowRoot?.querySelector("[data-clio-rail-state='collapsed']"))`,
    "collapsed Rail handle",
  );

  const collapsed = await clickSelector(
    page,
    "[data-clio-rail-state='collapsed']",
    "Collapsed Rail",
  );
  summary.checks.push({
    name: "collapsed-handle-click",
    status: "clicked",
    diagnostics: collapsed,
  });

  await waitForCondition(
    page,
    `document.querySelector("#clio-toolbox-root")?.shadowRoot?.querySelector("[data-clio-rail-state='expanded']")?.getAttribute("data-clio-view") === "agent-home"`,
    "expanded Agent Home",
  );
  summary.checks.push({
    name: "expanded-agent-home",
    status: "pass",
    snapshot: await evaluate(page, railSnapshotExpression()),
  });

  const knowledge = await clickSelector(page, buttonSelector("Knowledge"), "Knowledge nav");
  summary.checks.push({ name: "knowledge-click", status: "clicked", diagnostics: knowledge });
  await waitForCondition(
    page,
    `document.querySelector("#clio-toolbox-root")?.shadowRoot?.querySelector("[data-clio-rail-state='expanded']")?.getAttribute("data-clio-view") === "knowledge-base"`,
    "Knowledge Base view",
  );
  summary.checks.push({
    name: "knowledge-view",
    status: "pass",
    snapshot: await evaluate(page, railSnapshotExpression()),
  });

  const home = await clickSelector(page, buttonSelector("Home"), "Home nav");
  summary.checks.push({ name: "home-click", status: "clicked", diagnostics: home });
  await waitForCondition(
    page,
    `document.querySelector("#clio-toolbox-root")?.shadowRoot?.querySelector("[data-clio-rail-state='expanded']")?.getAttribute("data-clio-view") === "agent-home"`,
    "Home view",
  );
  await runOpenAIChatSmoke(page, chrome.port, summary);

  const settings = await clickSelector(page, buttonSelector("Settings"), "Settings entry");
  summary.checks.push({ name: "settings-click", status: "clicked", diagnostics: settings });
  await waitForCondition(
    page,
    `document.querySelector("#clio-toolbox-root")?.shadowRoot?.querySelector("[data-clio-rail-state='expanded']")?.getAttribute("data-clio-view") === "settings"`,
    "Settings view",
  );
  summary.checks.push({
    name: "settings-view",
    status: "pass",
    snapshot: await evaluate(page, railSnapshotExpression()),
  });

  const providerSelect = await evaluate(page, selectProviderExpression("openai"), 2_000);
  if (!providerSelect) {
    throw new Error("Provider selector not found in settings view.");
  }
  await waitForCondition(
    page,
    `document.querySelector("#clio-toolbox-root")?.shadowRoot?.querySelector("#clio-rail-openai-key") !== null`,
    "OpenAI provider form",
  );
  await waitForCondition(
    page,
    `(() => {
      const shadow = document.querySelector("#clio-toolbox-root")?.shadowRoot;
      const form = shadow?.querySelector("[data-clio-provider-form='openai']");
      const button = Array.from(form?.querySelectorAll("button") ?? []).find((candidate) => {
        const value = (candidate.textContent ?? "").replace(/\\s+/g, " ").trim();
        return value === "Test connection";
      });
      return Boolean(button && !button.disabled);
    })()`,
    "OpenAI Test button enabled",
  );

  const testButton = await evaluate(
    page,
    providerFormButtonByTextExpression("openai", "Test connection", true),
    2_000,
  );
  if (!testButton) {
    throw new Error("OpenAI Test button not found in settings view.");
  }
  if (testButton.disabled) {
    throw new Error("OpenAI Test button is disabled after provider form loaded.");
  }
  await sendMouseClick(page, testButton.center.x, testButton.center.y);
  await waitForCondition(
    page,
    `(() => {
      const text = document.querySelector("#clio-toolbox-root")?.shadowRoot?.textContent ?? "";
      return text.includes("OpenAI provider saved.") ||
        text.includes("OpenAI connection works.") ||
        text.includes("OpenAI connection test failed.") ||
        text.includes("Enter and save an OpenAI API key before testing.");
    })()`,
    "OpenAI provider feedback visible",
  );
  await waitForCondition(
    page,
    `(() => {
      const text = document.querySelector("#clio-toolbox-root")?.shadowRoot?.textContent ?? "";
      return text.includes("OpenAI API key is required before saving provider settings.") ||
        text.includes("OpenAI connection test failed.") ||
        text.includes("Enter and save an OpenAI API key before testing.") ||
        text.includes("OpenAI provider saved.") ||
        text.includes("OpenAI connection works.");
    })()`,
    "OpenAI provider test feedback",
  );
  const providerFeedback = await evaluate(
    page,
    `(() => document.querySelector("#clio-toolbox-root")?.shadowRoot?.textContent ?? "")()`,
    2_000,
  );
  if (providerFeedback.includes("This function must be called during a user gesture")) {
    throw new Error("OpenAI test path still triggers a user-gesture permission error.");
  }
  summary.checks.push({
    name: "openai-test-click",
    status: "pass",
    feedback: providerFeedback.includes("Enter and save an OpenAI API key before testing.")
      ? "provider-config-required"
      : "provider-feedback-visible",
  });

  const actions = await clickSelector(page, buttonSelector("Actions"), "Actions nav");
  summary.checks.push({ name: "actions-click", status: "clicked", diagnostics: actions });
  await waitForCondition(
    page,
    `Boolean(document.querySelector("#clio-toolbox-root")?.shadowRoot?.querySelector("[data-clio-command-palette='true']"))`,
    "Command palette open",
  );
  summary.checks.push({
    name: "command-palette",
    status: "pass",
    snapshot: await evaluate(page, railSnapshotExpression()),
  });

  const collapse = await clickSelector(page, buttonSelector("Collapse"), "Collapse nav");
  summary.checks.push({ name: "collapse-click", status: "clicked", diagnostics: collapse });
  await waitForCondition(
    page,
    `Boolean(document.querySelector("#clio-toolbox-root")?.shadowRoot?.querySelector("[data-clio-rail-state='collapsed']"))`,
    "collapsed after nav click",
  );
  summary.checks.push({
    name: "collapsed-after-nav",
    status: "pass",
    snapshot: await evaluate(page, railSnapshotExpression()),
  });

  summary.status = "pass";
} catch (error) {
  summary.error = error instanceof Error ? error.message : String(error);
  if (chrome?.port) {
    const [page] = (await listTargets(chrome.port)).filter((target) => target.type === "page");
    if (page) {
      summary.lastSnapshot = await evaluate(page, railSnapshotExpression()).catch(
        (snapshotError) => ({
          error: snapshotError instanceof Error ? snapshotError.message : String(snapshotError),
        }),
      );
    }
  }
  summary.stderr = chrome?.stderrLog?.read?.()?.slice(-4000);
  process.exitCode = 1;
} finally {
  summary.durationMs = Math.round(performance.now() - started);
  console.log(JSON.stringify(summary, null, 2));
  if (chrome?.processHandle) await stopChrome(chrome.processHandle);
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  await new Promise((resolveClose) => fixture?.server?.close(resolveClose) ?? resolveClose());
}
