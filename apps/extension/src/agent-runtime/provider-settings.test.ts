import { describe, expect, it } from "vitest";
import type { ChromePermissionsLike } from "./gemini-permission";
import { defaultOpenAIBaseUrl, defaultOpenAICompatibleBaseUrl } from "./openai-provider-config";
import {
  type ChromeStorageAreaLike,
  activeProviderStorageKey,
  defaultActiveProvider,
  defaultGeminiModel,
  defaultOpenAICompatibleModel,
  defaultOpenAICompatibleProviderName,
  defaultOpenAIModel,
  geminiProviderStorageKey,
  getGeminiProviderSettings,
  getOpenAICompatibleProviderSettings,
  getOpenAIProviderSettings,
  getProviderSettings,
  legacyOpenAICompatibleProviderStorageKey,
  openAICompatibleProviderStorageKey,
  openAIProviderStorageKey,
  readActiveProviderConfig,
  readActiveProviderId,
  readGeminiProviderConfig,
  readOpenAICompatibleProviderConfig,
  readOpenAIProviderConfig,
  saveActiveProviderId,
  saveGeminiProviderConfig,
  saveOpenAICompatibleProviderConfig,
  saveOpenAIProviderConfig,
} from "./provider-settings";

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

describe("Gemini provider settings", () => {
  it("returns the saved API key for explicit settings echo", async () => {
    const storage = fakeStorage({
      [geminiProviderStorageKey]: {
        provider: "gemini",
        apiKey: "secret-key",
        model: "gemini-2.5-flash",
        updatedAt: "2026-05-22T00:00:00.000Z",
      },
    });

    const settings = await getGeminiProviderSettings(storage, fakePermissions(true));

    expect(settings).toEqual({
      provider: "gemini",
      model: "gemini-2.5-flash",
      apiKey: "secret-key",
      apiKeyConfigured: true,
      hostPermissionGranted: true,
      updatedAt: "2026-05-22T00:00:00.000Z",
    });
  });

  it("saves a new key and preserves it when only the model changes", async () => {
    const storage = fakeStorage();

    await saveGeminiProviderConfig(
      {
        apiKey: " secret-key ",
        model: "gemini-2.5-flash",
      },
      storage,
    );
    await saveGeminiProviderConfig(
      {
        model: "gemini-2.0-flash",
      },
      storage,
    );

    const config = await readGeminiProviderConfig(storage);
    expect(config?.apiKey).toBe("secret-key");
    expect(config?.model).toBe("gemini-2.0-flash");
  });

  it("returns defaults when provider config is missing", async () => {
    const settings = await getGeminiProviderSettings(fakeStorage(), fakePermissions(false));

    expect(settings).toEqual({
      provider: "gemini",
      model: defaultGeminiModel,
      apiKeyConfigured: false,
      hostPermissionGranted: false,
    });
  });
});

describe("multi-provider settings", () => {
  it("returns all provider settings with saved API keys and active provider", async () => {
    const storage = fakeStorage({
      [activeProviderStorageKey]: {
        provider: "openai-compatible",
        schemaVersion: 2,
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
      [geminiProviderStorageKey]: {
        provider: "gemini",
        apiKey: "gemini-secret",
        model: "gemini-2.5-flash",
        updatedAt: "2026-05-22T00:00:00.000Z",
      },
      [openAIProviderStorageKey]: {
        provider: "openai",
        apiKey: "openai-secret",
        model: "gpt-5.1",
        baseUrl: "https://api.openai.example.test/v1",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
      [openAICompatibleProviderStorageKey]: {
        provider: "openai-compatible",
        apiKey: "compatible-secret",
        model: "gpt-5.5",
        baseUrl: "https://new-api.example.test/v1",
        providerName: "custom",
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    });

    const settings = await getProviderSettings(storage, fakePermissions(true));

    expect(settings).toEqual({
      activeProvider: "openai-compatible",
      gemini: {
        provider: "gemini",
        model: "gemini-2.5-flash",
        apiKey: "gemini-secret",
        apiKeyConfigured: true,
        hostPermissionGranted: true,
        updatedAt: "2026-05-22T00:00:00.000Z",
      },
      openai: {
        provider: "openai",
        model: "gpt-5.1",
        baseUrl: "https://api.openai.example.test/v1",
        apiKey: "openai-secret",
        apiKeyConfigured: true,
        hostPermissionGranted: true,
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
      openaiCompatible: {
        provider: "openai-compatible",
        model: "gpt-5.5",
        baseUrl: "https://new-api.example.test/v1",
        providerName: "custom",
        apiKey: "compatible-secret",
        apiKeyConfigured: true,
        hostPermissionGranted: true,
        updatedAt: "2026-05-30T00:00:00.000Z",
      },
    });
  });

  it("defaults to OpenAI and provider defaults when configs are missing", async () => {
    const settings = await getProviderSettings(fakeStorage(), fakePermissions(false));

    expect(settings.activeProvider).toBe(defaultActiveProvider);
    expect(defaultActiveProvider).toBe("openai");
    expect(settings.gemini.model).toBe(defaultGeminiModel);
    expect(settings.gemini.apiKey).toBeUndefined();
    expect(settings.gemini.apiKeyConfigured).toBe(false);
    expect(settings.openai.model).toBe(defaultOpenAIModel);
    expect(settings.openai.baseUrl).toBe(defaultOpenAIBaseUrl);
    expect(settings.openai.apiKey).toBeUndefined();
    expect(settings.openai.apiKeyConfigured).toBe(false);
    expect(settings.openaiCompatible.model).toBe(defaultOpenAICompatibleModel);
    expect(settings.openaiCompatible.baseUrl).toBe(defaultOpenAICompatibleBaseUrl);
    expect(settings.openaiCompatible.providerName).toBe(defaultOpenAICompatibleProviderName);
    expect(settings.openaiCompatible.apiKey).toBeUndefined();
    expect(settings.openaiCompatible.apiKeyConfigured).toBe(false);
  });

  it("saves, preserves, and echoes official OpenAI config in UI settings", async () => {
    const storage = fakeStorage();

    await saveOpenAIProviderConfig(
      {
        apiKey: " openai-secret ",
        model: "gpt-5.1",
        baseUrl: " https://api.openai.example.test/v1/ ",
      },
      storage,
    );
    await saveOpenAIProviderConfig(
      {
        model: "gpt-5.2",
      },
      storage,
    );

    const config = await readOpenAIProviderConfig(storage);
    expect(config?.apiKey).toBe("openai-secret");
    expect(config?.model).toBe("gpt-5.2");
    expect(config?.baseUrl).toBe("https://api.openai.example.test/v1");

    const settings = await getOpenAIProviderSettings(storage, fakePermissions(true));
    expect(settings).toMatchObject({
      provider: "openai",
      model: "gpt-5.2",
      baseUrl: "https://api.openai.example.test/v1",
      apiKey: "openai-secret",
      apiKeyConfigured: true,
      hostPermissionGranted: true,
    });
  });

  it("saves, preserves, and echoes OpenAI-compatible config in UI settings", async () => {
    const storage = fakeStorage();

    await saveOpenAICompatibleProviderConfig(
      {
        apiKey: " compatible-secret ",
        model: "gpt-5.5",
        baseUrl: " https://new-api.example.test/v1/ ",
        providerName: "custom",
      },
      storage,
    );
    await saveOpenAICompatibleProviderConfig(
      {
        model: "gpt-5.6",
      },
      storage,
    );

    const config = await readOpenAICompatibleProviderConfig(storage);
    expect(config?.apiKey).toBe("compatible-secret");
    expect(config?.model).toBe("gpt-5.6");
    expect(config?.baseUrl).toBe("https://new-api.example.test/v1");
    expect(config?.providerName).toBe("custom");

    const settings = await getOpenAICompatibleProviderSettings(storage, fakePermissions(true));
    expect(settings).toMatchObject({
      provider: "openai-compatible",
      model: "gpt-5.6",
      baseUrl: "https://new-api.example.test/v1",
      providerName: "custom",
      apiKey: "compatible-secret",
      apiKeyConfigured: true,
      hostPermissionGranted: true,
    });
  });

  it("persists active provider selection and reads the selected compatible config", async () => {
    const storage = fakeStorage({
      [openAICompatibleProviderStorageKey]: {
        provider: "openai-compatible",
        apiKey: "compatible-secret",
        model: "gpt-5.5",
        baseUrl: "https://new-api.example.test/v1",
        providerName: "custom",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
    });

    await saveActiveProviderId("openai-compatible", storage);

    expect(await readActiveProviderId(storage)).toBe("openai-compatible");
    expect(await readActiveProviderConfig(storage)).toMatchObject({
      provider: "openai-compatible",
      model: "gpt-5.5",
      baseUrl: "https://new-api.example.test/v1",
      providerName: "custom",
    });
  });

  it("migrates the legacy OpenAI storage slot to OpenAI-compatible", async () => {
    const storage = fakeStorage({
      [activeProviderStorageKey]: {
        provider: "openai",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
      [legacyOpenAICompatibleProviderStorageKey]: {
        provider: "openai",
        apiKey: "legacy-secret",
        model: "gpt-5.5",
        baseUrl: "https://new-api.example.test/v1",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
    });

    expect(await readActiveProviderId(storage)).toBe("openai-compatible");
    expect(await readActiveProviderConfig(storage)).toMatchObject({
      provider: "openai-compatible",
      apiKey: "legacy-secret",
      model: "gpt-5.5",
      baseUrl: "https://new-api.example.test/v1",
      providerName: "custom",
    });
  });

  it("keeps explicit schema-versioned OpenAI selection official", async () => {
    const storage = fakeStorage({
      [activeProviderStorageKey]: {
        provider: "openai",
        schemaVersion: 2,
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
      [openAIProviderStorageKey]: {
        provider: "openai",
        apiKey: "openai-secret",
        model: "gpt-5.1",
        baseUrl: "https://api.openai.example.test/v1",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
      [legacyOpenAICompatibleProviderStorageKey]: {
        provider: "openai",
        apiKey: "legacy-secret",
        model: "gpt-5.5",
        baseUrl: "https://new-api.example.test/v1",
        updatedAt: "2026-05-29T00:00:00.000Z",
      },
    });

    expect(await readActiveProviderId(storage)).toBe("openai");
    expect(await readActiveProviderConfig(storage)).toMatchObject({
      provider: "openai",
      apiKey: "openai-secret",
      model: "gpt-5.1",
      baseUrl: "https://api.openai.example.test/v1",
    });
  });
});
