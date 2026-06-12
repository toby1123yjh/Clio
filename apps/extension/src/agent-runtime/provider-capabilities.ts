export type ProviderFamilyId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "qwen"
  | "openai-compatible";

export type SearchProtocolId = "openai-responses-web-search" | "openai-chat-completions-search";

export interface ChatCapability {
  streaming: boolean;
  toolCalling: "native" | "function" | "none";
  structuredOutput: boolean;
}

export interface SearchCapability {
  sourceReturning: true;
  protocol: SearchProtocolId;
  sourceMetadata: true;
  hostedTool: boolean;
}

export interface ModelCapabilityProfile {
  family: ProviderFamilyId;
  modelId: string;
  chat?: ChatCapability;
  search?: SearchCapability;
  imageGeneration?: boolean;
  vision?: boolean;
  contextWindow?: number;
  reasoning?: boolean;
}

export interface ProviderFamilyCapability {
  family: ProviderFamilyId;
  displayName: string;
  searchProtocols: SearchProtocolId[];
  chatStreaming: boolean;
  imageGeneration: boolean;
  vision: boolean;
}

export const providerFamilyCapabilities: Record<ProviderFamilyId, ProviderFamilyCapability> = {
  openai: {
    family: "openai",
    displayName: "OpenAI",
    searchProtocols: ["openai-responses-web-search", "openai-chat-completions-search"],
    chatStreaming: true,
    imageGeneration: true,
    vision: true,
  },
  anthropic: {
    family: "anthropic",
    displayName: "Anthropic",
    searchProtocols: [],
    chatStreaming: true,
    imageGeneration: false,
    vision: true,
  },
  gemini: {
    family: "gemini",
    displayName: "Gemini",
    searchProtocols: [],
    chatStreaming: true,
    imageGeneration: false,
    vision: true,
  },
  deepseek: {
    family: "deepseek",
    displayName: "DeepSeek",
    searchProtocols: [],
    chatStreaming: true,
    imageGeneration: false,
    vision: false,
  },
  qwen: {
    family: "qwen",
    displayName: "Qwen",
    searchProtocols: [],
    chatStreaming: true,
    imageGeneration: false,
    vision: true,
  },
  "openai-compatible": {
    family: "openai-compatible",
    displayName: "OpenAI Compatible",
    searchProtocols: ["openai-responses-web-search"],
    chatStreaming: true,
    imageGeneration: true,
    vision: true,
  },
};

const openAIChatCompletionsSearchModelIds = new Set([
  "gpt-5-search-api",
  "gpt-4o-search-preview",
  "gpt-4o-mini-search-preview",
]);

export function modelCapabilityProfileFor(
  family: ProviderFamilyId,
  modelId: string,
): ModelCapabilityProfile {
  const normalizedModelId = modelId.trim();
  const search = searchCapabilityForProviderModel(family, normalizedModelId);
  return {
    family,
    modelId: normalizedModelId,
    chat: {
      streaming: providerFamilyCapabilities[family].chatStreaming,
      toolCalling: family === "openai-compatible" ? "function" : "native",
      structuredOutput: family === "openai" || family === "gemini",
    },
    ...(search === undefined ? {} : { search }),
    imageGeneration: providerFamilyCapabilities[family].imageGeneration,
    vision: providerFamilyCapabilities[family].vision,
    contextWindow: contextWindowHint(normalizedModelId),
    reasoning: isReasoningModelHint(normalizedModelId),
  };
}

export function searchCapabilityForProviderModel(
  family: ProviderFamilyId,
  modelId: string,
): SearchCapability | undefined {
  if (family === "openai") {
    if (openAIChatCompletionsSearchModelIds.has(modelId.trim())) {
      return {
        sourceReturning: true,
        protocol: "openai-chat-completions-search",
        sourceMetadata: true,
        hostedTool: false,
      };
    }
    return {
      sourceReturning: true,
      protocol: "openai-responses-web-search",
      sourceMetadata: true,
      hostedTool: true,
    };
  }

  if (family === "openai-compatible") {
    return {
      sourceReturning: true,
      protocol: "openai-responses-web-search",
      sourceMetadata: true,
      hostedTool: true,
    };
  }

  return undefined;
}

function contextWindowHint(modelId: string) {
  if (modelId.includes("4o")) return 128_000;
  if (modelId.includes("gpt-5")) return 400_000;
  return undefined;
}

function isReasoningModelHint(modelId: string) {
  return modelId.includes("o") || modelId.includes("gpt-5");
}
