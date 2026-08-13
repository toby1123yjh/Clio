import { describe, expect, it } from "vitest";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { ProviderBackedSourceFineRanker, buildSourceFineRankPrompt } from "./source-fine-ranker";

const config = {
  provider: "openai" as const,
  apiKey: "secret",
  model: "main-model",
  baseUrl: "https://api.example.test/v1",
  updatedAt: "2026-08-13T00:00:00.000Z",
};

function input() {
  return {
    query: "find result",
    strength: "balanced" as const,
    promptVersion: "test-v1",
    candidates: [
      {
        source: {
          id: "source-a",
          title: "A",
          sourceType: "paper",
          keywords: ["rag"],
          sectionHeadings: ["Results"],
        },
        evidence: [{ id: "evidence-a", chunkId: "chunk-a", excerpt: "result" }],
        wiki: [
          {
            artifactId: "artifact-a",
            artifactKind: "source_digest",
            title: "Digest",
            outline: "Result",
            evidenceRefs: ["evidence-a"],
          },
        ],
      },
    ],
  };
}

function assistant(content: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: content }],
    api: "openai-responses",
    provider: "openai",
    model: "main-model",
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function streamJson(value: unknown): StreamFn {
  const text = JSON.stringify(value);
  return () => {
    const stream = createAssistantMessageEventStream();
    queueMicrotask(() => {
      stream.push({ type: "done", reason: "stop", message: assistant(text) });
      stream.end();
    });
    return stream;
  };
}

describe("ProviderBackedSourceFineRanker", () => {
  it("short-circuits when Wiki is disabled", async () => {
    let calls = 0;
    const ranker = new ProviderBackedSourceFineRanker({
      loadSettings: async () => ({ wiki: { enabled: false } }),
      loadConfig: async () => config,
      ensureProviderPermission: async () => true,
      streamFn: async () => {
        calls += 1;
        return createAssistantMessageEventStream();
      },
    });
    await expect(ranker.rank(input())).rejects.toMatchObject({ code: "wiki_disabled" });
    expect(calls).toBe(0);
  });

  it("uses the configured Main Model and returns validated judgments", async () => {
    let prompt = "";
    const ranker = new ProviderBackedSourceFineRanker({
      loadSettings: async () => ({ wiki: { enabled: true } }),
      loadConfig: async () => config,
      ensureProviderPermission: async () => true,
      streamFn: (model, context) => {
        void model;
        prompt = String(context.messages[0]?.content ?? "");
        return streamJson({
          judgments: [
            {
              sourceId: "source-a",
              decision: "keep",
              relevance: "high",
              reason: "evidence matches",
              confidence: 0.9,
              evidenceRefs: ["evidence-a"],
            },
          ],
        })(model, context, {});
      },
    });
    const result = await ranker.rank(input());
    expect(result.judgments[0]?.sourceId).toBe("source-a");
    expect(result.model).toBe("main-model");
    expect(prompt).toContain("source-a");
    expect(prompt).not.toContain("secret");
    expect(buildSourceFineRankPrompt(input())).toContain("Judge every source candidate exactly once");
  });
});
