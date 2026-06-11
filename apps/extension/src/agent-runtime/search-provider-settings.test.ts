import { describe, expect, it } from "vitest";
import { defaultOpenAIBaseUrl } from "./openai-provider-config";
import type { ChromeStorageAreaLike, StoredProviderConfig } from "./provider-settings";
import {
  defaultSearchProviderSettings,
  readSearchProviderSettings,
  resolveOpenAIWebSearchConfig,
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
    await expect(readSearchProviderSettings(storage)).resolves.toMatchObject({
      provider: "auto",
      openai: {},
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
      updatedAt: "2026-06-08T00:00:00.000Z",
    });
  });

  it("uses filled Search overrides first and falls back per field to main OpenAI config", () => {
    const resolved = resolveOpenAIWebSearchConfig(
      {
        provider: "auto",
        openai: {
          model: "gpt-search",
        },
      },
      mainOpenAIConfig,
    );

    expect(resolved).toEqual({
      provider: "openai",
      apiKey: "main-openai-key",
      model: "gpt-search",
      baseUrl: "https://api.openai.example.test/v1",
      configuredBy: "search-override",
    });
  });

  it("uses explicit OpenAI Search key without requiring a main OpenAI provider", () => {
    const resolved = resolveOpenAIWebSearchConfig(
      {
        provider: "openai",
        openai: {
          apiKey: "search-key",
          model: "gpt-search",
        },
      },
      undefined,
    );

    expect(resolved).toMatchObject({
      provider: "openai",
      apiKey: "search-key",
      model: "gpt-search",
      baseUrl: defaultOpenAIBaseUrl,
      configuredBy: "search-override",
    });
  });

  it("reports setup required at search runtime when no source-returning config exists", () => {
    const compatibleOnly: StoredProviderConfig = {
      provider: "openai-compatible",
      apiKey: "compatible-key",
      model: "gpt-5.5",
      baseUrl: "https://new-api.example.test/v1",
      providerName: "custom",
      updatedAt: "2026-06-08T00:00:00.000Z",
    };

    expect(() =>
      resolveOpenAIWebSearchConfig(
        {
          provider: "auto",
          openai: {},
        },
        compatibleOnly,
      ),
    ).toThrow("Configure OpenAI Search or an OpenAI model");
  });
});
