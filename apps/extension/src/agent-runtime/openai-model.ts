import type { Model } from "@earendil-works/pi-ai";
import { resolveOpenAIBaseUrl, resolveOpenAICompatibleBaseUrl } from "./openai-provider-config";
import { defaultOpenAICompatibleProviderName } from "./provider-settings";

export function openAIResponsesModel(modelId: string, baseUrl?: string): Model<"openai-responses"> {
  return {
    id: modelId,
    name: modelId,
    api: "openai-responses",
    provider: "openai",
    baseUrl: resolveOpenAIBaseUrl(baseUrl),
    reasoning: modelId.includes("o") || modelId.includes("gpt-5"),
    thinkingLevelMap: openAIResponsesThinkingLevelMap(modelId),
    input: ["text", "image"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: modelId.includes("4o") ? 128_000 : 400_000,
    maxTokens: 8192,
  };
}

export function openAICompatibleCompletionsModel(
  modelId: string,
  baseUrl?: string,
  providerName = defaultOpenAICompatibleProviderName,
): Model<"openai-completions"> {
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider: providerName,
    baseUrl: resolveOpenAICompatibleBaseUrl(baseUrl),
    reasoning: false,
    input: ["text", "image"],
    compat: {
      maxTokensField: "max_tokens",
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsStore: false,
      supportsUsageInStreaming: false,
    },
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: modelId.includes("4o") ? 128_000 : 400_000,
    maxTokens: 8192,
  };
}

function openAIResponsesThinkingLevelMap(modelId: string) {
  if (modelId !== "gpt-5.5") return undefined;
  return {
    minimal: "low",
  };
}
