import { EngineRpcError } from "../shared/rpc";
import {
  type EmbeddingProviderSettings,
  type EmbeddingProviderTestResult,
  type ResolvedEmbeddingRuntimeConfig,
  type ResolvedEmbeddingTestConfig,
  deriveEmbeddingModelId,
  resolveEmbeddingRuntimeConfig,
  resolveEmbeddingTestConfig,
} from "./embedding-provider-settings";

export const embeddingProviderTestInput = "Clio embedding provider connection test.";

export interface ClioEmbeddingProviderRuntimeOptions {
  loadEmbeddingProviderSettings: () => Promise<EmbeddingProviderSettings>;
  ensureOpenAIHostPermission: (baseUrl: string) => Promise<boolean>;
  ensureOpenAICompatibleHostPermission: (baseUrl: string) => Promise<boolean>;
  fetchFn?: typeof fetch;
}

export class ClioEmbeddingProviderRuntime {
  private readonly loadEmbeddingProviderSettings: () => Promise<EmbeddingProviderSettings>;
  private readonly ensureOpenAIHostPermission: (baseUrl: string) => Promise<boolean>;
  private readonly ensureOpenAICompatibleHostPermission: (baseUrl: string) => Promise<boolean>;
  private readonly fetchFn: typeof fetch;

  constructor(options: ClioEmbeddingProviderRuntimeOptions) {
    this.loadEmbeddingProviderSettings = options.loadEmbeddingProviderSettings;
    this.ensureOpenAIHostPermission = options.ensureOpenAIHostPermission;
    this.ensureOpenAICompatibleHostPermission = options.ensureOpenAICompatibleHostPermission;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async testEmbeddingProvider(
    options: { signal?: AbortSignal } = {},
  ): Promise<EmbeddingProviderTestResult> {
    const config = resolveEmbeddingTestConfig(await this.loadEmbeddingProviderSettings());
    await this.requireHostPermission(config);
    const [vector] = await requestEmbeddingVectors(
      config,
      [embeddingProviderTestInput],
      this.fetchFn,
      options.signal,
    );
    if (vector === undefined) {
      throw new EngineRpcError(
        "MALFORMED_EMBEDDING_RESPONSE",
        "Embedding provider did not return a test vector.",
      );
    }
    const dimension = vector.length;
    const modelId = deriveEmbeddingModelId({ ...config, dimension });
    return {
      ok: true,
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      ...(config.providerName === undefined ? {} : { providerName: config.providerName }),
      dimension,
      modelId,
      label: `${config.providerLabel} ${config.model} (${dimension}d)`,
      testedAt: new Date().toISOString(),
    };
  }

  async embedTexts(
    modelId: string,
    inputs: string[],
    options: { signal?: AbortSignal } = {},
  ): Promise<number[][]> {
    const config = resolveEmbeddingRuntimeConfig(await this.loadEmbeddingProviderSettings());
    if (config.modelId !== modelId) {
      throw new EngineRpcError(
        "EMBEDDING_MODEL_MISMATCH",
        "Active embedding provider does not match the requested model space.",
      );
    }
    await this.requireHostPermission(config);
    return requestEmbeddingVectors(config, inputs, this.fetchFn, options.signal);
  }

  private async requireHostPermission(config: ResolvedEmbeddingTestConfig) {
    const granted =
      config.provider === "openai-compatible"
        ? await this.ensureOpenAICompatibleHostPermission(config.baseUrl)
        : await this.ensureOpenAIHostPermission(config.baseUrl);
    if (!granted) {
      throw new EngineRpcError(
        "PROVIDER_PERMISSION_REQUIRED",
        `${config.providerLabel} host access is unavailable in this extension build.`,
      );
    }
  }
}

export async function requestEmbeddingVectors(
  config: ResolvedEmbeddingTestConfig | ResolvedEmbeddingRuntimeConfig,
  inputs: string[],
  fetchFn: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<number[][]> {
  const normalizedInputs = inputs.map((input) => input.trim());
  if (normalizedInputs.length === 0 || normalizedInputs.some((input) => input.length === 0)) {
    throw new EngineRpcError("EMPTY_EMBEDDING_INPUT", "Embedding input must not be empty.");
  }

  const response = await fetchFn(`${apiBase(config.baseUrl)}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      input: normalizedInputs,
    }),
    signal,
  });
  return parseEmbeddingResponse(response, normalizedInputs.length, config);
}

async function parseEmbeddingResponse(
  response: Response,
  expectedCount: number,
  config: ResolvedEmbeddingTestConfig | ResolvedEmbeddingRuntimeConfig,
) {
  const text = await safeReadText(response);
  if (!response.ok) {
    throw new EngineRpcError(
      response.status === 401 || response.status === 403
        ? "PROVIDER_AUTH_ERROR"
        : response.status === 429
          ? "PROVIDER_RATE_LIMIT"
          : "PROVIDER_ERROR",
      `${config.providerLabel} failed with HTTP ${response.status}.`,
      text,
    );
  }

  const payload = safeJsonParse(text);
  if (!isRecord(payload) || !Array.isArray(payload.data) || payload.data.length !== expectedCount) {
    throw new EngineRpcError(
      "MALFORMED_EMBEDDING_RESPONSE",
      "Embedding provider did not return one vector for each input.",
    );
  }

  const vectors = payload.data.map((item) => {
    if (!isRecord(item) || !Array.isArray(item.embedding)) return undefined;
    if (!item.embedding.every((value) => typeof value === "number" && Number.isFinite(value))) {
      return undefined;
    }
    return item.embedding;
  });
  if (vectors.some((vector) => vector === undefined)) {
    throw new EngineRpcError(
      "MALFORMED_EMBEDDING_RESPONSE",
      "Embedding provider returned a malformed vector payload.",
    );
  }

  const firstDimension = vectors[0]?.length;
  if (firstDimension === undefined || firstDimension <= 0) {
    throw new EngineRpcError(
      "MALFORMED_EMBEDDING_RESPONSE",
      "Embedding provider returned an empty vector.",
    );
  }
  if (vectors.some((vector) => vector?.length !== firstDimension)) {
    throw new EngineRpcError(
      "EMBEDDING_DIMENSION_MISMATCH",
      "Embedding provider returned inconsistent vector dimensions.",
    );
  }
  if ("dimension" in config && config.dimension !== firstDimension) {
    throw new EngineRpcError(
      "EMBEDDING_DIMENSION_MISMATCH",
      "Embedding provider returned a vector dimension that does not match the active model.",
    );
  }

  return vectors as number[][];
}

function apiBase(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

async function safeReadText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
