import type {
  LocalEmbeddingModelManifest,
  LocalEmbeddingModelState,
  LocalEmbeddingModelStatus,
} from "./contracts";
import {
  LocalEmbeddingInstallError,
  OpfsLocalEmbeddingCache,
  OpfsLocalEmbeddingModelStore,
} from "./opfs-model-store";

export interface LocalEmbeddingInstallProgress {
  state: LocalEmbeddingModelState;
  modelId: string;
  downloadedBytes: number;
  totalBytes: number;
  currentFile?: string;
}

export interface LocalEmbeddingInstallOptions {
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
  onProgress?: (progress: LocalEmbeddingInstallProgress) => void;
}

export class LocalEmbeddingModelInstaller {
  private readonly activeInstalls = new Map<string, AbortController>();

  constructor(private readonly store = new OpfsLocalEmbeddingModelStore()) {}

  async recover(manifest: LocalEmbeddingModelManifest) {
    if (await this.store.isInstalled(manifest)) return true;
    if (await this.store.hasModelDirectory(manifest.modelId)) {
      await this.store.removeModel(manifest.modelId);
    }
    return false;
  }

  async status(manifest: LocalEmbeddingModelManifest): Promise<LocalEmbeddingModelStatus> {
    const installed = await this.store.isInstalled(manifest);
    const totalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
    return {
      modelId: manifest.modelId,
      state: installed ? "installed" : "not_installed",
      downloadedBytes: installed ? totalBytes : 0,
      totalBytes,
      ...(installed ? { installedRevision: manifest.revision } : {}),
      ready: false,
      active: false,
      reindexRequired: installed,
    };
  }

  async install(
    manifest: LocalEmbeddingModelManifest,
    options: LocalEmbeddingInstallOptions = {},
  ): Promise<LocalEmbeddingModelStatus> {
    if (this.activeInstalls.has(manifest.modelId)) {
      throw new LocalEmbeddingInstallError(
        "LOCAL_MODEL_STORAGE_ERROR",
        "Local model installation is already running.",
      );
    }
    if (await this.store.isInstalled(manifest)) return await this.status(manifest);

    const controller = new AbortController();
    this.activeInstalls.set(manifest.modelId, controller);
    const relayAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", relayAbort, { once: true });
    const totalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
    let completedBytes = 0;
    const fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));

    try {
      await this.store.prepareInstall(manifest);
      emitProgress(options, {
        state: "downloading",
        modelId: manifest.modelId,
        downloadedBytes: 0,
        totalBytes,
      });
      const cache = new OpfsLocalEmbeddingCache(this.store, manifest, {
        allowWrites: true,
        signal: controller.signal,
        onProgress: (fileProgress) =>
          emitProgress(options, {
            state: "downloading",
            modelId: manifest.modelId,
            downloadedBytes: completedBytes + fileProgress.loaded,
            totalBytes,
            currentFile: fileProgress.file,
          }),
      });

      for (const file of manifest.files) {
        throwIfCancelled(controller.signal);
        const response = await fetchFn(file.url, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
          credentials: "omit",
        }).catch((error) => {
          throw mapFetchError(error, controller.signal);
        });
        await cache.put(file.url, response);
        completedBytes += file.bytes;
      }

      emitProgress(options, {
        state: "verifying",
        modelId: manifest.modelId,
        downloadedBytes: totalBytes,
        totalBytes,
      });
      await this.store.commitInstall(manifest);
      const status = await this.status(manifest);
      emitProgress(options, {
        state: "installed",
        modelId: manifest.modelId,
        downloadedBytes: totalBytes,
        totalBytes,
      });
      return status;
    } catch (error) {
      await this.store.removeModel(manifest.modelId).catch(() => undefined);
      throw mapFetchError(error, controller.signal);
    } finally {
      options.signal?.removeEventListener("abort", relayAbort);
      this.activeInstalls.delete(manifest.modelId);
    }
  }

  retry(manifest: LocalEmbeddingModelManifest, options: LocalEmbeddingInstallOptions = {}) {
    return this.install(manifest, options);
  }

  cancel(modelId: string) {
    const active = this.activeInstalls.get(modelId);
    if (active === undefined) return false;
    active.abort("user_cancelled");
    return true;
  }

  async delete(modelId: string) {
    this.cancel(modelId);
    return await this.store.removeModel(modelId);
  }

  runtimeCache(manifest: LocalEmbeddingModelManifest) {
    return new OpfsLocalEmbeddingCache(this.store, manifest);
  }
}

function emitProgress(
  options: LocalEmbeddingInstallOptions,
  progress: LocalEmbeddingInstallProgress,
) {
  options.onProgress?.(progress);
}

function throwIfCancelled(signal: AbortSignal) {
  if (signal.aborted) {
    throw new LocalEmbeddingInstallError(
      "LOCAL_MODEL_CANCELLED",
      "Local model installation cancelled.",
    );
  }
}

function mapFetchError(error: unknown, signal: AbortSignal) {
  if (error instanceof LocalEmbeddingInstallError) return error;
  if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
    return new LocalEmbeddingInstallError(
      "LOCAL_MODEL_CANCELLED",
      "Local model installation cancelled.",
    );
  }
  return new LocalEmbeddingInstallError(
    "LOCAL_MODEL_HTTP_ERROR",
    error instanceof Error ? error.message : "Local model download failed.",
  );
}
