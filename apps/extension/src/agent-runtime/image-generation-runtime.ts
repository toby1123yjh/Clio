import type {
  ClioImageGenerationEvent,
  ClioImageGenerationRequest,
  ClioImageGenerationResult,
  ClioImageInput,
} from "../shared/rpc";
import { EngineRpcError } from "../shared/rpc";
import {
  type ImageGenerationSettings,
  resolveImageGenerationConfig,
} from "./image-generation-settings";
import { classifyProviderError } from "./provider-errors";
import type { StoredProviderConfig } from "./provider-settings";

export interface ClioImageGenerationRuntimeOptions {
  loadImageGenerationSettings: () => Promise<ImageGenerationSettings>;
  loadActiveProviderConfig: () => Promise<StoredProviderConfig | undefined>;
  ensureImageHostPermission: (baseUrl: string) => Promise<boolean>;
  fetchFn?: typeof fetch;
}

export class ClioImageGenerationRuntime {
  private readonly loadImageGenerationSettings: () => Promise<ImageGenerationSettings>;
  private readonly loadActiveProviderConfig: () => Promise<StoredProviderConfig | undefined>;
  private readonly ensureImageHostPermission: (baseUrl: string) => Promise<boolean>;
  private readonly fetchFn: typeof fetch;

  constructor(options: ClioImageGenerationRuntimeOptions) {
    this.loadImageGenerationSettings = options.loadImageGenerationSettings;
    this.loadActiveProviderConfig = options.loadActiveProviderConfig;
    this.ensureImageHostPermission = options.ensureImageHostPermission;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async *generateImage(
    request: ClioImageGenerationRequest,
    options: { signal?: AbortSignal } = {},
  ): AsyncIterable<ClioImageGenerationEvent> {
    const prompt = request.prompt.trim();
    if (prompt.length === 0) {
      yield failedEvent(
        request.runId,
        new EngineRpcError("EMPTY_IMAGE_PROMPT", "Enter an image prompt first."),
      );
      return;
    }

    try {
      const imageSettings = await this.loadImageGenerationSettings();
      const activeConfig = await this.loadActiveProviderConfig();
      const config = resolveImageGenerationConfig(imageSettings, activeConfig);
      if (!(await this.ensureImageHostPermission(config.baseUrl))) {
        throw new EngineRpcError(
          "PROVIDER_PERMISSION_REQUIRED",
          "Image provider host access is unavailable in this extension build.",
        );
      }

      yield {
        type: "started",
        runId: request.runId,
        mode: request.mode,
        prompt,
        provider: "Image Gen",
        model: config.model,
        size: config.size,
        createdAt: request.createdAt,
      };

      const result = await requestImage2(request, config, this.fetchFn, options.signal);
      yield {
        type: "completed",
        runId: request.runId,
        result,
      };
    } catch (error) {
      if (isAbortError(error)) {
        yield { type: "cancelled", runId: request.runId, reason: "Image generation cancelled." };
        return;
      }
      yield failedEvent(request.runId, error);
    }
  }
}

interface Image2Config {
  apiKey: string;
  baseUrl: string;
  model: string;
  size: string;
  responseFormat: "b64_json";
}

async function requestImage2(
  request: ClioImageGenerationRequest,
  config: Image2Config,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<ClioImageGenerationResult> {
  if (request.mode === "edit") {
    return requestImageEdit(request, config, fetchFn, signal);
  }
  return requestImageGeneration(request, config, fetchFn, signal);
}

async function requestImageGeneration(
  request: ClioImageGenerationRequest,
  config: Image2Config,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<ClioImageGenerationResult> {
  const response = await fetchFn(`${apiBase(config.baseUrl)}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      prompt: request.prompt.trim(),
      size: config.size,
      response_format: config.responseFormat,
    }),
    signal,
  });
  const output = await parseImage2Response(response);
  return completedResult(request, config, output);
}

async function requestImageEdit(
  request: ClioImageGenerationRequest,
  config: Image2Config,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
): Promise<ClioImageGenerationResult> {
  if (request.input === undefined) {
    throw new EngineRpcError("IMAGE_INPUT_REQUIRED", "Add a reference image before editing.");
  }

  const image = await resolveInputImage(request.input, fetchFn, signal);
  const formData = new FormData();
  formData.append("model", config.model);
  formData.append("prompt", request.prompt.trim());
  formData.append("size", config.size);
  formData.append("response_format", config.responseFormat);
  formData.append("image", image.blob, image.name);

  const response = await fetchFn(`${apiBase(config.baseUrl)}/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: formData,
    signal,
  });
  const output = await parseImage2Response(response);
  return completedResult(request, config, output);
}

async function parseImage2Response(response: Response) {
  if (!response.ok) {
    throw new EngineRpcError(
      response.status === 401 || response.status === 403
        ? "PROVIDER_AUTH_ERROR"
        : response.status === 429
          ? "PROVIDER_RATE_LIMIT"
          : "PROVIDER_ERROR",
      `Image generation failed with HTTP ${response.status}.`,
      await safeReadText(response),
    );
  }

  const payload = safeJsonParse(await safeReadText(response));
  const first = firstImageData(payload);
  const b64Json = typeof first?.b64_json === "string" ? first.b64_json : undefined;
  if (b64Json === undefined || b64Json.trim().length === 0) {
    throw new EngineRpcError(
      "MALFORMED_IMAGE_RESPONSE",
      "Image provider did not return data[0].b64_json.",
    );
  }
  const mimeType = detectMimeFromBase64(b64Json) ?? "image/png";
  return {
    mimeType,
    b64Json,
    dataUrl: `data:${mimeType};base64,${b64Json}`,
  };
}

function completedResult(
  request: ClioImageGenerationRequest,
  config: Image2Config,
  output: ClioImageGenerationResult["output"],
): ClioImageGenerationResult {
  return {
    id: `image_${request.runId}`,
    runId: request.runId,
    mode: request.mode,
    prompt: request.prompt.trim(),
    model: config.model,
    size: config.size,
    provider: "Image Gen",
    createdAt: request.createdAt,
    completedAt: new Date().toISOString(),
    output,
    ...(request.input === undefined ? {} : { input: request.input }),
  };
}

async function resolveInputImage(
  input: ClioImageInput,
  fetchFn: typeof fetch,
  signal?: AbortSignal,
) {
  if (input.kind === "data_url") {
    return dataUrlToBlob(input.value, input.name);
  }
  if (input.kind === "base64") {
    const mimeType = input.mimeType ?? detectMimeFromBase64(input.value) ?? "image/png";
    return {
      blob: base64ToBlob(input.value, mimeType),
      name: input.name ?? defaultImageName(mimeType),
    };
  }
  if (input.kind === "url") {
    if (!isHttpUrl(input.value)) {
      throw new EngineRpcError("UNSUPPORTED_IMAGE_INPUT", "Image URL must use HTTP or HTTPS.");
    }
    const response = await fetchFn(input.value, { signal });
    if (!response.ok) {
      throw new EngineRpcError(
        "IMAGE_INPUT_FETCH_FAILED",
        `Could not load reference image: HTTP ${response.status}.`,
        await safeReadText(response),
      );
    }
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    return {
      blob: await response.blob(),
      name: input.name ?? defaultImageName(mimeType),
    };
  }
  throw new EngineRpcError("UNSUPPORTED_IMAGE_INPUT", "Unsupported reference image input.");
}

function dataUrlToBlob(value: string, name?: string) {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(value.trim());
  if (match === null) {
    throw new EngineRpcError(
      "UNSUPPORTED_IMAGE_INPUT",
      "Reference image data URL must be base64 encoded.",
    );
  }
  const mimeType = match[1] || "image/png";
  return {
    blob: base64ToBlob(match[2] ?? "", mimeType),
    name: name ?? defaultImageName(mimeType),
  };
}

function base64ToBlob(value: string, mimeType: string) {
  const cleaned = value.replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function failedEvent(runId: string, error: unknown): ClioImageGenerationEvent {
  if (error instanceof EngineRpcError) {
    return {
      type: "failed",
      runId,
      error: {
        code: error.code,
        message: error.message,
        detail: error.detail,
      },
    };
  }
  const info = classifyProviderError(error, "Image generation");
  return {
    type: "failed",
    runId,
    error: info,
  };
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

function firstImageData(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || !Array.isArray(value.data)) return undefined;
  const [first] = value.data;
  return isRecord(first) ? first : undefined;
}

function detectMimeFromBase64(value: string) {
  const cleaned = value.replace(/\s+/g, "");
  if (cleaned.startsWith("iVBORw0KGgo")) return "image/png";
  if (cleaned.startsWith("/9j/")) return "image/jpeg";
  if (cleaned.startsWith("UklGR")) return "image/webp";
  if (cleaned.startsWith("R0lGOD")) return "image/gif";
  return undefined;
}

function defaultImageName(mimeType: string) {
  const extension = mimeType.includes("jpeg")
    ? "jpg"
    : mimeType.includes("webp")
      ? "webp"
      : mimeType.includes("gif")
        ? "gif"
        : "png";
  return `reference.${extension}`;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
