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

describe("post-capture extension boundaries", () => {
  it("registers an independent periodic wake without a Wiki settings gate", () => {
    expect(backgroundSource).toContain('const POST_CAPTURE_ALARM = "clio-post-capture-wake"');
    expect(backgroundSource).toContain("const POST_CAPTURE_ALARM_PERIOD_MINUTES = 1");
    expect(backgroundSource).toContain("setupPostCaptureAlarm();");
    expect(backgroundSource).toContain(
      "if (alarm.name === POST_CAPTURE_ALARM) void wakePostCaptureRunner();",
    );

    const wakeSection = sourceSection(
      backgroundSource,
      "function setupPostCaptureAlarm()",
      "async function wakeWikiCompileRunner()",
    );
    expect(wakeSection).toContain("CLIO_POST_CAPTURE_WAKE");
    expect(wakeSection).toContain("await ensureOffscreen()");
    expect(wakeSection).not.toContain("readKnowledgeBaseAiSettings");
    expect(wakeSection).not.toContain("wiki.enabled");
    expect(wakeSection).not.toContain("requestEngine");
  });

  it("wakes post-capture and Wiki paths independently after a saved capture", () => {
    const route = sourceSection(
      backgroundSource,
      "async function routeEngineRequest(request: EngineTransportRequest)",
      "async function enqueueWikiForNewCapture(sourceId: string)",
    );
    expect(route).toContain("wikiAutoCompileSourceId(request, response)");
    expect(route).toContain("void wakePostCaptureRunner();");
    expect(route).toContain("void enqueueWikiForNewCapture(sourceId);");
    expect(route).toContain("return response;");
  });

  it("owns recovery, draining, wake, and retry continuation in Offscreen", () => {
    expect(offscreenSource).toContain("const postCaptureRunner = new PostCaptureRunner");
    expect(offscreenSource).toContain("void postCaptureRunner.wake().catch");
    expect(offscreenSource).toContain("if (isPostCaptureWakeMessage(message))");
    const retryRoute = sourceSection(
      offscreenSource,
      'if (request.kind === "retrySourceIngest")',
      "  requestEngine(request)\n    .then",
    );
    expect(retryRoute).toContain("requestEngine(request)");
    expect(retryRoute).toContain("if (response.ok) void postCaptureRunner.wake()");
  });
});
