import { describe, expect, it } from "vitest";
import { BrowserPiAgentRuntime, type BrowserPiStreamEvent } from "./browser-pi-runtime";
import type { AgentChatRequest, AgentStreamEvent } from "./types";

function request(overrides: Partial<AgentChatRequest> = {}): AgentChatRequest {
  return {
    runId: "run-1",
    question: "What matters here?",
    scope: "current-page",
    pageUrl: "https://example.com/a",
    pageTitle: "Example",
    createdAt: "2026-05-22T00:00:00.000Z",
    evidence: [
      {
        id: "page:0",
        sourceKind: "page",
        sourceUrl: "https://example.com/a",
        sourceTitle: "Example",
        text: "Local evidence text",
        excerpt: "Local evidence text",
      },
    ],
    ...overrides,
  };
}

async function collect(stream: AsyncIterable<AgentStreamEvent>) {
  const events: AgentStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function runtimeWith(events: BrowserPiStreamEvent[]) {
  return new BrowserPiAgentRuntime({
    loadConfig: async () => ({ apiKey: "test-key", model: "gemini-2.5-flash" }),
    ensureGeminiPermission: async () => true,
    streamFn: async function* () {
      for (const event of events) yield event;
    },
  });
}

describe("BrowserPiAgentRuntime", () => {
  it("fails inline when Gemini is not configured", async () => {
    const runtime = new BrowserPiAgentRuntime({
      loadConfig: async () => undefined,
      ensureGeminiPermission: async () => true,
      streamFn: async function* () {},
    });

    const events = await collect(runtime.streamChat(request()));

    expect(events).toEqual([
      { type: "run_started", runId: "run-1" },
      {
        type: "run_failed",
        runId: "run-1",
        error: {
          code: "PROVIDER_CONFIG_REQUIRED",
          message: "Set up Gemini in Clio Settings, then retry.",
        },
      },
    ]);
  });

  it("fails inline when Gemini host permission is missing", async () => {
    const runtime = new BrowserPiAgentRuntime({
      loadConfig: async () => ({ apiKey: "test-key", model: "gemini-2.5-flash" }),
      ensureGeminiPermission: async () => false,
      streamFn: async function* () {},
    });

    const events = await collect(runtime.streamChat(request()));

    expect(events[1]).toMatchObject({
      type: "run_failed",
      error: {
        code: "PROVIDER_PERMISSION_REQUIRED",
      },
    });
  });

  it("streams text and keeps only valid evidence citations", async () => {
    const events = await collect(
      runtimeWith([
        { type: "start" },
        { type: "text_delta", delta: "Grounded [[cite:page:0]] and invalid [[cite:missing]]." },
        { type: "done" },
      ]).streamChat(request()),
    );

    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "citation",
      "text_delta",
      "text_delta",
      "run_completed",
    ]);
    expect(events.filter((event) => event.type === "citation")).toHaveLength(1);
    expect(events.find((event) => event.type === "citation")).toMatchObject({
      citation: {
        evidenceId: "page:0",
        label: "Page",
      },
    });
    expect(
      events
        .filter((event) => event.type === "text_delta")
        .map((event) => event.delta)
        .join(""),
    ).toBe("Grounded  and invalid .");
  });

  it("maps provider auth errors to stable Clio errors", async () => {
    const events = await collect(
      runtimeWith([
        { type: "start" },
        { type: "error", reason: "error", error: { errorMessage: "401 invalid API key" } },
      ]).streamChat(request()),
    );

    expect(events.at(-1)).toMatchObject({
      type: "run_failed",
      error: {
        code: "PROVIDER_AUTH_ERROR",
      },
    });
  });
});
