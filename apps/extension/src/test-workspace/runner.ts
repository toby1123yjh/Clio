import type { LocalEmbeddingModelStatus } from "@/src/local-embedding/contracts";
import type {
  CaptureBasePayload,
  CaptureMarkdownPayload,
  CapturePdfPayload,
  CaptureResult,
  CaptureSelectionPayload,
  DeleteMemoryResult,
  ListMemoriesResult,
} from "@/src/shared/rpc";
import type { TestWorkspaceBuildConfig } from "./contracts";
import { type TestWorkspaceFixture, buildTestWorkspaceFixtures } from "./fixtures";

export type TestWorkspacePhase =
  | "checking_model"
  | "installing_model"
  | "importing_sources"
  | "rebuilding_embeddings"
  | "completed"
  | "partial"
  | "failed"
  | "removing_sources";

export interface TestWorkspaceProgress {
  phase: TestWorkspacePhase;
  completed: number;
  total: number;
  message: string;
  currentItem?: string;
}

export interface TestWorkspaceInitializationResult {
  status: "completed" | "partial";
  total: number;
  saved: number;
  duplicates: number;
  failed: number;
  failures: Array<{ fixtureId: string; message: string }>;
}

export interface TestWorkspaceCleanupResult {
  matched: number;
  deleted: number;
  failed: number;
  failures: Array<{ sourceId: string; message: string }>;
}

export interface TestWorkspaceRunnerDependencies {
  getEmbeddingStatus: () => Promise<LocalEmbeddingModelStatus>;
  installEmbeddingModel: () => Promise<LocalEmbeddingModelStatus>;
  authorizeEmbeddingReindex: () => Promise<LocalEmbeddingModelStatus>;
  capturePage: (payload: CaptureBasePayload) => Promise<CaptureResult>;
  captureSelection: (payload: CaptureSelectionPayload) => Promise<CaptureResult>;
  captureMarkdown: (payload: CaptureMarkdownPayload) => Promise<CaptureResult>;
  capturePdf: (payload: CapturePdfPayload) => Promise<CaptureResult>;
  listMemories: (limit: number) => Promise<ListMemoriesResult>;
  deleteMemory: (id: string) => Promise<DeleteMemoryResult>;
  fetchAsset: (assetPath: string) => Promise<ArrayBuffer>;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => string;
  pollIntervalMs?: number;
  maxPolls?: number;
  onProgress?: (progress: TestWorkspaceProgress) => void;
}

export async function initializeTestWorkspace(
  config: TestWorkspaceBuildConfig,
  dependencies: TestWorkspaceRunnerDependencies,
): Promise<TestWorkspaceInitializationResult> {
  const fixtures = buildTestWorkspaceFixtures(config);
  emit(dependencies, {
    phase: "checking_model",
    completed: 0,
    total: 1,
    message: "Checking the local embedding model.",
  });
  let embeddingStatus = await dependencies.getEmbeddingStatus();
  assertEmbeddingHealthy(embeddingStatus, "Local embedding status check failed.");
  if (!isEmbeddingInstalled(embeddingStatus)) {
    emit(dependencies, {
      phase: "installing_model",
      completed: embeddingStatus.downloadedBytes,
      total: Math.max(1, embeddingStatus.totalBytes),
      message: "Installing Multilingual E5 Base.",
      currentItem: embeddingStatus.currentFile,
    });
    if (embeddingStatus.state !== "downloading" && embeddingStatus.state !== "verifying") {
      embeddingStatus = await dependencies.installEmbeddingModel();
    }
    embeddingStatus = await waitForEmbeddingInstall(embeddingStatus, dependencies);
  }

  let saved = 0;
  let duplicates = 0;
  const failures: Array<{ fixtureId: string; message: string }> = [];
  for (const [index, fixture] of fixtures.entries()) {
    emit(dependencies, {
      phase: "importing_sources",
      completed: index,
      total: fixtures.length,
      message: `Importing source ${index + 1} of ${fixtures.length}.`,
      currentItem: fixture.sourceTitle,
    });
    try {
      const result = await captureFixture(fixture, dependencies);
      if (result.status === "duplicate") duplicates += 1;
      else saved += 1;
    } catch (error) {
      failures.push({ fixtureId: fixture.id, message: errorMessage(error) });
    }
  }

  emit(dependencies, {
    phase: "rebuilding_embeddings",
    completed: 0,
    total: Math.max(1, fixtures.length),
    message: "Starting one embedding rebuild for the imported corpus.",
  });
  embeddingStatus = await dependencies.authorizeEmbeddingReindex();
  await waitForEmbeddingReindex(embeddingStatus, dependencies);

  const status = failures.length === 0 ? "completed" : "partial";
  const result = {
    status,
    total: fixtures.length,
    saved,
    duplicates,
    failed: failures.length,
    failures,
  } satisfies TestWorkspaceInitializationResult;
  emit(dependencies, {
    phase: status,
    completed: fixtures.length - failures.length,
    total: fixtures.length,
    message:
      status === "completed"
        ? `Test workspace is ready: ${saved} saved, ${duplicates} already present.`
        : `Test workspace is partially ready: ${failures.length} source imports failed.`,
  });
  return result;
}

export async function removeTestWorkspaceSources(
  config: TestWorkspaceBuildConfig,
  dependencies: TestWorkspaceRunnerDependencies,
): Promise<TestWorkspaceCleanupResult> {
  const memories = await dependencies.listMemories(100);
  const matches = memories.items.filter((memory) => memory.sourceUrl.startsWith(config.namespace));
  const failures: Array<{ sourceId: string; message: string }> = [];
  let deleted = 0;
  for (const [index, memory] of matches.entries()) {
    emit(dependencies, {
      phase: "removing_sources",
      completed: index,
      total: Math.max(1, matches.length),
      message: `Removing test source ${index + 1} of ${matches.length}.`,
      currentItem: memory.sourceTitle,
    });
    try {
      const result = await dependencies.deleteMemory(memory.id);
      if (result.deleted) deleted += 1;
    } catch (error) {
      failures.push({ sourceId: memory.id, message: errorMessage(error) });
    }
  }
  return {
    matched: matches.length,
    deleted,
    failed: failures.length,
    failures,
  };
}

async function captureFixture(
  fixture: TestWorkspaceFixture,
  dependencies: TestWorkspaceRunnerDependencies,
) {
  const capturedAt = dependencies.now?.() ?? new Date().toISOString();
  switch (fixture.kind) {
    case "page":
      return await dependencies.capturePage({
        sourceUrl: fixture.sourceUrl,
        sourceTitle: fixture.sourceTitle,
        normalizedText: fixture.normalizedText,
        capturedAt,
        metadata: fixture.metadata,
      });
    case "selection":
      return await dependencies.captureSelection({
        sourceUrl: fixture.sourceUrl,
        sourceTitle: fixture.sourceTitle,
        normalizedText: fixture.normalizedText,
        contextBefore: fixture.contextBefore,
        contextAfter: fixture.contextAfter,
        textFragment: fixture.textFragment,
        capturedAt,
        metadata: fixture.metadata,
      });
    case "markdown":
      return await dependencies.captureMarkdown({
        sourceUrl: fixture.sourceUrl,
        sourceTitle: fixture.sourceTitle,
        markdownText: fixture.markdownText,
        capturedAt,
        metadata: fixture.metadata,
      });
    case "pdf": {
      const bytes = await dependencies.fetchAsset(fixture.assetPath);
      if (bytes.byteLength !== fixture.byteLength) {
        throw new Error(
          `Staged PDF byte length mismatch for ${fixture.sourceTitle}: expected ${fixture.byteLength}, received ${bytes.byteLength}.`,
        );
      }
      return await dependencies.capturePdf({
        sourceUrl: fixture.sourceUrl,
        sourceTitle: fixture.sourceTitle,
        bytes,
        capturedAt,
        metadata: fixture.metadata,
      });
    }
  }
}

async function waitForEmbeddingInstall(
  initialStatus: LocalEmbeddingModelStatus,
  dependencies: TestWorkspaceRunnerDependencies,
) {
  return await pollEmbeddingStatus(initialStatus, dependencies, (status) => {
    emit(dependencies, {
      phase: "installing_model",
      completed: status.downloadedBytes,
      total: Math.max(1, status.totalBytes),
      message: "Installing Multilingual E5 Base.",
      currentItem: status.currentFile,
    });
    if (isEmbeddingInstalled(status)) return "done";
    assertEmbeddingHealthy(status, "Local embedding installation failed.");
    return "continue";
  });
}

async function waitForEmbeddingReindex(
  initialStatus: LocalEmbeddingModelStatus,
  dependencies: TestWorkspaceRunnerDependencies,
) {
  return await pollEmbeddingStatus(initialStatus, dependencies, (status) => {
    const reindex = status.reindex;
    emit(dependencies, {
      phase: "rebuilding_embeddings",
      completed: reindex?.progressCurrent ?? 0,
      total: Math.max(1, reindex?.progressTotal ?? 1),
      message: "Rebuilding embeddings for the test corpus.",
    });
    assertEmbeddingHealthy(status, "Embedding rebuild failed.");
    if (reindex?.state === "failed" || reindex?.state === "cancelled") {
      throw new Error(reindex.error ?? "Embedding rebuild did not complete.");
    }
    if (status.active && (reindex === undefined || reindex.state === "done")) {
      return "done";
    }
    return "continue";
  });
}

async function pollEmbeddingStatus(
  initialStatus: LocalEmbeddingModelStatus,
  dependencies: TestWorkspaceRunnerDependencies,
  inspect: (status: LocalEmbeddingModelStatus) => "continue" | "done",
) {
  let status = initialStatus;
  const maxPolls = dependencies.maxPolls ?? 2400;
  const sleep = dependencies.sleep ?? defaultSleep;
  const pollIntervalMs = dependencies.pollIntervalMs ?? 750;
  for (let poll = 0; poll < maxPolls; poll += 1) {
    if (inspect(status) === "done") return status;
    await sleep(pollIntervalMs);
    status = await dependencies.getEmbeddingStatus();
  }
  throw new Error("Timed out while waiting for the local embedding operation.");
}

function isEmbeddingInstalled(status: LocalEmbeddingModelStatus) {
  return status.state === "installed" || status.state === "ready" || status.ready;
}

function assertEmbeddingHealthy(status: LocalEmbeddingModelStatus, fallback: string) {
  if (status.error !== undefined) throw new Error(status.error.message);
  if (status.state === "error") throw new Error(fallback);
}

function emit(dependencies: TestWorkspaceRunnerDependencies, progress: TestWorkspaceProgress) {
  dependencies.onProgress?.(progress);
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
