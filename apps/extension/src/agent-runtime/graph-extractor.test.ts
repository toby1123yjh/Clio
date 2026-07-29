import type { StreamFn } from "@earendil-works/pi-agent-core";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
  type GraphExtractionInput,
  ProviderBackedGraphExtractor,
  boundGraphExtractionInput,
  buildGraphExtractionPrompt,
  parseGraphExtractionOutput,
} from "./graph-extractor";

function input(overrides: Partial<GraphExtractionInput> = {}): GraphExtractionInput {
  return {
    sourceId: "source:1",
    sourceTitle: "Bounded RAG Study",
    sourceType: "paper",
    abstract: "A bounded retrieval study.",
    chunks: [
      {
        chunkId: "chunk:1",
        ord: 1,
        sectionPath: "Methods",
        excerpt: "The method uses reciprocal rank fusion over bounded evidence.",
      },
    ],
    ...overrides,
  };
}

function assistant(content: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: content }],
    api: "openai-responses",
    provider: "openai",
    model: "gpt-test",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function streamJson(json: string, onCall?: (prompt: string) => void): StreamFn {
  return (_model, context) => {
    onCall?.(String(context.messages[0]?.content ?? ""));
    const stream = createAssistantMessageEventStream();
    const output = assistant(json);
    stream.push({ type: "start", partial: assistant("") });
    stream.push({ type: "text_delta", contentIndex: 0, delta: json, partial: output });
    stream.push({ type: "done", reason: "stop", message: output });
    return stream;
  };
}

function extractor(streamFn: StreamFn) {
  return new ProviderBackedGraphExtractor({
    loadConfig: async () => ({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-test",
      baseUrl: "https://api.openai.example.test/v1",
      updatedAt: "2026-07-10T00:00:00.000Z",
    }),
    ensureProviderPermission: async () => true,
    streamFn,
  });
}

describe("ProviderBackedGraphExtractor", () => {
  it("sends only bounded source metadata and selected chunk excerpts", async () => {
    let prompt = "";
    const result = await extractor(
      streamJson(
        JSON.stringify({
          entities: [{ id: "method:1", kind: "method", label: "RRF", confidence: 0.9 }],
          relations: [
            {
              sourceEntityId: "source",
              targetEntityId: "method:1",
              dimension: "technical",
              edgeType: "uses",
              confidence: 0.9,
              evidenceChunkIds: ["chunk:1"],
            },
          ],
        }),
        (value) => {
          prompt = value;
        },
      ),
    ).extract(input());

    expect(result.status).toBe("extracted");
    expect(prompt).toContain("evidenceChunkIds");
    expect(prompt).toContain("chunk:1");
    expect(prompt).not.toContain("apiKey");
    expect(prompt).not.toContain("fullText");
    expect(prompt).not.toContain("pdfBytes");
  });

  it("bounds chunk count and excerpt length", () => {
    const tail = "TAIL_SHOULD_NOT_APPEAR";
    const bounded = boundGraphExtractionInput(
      input({
        chunks: Array.from({ length: 20 }, (_, index) => ({
          chunkId: `chunk:${index}`,
          ord: index,
          excerpt: `${"bounded excerpt ".repeat(100)}${tail}`,
        })),
      }),
    );
    const prompt = buildGraphExtractionPrompt(bounded);

    expect(bounded.chunks).toHaveLength(10);
    expect(bounded.chunks.every((chunk) => chunk.excerpt.length <= 900)).toBe(true);
    expect(prompt).not.toContain(tail);
  });

  it("drops relations without evidence anchors or with unknown chunk ids", () => {
    const result = parseGraphExtractionOutput(
      JSON.stringify({
        entities: [{ id: "method:1", kind: "method", label: "RRF", confidence: 0.9 }],
        relations: [
          {
            sourceEntityId: "source",
            targetEntityId: "method:1",
            dimension: "technical",
            edgeType: "uses",
            confidence: 0.9,
            evidenceChunkIds: [],
          },
          {
            sourceEntityId: "source",
            targetEntityId: "method:1",
            dimension: "technical",
            edgeType: "uses",
            confidence: 0.9,
            evidenceChunkIds: ["chunk:not-input"],
          },
        ],
      }),
      input(),
    );

    expect(result).toMatchObject({
      status: "error",
      reason: "graph_extraction_missing_anchored_relations",
    });
  });

  it("reports malformed JSON", async () => {
    await expect(extractor(streamJson("not json")).extract(input())).resolves.toMatchObject({
      status: "error",
      reason: "graph_extraction_malformed_json",
    });
  });

  it("soft-fails when the provider is unavailable", async () => {
    const runtime = new ProviderBackedGraphExtractor({
      loadConfig: async () => undefined,
      ensureProviderPermission: async () => true,
      streamFn: streamJson("{}"),
    });

    await expect(runtime.extract(input())).resolves.toMatchObject({
      status: "unavailable",
      entities: [],
      relations: [],
    });
  });
});
