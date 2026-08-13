import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(
  fileURLToPath(new URL("../../entrypoints/background.ts", import.meta.url)),
  "utf8",
);
const offscreenSource = readFileSync(
  fileURLToPath(new URL("../../entrypoints/offscreen/main.ts", import.meta.url)),
  "utf8",
);

function sourceSection(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("Wiki compiler extension boundaries", () => {
  it("keeps the Background alarm and enabled gate bounded to wake routing", () => {
    expect(backgroundSource).toContain('const WIKI_COMPILE_ALARM = "clio-wiki-compile-wake"');
    expect(backgroundSource).toContain("const WIKI_COMPILE_ALARM_PERIOD_MINUTES = 1");

    const alarmSection = sourceSection(
      backgroundSource,
      "function setupWikiCompileAlarm()",
      "async function createOffscreenDocument()",
    );
    expect(alarmSection).toMatch(
      /chrome\.alarms\s*\.create\(WIKI_COMPILE_ALARM,\s*\{\s*periodInMinutes:\s*WIKI_COMPILE_ALARM_PERIOD_MINUTES\s*\}\)/s,
    );
    expect(alarmSection).toContain("settings?.wiki.enabled !== true");
    expect(alarmSection).toContain("CLIO_WIKI_COMPILE_WAKE");
    expect(alarmSection).not.toContain("requestEngine");

    const providerRoute = sourceSection(
      backgroundSource,
      'case "saveKnowledgeBaseAiSettings":',
      'case "ensureImageGenerationHostPermission":',
    );
    expect(providerRoute).toContain("if (settings.wiki.enabled) void wakeWikiCompileRunner();");
  });

  it("keeps provider ownership and trusted enqueue/retry/resume in Offscreen", () => {
    expect(offscreenSource).toContain("const wikiCompileRunner = new WikiCompileRunner");
    expect(offscreenSource).toContain(
      'loadSettings: () => requestProvider({ kind: "getKnowledgeBaseAiSettings" })',
    );
    expect(offscreenSource).toContain("if (isWikiCompileWakeMessage(message))");
    expect(offscreenSource).toMatch(/wikiCompileRunner\s*\.enqueue\(request\.payload\.sourceId\)/s);
    expect(offscreenSource).toMatch(/wikiCompileRunner\s*\.retry\(request\.id\)/s);
    expect(offscreenSource).toMatch(/wikiCompileRunner\s*\.resume\(request\.id\)/s);

    const requestRoute = sourceSection(
      offscreenSource,
      "if (!isOffscreenRequestMessage(message)) return false;",
      "function handleAgentRunRequest",
    );
    expect(requestRoute).not.toContain('request.kind = "createWikiCompileRun"');
    expect(requestRoute).toContain("requestEngine(request)");
  });

  it("observes saved captures and enqueues through the same trusted Offscreen route", () => {
    const engineRoute = sourceSection(
      backgroundSource,
      "async function routeEngineRequest(request: EngineTransportRequest)",
      "async function enqueueWikiForNewCapture(sourceId: string)",
    );
    expect(engineRoute).toContain("const response = (await chrome.runtime.sendMessage");
    expect(engineRoute).toContain("wikiAutoCompileSourceId(request, response)");
    expect(engineRoute).toContain("void enqueueWikiForNewCapture(sourceId)");
    expect(engineRoute).toContain("return response");

    const enqueueRoute = sourceSection(
      backgroundSource,
      "async function enqueueWikiForNewCapture(sourceId: string)",
      "async function routeKnowledgeBaseClusterLabelRefinementRequest",
    );
    expect(enqueueRoute).toContain("await readKnowledgeBaseAiSettings()");
    expect(enqueueRoute).toContain("if (!settings.wiki.enabled) return");
    expect(enqueueRoute).toContain("await ensureOffscreen()");
    expect(enqueueRoute).toContain('kind: "enqueueWikiCompileRun", payload: { sourceId }');
    expect(enqueueRoute).toContain('console.debug("clio:bg automatic Wiki enqueue failed"');
    expect(enqueueRoute).not.toContain("listMemories");
    expect(enqueueRoute).not.toContain("capturePage");
  });
});
