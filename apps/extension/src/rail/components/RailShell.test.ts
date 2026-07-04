import { describe, expect, it } from "vitest";
import { isComposerSubmitKeyEvent } from "../app/composer-keyboard";
import {
  assistantThinkingDotCount,
  assistantThinkingIndicatorClassName,
} from "../app/thinking-indicator";
import { buildEmbeddingProviderSettingsInput } from "./RailShell";

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
