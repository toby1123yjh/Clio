export const localEmbeddingManifestSchemaVersion = 1 as const;

export type LocalEmbeddingDtype = "int8";
export type LocalEmbeddingPooling = "cls" | "mean";
export type LocalEmbeddingBackend = "webgpu" | "wasm";
export type LocalEmbeddingPurpose = "query" | "document";

export interface LocalEmbeddingModelFile {
  path: string;
  url: string;
  bytes: number;
  sha256: string;
}

export interface LocalEmbeddingModelManifest {
  schemaVersion: typeof localEmbeddingManifestSchemaVersion;
  modelId: string;
  repository: string;
  revision: string;
  label: string;
  license: string;
  dtype: LocalEmbeddingDtype;
  dimension: number;
  metric: "cosine";
  maxInputTokens: number;
  runtime: {
    task: "feature-extraction";
    pooling: LocalEmbeddingPooling;
    normalize: true;
    queryPrefix: string;
    documentPrefix: string;
  };
  files: readonly LocalEmbeddingModelFile[];
}

export const localEmbeddingModelStates = [
  "not_installed",
  "downloading",
  "verifying",
  "installed",
  "loading",
  "ready",
  "error",
] as const;

export type LocalEmbeddingModelState = (typeof localEmbeddingModelStates)[number];

export type LocalEmbeddingReindexState =
  | "queued"
  | "running"
  | "cancel_requested"
  | "done"
  | "failed"
  | "cancelled";

export interface LocalEmbeddingReindexStatus {
  jobId: string;
  state: LocalEmbeddingReindexState;
  progressCurrent: number;
  progressTotal: number;
  error?: string;
}

export interface LocalEmbeddingModelStatus {
  modelId: string;
  state: LocalEmbeddingModelState;
  downloadedBytes: number;
  totalBytes: number;
  currentFile?: string;
  backend?: LocalEmbeddingBackend;
  installedRevision?: string;
  ready: boolean;
  active: boolean;
  reindexRequired: boolean;
  reindex?: LocalEmbeddingReindexStatus;
  error?: {
    code: string;
    message: string;
  };
}

export type LocalEmbeddingModelRequest =
  | { kind: "getLocalEmbeddingModelStatus" }
  | { kind: "installLocalEmbeddingModel"; modelId: string }
  | { kind: "cancelLocalEmbeddingModelInstall"; modelId: string }
  | { kind: "retryLocalEmbeddingModelInstall"; modelId: string }
  | { kind: "deleteLocalEmbeddingModel"; modelId: string }
  | { kind: "testLocalEmbeddingModel"; modelId: string }
  | { kind: "authorizeLocalEmbeddingReindex"; modelId: string }
  | { kind: "cancelLocalEmbeddingReindex"; modelId: string };

export interface LocalEmbeddingModelResult {
  status: LocalEmbeddingModelStatus;
}

export function deriveLocalEmbeddingModelId(
  identity: Pick<LocalEmbeddingModelManifest, "repository" | "revision" | "dtype" | "dimension">,
) {
  const repository = identity.repository.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `local-transformers:${repository}:${identity.revision}:${identity.dtype}:d${identity.dimension}`;
}

export function isLocalEmbeddingModelManifest(
  value: unknown,
): value is LocalEmbeddingModelManifest {
  if (!isRecord(value)) return false;
  if (
    value.schemaVersion !== localEmbeddingManifestSchemaVersion ||
    typeof value.repository !== "string" ||
    !isRepository(value.repository) ||
    typeof value.revision !== "string" ||
    !/^[a-f0-9]{40}$/.test(value.revision) ||
    typeof value.modelId !== "string" ||
    typeof value.label !== "string" ||
    value.label.trim().length === 0 ||
    typeof value.license !== "string" ||
    value.license.trim().length === 0 ||
    value.dtype !== "int8" ||
    !isPositiveInteger(value.dimension) ||
    value.metric !== "cosine" ||
    !isPositiveInteger(value.maxInputTokens) ||
    !isLocalEmbeddingRuntime(value.runtime) ||
    !Array.isArray(value.files) ||
    value.files.length === 0
  ) {
    return false;
  }

  if (
    value.modelId !==
    deriveLocalEmbeddingModelId({
      repository: value.repository,
      revision: value.revision,
      dtype: value.dtype,
      dimension: value.dimension,
    })
  ) {
    return false;
  }

  const paths = new Set<string>();
  for (const file of value.files) {
    if (!isLocalEmbeddingModelFile(file, value.repository, value.revision)) return false;
    if (paths.has(file.path)) return false;
    paths.add(file.path);
  }
  return true;
}

export function assertLocalEmbeddingModelManifest(
  value: unknown,
): asserts value is LocalEmbeddingModelManifest {
  if (!isLocalEmbeddingModelManifest(value)) {
    throw new Error("Invalid trusted local embedding model manifest.");
  }
}

export function isLocalEmbeddingModelRequest(value: unknown): value is LocalEmbeddingModelRequest {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "getLocalEmbeddingModelStatus") return true;
  if (!isModelId(value.modelId)) return false;
  return (
    value.kind === "installLocalEmbeddingModel" ||
    value.kind === "cancelLocalEmbeddingModelInstall" ||
    value.kind === "retryLocalEmbeddingModelInstall" ||
    value.kind === "deleteLocalEmbeddingModel" ||
    value.kind === "testLocalEmbeddingModel" ||
    value.kind === "authorizeLocalEmbeddingReindex" ||
    value.kind === "cancelLocalEmbeddingReindex"
  );
}

export function isLocalEmbeddingModelStatus(value: unknown): value is LocalEmbeddingModelStatus {
  if (
    !isRecord(value) ||
    !isModelId(value.modelId) ||
    !localEmbeddingModelStates.includes(value.state as LocalEmbeddingModelState) ||
    !isNonNegativeInteger(value.downloadedBytes) ||
    !isNonNegativeInteger(value.totalBytes) ||
    value.downloadedBytes > value.totalBytes ||
    (value.currentFile !== undefined &&
      (typeof value.currentFile !== "string" || !isSafeRelativePath(value.currentFile))) ||
    (value.backend !== undefined && value.backend !== "webgpu" && value.backend !== "wasm") ||
    (value.installedRevision !== undefined &&
      (typeof value.installedRevision !== "string" ||
        !/^[a-f0-9]{40}$/.test(value.installedRevision))) ||
    typeof value.ready !== "boolean" ||
    typeof value.active !== "boolean" ||
    typeof value.reindexRequired !== "boolean" ||
    (value.reindex !== undefined && !isLocalEmbeddingReindexStatus(value.reindex)) ||
    (value.error !== undefined && !isLocalEmbeddingError(value.error))
  ) {
    return false;
  }
  return true;
}

function isLocalEmbeddingReindexStatus(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.jobId === "string" &&
    value.jobId.length > 0 &&
    value.jobId.length <= 240 &&
    (value.state === "queued" ||
      value.state === "running" ||
      value.state === "cancel_requested" ||
      value.state === "done" ||
      value.state === "failed" ||
      value.state === "cancelled") &&
    isNonNegativeInteger(value.progressCurrent) &&
    isPositiveInteger(value.progressTotal) &&
    value.progressCurrent <= value.progressTotal &&
    (value.error === undefined ||
      (typeof value.error === "string" && value.error.length > 0 && value.error.length <= 500))
  );
}

function isLocalEmbeddingRuntime(value: unknown) {
  return (
    isRecord(value) &&
    value.task === "feature-extraction" &&
    (value.pooling === "cls" || value.pooling === "mean") &&
    value.normalize === true &&
    typeof value.queryPrefix === "string" &&
    typeof value.documentPrefix === "string"
  );
}

function isLocalEmbeddingModelFile(value: unknown, repository: string, revision: string) {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    !isSafeRelativePath(value.path) ||
    typeof value.url !== "string" ||
    !isPositiveInteger(value.bytes) ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sha256)
  ) {
    return false;
  }
  const expectedUrl = `https://huggingface.co/${repository}/resolve/${revision}/${value.path}`;
  return value.url === expectedUrl;
}

function isLocalEmbeddingError(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    value.code.length > 0 &&
    value.code.length <= 100 &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    value.message.length <= 500
  );
}

function isRepository(value: string) {
  return /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(value);
}

function isModelId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 240;
}

function isSafeRelativePath(value: string) {
  return (
    value.length > 0 &&
    value.length <= 240 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    /^[A-Za-z0-9._/-]+$/.test(value) &&
    value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
