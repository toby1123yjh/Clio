import { describe, expect, it } from "vitest";
import { isComposerSubmitKeyEvent } from "../app/composer-keyboard";
import type { RailDialogueMessage } from "../app/rail-state";
import {
  assistantThinkingDotCount,
  assistantThinkingIndicatorClassName,
} from "../app/thinking-indicator";
import {
  buildCitationDetailMetrics,
  buildCitationGraphModel,
  buildEmbeddingProviderSettingsInput,
} from "./RailShell";

function keyEvent(input: {
  key: string;
  code?: string;
  shiftKey?: boolean;
  isComposing?: boolean;
}) {
  return {
    key: input.key,
    code: input.code ?? input.key,
    shiftKey: input.shiftKey ?? false,
    nativeEvent: {
      isComposing: input.isComposing ?? false,
    },
  };
}

function assistantMessage(overrides: Partial<RailDialogueMessage> = {}): RailDialogueMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    content: "Answer",
    createdAt: "2026-07-06T00:00:00.000Z",
    scope: "general",
    status: "completed",
    citations: [],
    worldKnowledge: [],
    ...overrides,
  };
}

describe("isComposerSubmitKeyEvent", () => {
  it("accepts plain Enter and numpad Enter", () => {
    expect(isComposerSubmitKeyEvent(keyEvent({ key: "Enter" }))).toBe(true);
    expect(isComposerSubmitKeyEvent(keyEvent({ code: "NumpadEnter", key: "Enter" }))).toBe(true);
  });

  it("keeps Shift+Enter and composing Enter from submitting", () => {
    expect(isComposerSubmitKeyEvent(keyEvent({ key: "Enter", shiftKey: true }))).toBe(false);
    expect(isComposerSubmitKeyEvent(keyEvent({ key: "Enter", isComposing: true }))).toBe(false);
  });

  it("handles Windows IME Process key events when the physical key is Enter", () => {
    expect(isComposerSubmitKeyEvent(keyEvent({ code: "Enter", key: "Process" }))).toBe(true);
    expect(isComposerSubmitKeyEvent(keyEvent({ code: "KeyA", key: "Process" }))).toBe(false);
  });
});

describe("assistant thinking indicator", () => {
  it("uses exactly three animated dots instead of a static text-only placeholder", () => {
    expect(assistantThinkingIndicatorClassName).toBe("clio-thinking-indicator");
    expect(assistantThinkingDotCount).toBe(3);
  });
});

describe("buildEmbeddingProviderSettingsInput", () => {
  it("builds the dedicated embedding provider payload without reindex authorization fields", () => {
    const input = buildEmbeddingProviderSettingsInput({
      activeProvider: "openai-compatible",
      openAIApiKey: "openai-key",
      openAIModel: "text-embedding-3-small",
      openAIBaseUrl: "https://api.openai.com/v1",
      compatibleApiKey: "compatible-key",
      compatibleModel: "embedding-model",
      compatibleBaseUrl: "https://example.test/v1",
      compatibleProviderName: "Example",
    });

    expect(input).toEqual({
      activeProvider: "openai-compatible",
      openai: {
        apiKey: "openai-key",
        model: "text-embedding-3-small",
        baseUrl: "https://api.openai.com/v1",
      },
      openaiCompatible: {
        apiKey: "compatible-key",
        model: "embedding-model",
        baseUrl: "https://example.test/v1",
        providerName: "Example",
      },
    });
    expect(input).not.toHaveProperty("scope");
    expect(input).not.toHaveProperty("authorizedAt");
    expect(input).not.toHaveProperty("reindex");
  });
});

describe("citation detail helpers", () => {
  it("builds compact validation metrics with quality, judge, and retry state", () => {
    const metrics = buildCitationDetailMetrics({
      status: "warning",
      reason: "unsupported_memory_claim",
      evidenceCount: 3,
      memoryEvidenceCount: 2,
      citationCount: 5,
      validCitationCount: 4,
      validMemoryCitationCount: 3,
      claimCount: 4,
      coveredClaimCount: 2,
      uncoveredClaimCount: 2,
      evidenceQuality: "weak",
      supportCheck: "semantic_unsupported",
      semanticJudge: {
        status: "unsupported",
        checkedClaimCount: 4,
        unsupportedClaimCount: 2,
        providerKind: "chat",
      },
      retry: {
        attempted: true,
        count: 1,
        exhausted: true,
      },
    });

    expect(metrics).toEqual([
      { label: "Evidence", value: "2/3" },
      { label: "Claims", value: "2/4" },
      { label: "Citations", value: "3/5" },
      { label: "Quality", value: "weak" },
      { label: "Judge", value: "unsupported" },
      { label: "Retry", value: "1 exhausted" },
    ]);
  });

  it("caps graph projection and dedupes repeated evidence ids", () => {
    const model = buildCitationGraphModel(
      assistantMessage({
        citations: [
          citation("cite-1", "memory:a:chunk:1", "Source A"),
          citation("cite-2", "memory:a:chunk:1", "Source A duplicate"),
          citation("cite-3", "memory:b:chunk:1", "Source B"),
          citation("cite-4", "memory:c:chunk:1", "Source C"),
          citation("cite-5", "memory:d:chunk:1", "Source D"),
          citation("cite-6", "memory:e:chunk:1", "Source E"),
        ],
        citationValidation: {
          status: "warning",
          reason: "unsupported_memory_claim",
          evidenceCount: 6,
          memoryEvidenceCount: 6,
          citationCount: 6,
          validCitationCount: 6,
          validMemoryCitationCount: 6,
          uncoveredClaims: [
            { text: "Claim one", position: 0, reason: "semantic_unsupported" },
            { text: "Claim two", position: 1, reason: "semantic_unsupported" },
            { text: "Claim three", position: 2, reason: "semantic_unsupported" },
            { text: "Claim four", position: 3, reason: "semantic_unsupported" },
          ],
        },
      }),
    );

    expect(model).not.toBeNull();
    expect(model?.claimNodes).toHaveLength(3);
    expect(model?.citationNodes).toHaveLength(4);
    expect(model?.omittedClaimCount).toBe(1);
    expect(model?.omittedCitationCount).toBe(1);
    expect(model?.citationNodes.map((node) => node.label)).toEqual([
      "Source A",
      "Source B",
      "Source C",
      "Source D",
    ]);
  });

  it("does not build a graph projection for assistant messages without validation", () => {
    expect(buildCitationGraphModel(assistantMessage())).toBeNull();
  });
});

function citation(id: string, evidenceId: string, sourceTitle: string) {
  return {
    id,
    evidenceId,
    label: sourceTitle,
    sourceKind: "memory" as const,
    sourceUrl: "https://example.com/source",
    sourceTitle,
    excerpt: "Bounded evidence excerpt",
  };
}
