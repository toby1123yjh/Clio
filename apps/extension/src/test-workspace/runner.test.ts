import type { LocalEmbeddingModelStatus } from "@/src/local-embedding/contracts";
import type { MemorySummary } from "@/src/shared/rpc";
import { describe, expect, it, vi } from "vitest";
import type { TestWorkspaceBuildConfig } from "./contracts";
import {
  type TestWorkspaceRunnerDependencies,
  initializeTestWorkspace,
  removeTestWorkspaceSources,
} from "./runner";

describe("test workspace runner", () => {
  it("installs E5, imports every fixture, and rebuilds embeddings once", async () => {
    const statuses = [installedStatus(), activeStatus()];
    const dependencies = runnerDependencies({
      initialStatus: notInstalledStatus(),
      polledStatuses: statuses,
    });

    const result = await initializeTestWorkspace(config(), dependencies);

    expect(result).toMatchObject({ status: "completed", total: 5, saved: 5, failed: 0 });
    expect(dependencies.installEmbeddingModel).toHaveBeenCalledOnce();
    expect(dependencies.authorizeEmbeddingReindex).toHaveBeenCalledOnce();
    expect(dependencies.capturePage).toHaveBeenCalledOnce();
    expect(dependencies.captureSelection).toHaveBeenCalledOnce();
    expect(dependencies.captureMarkdown).toHaveBeenCalledTimes(2);
    expect(dependencies.capturePdf).toHaveBeenCalledOnce();
  });

  it("treats duplicate captures as an idempotent successful rerun", async () => {
    const dependencies = runnerDependencies({ captureStatus: "duplicate" });

    const result = await initializeTestWorkspace(config(), dependencies);

    expect(result).toMatchObject({ status: "completed", saved: 0, duplicates: 5, failed: 0 });
  });

  it("continues after one PDF failure and reports a partial corpus", async () => {
    const dependencies = runnerDependencies();
    vi.mocked(dependencies.fetchAsset).mockRejectedValueOnce(new Error("fixture asset missing"));

    const result = await initializeTestWorkspace(config(), dependencies);

    expect(result.status).toBe("partial");
    expect(result.failed).toBe(1);
    expect(result.failures[0]).toMatchObject({ fixtureId: "pdf-01" });
    expect(dependencies.authorizeEmbeddingReindex).toHaveBeenCalledOnce();
  });

  it("stops before ingestion when model installation fails", async () => {
    const dependencies = runnerDependencies({
      initialStatus: notInstalledStatus(),
      polledStatuses: [errorStatus("download failed")],
    });

    await expect(initializeTestWorkspace(config(), dependencies)).rejects.toThrow(
      "download failed",
    );
    expect(dependencies.capturePage).not.toHaveBeenCalled();
    expect(dependencies.authorizeEmbeddingReindex).not.toHaveBeenCalled();
  });

  it("reports a terminal embedding rebuild failure", async () => {
    const dependencies = runnerDependencies({
      polledStatuses: [reindexFailureStatus("vector write failed")],
      authorizeStatus: reindexingStatus(),
    });

    await expect(initializeTestWorkspace(config(), dependencies)).rejects.toThrow(
      "vector write failed",
    );
  });

  it("removes only namespaced test sources", async () => {
    const dependencies = runnerDependencies();
    vi.mocked(dependencies.listMemories).mockResolvedValue({
      items: [
        memory("test-one", "clio://test-fixture/v1/page/one"),
        memory("user-one", "https://example.com/article"),
        memory("test-two", "clio://test-fixture/v1/pdf/two"),
      ],
    });

    const result = await removeTestWorkspaceSources(config(), dependencies);

    expect(result).toEqual({ matched: 2, deleted: 2, failed: 0, failures: [] });
    expect(dependencies.deleteMemory).toHaveBeenCalledTimes(2);
    expect(dependencies.deleteMemory).toHaveBeenNthCalledWith(1, "test-one");
    expect(dependencies.deleteMemory).toHaveBeenNthCalledWith(2, "test-two");
  });
});

function runnerDependencies(
  options: {
    captureStatus?: "saved" | "duplicate";
    initialStatus?: LocalEmbeddingModelStatus;
    authorizeStatus?: LocalEmbeddingModelStatus;
    polledStatuses?: LocalEmbeddingModelStatus[];
  } = {},
): TestWorkspaceRunnerDependencies {
  const statusSequence = [
    options.initialStatus ?? activeStatus(),
    ...(options.polledStatuses ?? [activeStatus()]),
  ];
  const captureStatus = options.captureStatus ?? "saved";
  const captureResult = () =>
    Promise.resolve({ status: captureStatus, memory: memory("captured", "clio://capture") });
  return {
    getEmbeddingStatus: vi.fn(async () => statusSequence.shift() ?? activeStatus()),
    installEmbeddingModel: vi.fn(async () => options.initialStatus ?? notInstalledStatus()),
    authorizeEmbeddingReindex: vi.fn(async () => options.authorizeStatus ?? reindexingStatus()),
    capturePage: vi.fn(captureResult),
    captureSelection: vi.fn(captureResult),
    captureMarkdown: vi.fn(captureResult),
    capturePdf: vi.fn(captureResult),
    listMemories: vi.fn(async () => ({ items: [] })),
    deleteMemory: vi.fn(async (id) => ({ deleted: true, id })),
    fetchAsset: vi.fn(async () => new TextEncoder().encode("%PDF-test").buffer),
    sleep: vi.fn(async () => undefined),
    now: () => "2026-07-17T00:00:00.000Z",
    pollIntervalMs: 0,
    maxPolls: 10,
    onProgress: vi.fn(),
  };
}

function config(): TestWorkspaceBuildConfig {
  return {
    schemaVersion: 1,
    corpusId: "clio-validation-v1",
    namespace: "clio://test-fixture/v1/",
    pdfs: [
      {
        fileName: "paper.pdf",
        assetPath: "assets/test-workspace/01-paper.pdf",
        byteLength: 9,
      },
    ],
  };
}

function notInstalledStatus(): LocalEmbeddingModelStatus {
  return baseStatus({ state: "not_installed" });
}

function installedStatus(): LocalEmbeddingModelStatus {
  return baseStatus({
    state: "installed",
    downloadedBytes: 10,
    totalBytes: 10,
    reindexRequired: true,
  });
}

function reindexingStatus(): LocalEmbeddingModelStatus {
  return baseStatus({
    state: "ready",
    ready: true,
    reindexRequired: true,
    reindex: {
      jobId: "job-1",
      state: "queued",
      progressCurrent: 0,
      progressTotal: 5,
    },
  });
}

function activeStatus(): LocalEmbeddingModelStatus {
  return baseStatus({
    state: "ready",
    ready: true,
    active: true,
    reindexRequired: false,
    reindex: {
      jobId: "job-1",
      state: "done",
      progressCurrent: 5,
      progressTotal: 5,
    },
  });
}

function errorStatus(message: string): LocalEmbeddingModelStatus {
  return baseStatus({ state: "error", error: { code: "LOCAL_MODEL_ERROR", message } });
}

function reindexFailureStatus(message: string): LocalEmbeddingModelStatus {
  return baseStatus({
    state: "ready",
    ready: true,
    reindexRequired: true,
    reindex: {
      jobId: "job-1",
      state: "failed",
      progressCurrent: 2,
      progressTotal: 5,
      error: message,
    },
  });
}

function baseStatus(overrides: Partial<LocalEmbeddingModelStatus>): LocalEmbeddingModelStatus {
  return {
    modelId: "local-transformers:test",
    state: "installed",
    downloadedBytes: 10,
    totalBytes: 10,
    ready: false,
    active: false,
    reindexRequired: false,
    ...overrides,
  };
}

function memory(id: string, sourceUrl: string): MemorySummary {
  return {
    id,
    sourceKind: "page",
    sourceUrl,
    sourceTitle: id,
    capturedAt: "2026-07-17T00:00:00.000Z",
    excerpt: id,
    version: { groupKey: sourceUrl, versionNo: 1, isCurrent: true },
  };
}
