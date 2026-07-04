import { EngineRpcError } from "../shared/rpc";
import { hasOpenAICompatibleHostPermission, hasOpenAIHostPermission } from "./openai-permission";
import {
  defaultOpenAIBaseUrl,
  defaultOpenAICompatibleBaseUrl,
  normalizeOpenAIBaseUrl,
  normalizeOpenAICompatibleBaseUrl,
} from "./openai-provider-config";
import {
  type ChromeStorageAreaLike,
  defaultOpenAICompatibleProviderName,
  normalizeApiKey,
  normalizeModel,
  normalizeProviderName,
} from "./provider-settings";

export const embeddingProviderStorageKey = "clio:provider:embedding";
export const defaultEmbeddingProvider: EmbeddingProviderId = "openai";
export const defaultOpenAIEmbeddingModel = "text-embedding-3-small";
export const defaultOpenAICompatibleEmbeddingModel = "text-embedding-3-small";

export type EmbeddingProviderId = "openai" | "openai-compatible";

export interface EmbeddingProviderSlotSettings {
  provider: EmbeddingProviderId;
  model: string;
  baseUrl: string;
  apiKey?: string;
  apiKeyConfigured: boolean;
  hostPermissionGranted: boolean;
  dimension?: number;
  modelId?: string;
  lastTestAt?: string;
  lastError?: string;
  updatedAt?: string;
}

export interface EmbeddingOpenAICompatibleSlotSettings extends EmbeddingProviderSlotSettings {
  provider: "openai-compatible";
  providerName: string;
}

export interface EmbeddingOpenAISlotSettings extends EmbeddingProviderSlotSettings {
  provider: "openai";
}

export interface EmbeddingProviderSettings {
  activeProvider: EmbeddingProviderId;
  openai: EmbeddingOpenAISlotSettings;
  openaiCompatible: EmbeddingOpenAICompatibleSlotSettings;
  updatedAt?: string;
}

export interface SaveEmbeddingOpenAISettingsInput {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  dimension?: number;
  lastTestAt?: string;
  lastError?: string;
}

export interface SaveEmbeddingOpenAICompatibleSettingsInput
  extends SaveEmbeddingOpenAISettingsInput {
  providerName?: string;
}

export interface SaveEmbeddingProviderSettingsInput {
  activeProvider?: EmbeddingProviderId;
  openai?: SaveEmbeddingOpenAISettingsInput;
  openaiCompatible?: SaveEmbeddingOpenAICompatibleSettingsInput;
}

export interface ResolvedEmbeddingTestConfig {
  provider: EmbeddingProviderId;
  providerLabel: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  providerName?: string;
}

export interface ResolvedEmbeddingRuntimeConfig extends ResolvedEmbeddingTestConfig {
  dimension: number;
  modelId: string;
  label: string;
}

export interface EmbeddingProviderTestResult {
  ok: true;
  provider: EmbeddingProviderId;
  model: string;
  baseUrl: string;
  providerName?: string;
  dimension: number;
  modelId: string;
  label: string;
  testedAt: string;
}

interface StoredEmbeddingProviderSettings {
  activeProvider: EmbeddingProviderId;
  openai: StoredOpenAIEmbeddingSettings;
  openaiCompatible: StoredOpenAICompatibleEmbeddingSettings;
  updatedAt?: string;
}

interface StoredOpenAIEmbeddingSettings {
  apiKey?: string;
  model: string;
  baseUrl: string;
  dimension?: number;
  lastTestAt?: string;
  lastError?: string;
  updatedAt?: string;
}

interface StoredOpenAICompatibleEmbeddingSettings extends StoredOpenAIEmbeddingSettings {
  providerName: string;
}

export async function readEmbeddingProviderSettings(
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<StoredEmbeddingProviderSettings> {
  const values = await storage.get(embeddingProviderStorageKey);
  const raw = values[embeddingProviderStorageKey];
  if (!isRecord(raw)) return defaultStoredEmbeddingProviderSettings();

  return {
    activeProvider: isEmbeddingProviderId(raw.activeProvider)
      ? raw.activeProvider
      : defaultEmbeddingProvider,
    openai: normalizeStoredOpenAISettings(raw.openai),
    openaiCompatible: normalizeStoredOpenAICompatibleSettings(raw.openaiCompatible),
    ...(typeof raw.updatedAt === "string" ? { updatedAt: raw.updatedAt } : {}),
  };
}

export async function saveEmbeddingProviderSettings(
  input: SaveEmbeddingProviderSettingsInput,
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<EmbeddingProviderSettings> {
  const existing = await readEmbeddingProviderSettings(storage);
  const stored: StoredEmbeddingProviderSettings = {
    activeProvider: input.activeProvider ?? existing.activeProvider,
    openai: normalizeOpenAISaveInput(input.openai, existing.openai),
    openaiCompatible: normalizeOpenAICompatibleSaveInput(
      input.openaiCompatible,
      existing.openaiCompatible,
    ),
    updatedAt: new Date().toISOString(),
  };
  await storage.set({ [embeddingProviderStorageKey]: stored });
  return getEmbeddingProviderSettings(storage);
}

export async function saveEmbeddingProviderTestResult(
  result: EmbeddingProviderTestResult,
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<EmbeddingProviderSettings> {
  if (result.provider === "openai") {
    return saveEmbeddingProviderSettings(
      {
        activeProvider: "openai",
        openai: {
          model: result.model,
          baseUrl: result.baseUrl,
          dimension: result.dimension,
          lastTestAt: result.testedAt,
        },
      },
      storage,
    );
  }

  return saveEmbeddingProviderSettings(
    {
      activeProvider: "openai-compatible",
      openaiCompatible: {
        model: result.model,
        baseUrl: result.baseUrl,
        providerName: result.providerName,
        dimension: result.dimension,
        lastTestAt: result.testedAt,
      },
    },
    storage,
  );
}

export async function getEmbeddingProviderSettings(
  storage: ChromeStorageAreaLike = chrome.storage.local,
  permissions?: Parameters<typeof hasOpenAIHostPermission>[1],
): Promise<EmbeddingProviderSettings> {
  const stored = await readEmbeddingProviderSettings(storage);
  const [openaiPermission, compatiblePermission] = await Promise.all([
    hasOpenAIHostPermission(stored.openai.baseUrl, permissions),
    hasOpenAICompatibleHostPermission(stored.openaiCompatible.baseUrl, permissions),
  ]);

  return {
    activeProvider: stored.activeProvider,
    openai: {
      provider: "openai",
      model: stored.openai.model,
      baseUrl: stored.openai.baseUrl,
      ...(stored.openai.apiKey === undefined ? {} : { apiKey: stored.openai.apiKey }),
      apiKeyConfigured: stored.openai.apiKey !== undefined,
      hostPermissionGranted: openaiPermission,
      ...dimensionProjection("openai", stored.openai),
      ...(stored.openai.lastTestAt === undefined ? {} : { lastTestAt: stored.openai.lastTestAt }),
      ...(stored.openai.lastError === undefined ? {} : { lastError: stored.openai.lastError }),
      ...(stored.openai.updatedAt === undefined ? {} : { updatedAt: stored.openai.updatedAt }),
    },
    openaiCompatible: {
      provider: "openai-compatible",
      model: stored.openaiCompatible.model,
      baseUrl: stored.openaiCompatible.baseUrl,
      providerName: stored.openaiCompatible.providerName,
      ...(stored.openaiCompatible.apiKey === undefined
        ? {}
        : { apiKey: stored.openaiCompatible.apiKey }),
      apiKeyConfigured: stored.openaiCompatible.apiKey !== undefined,
      hostPermissionGranted: compatiblePermission,
      ...dimensionProjection("openai-compatible", stored.openaiCompatible),
      ...(stored.openaiCompatible.lastTestAt === undefined
        ? {}
        : { lastTestAt: stored.openaiCompatible.lastTestAt }),
      ...(stored.openaiCompatible.lastError === undefined
        ? {}
        : { lastError: stored.openaiCompatible.lastError }),
      ...(stored.openaiCompatible.updatedAt === undefined
        ? {}
        : { updatedAt: stored.openaiCompatible.updatedAt }),
    },
    ...(stored.updatedAt === undefined ? {} : { updatedAt: stored.updatedAt }),
  };
}

export function resolveEmbeddingTestConfig(
  settings: EmbeddingProviderSettings,
): ResolvedEmbeddingTestConfig {
  const slot = settings.activeProvider === "openai" ? settings.openai : settings.openaiCompatible;
  const apiKey = normalizeApiKey(slot.apiKey);
  if (apiKey === undefined) {
    throw new EngineRpcError(
      "EMBEDDING_PROVIDER_CONFIG_REQUIRED",
      "Enter an embedding provider API key before testing or rebuilding embeddings.",
    );
  }

  if (slot.provider === "openai-compatible") {
    return {
      provider: "openai-compatible",
      providerLabel: `${slot.providerName} Embeddings`,
      apiKey,
      model: slot.model,
      baseUrl: slot.baseUrl,
      providerName: slot.providerName,
    };
  }

  return {
    provider: "openai",
    providerLabel: "OpenAI Embeddings",
    apiKey,
    model: slot.model,
    baseUrl: slot.baseUrl,
  };
}

export function resolveEmbeddingRuntimeConfig(
  settings: EmbeddingProviderSettings,
): ResolvedEmbeddingRuntimeConfig {
  const testConfig = resolveEmbeddingTestConfig(settings);
  const slot = settings.activeProvider === "openai" ? settings.openai : settings.openaiCompatible;
  const dimension = normalizeDimension(slot.dimension);
  if (dimension === undefined) {
    throw new EngineRpcError(
      "EMBEDDING_PROVIDER_TEST_REQUIRED",
      "Test the embedding provider before rebuilding embeddings.",
    );
  }
  const modelId = deriveEmbeddingModelId({ ...testConfig, dimension });
  return {
    ...testConfig,
    dimension,
    modelId,
    label: `${testConfig.providerLabel} ${testConfig.model} (${dimension}d)`,
  };
}

export function deriveEmbeddingModelId(identity: {
  provider: EmbeddingProviderId;
  baseUrl: string;
  model: string;
  providerName?: string;
  dimension: number;
}) {
  const dimension = normalizeDimension(identity.dimension);
  if (dimension === undefined) {
    throw new Error("Embedding dimension must be a positive integer.");
  }
  const baseUrl =
    identity.provider === "openai"
      ? normalizeOpenAIBaseUrl(identity.baseUrl)
      : normalizeOpenAICompatibleBaseUrl(identity.baseUrl);
  if (baseUrl === undefined) {
    throw new Error("Embedding base URL is required.");
  }
  const model = normalizeModel(identity.model);
  if (model === undefined) {
    throw new Error("Embedding model is required.");
  }

  const scope =
    identity.provider === "openai-compatible"
      ? `${baseUrl}|${normalizeProviderName(identity.providerName) ?? defaultOpenAICompatibleProviderName}`
      : baseUrl;
  return `${identity.provider}:${stableHash(scope)}:${slugifyModel(model)}:d${dimension}`;
}

export function isEmbeddingProviderId(value: unknown): value is EmbeddingProviderId {
  return value === "openai" || value === "openai-compatible";
}

function defaultStoredEmbeddingProviderSettings(): StoredEmbeddingProviderSettings {
  return {
    activeProvider: defaultEmbeddingProvider,
    openai: {
      model: defaultOpenAIEmbeddingModel,
      baseUrl: defaultOpenAIBaseUrl,
    },
    openaiCompatible: {
      model: defaultOpenAICompatibleEmbeddingModel,
      baseUrl: defaultOpenAICompatibleBaseUrl,
      providerName: defaultOpenAICompatibleProviderName,
    },
  };
}

function normalizeStoredOpenAISettings(value: unknown): StoredOpenAIEmbeddingSettings {
  return normalizeOpenAISaveInput(isRecord(value) ? value : undefined, {
    model: defaultOpenAIEmbeddingModel,
    baseUrl: defaultOpenAIBaseUrl,
  });
}

function normalizeStoredOpenAICompatibleSettings(
  value: unknown,
): StoredOpenAICompatibleEmbeddingSettings {
  return normalizeOpenAICompatibleSaveInput(isRecord(value) ? value : undefined, {
    model: defaultOpenAICompatibleEmbeddingModel,
    baseUrl: defaultOpenAICompatibleBaseUrl,
    providerName: defaultOpenAICompatibleProviderName,
  });
}

function normalizeOpenAISaveInput(
  input: SaveEmbeddingOpenAISettingsInput | Record<string, unknown> | undefined,
  existing: StoredOpenAIEmbeddingSettings,
): StoredOpenAIEmbeddingSettings {
  const model = normalizeModel(input?.model) ?? existing.model ?? defaultOpenAIEmbeddingModel;
  const baseUrl =
    normalizeOpenAIBaseUrl(input?.baseUrl) ?? existing.baseUrl ?? defaultOpenAIBaseUrl;
  const identityChanged = model !== existing.model || baseUrl !== existing.baseUrl;
  return {
    ...((normalizeApiKey(input?.apiKey) ?? existing.apiKey)
      ? { apiKey: normalizeApiKey(input?.apiKey) ?? existing.apiKey }
      : {}),
    model,
    baseUrl,
    ...testMetadata(input, existing, identityChanged),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeOpenAICompatibleSaveInput(
  input: SaveEmbeddingOpenAICompatibleSettingsInput | Record<string, unknown> | undefined,
  existing: StoredOpenAICompatibleEmbeddingSettings,
): StoredOpenAICompatibleEmbeddingSettings {
  const model =
    normalizeModel(input?.model) ?? existing.model ?? defaultOpenAICompatibleEmbeddingModel;
  const baseUrl =
    normalizeOpenAICompatibleBaseUrl(input?.baseUrl) ??
    existing.baseUrl ??
    defaultOpenAICompatibleBaseUrl;
  const providerName =
    normalizeProviderName(input?.providerName) ??
    existing.providerName ??
    defaultOpenAICompatibleProviderName;
  const identityChanged =
    model !== existing.model ||
    baseUrl !== existing.baseUrl ||
    providerName !== existing.providerName;
  return {
    ...((normalizeApiKey(input?.apiKey) ?? existing.apiKey)
      ? { apiKey: normalizeApiKey(input?.apiKey) ?? existing.apiKey }
      : {}),
    model,
    baseUrl,
    providerName,
    ...testMetadata(input, existing, identityChanged),
    updatedAt: new Date().toISOString(),
  };
}

function testMetadata(
  input: SaveEmbeddingOpenAISettingsInput | Record<string, unknown> | undefined,
  existing: StoredOpenAIEmbeddingSettings,
  identityChanged: boolean,
) {
  const dimension = normalizeDimension(input?.dimension);
  const preservedDimension = identityChanged ? undefined : existing.dimension;
  const lastTestAt =
    typeof input?.lastTestAt === "string"
      ? input.lastTestAt
      : identityChanged
        ? undefined
        : existing.lastTestAt;
  const lastError =
    typeof input?.lastError === "string"
      ? input.lastError
      : identityChanged
        ? undefined
        : existing.lastError;

  return {
    ...((dimension ?? preservedDimension) ? { dimension: dimension ?? preservedDimension } : {}),
    ...(lastTestAt === undefined ? {} : { lastTestAt }),
    ...(lastError === undefined ? {} : { lastError }),
  };
}

function dimensionProjection(
  provider: EmbeddingProviderId,
  slot: StoredOpenAIEmbeddingSettings | StoredOpenAICompatibleEmbeddingSettings,
) {
  const dimension = normalizeDimension(slot.dimension);
  if (dimension === undefined) return {};
  return {
    dimension,
    modelId: deriveEmbeddingModelId({
      provider,
      model: slot.model,
      baseUrl: slot.baseUrl,
      ...(provider === "openai-compatible" && "providerName" in slot
        ? { providerName: slot.providerName }
        : {}),
      dimension,
    }),
  };
}

function normalizeDimension(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

function slugifyModel(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "model";
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
