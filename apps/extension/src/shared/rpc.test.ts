import { describe, expect, it } from "vitest";
import {
  CLIO_AGENT_RUN_EVENT,
  CLIO_AGENT_RUN_REQUEST,
  CLIO_AGENT_STREAM_COMPACT,
  CLIO_AGENT_STREAM_EVENT,
  CLIO_AGENT_STREAM_SUBSCRIBE,
  CLIO_CONTENT_COMMAND,
  CLIO_ENGINE_REQUEST,
  CLIO_IMAGE_GENERATION_RUN_EVENT,
  CLIO_IMAGE_GENERATION_RUN_REQUEST,
  CLIO_IMAGE_GENERATION_STREAM_CANCEL,
  CLIO_IMAGE_GENERATION_STREAM_EVENT,
  CLIO_IMAGE_GENERATION_STREAM_REQUEST,
  CLIO_PROVIDER_CONFIG_REQUEST,
  CLIO_PROVIDER_REQUEST,
  CLIO_UI_REQUEST,
  CLIO_WEB_SEARCH_RUN_EVENT,
  CLIO_WEB_SEARCH_RUN_REQUEST,
  CLIO_WEB_SEARCH_STREAM_EVENT,
  CLIO_WEB_SEARCH_STREAM_REQUEST,
  isAgentRunEventMessage,
  isAgentRunRequestMessage,
  isAgentStreamCompactMessage,
  isAgentStreamEventMessage,
  isAgentStreamSubscribeMessage,
  isContentCommandMessage,
  isEngineRequestMessage,
  isImageGenerationRunEventMessage,
  isImageGenerationRunRequestMessage,
  isImageGenerationStreamCancelMessage,
  isImageGenerationStreamEventMessage,
  isImageGenerationStreamRequestMessage,
  isProviderConfigRequestMessage,
  isProviderRequestMessage,
  isUiRequestMessage,
  isWebSearchRunEventMessage,
  isWebSearchRunRequestMessage,
  isWebSearchStreamEventMessage,
  isWebSearchStreamRequestMessage,
} from "./rpc";

describe("session engine RPC guards", () => {
  it("accepts typed chat session requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "createChatSession",
          payload: {
            title: "Explain persistence",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            initialScope: "general",
            ownerId: "owner-1",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "upsertChatMessage",
          payload: {
            id: "run-1:user",
            sessionId: "sess-1",
            role: "user",
            status: "completed",
            content: "Explain persistence",
            scope: "general",
            evidenceRefs: ["ev-1"],
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "updateChatMessage",
          payload: {
            id: "run-1:assistant",
            sessionId: "sess-1",
            status: "streaming",
            content: "",
            clearError: true,
            clearRetry: true,
          },
        },
      }),
    ).toBe(true);
  });

  it("rejects invalid chat message payloads", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "upsertChatMessage",
          payload: {
            id: "run-1:user",
            sessionId: "sess-1",
            role: "model",
            status: "completed",
            content: "Explain persistence",
            scope: "current-page",
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts typed agent stream subscribe messages", () => {
    expect(
      isAgentStreamSubscribeMessage({
        type: CLIO_AGENT_STREAM_SUBSCRIBE,
        requestId: "request-1",
        runId: "run-1",
        sessionId: "session-1",
        assistantMessageId: "run-1:assistant",
      }),
    ).toBe(true);

    expect(
      isAgentStreamSubscribeMessage({
        type: CLIO_AGENT_STREAM_SUBSCRIBE,
        requestId: "request-1",
        runId: "run-1",
        sessionId: "session-1",
      }),
    ).toBe(false);
  });

  it("accepts typed manual compaction stream messages", () => {
    expect(
      isAgentStreamCompactMessage({
        type: CLIO_AGENT_STREAM_COMPACT,
        requestId: "request-1",
        runId: "compact-1",
        sessionId: "session-1",
      }),
    ).toBe(true);

    expect(
      isAgentStreamCompactMessage({
        type: CLIO_AGENT_STREAM_COMPACT,
        requestId: "request-1",
        runId: "compact-1",
      }),
    ).toBe(true);

    expect(
      isAgentStreamCompactMessage({
        type: CLIO_AGENT_STREAM_COMPACT,
        requestId: "request-1",
        sessionId: "session-1",
      }),
    ).toBe(false);
  });

  it("accepts the Rail settings content command", () => {
    expect(
      isContentCommandMessage({
        type: CLIO_CONTENT_COMMAND,
        command: { action: "openSettings" },
      }),
    ).toBe(true);
  });

  it("accepts typed offscreen agent run request and event messages", () => {
    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "start",
          request: {
            runId: "run-1",
            question: "Explain persistence",
            scope: "general",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            evidence: [],
            currentTurnEvidenceRefs: ["ev-1"],
            createdAt: "2026-05-22T00:00:00.000Z",
          },
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "subscribe",
          runId: "run-1",
          sessionId: "session-1",
          assistantMessageId: "run-1:assistant",
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "compact",
          runId: "compact-1",
          sessionId: "session-1",
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: { type: "run_resolved", runId: "run-1", message: "Context too large" },
      }),
    ).toBe(true);
  });

  it("accepts typed agent thinking and tool trace stream events", () => {
    expect(
      isAgentStreamEventMessage({
        type: CLIO_AGENT_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "thinking_delta",
          runId: "run-1",
          delta: "Checking the selected context.",
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: {
          type: "tool_trace",
          runId: "run-1",
          trace: {
            toolCallId: "tool-1",
            toolName: "search_memory",
            status: "running",
            summary: "Searching local memories",
          },
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: {
          type: "tool_trace",
          runId: "run-1",
          trace: {
            toolCallId: "tool-1",
            toolName: "search_memory",
            status: "waiting",
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts typed multi-provider setup requests", () => {
    expect(
      isProviderConfigRequestMessage({
        type: CLIO_PROVIDER_CONFIG_REQUEST,
        request: { kind: "readActiveProviderConfig" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "getProviderSettings" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveOpenAIProvider",
          apiKey: "sk-test",
          model: "gpt-5.1",
          baseUrl: "https://api.openai.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveOpenAICompatibleProvider",
          apiKey: "sk-test",
          model: "gpt-5.5",
          baseUrl: "https://new-api.example.test/v1",
          providerName: "custom",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testOpenAIProvider",
          model: "gpt-5.1",
          baseUrl: "https://api.openai.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "ensureOpenAIHostPermission",
          baseUrl: "https://api.openai.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testOpenAICompatibleProvider",
          model: "gpt-5.5",
          baseUrl: "https://new-api.example.test/v1",
          providerName: "custom",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "ensureOpenAICompatibleHostPermission",
          baseUrl: "https://new-api.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "setActiveProvider", provider: "openai" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "setActiveProvider", provider: "openai-compatible" },
      }),
    ).toBe(true);
  });

  it("accepts typed Search provider, stream, run, and history requests", () => {
    const searchRequest = {
      runId: "web-search-1",
      query: "browser ai search",
      createdAt: "2026-06-08T00:00:00.000Z",
    };
    const searchResult = {
      id: "search_web-search-1",
      runId: "web-search-1",
      query: "browser ai search",
      answer: "Search answer",
      sources: [
        {
          id: "src-1",
          title: "Example",
          url: "https://example.com/a",
          domain: "example.com",
          snippet: "Source snippet",
        },
      ],
      provider: "OpenAI Search",
      createdAt: "2026-06-08T00:00:00.000Z",
      completedAt: "2026-06-08T00:00:01.000Z",
    };

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveSearchProviderSettings",
          provider: "auto",
          openai: {
            apiKey: "",
            model: "gpt-search",
            baseUrl: "https://api.openai.example.test/v1",
          },
          openaiCompatible: {
            apiKey: "",
            model: "compatible-search-model",
            baseUrl: "https://new-api.example.test/v1",
          },
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveSearchProviderSettings",
          provider: "openai-compatible",
          openaiCompatible: {
            apiKey: "sk-test",
            model: "any-compatible-model",
            baseUrl: "https://new-api.example.test/v1",
          },
        },
      }),
    ).toBe(true);

    expect(
      isWebSearchStreamRequestMessage({
        type: CLIO_WEB_SEARCH_STREAM_REQUEST,
        requestId: "request-1",
        request: searchRequest,
      }),
    ).toBe(true);

    expect(
      isWebSearchStreamEventMessage({
        type: CLIO_WEB_SEARCH_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "answer_delta",
          runId: "web-search-1",
          delta: "Search",
        },
      }),
    ).toBe(true);

    expect(
      isWebSearchRunRequestMessage({
        type: CLIO_WEB_SEARCH_RUN_REQUEST,
        request: {
          kind: "start",
          request: searchRequest,
        },
      }),
    ).toBe(true);

    expect(
      isWebSearchRunEventMessage({
        type: CLIO_WEB_SEARCH_RUN_EVENT,
        event: {
          type: "completed",
          runId: "web-search-1",
          result: searchResult,
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendWebSearchHistory",
          payload: {
            id: searchResult.id,
            query: searchResult.query,
            answer: searchResult.answer,
            sources: searchResult.sources,
            provider: searchResult.provider,
            createdAt: searchResult.createdAt,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listWebSearchHistory", limit: 10 },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "deleteWebSearchHistory", id: "search_web-search-1" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "clearWebSearchHistory" },
      }),
    ).toBe(true);
  });

  it("accepts typed Image Gen provider, stream, run, and history requests", () => {
    const imageRequest = {
      runId: "image-run-1",
      mode: "edit" as const,
      prompt: "turn this into a clean icon",
      createdAt: "2026-06-09T00:00:00.000Z",
      input: {
        kind: "data_url" as const,
        value: "data:image/png;base64,iVBORw0KGgo=",
        mimeType: "image/png",
        name: "reference.png",
      },
    };
    const imageResult = {
      id: "image_image-run-1",
      runId: "image-run-1",
      mode: "edit" as const,
      prompt: "turn this into a clean icon",
      model: "gpt-image-2",
      size: "1024x1024",
      provider: "Image Gen",
      createdAt: "2026-06-09T00:00:00.000Z",
      completedAt: "2026-06-09T00:00:01.000Z",
      output: {
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,iVBORw0KGgo=",
        b64Json: "iVBORw0KGgo=",
      },
      input: imageRequest.input,
    };

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "getImageGenerationSettings" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveImageGenerationSettings",
          settings: {
            apiKey: "",
            model: "gpt-image-2",
            baseUrl: "https://images.example.test/v1",
            size: "auto",
          },
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "ensureImageGenerationHostPermission",
          baseUrl: "https://images.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isImageGenerationStreamRequestMessage({
        type: CLIO_IMAGE_GENERATION_STREAM_REQUEST,
        requestId: "request-1",
        request: imageRequest,
      }),
    ).toBe(true);

    expect(
      isImageGenerationStreamCancelMessage({
        type: CLIO_IMAGE_GENERATION_STREAM_CANCEL,
        requestId: "request-1",
      }),
    ).toBe(true);

    expect(
      isImageGenerationStreamEventMessage({
        type: CLIO_IMAGE_GENERATION_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "completed",
          runId: "image-run-1",
          result: imageResult,
        },
      }),
    ).toBe(true);

    expect(
      isImageGenerationRunRequestMessage({
        type: CLIO_IMAGE_GENERATION_RUN_REQUEST,
        request: {
          kind: "start",
          request: imageRequest,
        },
      }),
    ).toBe(true);

    expect(
      isImageGenerationRunRequestMessage({
        type: CLIO_IMAGE_GENERATION_RUN_REQUEST,
        request: {
          kind: "cancel",
          runId: "image-run-1",
        },
      }),
    ).toBe(true);

    expect(
      isImageGenerationRunEventMessage({
        type: CLIO_IMAGE_GENERATION_RUN_EVENT,
        event: {
          type: "completed",
          runId: "image-run-1",
          result: imageResult,
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendImageGenerationHistory",
          payload: {
            id: imageResult.id,
            mode: imageResult.mode,
            prompt: imageResult.prompt,
            model: imageResult.model,
            size: imageResult.size,
            provider: imageResult.provider,
            createdAt: imageResult.createdAt,
            output: imageResult.output,
            input: imageResult.input,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listImageGenerationHistory", limit: 20 },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "deleteImageGenerationHistory", id: "image_image-run-1" },
      }),
    ).toBe(true);
  });

  it("rejects invalid multi-provider setup requests", () => {
    expect(
      isProviderConfigRequestMessage({
        type: CLIO_PROVIDER_CONFIG_REQUEST,
        request: { kind: "getProviderSettings" },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "setActiveProvider", provider: "anthropic" },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "saveOpenAIProvider", apiKey: "sk-test" },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testOpenAIProvider",
          baseUrl: 42,
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testOpenAICompatibleProvider",
          baseUrl: 42,
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveSearchProviderSettings",
          provider: "perplexity",
        },
      }),
    ).toBe(false);

    expect(
      isWebSearchStreamRequestMessage({
        type: CLIO_WEB_SEARCH_STREAM_REQUEST,
        requestId: "request-1",
        request: {
          runId: "web-search-1",
          query: "browser ai search",
        },
      }),
    ).toBe(false);

    expect(
      isWebSearchRunEventMessage({
        type: CLIO_WEB_SEARCH_RUN_EVENT,
        event: {
          type: "completed",
          runId: "web-search-1",
          result: {
            id: "search_web-search-1",
            runId: "web-search-1",
            query: "browser ai search",
            answer: "Search answer",
            sources: [{ title: "Missing fields" }],
            provider: "OpenAI Search",
            createdAt: "2026-06-08T00:00:00.000Z",
            completedAt: "2026-06-08T00:00:01.000Z",
          },
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveImageGenerationSettings",
          settings: {
            size: "512x512",
          },
        },
      }),
    ).toBe(false);

    expect(
      isImageGenerationStreamRequestMessage({
        type: CLIO_IMAGE_GENERATION_STREAM_REQUEST,
        requestId: "request-1",
        request: {
          runId: "image-run-1",
          mode: "paint",
          prompt: "invalid mode",
          createdAt: "2026-06-09T00:00:00.000Z",
        },
      }),
    ).toBe(false);

    expect(
      isImageGenerationRunEventMessage({
        type: CLIO_IMAGE_GENERATION_RUN_EVENT,
        event: {
          type: "completed",
          runId: "image-run-1",
          result: {
            id: "image_image-run-1",
            runId: "image-run-1",
            mode: "generate",
            prompt: "missing output b64",
            model: "gpt-image-2",
            size: "1024x1024",
            provider: "Image Gen",
            createdAt: "2026-06-09T00:00:00.000Z",
            completedAt: "2026-06-09T00:00:01.000Z",
            output: {
              mimeType: "image/png",
              dataUrl: "data:image/png;base64,iVBORw0KGgo=",
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts typed extension UI requests", () => {
    expect(
      isUiRequestMessage({
        type: CLIO_UI_REQUEST,
        request: { kind: "openOptions" },
      }),
    ).toBe(true);

    expect(
      isUiRequestMessage({
        type: CLIO_UI_REQUEST,
        request: { kind: "openSidePanel" },
      }),
    ).toBe(false);
  });
});
