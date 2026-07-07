import { describe, expect, it } from "vitest";
import { EngineRpcError } from "../shared/rpc";
import { defaultOpenAIBaseUrl, defaultOpenAICompatibleBaseUrl } from "./openai-provider-config";
import type { ChromeStorageAreaLike, StoredProviderConfig } from "./provider-settings";
import {
  defaultVisionProviderSettings,
  readVisionProviderSettings,
  resolveVisionProviderConfig,
  saveVisionProviderSettings,
  visionProviderStorageKey,
} from "./vision-provider-settings";

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
  updatedAt: "2026-07-07T00:00:00.000Z",
};

const mainGeminiConfig: StoredProviderConfig = {
  provider: "gemini",
  apiKey: "main-gemini-key",
  model: "gemini-main",
  updatedAt: "2026-07-07T00:00:00.000Z",
};

describe("Vision provider settings", () => {
  it("defaults to Auto with blank provider overrides", async () => {
    await expect(readVisionProviderSettings(fakeStorage())).resolves.toEqual(
      defaultVisionProviderSettings(),
    );
  });

  it("saves blank overrides as fallback-ready settings", async () => {
    const storage = fakeStorage();

    const settings = await saveVisionProviderSettings(
      {
        provider: "auto",
        gemini: {
          apiKey: "   ",
          model: "",
        },
        openai: {
          apiKey: "",
          model: "   ",
          baseUrl: "",
        },
        openaiCompatible: {
          apiKey: "",
          model: "",
          baseUrl: "",
          providerName: "",
        },
      },
      storage,
    );

    expect(settings.provider).toBe("auto");
    expect(settings.gemini).toEqual({});
    expect(settings.openai).toEqual({});
    expect(settings.openaiCompatible).toEqual({});
    await expect(readVisionProviderSettings(storage)).resolves.toMatchObject({
      provider: "auto",
      gemini: {},
      openai: {},
      openaiCompatible: {},
    });
  });

  it("normalizes stored Vision override fields", async () => {
    const storage = fakeStorage({
      [visionProviderStorageKey]: {
        provider: "openai-compatible",
        gemini: {
          apiKey: " gemini-key ",
          model: " gemini-2.5-pro ",
        },
        openai: {
          apiKey: " openai-key ",
          model: " gpt-vision ",
          baseUrl: " https://api.openai.example.test/v1/ ",
        },
        openaiCompatible: {
          apiKey: " compatible-key ",
          model: " vision-custom ",
          baseUrl: " https://vision.example.test/v1/ ",
          providerName: " local-vision ",
        },
        updatedAt: "2026-07-07T00:00:00.000Z",
      },
    });

    await expect(readVisionProviderSettings(storage)).resolves.toEqual({
      provider: "openai-compatible",
      gemini: {
        apiKey: "gemini-key",
        model: "gemini-2.5-pro",
      },
      openai: {
        apiKey: "openai-key",
        model: "gpt-vision",
        baseUrl: "https://api.openai.example.test/v1",
      },
      openaiCompatible: {
        apiKey: "compatible-key",
        model: "vision-custom",
        baseUrl: "https://vision.example.test/v1",
        providerName: "local-vision",
      },
      updatedAt: "2026-07-07T00:00:00.000Z",
    });
  });

  it("auto-runs through the active provider when no Vision override is configured", () => {
    const resolved = resolveVisionProviderConfig(defaultVisionProviderSettings(), mainOpenAIConfig);

    expect(resolved).toEqual({
      config: mainOpenAIConfig,
      configuredBy: "main-openai",
    });
  });

  it("auto-runs through a filled Vision override before the active provider config", () => {
    const resolved = resolveVisionProviderConfig(
      {
        provider: "auto",
        gemini: {},
        openai: {
          apiKey: "vision-openai-key",
          model: "gpt-vision",
        },
        openaiCompatible: {},
      },
      mainGeminiConfig,
    );

    expect(resolved).toMatchObject({
      config: {
        provider: "openai",
        apiKey: "vision-openai-key",
        model: "gpt-vision",
        baseUrl: defaultOpenAIBaseUrl,
      },
      configuredBy: "vision-openai-override",
    });
  });

  it("uses an explicit OpenAI-compatible Vision override without requiring a main provider", () => {
    const resolved = resolveVisionProviderConfig(
      {
        provider: "openai-compatible",
        gemini: {},
        openai: {},
        openaiCompatible: {
          apiKey: "compatible-vision-key",
          model: "custom-vision",
          baseUrl: "https://vision.example.test/v1",
          providerName: "vision-gateway",
        },
      },
      undefined,
    );

    expect(resolved).toMatchObject({
      config: {
        provider: "openai-compatible",
        apiKey: "compatible-vision-key",
        model: "custom-vision",
        baseUrl: "https://vision.example.test/v1",
        providerName: "vision-gateway",
      },
      configuredBy: "vision-openai-compatible-override",
    });
  });

  it("falls back to OpenAI-compatible defaults when only its Vision key is configured", () => {
    const resolved = resolveVisionProviderConfig(
      {
        provider: "openai-compatible",
        gemini: {},
        openai: {},
        openaiCompatible: {
          apiKey: "compatible-vision-key",
        },
      },
      undefined,
    );

    expect(resolved).toMatchObject({
      config: {
        provider: "openai-compatible",
        apiKey: "compatible-vision-key",
        baseUrl: defaultOpenAICompatibleBaseUrl,
      },
      configuredBy: "vision-openai-compatible-override",
    });
  });

  it("reports setup required when no Vision or main provider config exists", () => {
    expect(() => resolveVisionProviderConfig(defaultVisionProviderSettings(), undefined)).toThrow(
      EngineRpcError,
    );
    try {
      resolveVisionProviderConfig(defaultVisionProviderSettings(), undefined);
    } catch (error) {
      expect(error).toBeInstanceOf(EngineRpcError);
      expect((error as EngineRpcError).code).toBe("VISION_PROVIDER_CONFIG_REQUIRED");
    }
  });
});
