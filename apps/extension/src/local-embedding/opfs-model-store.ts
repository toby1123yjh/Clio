import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import {
  type LocalEmbeddingModelFile,
  type LocalEmbeddingModelManifest,
  assertLocalEmbeddingModelManifest,
} from "./contracts";

export const localEmbeddingCacheRootDirectory = "clio-model-cache";
export const localEmbeddingCacheKindDirectory = "embedding";
export const localEmbeddingInstallMarkerFile = "install-state.json";
export const localEmbeddingTransformersModelPath = "/models/";

export interface OpfsFileHandleLike {
  createWritable(): Promise<OpfsWritableLike>;
  getFile(): Promise<Blob>;
}

export interface OpfsWritableLike {
  write(data: Uint8Array | string): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
}

export interface OpfsDirectoryHandleLike {
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<OpfsDirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandleLike>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

export type OpfsRootProvider = () => Promise<OpfsDirectoryHandleLike>;

export interface LocalEmbeddingFileProgress {
  file: string;
  loaded: number;
  total: number;
  progress: number;
}

interface LocalEmbeddingInstallMarker {
  schemaVersion: 1;
  modelId: string;
  revision: string;
  installedAt: string;
  files: Array<{
    path: string;
    bytes: number;
    sha256: string;
  }>;
}

export class LocalEmbeddingInstallError extends Error {
  constructor(
    readonly code:
      | "LOCAL_MODEL_CANCELLED"
      | "LOCAL_MODEL_HTTP_ERROR"
      | "LOCAL_MODEL_INTEGRITY_ERROR"
      | "LOCAL_MODEL_OPFS_UNAVAILABLE"
      | "LOCAL_MODEL_QUOTA_EXCEEDED"
      | "LOCAL_MODEL_STORAGE_ERROR"
      | "LOCAL_MODEL_WRITE_NOT_AUTHORIZED",
    message: string,
  ) {
    super(message);
    this.name = "LocalEmbeddingInstallError";
  }
}

export class OpfsLocalEmbeddingModelStore {
  constructor(private readonly getRoot: OpfsRootProvider = getBrowserOpfsRoot) {}

  async prepareInstall(manifest: LocalEmbeddingModelManifest) {
    assertLocalEmbeddingModelManifest(manifest);
    await this.removeModel(manifest.modelId);
    await this.modelDirectory(manifest.modelId, true);
  }

  async writeVerifiedFile(
    manifest: LocalEmbeddingModelManifest,
    expected: LocalEmbeddingModelFile,
    response: Response,
    options: {
      signal?: AbortSignal;
      onProgress?: (progress: LocalEmbeddingFileProgress) => void;
    } = {},
  ) {
    assertLocalEmbeddingModelManifest(manifest);
    if (!manifest.files.some((file) => sameFile(file, expected))) {
      throw new LocalEmbeddingInstallError(
        "LOCAL_MODEL_INTEGRITY_ERROR",
        `Model file is not part of the trusted manifest: ${expected.path}`,
      );
    }
    if (!response.ok || response.status !== 200) {
      throw new LocalEmbeddingInstallError(
        "LOCAL_MODEL_HTTP_ERROR",
        `Model download failed for ${expected.path} with HTTP ${response.status}.`,
      );
    }
    if (response.body === null) {
      throw new LocalEmbeddingInstallError(
        "LOCAL_MODEL_HTTP_ERROR",
        `Model download response has no body: ${expected.path}`,
      );
    }
    const declaredLength = parseContentLength(response.headers.get("content-length"));
    if (declaredLength !== undefined && declaredLength !== expected.bytes) {
      throw integrityError(expected.path, expected.bytes, declaredLength);
    }

    const handle = await this.fileHandle(manifest.modelId, expected.path, true);
    const writable = await handle.createWritable();
    const reader = response.body.getReader();
    const hash = sha256.create();
    let loaded = 0;
    let completed = false;

    try {
      while (true) {
        throwIfAborted(options.signal);
        const chunk = await reader.read();
        if (chunk.done) break;
        throwIfAborted(options.signal);
        loaded += chunk.value.byteLength;
        if (loaded > expected.bytes) {
          throw integrityError(expected.path, expected.bytes, loaded);
        }
        hash.update(chunk.value);
        await writable.write(chunk.value);
        options.onProgress?.({
          file: expected.path,
          loaded,
          total: expected.bytes,
          progress: expected.bytes === 0 ? 0 : (loaded / expected.bytes) * 100,
        });
      }

      if (loaded !== expected.bytes) {
        throw integrityError(expected.path, expected.bytes, loaded);
      }
      const actualHash = bytesToHex(hash.digest());
      if (actualHash !== expected.sha256) {
        throw new LocalEmbeddingInstallError(
          "LOCAL_MODEL_INTEGRITY_ERROR",
          `SHA-256 mismatch for ${expected.path}.`,
        );
      }
      await writable.close();
      completed = true;
    } catch (error) {
      await reader.cancel(error).catch(() => undefined);
      if (!completed) {
        await writable.abort?.(error).catch(() => undefined);
      }
      throw mapStorageError(error);
    }
  }

  async commitInstall(manifest: LocalEmbeddingModelManifest) {
    assertLocalEmbeddingModelManifest(manifest);
    for (const expected of manifest.files) {
      const file = await (await this.fileHandle(manifest.modelId, expected.path, false)).getFile();
      if (file.size !== expected.bytes) {
        throw integrityError(expected.path, expected.bytes, file.size);
      }
    }
    const marker: LocalEmbeddingInstallMarker = {
      schemaVersion: 1,
      modelId: manifest.modelId,
      revision: manifest.revision,
      installedAt: new Date().toISOString(),
      files: manifest.files.map((file) => ({
        path: file.path,
        bytes: file.bytes,
        sha256: file.sha256,
      })),
    };
    await this.writeTextFile(
      await this.modelDirectory(manifest.modelId, false),
      localEmbeddingInstallMarkerFile,
      JSON.stringify(marker),
    );
  }

  async isInstalled(manifest: LocalEmbeddingModelManifest) {
    const marker = await this.readMarker(manifest.modelId);
    if (!markerMatchesManifest(marker, manifest)) return false;
    try {
      for (const expected of manifest.files) {
        const file = await (
          await this.fileHandle(manifest.modelId, expected.path, false)
        ).getFile();
        if (file.size !== expected.bytes) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async hasModelDirectory(modelId: string) {
    try {
      await this.modelDirectory(modelId, false);
      return true;
    } catch (error) {
      if (isNotFoundError(error)) return false;
      throw mapStorageError(error);
    }
  }

  async matchInstalledFile(manifest: LocalEmbeddingModelManifest, path: string) {
    if (!(await this.isInstalled(manifest))) return undefined;
    const expected = manifest.files.find((file) => file.path === path);
    if (expected === undefined) return undefined;
    try {
      const file = await (await this.fileHandle(manifest.modelId, path, false)).getFile();
      return new Response(file, {
        status: 200,
        headers: {
          "content-length": String(file.size),
          "content-type": contentTypeForPath(path),
        },
      });
    } catch (error) {
      if (isNotFoundError(error)) return undefined;
      throw mapStorageError(error);
    }
  }

  async removeModel(modelId: string) {
    const directory = await this.embeddingDirectory(true);
    try {
      await directory.removeEntry(modelDirectoryName(modelId), { recursive: true });
      return true;
    } catch (error) {
      if (isNotFoundError(error)) return false;
      throw mapStorageError(error);
    }
  }

  private async readMarker(modelId: string): Promise<LocalEmbeddingInstallMarker | undefined> {
    try {
      const directory = await this.modelDirectory(modelId, false);
      const file = await (await directory.getFileHandle(localEmbeddingInstallMarkerFile)).getFile();
      const value = JSON.parse(await file.text()) as unknown;
      return isInstallMarker(value) ? value : undefined;
    } catch (error) {
      if (isNotFoundError(error) || error instanceof SyntaxError) return undefined;
      throw mapStorageError(error);
    }
  }

  private async writeTextFile(directory: OpfsDirectoryHandleLike, name: string, value: string) {
    const handle = await directory.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(value);
      await writable.close();
    } catch (error) {
      await writable.abort?.(error).catch(() => undefined);
      throw mapStorageError(error);
    }
  }

  private async fileHandle(modelId: string, path: string, create: boolean) {
    const segments = path.split("/");
    const fileName = segments.pop();
    if (fileName === undefined) {
      throw new LocalEmbeddingInstallError(
        "LOCAL_MODEL_STORAGE_ERROR",
        "Model file path is empty.",
      );
    }
    let directory = await this.filesDirectory(modelId, create);
    for (const segment of segments) {
      directory = await directory.getDirectoryHandle(segment, { create });
    }
    return await directory.getFileHandle(fileName, { create });
  }

  private async filesDirectory(modelId: string, create: boolean) {
    return await (await this.modelDirectory(modelId, create)).getDirectoryHandle("files", {
      create,
    });
  }

  private async modelDirectory(modelId: string, create: boolean) {
    return await (await this.embeddingDirectory(create)).getDirectoryHandle(
      modelDirectoryName(modelId),
      {
        create,
      },
    );
  }

  private async embeddingDirectory(create: boolean) {
    const root = await this.getRoot().catch((error) => {
      throw mapStorageError(error, "LOCAL_MODEL_OPFS_UNAVAILABLE");
    });
    const cache = await root.getDirectoryHandle(localEmbeddingCacheRootDirectory, { create });
    return await cache.getDirectoryHandle(localEmbeddingCacheKindDirectory, { create });
  }
}

export class OpfsLocalEmbeddingCache {
  constructor(
    private readonly store: OpfsLocalEmbeddingModelStore,
    private readonly manifest: LocalEmbeddingModelManifest,
    private readonly options: {
      allowWrites?: boolean;
      signal?: AbortSignal;
      onProgress?: (progress: LocalEmbeddingFileProgress) => void;
    } = {},
  ) {
    assertLocalEmbeddingModelManifest(manifest);
  }

  async match(request: string) {
    const file = this.fileForRequest(request);
    if (file === undefined) return undefined;
    return await this.store.matchInstalledFile(this.manifest, file.path);
  }

  async put(
    request: string,
    response: Response,
    progressCallback?: (progress: { progress: number; loaded: number; total: number }) => void,
  ) {
    if (!this.options.allowWrites) {
      throw new LocalEmbeddingInstallError(
        "LOCAL_MODEL_WRITE_NOT_AUTHORIZED",
        "Local model runtime cache is read-only outside an explicit install.",
      );
    }
    const file = this.fileForRequest(request);
    if (file === undefined) {
      throw new LocalEmbeddingInstallError(
        "LOCAL_MODEL_INTEGRITY_ERROR",
        "Refused a model response outside the trusted manifest.",
      );
    }
    await this.store.writeVerifiedFile(this.manifest, file, response, {
      signal: this.options.signal,
      onProgress: (progress) => {
        progressCallback?.(progress);
        this.options.onProgress?.(progress);
      },
    });
  }

  async delete() {
    return false;
  }

  private fileForRequest(request: string) {
    return this.manifest.files.find(
      (file) =>
        request === file.url ||
        request ===
          `${localEmbeddingTransformersModelPath}${this.manifest.repository}/${file.path}`,
    );
  }
}

function getBrowserOpfsRoot(): Promise<OpfsDirectoryHandleLike> {
  const storage = (
    globalThis.navigator as unknown as {
      storage?: { getDirectory?: () => Promise<OpfsDirectoryHandleLike> };
    }
  ).storage;
  if (typeof storage?.getDirectory !== "function") {
    throw new LocalEmbeddingInstallError(
      "LOCAL_MODEL_OPFS_UNAVAILABLE",
      "Browser local model storage is unavailable.",
    );
  }
  return storage.getDirectory();
}

function markerMatchesManifest(
  marker: LocalEmbeddingInstallMarker | undefined,
  manifest: LocalEmbeddingModelManifest,
) {
  return (
    marker !== undefined &&
    marker.modelId === manifest.modelId &&
    marker.revision === manifest.revision &&
    marker.files.length === manifest.files.length &&
    marker.files.every((file, index) => sameFile(file, manifest.files[index]))
  );
}

function isInstallMarker(value: unknown): value is LocalEmbeddingInstallMarker {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.modelId === "string" &&
    typeof value.revision === "string" &&
    typeof value.installedAt === "string" &&
    Array.isArray(value.files) &&
    value.files.every(
      (file) =>
        isRecord(file) &&
        typeof file.path === "string" &&
        typeof file.bytes === "number" &&
        Number.isSafeInteger(file.bytes) &&
        file.bytes > 0 &&
        typeof file.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(file.sha256),
    )
  );
}

function sameFile(
  left: Pick<LocalEmbeddingModelFile, "path" | "bytes" | "sha256">,
  right: Pick<LocalEmbeddingModelFile, "path" | "bytes" | "sha256"> | undefined,
) {
  return (
    right !== undefined &&
    left.path === right.path &&
    left.bytes === right.bytes &&
    left.sha256 === right.sha256
  );
}

function modelDirectoryName(modelId: string) {
  return encodeURIComponent(modelId);
}

function parseContentLength(value: string | null) {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function integrityError(path: string, expected: number, actual: number) {
  return new LocalEmbeddingInstallError(
    "LOCAL_MODEL_INTEGRITY_ERROR",
    `Byte length mismatch for ${path}: expected ${expected}, received ${actual}.`,
  );
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new LocalEmbeddingInstallError(
      "LOCAL_MODEL_CANCELLED",
      "Local model installation cancelled.",
    );
  }
}

function mapStorageError(
  error: unknown,
  fallbackCode: LocalEmbeddingInstallError["code"] = "LOCAL_MODEL_STORAGE_ERROR",
) {
  if (error instanceof LocalEmbeddingInstallError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new LocalEmbeddingInstallError(
      "LOCAL_MODEL_CANCELLED",
      "Local model installation cancelled.",
    );
  }
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return new LocalEmbeddingInstallError(
      "LOCAL_MODEL_QUOTA_EXCEEDED",
      "Browser storage quota is insufficient for the local model.",
    );
  }
  return new LocalEmbeddingInstallError(
    fallbackCode,
    error instanceof Error ? error.message : "Local model storage operation failed.",
  );
}

function isNotFoundError(error: unknown) {
  return error instanceof DOMException && error.name === "NotFoundError";
}

function contentTypeForPath(path: string) {
  return path.endsWith(".json") ? "application/json" : "application/octet-stream";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
