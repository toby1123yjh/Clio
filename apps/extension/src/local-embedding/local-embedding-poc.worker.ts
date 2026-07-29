import { env, pipeline } from "@huggingface/transformers";
import type {
  LocalEmbeddingPocModel,
  LocalEmbeddingPocRequest,
  LocalEmbeddingPocResponse,
  LocalEmbeddingPocWasmPaths,
} from "./poc-models";

type EmbeddingTensor = {
  data: ArrayLike<number>;
  dims: number[];
  dispose?: () => void;
};

type EmbeddingPipeline = {
  (
    inputs: string | string[],
    options: { pooling: "cls" | "mean"; normalize: true },
  ): Promise<EmbeddingTensor>;
  dispose: () => Promise<void>;
};

type ProgressEvent = Record<string, unknown>;

interface ProgressSummary {
  files: Map<string, { loaded: number; total: number }>;
  events: number;
}

const retrievalFixtures = [
  {
    id: "english-to-japanese",
    query: "What is the tallest mountain in Japan?",
    documents: [
      "富士山は日本で最も高い山で、標高は3776メートルです。",
      "Berlin is the capital and largest city of Germany.",
      "Achy Breaky Heart was written by Don Von Tress.",
    ],
    expectedIndex: 0,
  },
  {
    id: "chinese-semantic",
    query: "哪种技术能在本地根据含义相似度查找笔记内容？",
    documents: [
      "向量嵌入会把文本分块转换为数字表示，再按余弦相似度召回相关证据。",
      "PDF 阅读器可以显示页码并缩放页面。",
      "浏览器书签用于保存常用网站地址。",
    ],
    expectedIndex: 0,
  },
  {
    id: "cross-language-browser-memory",
    query: "private browser memory retrieval without an API key",
    documents: [
      "在浏览器中运行本地嵌入模型，可以不使用 API Key 检索私人记忆。",
      "云端图像生成通常需要远程模型服务。",
      "A relational database uses tables, rows, and columns.",
    ],
    expectedIndex: 0,
  },
] as const;

self.addEventListener("message", (event: MessageEvent<LocalEmbeddingPocRequest>) => {
  if (event.data.kind !== "run") return;
  void runPoc(event.data)
    .then((value) =>
      postResponse({
        kind: "result",
        requestId: event.data.requestId,
        ok: true,
        value,
      }),
    )
    .catch((error) =>
      postResponse({
        kind: "result",
        requestId: event.data.requestId,
        ok: false,
        error: boundedError(error),
      }),
    );
});

async function runPoc(request: LocalEmbeddingPocRequest) {
  configureTransformers(request.wasmPaths, "wasm");
  const coldProgress = createProgressSummary();
  const coldStarted = performance.now();
  let extractor = await createPipeline(request.model, "wasm", coldProgress);
  const coldLoadMs = performance.now() - coldStarted;

  try {
    const inference = await runInferenceGate(extractor, request.model);
    await extractor.dispose();

    configureTransformers(request.wasmPaths, "wasm");
    const warmProgress = createProgressSummary();
    const warmStarted = performance.now();
    extractor = await createPipeline(request.model, "wasm", warmProgress);
    const warmLoadMs = performance.now() - warmStarted;
    const warmRepeat = await embed(extractor, request.model, "query", [retrievalFixtures[0].query]);
    assertVectors(warmRepeat, request.model.dimension, 1);
    await extractor.dispose();

    const acceleration = await runAccelerationProbe(request.model, request.wasmPaths);
    return {
      status: inference.retrieval.every((fixture) => fixture.passed) ? "pass" : "fail",
      model: request.model,
      browser: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      hasWebGpu: "gpu" in navigator,
      coldLoadMs: roundMs(coldLoadMs),
      warmLoadMs: roundMs(warmLoadMs),
      coldProgress: summarizeProgress(coldProgress),
      warmProgress: summarizeProgress(warmProgress),
      inference,
      acceleration,
    };
  } finally {
    await extractor.dispose().catch(() => undefined);
  }
}

async function runInferenceGate(extractor: EmbeddingPipeline, model: LocalEmbeddingPocModel) {
  const singleStarted = performance.now();
  const first = await embed(extractor, model, "query", [retrievalFixtures[0].query]);
  const singleLatencyMs = performance.now() - singleStarted;
  assertVectors(first, model.dimension, 1);

  const repeat = await embed(extractor, model, "query", [retrievalFixtures[0].query]);
  assertVectors(repeat, model.dimension, 1);
  const repeatedCosine = cosine(first[0] ?? [], repeat[0] ?? []);
  assert(repeatedCosine > 0.9999, `Repeated inference cosine was ${repeatedCosine}.`);

  const batchInputs = Array.from({ length: 8 }, (_, index) => {
    const fixture = retrievalFixtures[index % retrievalFixtures.length] ?? retrievalFixtures[0];
    return `${fixture.query} sample ${index}`;
  });
  const batchStarted = performance.now();
  const batch = await embed(extractor, model, "query", batchInputs);
  const batch8LatencyMs = performance.now() - batchStarted;
  assertVectors(batch, model.dimension, 8);

  const retrieval = [];
  for (const fixture of retrievalFixtures) {
    const [queryVector] = await embed(extractor, model, "query", [fixture.query]);
    const documentVectors = await embed(extractor, model, "document", [...fixture.documents]);
    assertVectors(documentVectors, model.dimension, fixture.documents.length);
    const scores = documentVectors.map((vector) => cosine(queryVector ?? [], vector));
    const topIndex = scores.reduce(
      (best, score, index) => (score > (scores[best] ?? Number.NEGATIVE_INFINITY) ? index : best),
      0,
    );
    retrieval.push({
      id: fixture.id,
      expectedIndex: fixture.expectedIndex,
      topIndex,
      passed: topIndex === fixture.expectedIndex,
      scores: scores.map((score) => Number(score.toFixed(6))),
    });
  }

  return {
    dimension: first[0]?.length,
    norm: Number(l2Norm(first[0] ?? []).toFixed(6)),
    repeatedCosine: Number(repeatedCosine.toFixed(6)),
    singleLatencyMs: roundMs(singleLatencyMs),
    batch8LatencyMs: roundMs(batch8LatencyMs),
    retrieval,
  };
}

async function runAccelerationProbe(
  model: LocalEmbeddingPocModel,
  wasmPaths: LocalEmbeddingPocWasmPaths,
) {
  if (!("gpu" in navigator)) {
    return {
      attemptedBackend: "webgpu",
      selectedBackend: "wasm",
      fallbackReason: "navigator.gpu is unavailable",
    };
  }

  let extractor: EmbeddingPipeline | undefined;
  try {
    configureTransformers(wasmPaths, "webgpu");
    const started = performance.now();
    extractor = await createPipeline(model, "webgpu", createProgressSummary());
    const vectors = await embed(extractor, model, "query", [retrievalFixtures[0].query]);
    assertVectors(vectors, model.dimension, 1);
    return {
      attemptedBackend: "webgpu",
      selectedBackend: "webgpu",
      loadAndSmokeMs: roundMs(performance.now() - started),
    };
  } catch (error) {
    await extractor?.dispose().catch(() => undefined);
    return {
      attemptedBackend: "webgpu",
      selectedBackend: "wasm",
      fallbackReason: boundedError(error),
      fallbackVerifiedByPrimaryWasmGate: true,
      fallbackStrategy: "terminate the failed WebGPU worker and create a fresh WASM worker",
    };
  } finally {
    await extractor?.dispose().catch(() => undefined);
  }
}

async function createPipeline(
  model: LocalEmbeddingPocModel,
  device: "wasm" | "webgpu",
  progress: ProgressSummary,
) {
  return pipeline("feature-extraction", model.repository, {
    revision: model.revision,
    dtype: model.dtype,
    device,
    progress_callback: (event) => recordProgress(progress, event as ProgressEvent),
  }) as Promise<EmbeddingPipeline>;
}

async function embed(
  extractor: EmbeddingPipeline,
  model: LocalEmbeddingPocModel,
  purpose: "query" | "document",
  inputs: string[],
) {
  const prefix = purpose === "query" ? model.queryPrefix : model.documentPrefix;
  const tensor = await extractor(
    inputs.map((input) => `${prefix}${input}`),
    { pooling: model.pooling, normalize: true },
  );
  try {
    const data = Array.from(tensor.data, Number);
    const dimension = tensor.dims.at(-1) ?? 0;
    assert(dimension > 0, "Embedding tensor did not expose a final dimension.");
    return Array.from({ length: inputs.length }, (_, index) =>
      data.slice(index * dimension, (index + 1) * dimension),
    );
  } finally {
    tensor.dispose?.();
  }
}

function configureTransformers(paths: LocalEmbeddingPocWasmPaths, backend: "wasm" | "webgpu") {
  env.allowRemoteModels = true;
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.useCustomCache = false;
  env.useWasmCache = false;
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

function assertVectors(vectors: number[][], dimension: number, count: number) {
  assert(vectors.length === count, `Expected ${count} vectors, received ${vectors.length}.`);
  for (const vector of vectors) {
    assert(vector.length === dimension, `Expected ${dimension} dimensions, got ${vector.length}.`);
    assert(vector.every(Number.isFinite), "Embedding vector contains a non-finite value.");
    const norm = l2Norm(vector);
    assert(Math.abs(norm - 1) < 0.001, `Embedding vector L2 norm was ${norm}.`);
  }
}

function createProgressSummary(): ProgressSummary {
  return { files: new Map(), events: 0 };
}

function recordProgress(summary: ProgressSummary, event: ProgressEvent) {
  summary.events += 1;
  if (event.status !== "progress" || typeof event.file !== "string") return;
  const loaded = finiteNumber(event.loaded);
  const total = finiteNumber(event.total);
  summary.files.set(event.file, {
    loaded: Math.max(loaded, summary.files.get(event.file)?.loaded ?? 0),
    total: Math.max(total, summary.files.get(event.file)?.total ?? 0),
  });
}

function summarizeProgress(summary: ProgressSummary) {
  const files = Array.from(summary.files, ([file, value]) => ({ file, ...value }));
  return {
    events: summary.events,
    loadedBytes: files.reduce((sum, file) => sum + file.loaded, 0),
    totalBytes: files.reduce((sum, file) => sum + file.total, 0),
    files,
  };
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function cosine(left: number[], right: number[]) {
  assert(left.length === right.length && left.length > 0, "Cosine vectors must align.");
  let dot = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return dot / (l2Norm(left) * l2Norm(right));
}

function l2Norm(vector: number[]) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function roundMs(value: number) {
  return Math.round(value * 10) / 10;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function boundedError(error: unknown) {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.slice(0, 1000);
}

function postResponse(response: LocalEmbeddingPocResponse) {
  self.postMessage(response);
}
