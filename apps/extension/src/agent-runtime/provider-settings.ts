import { hasGeminiHostPermission } from "./gemini-permission";
import { hasOpenAICompatibleHostPermission, hasOpenAIHostPermission } from "./openai-permission";
import {
  defaultOpenAIApiKey,
  defaultOpenAIBaseUrl,
  defaultOpenAICompatibleBaseUrl,
  defaultOpenAIConfigBaseUrl,
  defaultOpenAIConfigModel,
  normalizeOpenAIBaseUrl,
  normalizeOpenAICompatibleBaseUrl,
} from "./openai-provider-config";

export const defaultGeminiModel = "gemini-2.5-flash";
export const defaultOpenAIModel = "gpt-5.5";
export const defaultOpenAICompatibleModel = "gpt-5.5";
export const defaultOpenAICompatibleProviderName = "custom";
export const defaultActiveProvider: ProviderId = "openai";
export const geminiProviderStorageKey = "clio:provider:gemini";
export const openAIProviderStorageKey = "clio:provider:openai-official";
export const openAICompatibleProviderStorageKey = "clio:provider:openai-compatible";
export const legacyOpenAICompatibleProviderStorageKey = "clio:provider:openai";
export const activeProviderStorageKey = "clio:provider:active";

export type ProviderId = "gemini" | "openai" | "openai-compatible";

export interface StoredGeminiProviderConfig {
  provider: "gemini";
  apiKey: string;
  model: string;
  updatedAt: string;
}

export interface StoredOpenAIProviderConfig {
  provider: "openai";
  apiKey: string;
  model: string;
  baseUrl: string;
  updatedAt: string;
}

export interface StoredOpenAICompatibleProviderConfig {
  provider: "openai-compatible";
  apiKey: string;
  model: string;
  baseUrl: string;
  providerName: string;
  updatedAt: string;
}

export type StoredProviderConfig =
  | StoredGeminiProviderConfig
  | StoredOpenAIProviderConfig
  | StoredOpenAICompatibleProviderConfig;

export interface GeminiProviderSettings {
  provider: "gemini";
  model: string;
  apiKey?: string;
  apiKeyConfigured: boolean;
  hostPermissionGranted: boolean;
  updatedAt?: string;
}

export interface OpenAIProviderSettings {
  provider: "openai";
  model: string;
  baseUrl: string;
  apiKey?: string;
  apiKeyConfigured: boolean;
  hostPermissionGranted: boolean;
  updatedAt?: string;
}

export interface OpenAICompatibleProviderSettings {
  provider: "openai-compatible";
  model: string;
  baseUrl: string;
  providerName: string;
  apiKey?: string;
  apiKeyConfigured: boolean;
  hostPermissionGranted: boolean;
  updatedAt?: string;
}

export interface ProviderSettings {
  activeProvider: ProviderId;
  gemini: GeminiProviderSettings;
  openai: OpenAIProviderSettings;
  openaiCompatible: OpenAICompatibleProviderSettings;
}

export interface SaveGeminiProviderInput {
  apiKey?: string;
  model: string;
}

export interface SaveOpenAIProviderInput {
  apiKey?: string;
  model: string;
  baseUrl?: string;
}

export interface SaveOpenAICompatibleProviderInput {
  apiKey?: string;
  model: string;
  baseUrl?: string;
  providerName?: string;
}

export interface ChromeStorageAreaLike {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export async function readGeminiProviderConfig(
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<StoredGeminiProviderConfig | undefined> {
  const values = await storage.get(geminiProviderStorageKey);
  const raw = values[geminiProviderStorageKey];
  if (!isRecord(raw)) return undefined;

  const apiKey = normalizeApiKey(raw.apiKey);
  const model = normalizeModel(raw.model);
  if (apiKey === undefined || model === undefined) return undefined;

  return {
    provider: "gemini",
    apiKey,
    model,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

export async function saveGeminiProviderConfig(
  input: SaveGeminiProviderInput,
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<StoredGeminiProviderConfig> {
  const existing = await readGeminiProviderConfig(storage);
  const apiKey = normalizeApiKey(input.apiKey) ?? existing?.apiKey;
  const model = normalizeModel(input.model) ?? defaultGeminiModel;

  if (apiKey === undefined) {
    throw new Error("Gemini API key is required before saving provider settings.");
  }

  const config: StoredGeminiProviderConfig = {
    provider: "gemini",
    apiKey,
    model,
    updatedAt: new Date().toISOString(),
  };
  await storage.set({ [geminiProviderStorageKey]: config });
  return config;
}

export async function getGeminiProviderSettings(
  storage: ChromeStorageAreaLike = chrome.storage.local,
  permissions?: Parameters<typeof hasGeminiHostPermission>[0],
): Promise<GeminiProviderSettings> {
  const config = await readGeminiProviderConfig(storage);
  return {
    provider: "gemini",
    model: config?.model ?? defaultGeminiModel,
    ...(config?.apiKey === undefined ? {} : { apiKey: config.apiKey }),
    apiKeyConfigured: config !== undefined,
    hostPermissionGranted: await hasGeminiHostPermission(permissions),
    ...(config?.updatedAt === undefined ? {} : { updatedAt: config.updatedAt }),
  };
}

export async function readOpenAIProviderConfig(
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<StoredOpenAIProviderConfig | undefined> {
  const values = await storage.get(openAIProviderStorageKey);
  const raw = values[openAIProviderStorageKey];
  if (!isRecord(raw)) return defaultOpenAIProviderConfig();

  const apiKey = normalizeApiKey(raw.apiKey);
  const model = normalizeModel(raw.model);
  if (apiKey === undefined || model === undefined) return undefined;

  return {
    provider: "openai",
    apiKey,
    model,
    baseUrl: normalizeStoredOpenAIBaseUrl(raw.baseUrl),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

export async function saveOpenAIProviderConfig(
  input: SaveOpenAIProviderInput,
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<StoredOpenAIProviderConfig> {
  const existing = await readOpenAIProviderConfig(storage);
  const apiKey = normalizeApiKey(input.apiKey) ?? existing?.apiKey;
  const model = normalizeModel(input.model) ?? defaultOpenAIModel;
  const baseUrl =
    normalizeOpenAIBaseUrl(input.baseUrl) ?? existing?.baseUrl ?? defaultOpenAIBaseUrl;

  if (apiKey === undefined) {
    throw new Error("OpenAI API key is required before saving provider settings.");
  }

  const config: StoredOpenAIProviderConfig = {
    provider: "openai",
    apiKey,
    model,
    baseUrl,
    updatedAt: new Date().toISOString(),
  };
  await storage.set({ [openAIProviderStorageKey]: config });
  return config;
}

export async function getOpenAIProviderSettings(
  storage: ChromeStorageAreaLike = chrome.storage.local,
  permissions?: Parameters<typeof hasGeminiHostPermission>[0],
): Promise<OpenAIProviderSettings> {
  const config = await readOpenAIProviderConfig(storage);
  return {
    provider: "openai",
    model: config?.model ?? defaultOpenAIModel,
    baseUrl: config?.baseUrl ?? defaultOpenAIBaseUrl,
    ...(config?.apiKey === undefined ? {} : { apiKey: config.apiKey }),
    apiKeyConfigured: config !== undefined,
    hostPermissionGranted: await hasOpenAIHostPermission(
      config?.baseUrl ?? defaultOpenAIBaseUrl,
      permissions,
    ),
    ...(config?.updatedAt === undefined ? {} : { updatedAt: config.updatedAt }),
  };
}

export async function readOpenAICompatibleProviderConfig(
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<StoredOpenAICompatibleProviderConfig | undefined> {
  const values = await storage.get([
    openAICompatibleProviderStorageKey,
    legacyOpenAICompatibleProviderStorageKey,
  ]);
  const raw =
    values[openAICompatibleProviderStorageKey] ?? values[legacyOpenAICompatibleProviderStorageKey];
  if (!isRecord(raw)) return undefined;

  const apiKey = normalizeApiKey(raw.apiKey);
  const model = normalizeModel(raw.model);
  if (apiKey === undefined || model === undefined) return undefined;

  return {
    provider: "openai-compatible",
    apiKey,
    model,
    baseUrl: normalizeStoredOpenAICompatibleBaseUrl(raw.baseUrl),
    providerName:
      normalizeProviderName(raw.providerName) ??
      normalizeLegacyCompatibleProviderName(raw.provider) ??
      defaultOpenAICompatibleProviderName,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date(0).toISOString(),
  };
}

export async function saveOpenAICompatibleProviderConfig(
  input: SaveOpenAICompatibleProviderInput,
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<StoredOpenAICompatibleProviderConfig> {
  const existing = await readOpenAICompatibleProviderConfig(storage);
  const apiKey = normalizeApiKey(input.apiKey) ?? existing?.apiKey;
  const model = normalizeModel(input.model) ?? defaultOpenAICompatibleModel;
  const baseUrl =
    normalizeOpenAICompatibleBaseUrl(input.baseUrl) ??
    existing?.baseUrl ??
    defaultOpenAICompatibleBaseUrl;
  const providerName =
    normalizeProviderName(input.providerName) ??
    existing?.providerName ??
    defaultOpenAICompatibleProviderName;

  if (apiKey === undefined) {
    throw new Error("OpenAI-compatible API key is required before saving provider settings.");
  }

  const config: StoredOpenAICompatibleProviderConfig = {
    provider: "openai-compatible",
    apiKey,
    model,
    baseUrl,
    providerName,
    updatedAt: new Date().toISOString(),
  };
  await storage.set({ [openAICompatibleProviderStorageKey]: config });
  return config;
}

export async function getOpenAICompatibleProviderSettings(
  storage: ChromeStorageAreaLike = chrome.storage.local,
  permissions?: Parameters<typeof hasGeminiHostPermission>[0],
): Promise<OpenAICompatibleProviderSettings> {
  const config = await readOpenAICompatibleProviderConfig(storage);
  return {
    provider: "openai-compatible",
    model: config?.model ?? defaultOpenAICompatibleModel,
    baseUrl: config?.baseUrl ?? defaultOpenAICompatibleBaseUrl,
    providerName: config?.providerName ?? defaultOpenAICompatibleProviderName,
    ...(config?.apiKey === undefined ? {} : { apiKey: config.apiKey }),
    apiKeyConfigured: config !== undefined,
    hostPermissionGranted: await hasOpenAICompatibleHostPermission(
      config?.baseUrl ?? defaultOpenAICompatibleBaseUrl,
      permissions,
    ),
    ...(config?.updatedAt === undefined ? {} : { updatedAt: config.updatedAt }),
  };
}

export async function readActiveProviderId(
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<ProviderId> {
  const values = await storage.get(activeProviderStorageKey);
  const raw = values[activeProviderStorageKey];
  const provider = isProviderId(raw)
    ? raw
    : isRecord(raw) && isProviderId(raw.provider)
      ? raw.provider
      : undefined;

  if (provider === undefined) return defaultActiveProvider;
  if (provider !== "openai") return provider;

  const explicitOpenAISelection = isRecord(raw) && raw.schemaVersion === 2;
  if (explicitOpenAISelection) return "openai";
  if (await hasLegacyOpenAICompatibleConfig(storage)) return "openai-compatible";
  return "openai";
}

export async function saveActiveProviderId(
  provider: ProviderId,
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<ProviderId> {
  await storage.set({
    [activeProviderStorageKey]: {
      provider,
      schemaVersion: 2,
      updatedAt: new Date().toISOString(),
    },
  });
  return provider;
}

export async function readActiveProviderConfig(
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<StoredProviderConfig | undefined> {
  const activeProvider = await readActiveProviderId(storage);
  if (activeProvider === "gemini") return readGeminiProviderConfig(storage);
  if (activeProvider === "openai") return readOpenAIProviderConfig(storage);
  return readOpenAICompatibleProviderConfig(storage);
}

export async function getProviderSettings(
  storage: ChromeStorageAreaLike = chrome.storage.local,
  permissions?: Parameters<typeof hasGeminiHostPermission>[0],
): Promise<ProviderSettings> {
  const [activeProvider, gemini, openai, openaiCompatible] = await Promise.all([
    readActiveProviderId(storage),
    getGeminiProviderSettings(storage, permissions),
    getOpenAIProviderSettings(storage, permissions),
    getOpenAICompatibleProviderSettings(storage, permissions),
  ]);
  return { activeProvider, gemini, openai, openaiCompatible };
}

export function normalizeApiKey(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeModel(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeProviderName(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeLegacyCompatibleProviderName(value: unknown) {
  const providerName = normalizeProviderName(value);
  if (providerName === undefined || providerName === "openai") return undefined;
  return providerName;
}

function normalizeStoredOpenAICompatibleBaseUrl(value: unknown) {
  try {
    return normalizeOpenAICompatibleBaseUrl(value) ?? defaultOpenAICompatibleBaseUrl;
  } catch {
    return defaultOpenAICompatibleBaseUrl;
  }
}

function normalizeStoredOpenAIBaseUrl(value: unknown) {
  try {
    return normalizeOpenAIBaseUrl(value) ?? defaultOpenAIBaseUrl;
  } catch {
    return defaultOpenAIBaseUrl;
  }
}

function defaultOpenAIProviderConfig(): StoredOpenAIProviderConfig | undefined {
  if (defaultOpenAIApiKey === undefined) return undefined;
  return {
    provider: "openai",
    apiKey: defaultOpenAIApiKey,
    model: defaultOpenAIConfigModel ?? defaultOpenAIModel,
    baseUrl: defaultOpenAIConfigBaseUrl,
    updatedAt: new Date(0).toISOString(),
  };
}

async function hasLegacyOpenAICompatibleConfig(storage: ChromeStorageAreaLike) {
  const values = await storage.get([
    openAICompatibleProviderStorageKey,
    legacyOpenAICompatibleProviderStorageKey,
    openAIProviderStorageKey,
  ]);
  if (isRecord(values[openAIProviderStorageKey])) return false;
  return (
    isRecord(values[openAICompatibleProviderStorageKey]) ||
    isRecord(values[legacyOpenAICompatibleProviderStorageKey])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProviderId(value: unknown): value is ProviderId {
  return value === "gemini" || value === "openai" || value === "openai-compatible";
}
