import { describe, expect, it } from "vitest";
import {
  type LocalEmbeddingModelManifest,
  deriveLocalEmbeddingModelId,
  isLocalEmbeddingModelManifest,
  isLocalEmbeddingModelRequest,
  isLocalEmbeddingModelStatus,
} from "./contracts";
import {
  getTrustedLocalEmbeddingModelManifest,
  recommendedLocalEmbeddingDownloadBytes,
  recommendedLocalEmbeddingModelManifest,
} from "./trusted-models";

function mutableManifest(): LocalEmbeddingModelManifest {
  return structuredClone(recommendedLocalEmbeddingModelManifest) as LocalEmbeddingModelManifest;
}

function manifestFile(manifest: LocalEmbeddingModelManifest, index: number) {
  const file = manifest.files[index];
  if (file === undefined) throw new Error(`Missing manifest file at index ${index}.`);
  return file;
}

describe("trusted local embedding manifest", () => {
  it("freezes the E5 model identity and exact downloadable bytes", () => {
    expect(isLocalEmbeddingModelManifest(recommendedLocalEmbeddingModelManifest)).toBe(true);
    expect(recommendedLocalEmbeddingDownloadBytes).toBe(295_267_926);
    expect(recommendedLocalEmbeddingModelManifest.modelId).toBe(
      "local-transformers:xenova-multilingual-e5-base:1ec9243030a27d1a115d5c340572074c125b58b2:int8:d768",
    );
    expect(
      getTrustedLocalEmbeddingModelManifest(recommendedLocalEmbeddingModelManifest.modelId),
    ).toBe(recommendedLocalEmbeddingModelManifest);
  });

  it("derives different vector-space identities for revision, dtype, and dimension changes", () => {
    const base = {
      repository: "Xenova/multilingual-e5-base",
      revision: "1ec9243030a27d1a115d5c340572074c125b58b2",
      dtype: "int8" as const,
      dimension: 768,
    };
    const baseId = deriveLocalEmbeddingModelId(base);

    expect(deriveLocalEmbeddingModelId({ ...base, revision: "a".repeat(40) })).not.toBe(baseId);
    expect(deriveLocalEmbeddingModelId({ ...base, dimension: 384 })).not.toBe(baseId);
  });

  it.each([
    [
      "mutable branch revision",
      (manifest: ReturnType<typeof mutableManifest>) => {
        manifest.revision = "main";
      },
    ],
    [
      "model identity mismatch",
      (manifest: ReturnType<typeof mutableManifest>) => {
        manifest.modelId = "local-transformers:wrong";
      },
    ],
    [
      "untrusted HTTP URL",
      (manifest: ReturnType<typeof mutableManifest>) => {
        const file = manifestFile(manifest, 0);
        file.url = file.url.replace("https://", "http://");
      },
    ],
    [
      "path traversal",
      (manifest: ReturnType<typeof mutableManifest>) => {
        manifestFile(manifest, 0).path = "../config.json";
      },
    ],
    [
      "invalid SHA-256",
      (manifest: ReturnType<typeof mutableManifest>) => {
        manifestFile(manifest, 0).sha256 = "0".repeat(63);
      },
    ],
    [
      "duplicate path",
      (manifest: ReturnType<typeof mutableManifest>) => {
        const source = manifestFile(manifest, 0);
        const duplicate = manifestFile(manifest, 1);
        duplicate.path = source.path;
        duplicate.url = source.url;
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const manifest = mutableManifest();
    mutate(manifest);
    expect(isLocalEmbeddingModelManifest(manifest)).toBe(false);
  });
});

describe("local embedding control guards", () => {
  it.each([
    { kind: "getLocalEmbeddingModelStatus" },
    { kind: "installLocalEmbeddingModel", modelId: recommendedLocalEmbeddingModelManifest.modelId },
    {
      kind: "cancelLocalEmbeddingModelInstall",
      modelId: recommendedLocalEmbeddingModelManifest.modelId,
    },
    {
      kind: "retryLocalEmbeddingModelInstall",
      modelId: recommendedLocalEmbeddingModelManifest.modelId,
    },
    { kind: "deleteLocalEmbeddingModel", modelId: recommendedLocalEmbeddingModelManifest.modelId },
    { kind: "testLocalEmbeddingModel", modelId: recommendedLocalEmbeddingModelManifest.modelId },
    {
      kind: "authorizeLocalEmbeddingReindex",
      modelId: recommendedLocalEmbeddingModelManifest.modelId,
    },
    {
      kind: "cancelLocalEmbeddingReindex",
      modelId: recommendedLocalEmbeddingModelManifest.modelId,
    },
  ])("accepts $kind", (request) => {
    expect(isLocalEmbeddingModelRequest(request)).toBe(true);
  });

  it.each([
    null,
    {},
    { kind: "installLocalEmbeddingModel" },
    { kind: "installLocalEmbeddingModel", modelId: "" },
    { kind: "installArbitraryModel", modelId: recommendedLocalEmbeddingModelManifest.modelId },
  ])("rejects malformed request %#", (request) => {
    expect(isLocalEmbeddingModelRequest(request)).toBe(false);
  });

  it("validates bounded status payloads", () => {
    const status = {
      modelId: recommendedLocalEmbeddingModelManifest.modelId,
      state: "downloading",
      downloadedBytes: 10,
      totalBytes: recommendedLocalEmbeddingDownloadBytes,
      currentFile: "tokenizer.json",
      ready: false,
      active: false,
      reindexRequired: false,
    };
    expect(isLocalEmbeddingModelStatus(status)).toBe(true);
    expect(isLocalEmbeddingModelStatus({ ...status, downloadedBytes: status.totalBytes + 1 })).toBe(
      false,
    );
    expect(isLocalEmbeddingModelStatus({ ...status, active: true })).toBe(true);
    expect(
      isLocalEmbeddingModelStatus({
        ...status,
        state: "ready",
        ready: true,
        reindexRequired: true,
        reindex: {
          jobId: "job:embedding-reindex",
          state: "running",
          progressCurrent: 2,
          progressTotal: 5,
        },
      }),
    ).toBe(true);
    expect(
      isLocalEmbeddingModelStatus({
        ...status,
        reindex: {
          jobId: "job:embedding-reindex",
          state: "running",
          progressCurrent: 6,
          progressTotal: 5,
        },
      }),
    ).toBe(false);
    expect(
      isLocalEmbeddingModelStatus({
        ...status,
        state: "error",
        error: { code: "MODEL_LOAD_FAILED", message: "x".repeat(501) },
      }),
    ).toBe(false);
  });
});
