import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { describe, expect, it } from "vitest";
import { type LocalEmbeddingModelManifest, deriveLocalEmbeddingModelId } from "./contracts";
import { LocalEmbeddingModelInstaller } from "./model-installer";
import {
  type OpfsDirectoryHandleLike,
  type OpfsFileHandleLike,
  OpfsLocalEmbeddingModelStore,
  type OpfsWritableLike,
} from "./opfs-model-store";

const encoder = new TextEncoder();

function fixtureManifest(payloads = fixturePayloads()): LocalEmbeddingModelManifest {
  const identity = {
    repository: "clio-test/local-embedding",
    revision: "a".repeat(40),
    dtype: "int8" as const,
    dimension: 384,
  };
  const files = [
    fileManifest(identity.repository, identity.revision, "config.json", payloads.config),
    fileManifest(identity.repository, identity.revision, "onnx/model_int8.onnx", payloads.model),
  ];
  return {
    schemaVersion: 1,
    modelId: deriveLocalEmbeddingModelId(identity),
    ...identity,
    label: "Clio Test Embedding",
    license: "MIT",
    metric: "cosine",
    maxInputTokens: 512,
    runtime: {
      task: "feature-extraction",
      pooling: "mean",
      normalize: true,
      queryPrefix: "query: ",
      documentPrefix: "passage: ",
    },
    files,
  };
}

function fixturePayloads() {
  return {
    config: encoder.encode('{"model":"test"}'),
    model: encoder.encode("test-onnx-model-bytes"),
  };
}

function fileManifest(repository: string, revision: string, path: string, bytes: Uint8Array) {
  return {
    path,
    url: `https://huggingface.co/${repository}/resolve/${revision}/${path}`,
    bytes: bytes.byteLength,
    sha256: bytesToHex(sha256(bytes)),
  };
}

function fixtureFetch(payloads = fixturePayloads()) {
  return async (url: string) => {
    const path = url.endsWith("config.json") ? "config" : "model";
    const body = payloads[path];
    return new Response(body, {
      status: 200,
      headers: { "content-length": String(body.byteLength) },
    });
  };
}

describe("local embedding OPFS installer", () => {
  it("installs verified files, commits last, and serves cache hits after recreation", async () => {
    const root = new MemoryDirectory();
    const store = new OpfsLocalEmbeddingModelStore(async () => root);
    const installer = new LocalEmbeddingModelInstaller(store);
    const manifest = fixtureManifest();
    const progress: number[] = [];

    const status = await installer.install(manifest, {
      fetchFn: fixtureFetch(),
      onProgress: (event) => progress.push(event.downloadedBytes),
    });

    expect(status).toMatchObject({
      state: "installed",
      installedRevision: manifest.revision,
      reindexRequired: true,
    });
    expect(progress.at(-1)).toBe(status.totalBytes);
    expect(await new LocalEmbeddingModelInstaller(store).status(manifest)).toMatchObject({
      state: "installed",
    });

    const cached = await installer.runtimeCache(manifest).match(manifest.files[0]?.url ?? "");
    expect(await cached?.text()).toBe('{"model":"test"}');
    const localCached = await installer
      .runtimeCache(manifest)
      .match(`/models/${manifest.repository}/config.json`);
    expect(await localCached?.text()).toBe('{"model":"test"}');
    expect(
      await installer.runtimeCache(manifest).match("https://evil.test/model.onnx"),
    ).toBeUndefined();
    expect(
      await installer.runtimeCache(manifest).match("/models/evil/model/config.json"),
    ).toBeUndefined();
    await expect(
      installer.runtimeCache(manifest).put(manifest.files[0]?.url ?? "", new Response("x")),
    ).rejects.toMatchObject({ code: "LOCAL_MODEL_WRITE_NOT_AUTHORIZED" });
  });

  it("cancels an active stream and leaves no addressable partial install", async () => {
    const root = new MemoryDirectory();
    const store = new OpfsLocalEmbeddingModelStore(async () => root);
    const installer = new LocalEmbeddingModelInstaller(store);
    const payloads = fixturePayloads();
    const manifest = fixtureManifest(payloads);
    let cancellationRequested = false;
    const fetchFn = async (url: string) => {
      const body = url.endsWith("config.json") ? payloads.config : payloads.model;
      const midpoint = Math.max(1, Math.floor(body.byteLength / 2));
      const chunks = [body.slice(0, midpoint), body.slice(midpoint)];
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            const chunk = chunks.shift();
            if (chunk === undefined) controller.close();
            else controller.enqueue(chunk);
          },
        }),
        { status: 200, headers: { "content-length": String(body.byteLength) } },
      );
    };

    await expect(
      installer.install(manifest, {
        fetchFn,
        onProgress: (event) => {
          if (!cancellationRequested && event.downloadedBytes > 0) {
            cancellationRequested = installer.cancel(manifest.modelId);
          }
        },
      }),
    ).rejects.toMatchObject({ code: "LOCAL_MODEL_CANCELLED" });

    expect(cancellationRequested).toBe(true);
    expect(await store.hasModelDirectory(manifest.modelId)).toBe(false);
    expect(
      await installer.runtimeCache(manifest).match(manifest.files[0]?.url ?? ""),
    ).toBeUndefined();
  });

  it("rejects hash mismatches and cleans the model directory", async () => {
    const root = new MemoryDirectory();
    const store = new OpfsLocalEmbeddingModelStore(async () => root);
    const installer = new LocalEmbeddingModelInstaller(store);
    const payloads = fixturePayloads();
    const manifest = fixtureManifest(payloads);
    const corrupted = { ...payloads, config: encoder.encode('{"model":"fail"}') };
    expect(corrupted.config.byteLength).toBe(payloads.config.byteLength);

    await expect(
      installer.install(manifest, { fetchFn: fixtureFetch(corrupted) }),
    ).rejects.toMatchObject({ code: "LOCAL_MODEL_INTEGRITY_ERROR" });
    expect(await store.hasModelDirectory(manifest.modelId)).toBe(false);

    await expect(
      installer.retry(manifest, { fetchFn: fixtureFetch(payloads) }),
    ).resolves.toMatchObject({ state: "installed" });
  });

  it("recovers an interrupted install without exposing its verified subset", async () => {
    const root = new MemoryDirectory();
    const store = new OpfsLocalEmbeddingModelStore(async () => root);
    const installer = new LocalEmbeddingModelInstaller(store);
    const payloads = fixturePayloads();
    const manifest = fixtureManifest(payloads);
    const firstFile = manifest.files[0];
    if (firstFile === undefined) throw new Error("Fixture manifest is missing config.json.");

    await store.prepareInstall(manifest);
    await store.writeVerifiedFile(
      manifest,
      firstFile,
      new Response(payloads.config, {
        status: 200,
        headers: { "content-length": String(payloads.config.byteLength) },
      }),
    );

    expect(await store.hasModelDirectory(manifest.modelId)).toBe(true);
    expect(await installer.runtimeCache(manifest).match(firstFile.url)).toBeUndefined();
    expect(await installer.recover(manifest)).toBe(false);
    expect(await store.hasModelDirectory(manifest.modelId)).toBe(false);
  });

  it("deletes only the selected model directory", async () => {
    const root = new MemoryDirectory();
    const store = new OpfsLocalEmbeddingModelStore(async () => root);
    const installer = new LocalEmbeddingModelInstaller(store);
    const manifest = fixtureManifest();
    const pdfDirectory = await root.getDirectoryHandle("clio-pdf-raw-files", { create: true });
    await writeMemoryFile(pdfDirectory, "source.pdf", "pdf-sentinel");

    await installer.install(manifest, { fetchFn: fixtureFetch() });
    expect(await installer.delete(manifest.modelId)).toBe(true);

    const sentinel = await (await pdfDirectory.getFileHandle("source.pdf")).getFile();
    expect(await sentinel.text()).toBe("pdf-sentinel");
    expect(await store.hasModelDirectory(manifest.modelId)).toBe(false);
  });

  it("maps OPFS quota failures to an actionable installer error", async () => {
    const root = new MemoryDirectory({
      writeError: new DOMException("quota", "QuotaExceededError"),
    });
    const installer = new LocalEmbeddingModelInstaller(
      new OpfsLocalEmbeddingModelStore(async () => root),
    );

    await expect(
      installer.install(fixtureManifest(), { fetchFn: fixtureFetch() }),
    ).rejects.toMatchObject({ code: "LOCAL_MODEL_QUOTA_EXCEEDED" });
  });
});

async function writeMemoryFile(directory: OpfsDirectoryHandleLike, name: string, value: string) {
  const writable = await (await directory.getFileHandle(name, { create: true })).createWritable();
  await writable.write(value);
  await writable.close();
}

class MemoryDirectory implements OpfsDirectoryHandleLike {
  readonly directories = new Map<string, MemoryDirectory>();
  readonly files = new Map<string, Uint8Array>();

  constructor(private readonly options: { writeError?: Error } = {}) {}

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
    const existing = this.directories.get(name);
    if (existing !== undefined) return existing;
    if (!options.create) throw notFound(name);
    const directory = new MemoryDirectory(this.options);
    this.directories.set(name, directory);
    return directory;
  }

  async getFileHandle(
    name: string,
    options: { create?: boolean } = {},
  ): Promise<OpfsFileHandleLike> {
    if (!this.files.has(name) && !options.create) throw notFound(name);
    if (!this.files.has(name)) this.files.set(name, new Uint8Array());
    return new MemoryFileHandle(this.files, name, this.options.writeError);
  }

  async removeEntry(name: string, options: { recursive?: boolean } = {}) {
    if (this.files.delete(name)) return;
    const directory = this.directories.get(name);
    if (directory === undefined) throw notFound(name);
    if (!options.recursive && (directory.files.size > 0 || directory.directories.size > 0)) {
      throw new DOMException("Directory is not empty.", "InvalidModificationError");
    }
    this.directories.delete(name);
  }
}

class MemoryFileHandle implements OpfsFileHandleLike {
  constructor(
    private readonly files: Map<string, Uint8Array>,
    private readonly name: string,
    private readonly writeError?: Error,
  ) {}

  async createWritable(): Promise<OpfsWritableLike> {
    const chunks: Uint8Array[] = [];
    let aborted = false;
    return {
      write: async (data) => {
        if (this.writeError !== undefined) throw this.writeError;
        chunks.push(typeof data === "string" ? encoder.encode(data) : new Uint8Array(data));
      },
      close: async () => {
        if (!aborted) this.files.set(this.name, concatBytes(chunks));
      },
      abort: async () => {
        aborted = true;
        this.files.delete(this.name);
      },
    };
  }

  async getFile() {
    const bytes = this.files.get(this.name);
    if (bytes === undefined) throw notFound(this.name);
    return new Blob([bytes.slice().buffer as ArrayBuffer]);
  }
}

function concatBytes(chunks: Uint8Array[]) {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function notFound(name: string) {
  return new DOMException(`Missing OPFS entry: ${name}`, "NotFoundError");
}
