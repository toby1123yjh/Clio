#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const reportPath = resolve("poc/phase1a-acceptance-report.md");
const extensionDir = resolve("apps/extension/.output/chrome-mv3");
const manifestPath = resolve(extensionDir, "manifest.json");

const scenarioFallbacks = [
  {
    id: 1,
    name: "Open a normal page, select text, and see the Clio selection mini UI.",
    fallback:
      "Open any http/https article page, select a paragraph, and confirm the mini UI shows Save, Search, and Open Toolbox icon buttons near the selection.",
  },
  {
    id: 2,
    name: "Save selection; Toolbox/Rail opens and Library shows the selection memory.",
    fallback:
      "Click the mini UI Save button and confirm the in-page Rail opens with the saved selection visible in Library.",
  },
  {
    id: 3,
    name: "Save current page; Toolbox/Rail opens and Library shows the page memory.",
    fallback:
      "Click Save current page from the Rail on a readable page and confirm a page memory appears. On low-confidence pages, confirm Clio asks for selected passage instead.",
  },
  {
    id: 4,
    name: "Keyword search finds saved selection and saved page.",
    fallback:
      "Search for a unique term from the saved selection and page, and confirm both result types can be found.",
  },
  {
    id: 5,
    name: "Detail view opens and back returns to list.",
    fallback:
      "Open a Library item, confirm detail replaces the list, then click Back and confirm the list returns.",
  },
  {
    id: 6,
    name: "Delete with confirmation; deleted memory disappears from list/search.",
    fallback:
      "Open a memory detail, click Delete, accept confirmation, and confirm the item no longer appears in list or search.",
  },
  {
    id: 7,
    name: "Refresh/restart extension or browser context; memories persist.",
    fallback:
      "Restart Chrome or reload the extension with the same profile, open the Rail again, and confirm previously saved memories remain searchable.",
  },
  {
    id: 8,
    name: "Simulate SQLite/OPFS degraded or error; Toolbox shows health and links Options Storage Health.",
    fallback:
      "Use the current browser smoke blocker or a forced storage startup failure, then confirm Toolbox/Popup expose a non-ready health state and Options Storage Health repair actions are reachable.",
  },
];

async function main() {
  const generatedAt = new Date().toISOString();
  const commit = run("git", ["rev-parse", "--short", "HEAD"]);
  const manifest = await readManifest();
  const chromeSmoke = run("node", ["poc/chrome-extension-smoke.mjs"], {
    expectFailure: true,
    timeoutMs: 60_000,
  });
  const chromeSmokeJson = parseJson(chromeSmoke.stdout);
  const smokeStatus = classifyChromeSmoke(chromeSmoke, chromeSmokeJson);
  const scenarios = buildScenarioRows(smokeStatus, chromeSmokeJson);

  const report = renderReport({
    generatedAt,
    commit: commit.stdout.trim(),
    manifest,
    chromeSmoke,
    chromeSmokeJson,
    smokeStatus,
    scenarios,
  });

  await writeFile(reportPath, report, "utf8");
  console.log(JSON.stringify({ status: "ok", reportPath, smokeStatus }, null, 2));
}

async function readManifest() {
  if (!existsSync(manifestPath)) {
    return {
      status: "missing",
      message: "Build output missing. Run pnpm build first.",
    };
  }
  const raw = await readFile(manifestPath, "utf8");
  return {
    status: "present",
    value: JSON.parse(raw),
  };
}

function run(command, args, options = {}) {
  const started = performance.now();
  const result = spawnSync(command, args, {
    cwd: resolve("."),
    encoding: "utf8",
    timeout: options.timeoutMs ?? 30_000,
    windowsHide: true,
  });
  const durationMs = Math.round(performance.now() - started);
  if (result.error && !options.expectFailure) throw result.error;
  if (result.status !== 0 && !options.expectFailure) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
  return {
    command: `${command} ${args.join(" ")}`,
    status: result.status ?? 1,
    durationMs,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error instanceof Error ? result.error.message : undefined,
  };
}

function parseJson(text) {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function classifyChromeSmoke(result, payload) {
  if (payload?.status === "pass") return "pass";
  if (payload?.status === "blocked") return "blocked";
  if (result.status !== 0) return "blocked";
  return "unknown";
}

function buildScenarioRows(smokeStatus, payload) {
  const blocker = summarizeBlocker(payload);
  return scenarioFallbacks.map((scenario) => ({
    ...scenario,
    status: smokeStatus === "pass" ? "blocked" : "blocked",
    automation:
      smokeStatus === "pass"
        ? "Chrome smoke loaded extension infrastructure, but this runner does not yet automate the product scenario."
        : blocker,
  }));
}

function summarizeBlocker(payload) {
  if (!payload) return "Chrome smoke did not produce parseable JSON.";
  const errors = [
    payload.error,
    payload.extensionLoad?.extensionLoadLog?.[0],
    payload.offscreen?.error,
    payload.extensionPage?.error,
    payload.opfs?.error,
    payload.sqlite?.error,
  ].filter(Boolean);
  if (errors.length === 0) return `Chrome smoke status: ${payload.status ?? "unknown"}.`;
  return errors[0];
}

function renderReport({
  generatedAt,
  commit,
  manifest,
  chromeSmoke,
  chromeSmokeJson,
  smokeStatus,
  scenarios,
}) {
  const browserVersion = chromeSmokeJson?.browserVersion?.Browser ?? "unknown";
  const chromePath = chromeSmokeJson?.chromePath ?? "unknown";
  const extensionId = chromeSmokeJson?.extensionId ?? "unknown";
  const manifestValue = manifest.status === "present" ? manifest.value : undefined;
  const permissions = manifestValue?.permissions?.join(", ") ?? "unknown";
  const commands = manifestValue?.commands
    ? Object.keys(manifestValue.commands).join(", ")
    : "unknown";
  const wasmPresent = existsSync(resolve(extensionDir, "assets"))
    ? "see build output assets"
    : "build output missing";

  return `# Phase 1A Browser E2E Acceptance Report

Generated: ${generatedAt}

## Build Under Test

- Repository commit: \`${commit}\`
- Extension manifest: ${manifest.status}
- Extension id from smoke: ${extensionId}
- Chrome path: \`${chromePath}\`
- Browser version: ${browserVersion}
- Permissions: ${permissions}
- Commands: ${commands}
- SQLite WASM asset: ${wasmPresent}

## Automated Browser Smoke

- Command: \`${chromeSmoke.command}\`
- Exit status: ${chromeSmoke.status}
- Duration: ${chromeSmoke.durationMs} ms
- Classified status: ${smokeStatus}

${renderSmokeDetails(chromeSmokeJson, chromeSmoke)}

## Phase 1A Product Scenarios

| # | Scenario | Automated status | Automation evidence | Headed/manual fallback |
|---:|---|---|---|---|
${scenarios
  .map(
    (scenario) =>
      `| ${scenario.id} | ${escapeTable(scenario.name)} | ${scenario.status} | ${escapeTable(
        scenario.automation,
      )} | ${escapeTable(scenario.fallback)} |`,
  )
  .join("\n")}

## Manual Acceptance Steps

1. Run \`pnpm build\` from \`Clio-browser/\`.
2. Open Chrome and load \`apps/extension/.output/chrome-mv3\` as an unpacked extension.
3. Open a normal \`http://\` or \`https://\` article page.
4. Execute each scenario in the table above.
5. Replace each scenario status in this report with \`pass\`, \`fail\`, or \`blocked\`, and record exact observations.

## Current Conclusion

The local automated path records browser-environment evidence, but product E2E scenarios are not yet marked as passed until a headed/manual run or a stronger browser automation harness completes them.
`;
}

function renderSmokeDetails(payload, result) {
  if (!payload) {
    return `Chrome smoke did not produce parseable JSON.

\`\`\`text
${trimForCodeBlock(result.stdout || result.stderr || result.error || "no output")}
\`\`\``;
  }
  return `\`\`\`json
${JSON.stringify(
  {
    status: payload.status,
    error: payload.error,
    extensionLoad: payload.extensionLoad,
    serviceWorkerUrl: payload.serviceWorkerUrl,
    runtimeManifest: payload.runtimeManifest,
    serviceWorkerApi: payload.serviceWorkerApi,
    offscreen: payload.offscreen,
    extensionPage: payload.extensionPage,
    opfs: payload.opfs,
    sqlite: payload.sqlite,
  },
  null,
  2,
)}
\`\`\``;
}

function escapeTable(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function trimForCodeBlock(value) {
  const text = String(value);
  if (text.length <= 4000) return text;
  return `${text.slice(0, 4000)}\n... truncated ...`;
}

await main();
