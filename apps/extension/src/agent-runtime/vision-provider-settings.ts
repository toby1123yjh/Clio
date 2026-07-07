import { EngineRpcError } from "../shared/rpc";
import {
  defaultOpenAIBaseUrl,
  defaultOpenAICompatibleBaseUrl,
  normalizeOpenAIBaseUrl,
  normalizeOpenAICompatibleBaseUrl,
} from "./openai-provider-config";
import {
  type ChromeStorageAreaLike,
  type ProviderId,
  type StoredProviderConfig,
  defaultGeminiModel,
  defaultOpenAICompatibleModel,
  defaultOpenAICompatibleProviderName,
  defaultOpenAIModel,
  normalizeApiKey,
  normalizeModel,
  normalizeProviderName,
} from "./provider-settings";

export const visionProviderStorageKey = "clio:provider:vision-analysis";
export const defaultVisionProvider: VisionProviderId = "auto";

export type VisionProviderId = "auto" | ProviderId;

export interface VisionGeminiOverrideSettings {
  apiKey?: string;
  model?: string;
}

export interface VisionOpenAIOverrideSettings {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface VisionOpenAICompatibleOverrideSettings extends VisionOpenAIOverrideSettings {
  providerName?: string;
}

export interface VisionProviderSettings {
  provider: VisionProviderId;
  gemini: VisionGeminiOverrideSettings;
  openai: VisionOpenAIOverrideSettings;
  openaiCompatible: VisionOpenAICompatibleOverrideSettings;
  updatedAt?: string;
}

export interface SaveVisionProviderSettingsInput {
  provider?: VisionProviderId;
  gemini?: VisionGeminiOverrideSettings;
  openai?: VisionOpenAIOverrideSettings;
  openaiCompatible?: VisionOpenAICompatibleOverrideSettings;
}

export type VisionConfigSource =
  | "vision-gemini-override"
  | "vision-openai-override"
  | "vision-openai-compatible-override"
  | "main-gemini"
  | "main-openai"
  | "main-openai-compatible";

export interface ResolvedVisionProviderConfig {
  config: StoredProviderConfig;
  configuredBy: VisionConfigSource;
}

export async function readVisionProviderSettings(
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<VisionProviderSettings> {
  const values = await storage.get(visionProviderStorageKey);
  const raw = values[visionProviderStorageKey];
  if (!isRecord(raw)) return defaultVisionProviderSettings();

  return {
    provider: isVisionProviderId(raw.provider) ? raw.provider : defaultVisionProvider,
    gemini: normalizeGeminiOverride(raw.gemini),
    openai: normalizeOpenAIOverride(raw.openai),
    openaiCompatible: normalizeOpenAICompatibleOverride(raw.openaiCompatible),
    ...(typeof raw.updatedAt === "string" ? { updatedAt: raw.updatedAt } : {}),
  };
}

export async function saveVisionProviderSettings(
  input: SaveVisionProviderSettingsInput,
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<VisionProviderSettings> {
  const settings: VisionProviderSettings = {
    provider: input.provider ?? defaultVisionProvider,
    gemini: normalizeGeminiOverride(input.gemini),
    openai: normalizeOpenAIOverride(input.openai),
    openaiCompatible: normalizeOpenAICompatibleOverride(input.openaiCompatible),
    updatedAt: new Date().toISOString(),
  };
  await storage.set({ [visionProviderStorageKey]: settings });
  return settings;
}

export function defaultVisionProviderSettings(): VisionProviderSettings {
  return {
    provider: defaultVisionProvider,
    gemini: {},
    openai: {},
    openaiCompatible: {},
  };
}

export function resolveVisionProviderConfig(
  settings: VisionProviderSettings,
  activeProviderConfig: StoredProviderConfig | undefined,
): ResolvedVisionProviderConfig {
  if (settings.provider === "gemini") {
    return resolveGeminiVisionConfig(settings.gemini, activeProviderConfig);
  }

  if (settings.provider === "openai") {
    return resolveOpenAIVisionConfig(settings.openai, activeProviderConfig);
  }

  if (settings.provider === "openai-compatible") {
    return resolveOpenAICompatibleVisionConfig(settings.openaiCompatible, activeProviderConfig);
  }

  for (const provider of autoOverrideProviderOrder(settings, activeProviderConfig?.provider)) {
    const resolved = tryResolveVisionOverride(provider, settings, activeProviderConfig);
    if (resolved !== undefined) return resolved;
  }

  if (activeProviderConfig !== undefined) {
    return {
      config: activeProviderConfig,
      configuredBy: mainConfigSource(activeProviderConfig.provider),
    };
  }

  throw setupRequiredError();
}

export function isVisionProviderId(value: unknown): value is VisionProviderId {
  return (
    value === "auto" || value === "gemini" || value === "openai" || value === "openai-compatible"
  );
}

function normalizeGeminiOverride(value: unknown): VisionGeminiOverrideSettings {
  const input = isRecord(value) ? value : {};
  return {
    ...(normalizeApiKey(input.apiKey) === undefined
      ? {}
      : { apiKey: normalizeApiKey(input.apiKey) }),
    ...(normalizeModel(input.model) === undefined ? {} : { model: normalizeModel(input.model) }),
  };
}

function normalizeOpenAIOverride(value: unknown): VisionOpenAIOverrideSettings {
  const input = isRecord(value) ? value : {};
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

function normalizeOpenAICompatibleOverride(value: unknown): VisionOpenAICompatibleOverrideSettings {
  const input = isRecord(value) ? value : {};
  return {
    ...(normalizeApiKey(input.apiKey) === undefined
      ? {}
      : { apiKey: normalizeApiKey(input.apiKey) }),
    ...(normalizeModel(input.model) === undefined ? {} : { model: normalizeModel(input.model) }),
    ...(normalizeOpenAICompatibleBaseUrl(input.baseUrl) === undefined
      ? {}
      : { baseUrl: normalizeOpenAICompatibleBaseUrl(input.baseUrl) }),
    ...(normalizeProviderName(input.providerName) === undefined
      ? {}
      : { providerName: normalizeProviderName(input.providerName) }),
  };
}

function resolveGeminiVisionConfig(
  override: VisionGeminiOverrideSettings,
  activeProviderConfig: StoredProviderConfig | undefined,
): ResolvedVisionProviderConfig {
  const mainGemini = activeProviderConfig?.provider === "gemini" ? activeProviderConfig : undefined;
  const apiKey = normalizeApiKey(override.apiKey) ?? mainGemini?.apiKey;
  const model = normalizeModel(override.model) ?? mainGemini?.model ?? defaultGeminiModel;
  if (apiKey === undefined) throw setupRequiredError();

  return {
    config: {
      provider: "gemini",
      apiKey,
      model,
      updatedAt: mainGemini?.updatedAt ?? new Date(0).toISOString(),
    },
    configuredBy: hasAnyGeminiOverride(override) ? "vision-gemini-override" : "main-gemini",
  };
}

function resolveOpenAIVisionConfig(
  override: VisionOpenAIOverrideSettings,
  activeProviderConfig: StoredProviderConfig | undefined,
): ResolvedVisionProviderConfig {
  const mainOpenAI = activeProviderConfig?.provider === "openai" ? activeProviderConfig : undefined;
  const apiKey = normalizeApiKey(override.apiKey) ?? mainOpenAI?.apiKey;
  const model = normalizeModel(override.model) ?? mainOpenAI?.model ?? defaultOpenAIModel;
  const baseUrl =
    normalizeOpenAIBaseUrl(override.baseUrl) ?? mainOpenAI?.baseUrl ?? defaultOpenAIBaseUrl;
  if (apiKey === undefined) throw setupRequiredError();

  return {
    config: {
      provider: "openai",
      apiKey,
      model,
      baseUrl,
      updatedAt: mainOpenAI?.updatedAt ?? new Date(0).toISOString(),
    },
    configuredBy: hasAnyOpenAIOverride(override) ? "vision-openai-override" : "main-openai",
  };
}

function resolveOpenAICompatibleVisionConfig(
  override: VisionOpenAICompatibleOverrideSettings,
  activeProviderConfig: StoredProviderConfig | undefined,
): ResolvedVisionProviderConfig {
  const mainCompatible =
    activeProviderConfig?.provider === "openai-compatible" ? activeProviderConfig : undefined;
  const apiKey = normalizeApiKey(override.apiKey) ?? mainCompatible?.apiKey;
  const model =
    normalizeModel(override.model) ?? mainCompatible?.model ?? defaultOpenAICompatibleModel;
  const baseUrl =
    normalizeOpenAICompatibleBaseUrl(override.baseUrl) ??
    mainCompatible?.baseUrl ??
    defaultOpenAICompatibleBaseUrl;
  const providerName =
    normalizeProviderName(override.providerName) ??
    mainCompatible?.providerName ??
    defaultOpenAICompatibleProviderName;
  if (apiKey === undefined) throw setupRequiredError();

  return {
    config: {
      provider: "openai-compatible",
      apiKey,
      model,
      baseUrl,
      providerName,
      updatedAt: mainCompatible?.updatedAt ?? new Date(0).toISOString(),
    },
    configuredBy: hasAnyOpenAICompatibleOverride(override)
      ? "vision-openai-compatible-override"
      : "main-openai-compatible",
  };
}

function tryResolveVisionOverride(
  provider: ProviderId,
  settings: VisionProviderSettings,
  activeProviderConfig: StoredProviderConfig | undefined,
) {
  try {
    if (provider === "gemini") {
      return resolveGeminiVisionConfig(settings.gemini, activeProviderConfig);
    }
    if (provider === "openai") {
      return resolveOpenAIVisionConfig(settings.openai, activeProviderConfig);
    }
    return resolveOpenAICompatibleVisionConfig(settings.openaiCompatible, activeProviderConfig);
  } catch (error) {
    if (error instanceof EngineRpcError && error.code === "VISION_PROVIDER_CONFIG_REQUIRED") {
      return undefined;
    }
    throw error;
  }
}

function autoOverrideProviderOrder(
  settings: VisionProviderSettings,
  activeProvider?: ProviderId,
): ProviderId[] {
  const providers: ProviderId[] = [];
  const add = (provider: ProviderId, enabled: boolean) => {
    if (enabled && !providers.includes(provider)) providers.push(provider);
  };

  if (activeProvider !== undefined) {
    add(activeProvider, hasAnyOverrideForProvider(settings, activeProvider));
  }
  add("gemini", hasAnyGeminiOverride(settings.gemini));
  add("openai", hasAnyOpenAIOverride(settings.openai));
  add("openai-compatible", hasAnyOpenAICompatibleOverride(settings.openaiCompatible));
  return providers;
}

function hasAnyOverrideForProvider(settings: VisionProviderSettings, provider: ProviderId) {
  if (provider === "gemini") return hasAnyGeminiOverride(settings.gemini);
  if (provider === "openai") return hasAnyOpenAIOverride(settings.openai);
  return hasAnyOpenAICompatibleOverride(settings.openaiCompatible);
}

function hasAnyGeminiOverride(input: VisionGeminiOverrideSettings) {
  return normalizeApiKey(input.apiKey) !== undefined || normalizeModel(input.model) !== undefined;
}

function hasAnyOpenAIOverride(input: VisionOpenAIOverrideSettings) {
  return (
    normalizeApiKey(input.apiKey) !== undefined ||
    normalizeModel(input.model) !== undefined ||
    normalizeOpenAIBaseUrl(input.baseUrl) !== undefined
  );
}

function hasAnyOpenAICompatibleOverride(input: VisionOpenAICompatibleOverrideSettings) {
  return (
    normalizeApiKey(input.apiKey) !== undefined ||
    normalizeModel(input.model) !== undefined ||
    normalizeOpenAICompatibleBaseUrl(input.baseUrl) !== undefined ||
    normalizeProviderName(input.providerName) !== undefined
  );
}

function mainConfigSource(provider: ProviderId): VisionConfigSource {
  if (provider === "gemini") return "main-gemini";
  if (provider === "openai") return "main-openai";
  return "main-openai-compatible";
}

function setupRequiredError() {
  return new EngineRpcError(
    "VISION_PROVIDER_CONFIG_REQUIRED",
    "Configure a Vision analysis model or a vision-capable main model before analyzing images.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
