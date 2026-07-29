import type {
  LocalEmbeddingBackend,
  LocalEmbeddingModelManifest,
  LocalEmbeddingPurpose,
} from "./contracts";

export const localEmbeddingRuntimeBatchSize = 8;
export const localEmbeddingRuntimeMaxInputs = 256;
export const localEmbeddingRuntimeMaxInputChars = 20_000;

export interface LocalEmbeddingTensor {
  data: ArrayLike<number>;
  dims: number[];
  dispose?: () => void;
}

export interface LocalEmbeddingPipeline {
  (
    inputs: string[],
    options: {
      pooling: "cls" | "mean";
      normalize: true;
      truncation: true;
      max_length: number;
    },
  ): Promise<LocalEmbeddingTensor>;
  dispose(): Promise<void>;
}

export type LocalEmbeddingPipelineFactory = (
  manifest: LocalEmbeddingModelManifest,
  backend: LocalEmbeddingBackend,
) => Promise<LocalEmbeddingPipeline>;

export class LocalEmbeddingRuntimeError extends Error {
  constructor(
    readonly code:
      | "LOCAL_EMBEDDING_CANCELLED"
      | "LOCAL_EMBEDDING_INPUT_INVALID"
      | "LOCAL_EMBEDDING_MODEL_MISMATCH"
      | "LOCAL_EMBEDDING_NOT_LOADED"
      | "LOCAL_EMBEDDING_OUTPUT_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "LocalEmbeddingRuntimeError";
  }
}

export class LocalEmbeddingPipelineRuntime {
  private pipeline: LocalEmbeddingPipeline | undefined;

  constructor(
    readonly manifest: LocalEmbeddingModelManifest,
    readonly backend: LocalEmbeddingBackend,
    private readonly createPipeline: LocalEmbeddingPipelineFactory,
  ) {}

  async load() {
    if (this.pipeline !== undefined) return;
    const pipeline = await this.createPipeline(this.manifest, this.backend);
    this.pipeline = pipeline;
    try {
      await this.embed("query", ["clio local embedding runtime smoke"]);
    } catch (error) {
      this.pipeline = undefined;
      await pipeline.dispose().catch(() => undefined);
      throw error;
    }
  }

  async embed(
    purpose: LocalEmbeddingPurpose,
    inputs: string[],
    isCancelled: () => boolean = () => false,
  ) {
    const pipeline = this.pipeline;
    if (pipeline === undefined) {
      throw new LocalEmbeddingRuntimeError(
        "LOCAL_EMBEDDING_NOT_LOADED",
        "Local embedding model is not loaded.",
      );
    }
    validateInputs(inputs);
    const vectors: number[][] = [];
    for (let offset = 0; offset < inputs.length; offset += localEmbeddingRuntimeBatchSize) {
      throwIfCancelled(isCancelled);
      const batch = inputs.slice(offset, offset + localEmbeddingRuntimeBatchSize);
      const prefix =
        purpose === "query"
          ? this.manifest.runtime.queryPrefix
          : this.manifest.runtime.documentPrefix;
      const tensor = await pipeline(
        batch.map((input) => `${prefix}${input}`),
        {
          pooling: this.manifest.runtime.pooling,
          normalize: true,
          truncation: true,
          max_length: this.manifest.maxInputTokens,
        },
      );
      try {
        vectors.push(...vectorsFromTensor(tensor, batch.length, this.manifest.dimension));
      } finally {
        tensor.dispose?.();
      }
      throwIfCancelled(isCancelled);
    }
    return vectors;
  }

  async dispose() {
    const pipeline = this.pipeline;
    this.pipeline = undefined;
    await pipeline?.dispose();
  }
}

function validateInputs(inputs: string[]) {
  if (inputs.length === 0 || inputs.length > localEmbeddingRuntimeMaxInputs) {
    throw new LocalEmbeddingRuntimeError(
      "LOCAL_EMBEDDING_INPUT_INVALID",
      `Local embedding requests must contain 1-${localEmbeddingRuntimeMaxInputs} inputs.`,
    );
  }
  if (
    inputs.some((input) => input.length === 0 || input.length > localEmbeddingRuntimeMaxInputChars)
  ) {
    throw new LocalEmbeddingRuntimeError(
      "LOCAL_EMBEDDING_INPUT_INVALID",
      `Each local embedding input must contain 1-${localEmbeddingRuntimeMaxInputChars} characters.`,
    );
  }
}

function vectorsFromTensor(tensor: LocalEmbeddingTensor, count: number, dimension: number) {
  const tensorDimension = tensor.dims.at(-1);
  if (tensorDimension !== dimension || tensor.data.length !== count * dimension) {
    throw new LocalEmbeddingRuntimeError(
      "LOCAL_EMBEDDING_OUTPUT_INVALID",
      "Local embedding tensor shape does not match the trusted manifest.",
    );
  }
  const data = Array.from(tensor.data, Number);
  const vectors = Array.from({ length: count }, (_, index) =>
    data.slice(index * dimension, (index + 1) * dimension),
  );
  for (const vector of vectors) {
    if (!vector.every(Number.isFinite)) {
      throw new LocalEmbeddingRuntimeError(
        "LOCAL_EMBEDDING_OUTPUT_INVALID",
        "Local embedding output contains a non-finite value.",
      );
    }
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (Math.abs(norm - 1) >= 0.001) {
      throw new LocalEmbeddingRuntimeError(
        "LOCAL_EMBEDDING_OUTPUT_INVALID",
        `Local embedding output is not L2 normalized (norm ${norm}).`,
      );
    }
  }
  return vectors;
}

function throwIfCancelled(isCancelled: () => boolean) {
  if (isCancelled()) {
    throw new LocalEmbeddingRuntimeError(
      "LOCAL_EMBEDDING_CANCELLED",
      "Local embedding request cancelled.",
    );
  }
}
