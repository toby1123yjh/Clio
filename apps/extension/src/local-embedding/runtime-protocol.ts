import type { LocalEmbeddingBackend, LocalEmbeddingPurpose } from "./contracts";
import type { LocalEmbeddingPocWasmPaths } from "./poc-models";

export interface LocalEmbeddingRuntimeLoadRequest {
  kind: "load";
  requestId: string;
  modelId: string;
  backend: LocalEmbeddingBackend;
  wasmPaths: LocalEmbeddingPocWasmPaths;
}

export interface LocalEmbeddingRuntimeEmbedRequest {
  kind: "embed";
  requestId: string;
  modelId: string;
  purpose: LocalEmbeddingPurpose;
  inputs: string[];
}

export interface LocalEmbeddingRuntimeCancelRequest {
  kind: "cancel";
  requestId: string;
  targetRequestId: string;
}

export interface LocalEmbeddingRuntimeDisposeRequest {
  kind: "dispose";
  requestId: string;
}

export type LocalEmbeddingRuntimeRequest =
  | LocalEmbeddingRuntimeLoadRequest
  | LocalEmbeddingRuntimeEmbedRequest
  | LocalEmbeddingRuntimeCancelRequest
  | LocalEmbeddingRuntimeDisposeRequest;

export interface LocalEmbeddingRuntimeResponse {
  kind: "result";
  requestId: string;
  ok: boolean;
  value?: unknown;
  error?: {
    code: string;
    message: string;
  };
}

export function isLocalEmbeddingRuntimeRequest(
  value: unknown,
): value is LocalEmbeddingRuntimeRequest {
  if (!isRecord(value) || typeof value.kind !== "string" || !isRequestId(value.requestId)) {
    return false;
  }
  switch (value.kind) {
    case "load":
      return (
        typeof value.modelId === "string" &&
        value.modelId.length > 0 &&
        (value.backend === "webgpu" || value.backend === "wasm") &&
        isWasmPaths(value.wasmPaths)
      );
    case "embed":
      return (
        typeof value.modelId === "string" &&
        value.modelId.length > 0 &&
        (value.purpose === "query" || value.purpose === "document") &&
        Array.isArray(value.inputs) &&
        value.inputs.every((input) => typeof input === "string")
      );
    case "cancel":
      return isRequestId(value.targetRequestId);
    case "dispose":
      return true;
    default:
      return false;
  }
}

export function isLocalEmbeddingRuntimeResponse(
  value: unknown,
): value is LocalEmbeddingRuntimeResponse {
  return (
    isRecord(value) &&
    value.kind === "result" &&
    isRequestId(value.requestId) &&
    typeof value.ok === "boolean" &&
    (value.error === undefined ||
      (isRecord(value.error) &&
        typeof value.error.code === "string" &&
        typeof value.error.message === "string"))
  );
}

function isWasmPaths(value: unknown): value is LocalEmbeddingPocWasmPaths {
  return (
    isRecord(value) &&
    typeof value.wasm === "string" &&
    typeof value.mjs === "string" &&
    typeof value.jsepWasm === "string" &&
    typeof value.jsepMjs === "string"
  );
}

function isRequestId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
