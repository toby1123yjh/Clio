import { describe, expect, it } from "vitest";
import { defaultOpenAIBaseUrl } from "./openai-provider-config";
import type { ChromeStorageAreaLike, StoredProviderConfig } from "./provider-settings";
import {
  defaultSearchProviderSettings,
  readSearchProviderSettings,
  resolveWebSearchConfig,
  saveSearchProviderSettings,
  searchProviderStorageKey,
} from "./search-provider-settings";

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

const mainOpenAIConfig: StoredProviderConfig = {
  provider: "openai",
  apiKey: "main-openai-key",
  model: "gpt-main",
  baseUrl: "https://api.openai.example.test/v1",
  updatedAt: "2026-06-08T00:00:00.000Z",
};

const mainOpenAICompatibleConfig: StoredProviderConfig = {
  provider: "openai-compatible",
  apiKey: "compatible-key",
  model: "deepseek-chat",
  baseUrl: "https://new-api.example.test/v1",
  providerName: "custom",
  updatedAt: "2026-06-08T00:00:00.000Z",
};

describe("Search provider settings", () => {
  it("defaults to Auto with blank OpenAI Search overrides", async () => {
    await expect(readSearchProviderSettings(fakeStorage())).resolves.toEqual(
      defaultSearchProviderSettings(),
    );
  });

  it("saves blank OpenAI Search overrides as a valid runtime fallback config", async () => {
    const storage = fakeStorage();

    const settings = await saveSearchProviderSettings(
      {
        provider: "auto",
        openai: {
          apiKey: "",
          model: "   ",
          baseUrl: "",
        },
      },
      storage,
    );

    expect(settings.provider).toBe("auto");
    expect(settings.openai).toEqual({});
    expect(settings.openaiCompatible).toEqual({});
    await expect(readSearchProviderSettings(storage)).resolves.toMatchObject({
      provider: "auto",
      openai: {},
      openaiCompatible: {},
    });
  });

  it("normalizes stored OpenAI Search override fields without copying main model values", async () => {
    const storage = fakeStorage({
      [searchProviderStorageKey]: {
        provider: "openai",
        openai: {
          apiKey: " search-key ",
          model: " gpt-search ",
          baseUrl: " https://api.openai.example.test/v1/ ",
        },
        updatedAt: "2026-06-08T00:00:00.000Z",
      },
    });

    await expect(readSearchProviderSettings(storage)).resolves.toEqual({
      provider: "openai",
      openai: {
        apiKey: "search-key",
        model: "gpt-search",
        baseUrl: "https://api.openai.example.test/v1",
      },
      openaiCompatible: {},
      updatedAt: "2026-06-08T00:00:00.000Z",
    });
  });

  it("saves unrestricted OpenAI Compatible Search model overrides", async () => {
    const storage = fakeStorage();

    const settings = await saveSearchProviderSettings(
      {
        provider: "openai-compatible",
        openaiCompatible: {
          apiKey: " compatible-key ",
          model: " any-provider-model-2026 ",
          baseUrl: " https://new-api.example.test/v1/ ",
        },
      },
      storage,
    );

    expect(settings).toMatchObject({
      provider: "openai-compatible",
      openai: {},
      openaiCompatible: {
        apiKey: "compatible-key",
        model: "any-provider-model-2026",
        baseUrl: "https://new-api.example.test/v1",
      },
    });
  });

  it("uses filled Search overrides first and falls back per field to main OpenAI config", () => {
    const resolved = resolveWebSearchConfig(
      {
        provider: "auto",
        openai: {
          model: "gpt-search",
        },
        openaiCompatible: {},
      },
      mainOpenAIConfig,
    );

    expect(resolved).toEqual({
      provider: "openai",
      providerFamily: "openai",
      providerLabel: "OpenAI Search",
      apiKey: "main-openai-key",
      model: "gpt-search",
      baseUrl: "https://api.openai.example.test/v1",
      protocol: "openai-responses-web-search",
      configuredBy: "search-openai-override",
    });
  });

  it("uses explicit OpenAI Search key without requiring a main OpenAI provider", () => {
    const resolved = resolveWebSearchConfig(
      {
        provider: "openai",
        openai: {
          apiKey: "search-key",
          model: "gpt-search",
        },
        openaiCompatible: {},
      },
      undefined,
    );

    expect(resolved).toMatchObject({
      provider: "openai",
      providerFamily: "openai",
      apiKey: "search-key",
      model: "gpt-search",
      baseUrl: defaultOpenAIBaseUrl,
      protocol: "openai-responses-web-search",
      configuredBy: "search-openai-override",
    });
  });

  it("selects Chat Completions protocol for OpenAI dedicated search models", () => {
    const resolved = resolveWebSearchConfig(
      {
        provider: "openai",
        openai: {
          apiKey: "search-key",
          model: "gpt-5-search-api",
        },
        openaiCompatible: {},
      },
      undefined,
    );

    expect(resolved).toMatchObject({
      provider: "openai",
      model: "gpt-5-search-api",
      protocol: "openai-chat-completions-search",
    });
  });

  it("auto-runs with the active OpenAI Compatible provider through Responses web_search", () => {
    const resolved = resolveWebSearchConfig(
      {
        provider: "auto",
        openai: {},
        openaiCompatible: {},
      },
      mainOpenAICompatibleConfig,
    );

    expect(resolved).toEqual({
      provider: "openai-compatible",
      providerFamily: "openai-compatible",
      providerLabel: "OpenAI Compatible Search",
      apiKey: "compatible-key",
      model: "deepseek-chat",
      baseUrl: "https://new-api.example.test/v1",
      protocol: "openai-responses-web-search",
      configuredBy: "main-openai-compatible",
    });
  });

  it("reports setup required at search runtime when no source-returning config exists", () => {
    const geminiOnly: StoredProviderConfig = {
      provider: "gemini",
      apiKey: "gemini-key",
      model: "gemini-2.5-flash",
      updatedAt: "2026-06-08T00:00:00.000Z",
    };

    expect(() =>
      resolveWebSearchConfig(
        {
          provider: "auto",
          openai: {},
          openaiCompatible: {},
        },
        geminiOnly,
      ),
    ).toThrow("Configure Search or a search-capable model");
  });
});
