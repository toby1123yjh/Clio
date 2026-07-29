import type { LocalEmbeddingModelStatus } from "@/src/local-embedding/contracts";
import { recommendedLocalEmbeddingModelManifest } from "@/src/local-embedding/trusted-models";
import type { MemoryDetail } from "@/src/shared/rpc";
import { describe, expect, it } from "vitest";
import { isComposerSubmitKeyEvent } from "../app/composer-keyboard";
import type { RailDialogueMessage } from "../app/rail-state";
import {
  assistantThinkingDotCount,
  assistantThinkingIndicatorClassName,
} from "../app/thinking-indicator";
import {
  buildCitationDetailMetrics,
  buildCitationGraphModel,
  buildLocalEmbeddingUiState,
  isMarkdownMemoryDetail,
  pdfPreviewExpandedForMemory,
  pdfPreviewStatusMessage,
} from "./RailShell";

function keyEvent(input: {
  key: string;
  code?: string;
  shiftKey?: boolean;
  isComposing?: boolean;
}) {
  return {
    key: input.key,
    code: input.code ?? input.key,
    shiftKey: input.shiftKey ?? false,
    nativeEvent: {
      isComposing: input.isComposing ?? false,
    },
  };
}

function assistantMessage(overrides: Partial<RailDialogueMessage> = {}): RailDialogueMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    content: "Answer",
    createdAt: "2026-07-06T00:00:00.000Z",
    scope: "general",
    status: "completed",
    citations: [],
    worldKnowledge: [],
    ...overrides,
  };
}

describe("isComposerSubmitKeyEvent", () => {
  it("accepts plain Enter and numpad Enter", () => {
    expect(isComposerSubmitKeyEvent(keyEvent({ key: "Enter" }))).toBe(true);
    expect(isComposerSubmitKeyEvent(keyEvent({ code: "NumpadEnter", key: "Enter" }))).toBe(true);
  });

  it("keeps Shift+Enter and composing Enter from submitting", () => {
    expect(isComposerSubmitKeyEvent(keyEvent({ key: "Enter", shiftKey: true }))).toBe(false);
    expect(isComposerSubmitKeyEvent(keyEvent({ key: "Enter", isComposing: true }))).toBe(false);
  });

  it("handles Windows IME Process key events when the physical key is Enter", () => {
    expect(isComposerSubmitKeyEvent(keyEvent({ code: "Enter", key: "Process" }))).toBe(true);
    expect(isComposerSubmitKeyEvent(keyEvent({ code: "KeyA", key: "Process" }))).toBe(false);
  });
});

describe("assistant thinking indicator", () => {
  it("uses exactly three animated dots instead of a static text-only placeholder", () => {
    expect(assistantThinkingIndicatorClassName).toBe("clio-thinking-indicator");
    expect(assistantThinkingDotCount).toBe(3);
  });
});

describe("pdfPreviewStatusMessage", () => {
  it("surfaces the persisted raw-file failure message", () => {
    const detail = {
      id: "pdf-1",
      sourceKind: "page",
      sourceUrl: "clio://upload/paper.pdf",
      sourceTitle: "paper.pdf",
      capturedAt: "2026-07-13T00:00:00.000Z",
      excerpt: "Paper",
      version: { groupKey: "pdf-1", versionNo: 1, isCurrent: true },
      normalizedText: "Paper",
      chunks: [],
      metadata: {
        pdf_raw_file: {
          status: "persist_failed",
          message: "Illegal invocation",
        },
      },
    } satisfies MemoryDetail;

    expect(pdfPreviewStatusMessage(detail, null)).toBe(
      "Raw PDF persistence failed: Illegal invocation",
    );
  });
});

describe("pdfPreviewExpandedForMemory", () => {
  it("keeps PDF evidence collapsed until the current document is explicitly expanded", () => {
    expect(pdfPreviewExpandedForMemory(null, "pdf-1")).toBe(false);
    expect(pdfPreviewExpandedForMemory({ memoryId: "pdf-1", expanded: true }, "pdf-1")).toBe(true);
    expect(pdfPreviewExpandedForMemory({ memoryId: "pdf-1", expanded: true }, "pdf-2")).toBe(false);
    expect(pdfPreviewExpandedForMemory({ memoryId: "pdf-1", expanded: false }, "pdf-1")).toBe(
      false,
    );
  });
});

describe("isMarkdownMemoryDetail", () => {
  const detail = {
    id: "markdown-1",
    sourceKind: "page",
    sourceUrl: "clio://upload/notes",
    sourceTitle: "notes",
    capturedAt: "2026-07-18T00:00:00.000Z",
    excerpt: "Notes",
    version: { groupKey: "markdown-1", versionNo: 1, isCurrent: true },
    normalizedText: "# Notes\n\n- Item",
    chunks: [],
    metadata: {},
  } satisfies MemoryDetail;

  it("recognizes the Markdown adapter metadata used by uploaded documents", () => {
    expect(
      isMarkdownMemoryDetail({
        ...detail,
        metadata: { adapter: "markdown", source_type: "markdown" },
      }),
    ).toBe(true);
  });

  it("falls back to Markdown upload file extensions without treating PDF text as Markdown", () => {
    expect(
      isMarkdownMemoryDetail({
        ...detail,
        sourceUrl: "clio://upload/notes.markdown?version=1",
      }),
    ).toBe(true);
    expect(
      isMarkdownMemoryDetail({
        ...detail,
        sourceUrl: "clio://upload/paper.pdf",
        metadata: { adapter: "pdf", source_type: "pdf" },
      }),
    ).toBe(false);
  });
});

describe("buildLocalEmbeddingUiState", () => {
  it("keeps actions disabled while status is loading", () => {
    expect(buildLocalEmbeddingUiState(null)).toMatchObject({
      state: "checking",
      statusLabel: "Checking",
      primaryAction: null,
      canInstall: false,
      canTest: false,
      canRebuild: false,
      canDelete: false,
    });
  });

  it.each([
    {
      name: "not installed",
      status: localEmbeddingStatus({ state: "not_installed" }),
      expected: { primaryAction: "install", canInstall: true, canDelete: false },
    },
    {
      name: "downloading",
      status: localEmbeddingStatus({ state: "downloading", downloadedBytes: 64 }),
      expected: {
        primaryAction: "cancel",
        canCancel: true,
        progressVisible: true,
        progressPercent: 50,
      },
    },
    {
      name: "verifying",
      status: localEmbeddingStatus({ state: "verifying", downloadedBytes: 128 }),
      expected: { primaryAction: null, progressVisible: true, progressPercent: 100 },
    },
    {
      name: "installed",
      status: localEmbeddingStatus({ state: "installed", installedRevision: revision }),
      expected: {
        installed: true,
        primaryAction: "test",
        canTest: true,
        canDelete: true,
      },
    },
    {
      name: "loading",
      status: localEmbeddingStatus({ state: "loading", installedRevision: revision }),
      expected: { installed: true, primaryAction: null, canDelete: true },
    },
    {
      name: "ready and awaiting activation",
      status: localEmbeddingStatus({
        state: "ready",
        installedRevision: revision,
        ready: true,
        reindexRequired: true,
      }),
      expected: {
        tone: "success",
        primaryAction: "rebuild",
        canTest: true,
        canRebuild: true,
        canDelete: true,
      },
    },
    {
      name: "active",
      status: localEmbeddingStatus({
        state: "ready",
        installedRevision: revision,
        ready: true,
        active: true,
      }),
      expected: {
        active: true,
        primaryAction: null,
        canTest: true,
        canRebuild: true,
      },
    },
    {
      name: "reindex running",
      status: localEmbeddingStatus({
        state: "ready",
        installedRevision: revision,
        ready: true,
        reindexRequired: true,
        reindex: {
          jobId: "job:embedding-reindex",
          state: "running",
          progressCurrent: 2,
          progressTotal: 5,
        },
      }),
      expected: {
        statusLabel: "Rebuilding index",
        primaryAction: "cancel_reindex",
        canCancelReindex: true,
        canTest: false,
        canRebuild: false,
        canDelete: false,
        progressVisible: true,
        progressPercent: 40,
      },
    },
    {
      name: "reindex failed",
      status: localEmbeddingStatus({
        state: "ready",
        installedRevision: revision,
        ready: true,
        reindexRequired: true,
        reindex: {
          jobId: "job:embedding-reindex",
          state: "failed",
          progressCurrent: 2,
          progressTotal: 5,
          error: "Embedding provider failed.",
        },
      }),
      expected: {
        statusLabel: "Rebuild failed",
        tone: "error",
        primaryAction: "rebuild",
        canRebuild: true,
      },
    },
    {
      name: "install error",
      status: localEmbeddingStatus({
        state: "error",
        error: { code: "NETWORK", message: "Download failed" },
      }),
      expected: { tone: "error", primaryAction: "retry", canRetry: true, canDelete: false },
    },
    {
      name: "runtime error",
      status: localEmbeddingStatus({
        state: "error",
        installedRevision: revision,
        error: { code: "RUNTIME", message: "Runtime failed" },
      }),
      expected: {
        tone: "error",
        installed: true,
        primaryAction: "test",
        canTest: true,
        canDelete: true,
      },
    },
  ])("projects the $name state", ({ status, expected }) => {
    expect(buildLocalEmbeddingUiState(status)).toMatchObject(expected);
  });
});

describe("citation detail helpers", () => {
  it("builds compact validation metrics with quality, judge, and retry state", () => {
    const metrics = buildCitationDetailMetrics({
      status: "warning",
      reason: "unsupported_memory_claim",
      evidenceCount: 3,
      memoryEvidenceCount: 2,
      citationCount: 5,
      validCitationCount: 4,
      validMemoryCitationCount: 3,
      claimCount: 4,
      coveredClaimCount: 2,
      uncoveredClaimCount: 2,
      evidenceQuality: "weak",
      supportCheck: "semantic_unsupported",
      semanticJudge: {
        status: "unsupported",
        checkedClaimCount: 4,
        unsupportedClaimCount: 2,
        providerKind: "chat",
      },
      retry: {
        attempted: true,
        count: 1,
        exhausted: true,
      },
    });

    expect(metrics).toEqual([
      { label: "Evidence", value: "2/3" },
      { label: "Claims", value: "2/4" },
      { label: "Citations", value: "3/5" },
      { label: "Quality", value: "weak" },
      { label: "Judge", value: "unsupported" },
      { label: "Retry", value: "1 exhausted" },
    ]);
  });

  it("caps graph projection and dedupes repeated evidence ids", () => {
    const model = buildCitationGraphModel(
      assistantMessage({
        citations: [
          citation("cite-1", "memory:a:chunk:1", "Source A"),
          citation("cite-2", "memory:a:chunk:1", "Source A duplicate"),
          citation("cite-3", "memory:b:chunk:1", "Source B"),
          citation("cite-4", "memory:c:chunk:1", "Source C"),
          citation("cite-5", "memory:d:chunk:1", "Source D"),
          citation("cite-6", "memory:e:chunk:1", "Source E"),
        ],
        citationValidation: {
          status: "warning",
          reason: "unsupported_memory_claim",
          evidenceCount: 6,
          memoryEvidenceCount: 6,
          citationCount: 6,
          validCitationCount: 6,
          validMemoryCitationCount: 6,
          uncoveredClaims: [
            { text: "Claim one", position: 0, reason: "semantic_unsupported" },
            { text: "Claim two", position: 1, reason: "semantic_unsupported" },
            { text: "Claim three", position: 2, reason: "semantic_unsupported" },
            { text: "Claim four", position: 3, reason: "semantic_unsupported" },
          ],
        },
      }),
    );

    expect(model).not.toBeNull();
    expect(model?.claimNodes).toHaveLength(3);
    expect(model?.citationNodes).toHaveLength(4);
    expect(model?.omittedClaimCount).toBe(1);
    expect(model?.omittedCitationCount).toBe(1);
    expect(model?.citationNodes.map((node) => node.label)).toEqual([
      "Source A",
      "Source B",
      "Source C",
      "Source D",
    ]);
  });

  it("does not build a graph projection for assistant messages without validation", () => {
    expect(buildCitationGraphModel(assistantMessage())).toBeNull();
  });
});

function citation(id: string, evidenceId: string, sourceTitle: string) {
  return {
    id,
    evidenceId,
    label: sourceTitle,
    sourceKind: "memory" as const,
    sourceUrl: "https://example.com/source",
    sourceTitle,
    excerpt: "Bounded evidence excerpt",
  };
}

const revision = recommendedLocalEmbeddingModelManifest.revision;

function localEmbeddingStatus(
  overrides: Partial<LocalEmbeddingModelStatus>,
): LocalEmbeddingModelStatus {
  return {
    modelId: recommendedLocalEmbeddingModelManifest.modelId,
    state: "not_installed",
    downloadedBytes: 0,
    totalBytes: 128,
    ready: false,
    active: false,
    reindexRequired: false,
    ...overrides,
  };
}
