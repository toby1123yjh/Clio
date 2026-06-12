import { describe, expect, it } from "vitest";
import { ClioWebToolRuntime } from "./web-search-runtime";

function sseResponse(events: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${event}\n\n`));
        }
        controller.close();
      },
    }),
    {
      headers: { "Content-Type": "text/event-stream" },
      status: 200,
    },
  );
}

describe("ClioWebToolRuntime", () => {
  it("streams OpenAI Responses web-search deltas and returns normalized sources", async () => {
    let requestedUrl = "";
    let requestedBody: unknown;
    const fetchFn: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body)) as unknown;
      return sseResponse([
        JSON.stringify({ type: "response.output_text.delta", delta: "Hello " }),
        JSON.stringify({ type: "response.output_text.delta", delta: "world" }),
        JSON.stringify({
          type: "response.output_text.annotation.added",
          annotation: {
            type: "url_citation",
            url: "https://example.com/source",
            title: "Example source",
            snippet: "A useful source snippet.",
          },
        }),
        JSON.stringify({
          type: "response.completed",
          response: {
            output_text: "Hello world",
            output: [
              {
                type: "web_search_call",
                action: {
                  sources: [
                    {
                      url: "https://example.com/second-source",
                      title: "Second source",
                      snippet: "Another useful source.",
                    },
                  ],
                },
              },
            ],
          },
        }),
      ]);
    };

    const runtime = new ClioWebToolRuntime({
      async loadSearchProviderSettings() {
        return {
          provider: "openai",
          openai: {
            apiKey: "search-key",
            model: "gpt-search",
            baseUrl: "https://api.openai.example.test/v1",
          },
          openaiCompatible: {},
        };
      },
      async loadActiveProviderConfig() {
        return undefined;
      },
      async ensureOpenAIHostPermission(baseUrl) {
        return baseUrl === "https://api.openai.example.test/v1";
      },
      async ensureOpenAICompatibleHostPermission() {
        return false;
      },
      fetchFn,
    });

    const events = [];
    for await (const event of runtime.searchWeb({
      runId: "search-run-1",
      query: "latest browser search",
      createdAt: "2026-06-08T00:00:00.000Z",
    })) {
      events.push(event);
    }

    expect(requestedUrl).toBe("https://api.openai.example.test/v1/responses");
    expect(requestedBody).toMatchObject({
      model: "gpt-search",
      input: "latest browser search",
      include: ["web_search_call.action.sources"],
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      stream: true,
    });
    expect(events.map((event) => event.type)).toEqual([
      "started",
      "answer_delta",
      "answer_delta",
      "completed",
    ]);
    expect(events[1]).toMatchObject({ type: "answer_delta", delta: "Hello " });
    expect(events[3]).toMatchObject({
      type: "completed",
      result: {
        answer: "Hello world",
        provider: "OpenAI Search",
        sources: [
          {
            title: "Example source",
            url: "https://example.com/source",
            domain: "example.com",
            snippet: "A useful source snippet.",
          },
          {
            title: "Second source",
            url: "https://example.com/second-source",
            domain: "example.com",
            snippet: "Another useful source.",
          },
        ],
      },
    });
  });

  it("uses OpenAI Compatible Responses web_search with arbitrary model names", async () => {
    let requestedUrl = "";
    let requestedBody: unknown;
    const fetchFn: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body)) as unknown;
      return sseResponse([
        JSON.stringify({ type: "response.output_text.delta", delta: "Compatible answer" }),
        JSON.stringify({
          type: "response.completed",
          response: {
            output_text: "Compatible answer",
            output: [
              {
                type: "web_search_call",
                action: {
                  sources: [
                    {
                      url: "https://example.com/compatible-source",
                      title: "Compatible source",
                      snippet: "Compatible source snippet.",
                    },
                  ],
                },
              },
            ],
          },
        }),
      ]);
    };

    const runtime = new ClioWebToolRuntime({
      async loadSearchProviderSettings() {
        return {
          provider: "openai-compatible",
          openai: {},
          openaiCompatible: {
            apiKey: "compatible-key",
            model: "any-compatible-model",
            baseUrl: "https://new-api.example.test/v1",
          },
        };
      },
      async loadActiveProviderConfig() {
        return undefined;
      },
      async ensureOpenAIHostPermission() {
        return false;
      },
      async ensureOpenAICompatibleHostPermission(baseUrl) {
        return baseUrl === "https://new-api.example.test/v1";
      },
      fetchFn,
    });

    const events = [];
    for await (const event of runtime.searchWeb({
      runId: "search-run-compatible",
      query: "compatible source returning search",
      createdAt: "2026-06-08T00:00:00.000Z",
    })) {
      events.push(event);
    }

    expect(requestedUrl).toBe("https://new-api.example.test/v1/responses");
    expect(requestedBody).toMatchObject({
      model: "any-compatible-model",
      tools: [{ type: "web_search" }],
      stream: true,
    });
    expect(events[0]).toMatchObject({
      type: "started",
      provider: "OpenAI Compatible Search",
    });
    expect(events.at(-1)).toMatchObject({
      type: "completed",
      result: {
        provider: "OpenAI Compatible Search",
        sources: [
          {
            title: "Compatible source",
            url: "https://example.com/compatible-source",
          },
        ],
      },
    });
  });

  it("uses Chat Completions web_search_options for OpenAI dedicated search models", async () => {
    let requestedUrl = "";
    let requestedBody: unknown;
    const fetchFn: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body)) as unknown;
      return sseResponse([
        JSON.stringify({ choices: [{ delta: { content: "Search " } }] }),
        JSON.stringify({
          choices: [
            {
              delta: {
                content: "answer",
                annotations: [
                  {
                    type: "url_citation",
                    url_citation: {
                      url: "https://example.com/chat-search",
                      title: "Chat search source",
                      snippet: "Chat Search source snippet.",
                    },
                  },
                ],
              },
            },
          ],
        }),
        "[DONE]",
      ]);
    };

    const runtime = new ClioWebToolRuntime({
      async loadSearchProviderSettings() {
        return {
          provider: "openai",
          openai: {
            apiKey: "search-key",
            model: "gpt-5-search-api",
            baseUrl: "https://api.openai.example.test/v1",
          },
          openaiCompatible: {},
        };
      },
      async loadActiveProviderConfig() {
        return undefined;
      },
      async ensureOpenAIHostPermission(baseUrl) {
        return baseUrl === "https://api.openai.example.test/v1";
      },
      async ensureOpenAICompatibleHostPermission() {
        return false;
      },
      fetchFn,
    });

    const events = [];
    for await (const event of runtime.searchWeb({
      runId: "search-run-chat-completions",
      query: "dedicated search model",
      createdAt: "2026-06-08T00:00:00.000Z",
    })) {
      events.push(event);
    }

    expect(requestedUrl).toBe("https://api.openai.example.test/v1/chat/completions");
    expect(requestedBody).toEqual({
      model: "gpt-5-search-api",
      messages: [{ role: "user", content: "dedicated search model" }],
      web_search_options: {},
      stream: true,
    });
    expect(events.map((event) => event.type)).toEqual([
      "started",
      "answer_delta",
      "answer_delta",
      "completed",
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "completed",
      result: {
        answer: "Search answer",
        sources: [
          {
            title: "Chat search source",
            url: "https://example.com/chat-search",
          },
        ],
      },
    });
  });

  it("returns setup-required failure without calling fetch when no search config resolves", async () => {
    let fetchCalled = false;
    const runtime = new ClioWebToolRuntime({
      async loadSearchProviderSettings() {
        return { provider: "auto", openai: {}, openaiCompatible: {} };
      },
      async loadActiveProviderConfig() {
        return {
          provider: "gemini",
          apiKey: "gemini-key",
          model: "gemini-2.5-flash",
          updatedAt: "2026-06-08T00:00:00.000Z",
        };
      },
      async ensureOpenAIHostPermission() {
        return true;
      },
      async ensureOpenAICompatibleHostPermission() {
        return true;
      },
      fetchFn: (async () => {
        fetchCalled = true;
        return new Response();
      }) as typeof fetch,
    });

    const events = [];
    for await (const event of runtime.searchWeb({
      runId: "search-run-2",
      query: "source returning search",
      createdAt: "2026-06-08T00:00:00.000Z",
    })) {
      events.push(event);
    }

    expect(fetchCalled).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "failed",
      error: {
        code: "SEARCH_PROVIDER_CONFIG_REQUIRED",
      },
    });
  });
});
