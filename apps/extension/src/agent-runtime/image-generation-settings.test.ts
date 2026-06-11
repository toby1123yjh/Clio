import { describe, expect, it } from "vitest";
import {
  defaultImageGenerationModel,
  defaultImageGenerationSettings,
  defaultImageGenerationSize,
  imageGenerationProviderStorageKey,
  readImageGenerationSettings,
  resolveImageGenerationConfig,
  saveImageGenerationSettings,
} from "./image-generation-settings";
import type { ChromeStorageAreaLike, StoredProviderConfig } from "./provider-settings";

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

const mainCompatibleConfig: StoredProviderConfig = {
  provider: "openai-compatible",
  apiKey: "main-image-key",
  model: "gpt-5.5",
  baseUrl: "https://images.example.test/v1",
  providerName: "custom",
  updatedAt: "2026-06-09T00:00:00.000Z",
};

describe("Image generation settings", () => {
  it("defaults to gpt-image-2-compatible settings without copying provider config", async () => {
    await expect(readImageGenerationSettings(fakeStorage())).resolves.toEqual(
      defaultImageGenerationSettings(),
    );
  });

  it("saves blank overrides as fallback-ready settings", async () => {
    const storage = fakeStorage();

    const settings = await saveImageGenerationSettings(
      {
        apiKey: "",
        model: "   ",
        baseUrl: "",
        size: "1536x1024",
      },
      storage,
    );

    expect(settings).toMatchObject({
      size: "1536x1024",
    });
    expect(settings.apiKey).toBeUndefined();
    expect(settings.model).toBeUndefined();
    expect(settings.baseUrl).toBeUndefined();
    await expect(readImageGenerationSettings(storage)).resolves.toMatchObject({
      size: "1536x1024",
    });
  });

  it("normalizes stored Image Gen override fields", async () => {
    const storage = fakeStorage({
      [imageGenerationProviderStorageKey]: {
        apiKey: " image-key ",
        model: " gpt-image-custom ",
        baseUrl: " https://images.example.test/v1/ ",
        size: "1024x1536",
        updatedAt: "2026-06-09T00:00:00.000Z",
      },
    });

    await expect(readImageGenerationSettings(storage)).resolves.toEqual({
      apiKey: "image-key",
      model: "gpt-image-custom",
      baseUrl: "https://images.example.test/v1",
      size: "1024x1536",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });
  });

  it("falls back to active OpenAI-compatible provider base URL and key", () => {
    const resolved = resolveImageGenerationConfig(
      {
        size: defaultImageGenerationSize,
      },
      mainCompatibleConfig,
    );

    expect(resolved).toMatchObject({
      apiKey: "main-image-key",
      baseUrl: "https://images.example.test/v1",
      model: defaultImageGenerationModel,
      size: defaultImageGenerationSize,
      responseFormat: "b64_json",
      configuredBy: {
        apiKey: "main-provider",
        baseUrl: "main-provider",
        model: "default",
      },
    });
  });

  it("uses Image Gen overrides before main provider fields", () => {
    const resolved = resolveImageGenerationConfig(
      {
        apiKey: "image-key",
        baseUrl: "https://override.example.test/v1",
        model: "gpt-image-custom",
        size: "auto",
      },
      mainCompatibleConfig,
    );

    expect(resolved).toMatchObject({
      apiKey: "image-key",
      baseUrl: "https://override.example.test/v1",
      model: "gpt-image-custom",
      size: "auto",
      configuredBy: {
        apiKey: "image-override",
        baseUrl: "image-override",
        model: "image-override",
      },
    });
  });

  it("reports setup required when no image or OpenAI-compatible config exists", () => {
    const geminiOnly: StoredProviderConfig = {
      provider: "gemini",
      apiKey: "gemini-key",
      model: "gemini-2.5-flash",
      updatedAt: "2026-06-09T00:00:00.000Z",
    };

    expect(() =>
      resolveImageGenerationConfig(defaultImageGenerationSettings(), geminiOnly),
    ).toThrow("Configure Image Gen or an OpenAI-compatible main model");
  });
});
