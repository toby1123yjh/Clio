import { EngineRpcError } from "../shared/rpc";
import { normalizeProviderBaseUrl } from "./openai-provider-config";
import {
  type ChromeStorageAreaLike,
  type StoredProviderConfig,
  normalizeApiKey,
  normalizeModel,
} from "./provider-settings";

export const imageGenerationProviderStorageKey = "clio:provider:image-generation";
export const defaultImageGenerationModel = "gpt-image-2";
export const defaultImageGenerationSize: ImageGenerationSize = "1024x1024";
export const imageGenerationSizes = ["1024x1024", "1024x1536", "1536x1024", "auto"] as const;

export type ImageGenerationSize = (typeof imageGenerationSizes)[number];

export interface ImageGenerationSettings {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  size: ImageGenerationSize;
  updatedAt?: string;
}

export interface SaveImageGenerationSettingsInput {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  size?: ImageGenerationSize;
}

export interface ResolvedImageGenerationConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  size: ImageGenerationSize;
  responseFormat: "b64_json";
  configuredBy: {
    apiKey: "image-override" | "main-provider";
    baseUrl: "image-override" | "main-provider";
    model: "image-override" | "default";
    size: "image-override" | "default";
  };
}

export async function readImageGenerationSettings(
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<ImageGenerationSettings> {
  const values = await storage.get(imageGenerationProviderStorageKey);
  const raw = values[imageGenerationProviderStorageKey];
  if (!isRecord(raw)) return defaultImageGenerationSettings();

  return {
    ...normalizeImageGenerationSettings(raw),
    ...(typeof raw.updatedAt === "string" ? { updatedAt: raw.updatedAt } : {}),
  };
}

export async function saveImageGenerationSettings(
  input: SaveImageGenerationSettingsInput,
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<ImageGenerationSettings> {
  const settings: ImageGenerationSettings = {
    ...normalizeImageGenerationSettings(input),
    updatedAt: new Date().toISOString(),
  };
  await storage.set({ [imageGenerationProviderStorageKey]: settings });
  return settings;
}

export function resolveImageGenerationConfig(
  settings: ImageGenerationSettings,
  activeProviderConfig: StoredProviderConfig | undefined,
): ResolvedImageGenerationConfig {
  const fallback = openAICompatibleFallback(activeProviderConfig);
  const explicitApiKey = normalizeApiKey(settings.apiKey);
  const explicitBaseUrl = normalizeImageBaseUrl(settings.baseUrl);
  const explicitModel = normalizeModel(settings.model);
  const explicitSize = isImageGenerationSize(settings.size)
    ? settings.size
    : defaultImageGenerationSize;

  const apiKey = explicitApiKey ?? fallback?.apiKey;
  const baseUrl = explicitBaseUrl ?? fallback?.baseUrl;

  if (apiKey === undefined || baseUrl === undefined) {
    throw new EngineRpcError(
      "IMAGE_PROVIDER_CONFIG_REQUIRED",
      "Configure Image Gen or an OpenAI-compatible main model before generating images.",
    );
  }

  return {
    apiKey,
    baseUrl,
    model: explicitModel ?? defaultImageGenerationModel,
    size: explicitSize,
    responseFormat: "b64_json",
    configuredBy: {
      apiKey: explicitApiKey === undefined ? "main-provider" : "image-override",
      baseUrl: explicitBaseUrl === undefined ? "main-provider" : "image-override",
      model: explicitModel === undefined ? "default" : "image-override",
      size: settings.size === undefined ? "default" : "image-override",
    },
  };
}

export function defaultImageGenerationSettings(): ImageGenerationSettings {
  return {
    size: defaultImageGenerationSize,
  };
}

export function normalizeImageBaseUrl(value: unknown): string | undefined {
  return normalizeProviderBaseUrl(value, "Image Base URL");
}

export function isImageGenerationSize(value: unknown): value is ImageGenerationSize {
  return imageGenerationSizes.includes(value as ImageGenerationSize);
}

function normalizeImageGenerationSettings(
  input: SaveImageGenerationSettingsInput | Record<string, unknown>,
): ImageGenerationSettings {
  return {
    ...(normalizeImageBaseUrl(input.baseUrl) === undefined
      ? {}
      : { baseUrl: normalizeImageBaseUrl(input.baseUrl) }),
    ...(normalizeApiKey(input.apiKey) === undefined
      ? {}
      : { apiKey: normalizeApiKey(input.apiKey) }),
    ...(normalizeModel(input.model) === undefined ? {} : { model: normalizeModel(input.model) }),
    size: isImageGenerationSize(input.size) ? input.size : defaultImageGenerationSize,
  };
}

function openAICompatibleFallback(config: StoredProviderConfig | undefined) {
  if (config?.provider === "openai" || config?.provider === "openai-compatible") {
    return {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
    };
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
