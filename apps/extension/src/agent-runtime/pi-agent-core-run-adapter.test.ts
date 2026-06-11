import type { StreamFn } from "@earendil-works/pi-agent-core";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { PiAgentCoreRunAdapter } from "./pi-agent-core-run-adapter";
import type { AgentChatRequest, AgentStreamEvent } from "./types";

function request(overrides: Partial<AgentChatRequest> = {}): AgentChatRequest {
  return {
    runId: "run-1",
    sessionId: "session-1",
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

function assistant(
  content: string,
  overrides: Partial<Pick<AssistantMessage, "api" | "provider" | "model">> = {},
): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: content }],
    api: overrides.api ?? "google-generative-ai",
    provider: overrides.provider ?? "google",
    model: overrides.model ?? "gemini-2.5-flash",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

describe("PiAgentCoreRunAdapter", () => {
  it("streams through pi-agent-core and keeps valid evidence citations", async () => {
    const streamFn: StreamFn = () => {
      const stream = createAssistantMessageEventStream();
      const output = assistant("Grounded [[cite:page:0]] and invalid [[cite:missing]].");
      stream.push({ type: "start", partial: assistant("") });
      stream.push({
        type: "text_delta",
        contentIndex: 0,
        delta: "Grounded [[cite:page:0]] and invalid [[cite:missing]].",
        partial: output,
      });
      stream.push({ type: "done", reason: "stop", message: output });
      return stream;
    };

    const runtime = new PiAgentCoreRunAdapter({
      loadConfig: async () => ({
        provider: "gemini",
        apiKey: "test-key",
        model: "gemini-2.5-flash",
        updatedAt: "2026-05-22T00:00:00.000Z",
      }),
      ensureProviderPermission: async () => true,
      streamFn,
    });

    const events = await collect(runtime.streamChat(request()));

    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "citation",
      "text_delta",
      "text_delta",
      "run_completed",
    ]);
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

  it("streams minimal thinking from pi-agent-core for reasoning models", async () => {
    let seenReasoning: unknown;
    const streamFn: StreamFn = (_model, _context, options) => {
      seenReasoning = options?.reasoning;
      const stream = createAssistantMessageEventStream();
      const output = assistant("Final answer.");
      stream.push({ type: "start", partial: assistant("") });
      stream.push({ type: "thinking_start", contentIndex: 0, partial: assistant("") });
      stream.push({
        type: "thinking_delta",
        contentIndex: 0,
        delta: "Checking the page evidence.",
        partial: assistant(""),
      });
      stream.push({
        type: "thinking_end",
        contentIndex: 0,
        content: "Checking the page evidence.",
        partial: assistant(""),
      });
      stream.push({
        type: "text_delta",
        contentIndex: 1,
        delta: "Final answer.",
        partial: output,
      });
      stream.push({ type: "done", reason: "stop", message: output });
      return stream;
    };

    const runtime = new PiAgentCoreRunAdapter({
      loadConfig: async () => ({
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-5.1",
        baseUrl: "https://api.openai.example.test/v1",
        updatedAt: "2026-05-29T00:00:00.000Z",
      }),
      ensureProviderPermission: async () => true,
      streamFn,
    });

    const events = await collect(runtime.streamChat(request()));

    expect(seenReasoning).toBe("minimal");
    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "thinking_delta",
      "text_delta",
      "run_completed",
    ]);
    expect(events.find((event) => event.type === "thinking_delta")).toEqual({
      type: "thinking_delta",
      runId: "run-1",
      delta: "Checking the page evidence.",
    });
  });

  it("fails before provider streaming when the built-in provider is not configured", async () => {
    const runtime = new PiAgentCoreRunAdapter({
      loadConfig: async () => undefined,
      ensureProviderPermission: async () => true,
      streamFn: (() => createAssistantMessageEventStream()) as StreamFn,
    });

    await expect(collect(runtime.streamChat(request()))).resolves.toEqual([
      { type: "run_started", runId: "run-1" },
      {
        type: "run_failed",
        runId: "run-1",
        error: {
          code: "PROVIDER_CONFIG_REQUIRED",
          message: "Set up OpenAI in Clio Settings, then retry.",
        },
      },
    ]);
  });

  it("uses the selected official OpenAI model and asks OpenAI permission before streaming", async () => {
    let seenModelApi = "";
    let seenProvider = "";
    let seenBaseUrl = "";
    let permissionProvider = "";
    const streamFn: StreamFn = (model) => {
      seenModelApi = model.api;
      seenProvider = model.provider;
      seenBaseUrl = model.baseUrl;
      const stream = createAssistantMessageEventStream();
      const output = assistant("OpenAI answer.", {
        api: "openai-responses",
        provider: "openai",
        model: "gpt-5.1",
      });
      stream.push({ type: "start", partial: assistant("", output) });
      stream.push({
        type: "text_delta",
        contentIndex: 0,
        delta: "OpenAI answer.",
        partial: output,
      });
      stream.push({ type: "done", reason: "stop", message: output });
      return stream;
    };

    const runtime = new PiAgentCoreRunAdapter({
      loadConfig: async () => ({
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-5.1",
        baseUrl: "https://api.openai.example.test/v1",
        updatedAt: "2026-05-29T00:00:00.000Z",
      }),
      ensureProviderPermission: async (provider, config) => {
        permissionProvider = provider;
        expect(config?.provider).toBe("openai");
        return true;
      },
      streamFn,
    });

    const events = await collect(runtime.streamChat(request()));

    expect(seenModelApi).toBe("openai-responses");
    expect(seenProvider).toBe("openai");
    expect(seenBaseUrl).toBe("https://api.openai.example.test/v1");
    expect(permissionProvider).toBe("openai");
    expect(
      events
        .filter((event) => event.type === "text_delta")
        .map((event) => event.delta)
        .join(""),
    ).toBe("OpenAI answer.");
  });

  it("uses the selected OpenAI-compatible model and asks compatible permission before streaming", async () => {
    let seenModelApi = "";
    let seenProvider = "";
    let seenBaseUrl = "";
    let permissionProvider = "";
    let permissionBaseUrl = "";
    const streamFn: StreamFn = (model) => {
      seenModelApi = model.api;
      seenProvider = model.provider;
      seenBaseUrl = model.baseUrl;
      const stream = createAssistantMessageEventStream();
      const output = assistant("Compatible answer.", {
        api: "openai-completions",
        provider: "custom",
        model: "gpt-5.5",
      });
      stream.push({ type: "start", partial: assistant("", output) });
      stream.push({
        type: "text_delta",
        contentIndex: 0,
        delta: "Compatible answer.",
        partial: output,
      });
      stream.push({ type: "done", reason: "stop", message: output });
      return stream;
    };

    const runtime = new PiAgentCoreRunAdapter({
      loadConfig: async () => ({
        provider: "openai-compatible",
        apiKey: "test-key",
        model: "gpt-5.5",
        baseUrl: "https://new-api.example.test/v1",
        providerName: "custom",
        updatedAt: "2026-05-29T00:00:00.000Z",
      }),
      ensureProviderPermission: async (provider, config) => {
        permissionProvider = provider;
        permissionBaseUrl = config?.provider === "openai-compatible" ? config.baseUrl : "";
        return true;
      },
      streamFn,
    });

    const events = await collect(runtime.streamChat(request()));

    expect(seenModelApi).toBe("openai-completions");
    expect(seenProvider).toBe("custom");
    expect(seenBaseUrl).toBe("https://new-api.example.test/v1");
    expect(permissionProvider).toBe("openai-compatible");
    expect(permissionBaseUrl).toBe("https://new-api.example.test/v1");
    expect(
      events
        .filter((event) => event.type === "text_delta")
        .map((event) => event.delta)
        .join(""),
    ).toBe("Compatible answer.");
  });

  it("names OpenAI setup errors when OpenAI is selected but not configured", async () => {
    const runtime = new PiAgentCoreRunAdapter({
      loadConfig: async () => undefined,
      loadProviderId: async () => "openai",
      ensureProviderPermission: async () => true,
      streamFn: (() => createAssistantMessageEventStream()) as StreamFn,
    });

    await expect(collect(runtime.streamChat(request()))).resolves.toEqual([
      { type: "run_started", runId: "run-1" },
      {
        type: "run_failed",
        runId: "run-1",
        error: {
          code: "PROVIDER_CONFIG_REQUIRED",
          message: "Set up OpenAI in Clio Settings, then retry.",
        },
      },
    ]);
  });
});
