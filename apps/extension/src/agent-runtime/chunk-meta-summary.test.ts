import type { StreamFn } from "@earendil-works/pi-agent-core";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
  type ChunkMetaSummaryInput,
  ProviderBackedChunkMetaSummarizer,
  boundChunkMetaSummaryInput,
  buildChunkMetaSummaryPrompt,
} from "./chunk-meta-summary";

function input(overrides: Partial<ChunkMetaSummaryInput> = {}): ChunkMetaSummaryInput {
  return {
    sourceId: "source:1",
    chunkId: "chunk:1",
    ord: 1,
    role: "child",
    sourceTitle: "Retrieval Evaluation Study",
    sourceType: "paper",
    docContext: "Title: Retrieval Evaluation Study\nSource type: paper",
    sectionPath: "Methods > Retrieval",
    chunkTextExcerpt: "The retrieval method combines local memories with bounded evidence.",
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

type StreamCallObserver = (
  model: Parameters<StreamFn>[0],
  context: Parameters<StreamFn>[1],
  options: Parameters<StreamFn>[2],
) => void;

function streamJson(json: string, onCall?: StreamCallObserver): StreamFn {
  return (model, context, options) => {
    onCall?.(model, context, options);
    const stream = createAssistantMessageEventStream();
    const output = assistant(json);
    stream.push({ type: "start", partial: assistant("") });
    stream.push({
      type: "text_delta",
      contentIndex: 0,
      delta: json,
      partial: output,
    });
    stream.push({ type: "done", reason: "stop", message: output });
    return stream;
  };
}

function summarizer(streamFn: StreamFn) {
  return new ProviderBackedChunkMetaSummarizer({
    loadConfig: async () => ({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-test",
      baseUrl: "https://api.openai.example.test/v1",
      updatedAt: "2026-07-07T00:00:00.000Z",
    }),
    ensureProviderPermission: async () => true,
    streamFn,
  });
}

describe("ProviderBackedChunkMetaSummarizer", () => {
  it("sends bounded chunk metadata to the active chat provider", async () => {
    let observedPrompt = "";
    let observedApiKey = "";
    const result = await summarizer(
      streamJson(
        JSON.stringify({
          sectionSummary: "Methods describe bounded retrieval.",
          chunkSummary: "The chunk explains local memory retrieval with evidence bounds.",
          semanticRelations: [
            {
              kind: "role",
              target: "method",
              label: "Methods",
              confidence: 0.72,
              reason: "The chunk describes retrieval method details.",
            },
          ],
        }),
        (_model, context, options) => {
          observedPrompt = String(context.messages[0]?.content ?? "");
          observedApiKey = String(options?.apiKey ?? "");
        },
      ),
    ).summarize(input());

    expect(observedPrompt).toContain("Do not use outside knowledge");
    expect(observedPrompt).toContain("chunkTextExcerpt");
    expect(observedApiKey).toBe("sk-test");
    expect(result).toMatchObject({
      status: "summarized",
      providerKind: "chat",
      sectionSummary: "Methods describe bounded retrieval.",
      chunkSummary: "The chunk explains local memory retrieval with evidence bounds.",
      semanticRelations: [
        {
          kind: "role",
          target: "method",
          label: "Methods",
          confidence: 0.72,
          reason: "The chunk describes retrieval method details.",
          source: "remote_llm",
        },
      ],
    });
  });

  it("soft-fails when provider config is unavailable", async () => {
    const runtime = new ProviderBackedChunkMetaSummarizer({
      loadConfig: async () => undefined,
      ensureProviderPermission: async () => true,
      streamFn: streamJson("{}"),
    });

    await expect(runtime.summarize(input())).resolves.toMatchObject({
      status: "unavailable",
      providerKind: "chat",
    });
  });

  it("bounds prompt input without full document or secret fields", () => {
    const longTail = "TAIL_SHOULD_NOT_APPEAR";
    const bounded = boundChunkMetaSummaryInput(
      input({
        docContext: `${"doc context ".repeat(200)}${longTail}`,
        chunkTextExcerpt: `${"chunk text ".repeat(400)}${longTail}`,
      }),
    );
    const prompt = buildChunkMetaSummaryPrompt(bounded);

    expect(prompt).toContain("chunkTextExcerpt");
    expect(prompt).toContain("semanticRelations");
    expect(prompt).not.toContain("apiKey");
    expect(prompt).not.toContain("normalizedText");
    expect(prompt).not.toContain("fullText");
    expect(prompt).not.toContain(longTail);
    expect(bounded.chunkTextExcerpt.length).toBeLessThanOrEqual(1_800);
  });

  it("bounds semantic relation candidates from provider JSON", async () => {
    const longTail = "RELATION_TAIL_SHOULD_NOT_APPEAR";
    const result = await summarizer(
      streamJson(
        JSON.stringify({
          semanticRelations: [
            {
              kind: "citation_hint",
              target: `10.5555/clio.${"x".repeat(500)}${longTail}`,
              label: `reference ${"label ".repeat(80)}${longTail}`,
              confidence: 2,
              reason: `short evidence ${"reason ".repeat(80)}${longTail}`,
            },
            {
              kind: "unsupported",
              target: "ignored",
              confidence: 0.5,
            },
          ],
        }),
      ),
    ).summarize(input());

    expect(result.status).toBe("summarized");
    expect(result.semanticRelations).toHaveLength(1);
    expect(result.semanticRelations?.[0]).toMatchObject({
      kind: "citation_hint",
      confidence: 1,
      source: "remote_llm",
    });
    expect(JSON.stringify(result)).not.toContain(longTail);
  });

  it("reports malformed JSON as a summary error", async () => {
    const result = await summarizer(streamJson("not json")).summarize(input());

    expect(result).toMatchObject({
      status: "error",
      reason: "chunk_meta_summary_malformed_json",
    });
  });
});
