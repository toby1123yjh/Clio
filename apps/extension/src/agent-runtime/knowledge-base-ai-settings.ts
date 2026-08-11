import type { ChromeStorageAreaLike } from "./provider-settings";

export const knowledgeBaseAiSettingsStorageKey = "clio:knowledge-base:ai-settings";

export interface KnowledgeBaseAiSettings {
  wiki: {
    enabled: boolean;
  };
  updatedAt?: string;
}

export interface SaveKnowledgeBaseAiSettingsInput {
  wiki: {
    enabled: boolean;
  };
}

export function defaultKnowledgeBaseAiSettings(): KnowledgeBaseAiSettings {
  return { wiki: { enabled: false } };
}

export async function readKnowledgeBaseAiSettings(
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<KnowledgeBaseAiSettings> {
  const values = await storage.get(knowledgeBaseAiSettingsStorageKey);
  return normalizeKnowledgeBaseAiSettings(values[knowledgeBaseAiSettingsStorageKey]);
}

export async function saveKnowledgeBaseAiSettings(
  input: SaveKnowledgeBaseAiSettingsInput,
  storage: ChromeStorageAreaLike = chrome.storage.local,
): Promise<KnowledgeBaseAiSettings> {
  if (!isSaveKnowledgeBaseAiSettingsInput(input)) {
    throw new TypeError("Knowledge Base AI settings require a boolean wiki.enabled value.");
  }
  const settings: KnowledgeBaseAiSettings = {
    wiki: { enabled: input.wiki.enabled },
    updatedAt: new Date().toISOString(),
  };
  await storage.set({ [knowledgeBaseAiSettingsStorageKey]: settings });
  return settings;
}

export function isSaveKnowledgeBaseAiSettingsInput(
  value: unknown,
): value is SaveKnowledgeBaseAiSettingsInput {
  return isRecord(value) && isRecord(value.wiki) && typeof value.wiki.enabled === "boolean";
}

function normalizeKnowledgeBaseAiSettings(value: unknown): KnowledgeBaseAiSettings {
  if (!isRecord(value) || !isRecord(value.wiki)) return defaultKnowledgeBaseAiSettings();
  return {
    wiki: {
      enabled: value.wiki.enabled === true,
    },
    ...(typeof value.updatedAt === "string" ? { updatedAt: value.updatedAt } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
