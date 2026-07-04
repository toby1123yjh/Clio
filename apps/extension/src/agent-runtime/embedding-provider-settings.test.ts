import { describe, expect, it } from "vitest";
import {
  defaultEmbeddingProvider,
  defaultOpenAICompatibleEmbeddingModel,
  defaultOpenAIEmbeddingModel,
  deriveEmbeddingModelId,
  embeddingProviderStorageKey,
  getEmbeddingProviderSettings,
  readEmbeddingProviderSettings,
  resolveEmbeddingRuntimeConfig,
  saveEmbeddingProviderSettings,
  saveEmbeddingProviderTestResult,
} from "./embedding-provider-settings";
import type { ChromePermissionsLike } from "./gemini-permission";
import { defaultOpenAIBaseUrl, defaultOpenAICompatibleBaseUrl } from "./openai-provider-config";
import type { ChromeStorageAreaLike } from "./provider-settings";

function fakeStorage(initial: Record<string, unknown> = {}): ChromeStorageAreaLike {
  const values = { ...initial };
  return {
    async get(key) {
      if (typeof key === "string") return { [key]: values[key] };
      if (Array.isArray(key)) {
        return Object.fromEntries(key.map((item) => [item, values[item]]));
      }
      return { ...values };
    },
    async set(items) {
      Object.assign(values, items);
    },
  };
}

function fakePermissions(granted: boolean): ChromePermissionsLike {
  return {
    async contains() {
      return granted;
    },
    async request() {
      return granted;
    },
  };
}

describe("Embedding provider settings", () => {
  it("defaults to dedicated OpenAI embedding settings", async () => {
    const settings = await getEmbeddingProviderSettings(fakeStorage(), fakePermissions(false));

    expect(settings.activeProvider).toBe(defaultEmbeddingProvider);
    expect(settings.openai).toMatchObject({
      provider: "openai",
      model: defaultOpenAIEmbeddingModel,
      baseUrl: defaultOpenAIBaseUrl,
      apiKeyConfigured: false,
      hostPermissionGranted: false,
    });
    expect(settings.openaiCompatible).toMatchObject({
      provider: "openai-compatible",
      model: defaultOpenAICompatibleEmbeddingModel,
      baseUrl: defaultOpenAICompatibleBaseUrl,
      providerName: "custom",
      apiKeyConfigured: false,
      hostPermissionGranted: false,
    });
  });

  it("saves OpenAI and OpenAI-compatible configs without reusing chat provider settings", async () => {
    const storage = fakeStorage();

    const settings = await saveEmbeddingProviderSettings(
      {
        activeProvider: "openai-compatible",
        openai: {
          apiKey: " openai-embedding-key ",
          model: " text-embedding-3-small ",
          baseUrl: " https://api.openai.example.test/v1/ ",
        },
        openaiCompatible: {
          apiKey: " compatible-embedding-key ",
          model: " embed-custom ",
          baseUrl: " https://embeddings.example.test/v1/ ",
          providerName: " local-gateway ",
        },
      },
      storage,
    );

    expect(settings.activeProvider).toBe("openai-compatible");
    expect(settings.openai).toMatchObject({
      apiKey: "openai-embedding-key",
      model: "text-embedding-3-small",
      baseUrl: "https://api.openai.example.test/v1",
    });
    expect(settings.openaiCompatible).toMatchObject({
      apiKey: "compatible-embedding-key",
      model: "embed-custom",
      baseUrl: "https://embeddings.example.test/v1",
      providerName: "local-gateway",
    });
  });

  it("resets inferred dimension when vector-space identity changes", async () => {
    const storage = fakeStorage();
    await saveEmbeddingProviderSettings(
      {
        activeProvider: "openai",
        openai: {
          apiKey: "embedding-key",
          model: "text-embedding-3-small",
          baseUrl: "https://api.openai.example.test/v1",
          dimension: 1536,
          lastTestAt: "2026-07-03T00:00:00.000Z",
        },
      },
      storage,
    );
    await saveEmbeddingProviderSettings(
      {
        activeProvider: "openai",
        openai: {
          model: "text-embedding-3-large",
        },
      },
      storage,
    );

    const stored = await readEmbeddingProviderSettings(storage);
    expect(stored.openai.apiKey).toBe("embedding-key");
    expect(stored.openai.model).toBe("text-embedding-3-large");
    expect(stored.openai.dimension).toBeUndefined();
    expect(stored.openai.lastTestAt).toBeUndefined();
  });

  it("derives stable model ids from provider identity without API key input", () => {
    const first = deriveEmbeddingModelId({
      provider: "openai-compatible",
      baseUrl: "https://embeddings.example.test/v1",
      providerName: "local-gateway",
      model: "Embed Custom",
      dimension: 768,
    });
    const second = deriveEmbeddingModelId({
      provider: "openai-compatible",
      baseUrl: "https://embeddings.example.test/v1",
      providerName: "local-gateway",
      model: "Embed Custom",
      dimension: 768,
    });
    const differentDimension = deriveEmbeddingModelId({
      provider: "openai-compatible",
      baseUrl: "https://embeddings.example.test/v1",
      providerName: "local-gateway",
      model: "Embed Custom",
      dimension: 1024,
    });

    expect(first).toBe(second);
    expect(first).not.toContain("secret");
    expect(first).not.toBe(differentDimension);
    expect(first).toMatch(/^openai-compatible:[a-f0-9]+:embed-custom:d768$/);
  });

  it("persists successful test dimensions and resolves runtime config", async () => {
    const storage = fakeStorage({
      [embeddingProviderStorageKey]: {
        activeProvider: "openai",
        openai: {
          apiKey: "embedding-key",
          model: "text-embedding-3-small",
          baseUrl: "https://api.openai.example.test/v1",
        },
        openaiCompatible: {
          model: "embed-custom",
          baseUrl: "https://embeddings.example.test/v1",
          providerName: "local-gateway",
        },
      },
    });

    await saveEmbeddingProviderTestResult(
      {
        ok: true,
        provider: "openai",
        model: "text-embedding-3-small",
        baseUrl: "https://api.openai.example.test/v1",
        dimension: 1536,
        modelId: "openai:test:text-embedding-3-small:d1536",
        label: "OpenAI Embeddings text-embedding-3-small (1536d)",
        testedAt: "2026-07-03T00:00:00.000Z",
      },
      storage,
    );

    const settings = await getEmbeddingProviderSettings(storage, fakePermissions(true));
    const config = resolveEmbeddingRuntimeConfig(settings);
    expect(config).toMatchObject({
      provider: "openai",
      model: "text-embedding-3-small",
      dimension: 1536,
      label: "OpenAI Embeddings text-embedding-3-small (1536d)",
    });
    expect(config.modelId).toBe(settings.openai.modelId);
  });

  it("requires a successful dimension test before runtime resolution", async () => {
    const settings = await saveEmbeddingProviderSettings(
      {
        activeProvider: "openai",
        openai: {
          apiKey: "embedding-key",
          model: "text-embedding-3-small",
          baseUrl: "https://api.openai.example.test/v1",
        },
      },
      fakeStorage(),
    );

    expect(() => resolveEmbeddingRuntimeConfig(settings)).toThrow("Test the embedding provider");
  });
});
