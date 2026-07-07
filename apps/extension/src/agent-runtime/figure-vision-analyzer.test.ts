import type { StreamFn } from "@earendil-works/pi-agent-core";
import { type AssistantMessage, createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import {
  type FigureVisionAnalysisInput,
  ProviderBackedFigureVisionAnalyzer,
  boundFigureVisionInput,
  buildFigureVisionPrompt,
} from "./figure-vision-analyzer";
import { defaultVisionProviderSettings } from "./vision-provider-settings";

const pngBase64 = "iVBORw0KGgo=";

function input(overrides: Partial<FigureVisionAnalysisInput> = {}): FigureVisionAnalysisInput {
  return {
    analysisId: "figure-analysis:1",
    imageId: "image:1",
    pageNumber: 3,
    label: "Figure 2",
    caption: "Accuracy improves as retrieval depth increases.",
    pageContext: "The surrounding page discusses retrieval depth and answer quality.",
    image: {
      base64: pngBase64,
      mimeType: "image/png",
      byteLength: 8,
    },
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

function analyzer(streamFn: StreamFn) {
  return new ProviderBackedFigureVisionAnalyzer({
    loadVisionProviderSettings: async () => defaultVisionProviderSettings(),
    loadActiveProviderConfig: async () => ({
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

describe("ProviderBackedFigureVisionAnalyzer", () => {
  it("sends bounded text plus image input to a vision-capable provider", async () => {
    let observedContent: unknown;
    const result = await analyzer(
      streamJson(
        JSON.stringify({
          summary: "A line chart shows accuracy rising with retrieval depth.",
          chartType: "line",
          extractedLabels: ["Retrieval depth", "Accuracy"],
          extractedValues: ["1", "3", "5"],
          claims: [
            {
              claimId: "claim:0",
              text: "Accuracy increases as retrieval depth grows.",
              confidence: "high",
            },
          ],
        }),
        (_model, context) => {
          observedContent = context.messages[0]?.content;
        },
      ),
    ).analyze(input());

    expect(observedContent).toEqual([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("Do not use full PDF text"),
      }),
      {
        type: "image",
        data: pngBase64,
        mimeType: "image/png",
      },
    ]);
    expect(result).toMatchObject({
      status: "analyzed",
      analysisId: "figure-analysis:1",
      imageId: "image:1",
      chartType: "line",
      extractedLabels: ["Retrieval depth", "Accuracy"],
      extractedValues: ["1", "3", "5"],
      claims: [
        {
          claimId: "claim:0",
          text: "Accuracy increases as retrieval depth grows.",
          confidence: "high",
        },
      ],
    });
  });

  it("soft-fails when provider config is unavailable", async () => {
    const runtime = new ProviderBackedFigureVisionAnalyzer({
      loadVisionProviderSettings: async () => defaultVisionProviderSettings(),
      loadActiveProviderConfig: async () => undefined,
      ensureProviderPermission: async () => true,
      streamFn: streamJson("{}"),
    });

    await expect(runtime.analyze(input())).resolves.toMatchObject({
      status: "unavailable",
      analysisId: "figure-analysis:1",
      imageId: "image:1",
      claims: [],
    });
  });

  it("uses the global Vision override before the active provider config", async () => {
    let observedModelId = "";
    const runtime = new ProviderBackedFigureVisionAnalyzer({
      loadVisionProviderSettings: async () => ({
        provider: "openai",
        gemini: {},
        openai: {
          apiKey: "sk-vision",
          model: "gpt-vision-explicit",
          baseUrl: "https://vision.openai.example.test/v1",
        },
        openaiCompatible: {},
      }),
      loadActiveProviderConfig: async () => ({
        provider: "gemini",
        apiKey: "main-gemini-key",
        model: "gemini-main",
        updatedAt: "2026-07-07T00:00:00.000Z",
      }),
      ensureProviderPermission: async () => true,
      streamFn: streamJson("{}", (model, _context, options) => {
        observedModelId = model.id;
        expect(options?.apiKey).toBe("sk-vision");
      }),
    });

    await expect(runtime.analyze(input())).resolves.toMatchObject({
      status: "analyzed",
      analysisId: "figure-analysis:1",
      imageId: "image:1",
    });
    expect(observedModelId).toBe("gpt-vision-explicit");
  });

  it("bounds prompt text without including image bytes in the text prompt", () => {
    const longTail = "TAIL_SHOULD_NOT_APPEAR";
    const bounded = boundFigureVisionInput(
      input({
        caption: `${"caption ".repeat(120)}${longTail}`,
        pageContext: `${"context ".repeat(200)}${longTail}`,
        image: {
          base64: `${pngBase64}${"A".repeat(5_100_000)}`,
          mimeType: "image/png",
        },
      }),
    );
    const prompt = buildFigureVisionPrompt(bounded);

    expect(prompt).toContain("base64Length");
    expect(prompt).not.toContain(pngBase64);
    expect(prompt).not.toContain(longTail);
    expect(bounded.image.base64.length).toBeLessThanOrEqual(5_000_000);
  });

  it("reports malformed JSON as an analyzer error", async () => {
    const result = await analyzer(streamJson("not json")).analyze(input());

    expect(result).toMatchObject({
      status: "error",
      reason: "figure_vision_malformed_json",
      claims: [],
    });
  });
});
