import type { Model } from "@earendil-works/pi-ai";
import { streamSimpleOpenAICompletions } from "@earendil-works/pi-ai/openai-completions";
import { streamSimpleOpenAIResponses } from "@earendil-works/pi-ai/openai-responses";
import { googleModel } from "./google-model";
import { openAICompatibleCompletionsModel, openAIResponsesModel } from "./openai-model";
import { classifyProviderError } from "./provider-errors";
import {
  type ProviderId,
  type StoredProviderConfig,
  defaultGeminiModel,
  defaultOpenAICompatibleModel,
  defaultOpenAIModel,
} from "./provider-settings";

export type ClioProviderModel =
  | Model<"google-generative-ai">
  | Model<"openai-responses">
  | Model<"openai-completions">;

export function providerLabel(provider: ProviderId) {
  if (provider === "openai") return "OpenAI";
  if (provider === "openai-compatible") return "OpenAI Compatible";
  return "Gemini";
}

export function defaultModelForProvider(provider: ProviderId) {
  if (provider === "openai") return defaultOpenAIModel;
  if (provider === "openai-compatible") return defaultOpenAICompatibleModel;
  return defaultGeminiModel;
}

export function modelForProvider(config: StoredProviderConfig): ClioProviderModel {
  if (config.provider === "openai") return openAIResponsesModel(config.model, config.baseUrl);
  if (config.provider === "openai-compatible") {
    return openAICompatibleCompletionsModel(config.model, config.baseUrl, config.providerName);
  }
  return googleModel(config.model);
}

export function defaultModelForProviderId(provider: ProviderId): ClioProviderModel {
  if (provider === "openai") return openAIResponsesModel(defaultOpenAIModel);
  if (provider === "openai-compatible") {
    return openAICompatibleCompletionsModel(defaultOpenAICompatibleModel);
  }
  return googleModel(defaultGeminiModel);
}

export async function testOpenAIProviderConnection(options: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  streamFn?: typeof streamSimpleOpenAIResponses;
  signal?: AbortSignal;
}) {
  const streamFn = options.streamFn ?? streamSimpleOpenAIResponses;
  const stream = streamFn(
    openAIResponsesModel(options.model, options.baseUrl),
    {
      systemPrompt: "You are a connection test. Reply with one short sentence.",
      messages: [
        {
          role: "user",
          content: "Reply with: Clio OpenAI connection ok.",
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: options.apiKey,
      signal: options.signal,
      maxRetries: 0,
      maxTokens: 32,
      temperature: 0,
      timeoutMs: 30_000,
    },
  );

  for await (const event of stream) {
    if (event.type === "done") return { ok: true as const };
    if (event.type === "error") {
      throw providerErrorFromInfo(classifyProviderError(event.error.errorMessage, "OpenAI"));
    }
  }
  return { ok: true as const };
}

export async function testOpenAICompatibleProviderConnection(options: {
  apiKey: string;
  model: string;
  baseUrl?: string;
  providerName?: string;
  streamFn?: typeof streamSimpleOpenAICompletions;
  signal?: AbortSignal;
}) {
  const streamFn = options.streamFn ?? streamSimpleOpenAICompletions;
  const stream = streamFn(
    openAICompatibleCompletionsModel(options.model, options.baseUrl, options.providerName),
    {
      systemPrompt: "You are a connection test. Reply with one short sentence.",
      messages: [
        {
          role: "user",
          content: "Reply with: Clio OpenAI-compatible connection ok.",
          timestamp: Date.now(),
        },
      ],
    },
    {
      apiKey: options.apiKey,
      signal: options.signal,
      maxRetries: 0,
      maxTokens: 32,
      temperature: 0,
      timeoutMs: 30_000,
    },
  );

  for await (const event of stream) {
    if (event.type === "done") return { ok: true as const };
    if (event.type === "error") {
      throw providerErrorFromInfo(
        classifyProviderError(event.error.errorMessage, "OpenAI Compatible"),
      );
    }
  }
  return { ok: true as const };
}

function providerErrorFromInfo(info: { code: string; message: string }) {
  const error = new Error(info.message);
  error.name = info.code;
  return error;
}
