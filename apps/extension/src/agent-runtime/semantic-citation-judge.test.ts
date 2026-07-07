import type { StreamFn } from "@earendil-works/pi-agent-core";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
  ProviderBackedSemanticCitationJudge,
  type SemanticCitationJudgeInput,
  boundSemanticJudgeInput,
  buildSemanticCitationJudgePrompt,
} from "./semantic-citation-judge";

function input(overrides: Partial<SemanticCitationJudgeInput> = {}): SemanticCitationJudgeInput {
  return {
    question: "What does the saved paper say?",
    claims: [
      {
        claimId: "claim:0",
        claimPreview: "The saved paper says Clio stores bounded evidence windows.",
        citations: [
          {
            citationId: "cite-1",
            evidenceId: "memory:source-1:chunk:chunk-1",
            evidenceTitle: "Saved Paper",
            evidenceExcerpt: "Clio stores bounded evidence windows for provider prompts.",
          },
        ],
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

function streamJson(json: string): StreamFn {
  return () => {
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

function judge(streamFn: StreamFn) {
  return new ProviderBackedSemanticCitationJudge({
    loadConfig: async () => ({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-test",
      baseUrl: "https://api.openai.example.test/v1",
      updatedAt: "2026-07-06T00:00:00.000Z",
    }),
    ensureProviderPermission: async () => true,
    streamFn,
  });
}

describe("ProviderBackedSemanticCitationJudge", () => {
  it("returns supported when every claim is entailed", async () => {
    const result = await judge(
      streamJson('{"claims":[{"claimId":"claim:0","supported":true,"reason":"direct"}]}'),
    ).judge(input());

    expect(result).toMatchObject({
      status: "supported",
      checkedClaimCount: 1,
      unsupportedClaimIds: [],
      providerKind: "chat",
    });
  });

  it("returns unsupported claim ids from JSON verdicts", async () => {
    const result = await judge(
      streamJson('{"claims":[{"claimId":"claim:0","supported":false,"reason":"not stated"}]}'),
    ).judge(input());

    expect(result).toMatchObject({
      status: "unsupported",
      checkedClaimCount: 1,
      unsupportedClaimIds: ["claim:0"],
      reason: "not stated",
    });
  });

  it("soft-fails when provider config is unavailable", async () => {
    const runtime = new ProviderBackedSemanticCitationJudge({
      loadConfig: async () => undefined,
      loadProviderId: async () => "openai",
      ensureProviderPermission: async () => true,
      streamFn: streamJson("{}"),
    });

    await expect(runtime.judge(input())).resolves.toMatchObject({
      status: "unavailable",
      checkedClaimCount: 1,
      unsupportedClaimIds: [],
    });
  });

  it("soft-fails malformed JSON as judge error", async () => {
    const result = await judge(streamJson("not json")).judge(input());

    expect(result).toMatchObject({
      status: "error",
      checkedClaimCount: 1,
      reason: "semantic_judge_malformed_json",
    });
  });

  it("bounds prompt input to claim previews and evidence excerpts", () => {
    const longTail = "TAIL_SHOULD_NOT_APPEAR";
    const bounded = boundSemanticJudgeInput(
      input({
        question: `${"question ".repeat(200)}${longTail}`,
        claims: [
          {
            claimId: "claim:0",
            claimPreview: `${"claim ".repeat(100)}${longTail}`,
            citations: [
              {
                citationId: "cite-1",
                evidenceId: "memory:source-1:chunk:chunk-1",
                evidenceTitle: "Saved Paper",
                evidenceExcerpt: `${"bounded excerpt ".repeat(120)}${longTail}`,
              },
            ],
          },
        ],
      }),
    );
    const prompt = buildSemanticCitationJudgePrompt(bounded);

    expect(prompt).toContain("memory:source-1:chunk:chunk-1");
    expect(prompt).not.toContain(longTail);
    expect(bounded.claims[0]?.citations[0]?.evidenceExcerpt.length).toBeLessThanOrEqual(900);
  });
});
