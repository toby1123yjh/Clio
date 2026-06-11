import type { Model } from "@earendil-works/pi-ai";

export function googleModel(modelId: string): Model<"google-generative-ai"> {
  return {
    id: modelId,
    name: modelId,
    api: "google-generative-ai",
    provider: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    reasoning: modelId.includes("2.5") || modelId.includes("3"),
    input: ["text", "image"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 1_048_576,
    maxTokens: 8192,
  };
}
