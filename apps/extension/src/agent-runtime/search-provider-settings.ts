import { EngineRpcError } from "../shared/rpc";
import {
  defaultOpenAIBaseUrl,
  defaultOpenAICompatibleBaseUrl,
  normalizeOpenAIBaseUrl,
  normalizeOpenAICompatibleBaseUrl,
} from "./openai-provider-config";
import type { ProviderFamilyId, SearchProtocolId } from "./provider-capabilities";
import { searchCapabilityForProviderModel } from "./provider-capabilities";
import {
  type ChromeStorageAreaLike,
  type StoredProviderConfig,
  defaultOpenAICompatibleModel,
  defaultOpenAIModel,
  normalizeApiKey,
  normalizeModel,
} from "./provider-settings";

export const searchProviderStorageKey = "clio:provider:search";
export const defaultSearchProvider: SearchProviderId = "auto";

export type SearchProviderId = "auto" | "openai" | "openai-compatible";

export interface SearchOpenAIOverrideSettings {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface SearchOpenAICompatibleOverrideSettings {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface SearchProviderSettings {
  provider: SearchProviderId;
  openai: SearchOpenAIOverrideSettings;
  openaiCompatible: SearchOpenAICompatibleOverrideSettings;
  updatedAt?: string;
}

export interface SaveSearchProviderInput {
  provider: SearchProviderId;
  openai?: SearchOpenAIOverrideSettings;
  openaiCompatible?: SearchOpenAICompatibleOverrideSettings;
}

export type SearchConfigSource =
  | "search-openai-override"
  | "search-openai-compatible-override"
  | "main-openai"
  | "main-openai-compatible";

export interface ResolvedWebSearchConfig {
  provider: "openai" | "openai-compatible";
  providerFamily: ProviderFamilyId;
  providerLabel: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  protocol: SearchProtocolId;
  configuredBy: SearchConfigSource;
}

export async function readSearchProviderSettings(
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<SearchProviderSettings> {
  const values = await storage.get(searchProviderStorageKey);
  const raw = values[searchProviderStorageKey];
  if (!isRecord(raw)) return defaultSearchProviderSettings();

  const provider = isSearchProviderId(raw.provider) ? raw.provider : defaultSearchProvider;
  const openai = isRecord(raw.openai) ? normalizeOpenAIOverride(raw.openai) : {};
  const openaiCompatible = isRecord(raw.openaiCompatible)
    ? normalizeOpenAICompatibleOverride(raw.openaiCompatible)
    : {};
  return {
    provider,
    openai,
    openaiCompatible,
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
    openaiCompatible: normalizeOpenAICompatibleOverride(input.openaiCompatible ?? {}),
    updatedAt: new Date().toISOString(),
  };
  await storage.set({ [searchProviderStorageKey]: settings });
  return settings;
}

export function resolveWebSearchConfig(
  searchSettings: SearchProviderSettings,
  activeProviderConfig: StoredProviderConfig | undefined,
): ResolvedWebSearchConfig {
  if (searchSettings.provider === "openai") {
    return resolveOpenAISearchConfig(searchSettings.openai, activeProviderConfig);
  }

  if (searchSettings.provider === "openai-compatible") {
    return resolveOpenAICompatibleSearchConfig(
      searchSettings.openaiCompatible,
      activeProviderConfig,
    );
  }

  if (hasAnyOpenAIOverride(searchSettings.openai)) {
    return resolveOpenAISearchConfig(searchSettings.openai, activeProviderConfig);
  }

  if (hasAnyOpenAICompatibleOverride(searchSettings.openaiCompatible)) {
    return resolveOpenAICompatibleSearchConfig(
      searchSettings.openaiCompatible,
      activeProviderConfig,
    );
  }

  if (activeProviderConfig?.provider === "openai") {
    return resolveOpenAISearchConfig({}, activeProviderConfig);
  }

  if (activeProviderConfig?.provider === "openai-compatible") {
    return resolveOpenAICompatibleSearchConfig({}, activeProviderConfig);
  }

  throw setupRequiredError();
}

export function defaultSearchProviderSettings(): SearchProviderSettings {
  return {
    provider: defaultSearchProvider,
    openai: {},
    openaiCompatible: {},
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

function normalizeOpenAICompatibleOverride(
  input: SearchOpenAICompatibleOverrideSettings,
): SearchOpenAICompatibleOverrideSettings {
  return {
    ...(normalizeApiKey(input.apiKey) === undefined
      ? {}
      : { apiKey: normalizeApiKey(input.apiKey) }),
    ...(normalizeModel(input.model) === undefined ? {} : { model: normalizeModel(input.model) }),
    ...(normalizeOpenAICompatibleBaseUrl(input.baseUrl) === undefined
      ? {}
      : { baseUrl: normalizeOpenAICompatibleBaseUrl(input.baseUrl) }),
  };
}

function resolveOpenAISearchConfig(
  override: SearchOpenAIOverrideSettings,
  activeProviderConfig: StoredProviderConfig | undefined,
): ResolvedWebSearchConfig {
  const mainOpenAI = activeProviderConfig?.provider === "openai" ? activeProviderConfig : undefined;
  const apiKey = normalizeApiKey(override.apiKey) ?? mainOpenAI?.apiKey;
  const model = normalizeModel(override.model) ?? mainOpenAI?.model ?? defaultOpenAIModel;
  const baseUrl =
    normalizeOpenAIBaseUrl(override.baseUrl) ?? mainOpenAI?.baseUrl ?? defaultOpenAIBaseUrl;
  const capability = searchCapabilityForProviderModel("openai", model);

  if (apiKey === undefined || capability === undefined) {
    throw setupRequiredError();
  }

  return {
    provider: "openai",
    providerFamily: "openai",
    providerLabel: "OpenAI Search",
    apiKey,
    model,
    baseUrl,
    protocol: capability.protocol,
    configuredBy: hasAnyOpenAIOverride(override) ? "search-openai-override" : "main-openai",
  };
}

function resolveOpenAICompatibleSearchConfig(
  override: SearchOpenAICompatibleOverrideSettings,
  activeProviderConfig: StoredProviderConfig | undefined,
): ResolvedWebSearchConfig {
  const mainCompatible =
    activeProviderConfig?.provider === "openai-compatible" ? activeProviderConfig : undefined;
  const apiKey = normalizeApiKey(override.apiKey) ?? mainCompatible?.apiKey;
  const model =
    normalizeModel(override.model) ?? mainCompatible?.model ?? defaultOpenAICompatibleModel;
  const baseUrl =
    normalizeOpenAICompatibleBaseUrl(override.baseUrl) ??
    mainCompatible?.baseUrl ??
    defaultOpenAICompatibleBaseUrl;
  const capability = searchCapabilityForProviderModel("openai-compatible", model);

  if (apiKey === undefined || capability === undefined) {
    throw setupRequiredError();
  }

  return {
    provider: "openai-compatible",
    providerFamily: "openai-compatible",
    providerLabel: "OpenAI Compatible Search",
    apiKey,
    model,
    baseUrl,
    protocol: capability.protocol,
    configuredBy: hasAnyOpenAICompatibleOverride(override)
      ? "search-openai-compatible-override"
      : "main-openai-compatible",
  };
}

function hasAnyOpenAIOverride(input: SearchOpenAIOverrideSettings) {
  return (
    normalizeApiKey(input.apiKey) !== undefined ||
    normalizeModel(input.model) !== undefined ||
    normalizeOpenAIBaseUrl(input.baseUrl) !== undefined
  );
}

function hasAnyOpenAICompatibleOverride(input: SearchOpenAICompatibleOverrideSettings) {
  return (
    normalizeApiKey(input.apiKey) !== undefined ||
    normalizeModel(input.model) !== undefined ||
    normalizeOpenAICompatibleBaseUrl(input.baseUrl) !== undefined
  );
}

function setupRequiredError() {
  return new EngineRpcError(
    "SEARCH_PROVIDER_CONFIG_REQUIRED",
    "Configure Search or a search-capable model in Clio Settings before searching.",
  );
}

function isSearchProviderId(value: unknown): value is SearchProviderId {
  return value === "auto" || value === "openai" || value === "openai-compatible";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
