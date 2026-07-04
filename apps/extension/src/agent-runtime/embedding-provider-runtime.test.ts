import { describe, expect, it } from "vitest";
import { ClioEmbeddingProviderRuntime } from "./embedding-provider-runtime";
import {
  type EmbeddingProviderSettings,
  resolveEmbeddingRuntimeConfig,
} from "./embedding-provider-settings";

const baseSettings: EmbeddingProviderSettings = {
  activeProvider: "openai",
  openai: {
    provider: "openai",
    apiKey: "embedding-key",
    apiKeyConfigured: true,
    hostPermissionGranted: true,
    model: "text-embedding-3-small",
    baseUrl: "https://api.openai.example.test/v1",
  },
  openaiCompatible: {
    provider: "openai-compatible",
    apiKeyConfigured: false,
    hostPermissionGranted: true,
    model: "embed-custom",
    baseUrl: "https://embeddings.example.test/v1",
    providerName: "custom",
  },
};

function embeddingsResponse(vectors: number[][], status = 200) {
  return new Response(
    JSON.stringify({
      data: vectors.map((embedding, index) => ({ index, embedding })),
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function createRuntime(options: {
  settings?: EmbeddingProviderSettings;
  fetchFn: typeof fetch;
  permissionGranted?: boolean;
}) {
  return new ClioEmbeddingProviderRuntime({
    async loadEmbeddingProviderSettings() {
      return options.settings ?? baseSettings;
    },
    async ensureOpenAIHostPermission() {
      return options.permissionGranted ?? true;
    },
    async ensureOpenAICompatibleHostPermission() {
      return options.permissionGranted ?? true;
    },
    fetchFn: options.fetchFn,
  });
}

describe("ClioEmbeddingProviderRuntime", () => {
  it("tests OpenAI embeddings by calling /embeddings and inferring dimension", async () => {
    let requestedUrl = "";
    let requestedBody: unknown;
    let authorization = "";
    const fetchFn: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedBody = JSON.parse(String(init?.body)) as unknown;
      authorization = String((init?.headers as Record<string, string> | undefined)?.Authorization);
      return embeddingsResponse([[0.1, 0.2, 0.3]]);
    };

    const result = await createRuntime({ fetchFn }).testEmbeddingProvider();

    expect(requestedUrl).toBe("https://api.openai.example.test/v1/embeddings");
    expect(authorization).toBe("Bearer embedding-key");
    expect(requestedBody).toEqual({
      model: "text-embedding-3-small",
      input: ["Clio embedding provider connection test."],
    });
    expect(result).toMatchObject({
      ok: true,
      provider: "openai",
      model: "text-embedding-3-small",
      baseUrl: "https://api.openai.example.test/v1",
      dimension: 3,
      label: "OpenAI Embeddings text-embedding-3-small (3d)",
    });
    expect(result.modelId).toMatch(/^openai:[a-f0-9]+:text-embedding-3-small:d3$/);
  });

  it("embeds batches only for the active model id and checks dimension", async () => {
    let requestedBody: unknown;
    const settings: EmbeddingProviderSettings = {
      ...baseSettings,
      openai: {
        ...baseSettings.openai,
        dimension: 3,
      },
    };
    const runtime = createRuntime({
      settings,
      fetchFn: (async (_input, init) => {
        requestedBody = JSON.parse(String(init?.body)) as unknown;
        return embeddingsResponse([
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
        ]);
      }) as typeof fetch,
    });
    const modelId = resolveEmbeddingRuntimeConfig(settings).modelId;

    const vectors = await runtime.embedTexts(modelId, [" first chunk ", "second chunk"]);

    expect(requestedBody).toEqual({
      model: "text-embedding-3-small",
      input: ["first chunk", "second chunk"],
    });
    expect(vectors).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
  });

  it("fails safely when host permission is unavailable", async () => {
    let fetchCalled = false;
    const runtime = createRuntime({
      permissionGranted: false,
      fetchFn: (async () => {
        fetchCalled = true;
        return embeddingsResponse([[0.1]]);
      }) as typeof fetch,
    });

    await expect(runtime.testEmbeddingProvider()).rejects.toMatchObject({
      code: "PROVIDER_PERMISSION_REQUIRED",
    });
    expect(fetchCalled).toBe(false);
  });

  it("rejects malformed embedding payloads", async () => {
    const runtime = createRuntime({
      fetchFn: (async () =>
        new Response(JSON.stringify({ data: [{ object: "embedding" }] }), {
          status: 200,
        })) as typeof fetch,
    });

    await expect(runtime.testEmbeddingProvider()).rejects.toMatchObject({
      code: "MALFORMED_EMBEDDING_RESPONSE",
    });
  });

  it("rejects dimension mismatch for runtime embedding", async () => {
    const settings: EmbeddingProviderSettings = {
      ...baseSettings,
      openai: {
        ...baseSettings.openai,
        dimension: 4,
      },
    };
    const runtime = createRuntime({
      settings,
      fetchFn: (async () => embeddingsResponse([[0.1, 0.2, 0.3]])) as typeof fetch,
    });

    await expect(
      runtime.embedTexts(resolveEmbeddingRuntimeConfig(settings).modelId, ["chunk"]),
    ).rejects.toMatchObject({
      code: "EMBEDDING_DIMENSION_MISMATCH",
    });
  });
});
