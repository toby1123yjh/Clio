import type { WikiCompileMapInput, WikiCompileReduceInput } from "@/src/shared/wiki-compile";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import type { StoredProviderConfig } from "./provider-settings";
import {
  ProviderBackedWikiCompiler,
  WikiCompilerError,
  buildWikiCompileMapPrompt,
} from "./wiki-compiler";

const config: StoredProviderConfig = {
  provider: "openai",
  apiKey: "test-key",
  model: "gpt-test",
  baseUrl: "https://api.example.test/v1",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

const budget = {
  contextTokens: 8_192,
  maxInputTokens: 6_000,
  maxOutputTokens: 1_000,
  maxStepTokens: 4_000,
  maxReduceInputTokens: 6_000,
  maxDigestTokens: 600,
  maxOverlapTokens: 200,
};

const mapInput: WikiCompileMapInput = {
  runId: "run-1",
  stepId: "step-1",
  inputSignature: "signature-1",
  source: { id: "source-1", title: "Paper", contentHash: "hash-1" },
  mainChunks: [{ id: "chunk-1", ord: 0, text: "Bounded evidence.", tokenCount: 10 }],
  overlapChunks: [],
  priorDigest: "",
  budget,
};

function assistant(content: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text: content }],
    api: "openai-responses",
    provider: "openai",
    model: "gpt-test",
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

function streamJson(output: string): StreamFn {
  return () => {
    const stream = createAssistantMessageEventStream();
    queueMicrotask(() => {
      stream.push({ type: "done", reason: "stop", message: assistant(output) });
      stream.end();
    });
    return stream;
  };
}

function compiler(output: string) {
  return new ProviderBackedWikiCompiler({
    loadConfig: async () => config,
    ensureProviderPermission: async () => true,
    streamFn: streamJson(output),
  });
}

describe("Wiki compiler provider adapter", () => {
  it("maps a bounded chunk batch and preserves exact main coverage", async () => {
    const result = await compiler(
      JSON.stringify({
        findings: [
          {
            kind: "fact",
            key: "fact-1",
            title: "Finding",
            summary: "Bounded evidence.",
            evidenceChunkIds: ["chunk-1"],
          },
        ],
        claims: [
          { key: "claim-1", text: "A claim", evidenceChunkIds: ["chunk-1"], confidence: 0.8 },
        ],
        rollingDigest: "The source contains one bounded fact.",
        coveredChunkIds: ["chunk-1"],
      }),
    ).analyzeStep(mapInput);
    expect(result.coveredChunkIds).toEqual(["chunk-1"]);
    expect(buildWikiCompileMapPrompt(mapInput)).not.toContain("normalizedText");
  });

  it("rejects malformed output and evidence outside the supplied chunks", async () => {
    await expect(compiler("not-json").analyzeStep(mapInput)).rejects.toMatchObject({
      code: "malformed_output",
    });
    await expect(
      compiler(
        JSON.stringify({
          findings: [],
          claims: [{ key: "claim", text: "Claim", evidenceChunkIds: ["chunk-x"], confidence: 0.5 }],
          rollingDigest: "digest",
          coveredChunkIds: ["chunk-1"],
        }),
      ).analyzeStep(mapInput),
    ).rejects.toMatchObject({ code: "validation" });
  });

  it("reduces checkpoints into bounded source artifacts", async () => {
    const input: WikiCompileReduceInput = {
      runId: "run-1",
      inputSignature: "signature-1",
      source: mapInput.source,
      checkpoints: [
        {
          stepId: "step-1",
          stepIndex: 0,
          findings: [],
          claims: [],
          rollingDigest: "digest",
          coveredChunkIds: ["chunk-1"],
        },
      ],
      manifestChunkIds: ["chunk-1"],
      budget,
    };
    const result = await compiler(
      JSON.stringify({
        digest: { title: "Paper", content: "Digest", evidenceChunkIds: ["chunk-1"] },
        sections: [
          { key: "overview", title: "Overview", content: "Text", evidenceChunkIds: ["chunk-1"] },
        ],
        claims: [],
        coveredChunkIds: ["chunk-1"],
      }),
    ).reduce(input);
    expect(result.digest.title).toBe("Paper");
  });

  it("classifies unavailable configuration and aborted work", async () => {
    const unavailable = new ProviderBackedWikiCompiler({
      loadConfig: async () => undefined,
      ensureProviderPermission: async () => true,
    });
    await expect(unavailable.analyzeStep(mapInput)).rejects.toMatchObject({ code: "unavailable" });

    const controller = new AbortController();
    controller.abort();
    await expect(
      compiler("{}").analyzeStep(mapInput, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(WikiCompilerError);
  });
});
