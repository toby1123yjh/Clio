import { EngineRpcError } from "../shared/rpc";
import { defaultOpenAIBaseUrl, normalizeOpenAIBaseUrl } from "./openai-provider-config";
import {
  type ChromeStorageAreaLike,
  type StoredProviderConfig,
  defaultOpenAIModel,
  normalizeApiKey,
  normalizeModel,
} from "./provider-settings";

export const searchProviderStorageKey = "clio:provider:search";
export const defaultSearchProvider: SearchProviderId = "auto";

export type SearchProviderId = "auto" | "openai";

export interface SearchOpenAIOverrideSettings {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface SearchProviderSettings {
  provider: SearchProviderId;
  openai: SearchOpenAIOverrideSettings;
  updatedAt?: string;
}

export interface SaveSearchProviderInput {
  provider: SearchProviderId;
  openai?: SearchOpenAIOverrideSettings;
}

export interface ResolvedOpenAIWebSearchConfig {
  provider: "openai";
  apiKey: string;
  model: string;
  baseUrl: string;
  configuredBy: "search-override" | "main-openai";
}

export async function readSearchProviderSettings(
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<SearchProviderSettings> {
  const values = await storage.get(searchProviderStorageKey);
  const raw = values[searchProviderStorageKey];
  if (!isRecord(raw)) return defaultSearchProviderSettings();

  const provider = isSearchProviderId(raw.provider) ? raw.provider : defaultSearchProvider;
  const openai = isRecord(raw.openai) ? normalizeOpenAIOverride(raw.openai) : {};
  return {
    provider,
    openai,
    ...(typeof raw.updatedAt === "string" ? { updatedAt: raw.updatedAt } : {}),
  };
}

export async function saveSearchProviderSettings(
  input: SaveSearchProviderInput,
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<SearchProviderSettings> {
  const settings: SearchProviderSettings = {
    provider: input.provider,
    openai: normalizeOpenAIOverride(input.openai ?? {}),
    updatedAt: new Date().toISOString(),
  };
  await storage.set({ [searchProviderStorageKey]: settings });
  return settings;
}

export function resolveOpenAIWebSearchConfig(
  searchSettings: SearchProviderSettings,
  activeProviderConfig: StoredProviderConfig | undefined,
): ResolvedOpenAIWebSearchConfig {
  if (searchSettings.provider !== "auto" && searchSettings.provider !== "openai") {
    throw setupRequiredError();
  }

  const mainOpenAI = activeProviderConfig?.provider === "openai" ? activeProviderConfig : undefined;
  const override = searchSettings.openai;
  const apiKey = normalizeApiKey(override.apiKey) ?? mainOpenAI?.apiKey;
  const model = normalizeModel(override.model) ?? mainOpenAI?.model ?? defaultOpenAIModel;
  const baseUrl =
    normalizeOpenAIBaseUrl(override.baseUrl) ?? mainOpenAI?.baseUrl ?? defaultOpenAIBaseUrl;
  const hasAnyOverride =
    normalizeApiKey(override.apiKey) !== undefined ||
    normalizeModel(override.model) !== undefined ||
    normalizeOpenAIBaseUrl(override.baseUrl) !== undefined;

  if (apiKey === undefined) {
    throw setupRequiredError();
  }

  return {
    provider: "openai",
    apiKey,
    model,
    baseUrl,
    configuredBy: hasAnyOverride ? "search-override" : "main-openai",
  };
}

export function defaultSearchProviderSettings(): SearchProviderSettings {
  return {
    provider: defaultSearchProvider,
    openai: {},
  };
}

function normalizeOpenAIOverride(
  input: SearchOpenAIOverrideSettings,
): SearchOpenAIOverrideSettings {
  return {
    ...(normalizeApiKey(input.apiKey) === undefined
      ? {}
      : { apiKey: normalizeApiKey(input.apiKey) }),
    ...(normalizeModel(input.model) === undefined ? {} : { model: normalizeModel(input.model) }),
    ...(normalizeOpenAIBaseUrl(input.baseUrl) === undefined
      ? {}
      : { baseUrl: normalizeOpenAIBaseUrl(input.baseUrl) }),
  };
}

function setupRequiredError() {
  return new EngineRpcError(
    "SEARCH_PROVIDER_CONFIG_REQUIRED",
    "Configure OpenAI Search or an OpenAI model in Clio Settings before searching.",
  );
}

function isSearchProviderId(value: unknown): value is SearchProviderId {
  return value === "auto" || value === "openai";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
