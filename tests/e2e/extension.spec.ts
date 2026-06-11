import { existsSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  type BrowserContext,
  type Page,
  type Response,
  chromium,
  expect,
  test,
} from "@playwright/test";
import { defaultOpenAIConfigBaseUrl } from "../../apps/extension/src/agent-runtime/openai-provider-config";
import { defaultOpenAIModel } from "../../apps/extension/src/agent-runtime/provider-settings";
import { loadClioLocalEnv } from "../../scripts/local-env.mjs";

loadClioLocalEnv();

const defaultTargetUrl =
  "https://baike.baidu.com/item/%E7%A7%91%E5%AD%A6%E5%AE%B6%E7%B2%BE%E7%A5%9E/53708306";

interface ProviderEnv {
  apiKey: string;
  baseUrl: string;
  model: string;
}

interface BrowserTarget {
  executablePath: string;
  label: string;
}

test("drives Clio extension in a real browser", async () => {
  const provider = readProviderEnv();
  const browserTarget = resolveBrowserTarget();
  const extensionDir = resolveExtensionDir();
  const targetUrl = process.env.CLIO_E2E_TARGET_URL?.trim() || defaultTargetUrl;
  const headless = process.env.CLIO_E2E_HEADLESS === "1";
  const keepOpen = process.env.CLIO_E2E_KEEP_OPEN === "1";
  const keepOpenOnFailure = process.env.CLIO_E2E_KEEP_OPEN_ON_FAILURE !== "0";
  const profileDir = await mkdtemp(path.join(tmpdir(), "clio-playwright-e2e-"));
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let passed = false;

  try {
    context = await chromium.launchPersistentContext(profileDir, {
      args: [
        "--no-first-run",
        "--no-default-browser-check",
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
      ],
      executablePath: browserTarget.executablePath,
      headless,
      ignoreDefaultArgs: ["--disable-extensions"],
      viewport: { height: 900, width: 1440 },
    });
    page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(60_000);

    await test.step("open the configured real website", async () => {
      let response: Response | null | undefined;
      try {
        response = await page?.goto(targetUrl, { waitUntil: "domcontentloaded" });
      } catch (error) {
        throw new Error(`Target page failed to load: ${targetUrl}. ${errorMessage(error)}`);
      }
      if (response === null || response === undefined) {
        throw new Error(`Target page failed to load: ${targetUrl}. No navigation response.`);
      }
      if (!response.ok()) {
        throw new Error(
          `Target page failed to load: ${targetUrl}. HTTP ${response.status()} ${response.statusText()}`,
        );
      }
      await page?.waitForFunction(() => (document.body?.innerText.trim().length ?? 0) > 100, {
        timeout: 20_000,
      });
    });

    await test.step("open Clio Rail", async () => {
      const collapsedLauncher = page.locator("[data-clio-rail-state='collapsed']");
      await expect(collapsedLauncher)
        .toBeVisible({ timeout: 30_000 })
        .catch(async (error) => {
          throw new Error(
            `${await buildClioInjectionDiagnostics({
              browserTarget,
              context,
              extensionDir,
              page,
            })} Original locator error: ${errorMessage(error)}`,
          );
        });
      await collapsedLauncher.click();
      const expandedRail = page.locator("[data-clio-rail-state='expanded']");
      await expect(expandedRail).toBeVisible();
      await expect(expandedRail).toHaveAttribute("data-clio-view", "agent-home");
    });

    await test.step("configure OpenAI provider through Settings", async () => {
      await page.getByRole("button", { name: "Settings" }).last().click();
      await expect(page.locator("[data-clio-view='settings']")).toBeVisible();

      const providerSelect = page.locator("#clio-rail-active-provider");
      await expect(providerSelect).toBeEnabled();
      await providerSelect.selectOption("openai");

      const openAIKey = page.locator("#clio-rail-openai-key");
      const openAIModel = page.locator("#clio-rail-openai-model");
      const openAIBaseUrl = page.locator("#clio-rail-openai-base-url");
      await expect(openAIKey).toBeVisible();
      await openAIKey.fill(provider.apiKey);
      await openAIModel.fill(provider.model);
      await openAIBaseUrl.fill(provider.baseUrl);

      const openAICard = page.locator("section").filter({ has: openAIKey }).last();
      await openAICard.scrollIntoViewIfNeeded();
      await openAICard.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("OpenAI provider saved.")).toBeVisible({
        timeout: 30_000,
      });
      await expect(openAIKey).toHaveValue(provider.apiKey);

      await openAICard.scrollIntoViewIfNeeded();
      await openAICard.getByRole("button", { name: "Test connection" }).click();
      const providerTest = await page.waitForFunction(
        () => {
          const root = document.querySelector("#clio-toolbox-root")?.shadowRoot;
          const message = root
            ?.querySelector("[data-clio-provider-message='true']")
            ?.textContent?.replace(/\s+/g, " ")
            .trim();
          if (message === undefined || message === "") return null;
          if (message === "OpenAI provider saved." || message === "OpenAI selected.") {
            return null;
          }
          return {
            ok: message === "OpenAI connection works.",
            message,
          };
        },
        undefined,
        { timeout: 120_000 },
      );
      const providerTestResult = await providerTest.jsonValue();
      if (!providerTestResult.ok) {
        throw new Error(`OpenAI connection test failed: ${providerTestResult.message}`);
      }
      await expect(openAIKey).toHaveValue(provider.apiKey);
    });

    await test.step("select visible page text and ask with selection context", async () => {
      await page.locator("button[title='Home']").click();
      await expect(page.locator("[data-clio-view='agent-home']")).toBeVisible();

      const selectionTarget = await page.evaluate(findVisibleSelectionTarget);
      if (selectionTarget === null) {
        throw new Error("Unable to find visible target text on the real page for selection.");
      }
      await page.mouse.move(selectionTarget.startX, selectionTarget.y);
      await page.mouse.down();
      await page.mouse.move(selectionTarget.endX, selectionTarget.y, { steps: 12 });
      await page.mouse.up();
      await page.waitForFunction(() => (window.getSelection()?.toString().trim().length ?? 0) > 0, {
        timeout: 5_000,
      });
      await expect(page.locator("[data-clio-selection-mini-ui='true']")).toBeVisible({
        timeout: 10_000,
      });
      console.info(`[clio:e2e] selected visible page text: ${selectionTarget.preview}`);

      const rail = page.locator("[data-clio-rail-state='expanded']");
      await expect(rail.locator("[data-clio-selection-candidate='true']")).toHaveCount(0);
      await expect(rail.locator("[data-clio-selection-chip='true']")).toHaveCount(0);
      await page
        .locator("[data-clio-selection-mini-ui='true'] button[aria-label='Open Clio']")
        .click();
      await expect(rail).toHaveAttribute("data-clio-view", "agent-home");
      await expect(rail.locator("[data-clio-selection-candidate='true']")).toHaveCount(0);
      await expect(rail.locator("[data-clio-selection-chip='true']")).toHaveCount(0);

      await selectVisibleText(page, selectionTarget);
      await expect(page.locator("[data-clio-selection-mini-ui='true']")).toBeVisible({
        timeout: 10_000,
      });
      await page
        .locator("[data-clio-selection-mini-ui='true'] button[aria-label='Add selection']")
        .click();
      await expect(rail.locator("[data-clio-selection-candidate='true']")).toHaveCount(0);
      await expect(rail.locator("[data-clio-selection-chip='true']")).toBeVisible({
        timeout: 10_000,
      });
      const composer = rail.locator("[data-clio-composer-input='true']");
      await composer.fill("Summarize the selected text in one short sentence.");
      const sendButton = rail.locator("[data-clio-composer-send='true']");
      await expect(sendButton).toBeEnabled();
      await composer.press("Enter");
      const submitResult = await page.waitForFunction(
        () => {
          const root = document.querySelector("#clio-toolbox-root")?.shadowRoot;
          const toast = root?.querySelector("[data-clio-toast]")?.textContent;
          if (toast !== undefined && toast.trim() !== "") {
            return {
              ok: false,
              message: toast.replace(/\s+/g, " ").trim(),
            };
          }
          const messageCount = root?.querySelectorAll("[data-clio-dialogue-role]").length ?? 0;
          if (messageCount > 0) return { ok: true, message: "" };
          return null;
        },
        undefined,
        { timeout: 10_000 },
      );
      const submitState = await submitResult.jsonValue();
      if (!submitState.ok) {
        throw new Error(`Clio did not accept the chat submission: ${submitState.message}`);
      }
      await expect(rail.locator("[data-clio-selection-chip='true']")).toHaveCount(0);

      let response: { status: string | null; text: string };
      try {
        const assistantResult = await page.waitForFunction(
          () => {
            const root = document.querySelector("#clio-toolbox-root")?.shadowRoot;
            const assistants = Array.from(
              root?.querySelectorAll("[data-clio-dialogue-role='assistant']") ?? [],
            );
            const latest = assistants.at(-1);
            if (latest === undefined) return null;
            const status = latest.getAttribute("data-clio-dialogue-status");
            const text = (latest.textContent ?? "").replace(/\s+/g, " ").trim();
            if (status === "failed") {
              throw new Error(text || "Assistant message failed.");
            }
            if (status === "completed" && text.length > 0) return { status, text };
            return null;
          },
          undefined,
          { timeout: 180_000 },
        );
        response = await assistantResult.jsonValue();
      } catch (error) {
        const diagnostics = await page.evaluate(readDialogueDiagnostics);
        throw new Error(
          `Assistant response did not complete. ${errorMessage(error)} Dialogue: ${JSON.stringify(
            diagnostics,
          )}`,
        );
      }
      if (response.text.includes("[[cite:")) {
        throw new Error(`Visible assistant response leaked raw citation markers: ${response.text}`);
      }
      console.info(`[clio:e2e] visible assistant response: ${response.text}`);
    });

    passed = true;
    if (keepOpen && !headless) {
      await holdBrowserOpen("CLIO_E2E_KEEP_OPEN=1", profileDir);
    }
  } catch (error) {
    if (context !== undefined && !headless && keepOpenOnFailure) {
      console.error(`[clio:e2e] failure: ${errorMessage(error)}`);
      await holdBrowserOpen("failure", profileDir);
    }
    throw error;
  } finally {
    if (passed || headless || context === undefined || !keepOpenOnFailure) {
      await context?.close();
      await rm(profileDir, { force: true, recursive: true });
    }
  }
});

function readProviderEnv(): ProviderEnv {
  const missing = ["CLIO_OPENAI_API_KEY"].filter(
    (name) => process.env[name]?.trim() === undefined || process.env[name]?.trim() === "",
  );
  if (missing.length > 0) {
    throw new Error(
      `Refusing to run Clio extension E2E without real provider config. Missing: ${missing.join(
        ", ",
      )}`,
    );
  }
  const baseUrl = process.env.CLIO_OPENAI_BASE_URL?.trim() || defaultOpenAIConfigBaseUrl;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:") throw new Error("Base URL must use HTTPS.");
  } catch (error) {
    throw new Error(`Invalid CLIO_OPENAI_BASE_URL. ${errorMessage(error)}`);
  }
  return {
    apiKey: process.env.CLIO_OPENAI_API_KEY?.trim() ?? "",
    baseUrl,
    model: process.env.CLIO_OPENAI_MODEL?.trim() || defaultOpenAIModel,
  };
}

function resolveExtensionDir() {
  const extensionDir = path.resolve(process.cwd(), "apps/extension/.output/chrome-mv3");
  const manifestPath = path.join(extensionDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Built extension output is missing at ${extensionDir}. Run pnpm build before using Playwright directly.`,
    );
  }
  return extensionDir;
}

function resolveBrowserTarget(): BrowserTarget {
  const explicitChromePath = process.env.CHROME_PATH?.trim();
  if (explicitChromePath !== undefined && explicitChromePath !== "") {
    if (!existsSync(explicitChromePath)) {
      throw new Error(`CHROME_PATH does not exist: ${explicitChromePath}`);
    }
    return { executablePath: explicitChromePath, label: "CHROME_PATH" };
  }

  const requestedBrowser = process.env.CLIO_E2E_BROWSER?.trim().toLowerCase() || "chrome";
  if (requestedBrowser === "chromium") {
    return {
      executablePath: resolveChromiumPath(),
      label: "Playwright Chromium",
    };
  }
  if (requestedBrowser !== "chrome") {
    throw new Error("CLIO_E2E_BROWSER must be either 'chrome' or 'chromium'.");
  }
  return { executablePath: resolveChromePath(), label: "Google Chrome" };
}

function resolveChromePath() {
  const explicitChromePath = process.env.CHROME_PATH?.trim();
  if (explicitChromePath !== undefined && explicitChromePath !== "") {
    if (!existsSync(explicitChromePath)) {
      throw new Error(`CHROME_PATH does not exist: ${explicitChromePath}`);
    }
    return explicitChromePath;
  }
  const candidates = [
    process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, "Google/Chrome/Application/chrome.exe")
      : undefined,
    process.env["ProgramFiles(x86)"]
      ? path.join(process.env["ProgramFiles(x86)"], "Google/Chrome/Application/chrome.exe")
      : undefined,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe")
      : undefined,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/opt/google/chrome/chrome",
  ].filter((candidate): candidate is string => candidate !== undefined);
  const chromePath = candidates.find((candidate) => existsSync(candidate));
  if (chromePath === undefined) {
    throw new Error("Google Chrome was not found. Install Chrome or set CHROME_PATH.");
  }
  return chromePath;
}

function resolveChromiumPath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH?.trim(),
    chromium.executablePath(),
    ...findInstalledPlaywrightChromiumPaths(),
  ].filter((candidate): candidate is string => candidate !== undefined && candidate !== "");
  const chromiumPath = candidates.find((candidate) => existsSync(candidate));
  if (chromiumPath === undefined) {
    throw new Error(
      "Playwright Chromium was not found. Run `pnpm exec playwright install chromium`, set PLAYWRIGHT_CHROMIUM_PATH, or set CHROME_PATH.",
    );
  }
  return chromiumPath;
}

function findInstalledPlaywrightChromiumPaths() {
  const roots = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ms-playwright") : undefined,
    process.env.HOME ? path.join(process.env.HOME, ".cache", "ms-playwright") : undefined,
  ].filter((root): root is string => root !== undefined && existsSync(root));

  const candidates: string[] = [];
  for (const root of roots) {
    const dirs = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^chromium-\d+$/.test(entry.name))
      .map((entry) => entry.name)
      .sort(
        (left, right) =>
          Number(right.replace("chromium-", "")) - Number(left.replace("chromium-", "")),
      );
    for (const dir of dirs) {
      candidates.push(path.join(root, dir, "chrome-win64", "chrome.exe"));
      candidates.push(path.join(root, dir, "chrome-linux", "chrome"));
      candidates.push(
        path.join(root, dir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
      );
    }
  }
  return candidates;
}

async function buildClioInjectionDiagnostics(options: {
  browserTarget: BrowserTarget;
  context: BrowserContext;
  extensionDir: string;
  page: Page;
}) {
  const [pageState, browserVersion] = await Promise.all([
    options.page
      .evaluate(() => ({
        clioRoot: Boolean(document.querySelector("#clio-toolbox-root")),
        href: location.href,
        readyState: document.readyState,
      }))
      .catch((error) => ({ error: errorMessage(error) })),
    Promise.resolve(options.context.browser()?.version()).catch((error) => errorMessage(error)),
  ]);
  const workers = options.context.serviceWorkers().map((worker) => worker.url());
  const chromeHint =
    options.browserTarget.label === "Google Chrome"
      ? " Google Chrome stable may reject command-line unpacked extension loading; set CLIO_E2E_BROWSER=chromium or CHROME_PATH to Chrome for Testing/Playwright Chromium."
      : "";
  return `Clio extension did not inject into the target page. browser=${options.browserTarget.label}; executable=${options.browserTarget.executablePath}; version=${browserVersion}; extensionDir=${options.extensionDir}; serviceWorkers=${JSON.stringify(
    workers,
  )}; page=${JSON.stringify(pageState)}.${chromeHint}`;
}

function findVisibleSelectionTarget() {
  function isVisibleElement(element: Element) {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function visibleSelectionTargetForElement(element: Element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node !== null) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
      const parent = node.parentElement;
      if (parent !== null && text.length >= 30 && isVisibleElement(parent)) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = Array.from(range.getClientRects()).find(
          (candidate) =>
            candidate.width >= 120 &&
            candidate.height >= 12 &&
            candidate.bottom > 0 &&
            candidate.right > 0 &&
            candidate.left < window.innerWidth &&
            candidate.top < window.innerHeight,
        );
        range.detach();
        if (rect !== undefined) {
          const startX = Math.max(rect.left + 4, 4);
          const endX = Math.min(rect.left + Math.min(rect.width - 4, 260), window.innerWidth - 4);
          if (endX > startX + 40) {
            return {
              endX,
              preview: text.slice(0, 120),
              startX,
              y: rect.top + rect.height / 2,
            };
          }
        }
      }
      node = walker.nextNode();
    }
    return null;
  }

  const selectors = [
    "[class*='lemma'] [class*='para']",
    "[class*='para']",
    "article p",
    "main p",
    "p",
    "article",
    "main",
  ];
  for (const selector of selectors) {
    const elements = Array.from(document.querySelectorAll(selector));
    for (const element of elements) {
      const result = visibleSelectionTargetForElement(element);
      if (result !== null) return result;
    }
  }
  return visibleSelectionTargetForElement(document.body);
}

async function selectVisibleText(
  page: Page,
  target: { startX: number; startY?: number; endX: number; endY?: number; y: number },
) {
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
  });
  await page.mouse.move(target.startX, target.startY ?? target.y);
  await page.mouse.down();
  await page.mouse.move(target.endX, target.endY ?? target.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForFunction(() => (window.getSelection()?.toString().trim().length ?? 0) > 0, {
    timeout: 5_000,
  });
}

function readDialogueDiagnostics() {
  const root = document.querySelector("#clio-toolbox-root")?.shadowRoot;
  const messages = Array.from(root?.querySelectorAll("[data-clio-dialogue-role]") ?? []).map(
    (message) => ({
      role: message.getAttribute("data-clio-dialogue-role"),
      status: message.getAttribute("data-clio-dialogue-status"),
      text: (message.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
    }),
  );
  return {
    composer: (
      root?.querySelector("[data-clio-composer-input='true']") as HTMLTextAreaElement | null
    )?.value,
    toast: root?.querySelector("[data-clio-toast]")?.textContent?.replace(/\s+/g, " ").trim(),
    view: root?.querySelector("[data-clio-rail-state='expanded']")?.getAttribute("data-clio-view"),
    messages,
    selectionChip: (root?.querySelector("[data-clio-selection-chip='true']")?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300),
  };
}

async function holdBrowserOpen(reason: string, profileDir: string) {
  console.error(`[clio:e2e] keeping Chrome open for ${reason}. Profile: ${profileDir}`);
  console.error("[clio:e2e] close the terminal or press Ctrl+C when inspection is done.");
  await new Promise(() => {});
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
