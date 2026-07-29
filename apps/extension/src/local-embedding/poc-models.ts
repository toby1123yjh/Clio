import { recommendedLocalEmbeddingModelManifest } from "./trusted-models";

export type LocalEmbeddingPocModelKey = "granite" | "e5";

export interface LocalEmbeddingPocModel {
  key: LocalEmbeddingPocModelKey;
  repository: string;
  revision: string;
  label: string;
  dimension: number;
  dtype: "int8";
  pooling: "cls" | "mean";
  queryPrefix: string;
  documentPrefix: string;
  expectedModelBytes: number;
}

export const localEmbeddingPocModels: Record<LocalEmbeddingPocModelKey, LocalEmbeddingPocModel> = {
  granite: {
    key: "granite",
    repository: "onnx-community/granite-embedding-97m-multilingual-r2-ONNX",
    revision: "536a9f241cb3f02a9c5995a1e708c784bd274859",
    label: "Granite Embedding 97M Multilingual R2",
    dimension: 384,
    dtype: "int8",
    pooling: "cls",
    queryPrefix: "",
    documentPrefix: "",
    expectedModelBytes: 97_858_099,
  },
  e5: {
    key: "e5",
    repository: recommendedLocalEmbeddingModelManifest.repository,
    revision: recommendedLocalEmbeddingModelManifest.revision,
    label: recommendedLocalEmbeddingModelManifest.label,
    dimension: recommendedLocalEmbeddingModelManifest.dimension,
    dtype: recommendedLocalEmbeddingModelManifest.dtype,
    pooling: recommendedLocalEmbeddingModelManifest.runtime.pooling,
    queryPrefix: recommendedLocalEmbeddingModelManifest.runtime.queryPrefix,
    documentPrefix: recommendedLocalEmbeddingModelManifest.runtime.documentPrefix,
    expectedModelBytes:
      recommendedLocalEmbeddingModelManifest.files.find(
        (file) => file.path === "onnx/model_int8.onnx",
      )?.bytes ?? 0,
  },
};

export interface LocalEmbeddingPocWasmPaths {
  wasm: string;
  mjs: string;
  jsepWasm: string;
  jsepMjs: string;
}

export interface LocalEmbeddingPocRequest {
  kind: "run";
  requestId: string;
  model: LocalEmbeddingPocModel;
  wasmPaths: LocalEmbeddingPocWasmPaths;
}

export interface LocalEmbeddingPocResponse {
  kind: "result";
  requestId: string;
  ok: boolean;
  value?: Record<string, unknown>;
  error?: string;
}

export function isLocalEmbeddingPocModelKey(value: unknown): value is LocalEmbeddingPocModelKey {
  return value === "granite" || value === "e5";
}
