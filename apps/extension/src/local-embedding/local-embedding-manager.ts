import type { ActiveEmbeddingModelSummary, JobSummary, ReindexResult } from "@/src/shared/rpc";
import type {
  LocalEmbeddingBackend,
  LocalEmbeddingModelRequest,
  LocalEmbeddingModelResult,
  LocalEmbeddingModelStatus,
  LocalEmbeddingPurpose,
} from "./contracts";
import {
  type LocalEmbeddingInstallProgress,
  LocalEmbeddingModelInstaller,
} from "./model-installer";
import { LocalEmbeddingRuntimeHost } from "./runtime-host";
import {
  getTrustedLocalEmbeddingModelManifest,
  recommendedLocalEmbeddingModelManifest,
} from "./trusted-models";

interface LocalEmbeddingInstallerLike {
  recover(manifest: typeof recommendedLocalEmbeddingModelManifest): Promise<boolean>;
  status(
    manifest: typeof recommendedLocalEmbeddingModelManifest,
  ): Promise<LocalEmbeddingModelStatus>;
  install(
    manifest: typeof recommendedLocalEmbeddingModelManifest,
    options: { onProgress: (progress: LocalEmbeddingInstallProgress) => void },
  ): Promise<LocalEmbeddingModelStatus>;
  retry(
    manifest: typeof recommendedLocalEmbeddingModelManifest,
    options: { onProgress: (progress: LocalEmbeddingInstallProgress) => void },
  ): Promise<LocalEmbeddingModelStatus>;
  cancel(modelId: string): boolean;
  delete(modelId: string): Promise<boolean>;
}

interface LocalEmbeddingRuntimeLike {
  load(modelId: string): Promise<{
    modelId: string;
    backend: LocalEmbeddingBackend;
    ready: boolean;
    fallbackReason?: string;
  }>;
  embed(
    modelId: string,
    purpose: LocalEmbeddingPurpose,
    inputs: string[],
    signal?: AbortSignal,
  ): Promise<number[][]>;
  dispose(): Promise<void>;
}

export interface LocalEmbeddingManagerOptions {
  installer?: LocalEmbeddingInstallerLike;
  runtime?: LocalEmbeddingRuntimeLike;
  getActiveEmbeddingModel: () => Promise<ActiveEmbeddingModelSummary | null>;
  reindex: (model: {
    id: string;
    provider: "local-transformers";
    label: string;
    dimension: number;
    metric: "cosine";
  }) => Promise<ReindexResult>;
  getReindexJob: (jobId: string) => Promise<JobSummary | undefined>;
  cancelReindexJob: (jobId: string) => Promise<JobSummary>;
}

export class LocalEmbeddingManager {
  private readonly installer: LocalEmbeddingInstallerLike;
  private readonly runtime: LocalEmbeddingRuntimeLike;
  private installTask: Promise<void> | undefined;
  private loadTask: Promise<void> | undefined;
  private runtimeBackend: LocalEmbeddingBackend | undefined;
  private transientStatus: LocalEmbeddingModelStatus | undefined;
  private reindexJobId: string | undefined;

  constructor(private readonly options: LocalEmbeddingManagerOptions) {
    this.installer = options.installer ?? new LocalEmbeddingModelInstaller();
    this.runtime = options.runtime ?? new LocalEmbeddingRuntimeHost();
  }

  async recover() {
    await this.installer.recover(recommendedLocalEmbeddingModelManifest);
    return await this.status();
  }

  async request(request: LocalEmbeddingModelRequest): Promise<LocalEmbeddingModelResult> {
    switch (request.kind) {
      case "getLocalEmbeddingModelStatus":
        return { status: await this.status() };
      case "installLocalEmbeddingModel":
        this.assertTrustedModel(request.modelId);
        return { status: await this.startInstall(false) };
      case "cancelLocalEmbeddingModelInstall":
        this.assertTrustedModel(request.modelId);
        this.installer.cancel(request.modelId);
        return { status: await this.status() };
      case "retryLocalEmbeddingModelInstall":
        this.assertTrustedModel(request.modelId);
        return { status: await this.startInstall(true) };
      case "deleteLocalEmbeddingModel":
        this.assertTrustedModel(request.modelId);
        return { status: await this.delete() };
      case "testLocalEmbeddingModel":
        this.assertTrustedModel(request.modelId);
        return { status: await this.test() };
      case "authorizeLocalEmbeddingReindex":
        this.assertTrustedModel(request.modelId);
        return { status: await this.authorizeReindex() };
      case "cancelLocalEmbeddingReindex":
        this.assertTrustedModel(request.modelId);
        return { status: await this.cancelReindex() };
      default:
        return assertNever(request);
    }
  }

  async embed(
    modelId: string,
    purpose: LocalEmbeddingPurpose,
    inputs: string[],
    signal?: AbortSignal,
  ) {
    this.assertTrustedModel(modelId);
    await this.ensureRuntime();
    return await this.runtime.embed(modelId, purpose, inputs, signal);
  }

  async dispose() {
    await this.runtime.dispose();
    this.runtimeBackend = undefined;
    this.loadTask = undefined;
  }

  private async status() {
    const manifest = recommendedLocalEmbeddingModelManifest;
    const base = this.transientStatus ?? (await this.installer.status(manifest));
    const reindex = await this.loadReindexStatus();
    const active =
      (await this.options.getActiveEmbeddingModel().catch(() => null))?.id === manifest.modelId;
    const installed =
      base.state === "installed" ||
      base.state === "loading" ||
      base.state === "ready" ||
      this.runtimeBackend !== undefined;
    return {
      ...base,
      ...(this.runtimeBackend === undefined ? {} : { backend: this.runtimeBackend }),
      ready: this.runtimeBackend !== undefined,
      active,
      reindexRequired: installed && !active,
      ...(reindex === undefined ? {} : { reindex }),
    } satisfies LocalEmbeddingModelStatus;
  }

  private async startInstall(retry: boolean) {
    if (this.installTask !== undefined) return await this.status();
    const manifest = recommendedLocalEmbeddingModelManifest;
    const existing = await this.installer.status(manifest);
    if (existing.state === "installed") return await this.status();
    this.transientStatus = this.statusFromProgress({
      state: "downloading",
      modelId: manifest.modelId,
      downloadedBytes: 0,
      totalBytes: totalBytes(),
    });
    const install = retry
      ? this.installer.retry.bind(this.installer)
      : this.installer.install.bind(this.installer);
    const task = install(manifest, {
      onProgress: (progress) => {
        this.transientStatus = this.statusFromProgress(progress);
      },
    })
      .then((status) => {
        this.transientStatus = status;
      })
      .catch((error) => {
        if (errorCode(error) === "LOCAL_MODEL_CANCELLED") {
          this.transientStatus = undefined;
          return;
        }
        this.transientStatus = {
          modelId: manifest.modelId,
          state: "error",
          downloadedBytes: this.transientStatus?.downloadedBytes ?? 0,
          totalBytes: totalBytes(),
          ready: false,
          active: false,
          reindexRequired: false,
          error: {
            code: errorCode(error),
            message: boundedError(error),
          },
        };
      })
      .finally(() => {
        if (this.installTask === task) this.installTask = undefined;
      });
    this.installTask = task;
    void task;
    return await this.status();
  }

  private async test() {
    await this.ensureRuntime();
    const vectors = await this.runtime.embed(
      recommendedLocalEmbeddingModelManifest.modelId,
      "query",
      ["Clio local embedding runtime test."],
    );
    if (
      vectors.length !== 1 ||
      vectors[0]?.length !== recommendedLocalEmbeddingModelManifest.dimension
    ) {
      throw new Error("Local embedding runtime returned an invalid test vector.");
    }
    return await this.status();
  }

  private async authorizeReindex() {
    await this.ensureRuntime();
    const current = await this.loadReindexStatus();
    if (
      current?.state === "queued" ||
      current?.state === "running" ||
      current?.state === "cancel_requested"
    ) {
      return await this.status();
    }
    const manifest = recommendedLocalEmbeddingModelManifest;
    const result = await this.options.reindex({
      id: manifest.modelId,
      provider: "local-transformers",
      label: `${manifest.label} (${manifest.dimension}d)`,
      dimension: manifest.dimension,
      metric: "cosine",
    });
    this.reindexJobId = result.jobId;
    return await this.status();
  }

  private async cancelReindex() {
    if (this.reindexJobId === undefined) return await this.status();
    await this.options.cancelReindexJob(this.reindexJobId);
    return await this.status();
  }

  private async loadReindexStatus() {
    if (this.reindexJobId === undefined) return undefined;
    const job = await this.options.getReindexJob(this.reindexJobId).catch(() => undefined);
    if (job === undefined) {
      return {
        jobId: this.reindexJobId,
        state: "failed" as const,
        progressCurrent: 0,
        progressTotal: 1,
        error: "Embedding reindex job status is unavailable.",
      };
    }
    const cancelled =
      job.status === "failed" && job.lastError?.startsWith("EMBEDDING_REINDEX_CANCELLED:");
    return {
      jobId: job.id,
      state: cancelled
        ? ("cancelled" as const)
        : job.cancelRequested && (job.status === "queued" || job.status === "running")
          ? ("cancel_requested" as const)
          : job.status,
      progressCurrent: job.progressCurrent,
      progressTotal: Math.max(1, job.progressTotal),
      ...(job.status === "failed" && job.lastError !== undefined
        ? { error: cancelled ? "Embedding rebuild cancelled." : job.lastError }
        : {}),
    };
  }

  private async delete() {
    this.installer.cancel(recommendedLocalEmbeddingModelManifest.modelId);
    await this.installTask?.catch(() => undefined);
    await this.dispose();
    await this.installer.delete(recommendedLocalEmbeddingModelManifest.modelId);
    this.transientStatus = undefined;
    return await this.status();
  }

  private async ensureRuntime() {
    if (this.runtimeBackend !== undefined) return;
    if (this.loadTask !== undefined) return await this.loadTask;
    const manifest = recommendedLocalEmbeddingModelManifest;
    const installed = await this.installer.status(manifest);
    if (installed.state !== "installed") {
      throw new LocalEmbeddingManagerError(
        "LOCAL_MODEL_NOT_INSTALLED",
        "Install the local embedding model before loading it.",
      );
    }
    this.transientStatus = {
      ...installed,
      state: "loading",
    };
    const task = this.runtime
      .load(manifest.modelId)
      .then((health) => {
        this.runtimeBackend = health.backend;
        this.transientStatus = {
          ...installed,
          state: "ready",
          backend: health.backend,
          ready: true,
          reindexRequired: true,
        };
      })
      .catch((error) => {
        this.runtimeBackend = undefined;
        this.transientStatus = {
          ...installed,
          state: "error",
          ready: false,
          error: { code: errorCode(error), message: boundedError(error) },
        };
        throw error;
      })
      .finally(() => {
        if (this.loadTask === task) this.loadTask = undefined;
      });
    this.loadTask = task;
    return await task;
  }

  private statusFromProgress(progress: LocalEmbeddingInstallProgress): LocalEmbeddingModelStatus {
    return {
      ...progress,
      ready: false,
      active: false,
      reindexRequired: false,
    };
  }

  private assertTrustedModel(modelId: string) {
    if (getTrustedLocalEmbeddingModelManifest(modelId) === undefined) {
      throw new LocalEmbeddingManagerError(
        "LOCAL_MODEL_NOT_TRUSTED",
        "The requested local embedding model is not in the trusted catalog.",
      );
    }
  }
}

export class LocalEmbeddingManagerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LocalEmbeddingManagerError";
  }
}

function totalBytes() {
  return recommendedLocalEmbeddingModelManifest.files.reduce((sum, file) => sum + file.bytes, 0);
}

function errorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 100);
  }
  return "LOCAL_MODEL_ERROR";
}

function boundedError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function assertNever(value: never): never {
  throw new Error(`Unhandled local embedding request: ${JSON.stringify(value)}`);
}
