import type { LocalEmbeddingBackend, LocalEmbeddingPurpose } from "./contracts";
import workerUrl from "./local-embedding.worker.ts?worker&url";
import type { LocalEmbeddingPocWasmPaths } from "./poc-models";
import {
  type LocalEmbeddingRuntimeRequest,
  isLocalEmbeddingRuntimeResponse,
} from "./runtime-protocol";

interface LoadedRuntime {
  worker: Worker;
  modelId: string;
  backend: LocalEmbeddingBackend;
  fallbackReason?: string;
}

export interface LocalEmbeddingRuntimeHostOptions {
  createWorker?: (backend: LocalEmbeddingBackend) => Worker;
  getWasmPaths?: () => LocalEmbeddingPocWasmPaths;
  hasWebGpu?: () => boolean;
}

export class LocalEmbeddingRuntimeHost {
  private loaded: LoadedRuntime | undefined;
  private readonly pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      worker: Worker;
    }
  >();

  constructor(private readonly options: LocalEmbeddingRuntimeHostOptions = {}) {}

  async load(modelId: string) {
    if (this.loaded?.modelId === modelId) return runtimeHealth(this.loaded);
    await this.dispose();
    let fallbackReason: string | undefined;
    if (this.hasWebGpu()) {
      try {
        this.loaded = await this.loadBackend(modelId, "webgpu");
        return runtimeHealth(this.loaded);
      } catch (error) {
        fallbackReason = boundedError(error);
        await this.dispose();
      }
    } else {
      fallbackReason = "navigator.gpu is unavailable";
    }
    this.loaded = await this.loadBackend(modelId, "wasm");
    this.loaded.fallbackReason = fallbackReason;
    return runtimeHealth(this.loaded);
  }

  async embed(
    modelId: string,
    purpose: LocalEmbeddingPurpose,
    inputs: string[],
    signal?: AbortSignal,
  ) {
    if (this.loaded?.modelId !== modelId) await this.load(modelId);
    const loaded = this.loaded;
    if (loaded === undefined) throw new Error("Local embedding runtime failed to load.");
    const value = await this.call(
      loaded.worker,
      { kind: "embed", requestId: crypto.randomUUID(), modelId, purpose, inputs },
      120_000,
      signal,
    );
    if (!Array.isArray(value)) throw new Error("Local embedding runtime returned invalid vectors.");
    return value as number[][];
  }

  async dispose() {
    const loaded = this.loaded;
    this.loaded = undefined;
    if (loaded === undefined) return;
    await this.call(
      loaded.worker,
      { kind: "dispose", requestId: crypto.randomUUID() },
      5_000,
    ).catch(() => undefined);
    loaded.worker.terminate();
  }

  private async loadBackend(modelId: string, backend: LocalEmbeddingBackend) {
    const worker = this.createWorker(backend);
    try {
      await this.call(
        worker,
        {
          kind: "load",
          requestId: crypto.randomUUID(),
          modelId,
          backend,
          wasmPaths: this.getWasmPaths(),
        },
        5 * 60_000,
      );
      return { worker, modelId, backend } satisfies LoadedRuntime;
    } catch (error) {
      worker.terminate();
      throw error;
    }
  }

  private createWorker(backend: LocalEmbeddingBackend) {
    const worker =
      this.options.createWorker?.(backend) ??
      new Worker(new URL(workerUrl, location.href), {
        name: `clio-local-embedding-${backend}`,
        type: "module",
      });
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (!isLocalEmbeddingRuntimeResponse(event.data)) return;
      const entry = this.pending.get(event.data.requestId);
      if (entry === undefined) return;
      clearTimeout(entry.timer);
      this.pending.delete(event.data.requestId);
      if (event.data.ok) entry.resolve(event.data.value);
      else {
        const error = new Error(event.data.error?.message ?? "Local embedding runtime failed.");
        Object.assign(error, { code: event.data.error?.code });
        entry.reject(error);
      }
    });
    worker.addEventListener("error", (event) => {
      for (const [requestId, entry] of this.pending) {
        if (entry.worker !== worker) continue;
        clearTimeout(entry.timer);
        entry.reject(event.error ?? new Error(event.message));
        this.pending.delete(requestId);
      }
    });
    return worker;
  }

  private call(
    worker: Worker,
    request: LocalEmbeddingRuntimeRequest,
    timeoutMs: number,
    signal?: AbortSignal,
  ) {
    return new Promise<unknown>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Local embedding request aborted.", "AbortError"));
        return;
      }
      const abort = () => {
        const entry = this.pending.get(request.requestId);
        if (entry === undefined) return;
        clearTimeout(entry.timer);
        this.pending.delete(request.requestId);
        worker.postMessage({
          kind: "cancel",
          requestId: crypto.randomUUID(),
          targetRequestId: request.requestId,
        } satisfies LocalEmbeddingRuntimeRequest);
        reject(new DOMException("Local embedding request aborted.", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", abort);
        this.pending.delete(request.requestId);
        reject(new Error(`Local embedding ${request.kind} request timed out.`));
      }, timeoutMs);
      this.pending.set(request.requestId, {
        resolve: (value) => {
          signal?.removeEventListener("abort", abort);
          resolve(value);
        },
        reject: (error) => {
          signal?.removeEventListener("abort", abort);
          reject(error);
        },
        timer,
        worker,
      });
      signal?.addEventListener("abort", abort, { once: true });
      worker.postMessage(request);
    });
  }

  private hasWebGpu() {
    return this.options.hasWebGpu?.() ?? "gpu" in navigator;
  }

  private getWasmPaths() {
    return this.options.getWasmPaths?.() ?? runtimeWasmPaths();
  }
}

function runtimeWasmPaths(): LocalEmbeddingPocWasmPaths {
  return {
    wasm: chrome.runtime.getURL("assets/ort-wasm-simd-threaded.wasm"),
    mjs: chrome.runtime.getURL("assets/ort-wasm-simd-threaded.mjs"),
    jsepWasm: chrome.runtime.getURL("assets/ort-wasm-simd-threaded.jsep.wasm"),
    jsepMjs: chrome.runtime.getURL("assets/ort-wasm-simd-threaded.jsep.mjs"),
  };
}

function runtimeHealth(loaded: LoadedRuntime) {
  return {
    modelId: loaded.modelId,
    backend: loaded.backend,
    ready: true,
    ...(loaded.fallbackReason === undefined ? {} : { fallbackReason: loaded.fallbackReason }),
  };
}

function boundedError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
