import type { ActiveEmbeddingModelSummary, JobSummary } from "@/src/shared/rpc";
import { describe, expect, it, vi } from "vitest";
import type { LocalEmbeddingModelStatus, LocalEmbeddingPurpose } from "./contracts";
import { LocalEmbeddingManager } from "./local-embedding-manager";
import type { LocalEmbeddingInstallProgress } from "./model-installer";
import { recommendedLocalEmbeddingModelManifest as manifest } from "./trusted-models";

describe("local embedding manager", () => {
  it("starts installation without blocking RPC and publishes progress", async () => {
    const installer = new FakeInstaller();
    const manager = createManager(installer, new FakeRuntime());

    const started = await manager.request({
      kind: "installLocalEmbeddingModel",
      modelId: manifest.modelId,
    });
    expect(started.status.state).toBe("downloading");

    installer.progress({
      state: "verifying",
      modelId: manifest.modelId,
      downloadedBytes: totalBytes(),
      totalBytes: totalBytes(),
    });
    expect((await manager.request({ kind: "getLocalEmbeddingModelStatus" })).status.state).toBe(
      "verifying",
    );

    installer.finishInstall();
    await vi.waitFor(async () => {
      expect((await manager.request({ kind: "getLocalEmbeddingModelStatus" })).status.state).toBe(
        "installed",
      );
    });
  });

  it("loads once, preserves embedding purpose, and activates after reindex", async () => {
    const installer = new FakeInstaller(true);
    const runtime = new FakeRuntime();
    let active: ActiveEmbeddingModelSummary | null = null;
    const reindex = vi.fn(async () => {
      active = activeSummary();
      return { jobId: "job:local-reindex", status: "done" as const };
    });
    const manager = new LocalEmbeddingManager({
      installer,
      runtime,
      getActiveEmbeddingModel: async () => active,
      reindex,
      getReindexJob: async () => reindexJob({ status: "done", progressCurrent: 1 }),
      cancelReindexJob: async () => reindexJob({ status: "failed", cancelRequested: true }),
    });

    await manager.embed(manifest.modelId, "document", ["bounded passage"]);
    await manager.embed(manifest.modelId, "query", ["bounded query"]);
    expect(runtime.loadCalls).toBe(1);
    expect(runtime.purposes).toEqual(["document", "query"]);

    const result = await manager.request({
      kind: "authorizeLocalEmbeddingReindex",
      modelId: manifest.modelId,
    });
    expect(reindex).toHaveBeenCalledWith({
      id: manifest.modelId,
      provider: "local-transformers",
      label: `${manifest.label} (${manifest.dimension}d)`,
      dimension: manifest.dimension,
      metric: "cosine",
    });
    expect(result.status).toMatchObject({ active: true, ready: true, reindexRequired: false });
  });

  it("cancels installation before scoped delete and disposes the runtime", async () => {
    const installer = new FakeInstaller(true);
    const runtime = new FakeRuntime();
    const manager = createManager(installer, runtime);
    await manager.embed(manifest.modelId, "query", ["bounded query"]);

    const result = await manager.request({
      kind: "deleteLocalEmbeddingModel",
      modelId: manifest.modelId,
    });
    expect(installer.cancelled).toBe(true);
    expect(installer.deleted).toBe(true);
    expect(runtime.disposed).toBe(true);
    expect(result.status.state).toBe("not_installed");
  });

  it("publishes reindex progress and forwards cooperative cancellation", async () => {
    const installer = new FakeInstaller(true);
    const runtime = new FakeRuntime();
    let job = reindexJob({ status: "running", progressCurrent: 2, progressTotal: 5 });
    const cancelReindexJob = vi.fn(async () => {
      job = reindexJob({
        status: "running",
        progressCurrent: 2,
        progressTotal: 5,
        cancelRequested: true,
      });
      return job;
    });
    const manager = new LocalEmbeddingManager({
      installer,
      runtime,
      getActiveEmbeddingModel: async () => null,
      reindex: async () => ({ jobId: job.id, status: "queued" }),
      getReindexJob: async () => job,
      cancelReindexJob,
    });

    const started = await manager.request({
      kind: "authorizeLocalEmbeddingReindex",
      modelId: manifest.modelId,
    });
    expect(started.status.reindex).toMatchObject({
      state: "running",
      progressCurrent: 2,
      progressTotal: 5,
    });

    const cancelled = await manager.request({
      kind: "cancelLocalEmbeddingReindex",
      modelId: manifest.modelId,
    });
    expect(cancelReindexJob).toHaveBeenCalledWith(job.id);
    expect(cancelled.status.reindex?.state).toBe("cancel_requested");
  });
});

class FakeInstaller {
  installed: boolean;
  cancelled = false;
  deleted = false;
  private onProgress: ((progress: LocalEmbeddingInstallProgress) => void) | undefined;
  private resolveInstall: ((status: LocalEmbeddingModelStatus) => void) | undefined;

  constructor(installed = false) {
    this.installed = installed;
  }

  async recover() {
    return this.installed;
  }

  async status() {
    return status(this.installed ? "installed" : "not_installed");
  }

  install(
    _manifest: typeof manifest,
    options: { onProgress: (progress: LocalEmbeddingInstallProgress) => void },
  ) {
    this.onProgress = options.onProgress;
    return new Promise<LocalEmbeddingModelStatus>((resolve) => {
      this.resolveInstall = resolve;
    });
  }

  retry(
    trustedManifest: typeof manifest,
    options: { onProgress: (progress: LocalEmbeddingInstallProgress) => void },
  ) {
    return this.install(trustedManifest, options);
  }

  progress(progress: LocalEmbeddingInstallProgress) {
    this.onProgress?.(progress);
  }

  finishInstall() {
    this.installed = true;
    this.resolveInstall?.(status("installed"));
  }

  cancel() {
    this.cancelled = true;
    return true;
  }

  async delete() {
    this.deleted = true;
    this.installed = false;
    return true;
  }
}

class FakeRuntime {
  loadCalls = 0;
  purposes: LocalEmbeddingPurpose[] = [];
  disposed = false;

  async load(modelId: string) {
    this.loadCalls += 1;
    return { modelId, backend: "wasm" as const, ready: true };
  }

  async embed(_modelId: string, purpose: LocalEmbeddingPurpose, inputs: string[]) {
    this.purposes.push(purpose);
    return inputs.map(() => Array.from({ length: manifest.dimension }, () => 0.01));
  }

  async dispose() {
    this.disposed = true;
  }
}

function createManager(installer: FakeInstaller, runtime: FakeRuntime) {
  return new LocalEmbeddingManager({
    installer,
    runtime,
    getActiveEmbeddingModel: async () => null,
    reindex: async () => ({ jobId: "job:unused", status: "done" }),
    getReindexJob: async () => undefined,
    cancelReindexJob: async () => reindexJob({ status: "failed" }),
  });
}

function reindexJob(overrides: Partial<JobSummary>): JobSummary {
  return {
    id: "job:local-reindex",
    type: "reindex_embeddings",
    status: "queued",
    attempts: 1,
    maxAttempts: 3,
    progressCurrent: 0,
    progressTotal: 1,
    cancelRequested: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function status(state: "not_installed" | "installed"): LocalEmbeddingModelStatus {
  const installed = state === "installed";
  return {
    modelId: manifest.modelId,
    state,
    downloadedBytes: installed ? totalBytes() : 0,
    totalBytes: totalBytes(),
    ...(installed ? { installedRevision: manifest.revision } : {}),
    ready: false,
    active: false,
    reindexRequired: installed,
  };
}

function activeSummary(): ActiveEmbeddingModelSummary {
  return {
    id: manifest.modelId,
    provider: "local-transformers",
    label: manifest.label,
    dimension: manifest.dimension,
    metric: "cosine",
    status: "active",
    updatedAt: new Date().toISOString(),
  };
}

function totalBytes() {
  return manifest.files.reduce((sum, file) => sum + file.bytes, 0);
}
