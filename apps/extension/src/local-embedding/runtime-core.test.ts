import { describe, expect, it } from "vitest";
import type { LocalEmbeddingModelManifest } from "./contracts";
import {
  type LocalEmbeddingPipeline,
  LocalEmbeddingPipelineRuntime,
  localEmbeddingRuntimeBatchSize,
  localEmbeddingRuntimeMaxInputChars,
} from "./runtime-core";
import { recommendedLocalEmbeddingModelManifest } from "./trusted-models";

function testManifest(dimension = 3): LocalEmbeddingModelManifest {
  return {
    ...recommendedLocalEmbeddingModelManifest,
    modelId: `local-transformers:test:${"a".repeat(40)}:int8:d${dimension}`,
    repository: "test/model",
    revision: "a".repeat(40),
    dimension,
    files: recommendedLocalEmbeddingModelManifest.files.map((file) => ({
      ...file,
      url: file.url.replace(
        /Xenova\/multilingual-e5-small\/resolve\/[a-f0-9]{40}/,
        `test/model/resolve/${"a".repeat(40)}`,
      ),
    })),
  };
}

function normalizedVector(dimension: number) {
  return Array.from({ length: dimension }, (_, index) => (index === 0 ? 1 : 0));
}

describe("local embedding runtime core", () => {
  it("formats query/document inputs and batches at eight with manifest truncation", async () => {
    const manifest = testManifest();
    const calls: Array<{ inputs: string[]; options: Record<string, unknown> }> = [];
    const pipeline: LocalEmbeddingPipeline = Object.assign(
      async (inputs: string[], options: Parameters<LocalEmbeddingPipeline>[1]) => {
        calls.push({ inputs, options });
        return {
          data: inputs.flatMap(() => normalizedVector(manifest.dimension)),
          dims: [inputs.length, manifest.dimension],
        };
      },
      { dispose: async () => undefined },
    );
    const runtime = new LocalEmbeddingPipelineRuntime(manifest, "wasm", async () => pipeline);
    await runtime.load();
    calls.length = 0;

    const inputs = Array.from(
      { length: localEmbeddingRuntimeBatchSize + 2 },
      (_, index) => `document ${index}`,
    );
    const vectors = await runtime.embed("document", inputs);

    expect(vectors).toHaveLength(inputs.length);
    expect(calls.map((call) => call.inputs.length)).toEqual([8, 2]);
    expect(calls[0]?.inputs[0]).toBe("passage: document 0");
    expect(calls[0]?.options).toMatchObject({
      pooling: "mean",
      normalize: true,
      truncation: true,
      max_length: 512,
    });
  });

  it("rejects whole-document sized input before tokenization", async () => {
    const manifest = testManifest();
    const pipeline: LocalEmbeddingPipeline = Object.assign(
      async () => ({
        data: normalizedVector(manifest.dimension),
        dims: [1, manifest.dimension],
      }),
      { dispose: async () => undefined },
    );
    const runtime = new LocalEmbeddingPipelineRuntime(manifest, "wasm", async () => pipeline);
    await runtime.load();

    await expect(
      runtime.embed("document", ["x".repeat(localEmbeddingRuntimeMaxInputChars + 1)]),
    ).rejects.toMatchObject({ code: "LOCAL_EMBEDDING_INPUT_INVALID" });
  });

  it("rejects malformed output and cooperatively cancels between batches", async () => {
    const manifest = testManifest();
    let calls = 0;
    const pipeline: LocalEmbeddingPipeline = Object.assign(
      async (inputs: string[]) => {
        calls += 1;
        return {
          data: inputs.flatMap(() => normalizedVector(manifest.dimension)),
          dims: [inputs.length, manifest.dimension],
        };
      },
      { dispose: async () => undefined },
    );
    const runtime = new LocalEmbeddingPipelineRuntime(manifest, "wasm", async () => pipeline);
    await runtime.load();
    calls = 0;

    await expect(
      runtime.embed(
        "query",
        Array.from({ length: 10 }, (_, index) => `query ${index}`),
        () => calls >= 1,
      ),
    ).rejects.toMatchObject({ code: "LOCAL_EMBEDDING_CANCELLED" });
    expect(calls).toBe(1);

    const invalidPipeline: LocalEmbeddingPipeline = Object.assign(
      async () => ({ data: [0, 0, 0], dims: [1, 3] }),
      { dispose: async () => undefined },
    );
    const invalidRuntime = new LocalEmbeddingPipelineRuntime(
      manifest,
      "wasm",
      async () => invalidPipeline,
    );
    await expect(invalidRuntime.load()).rejects.toMatchObject({
      code: "LOCAL_EMBEDDING_OUTPUT_INVALID",
    });
  });
});
