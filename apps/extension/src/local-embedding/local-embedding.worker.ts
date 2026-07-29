import { env, pipeline } from "@huggingface/transformers";
import type { LocalEmbeddingBackend, LocalEmbeddingModelManifest } from "./contracts";
import { LocalEmbeddingModelInstaller } from "./model-installer";
import { localEmbeddingTransformersModelPath } from "./opfs-model-store";
import type { LocalEmbeddingPocWasmPaths } from "./poc-models";
import {
  type LocalEmbeddingPipeline,
  LocalEmbeddingPipelineRuntime,
  LocalEmbeddingRuntimeError,
} from "./runtime-core";
import {
  type LocalEmbeddingRuntimeRequest,
  type LocalEmbeddingRuntimeResponse,
  isLocalEmbeddingRuntimeRequest,
} from "./runtime-protocol";
import { getTrustedLocalEmbeddingModelManifest } from "./trusted-models";

let runtime: LocalEmbeddingPipelineRuntime | undefined;
const cancelledRequests = new Set<string>();

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  const request = event.data;
  if (!isLocalEmbeddingRuntimeRequest(request)) return;
  if (request.kind === "cancel") {
    cancelledRequests.add(request.targetRequestId);
    postResult(request.requestId, { cancelled: true });
    return;
  }
  void handleRequest(request)
    .then((value) => postResult(request.requestId, value))
    .catch((error) => postError(request.requestId, error));
});

async function handleRequest(request: Exclude<LocalEmbeddingRuntimeRequest, { kind: "cancel" }>) {
  switch (request.kind) {
    case "load": {
      const manifest = getTrustedLocalEmbeddingModelManifest(request.modelId);
      if (manifest === undefined) {
        throw runtimeError("LOCAL_EMBEDDING_MODEL_MISMATCH", "Unknown local embedding model.");
      }
      await runtime?.dispose();
      await configureTransformers(request.backend, request.wasmPaths, manifest);
      runtime = new LocalEmbeddingPipelineRuntime(manifest, request.backend, createPipeline);
      await runtime.load();
      return { modelId: manifest.modelId, backend: request.backend, ready: true };
    }
    case "embed": {
      if (runtime === undefined || runtime.manifest.modelId !== request.modelId) {
        throw runtimeError(
          "LOCAL_EMBEDDING_MODEL_MISMATCH",
          "Loaded local embedding model does not match the request.",
        );
      }
      try {
        return await runtime.embed(request.purpose, request.inputs, () =>
          cancelledRequests.has(request.requestId),
        );
      } finally {
        cancelledRequests.delete(request.requestId);
      }
    }
    case "dispose":
      await runtime?.dispose();
      runtime = undefined;
      return { disposed: true };
  }
}

async function configureTransformers(
  backend: LocalEmbeddingBackend,
  paths: LocalEmbeddingPocWasmPaths,
  manifest: LocalEmbeddingModelManifest,
) {
  env.allowRemoteModels = false;
  // Transformers.js requires local model resolution to be enabled before it checks custom caches.
  env.allowLocalModels = true;
  env.useBrowserCache = false;
  env.useFSCache = false;
  env.useCustomCache = true;
  env.localModelPath = localEmbeddingTransformersModelPath;
  const runtimeCache = new LocalEmbeddingModelInstaller().runtimeCache(manifest);
  env.customCache = runtimeCache;
  env.useWasmCache = false;
  const configFile = manifest.files.find((file) => file.path === "config.json");
  const configCacheKey =
    configFile === undefined
      ? undefined
      : `${localEmbeddingTransformersModelPath}${manifest.repository}/${configFile.path}`;
  if (configCacheKey === undefined || (await runtimeCache.match(configCacheKey)) === undefined) {
    throw runtimeError(
      "LOCAL_EMBEDDING_NOT_LOADED",
      "Installed local embedding model files are unavailable to the runtime cache.",
    );
  }
  const wasm = env.backends.onnx.wasm;
  if (wasm === undefined) throw new Error("ONNX Runtime WASM environment is unavailable.");
  Object.assign(wasm, {
    numThreads: Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)),
    wasmPaths:
      backend === "webgpu"
        ? { wasm: paths.jsepWasm, mjs: paths.jsepMjs }
        : { wasm: paths.wasm, mjs: paths.mjs },
  });
}

async function createPipeline(
  manifest: LocalEmbeddingModelManifest,
  backend: LocalEmbeddingBackend,
) {
  return pipeline("feature-extraction", manifest.repository, {
    revision: manifest.revision,
    dtype: manifest.dtype,
    device: backend,
    local_files_only: true,
  }) as Promise<LocalEmbeddingPipeline>;
}

function runtimeError(code: LocalEmbeddingRuntimeError["code"], message: string) {
  return new LocalEmbeddingRuntimeError(code, message);
}

function postResult(requestId: string, value: unknown) {
  postResponse({ kind: "result", requestId, ok: true, value });
}

function postError(requestId: string, error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : "LOCAL_EMBEDDING_RUNTIME_ERROR";
  const message = error instanceof Error ? error.message : String(error);
  postResponse({
    kind: "result",
    requestId,
    ok: false,
    error: { code, message: message.slice(0, 500) },
  });
}

function postResponse(response: LocalEmbeddingRuntimeResponse) {
  self.postMessage(response);
}
