import { describe, expect, it } from "vitest";
import {
  type ActiveEmbeddingModelSummary,
  CLIO_AGENT_RUN_EVENT,
  CLIO_AGENT_RUN_REQUEST,
  CLIO_AGENT_STREAM_COMPACT,
  CLIO_AGENT_STREAM_EVENT,
  CLIO_AGENT_STREAM_SUBSCRIBE,
  CLIO_CONTENT_COMMAND,
  CLIO_ENGINE_REQUEST,
  CLIO_IMAGE_GENERATION_RUN_EVENT,
  CLIO_IMAGE_GENERATION_RUN_REQUEST,
  CLIO_IMAGE_GENERATION_STREAM_CANCEL,
  CLIO_IMAGE_GENERATION_STREAM_EVENT,
  CLIO_IMAGE_GENERATION_STREAM_REQUEST,
  CLIO_KB_CLUSTER_LABEL_REFINEMENT_REQUEST,
  CLIO_LOCAL_EMBEDDING_REQUEST,
  CLIO_OFFSCREEN_REQUEST,
  CLIO_POST_CAPTURE_WAKE,
  CLIO_PROVIDER_CONFIG_REQUEST,
  CLIO_PROVIDER_REQUEST,
  CLIO_UI_REQUEST,
  CLIO_WEB_SEARCH_RUN_EVENT,
  CLIO_WEB_SEARCH_RUN_REQUEST,
  CLIO_WEB_SEARCH_STREAM_EVENT,
  CLIO_WEB_SEARCH_STREAM_REQUEST,
  CLIO_WIKI_COMPILE_WAKE,
  CLIO_WORKER_CHUNK_META_SUMMARY_REQUEST,
  CLIO_WORKER_CHUNK_META_SUMMARY_RESPONSE,
  CLIO_WORKER_EMBEDDING_REQUEST,
  CLIO_WORKER_EMBEDDING_RESPONSE,
  CLIO_WORKER_GRAPH_EXTRACTION_REQUEST,
  CLIO_WORKER_GRAPH_EXTRACTION_RESPONSE,
  CLIO_WORKER_SOURCE_FINE_RANK_REQUEST,
  CLIO_WORKER_SOURCE_FINE_RANK_RESPONSE,
  CLIO_WORKER_VISION_ANALYSIS_REQUEST,
  CLIO_WORKER_VISION_ANALYSIS_RESPONSE,
  type PdfRawFileResult,
  type RetrieveSourceCoarseSignals,
  type RetrieveSourceHitChunk,
  type RetrieveSourceItem,
  decodeEngineRequestFromChrome,
  decodeEngineResponseFromChrome,
  decodePostCaptureJobResult,
  encodeEngineRequestForChrome,
  encodeEngineResponseForChrome,
  isAgentRunEventMessage,
  isAgentRunRequestMessage,
  isAgentStreamCompactMessage,
  isAgentStreamEventMessage,
  isAgentStreamSubscribeMessage,
  isContentCommandMessage,
  isEngineRequestMessage,
  isImageGenerationRunEventMessage,
  isImageGenerationRunRequestMessage,
  isImageGenerationStreamCancelMessage,
  isImageGenerationStreamEventMessage,
  isImageGenerationStreamRequestMessage,
  isKnowledgeBaseClusterLabelRefinementRequestMessage,
  isKnowledgeBaseClusterLabelRefinementResponseMessage,
  isLocalEmbeddingModelRequestMessage,
  isOffscreenRequestMessage,
  isPostCaptureWakeMessage,
  isProviderConfigRequestMessage,
  isProviderRequestMessage,
  isUiRequestMessage,
  isWebSearchRunEventMessage,
  isWebSearchRunRequestMessage,
  isWebSearchStreamEventMessage,
  isWebSearchStreamRequestMessage,
  isWikiCompileWakeMessage,
  isWorkerChunkMetaSummaryRequestMessage,
  isWorkerChunkMetaSummaryResponseMessage,
  isWorkerEmbeddingRequestMessage,
  isWorkerEmbeddingResponseMessage,
  isWorkerGraphExtractionRequestMessage,
  isWorkerGraphExtractionResponseMessage,
  isWorkerRequestMessage,
  isWorkerSourceFineRankRequestMessage,
  isWorkerSourceFineRankResponseMessage,
  isWorkerVisionAnalysisRequestMessage,
  isWorkerVisionAnalysisResponseMessage,
  unwrapEngineResponse,
} from "./rpc";

describe("session engine RPC guards", () => {
  it("recognizes the fixed Wiki compiler wake message", () => {
    expect(isWikiCompileWakeMessage({ type: CLIO_WIKI_COMPILE_WAKE })).toBe(true);
    expect(isWikiCompileWakeMessage({ type: "clio:wiki-compile:other" })).toBe(false);
    expect(isWikiCompileWakeMessage({ type: CLIO_WIKI_COMPILE_WAKE, value: false })).toBe(true);
  });

  it("recognizes the fixed post-capture wake message", () => {
    expect(isPostCaptureWakeMessage({ type: CLIO_POST_CAPTURE_WAKE })).toBe(true);
    expect(isPostCaptureWakeMessage({ type: "clio:post-capture:other" })).toBe(false);
    expect(isPostCaptureWakeMessage({ type: CLIO_POST_CAPTURE_WAKE, value: false })).toBe(true);
  });

  it("keeps Source ingest status public while scheduler controls stay Worker-only", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "getSourceIngestStatuses", sourceIds: ["source-1", "source-2"] },
      }),
    ).toBe(true);
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "retrySourceIngest", sourceId: "source-1" },
      }),
    ).toBe(true);

    const internalRequest = { kind: "runNextPostCaptureJob" } as const;
    expect(isEngineRequestMessage({ type: CLIO_ENGINE_REQUEST, request: internalRequest })).toBe(
      false,
    );
    expect(
      isOffscreenRequestMessage({ type: CLIO_OFFSCREEN_REQUEST, request: internalRequest }),
    ).toBe(false);
    expect(
      isWorkerRequestMessage({
        type: "clio:worker:request",
        requestId: "post-capture-request-1",
        request: internalRequest,
      }),
    ).toBe(true);
    expect(() => encodeEngineRequestForChrome(internalRequest)).toThrowError(
      "Worker-only scheduler requests cannot cross the extension transport.",
    );
  });

  it("decodes only complete versioned post-capture stage results", () => {
    const stages = Object.fromEntries(
      ["paper_metadata", "chunk_meta", "figure_vision", "embedding", "graph"].map((stage) => [
        stage,
        { status: stage === "embedding" ? "skipped" : "done", reason: "test" },
      ]),
    );
    expect(
      decodePostCaptureJobResult({
        version: "post-capture-result-v1",
        sourceId: "source-1",
        stages,
      }),
    ).toMatchObject({ sourceId: "source-1", stages: { embedding: { status: "skipped" } } });
    expect(
      decodePostCaptureJobResult({
        version: "post-capture-result-v1",
        sourceId: "source-1",
        stages: { ...stages, graph: { status: "unknown" } },
      }),
    ).toBeUndefined();
    const incompleteStages = { ...stages };
    Reflect.deleteProperty(incompleteStages, "graph");
    expect(
      decodePostCaptureJobResult({
        version: "post-capture-result-v1",
        sourceId: "source-1",
        stages: incompleteStages,
      }),
    ).toBeUndefined();
  });

  it("separates public Wiki compile requests from Worker-only scheduler requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "enqueueWikiCompileRun", payload: { sourceId: "source-1" } },
      }),
    ).toBe(true);
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listWikiCompileRuns", filter: { status: "paused", limit: 20 } },
      }),
    ).toBe(true);

    const internalRequest = {
      kind: "claimNextWikiCompileStep",
      leaseOwner: "offscreen-runner-1",
      leaseMs: 30_000,
    } as const;
    expect(isEngineRequestMessage({ type: CLIO_ENGINE_REQUEST, request: internalRequest })).toBe(
      false,
    );
    expect(
      isOffscreenRequestMessage({ type: CLIO_OFFSCREEN_REQUEST, request: internalRequest }),
    ).toBe(false);
    expect(
      isWorkerRequestMessage({
        type: "clio:worker:request",
        requestId: "request-1",
        request: internalRequest,
      }),
    ).toBe(true);
  });

  it("validates Knowledge Base AI settings without a second fine-rank switch", () => {
    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "getKnowledgeBaseAiSettings" },
      }),
    ).toBe(true);
    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveKnowledgeBaseAiSettings",
          settings: { wiki: { enabled: true } },
        },
      }),
    ).toBe(true);
    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveKnowledgeBaseAiSettings",
          settings: { wiki: { enabled: "yes" }, fineRank: { enabled: true } },
        },
      }),
    ).toBe(false);
  });

  it("turns a missing background response into an actionable RPC error", () => {
    expect(() => unwrapEngineResponse(undefined)).toThrowError(
      "Clio background did not return a response. Reload the extension and refresh this page.",
    );
  });

  it("accepts typed Markdown and Chrome-safe PDF capture requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "captureMarkdown",
          payload: {
            sourceUrl: "clio://upload/notes.md",
            sourceTitle: "notes.md",
            markdownText: "# Notes\n\nLocal markdown evidence.",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "enqueueEmbeddingReindex",
          model: {
            id: "local-transformers:xenova-multilingual-e5-small:revision:int8:d384",
            provider: "local-transformers",
            label: "Multilingual E5 Small",
            dimension: 384,
            metric: "cosine",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "cancelJob", id: "job:embedding-reindex" },
      }),
    ).toBe(true);

    const bytes = Uint8Array.from({ length: 50_003 }, (_, index) => index % 256);
    const transportRequest = JSON.parse(
      JSON.stringify(
        encodeEngineRequestForChrome({
          kind: "capturePdf",
          payload: {
            sourceUrl: "clio://upload/paper.pdf",
            sourceTitle: "paper.pdf",
            bytes,
          },
        }),
      ),
    );

    expect(isEngineRequestMessage({ type: CLIO_ENGINE_REQUEST, request: transportRequest })).toBe(
      true,
    );
    expect(
      isOffscreenRequestMessage({ type: CLIO_OFFSCREEN_REQUEST, request: transportRequest }),
    ).toBe(true);

    const decoded = decodeEngineRequestFromChrome(transportRequest);
    expect(decoded.kind).toBe("capturePdf");
    if (decoded.kind !== "capturePdf") throw new Error("Expected a PDF capture request.");
    expect(Array.from(new Uint8Array(decoded.payload.bytes))).toEqual(Array.from(bytes));
  });

  it("round-trips raw PDF responses across Chrome JSON serialization", () => {
    const request = { kind: "getPdfRawFile", id: "source-pdf-1" } as const;
    const encoded = encodeEngineResponseForChrome(request, {
      ok: true,
      value: {
        memoryId: "source-pdf-1",
        sourceTitle: "paper.pdf",
        sourceUrl: "clio://upload/paper.pdf",
        bytes: new Uint8Array([37, 80, 68, 70, 45]),
        byteLength: 5,
        contentType: "application/pdf",
      },
    });
    const chromeRoundTrip = JSON.parse(JSON.stringify(encoded));
    const decoded = decodeEngineResponseFromChrome(request, chromeRoundTrip);
    const value = unwrapEngineResponse(decoded) as PdfRawFileResult;

    expect(Array.from(value.bytes as Uint8Array)).toEqual([37, 80, 68, 70, 45]);
    expect(value.byteLength).toBe(5);
  });

  it("rejects malformed PDF and Markdown capture requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "captureMarkdown",
          payload: {
            sourceUrl: "clio://upload/notes.md",
            sourceTitle: "notes.md",
            normalizedText: "# Wrong field",
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "capturePdf",
          payload: {
            sourceUrl: "clio://upload/paper.pdf",
            sourceTitle: "paper.pdf",
            bytes: "not bytes",
          },
        },
      }),
    ).toBe(false);
  });

  it("validates retrieval strength values at the RPC boundary", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "retrieveSources",
          payload: { query: "graph retrieval", strength: "strict" },
        },
      }),
    ).toBe(true);
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: { query: "graph retrieval", strength: "invalid" },
        },
      }),
    ).toBe(false);
  });

  it("accepts raw PDF file read requests by memory id", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "getPdfRawFile", id: "source-pdf-1" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "getPdfRawFile", id: 42 },
      }),
    ).toBe(false);
  });

  it("accepts typed Wiki Artifact Core requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "publishWikiArtifacts",
          payload: {
            scope: { kind: "source", id: "source-1" },
            inputSignature: "sha256:source-1:v1",
            compilerVersion: "wiki-compiler-v1",
            promptVersion: "source-digest-v1",
            modelId: "provider:model",
            freshness: "fresh",
            artifacts: [
              {
                artifactKind: "source_digest",
                artifactKey: "root",
                title: "Source digest",
                content: "A bounded machine-authored digest.",
                payload: { outline: ["Overview", "Findings"] },
                coverage: { sourceIds: ["source-1"], ratio: 1 },
              },
              {
                artifactKind: "claim",
                artifactKey: "claim:1",
                title: "Primary claim",
                content: "The source supports the primary claim.",
                evidence: [
                  {
                    sourceId: "source-1",
                    chunkId: "chunk-1",
                    pageNo: 2,
                    bbox: { x: 0.1, y: 0.2, width: 0.4, height: 0.1 },
                    parserArtifactKind: "pdf_text_block",
                    parserArtifactId: "block-1",
                    anchor: { quote: "primary claim" },
                  },
                ],
              },
            ],
            links: [
              {
                from: { artifactKind: "source_digest", artifactKey: "root" },
                to: { artifactKind: "claim", artifactKey: "claim:1" },
                kind: "contains",
                createdBy: "compiler",
                creatorVersion: "wiki-compiler-v1",
              },
            ],
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "listWikiArtifacts",
          filter: {
            scope: { kind: "source", id: "source-1" },
            artifactKind: "claim",
            freshness: "stale",
            inputSignature: "sha256:source-1:v1",
            includeHistory: true,
            limit: 50,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "listWikiArtifactsForSource",
          sourceId: "source-1",
          chunkId: "chunk-1",
          includeHistory: true,
          limit: 50,
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "getWikiArtifact", id: "wiki-artifact-1" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendWikiUserEdit",
          payload: {
            baseArtifactId: "wiki-artifact-1",
            previousEditId: "wiki-edit-1",
            candidateArtifactId: "wiki-artifact-2",
            editKind: "patch",
            payload: { operations: [{ op: "replace", path: "/title", value: "Edited" }] },
            mergeOutcome: "manual_merge",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listWikiUserEdits", artifactId: "wiki-artifact-1", limit: 20 },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "deleteWikiArtifact", id: "wiki-artifact-1" },
      }),
    ).toBe(true);
  });

  it("rejects invalid or unbounded Wiki Artifact Core requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "publishWikiArtifacts",
          payload: {
            scope: { kind: "source", id: "source-1" },
            inputSignature: "sig-1",
            compilerVersion: "compiler-v1",
            promptVersion: "prompt-v1",
            freshness: "stale",
            artifacts: [
              {
                artifactKind: "source_digest",
                artifactKey: "root",
                title: "Digest",
                content: "Content",
              },
            ],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "publishWikiArtifacts",
          payload: {
            scope: { kind: "source", id: "source-1" },
            inputSignature: "sig-1",
            compilerVersion: "compiler-v1",
            promptVersion: "prompt-v1",
            artifacts: [
              {
                artifactKind: "claim",
                artifactKey: "claim:1",
                title: "Unsupported claim",
                content: "No evidence.",
              },
            ],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "publishWikiArtifacts",
          payload: {
            scope: { kind: "source", id: "source-1" },
            inputSignature: "sig-1",
            compilerVersion: "compiler-v1",
            promptVersion: "prompt-v1",
            artifacts: [
              {
                artifactKind: "claim",
                artifactKey: "claim:1",
                title: "Claim",
                content: "Content",
                evidence: [
                  {
                    sourceId: "source-1",
                    chunkId: "chunk-1",
                    parserArtifactKind: "pdf_text_block",
                  },
                ],
              },
            ],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "publishWikiArtifacts",
          payload: {
            scope: { kind: "library", id: "default" },
            inputSignature: "sig-1",
            compilerVersion: "compiler-v1",
            promptVersion: "prompt-v1",
            artifacts: [
              {
                artifactKind: "index",
                artifactKey: "root",
                title: "Index",
                content: "Content",
              },
            ],
            links: [
              {
                from: { artifactKind: "index", artifactKey: "root" },
                to: { artifactKind: "topic", artifactKey: "missing" },
                kind: "contains",
                createdBy: "compiler",
              },
            ],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listWikiArtifacts", filter: { limit: 501 } },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listWikiArtifactsForSource", sourceId: "", limit: 501 },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "listWikiArtifactsForSource",
          sourceId: "source-1",
          chunkId: "chunk-1",
          includeHistory: "yes",
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendWikiUserEdit",
          payload: {
            baseArtifactId: "wiki-artifact-1",
            editKind: "patch",
            payload: { operation: undefined },
            mergeOutcome: "manual_merge",
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listWikiUserEdits", artifactId: "", limit: 20 },
      }),
    ).toBe(false);
  });

  it("accepts typed graph build and query requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceGraph",
          payload: { sourceId: "source-1", mode: "deterministic" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceGraph",
          payload: { sourceId: "source-1", mode: "llm" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "enqueueSourceGraphJob",
          payload: { sourceId: "source-1", mode: "llm" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            query: "bounded graph",
            clustering: { clusterBy: "graph", granularity: "medium" },
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphNeighbors",
          payload: {
            sourceId: "source-1",
            kind: "method",
            dimension: "technical",
            depth: 2,
            limit: 40,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphSubgraph",
          payload: {
            sourceIds: ["source-1", "source-2"],
            dimension: "domain",
            limit: 80,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphPath",
          payload: {
            from: { sourceId: "source-1" },
            to: { canonicalId: "method:retrieval", kind: "method" },
            dimension: "technical",
            maxDepth: 3,
            limit: 80,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphTimeline",
          payload: {
            sourceIds: ["source-1", "source-2"],
            kind: "method",
            dimension: "domain",
            order: "asc",
            limit: 80,
          },
        },
      }),
    ).toBe(true);
  });

  it("rejects invalid graph build and query payloads", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceGraph",
          payload: { sourceId: "source-1", mode: "provider" },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphNeighbors",
          payload: { sourceId: "source-1", kind: "chunk" },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphNeighbors",
          payload: { sourceId: "source-1", dimension: "semantic" },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphSubgraph",
          payload: { sourceIds: ["source-1", 42] },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphPath",
          payload: { from: {}, to: { sourceId: "source-1" } },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphPath",
          payload: { from: { sourceId: "source-1" }, to: { canonicalId: "x" }, maxDepth: "3" },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphTimeline",
          payload: { sourceIds: ["source-1"], order: "latest" },
        },
      }),
    ).toBe(false);
  });

  it("accepts typed chat session requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "createChatSession",
          payload: {
            title: "Explain persistence",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            initialScope: "general",
            ownerId: "owner-1",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "upsertChatMessage",
          payload: {
            id: "run-1:user",
            sessionId: "sess-1",
            role: "user",
            status: "completed",
            content: "Explain persistence",
            scope: "general",
            evidenceRefs: ["ev-1"],
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "updateChatMessage",
          payload: {
            id: "run-1:assistant",
            sessionId: "sess-1",
            status: "streaming",
            content: "",
            clearError: true,
            clearRetry: true,
          },
        },
      }),
    ).toBe(true);
  });

  it("rejects invalid chat message payloads", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "upsertChatMessage",
          payload: {
            id: "run-1:user",
            sessionId: "sess-1",
            role: "model",
            status: "completed",
            content: "Explain persistence",
            scope: "current-page",
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts and rejects Source Context map scheduler RPCs", () => {
    const step = {
      groupId: "group-1",
      groupIndex: 0,
      sourceIds: ["source-1"],
      windowRefs: [{ sourceId: "source-1", chunkId: "chunk-1", ord: 0 }],
      evidenceIds: ["memory:source-1:chunk:chunk-1"],
      tokenEstimate: 240,
      inputSummary: "group=group-1; windows=1; tokens=240",
      stepSignature: "step-signature-1",
    };

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "createOrResumeSourceContextMapRun",
          payload: {
            id: "sctx-map-run-1",
            sessionId: "session-1",
            ownerRunId: "run-1",
            mode: "research",
            planSignature: "plan-signature-1",
            maxConcurrentMaps: 2,
            steps: [step],
            createdAt: "2026-07-09T00:00:00.000Z",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "listSourceContextMapRuns",
          filter: { sessionId: "session-1", status: "running", limit: 8 },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "getSourceContextMapRun", id: "sctx-map-run-1" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listSourceContextMapEvents", runId: "sctx-map-run-1", limit: 20 },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "claimSourceContextMapStep", runId: "sctx-map-run-1" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "completeSourceContextMapStep",
          payload: {
            stepId: "sctx-map-step-1",
            outputSummary: "bounded map finding",
            artifactId: "artifact-1",
            completedAt: "2026-07-09T00:00:01.000Z",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "failSourceContextMapStep",
          payload: {
            stepId: "sctx-map-step-1",
            errorCode: "PROVIDER_ERROR",
            errorMessage: "map failed",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "markSourceContextMapReduceStarted",
          payload: {
            runId: "sctx-map-run-1",
            mapArtifactIds: ["artifact-1"],
            inputSummary: "map artifacts=1",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "markSourceContextMapReduceCompleted",
          payload: {
            runId: "sctx-map-run-1",
            outputSummary: "final bounded answer",
            artifactId: "artifact-2",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "markSourceContextMapReduceFailed",
          payload: {
            runId: "sctx-map-run-1",
            errorCode: "PROVIDER_ERROR",
            errorMessage: "reduce failed",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "cancelSourceContextMapRun", id: "sctx-map-run-1" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "retrySourceContextMapRun", id: "sctx-map-run-1" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "resumeSourceContextMapRun", id: "sctx-map-run-1" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "createOrResumeSourceContextMapRun",
          payload: {
            ownerRunId: "run-1",
            planSignature: "plan-signature-1",
            maxConcurrentMaps: 0,
            steps: [step],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "createOrResumeSourceContextMapRun",
          payload: {
            ownerRunId: "run-1",
            planSignature: "plan-signature-1",
            maxConcurrentMaps: Number.POSITIVE_INFINITY,
            steps: [step],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "createOrResumeSourceContextMapRun",
          payload: {
            ownerRunId: "run-1",
            planSignature: "plan-signature-1",
            steps: [{ ...step, stepSignature: "" }],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "listSourceContextMapRuns",
          filter: { status: "paused" },
        },
      }),
    ).toBe(false);
  });

  it("accepts typed agent stream subscribe messages", () => {
    expect(
      isAgentStreamSubscribeMessage({
        type: CLIO_AGENT_STREAM_SUBSCRIBE,
        requestId: "request-1",
        runId: "run-1",
        sessionId: "session-1",
        assistantMessageId: "run-1:assistant",
      }),
    ).toBe(true);

    expect(
      isAgentStreamSubscribeMessage({
        type: CLIO_AGENT_STREAM_SUBSCRIBE,
        requestId: "request-1",
        runId: "run-1",
        sessionId: "session-1",
      }),
    ).toBe(false);
  });

  it("accepts typed manual compaction stream messages", () => {
    expect(
      isAgentStreamCompactMessage({
        type: CLIO_AGENT_STREAM_COMPACT,
        requestId: "request-1",
        runId: "compact-1",
        sessionId: "session-1",
      }),
    ).toBe(true);

    expect(
      isAgentStreamCompactMessage({
        type: CLIO_AGENT_STREAM_COMPACT,
        requestId: "request-1",
        runId: "compact-1",
      }),
    ).toBe(true);

    expect(
      isAgentStreamCompactMessage({
        type: CLIO_AGENT_STREAM_COMPACT,
        requestId: "request-1",
        sessionId: "session-1",
      }),
    ).toBe(false);
  });

  it("accepts the Rail settings content command", () => {
    expect(
      isContentCommandMessage({
        type: CLIO_CONTENT_COMMAND,
        command: { action: "openSettings" },
      }),
    ).toBe(true);
  });

  it("accepts typed offscreen agent run request and event messages", () => {
    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "start",
          request: {
            runId: "run-1",
            question: "Explain persistence",
            scope: "general",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            evidence: [],
            currentTurnEvidenceRefs: ["ev-1"],
            sourceContextPack: {
              mode: "research",
              planner: "source_context_planner_v1",
              triggerReason: "explicit_research_command",
              sourceIds: ["source-1", "source-2"],
              useWorkingSet: false,
              maxTotalTokens: 10_000,
              maxGroups: 3,
              maxGroupTokens: 4_000,
              maxSources: 8,
              maxWindowsPerSource: 2,
              contextChunksBefore: 1,
              contextChunksAfter: 1,
              mapReduce: {
                enabled: true,
                maxGroups: 3,
                perGroupTokenBudget: 4_000,
              },
            },
            createdAt: "2026-05-22T00:00:00.000Z",
          },
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "start",
          request: {
            runId: "run-1",
            question: "Explain persistence",
            scope: "general",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            evidence: [],
            sourceContextPack: {
              mode: "auto",
              planner: "source_context_planner_v1",
              triggerReason: "default_chat_long_context_intent",
              maxTotalTokens: 6_000,
              maxGroups: 2,
              maxGroupTokens: 3_000,
              maxSources: 4,
              maxWindowsPerSource: 2,
              contextChunksBefore: 1,
              contextChunksAfter: 1,
              mapReduce: {
                enabled: true,
                maxGroups: 2,
                perGroupTokenBudget: 3_000,
              },
            },
            createdAt: "2026-05-22T00:00:00.000Z",
          },
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "start",
          request: {
            runId: "run-1",
            question: "Explain persistence",
            scope: "general",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            evidence: [],
            sourceContextPack: { mode: "automatic" },
            createdAt: "2026-05-22T00:00:00.000Z",
          },
        },
      }),
    ).toBe(false);

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "start",
          request: {
            runId: "run-1",
            question: "Explain persistence",
            scope: "general",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            evidence: [],
            sourceContextPack: { mode: "research", sourceIds: ["source-1", 2] },
            createdAt: "2026-05-22T00:00:00.000Z",
          },
        },
      }),
    ).toBe(false);

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "start",
          request: {
            runId: "run-1",
            question: "Explain persistence",
            scope: "general",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            evidence: [],
            sourceContextPack: { mode: "research", useWorkingSet: "false" },
            createdAt: "2026-05-22T00:00:00.000Z",
          },
        },
      }),
    ).toBe(false);

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "start",
          request: {
            runId: "run-1",
            question: "Explain persistence",
            scope: "general",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            evidence: [],
            sourceContextPack: { mode: "auto", maxTotalTokens: "6000" },
            createdAt: "2026-05-22T00:00:00.000Z",
          },
        },
      }),
    ).toBe(false);

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "subscribe",
          runId: "run-1",
          sessionId: "session-1",
          assistantMessageId: "run-1:assistant",
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "compact",
          runId: "compact-1",
          sessionId: "session-1",
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: { type: "run_resolved", runId: "run-1", message: "Context too large" },
      }),
    ).toBe(true);
  });

  it("accepts memory evidence for agent runs but not session evidence writes", () => {
    const memoryEvidence = {
      id: "memory:mem-1:chunk:chunk-1",
      sourceKind: "memory",
      sourceUrl: "https://example.com/memory",
      sourceTitle: "Saved Memory",
      text: "Bounded memory evidence text",
      excerpt: "Bounded memory evidence text",
    };

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "start",
          request: {
            runId: "run-memory-1",
            question: "What do I know about billing?",
            scope: "general",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            evidence: [memoryEvidence],
            currentTurnEvidenceRefs: [memoryEvidence.id],
            createdAt: "2026-06-29T00:00:00.000Z",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendSessionEvidence",
          payload: {
            sessionId: "session-1",
            evidence: memoryEvidence,
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts bounded memory evidence window requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "getMemoryEvidenceWindows",
          payload: {
            query: "billing notes",
            memoryIds: ["mem-1", "mem-2"],
            anchors: [
              { memoryId: "mem-1", chunkId: "chunk-1" },
              { memoryId: "mem-2", ord: 3 },
            ],
            limit: 8,
            maxWindowsPerMemory: 2,
            contextChunksBefore: 1,
            contextChunksAfter: 1,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "getMemoryEvidenceWindows",
          payload: {
            memoryIds: [42],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "getMemoryEvidenceWindows",
          payload: {
            anchors: [{ memoryId: "mem-1" }],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "getMemoryEvidenceWindows",
          payload: {
            anchors: [{ memoryId: "mem-1", chunkId: 42 }],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "getMemoryEvidenceWindows",
          payload: {
            query: "billing notes",
            contextChunksBefore: "wide",
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts source context pack requests and rejects invalid payloads", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceContextPack",
          payload: {
            query: "bounded source context",
            sourceIds: ["source-1", "source-2"],
            sourceDepthOverrides: [
              { sourceId: "source-1", loadDepth: "meta" },
              { sourceId: "source-2", loadDepth: "full" },
            ],
            anchors: [
              { memoryId: "source-1", chunkId: "chunk-1" },
              { memoryId: "source-2", ord: 4 },
            ],
            useWorkingSet: true,
            maxTotalTokens: 12_000,
            maxGroups: 3,
            maxGroupTokens: 4_000,
            maxSources: 8,
            maxWindowsPerSource: 2,
            contextChunksBefore: 1,
            contextChunksAfter: 1,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceContextPack",
          payload: {
            sourceIds: ["source-1", 42],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceContextPack",
          payload: {
            anchors: [{ memoryId: "source-1" }],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceContextPack",
          payload: {
            useWorkingSet: "yes",
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceContextPack",
          payload: {
            maxGroupTokens: "large",
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceContextPack",
          payload: {
            sourceDepthOverrides: [{ sourceId: "source-1", loadDepth: "document" }],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceContextPack",
          payload: {
            sourceDepthOverrides: [{ sourceId: "", loadDepth: "chunks" }],
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts source context compression log requests and rejects invalid payloads", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendSourceContextCompressionLogs",
          payload: {
            sessionId: "session-1",
            runId: "run-1",
            entries: [
              {
                reason: "full_depth_bounded",
                message: "Full depth was bounded to selected windows.",
                sourceId: "source-1",
                requestedLoadDepth: "full",
                selectedLoadDepth: "chunks",
                tokenEstimate: 400,
                omittedTokenEstimate: 120,
                omittedWindowCount: 2,
                lostInfoTypes: ["full_document", "chunk_windows"],
              },
            ],
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "listSourceContextCompressionLogs",
          filter: { sessionId: "session-1", runId: "run-1", sourceId: "source-1", limit: 20 },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "clearSourceContextCompressionLogs",
          filter: { sessionId: "session-1" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendSourceContextCompressionLogs",
          payload: {
            entries: [{ reason: "full_depth_bounded", message: "missing run/session" }],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendSourceContextCompressionLogs",
          payload: {
            runId: "run-1",
            entries: [{ reason: "unknown_reason", message: "bad" }],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "listSourceContextCompressionLogs",
          filter: { limit: "many" },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendSourceContextCompressionLogs",
          payload: {
            runId: "run-1",
            entries: [
              {
                reason: "chunk_window_omitted",
                message: "bad numeric payload",
                omittedWindowCount: Number.POSITIVE_INFINITY,
              },
            ],
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts source context map artifact requests and rejects invalid payloads", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendSourceContextMapArtifacts",
          payload: {
            sessionId: "session-1",
            runId: "run-1",
            entries: [
              {
                stage: "map",
                status: "completed",
                groupId: "group-1",
                groupIndex: 0,
                sourceIds: ["source-1"],
                windowRefs: [{ sourceId: "source-1", chunkId: "chunk-1", ord: 0 }],
                evidenceIds: ["memory:source-1:chunk:chunk-1"],
                tokenEstimate: 400,
                inputSummary: "group=group-1; windows=1",
                outputSummary: "bounded finding",
              },
            ],
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "listSourceContextMapArtifacts",
          filter: {
            sessionId: "session-1",
            runId: "run-1",
            stage: "map",
            status: "completed",
            sourceId: "source-1",
            limit: 20,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "clearSourceContextMapArtifacts",
          filter: { sessionId: "session-1", stage: "reduce" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendSourceContextMapArtifacts",
          payload: {
            entries: [{ stage: "map", status: "started" }],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendSourceContextMapArtifacts",
          payload: {
            runId: "run-1",
            entries: [{ stage: "load", status: "started" }],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendSourceContextMapArtifacts",
          payload: {
            runId: "run-1",
            entries: [{ stage: "reduce", status: "done" }],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendSourceContextMapArtifacts",
          payload: {
            runId: "run-1",
            entries: [
              {
                stage: "map",
                status: "completed",
                windowRefs: [{ sourceId: "source-1", ord: 0 }],
              },
            ],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendSourceContextMapArtifacts",
          payload: {
            runId: "run-1",
            entries: [
              {
                stage: "map",
                status: "completed",
                tokenEstimate: Number.POSITIVE_INFINITY,
              },
            ],
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts Tier2 chunk meta audit requests and rejects unsafe filters", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "enqueueChunkMetaTier2Job",
          payload: { sourceId: "source-1", maxChunks: 8 },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "listChunkMetaTier2Audit",
          filter: { sourceId: "source-1", jobId: "job-1", status: "summarized", limit: 20 },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "clearChunkMetaTier2Audit",
          filter: { sourceId: "source-1" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "clearChunkMetaTier2Audit",
          filter: { jobId: "job-1" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "enqueueChunkMetaTier2Job",
          payload: { sourceId: "", maxChunks: 8 },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "enqueueChunkMetaTier2Job",
          payload: { sourceId: "source-1", maxChunks: Number.POSITIVE_INFINITY },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "enqueueChunkMetaTier2Job",
          payload: { sourceId: "source-1", maxChunks: -1 },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "enqueueChunkMetaTier2Job",
          payload: { sourceId: "source-1", maxChunks: 1.5 },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "listChunkMetaTier2Audit",
          filter: { status: "available" },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "clearChunkMetaTier2Audit",
          filter: { status: "error" },
        },
      }),
    ).toBe(false);
  });

  it("accepts source retrieval requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "retrieveSources",
          payload: {
            query: "context window retrieval",
            limit: 20,
            scope: "all",
            includeChunks: 3,
            filter: {
              sourceTypes: ["webpage", "research-note"],
              lifecycleStatuses: ["fresh", "stale", "archived"],
              doi: "10.7777/clio.2026",
              arxivIds: ["2501.01234"],
              years: [2026],
              venues: ["Clio Metadata Symposium"],
              authors: ["Katherine Johnson"],
            },
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "retrieveSources",
          payload: {
            query: "context window retrieval",
            scope: "current_page",
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "retrieveSources",
          payload: {
            limit: 20,
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "retrieveSources",
          payload: {
            query: "context window retrieval",
            filter: {
              lifecycleStatuses: ["deleted"],
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "retrieveSources",
          payload: {
            query: "context window retrieval",
            filter: {
              sourceTypes: "webpage",
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "retrieveSources",
          payload: {
            query: "context window retrieval",
            filter: {
              years: ["2026"],
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "retrieveSources",
          payload: {
            query: "context window retrieval",
            filter: {
              arxivIds: [2501],
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts knowledge base search requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            query: "long context degradation",
            mode: "semantic",
            limit: 20,
            includeChunks: 2,
            filter: {
              sourceTypes: ["paper", "pdf"],
              lifecycleStatuses: ["fresh", "stale"],
              doi: "10.5555/clio.pdf",
              arxivIds: ["2601.01234"],
              years: [2026],
              venues: ["Local RAG Symposium"],
              authors: ["Ada Lovelace"],
            },
            clustering: {
              clusterBy: "semantic",
              granularity: "medium",
              semanticBackend: "embedding",
            },
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            query: "topic grouping",
            mode: "exact",
            clustering: {
              clusterBy: "topic",
              granularity: "coarse",
              refinement: {
                providerBackedLabels: true,
              },
            },
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            query: "long context degradation",
            mode: "hybrid",
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            query: "long context degradation",
            filter: {
              lifecycleStatuses: ["deleted"],
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            query: "long context degradation",
            clustering: {
              clusterBy: "topic",
              semanticBackend: "metadata",
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            limit: 20,
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            query: "long context degradation",
            filter: {
              sourceTypes: "paper",
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            query: "long context degradation",
            clustering: {
              clusterBy: "none",
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            query: "long context degradation",
            clustering: {
              clusterBy: "year",
              granularity: "tiny",
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            query: "long context degradation",
            clustering: {
              clusterBy: "semantic",
              semanticBackend: "unknown",
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            query: "long context degradation",
            clustering: {
              clusterBy: "year",
              semanticBackend: "embedding",
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts bounded Knowledge Base cluster label refinement and rejects secret or full text payloads", () => {
    const request = {
      type: CLIO_KB_CLUSTER_LABEL_REFINEMENT_REQUEST,
      requestId: "req-kb-labels",
      request: {
        clusters: [
          {
            id: "cluster:retrieval",
            label: "Retrieval",
            summary: "Sources about retrieval.",
            clusterBy: "topic",
            sourceCount: 2,
            examples: [
              {
                sourceId: "source:1",
                title: "Retrieval Evaluation Study",
                sourceType: "paper",
                year: 2026,
                venue: "Local RAG Symposium",
                authors: ["Ada Lovelace"],
                abstractSnippet: "Evaluates bounded local RAG retrieval.",
                topicTerms: ["retrieval", "evaluation"],
              },
            ],
          },
        ],
      },
    };

    expect(isKnowledgeBaseClusterLabelRefinementRequestMessage(request)).toBe(true);
    expect(
      isKnowledgeBaseClusterLabelRefinementResponseMessage({
        type: CLIO_KB_CLUSTER_LABEL_REFINEMENT_REQUEST,
        requestId: "req-kb-labels",
        response: {
          ok: true,
          value: {
            status: "refined",
            providerKind: "chat",
            clusters: [
              {
                clusterId: "cluster:retrieval",
                status: "refined",
                providerKind: "chat",
                label: "Retrieval Evaluation",
                summary: "Papers about bounded retrieval evaluation.",
                confidence: 0.82,
              },
            ],
          },
        },
      }),
    ).toBe(true);

    expect(
      isKnowledgeBaseClusterLabelRefinementRequestMessage({
        ...request,
        request: {
          ...request.request,
          apiKey: "sk-test",
        },
      }),
    ).toBe(false);

    const [cluster] = request.request.clusters;
    if (cluster === undefined) throw new Error("Expected a refinement cluster.");
    const [example] = cluster.examples;
    if (example === undefined) throw new Error("Expected a refinement example.");

    expect(
      isKnowledgeBaseClusterLabelRefinementRequestMessage({
        ...request,
        request: {
          clusters: [
            {
              ...cluster,
              examples: [
                {
                  ...example,
                  normalizedText: "full source text must not be accepted",
                },
              ],
            },
          ],
        },
      }),
    ).toBe(false);

    expect(
      isKnowledgeBaseClusterLabelRefinementResponseMessage({
        type: CLIO_KB_CLUSTER_LABEL_REFINEMENT_REQUEST,
        requestId: "req-kb-labels",
        response: {
          ok: true,
          value: {
            status: "refined",
            providerKind: "chat",
            clusters: [
              {
                clusterId: "cluster:retrieval",
                status: "refined",
                providerKind: "chat",
                label: "Retrieval Evaluation",
                confidence: 2,
              },
            ],
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts working set requests and rejects invalid load depths", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "getWorkingSetStatus" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listWorkingSetEntries" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "pinWorkingSetSource",
          payload: { sourceId: "source-1", loadDepth: "chunks" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "reloadWorkingSetSource",
          payload: { sourceId: "source-1", loadDepth: "full" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "evictWorkingSetSource",
          payload: { sourceId: "source-1", reason: "over budget" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "setWorkingSetSourceDepth",
          payload: { sourceId: "source-1", loadDepth: "document" },
        },
      }),
    ).toBe(false);
  });

  it("types meta source hits as source-level tracks without widening chunk tracks", () => {
    const coarseSignals = {
      topicEvidence: 1,
      localPeak: 0.8,
      breadth: 0.6,
      specificity: 0.9,
      agreement: 0.7,
      uniqueHitChunkCount: 3,
      totalChunkCount: 12,
      hitChunkRatio: 0.25,
      evidenceRegionCount: 2,
      distinctSectionCount: 2,
      totalSectionCount: 5,
      matchedMetadataFields: ["title", "abstract"],
      lanes: [{ name: "topic", eligible: true, rawScore: 1, fusionStrength: 1, rank: 1 }],
    } satisfies RetrieveSourceCoarseSignals;
    const item = {
      id: "source-1",
      sourceKind: "page",
      sourceUrl: "https://example.test",
      sourceTitle: "Example",
      capturedAt: "2026-07-01T00:00:00.000Z",
      excerpt: "Example metadata",
      version: {
        groupKey: "page:https://example.test/:hash",
        versionNo: 1,
        isCurrent: true,
      },
      score: 1,
      tracks: ["meta_sources", "vector_meta", "fts_chunks"],
      hitChunks: [],
      coarseSignals,
    } satisfies RetrieveSourceItem;
    const chunk = {
      chunkId: "chunk-1",
      ord: 0,
      snippet: "chunk snippet",
      score: 1,
      track: "fts_chunks",
      sectionPath: "Methods",
    } satisfies RetrieveSourceHitChunk;

    expect(item.tracks).toContain("meta_sources");
    expect(item.tracks).toContain("vector_meta");
    expect(chunk.track).toBe("fts_chunks");
    expect(item.coarseSignals.matchedMetadataFields).toContain("abstract");
  });

  it("accepts explicit queued job run requests", () => {
    const activeModel = {
      id: "local-transformers:test:model:d384",
      provider: "local-transformers",
      label: "Local multilingual embedding model",
      dimension: 384,
      metric: "cosine",
      status: "active",
      updatedAt: "2026-07-03T00:00:00.000Z",
    } satisfies ActiveEmbeddingModelSummary;

    expect(activeModel).not.toHaveProperty("apiKey");

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "getActiveEmbeddingModel" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "runJob", id: "job-1" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "runJob", id: 42 },
      }),
    ).toBe(false);
  });

  it("accepts independent orchestration requests and rejects invalid filters", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "createOrchestrationRun",
          payload: { kind: "post_capture_job", targetJobId: "job-1" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "createOrchestrationRun",
          payload: { kind: "chat_run", targetJobId: "job-1" },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "listOrchestrationRuns",
          filter: { kind: "post_capture_job", status: "cancelled", limit: 8 },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "listOrchestrationRuns",
          filter: { status: "interrupted" },
        },
      }),
    ).toBe(false);

    for (const kind of [
      "runOrchestration",
      "cancelOrchestrationRun",
      "retryOrchestrationRun",
    ] as const) {
      expect(
        isEngineRequestMessage({
          type: CLIO_ENGINE_REQUEST,
          request: { kind, id: "orch-1" },
        }),
      ).toBe(true);
    }

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listOrchestrationEvents", runId: "orch-1", limit: 20 },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listOrchestrationEvents", runId: 42 },
      }),
    ).toBe(false);
  });

  it("accepts typed agent thinking and tool trace stream events", () => {
    expect(
      isAgentStreamEventMessage({
        type: CLIO_AGENT_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "thinking_delta",
          runId: "run-1",
          delta: "Checking the selected context.",
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: {
          type: "tool_trace",
          runId: "run-1",
          trace: {
            toolCallId: "tool-1",
            toolName: "search_memory",
            status: "running",
            summary: "Searching local memories",
          },
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: {
          type: "tool_trace",
          runId: "run-1",
          trace: {
            toolCallId: "tool-1",
            toolName: "search_memory",
            status: "waiting",
          },
        },
      }),
    ).toBe(false);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: {
          type: "citation",
          runId: "run-1",
          citation: {
            id: "cite-1",
            evidenceId: "page:0",
            label: "Page",
            sourceKind: "page",
            sourceUrl: "https://example.com",
            sourceTitle: "Example",
            excerpt: "Excerpt",
            outputOffset: 12,
          },
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: {
          type: "citation",
          runId: "run-1",
          citation: {
            id: "cite-1",
            evidenceId: "page:0",
            label: "Page",
            sourceKind: "page",
            sourceUrl: "https://example.com",
            sourceTitle: "Example",
            excerpt: "Excerpt",
            outputOffset: -1,
          },
        },
      }),
    ).toBe(false);

    expect(
      isAgentStreamEventMessage({
        type: CLIO_AGENT_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "citation_validation",
          runId: "run-1",
          validation: {
            status: "warning",
            reason: "missing_memory_citation",
            evidenceCount: 1,
            memoryEvidenceCount: 1,
            citationCount: 0,
            validCitationCount: 0,
            validMemoryCitationCount: 0,
            claimCount: 1,
            coveredClaimCount: 0,
            uncoveredClaimCount: 1,
            uncoveredClaims: [
              {
                text: "The saved memory preserves bounded evidence.",
                position: 0,
                reason: "missing_memory_citation",
              },
            ],
            evidenceQuality: "weak",
            qualityReason: "Only a short memory excerpt was available.",
            supportCheck: "judge_unavailable",
            semanticJudge: {
              status: "unavailable",
              checkedClaimCount: 1,
              unsupportedClaimCount: 0,
              providerKind: "chat",
              reason: "Provider config is unavailable.",
            },
            retry: {
              attempted: true,
              count: 1,
              exhausted: true,
              reason: "semantic_judge_unavailable",
            },
            message: "Source citation could not be verified.",
          },
        },
      }),
    ).toBe(true);

    expect(
      isAgentStreamEventMessage({
        type: CLIO_AGENT_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "citation_validation",
          runId: "run-1",
          validation: {
            status: "warning",
            reason: "missing_memory_claim_citation",
            evidenceCount: 1,
            memoryEvidenceCount: 1,
            citationCount: 0,
            validCitationCount: 0,
            validMemoryCitationCount: 0,
            claimCount: 1,
            coveredClaimCount: 0,
            uncoveredClaimCount: 1,
            uncoveredClaims: [
              {
                text: "The saved memory preserves bounded evidence.",
                position: -1,
                reason: "missing_memory_citation",
              },
            ],
          },
        },
      }),
    ).toBe(false);

    expect(
      isAgentStreamEventMessage({
        type: CLIO_AGENT_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "citation_validation",
          runId: "run-1",
          validation: {
            status: "warning",
            reason: "missing_memory_citation",
          },
        },
      }),
    ).toBe(false);

    expect(
      isAgentStreamEventMessage({
        type: CLIO_AGENT_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "citation_repair_started",
          runId: "run-1",
          reason: "unsupported_memory_claim",
          attempt: 1,
          message: "Repairing unsupported memory citations.",
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: {
          type: "citation_repair_started",
          runId: "run-1",
          reason: "not_a_reason",
          attempt: 1,
          message: "Repairing unsupported memory citations.",
        },
      }),
    ).toBe(false);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: {
          type: "citation_repair_started",
          runId: "run-1",
          reason: "unsupported_memory_claim",
          attempt: Number.NaN,
          message: "Repairing unsupported memory citations.",
        },
      }),
    ).toBe(false);
  });

  it("accepts typed multi-provider setup requests", () => {
    expect(
      isProviderConfigRequestMessage({
        type: CLIO_PROVIDER_CONFIG_REQUEST,
        request: { kind: "readActiveProviderConfig" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "getProviderSettings" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveOpenAIProvider",
          apiKey: "sk-test",
          model: "gpt-5.1",
          baseUrl: "https://api.openai.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveOpenAICompatibleProvider",
          apiKey: "sk-test",
          model: "gpt-5.5",
          baseUrl: "https://new-api.example.test/v1",
          providerName: "custom",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testOpenAIProvider",
          model: "gpt-5.1",
          baseUrl: "https://api.openai.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "ensureOpenAIHostPermission",
          baseUrl: "https://api.openai.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testOpenAICompatibleProvider",
          model: "gpt-5.5",
          baseUrl: "https://new-api.example.test/v1",
          providerName: "custom",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "ensureOpenAICompatibleHostPermission",
          baseUrl: "https://new-api.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "setActiveProvider", provider: "openai" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "setActiveProvider", provider: "openai-compatible" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "getVisionProviderSettings" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveVisionProviderSettings",
          settings: {
            provider: "openai-compatible",
            gemini: {
              apiKey: "gemini-vision",
              model: "gemini-2.5-pro",
            },
            openai: {
              apiKey: "sk-vision",
              model: "gpt-vision",
              baseUrl: "https://api.openai.example.test/v1",
            },
            openaiCompatible: {
              apiKey: "sk-compatible-vision",
              model: "vision-custom",
              baseUrl: "https://vision.example.test/v1",
              providerName: "custom",
            },
          },
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "ensureVisionProviderHostPermission",
          provider: "openai-compatible",
          baseUrl: "https://vision.example.test/v1",
        },
      }),
    ).toBe(true);
  });

  it("rejects removed remote embedding provider requests", () => {
    for (const request of [
      { kind: "getEmbeddingProviderSettings" },
      { kind: "saveEmbeddingProviderSettings", settings: {} },
      { kind: "testEmbeddingProvider", settings: {} },
      {
        kind: "ensureEmbeddingProviderHostPermission",
        provider: "openai-compatible",
        baseUrl: "https://embeddings.example.test/v1",
      },
      { kind: "authorizeEmbeddingReindex" },
    ]) {
      expect(
        isProviderRequestMessage({
          type: CLIO_PROVIDER_REQUEST,
          request,
        }),
      ).toBe(false);
    }
  });

  it("accepts only local-transformers embedding reindex engine requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "reindex",
          scope: "embeddings",
          model: {
            id: "openai:abcd:text-embedding-3-small:d1536",
            provider: "openai",
            label: "OpenAI Embeddings text-embedding-3-small (1536d)",
            dimension: 1536,
            metric: "cosine",
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "reindex",
          scope: "embeddings",
          model: {
            id: "local-transformers:xenova-multilingual-e5-small:revision:int8:d384",
            provider: "local-transformers",
            label: "Multilingual E5 Small",
            dimension: 384,
            metric: "cosine",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "reindex",
          scope: "embeddings",
          model: {
            id: "unsupported:test-model",
            provider: "unsupported",
            label: "Unsupported embedding model",
            dimension: 64,
            metric: "cosine",
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts only local worker embedding bridge requests", () => {
    expect(
      isWorkerEmbeddingRequestMessage({
        type: CLIO_WORKER_EMBEDDING_REQUEST,
        requestId: "embedding-request-1",
        request: {
          modelId: "openai:abcd:text-embedding-3-small:d1536",
          provider: "openai",
          purpose: "document",
          inputs: ["bounded chunk text", "bounded meta text"],
        },
      }),
    ).toBe(false);

    expect(
      isWorkerEmbeddingRequestMessage({
        type: CLIO_WORKER_EMBEDDING_REQUEST,
        requestId: "embedding-request-local",
        request: {
          modelId: "local-transformers:test-model",
          provider: "local-transformers",
          purpose: "document",
          inputs: ["bounded chunk text", "bounded meta text"],
        },
      }),
    ).toBe(true);

    expect(
      isWorkerEmbeddingResponseMessage({
        type: CLIO_WORKER_EMBEDDING_RESPONSE,
        requestId: "embedding-request-1",
        response: {
          ok: true,
          value: [
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
          ],
        },
      }),
    ).toBe(true);

    expect(
      isWorkerEmbeddingResponseMessage({
        type: CLIO_WORKER_EMBEDDING_RESPONSE,
        requestId: "embedding-request-1",
        response: {
          ok: false,
          error: {
            code: "PROVIDER_AUTH_ERROR",
            message: "Embedding provider auth failed.",
          },
        },
      }),
    ).toBe(true);
  });

  it("accepts trusted local embedding control messages", () => {
    expect(
      isLocalEmbeddingModelRequestMessage({
        type: CLIO_LOCAL_EMBEDDING_REQUEST,
        request: { kind: "getLocalEmbeddingModelStatus" },
      }),
    ).toBe(true);
    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testLocalEmbeddingModel",
          modelId: "local-transformers:test-model",
        },
      }),
    ).toBe(true);
    expect(
      isWorkerEmbeddingRequestMessage({
        type: CLIO_WORKER_EMBEDDING_REQUEST,
        requestId: "local-query-1",
        request: {
          modelId: "local-transformers:test-model",
          provider: "local-transformers",
          purpose: "query",
          inputs: ["bounded query"],
        },
      }),
    ).toBe(true);
  });

  it("accepts bounded worker chunk meta summary messages and rejects prompt boundary leaks", () => {
    const request = {
      type: CLIO_WORKER_CHUNK_META_SUMMARY_REQUEST,
      requestId: "chunk-meta-summary-request-1",
      request: {
        sourceId: "source:1",
        chunkId: "chunk:1",
        ord: 1,
        role: "child",
        sourceTitle: "Bounded Retrieval Study",
        sourceType: "paper",
        docContext: "Title: Bounded Retrieval Study",
        sectionPath: "Methods",
        chunkTextExcerpt: "The chunk describes bounded local retrieval context.",
      },
    };

    expect(isWorkerChunkMetaSummaryRequestMessage(request)).toBe(true);

    expect(
      isWorkerChunkMetaSummaryRequestMessage({
        ...request,
        request: {
          ...request.request,
          apiKey: "sk-leak",
        },
      }),
    ).toBe(false);

    expect(
      isWorkerChunkMetaSummaryRequestMessage({
        ...request,
        request: {
          ...request.request,
          normalizedText: "The full source text must not cross this bridge.",
        },
      }),
    ).toBe(false);

    expect(
      isWorkerChunkMetaSummaryRequestMessage({
        ...request,
        request: {
          ...request.request,
          fullText: "The full document must not cross this bridge.",
        },
      }),
    ).toBe(false);

    expect(
      isWorkerChunkMetaSummaryResponseMessage({
        type: CLIO_WORKER_CHUNK_META_SUMMARY_RESPONSE,
        requestId: "chunk-meta-summary-request-1",
        response: {
          ok: true,
          value: {
            status: "summarized",
            providerKind: "chat",
            sectionSummary: "Methods describe bounded retrieval.",
            chunkSummary: "The chunk explains local retrieval context.",
            semanticRelations: [
              {
                kind: "role",
                target: "method",
                label: "Methods",
                confidence: 0.72,
                reason: "Bounded chunk describes method details.",
                source: "remote_llm",
              },
            ],
          },
        },
      }),
    ).toBe(true);

    expect(
      isWorkerChunkMetaSummaryResponseMessage({
        type: CLIO_WORKER_CHUNK_META_SUMMARY_RESPONSE,
        requestId: "chunk-meta-summary-request-1",
        response: {
          ok: true,
          value: {
            status: "summarized",
            providerKind: "chat",
            semanticRelations: [
              {
                kind: "unsupported",
                target: "method",
                confidence: 0.72,
                source: "remote_llm",
              },
            ],
          },
        },
      }),
    ).toBe(false);

    expect(
      isWorkerChunkMetaSummaryResponseMessage({
        type: CLIO_WORKER_CHUNK_META_SUMMARY_RESPONSE,
        requestId: "chunk-meta-summary-request-1",
        response: {
          ok: false,
          error: {
            code: "CHUNK_META_SUMMARY_PROVIDER_ERROR",
            message: "Chunk meta summary provider failed.",
          },
        },
      }),
    ).toBe(true);
  });

  it("accepts bounded worker figure vision bridge messages and rejects prompt boundary leaks", () => {
    const request = {
      type: CLIO_WORKER_VISION_ANALYSIS_REQUEST,
      requestId: "vision-request-1",
      request: {
        analysisId: "figure-analysis:1",
        imageId: "image:1",
        pageNumber: 3,
        label: "Figure 1",
        caption: "Bounded chart caption.",
        pageContext: "A short page-local context window.",
        image: {
          base64: "QUJD",
          mimeType: "image/png",
          byteLength: 3,
        },
      },
    };

    expect(isWorkerVisionAnalysisRequestMessage(request)).toBe(true);

    expect(
      isWorkerVisionAnalysisRequestMessage({
        ...request,
        request: {
          ...request.request,
          apiKey: "sk-leak",
        },
      }),
    ).toBe(false);

    expect(
      isWorkerVisionAnalysisRequestMessage({
        ...request,
        request: {
          ...request.request,
          pdfBytes: new Uint8Array([1, 2, 3]),
        },
      }),
    ).toBe(false);

    expect(
      isWorkerVisionAnalysisRequestMessage({
        ...request,
        request: {
          ...request.request,
          fullText: "This field must never cross into the vision request.",
        },
      }),
    ).toBe(false);

    expect(
      isWorkerVisionAnalysisResponseMessage({
        type: CLIO_WORKER_VISION_ANALYSIS_RESPONSE,
        requestId: "vision-request-1",
        response: {
          ok: true,
          value: {
            status: "analyzed",
            analysisId: "figure-analysis:1",
            imageId: "image:1",
            providerKind: "chat",
            summary: "The chart compares bounded evidence quality.",
            chartType: "bar",
            extractedLabels: ["Precision"],
            extractedValues: ["0.91"],
            claims: [
              {
                claimId: "claim:0",
                text: "Precision is 0.91.",
                confidence: "high",
              },
            ],
          },
        },
      }),
    ).toBe(true);

    expect(
      isWorkerVisionAnalysisResponseMessage({
        type: CLIO_WORKER_VISION_ANALYSIS_RESPONSE,
        requestId: "vision-request-1",
        response: {
          ok: false,
          error: {
            code: "FIGURE_VISION_PROVIDER_ERROR",
            message: "Vision provider failed.",
          },
        },
      }),
    ).toBe(true);
  });

  it("accepts bounded worker graph extraction messages and rejects prompt boundary leaks", () => {
    const request = {
      type: CLIO_WORKER_GRAPH_EXTRACTION_REQUEST,
      requestId: "graph-extraction-request-1",
      request: {
        sourceId: "source:1",
        sourceTitle: "Bounded Graph Study",
        sourceType: "paper",
        abstract: "A bounded graph extraction study.",
        chunks: [
          {
            chunkId: "chunk:1",
            ord: 1,
            sectionPath: "Methods",
            excerpt: "The method uses bounded reciprocal rank fusion evidence.",
          },
        ],
      },
    };

    expect(isWorkerGraphExtractionRequestMessage(request)).toBe(true);
    expect(
      isWorkerGraphExtractionRequestMessage({
        ...request,
        request: { ...request.request, apiKey: "sk-leak" },
      }),
    ).toBe(false);
    expect(
      isWorkerGraphExtractionRequestMessage({
        ...request,
        request: { ...request.request, fullText: "Full document leak." },
      }),
    ).toBe(false);
    expect(
      isWorkerGraphExtractionRequestMessage({
        ...request,
        request: {
          ...request.request,
          chunks: [{ ...request.request.chunks[0], pdfBytes: new Uint8Array([1, 2, 3]) }],
        },
      }),
    ).toBe(false);

    expect(
      isWorkerGraphExtractionResponseMessage({
        type: CLIO_WORKER_GRAPH_EXTRACTION_RESPONSE,
        requestId: "graph-extraction-request-1",
        response: {
          ok: true,
          value: {
            status: "extracted",
            providerKind: "chat",
            entities: [{ id: "method:1", kind: "method", label: "RRF", confidence: 0.9 }],
            relations: [
              {
                sourceEntityId: "source",
                targetEntityId: "method:1",
                dimension: "technical",
                edgeType: "uses",
                confidence: 0.9,
                evidenceChunkIds: ["chunk:1"],
              },
            ],
          },
        },
      }),
    ).toBe(true);
  });

  it("accepts bounded Wiki Fine Rank bridge messages and rejects full-source fields", () => {
    const request = {
      type: CLIO_WORKER_SOURCE_FINE_RANK_REQUEST,
      requestId: "fine-rank-request-1",
      request: {
        query: "bounded retrieval",
        strength: "balanced",
        promptVersion: "source-fine-rank-v1",
        candidates: [
          {
            source: {
              id: "source:1",
              title: "Bounded Retrieval",
              sourceType: "paper",
              keywords: ["retrieval"],
              sectionHeadings: ["Methods"],
            },
            evidence: [{ id: "evidence:1", chunkId: "chunk:1", excerpt: "Bounded evidence." }],
            wiki: [
              {
                artifactId: "artifact:1",
                artifactKind: "source_digest",
                title: "Digest",
                outline: "A bounded digest.",
                evidenceRefs: ["chunk:1"],
              },
            ],
          },
        ],
      },
    };
    expect(isWorkerSourceFineRankRequestMessage(request)).toBe(true);
    expect(
      isWorkerSourceFineRankRequestMessage({
        ...request,
        request: { ...request.request, normalizedText: "Full source text must not cross bridge." },
      }),
    ).toBe(false);
    expect(
      isWorkerSourceFineRankResponseMessage({
        type: CLIO_WORKER_SOURCE_FINE_RANK_RESPONSE,
        requestId: request.requestId,
        response: {
          ok: true,
          value: {
            judgments: [
              {
                sourceId: "source:1",
                decision: "keep",
                relevance: "high",
                reason: "Matches bounded retrieval evidence.",
                confidence: 0.9,
                evidenceRefs: ["chunk:1"],
              },
            ],
          },
        },
      }),
    ).toBe(true);
  });

  it("accepts typed Search provider, stream, run, and history requests", () => {
    const searchRequest = {
      runId: "web-search-1",
      query: "browser ai search",
      createdAt: "2026-06-08T00:00:00.000Z",
    };
    const searchResult = {
      id: "search_web-search-1",
      runId: "web-search-1",
      query: "browser ai search",
      answer: "Search answer",
      sources: [
        {
          id: "src-1",
          title: "Example",
          url: "https://example.com/a",
          domain: "example.com",
          snippet: "Source snippet",
        },
      ],
      provider: "OpenAI Search",
      createdAt: "2026-06-08T00:00:00.000Z",
      completedAt: "2026-06-08T00:00:01.000Z",
    };

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveSearchProviderSettings",
          provider: "auto",
          openai: {
            apiKey: "",
            model: "gpt-search",
            baseUrl: "https://api.openai.example.test/v1",
          },
          openaiCompatible: {
            apiKey: "",
            model: "compatible-search-model",
            baseUrl: "https://new-api.example.test/v1",
          },
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveSearchProviderSettings",
          provider: "openai-compatible",
          openaiCompatible: {
            apiKey: "sk-test",
            model: "any-compatible-model",
            baseUrl: "https://new-api.example.test/v1",
          },
        },
      }),
    ).toBe(true);

    expect(
      isWebSearchStreamRequestMessage({
        type: CLIO_WEB_SEARCH_STREAM_REQUEST,
        requestId: "request-1",
        request: searchRequest,
      }),
    ).toBe(true);

    expect(
      isWebSearchStreamEventMessage({
        type: CLIO_WEB_SEARCH_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "answer_delta",
          runId: "web-search-1",
          delta: "Search",
        },
      }),
    ).toBe(true);

    expect(
      isWebSearchRunRequestMessage({
        type: CLIO_WEB_SEARCH_RUN_REQUEST,
        request: {
          kind: "start",
          request: searchRequest,
        },
      }),
    ).toBe(true);

    expect(
      isWebSearchRunEventMessage({
        type: CLIO_WEB_SEARCH_RUN_EVENT,
        event: {
          type: "completed",
          runId: "web-search-1",
          result: searchResult,
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendWebSearchHistory",
          payload: {
            id: searchResult.id,
            query: searchResult.query,
            answer: searchResult.answer,
            sources: searchResult.sources,
            provider: searchResult.provider,
            createdAt: searchResult.createdAt,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listWebSearchHistory", limit: 10 },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "deleteWebSearchHistory", id: "search_web-search-1" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "clearWebSearchHistory" },
      }),
    ).toBe(true);
  });

  it("accepts typed Image Gen provider, stream, run, and history requests", () => {
    const imageRequest = {
      runId: "image-run-1",
      mode: "edit" as const,
      prompt: "turn this into a clean icon",
      createdAt: "2026-06-09T00:00:00.000Z",
      input: {
        kind: "data_url" as const,
        value: "data:image/png;base64,iVBORw0KGgo=",
        mimeType: "image/png",
        name: "reference.png",
      },
    };
    const imageResult = {
      id: "image_image-run-1",
      runId: "image-run-1",
      mode: "edit" as const,
      prompt: "turn this into a clean icon",
      model: "gpt-image-2",
      size: "1024x1024",
      provider: "Image Gen",
      createdAt: "2026-06-09T00:00:00.000Z",
      completedAt: "2026-06-09T00:00:01.000Z",
      output: {
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,iVBORw0KGgo=",
        b64Json: "iVBORw0KGgo=",
      },
      input: imageRequest.input,
    };

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "getImageGenerationSettings" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveImageGenerationSettings",
          settings: {
            apiKey: "",
            model: "gpt-image-2",
            baseUrl: "https://images.example.test/v1",
            size: "auto",
          },
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "ensureImageGenerationHostPermission",
          baseUrl: "https://images.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isImageGenerationStreamRequestMessage({
        type: CLIO_IMAGE_GENERATION_STREAM_REQUEST,
        requestId: "request-1",
        request: imageRequest,
      }),
    ).toBe(true);

    expect(
      isImageGenerationStreamCancelMessage({
        type: CLIO_IMAGE_GENERATION_STREAM_CANCEL,
        requestId: "request-1",
      }),
    ).toBe(true);

    expect(
      isImageGenerationStreamEventMessage({
        type: CLIO_IMAGE_GENERATION_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "completed",
          runId: "image-run-1",
          result: imageResult,
        },
      }),
    ).toBe(true);

    expect(
      isImageGenerationRunRequestMessage({
        type: CLIO_IMAGE_GENERATION_RUN_REQUEST,
        request: {
          kind: "start",
          request: imageRequest,
        },
      }),
    ).toBe(true);

    expect(
      isImageGenerationRunRequestMessage({
        type: CLIO_IMAGE_GENERATION_RUN_REQUEST,
        request: {
          kind: "cancel",
          runId: "image-run-1",
        },
      }),
    ).toBe(true);

    expect(
      isImageGenerationRunEventMessage({
        type: CLIO_IMAGE_GENERATION_RUN_EVENT,
        event: {
          type: "completed",
          runId: "image-run-1",
          result: imageResult,
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendImageGenerationHistory",
          payload: {
            id: imageResult.id,
            mode: imageResult.mode,
            prompt: imageResult.prompt,
            model: imageResult.model,
            size: imageResult.size,
            provider: imageResult.provider,
            createdAt: imageResult.createdAt,
            output: imageResult.output,
            input: imageResult.input,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listImageGenerationHistory", limit: 20 },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "deleteImageGenerationHistory", id: "image_image-run-1" },
      }),
    ).toBe(true);
  });

  it("rejects invalid multi-provider setup requests", () => {
    expect(
      isProviderConfigRequestMessage({
        type: CLIO_PROVIDER_CONFIG_REQUEST,
        request: { kind: "getProviderSettings" },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "setActiveProvider", provider: "anthropic" },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "saveOpenAIProvider", apiKey: "sk-test" },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testOpenAIProvider",
          baseUrl: 42,
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testOpenAICompatibleProvider",
          baseUrl: 42,
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveSearchProviderSettings",
          provider: "perplexity",
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveVisionProviderSettings",
          settings: {
            provider: "anthropic",
          },
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveVisionProviderSettings",
          settings: {
            provider: "openai",
            openai: {
              apiKey: 42,
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "ensureVisionProviderHostPermission",
          provider: "anthropic",
        },
      }),
    ).toBe(false);

    expect(
      isWebSearchStreamRequestMessage({
        type: CLIO_WEB_SEARCH_STREAM_REQUEST,
        requestId: "request-1",
        request: {
          runId: "web-search-1",
          query: "browser ai search",
        },
      }),
    ).toBe(false);

    expect(
      isWebSearchRunEventMessage({
        type: CLIO_WEB_SEARCH_RUN_EVENT,
        event: {
          type: "completed",
          runId: "web-search-1",
          result: {
            id: "search_web-search-1",
            runId: "web-search-1",
            query: "browser ai search",
            answer: "Search answer",
            sources: [{ title: "Missing fields" }],
            provider: "OpenAI Search",
            createdAt: "2026-06-08T00:00:00.000Z",
            completedAt: "2026-06-08T00:00:01.000Z",
          },
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveImageGenerationSettings",
          settings: {
            size: "512x512",
          },
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveEmbeddingProviderSettings",
          settings: {
            activeProvider: "gemini",
          },
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testEmbeddingProvider",
          settings: {
            activeProvider: "openai",
            openai: {
              apiKey: 42,
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "ensureEmbeddingProviderHostPermission",
          provider: "anthropic",
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "authorizeEmbeddingReindex",
          apiKey: "sk-should-not-cross-authorization-boundary",
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "reindex",
          scope: "embeddings",
          model: {
            id: "openai:abcd:text-embedding-3-small:d1536",
            provider: "openai",
            label: "OpenAI Embeddings text-embedding-3-small (1536d)",
            dimension: "1536",
            metric: "cosine",
          },
        },
      }),
    ).toBe(false);

    expect(
      isWorkerEmbeddingRequestMessage({
        type: CLIO_WORKER_EMBEDDING_REQUEST,
        requestId: "embedding-request-1",
        request: {
          modelId: "openai:abcd:text-embedding-3-small:d1536",
          inputs: ["bounded text"],
          apiKey: "sk-should-not-cross-worker-boundary",
        },
      }),
    ).toBe(false);

    expect(
      isWorkerEmbeddingResponseMessage({
        type: CLIO_WORKER_EMBEDDING_RESPONSE,
        requestId: "embedding-request-1",
        response: {
          ok: true,
          value: [[0.1, Number.NaN]],
        },
      }),
    ).toBe(false);

    expect(
      isImageGenerationStreamRequestMessage({
        type: CLIO_IMAGE_GENERATION_STREAM_REQUEST,
        requestId: "request-1",
        request: {
          runId: "image-run-1",
          mode: "paint",
          prompt: "invalid mode",
          createdAt: "2026-06-09T00:00:00.000Z",
        },
      }),
    ).toBe(false);

    expect(
      isImageGenerationRunEventMessage({
        type: CLIO_IMAGE_GENERATION_RUN_EVENT,
        event: {
          type: "completed",
          runId: "image-run-1",
          result: {
            id: "image_image-run-1",
            runId: "image-run-1",
            mode: "generate",
            prompt: "missing output b64",
            model: "gpt-image-2",
            size: "1024x1024",
            provider: "Image Gen",
            createdAt: "2026-06-09T00:00:00.000Z",
            completedAt: "2026-06-09T00:00:01.000Z",
            output: {
              mimeType: "image/png",
              dataUrl: "data:image/png;base64,iVBORw0KGgo=",
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts typed extension UI requests", () => {
    expect(
      isUiRequestMessage({
        type: CLIO_UI_REQUEST,
        request: { kind: "openOptions" },
      }),
    ).toBe(true);

    expect(
      isUiRequestMessage({
        type: CLIO_UI_REQUEST,
        request: { kind: "openSidePanel" },
      }),
    ).toBe(false);
  });
});
