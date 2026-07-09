import type { StreamFn } from "@earendil-works/pi-agent-core";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
  type KnowledgeBaseClusterLabelRefinementInput,
  ProviderBackedKnowledgeBaseClusterLabelRefiner,
  boundKnowledgeBaseClusterLabelRefinementInput,
  buildKnowledgeBaseClusterLabelRefinementPrompt,
} from "./knowledge-base-cluster-label-refiner";

function input(
  overrides: Partial<KnowledgeBaseClusterLabelRefinementInput> = {},
): KnowledgeBaseClusterLabelRefinementInput {
  return {
    clusters: [
      {
        id: "kb-cluster:topic:retrieval",
        label: "Retrieval",
        summary: "Sources about retrieval quality.",
        clusterBy: "topic",
        sourceCount: 2,
        examples: [
          {
            sourceId: "source:1",
            title: "Retrieval Evaluation Study",
            sourceType: "paper",
            year: 2026,
            venue: "Local RAG Symposium",
            authors: ["Ada Lovelace"],
            abstractSnippet: "Evaluates bounded retrieval quality.",
            topicTerms: ["retrieval", "evaluation"],
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

function refiner(streamFn: StreamFn) {
  return new ProviderBackedKnowledgeBaseClusterLabelRefiner({
    loadConfig: async () => ({
      provider: "openai",
      apiKey: "sk-test",
      model: "gpt-test",
      baseUrl: "https://api.openai.example.test/v1",
      updatedAt: "2026-07-09T00:00:00.000Z",
    }),
    ensureProviderPermission: async () => true,
    streamFn,
  });
}

describe("ProviderBackedKnowledgeBaseClusterLabelRefiner", () => {
  it("sends bounded cluster metadata to the active chat provider", async () => {
    let observedPrompt = "";
    let observedApiKey = "";
    const result = await refiner(
      streamJson(
        JSON.stringify({
          clusters: [
            {
              clusterId: "kb-cluster:topic:retrieval",
              label: "Retrieval Evaluation",
              summary: "Papers about bounded retrieval evaluation.",
              confidence: 0.82,
            },
          ],
        }),
        (_model, context, options) => {
          observedPrompt = String(context.messages[0]?.content ?? "");
          observedApiKey = String(options?.apiKey ?? "");
        },
      ),
    ).refine(input());

    expect(observedPrompt).toContain("bounded source-level metadata");
    expect(observedPrompt).toContain("abstractSnippet");
    expect(observedPrompt).not.toContain("apiKey");
    expect(observedPrompt).not.toContain("normalizedText");
    expect(observedPrompt).not.toContain("fullText");
    expect(observedPrompt).not.toContain("chunkText");
    expect(observedApiKey).toBe("sk-test");
    expect(result).toMatchObject({
      status: "refined",
      providerKind: "chat",
      clusters: [
        {
          clusterId: "kb-cluster:topic:retrieval",
          status: "refined",
          providerKind: "chat",
          label: "Retrieval Evaluation",
          summary: "Papers about bounded retrieval evaluation.",
          confidence: 0.82,
        },
      ],
    });
  });

  it("bounds prompt input without full document or secret fields", () => {
    const longTail = "TAIL_SHOULD_NOT_APPEAR";
    const bounded = boundKnowledgeBaseClusterLabelRefinementInput(
      input({
        clusters: [
          {
            id: "kb-cluster:topic:retrieval",
            label: `${"retrieval ".repeat(40)}${longTail}`,
            summary: `${"summary ".repeat(80)}${longTail}`,
            clusterBy: "topic",
            sourceCount: 1,
            examples: [
              {
                sourceId: "source:1",
                title: `${"title ".repeat(80)}${longTail}`,
                abstractSnippet: `${"abstract ".repeat(120)}${longTail}`,
                topicTerms: Array.from({ length: 16 }, (_, index) => `term-${index}`),
              },
            ],
          },
        ],
      }),
    );
    const prompt = buildKnowledgeBaseClusterLabelRefinementPrompt(bounded);

    expect(prompt).toContain("clusters");
    expect(prompt).not.toContain("apiKey");
    expect(prompt).not.toContain("pdfBytes");
    expect(prompt).not.toContain("rawProviderResponse");
    expect(prompt).not.toContain(longTail);
    const [cluster] = bounded.clusters;
    if (cluster === undefined) throw new Error("Expected a bounded cluster.");
    const [example] = cluster.examples;
    if (example === undefined) throw new Error("Expected a bounded example.");
    expect(cluster.label.length).toBeLessThanOrEqual(80);
    expect(example.abstractSnippet?.length).toBeLessThanOrEqual(360);
    expect(example.topicTerms).toHaveLength(8);
  });

  it("soft-fails when provider config is unavailable", async () => {
    const runtime = new ProviderBackedKnowledgeBaseClusterLabelRefiner({
      loadConfig: async () => undefined,
      ensureProviderPermission: async () => true,
      streamFn: streamJson("{}"),
    });

    await expect(runtime.refine(input())).resolves.toMatchObject({
      status: "unavailable",
      providerKind: "chat",
      clusters: [],
    });
  });

  it("reports malformed JSON as a refinement error", async () => {
    const result = await refiner(streamJson("not json")).refine(input());

    expect(result).toMatchObject({
      status: "error",
      reason: "kb_cluster_label_refinement_malformed_json",
    });
  });
});
