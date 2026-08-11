import type {
  ChunkMetaSummarizer,
  ChunkMetaSummaryInput,
} from "@/src/agent-runtime/chunk-meta-summary";
import type { FigureVisionAnalysisInput } from "@/src/agent-runtime/figure-vision-analyzer";
import type { GraphExtractionInput } from "@/src/agent-runtime/graph-extractor";
import type {
  CaptureBasePayload,
  CaptureSelectionPayload,
  EmbeddingReindexModelDescriptor,
  EngineRequest,
  EngineResultFor,
  JobSummary,
  PublishWikiArtifactsPayload,
  RetrieveSourcesResult,
  SourceContextMapRunDetail,
} from "@/src/shared/rpc";
import { hashText } from "@/src/shared/text";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  type ActiveEmbeddingModel,
  type EmbeddingProvider,
  LocalEngine,
  type LocalEngineOptions,
  type LocalEngineSqliteApi,
  type LocalEngineSqliteDb,
  type PdfRawFileStore,
  type PdfRawFileStoreWriteInput,
  type PdfRawFileStoreWriteResult,
} from "./local-engine.worker";
import type { ParsedPdfDocument } from "./pdf-parser";

let sqliteApi: LocalEngineSqliteApi;

const engines: LocalEngine[] = [];

beforeAll(async () => {
  sqliteApi = (await sqlite3InitModule()) as unknown as LocalEngineSqliteApi;
});

afterEach(() => {
  while (engines.length > 0) {
    engines.pop()?.close();
  }
});

describe("local engine behavior harness", () => {
  it("keeps capture and keyword retrieval available without an embedding model", async () => {
    const harness = createHarness();
    expect(await harness.request({ kind: "getActiveEmbeddingModel" })).toBeNull();

    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceTitle: "Keyword Only Capture",
        normalizedText: ragText("keyword-only retrieval remains available", 30),
      }),
    });
    const queued = await harness.request({ kind: "getJobStatus", status: "queued" });
    const job = await harness.request({ kind: "runJob", id: queued.jobs[0]?.id ?? "" });
    expect(job.status).toBe("done");
    expect(harness.count("source_embeddings", "source_id = ?", [capture.memory.id])).toBe(0);

    const storedJob = harness.selectObject("SELECT result_json FROM jobs WHERE id = ? LIMIT 1", [
      queued.jobs[0]?.id ?? "",
    ]);
    expect(JSON.parse(String(storedJob?.result_json ?? "{}"))).toMatchObject({
      embedding: {
        skipped: true,
        reason: "embedding_model_unavailable",
      },
    });

    const retrieved = await harness.request({
      kind: "retrieveSources",
      payload: { query: "keyword-only retrieval", limit: 5, includeChunks: 1 },
    });
    expect(retrieved.items[0]?.id).toBe(capture.memory.id);
    expect(trackStatus(retrieved, "fts_chunks")).toBe("used");
    expect(trackStatus(retrieved, "vector_meta")).toBe("unavailable");
    expect(trackReason(retrieved, "vector_meta")).toBe("embedding_model_unavailable");
  });

  it("keeps title-only matches in metadata instead of multiplying them across chunks", async () => {
    const harness = createHarness();
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceTitle: "PurityChecker ZXQ Evaluation",
        normalizedText: ragText("generic benchmark content", 80),
        metadata: {
          title: "PurityChecker ZXQ Evaluation",
          abstract: "A benchmark report.",
          source_type: "paper",
        },
      }),
    });

    const result = await harness.request({
      kind: "retrieveSources",
      payload: { query: "PurityChecker ZXQ", limit: 5, includeChunks: 8 },
    });
    const item = result.items.find((candidate) => candidate.id === capture.memory.id);

    expect(item?.tracks).toContain("meta_sources");
    expect(item?.tracks).not.toContain("fts_chunks");
    expect(item?.hitChunks).toEqual([]);
    expect(item?.coarseSignals?.matchedMetadataFields).toContain("title");
    expect(item?.coarseSignals?.breadth).toBe(0);
  });

  it("exposes an optional document fine-rank boundary after coarse ranking", async () => {
    let fineRankInputIds: string[] = [];
    const harness = createHarness({
      sourceFineRanker: {
        async rerank({ candidates }) {
          fineRankInputIds = candidates.map((candidate) => candidate.id);
          return [...candidates].reverse();
        },
      },
    });
    await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/fine-rank-first",
        sourceTitle: "Fine rank first",
        normalizedText: ragText("fine rank boundary evidence", 12),
      }),
    });
    await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/fine-rank-second",
        sourceTitle: "Fine rank second",
        normalizedText: ragText("fine rank boundary evidence", 12),
      }),
    });

    const result = await harness.request({
      kind: "retrieveSources",
      payload: { query: "fine rank boundary", limit: 5, includeChunks: 2 },
    });

    expect(fineRankInputIds).toHaveLength(2);
    expect(result.items.map((item) => item.id)).toEqual([...fineRankInputIds].reverse());
    expect(result.trace.fineRank?.status).toBe("applied");
  });

  it("removes legacy deterministic embedding rows during migration", async () => {
    const harness = createHarness({
      prepareDatabase(db) {
        db.exec(`
          CREATE TABLE embedding_models (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            label TEXT NOT NULL,
            dimension INTEGER NOT NULL,
            metric TEXT NOT NULL CHECK (metric IN ('cosine')),
            status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
          )
        `);
        db.exec(`
          CREATE TABLE source_embeddings (
            model_id TEXT NOT NULL,
            target_kind TEXT NOT NULL CHECK (target_kind IN ('chunk', 'meta')),
            target_id TEXT NOT NULL,
            source_id TEXT NOT NULL,
            vector_json TEXT NOT NULL,
            text_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (model_id, target_kind, target_id)
          )
        `);
        db.exec(
          `INSERT INTO embedding_models VALUES (
            'legacy-hash-model',
            'local-deterministic',
            'Legacy hash model',
            64,
            'cosine',
            'active',
            '2026-07-01T00:00:00.000Z',
            '2026-07-01T00:00:00.000Z'
          )`,
        );
        db.exec(
          `INSERT INTO source_embeddings VALUES (
            'legacy-hash-model',
            'meta',
            'legacy-source',
            'legacy-source',
            '[1,0]',
            'legacy-hash',
            '2026-07-01T00:00:00.000Z',
            '2026-07-01T00:00:00.000Z'
          )`,
        );
        db.exec("PRAGMA user_version = 21");
      },
    });

    expect(await harness.request({ kind: "getActiveEmbeddingModel" })).toBeNull();
    expect(harness.count("embedding_models", "provider = 'local-deterministic'")).toBe(0);
    expect(harness.count("source_embeddings", "model_id = 'legacy-hash-model'")).toBe(0);
  });

  it("builds and queries explicit source graph with evidence anchors", async () => {
    const harness = createHarness();
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/graph",
        sourceTitle: "Graph Retrieval Study",
        normalizedText: [
          "# Graph Retrieval Study",
          "## Architecture",
          "The RAG graph pipeline uses a retrieval adapter and embedding index.",
          "## Dataset",
          "The benchmark dataset measures recall precision and latency score quality.",
          "## Problem",
          "The failure limitation is long context evidence overload.",
        ].join("\n"),
        metadata: {
          title: "Graph Retrieval Study",
          abstract: "RAG graph architecture links retrieval method evidence to bounded chunks.",
          source_type: "paper",
          authors: ["Ada Lovelace", "Grace Hopper"],
          venue: "Local RAG Symposium",
          categories: ["knowledge graph"],
        },
      }),
    });
    const sourceId = capture.memory.id;

    const queued = await harness.request({ kind: "getJobStatus", status: "queued", limit: 10 });
    for (const job of queued.jobs) {
      const result = await harness.request({ kind: "runJob", id: job.id });
      expect(result.status).toBe("done");
    }
    const finishedJob = harness.selectObject("SELECT result_json FROM jobs WHERE id = ? LIMIT 1", [
      queued.jobs[0]?.id ?? "",
    ]);
    const defaultJobResult = JSON.parse(String(finishedJob?.result_json ?? "{}")) as {
      chunkMeta?: {
        chunkCount?: number;
        selectedTier?: string;
        tier?: string;
        tier1Count?: number;
        tier2DisabledCount?: number;
        tier2Reason?: string;
      };
      graph?: { skipped?: boolean; reason?: string };
    };
    expect(defaultJobResult.chunkMeta?.tier).toBe("tier1");
    expect(defaultJobResult.chunkMeta?.selectedTier).toBe("tier1");
    expect(defaultJobResult.chunkMeta?.chunkCount ?? 0).toBeGreaterThan(0);
    expect(defaultJobResult.chunkMeta?.tier1Count ?? 0).toBeGreaterThan(0);
    expect(defaultJobResult.chunkMeta?.tier2DisabledCount ?? 0).toBeGreaterThan(0);
    expect(defaultJobResult.chunkMeta?.tier2Reason).toBe("explicit_llm_chunk_meta_not_configured");
    expect(defaultJobResult.graph).toMatchObject({
      skipped: true,
      reason: "explicit_build_required",
    });

    expect(harness.count("graph_nodes")).toBe(0);
    expect(harness.count("graph_edges")).toBe(0);

    const explicitGraphJobId = "job_explicit_graph_build";
    const explicitGraphJobCreatedAt = "2026-07-05T00:00:00.000Z";
    harness.exec(
      `INSERT INTO jobs (
        id,
        type,
        status,
        attempts,
        max_attempts,
        run_after,
        payload_json,
        created_at
      ) VALUES (?, 'post_capture_hardening', 'queued', 0, 3, ?, ?, ?)`,
      [
        explicitGraphJobId,
        explicitGraphJobCreatedAt,
        JSON.stringify({
          sourceId,
          stages: ["graph"],
          graphBuildMode: "deterministic",
        }),
        explicitGraphJobCreatedAt,
      ],
    );
    const graphJob = await harness.request({ kind: "runJob", id: explicitGraphJobId });
    expect(graphJob.status).toBe("done");
    const finishedGraphJob = harness.selectObject(
      "SELECT result_json FROM jobs WHERE id = ? LIMIT 1",
      [explicitGraphJobId],
    );
    const explicitGraphJobResult = JSON.parse(String(finishedGraphJob?.result_json ?? "{}")) as {
      graph?: { nodeCount?: number; edgeCount?: number; evidenceChunkCount?: number };
    };
    expect(explicitGraphJobResult.graph?.nodeCount ?? 0).toBeGreaterThan(1);
    expect(explicitGraphJobResult.graph?.edgeCount ?? 0).toBeGreaterThan(0);
    expect(explicitGraphJobResult.graph?.evidenceChunkCount ?? 0).toBeGreaterThan(0);
    expect(harness.count("graph_nodes")).toBeGreaterThan(1);
    expect(harness.count("graph_edges")).toBeGreaterThan(0);

    const build = await harness.request({
      kind: "buildSourceGraph",
      payload: { sourceId, mode: "deterministic" },
    });
    expect(build.sourceId).toBe(sourceId);
    expect(build.nodeCount).toBeGreaterThan(1);
    expect(build.edgeCount).toBeGreaterThan(0);
    expect(build.evidenceChunkCount).toBeGreaterThan(0);
    expect(harness.count("sources", "id = ? AND analysis_level = 'analyzed'", [sourceId])).toBe(1);

    const neighbors = await harness.request({
      kind: "queryGraphNeighbors",
      payload: { sourceId, limit: 100 },
    });
    expect(neighbors.nodes.some((node) => node.kind === "source" && node.refId === sourceId)).toBe(
      true,
    );
    expect(neighbors.nodes.some((node) => node.kind === "person")).toBe(true);
    expect(neighbors.nodes.some((node) => node.kind === "method")).toBe(true);
    expect(
      neighbors.edges.some(
        (edge) => edge.dimension === "metadata" && edge.edgeType === "authored_by",
      ),
    ).toBe(true);
    expect(
      neighbors.edges.some(
        (edge) => edge.evidenceSourceId === sourceId && edge.evidenceChunkIds.length > 0,
      ),
    ).toBe(true);
    expect(
      neighbors.evidence.some(
        (anchor) => anchor.sourceId === sourceId && anchor.excerpt.length > 0,
      ),
    ).toBe(true);

    const methodNode = neighbors.nodes.find((node) => node.kind === "method");
    expect(methodNode).toBeDefined();
    const path = await harness.request({
      kind: "queryGraphPath",
      payload: {
        from: { sourceId },
        to: { nodeId: methodNode?.id ?? "" },
        limit: 40,
        maxDepth: 3,
      },
    });
    expect(path.edges.length).toBeGreaterThan(0);
    expect(path.nodes[0]?.kind).toBe("source");
    expect(path.nodes[0]?.refId).toBe(sourceId);
    expect(path.nodes[path.nodes.length - 1]?.id).toBe(methodNode?.id);
    expect(path.evidence.some((anchor) => anchor.sourceId === sourceId)).toBe(true);

    const timeline = await harness.request({
      kind: "queryGraphTimeline",
      payload: { sourceIds: [sourceId], kind: "method", order: "asc", limit: 20 },
    });
    expect(timeline.edges.length).toBeGreaterThan(0);
    expect(timeline.edges.length).toBeLessThanOrEqual(20);
    expect(timeline.nodes.some((node) => node.id === methodNode?.id)).toBe(true);
    expect(timeline.evidence.some((anchor) => anchor.sourceId === sourceId)).toBe(true);

    const subgraph = await harness.request({
      kind: "queryGraphSubgraph",
      payload: { sourceIds: [sourceId], dimension: "domain", limit: 20 },
    });
    expect(subgraph.edges.length).toBeGreaterThan(0);
    expect(subgraph.edges.length).toBeLessThanOrEqual(20);
    expect(subgraph.nodes.length).toBeGreaterThan(0);
    expect(subgraph.evidence.some((anchor) => anchor.sourceId === sourceId)).toBe(true);

    await harness.request({ kind: "deleteMemory", id: sourceId });
    expect(harness.count("graph_edges")).toBe(0);
    expect(harness.count("graph_nodes", "kind = 'source' AND ref_id = ?", [sourceId])).toBe(0);
  });

  it("builds citation edges from reference metadata with chunk evidence anchors", async () => {
    const harness = createHarness();
    const text = [
      "# Citation Graph Study",
      "The bounded retrieval result follows prior evidence [1] in the evaluation.",
      "## References",
      "[1] Ada Lovelace. Bounded Evidence Retrieval. 2024. doi:10.5555/bounded.1",
    ].join("\n");
    const markerStart = text.indexOf("[1]");
    const referenceStart = text.lastIndexOf("[1]");
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceTitle: "Citation Graph Study",
        normalizedText: text,
        metadata: {
          source_type: "pdf",
          paper_metadata: {
            version: 1,
            authors: [],
            referenceList: [
              {
                index: 0,
                raw: "Ada Lovelace. Bounded Evidence Retrieval. 2024. doi:10.5555/bounded.1",
                title: "Bounded Evidence Retrieval",
                doi: "10.5555/bounded.1",
              },
            ],
          },
          pdf_references: [
            {
              index: 0,
              label: "[1]",
              text: "Ada Lovelace. Bounded Evidence Retrieval. 2024. doi:10.5555/bounded.1",
              charStart: referenceStart,
              charEnd: text.length,
              pageStart: 2,
              pageEnd: 2,
              doi: "10.5555/bounded.1",
            },
          ],
          pdf_citation_links: [
            {
              id: "citation-link:1",
              marker: "[1]",
              citationStyle: "numeric_bracket",
              normalizedTargetLabel: "[1]",
              targetReferenceIndex: 0,
              targetReferenceLabel: "[1]",
              charStart: markerStart,
              charEnd: markerStart + 3,
              pageNumber: 1,
              context: "prior evidence [1] in the evaluation",
              confidence: "high",
            },
          ],
        },
      }),
    });

    const build = await harness.request({
      kind: "buildSourceGraph",
      payload: { sourceId: capture.memory.id, mode: "deterministic" },
    });
    expect(build).toMatchObject({
      requestedMode: "deterministic",
      appliedMode: "deterministic",
      citationEdgeCount: 1,
    });

    const neighbors = await harness.request({
      kind: "queryGraphNeighbors",
      payload: { sourceId: capture.memory.id, dimension: "citation", limit: 20 },
    });
    const citationEdge = neighbors.edges.find((edge) => edge.edgeType === "cites");
    expect(citationEdge).toMatchObject({
      dimension: "citation",
      evidenceSourceId: capture.memory.id,
      weight: 0.95,
    });
    expect(citationEdge?.evidenceChunkIds.length ?? 0).toBeGreaterThan(0);
    expect(neighbors.nodes).toContainEqual(
      expect.objectContaining({ kind: "source", canonicalId: "source:doi:10.5555/bounded.1" }),
    );
    expect(neighbors.evidence.some((anchor) => anchor.excerpt.includes("prior evidence"))).toBe(
      true,
    );
  });

  it("runs explicit LLM graph jobs and falls back to deterministic graph on provider failure", async () => {
    const observedInputs: GraphExtractionInput[] = [];
    const harness = createHarness({
      graphExtractor: {
        extract: async (input) => {
          observedInputs.push(input);
          return {
            status: "extracted",
            providerKind: "chat",
            entities: [
              {
                id: "method:rrf",
                kind: "method",
                label: "Reciprocal rank fusion",
                confidence: 0.94,
              },
            ],
            relations: [
              {
                sourceEntityId: "source",
                targetEntityId: "method:rrf",
                dimension: "technical",
                edgeType: "uses",
                confidence: 0.94,
                evidenceChunkIds: [input.chunks[0]?.chunkId ?? ""],
              },
            ],
          };
        },
      },
    });
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceTitle: "LLM Graph Job Study",
        normalizedText: ragText("bounded reciprocal rank fusion method evidence", 30),
        metadata: { source_type: "paper", categories: ["retrieval"] },
      }),
    });
    const queued = await harness.request({
      kind: "enqueueSourceGraphJob",
      payload: { sourceId: capture.memory.id, mode: "llm" },
    });
    const orchestration = await harness.request({
      kind: "createOrchestrationRun",
      payload: { kind: "post_capture_job", targetJobId: queued.id },
    });
    const completed = await harness.request({ kind: "runOrchestration", id: orchestration.id });
    expect(completed.status).toBe("done");
    expect(observedInputs).toHaveLength(1);
    expect(observedInputs[0]?.chunks.length ?? 0).toBeLessThanOrEqual(10);
    expect(JSON.stringify(observedInputs[0])).not.toContain("apiKey");
    expect(JSON.stringify(observedInputs[0])).not.toContain("normalizedText");

    const jobRow = harness.selectObject("SELECT result_json FROM jobs WHERE id = ? LIMIT 1", [
      queued.id,
    ]);
    const result = JSON.parse(String(jobRow?.result_json ?? "{}")) as {
      graph?: {
        requestedMode?: string;
        appliedMode?: string;
        llmEdgeCount?: number;
        fallbackReason?: string;
      };
    };
    expect(result.graph).toMatchObject({
      requestedMode: "llm",
      appliedMode: "llm",
      llmEdgeCount: 1,
    });

    const fallbackHarness = createHarness({
      graphExtractor: {
        extract: async () => ({
          status: "unavailable",
          providerKind: "chat",
          entities: [],
          relations: [],
          reason: "provider_not_configured",
        }),
      },
    });
    const fallbackCapture = await fallbackHarness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceTitle: "Fallback Graph Study",
        normalizedText: ragText("deterministic fallback graph method evidence", 20),
        metadata: { source_type: "paper", categories: ["graph retrieval"] },
      }),
    });
    const fallback = await fallbackHarness.request({
      kind: "buildSourceGraph",
      payload: { sourceId: fallbackCapture.memory.id, mode: "llm" },
    });
    expect(fallback).toMatchObject({
      requestedMode: "llm",
      appliedMode: "deterministic",
      llmEdgeCount: 0,
      fallbackReason: "provider_not_configured",
    });
    expect(fallback.edgeCount).toBeGreaterThan(0);
  });

  it("wraps post-capture jobs in durable orchestration runs with cancel and retry", async () => {
    const harness = createHarness();
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/orchestration",
        sourceTitle: "Orchestration Evidence",
        normalizedText: ragText("orchestration post capture job evidence", 80),
        metadata: {
          title: "Orchestration Evidence",
          source_type: "research-note",
        },
      }),
    });
    const queuedJobs = await harness.request({ kind: "getJobStatus", status: "queued", limit: 10 });
    const queuedJobId = queuedJobs.jobs[0]?.id ?? "";
    expect(queuedJobId).toMatch(/^job_/);

    const run = await harness.request({
      kind: "createOrchestrationRun",
      payload: { kind: "post_capture_job", targetJobId: queuedJobId },
    });
    expect(run.status).toBe("queued");
    expect(run.targetJobId).toBe(queuedJobId);
    expect(harness.count("orchestration_runs")).toBe(1);
    expect(harness.count("orchestration_events", "run_id = ?", [run.id])).toBe(1);

    const completed = await harness.request({ kind: "runOrchestration", id: run.id });
    expect(completed.status).toBe("done");
    expect(completed.progressCurrent).toBe(1);
    expect(completed.progressTotal).toBe(1);
    expect(harness.count("jobs", "id = ? AND status = 'done'", [queuedJobId])).toBe(1);

    const runs = await harness.request({
      kind: "listOrchestrationRuns",
      filter: { kind: "post_capture_job", limit: 10 },
    });
    expect(runs.runs[0]?.id).toBe(run.id);
    const events = await harness.request({
      kind: "listOrchestrationEvents",
      runId: run.id,
      limit: 20,
    });
    expect(events.events.some((event) => event.kind === "job_completed")).toBe(true);

    const cancelJob = await harness.request({
      kind: "enqueueChunkMetaTier2Job",
      payload: { sourceId: capture.memory.id, maxChunks: 1 },
    });
    const cancellable = await harness.request({
      kind: "createOrchestrationRun",
      payload: { kind: "post_capture_job", targetJobId: cancelJob.id },
    });
    const cancelled = await harness.request({ kind: "cancelOrchestrationRun", id: cancellable.id });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelRequested).toBe(true);
    expect(harness.count("jobs", "id = ? AND status = 'queued'", [cancelJob.id])).toBe(1);

    const retryCancelled = await harness.request({
      kind: "retryOrchestrationRun",
      id: cancellable.id,
    });
    expect(retryCancelled.retryOfRunId).toBe(cancellable.id);
    expect(retryCancelled.targetJobId).toBe(cancelJob.id);

    const badJobId = "job_orchestration_bad_payload";
    harness.exec(
      `INSERT INTO jobs (
        id,
        type,
        status,
        attempts,
        max_attempts,
        run_after,
        payload_json,
        created_at
      ) VALUES (?, 'post_capture_hardening', 'queued', 0, 1, ?, ?, ?)`,
      [
        badJobId,
        "2026-07-09T00:00:00.000Z",
        JSON.stringify({ sourceId: "missing-source", stages: ["embedding"] }),
        "2026-07-09T00:00:00.000Z",
      ],
    );
    const failing = await harness.request({
      kind: "createOrchestrationRun",
      payload: { kind: "post_capture_job", targetJobId: badJobId },
    });
    const failed = await harness.request({ kind: "runOrchestration", id: failing.id });
    expect(failed.status).toBe("failed");
    expect(failed.lastError).toContain("Source not found");

    const retryFailed = await harness.request({
      kind: "retryOrchestrationRun",
      id: failed.id,
    });
    expect(retryFailed.retryOfRunId).toBe(failed.id);
    expect(retryFailed.targetJobId).not.toBe(badJobId);
    expect(harness.count("jobs", "id = ? AND status = 'queued'", [retryFailed.targetJobId])).toBe(
      1,
    );
  });

  it("runs capture, post-capture embedding, retrieval, and evidence windows", async () => {
    const harness = createHarness();
    await activateTestEmbeddingModel(harness);
    const sourceText = ragText("alpha metadata retrieval evidence", 700);
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        normalizedText: sourceText,
        metadata: {
          title: "Alpha Metadata Retrieval",
          abstract: "Alpha metadata connects source-level search with bounded evidence windows.",
          source_type: "research-note",
        },
      }),
    });

    expect(capture.status).toBe("saved");
    const sourceId = capture.memory.id;
    const firstChunk = harness.selectObject(
      "SELECT id, text, hash, meta_head_json FROM source_chunks WHERE source_id = ? ORDER BY ord ASC LIMIT 1",
      [sourceId],
    );
    const metaHead = JSON.parse(String(firstChunk?.meta_head_json ?? "{}")) as {
      version?: number;
      tier?: string;
      summarySource?: string;
      docContext?: string;
      source?: { title?: string; type?: string; abstract?: string | null };
      sectionSummary?: string | null;
      chunkSummary?: string | null;
      roleHint?: string | null;
      relations?: Array<{ kind?: string; target?: string; label?: string | null }>;
    };
    expect(metaHead.version).toBe(1);
    expect(metaHead.tier).toBe("tier0");
    expect(metaHead.summarySource).toBe("deterministic");
    expect(metaHead.docContext).toContain("Alpha Metadata Retrieval");
    expect(metaHead.docContext).toContain(
      "Alpha metadata connects source-level search with bounded evidence windows.",
    );
    expect(metaHead.source?.type).toBe("research-note");
    expect(metaHead.sectionSummary).toBeNull();
    expect(metaHead.chunkSummary).toContain("alpha metadata retrieval evidence");
    expect(metaHead.roleHint).toBe("body");
    expect(metaHead.relations).toEqual(expect.any(Array));

    const queued = await harness.request({ kind: "getJobStatus", status: "queued" });
    expect(queued.jobs).toHaveLength(1);
    expect(queued.jobs[0]?.type).toBe("post_capture_hardening");

    const job = await harness.request({ kind: "runJob", id: queued.jobs[0]?.id ?? "" });
    expect(job.status).toBe("done");

    expect(harness.count("source_embeddings", "source_id = ?", [sourceId])).toBeGreaterThan(1);
    expect(harness.count("source_metadata_fts", "source_id = ?", [sourceId])).toBe(1);
    expect(
      harness.count("source_embeddings", "source_id = ? AND target_kind = 'meta'", [sourceId]),
    ).toBe(1);
    expect(
      harness.count("source_embeddings", "source_id = ? AND target_kind = 'chunk'", [sourceId]),
    ).toBeGreaterThan(0);
    const chunkEmbedding = harness.selectObject(
      "SELECT text_hash FROM source_embeddings WHERE source_id = ? AND target_kind = 'chunk' ORDER BY target_id ASC LIMIT 1",
      [sourceId],
    );
    const repairedFirstChunk = harness.selectObject(
      "SELECT id, text, hash, meta_head_json FROM source_chunks WHERE id = ? LIMIT 1",
      [String(firstChunk?.id ?? "")],
    );
    const repairedMetaHead = JSON.parse(
      String(repairedFirstChunk?.meta_head_json ?? "{}"),
    ) as ChunkMetaHeadForTest;
    expect(repairedMetaHead.tier).toBe("tier1");
    expect(repairedMetaHead.selectedTier).toBe("tier1");
    expect(repairedMetaHead.summarySource).toBe("local_extractive");
    expect(repairedMetaHead.tiers?.tier1?.status).toBe("available");
    expect(repairedMetaHead.tiers?.tier1?.summarySource).toBe("local_extractive");
    expect(repairedMetaHead.tiers?.tier2?.status).toBe("disabled");
    expect(repairedMetaHead.tiers?.tier2?.reason).toBe("explicit_llm_chunk_meta_not_configured");
    expect(repairedMetaHead.semanticRelations?.some((relation) => relation.kind === "role")).toBe(
      true,
    );
    expect(chunkEmbedding?.text_hash).toBe(firstChunk?.hash);
    expect(chunkEmbedding?.text_hash).toBe(hashText(String(repairedFirstChunk?.text ?? "")));

    const retrieved = await harness.request({
      kind: "retrieveSources",
      payload: { query: "alpha metadata evidence", limit: 5, includeChunks: 2 },
    });
    expect(retrieved.items[0]?.id).toBe(sourceId);
    expect(retrieved.items[0]?.tracks).toEqual(
      expect.arrayContaining(["meta_sources", "vector_meta", "fts_chunks", "vector_chunks"]),
    );
    expect(retrieved.items[0]?.hitChunks.length).toBeGreaterThan(0);
    expect(trackStatus(retrieved, "meta_sources")).toBe("used");
    expect(trackStatus(retrieved, "vector_meta")).toBe("used");
    expect(trackStatus(retrieved, "fts_chunks")).toBe("used");
    expect(trackStatus(retrieved, "vector_chunks")).toBe("used");

    const windows = await harness.request({
      kind: "getMemoryEvidenceWindows",
      payload: {
        query: "alpha metadata evidence",
        memoryIds: [sourceId],
        anchors: retrieved.items[0]?.hitChunks.map((chunk) => ({
          memoryId: sourceId,
          chunkId: chunk.chunkId,
        })),
        limit: 2,
        contextChunksBefore: 1,
        contextChunksAfter: 1,
      },
    });
    expect(windows.items.length).toBeGreaterThan(0);
    expect(windows.items[0]?.memoryId).toBe(sourceId);
    expect(windows.items[0]?.chunks.length).toBeGreaterThan(0);
    expect(windows.items[0]?.chunks.length).toBeLessThanOrEqual(3);
    expect(windows.items[0]?.chunks.map((chunk) => chunk.text).join("\n").length).toBeLessThan(
      sourceText.length,
    );
  });

  it("marks explicit Tier2 chunk meta as unavailable when no summarizer is installed", async () => {
    const harness = createHarness();
    const sourceText = ragText("tier2 missing provider fallback", 8);
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/tier2-missing",
        sourceTitle: "Tier2 Missing Provider",
        normalizedText: sourceText,
      }),
    });
    const sourceId = capture.memory.id;
    const queued = await harness.request({
      kind: "enqueueChunkMetaTier2Job",
      payload: { sourceId, maxChunks: 32 },
    });
    expect(queued.type).toBe("post_capture_hardening");
    const queuedRow = harness.selectObject("SELECT payload_json FROM jobs WHERE id = ? LIMIT 1", [
      queued.id,
    ]);
    const queuedPayload = JSON.parse(String(queuedRow?.payload_json ?? "{}")) as {
      sourceId?: string;
      stages?: string[];
      chunkMetaTier2?: { enabled?: boolean; maxChunks?: number };
      trigger?: string;
    };
    expect(queuedPayload).toMatchObject({
      sourceId,
      stages: ["chunk_meta", "embedding"],
      chunkMetaTier2: { enabled: true, maxChunks: 32 },
      trigger: "manual_tier2_ui",
    });

    const job = await harness.request({ kind: "runJob", id: queued.id });
    expect(job.status).toBe("done");

    const finishedJob = harness.selectObject("SELECT result_json FROM jobs WHERE id = ? LIMIT 1", [
      queued.id,
    ]);
    const jobResult = JSON.parse(String(finishedJob?.result_json ?? "{}")) as {
      chunkMeta?: {
        selectedTier?: string;
        tier2Enabled?: boolean;
        tier2UnavailableCount?: number;
        tier2Reason?: string;
      };
    };
    expect(jobResult.chunkMeta?.selectedTier).toBe("tier1");
    expect(jobResult.chunkMeta?.tier2Enabled).toBe(true);
    expect(jobResult.chunkMeta?.tier2UnavailableCount ?? 0).toBeGreaterThan(0);
    expect(jobResult.chunkMeta?.tier2Reason).toBe("chunk_meta_summarizer_unavailable");

    const chunk = harness.selectObject(
      "SELECT meta_head_json FROM source_chunks WHERE source_id = ? ORDER BY ord ASC LIMIT 1",
      [sourceId],
    );
    const metaHead = JSON.parse(String(chunk?.meta_head_json ?? "{}")) as ChunkMetaHeadForTest;
    expect(metaHead.selectedTier).toBe("tier1");
    expect(metaHead.tiers?.tier2?.status).toBe("unavailable");
    expect(metaHead.tiers?.tier2?.reason).toBe("chunk_meta_summarizer_unavailable");

    const audit = await harness.request({
      kind: "listChunkMetaTier2Audit",
      filter: { jobId: queued.id, status: "unavailable", limit: 20 },
    });
    expect(audit.items.length).toBeGreaterThan(0);
    expect(audit.items[0]).toMatchObject({
      sourceId,
      jobId: queued.id,
      tier: "tier2",
      status: "unavailable",
      reason: "chunk_meta_summarizer_unavailable",
    });
    const auditJson = JSON.stringify(audit);
    expect(auditJson).not.toContain(sourceText);
    expect(auditJson).not.toContain("normalizedText");
    expect(auditJson).not.toContain("apiKey");

    const cleared = await harness.request({
      kind: "clearChunkMetaTier2Audit",
      filter: { jobId: queued.id },
    });
    expect(cleared.cleared).toBeGreaterThanOrEqual(audit.items.length);
    const afterClear = await harness.request({
      kind: "listChunkMetaTier2Audit",
      filter: { jobId: queued.id, limit: 20 },
    });
    expect(afterClear.items).toEqual([]);
  });

  it("promotes successful explicit Tier2 chunk summaries before embedding", async () => {
    const calls: ChunkMetaSummaryInput[] = [];
    const summarizer: ChunkMetaSummarizer = {
      async summarize(input) {
        calls.push(input);
        return {
          status: "summarized",
          providerKind: "chat",
          sectionSummary: "Remote section summary for bounded retrieval.",
          chunkSummary: "Remote chunk summary improves the embedding prefix.",
          semanticRelations: [
            {
              kind: "role",
              target: "retrieval_method",
              label: "Methods",
              confidence: 0.82,
              reason: "Bounded chunk describes retrieval method details.",
              source: "remote_llm",
            },
          ],
        };
      },
    };
    const harness = createHarness({ chunkMetaSummarizer: summarizer });
    await activateTestEmbeddingModel(harness);
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/tier2-success",
        sourceTitle: "Tier2 Success",
        normalizedText: "Tier2 success local chunk evidence about bounded retrieval summaries.",
      }),
    });
    const sourceId = capture.memory.id;
    const queued = await harness.request({ kind: "getJobStatus", status: "queued" });
    harness.exec("UPDATE jobs SET payload_json = ? WHERE id = ?", [
      JSON.stringify({
        sourceId,
        stages: ["chunk_meta", "embedding"],
        chunkMetaTier2: { enabled: true, maxChunks: 32 },
      }),
      queued.jobs[0]?.id ?? "",
    ]);

    const job = await harness.request({ kind: "runJob", id: queued.jobs[0]?.id ?? "" });
    expect(job.status).toBe("done");
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]?.chunkTextExcerpt).toContain("Tier2 success local chunk evidence");
    expect(JSON.stringify(calls[0])).not.toContain("normalizedText");

    const finishedJob = harness.selectObject("SELECT result_json FROM jobs WHERE id = ? LIMIT 1", [
      queued.jobs[0]?.id ?? "",
    ]);
    const jobResult = JSON.parse(String(finishedJob?.result_json ?? "{}")) as {
      chunkMeta?: {
        selectedTier?: string;
        tier2SummarizedCount?: number;
        tier2ErrorCount?: number;
      };
    };
    expect(jobResult.chunkMeta?.selectedTier).toBe("tier2");
    expect(jobResult.chunkMeta?.tier2SummarizedCount ?? 0).toBeGreaterThan(0);
    expect(jobResult.chunkMeta?.tier2ErrorCount ?? -1).toBe(0);

    const chunk = harness.selectObject(
      "SELECT id, text, hash, meta_head_json FROM source_chunks WHERE source_id = ? ORDER BY ord ASC LIMIT 1",
      [sourceId],
    );
    const metaHead = JSON.parse(String(chunk?.meta_head_json ?? "{}")) as ChunkMetaHeadForTest;
    expect(metaHead.selectedTier).toBe("tier2");
    expect(metaHead.summarySource).toBe("remote_llm");
    expect(metaHead.tiers?.tier2?.status).toBe("available");
    expect(metaHead.tiers?.tier2?.summarySource).toBe("remote_llm");
    expect(metaHead.tiers?.tier2?.chunkSummary).toBe(
      "Remote chunk summary improves the embedding prefix.",
    );
    expect(metaHead.tiers?.tier2?.semanticRelations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "role",
          target: "retrieval_method",
          source: "remote_llm",
        }),
      ]),
    );
    expect(metaHead.semanticRelations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "role",
          target: "retrieval_method",
          source: "remote_llm",
        }),
      ]),
    );

    const audit = await harness.request({
      kind: "listChunkMetaTier2Audit",
      filter: { jobId: queued.jobs[0]?.id ?? "", status: "summarized", limit: 20 },
    });
    expect(audit.items.length).toBeGreaterThan(0);
    expect(audit.items[0]).toMatchObject({
      sourceId,
      jobId: queued.jobs[0]?.id ?? "",
      tier: "tier2",
      status: "summarized",
      providerKind: "chat",
    });
    expect(audit.items[0]?.sectionSummaryChars).toBe(
      "Remote section summary for bounded retrieval.".length,
    );
    expect(audit.items[0]?.chunkSummaryChars).toBe(
      "Remote chunk summary improves the embedding prefix.".length,
    );
    expect(audit.items[0]?.semanticRelationCount).toBe(1);
    const auditJson = JSON.stringify(audit);
    expect(auditJson).not.toContain("Remote chunk summary improves the embedding prefix.");
    expect(auditJson).not.toContain("Bounded chunk describes retrieval method details.");
    expect(auditJson).not.toContain("Tier2 success local chunk evidence");
    expect(auditJson).not.toContain("apiKey");

    const embedding = harness.selectObject(
      "SELECT text_hash FROM source_embeddings WHERE source_id = ? AND target_kind = 'chunk' ORDER BY target_id ASC LIMIT 1",
      [sourceId],
    );
    expect(embedding?.text_hash).toBe(chunk?.hash);
    expect(embedding?.text_hash).toBe(hashText(String(chunk?.text ?? "")));
  });

  it("keeps Tier1 selected when explicit Tier2 chunk summary returns an error", async () => {
    const summarizer: ChunkMetaSummarizer = {
      async summarize() {
        return {
          status: "error",
          providerKind: "chat",
          reason: "provider_json_failed",
        };
      },
    };
    const harness = createHarness({ chunkMetaSummarizer: summarizer });
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/tier2-error",
        sourceTitle: "Tier2 Error",
        normalizedText: ragText("tier2 error fallback stays tier1", 8),
      }),
    });
    const sourceId = capture.memory.id;
    const queued = await harness.request({ kind: "getJobStatus", status: "queued" });
    harness.exec("UPDATE jobs SET payload_json = ? WHERE id = ?", [
      JSON.stringify({
        sourceId,
        stages: ["chunk_meta", "embedding"],
        chunkMetaTier2: { enabled: true, maxChunks: 32 },
      }),
      queued.jobs[0]?.id ?? "",
    ]);

    const job = await harness.request({ kind: "runJob", id: queued.jobs[0]?.id ?? "" });
    expect(job.status).toBe("done");

    const finishedJob = harness.selectObject("SELECT result_json FROM jobs WHERE id = ? LIMIT 1", [
      queued.jobs[0]?.id ?? "",
    ]);
    const jobResult = JSON.parse(String(finishedJob?.result_json ?? "{}")) as {
      chunkMeta?: {
        selectedTier?: string;
        tier2ErrorCount?: number;
        tier2Reason?: string;
      };
    };
    expect(jobResult.chunkMeta?.selectedTier).toBe("tier1");
    expect(jobResult.chunkMeta?.tier2ErrorCount ?? 0).toBeGreaterThan(0);
    expect(jobResult.chunkMeta?.tier2Reason).toBe("chunk_meta_summary_error");

    const chunk = harness.selectObject(
      "SELECT meta_head_json FROM source_chunks WHERE source_id = ? ORDER BY ord ASC LIMIT 1",
      [sourceId],
    );
    const metaHead = JSON.parse(String(chunk?.meta_head_json ?? "{}")) as ChunkMetaHeadForTest;
    expect(metaHead.selectedTier).toBe("tier1");
    expect(metaHead.tiers?.tier2?.status).toBe("error");
    expect(metaHead.tiers?.tier2?.reason).toBe("provider_json_failed");

    const audit = await harness.request({
      kind: "listChunkMetaTier2Audit",
      filter: { jobId: queued.jobs[0]?.id ?? "", status: "error", limit: 20 },
    });
    expect(audit.items.length).toBeGreaterThan(0);
    expect(audit.items[0]).toMatchObject({
      sourceId,
      jobId: queued.jobs[0]?.id ?? "",
      tier: "tier2",
      status: "error",
      providerKind: "chat",
      reason: "provider_json_failed",
    });
    expect(JSON.stringify(audit)).not.toContain("tier2 error fallback stays tier1");
  });

  it("records skipped Tier2 audit rows when maxChunks bounds the batch", async () => {
    const calls: ChunkMetaSummaryInput[] = [];
    const summarizer: ChunkMetaSummarizer = {
      async summarize(input) {
        calls.push(input);
        return {
          status: "summarized",
          providerKind: "chat",
          sectionSummary: "One bounded section summary.",
          chunkSummary: "One bounded chunk summary.",
        };
      },
    };
    const harness = createHarness({ chunkMetaSummarizer: summarizer });
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/tier2-skipped",
        sourceTitle: "Tier2 Skipped",
        normalizedText: ragText("tier2 skipped audit batch bounds", 260),
      }),
    });
    const sourceId = capture.memory.id;
    const queued = await harness.request({
      kind: "enqueueChunkMetaTier2Job",
      payload: { sourceId, maxChunks: 1 },
    });

    const job = await harness.request({ kind: "runJob", id: queued.id });
    expect(job.status).toBe("done");
    expect(calls).toHaveLength(1);

    const skippedAudit = await harness.request({
      kind: "listChunkMetaTier2Audit",
      filter: { jobId: queued.id, status: "skipped", limit: 20 },
    });
    expect(skippedAudit.items.length).toBeGreaterThan(0);
    expect(skippedAudit.items[0]).toMatchObject({
      sourceId,
      jobId: queued.id,
      tier: "tier2",
      status: "skipped",
      reason: "chunk_meta_tier2_max_chunks_exceeded",
    });
  });

  it("materializes section-aware chunk meta and repairs it before embedding", async () => {
    const harness = createHarness();
    await activateTestEmbeddingModel(harness);
    const expectedSectionPath = "Markdown Adapter Notes > Registry Design";
    const registryBody = ragText("registry design adapter chunk routing metadata", 260);
    const capture = await harness.request({
      kind: "captureMarkdown",
      payload: {
        sourceUrl: "clio://upload/markdown-adapter-notes.md",
        sourceTitle: "Markdown Adapter Notes",
        capturedAt: "2026-07-01T00:00:00.000Z",
        markdownText: [
          "# Markdown Adapter Notes",
          "",
          "## Registry Design",
          registryBody,
          "",
          "## Queue Repair",
          ragText("queue repair metadata rebuild stage", 80),
        ].join("\n"),
        metadata: {
          abstract: "Section-aware chunk metadata should survive post-capture repair.",
        },
      },
    });
    expect(capture.status).toBe("saved");

    const sourceId = capture.memory.id;
    const sectionChunk = harness.selectObject(
      `SELECT id, text, hash, section_path, meta_head_json
       FROM source_chunks
       WHERE source_id = ? AND section_path = ?
       ORDER BY ord ASC
       LIMIT 1`,
      [sourceId, expectedSectionPath],
    );
    expect(sectionChunk?.section_path).toBe(expectedSectionPath);
    const capturedMetaHead = JSON.parse(String(sectionChunk?.meta_head_json ?? "{}")) as {
      summarySource?: string;
      docContext?: string;
      sectionPath?: string | null;
      sectionSummary?: string | null;
      chunkSummary?: string | null;
      roleHint?: string | null;
      relations?: Array<{ kind?: string; target?: string; label?: string | null }>;
    };
    expect(capturedMetaHead.summarySource).toBe("deterministic");
    expect(capturedMetaHead.docContext).toContain("Markdown Adapter Notes");
    expect(capturedMetaHead.sectionPath).toBe(expectedSectionPath);
    expect(capturedMetaHead.sectionSummary).toBe("Section: Registry Design");
    expect(capturedMetaHead.chunkSummary).toContain("registry design adapter");
    expect(capturedMetaHead.roleHint).toBe("body");
    expect(capturedMetaHead.relations?.some((relation) => relation.kind === "parent")).toBe(true);

    harness.exec("UPDATE source_chunks SET section_path = NULL, meta_head_json = ? WHERE id = ?", [
      "{not valid json",
      String(sectionChunk?.id ?? ""),
    ]);
    const queued = await harness.request({ kind: "getJobStatus", status: "queued" });
    const job = await harness.request({ kind: "runJob", id: queued.jobs[0]?.id ?? "" });
    expect(job.status).toBe("done");

    const repairedChunk = harness.selectObject(
      "SELECT id, text, hash, section_path, meta_head_json FROM source_chunks WHERE id = ? LIMIT 1",
      [String(sectionChunk?.id ?? "")],
    );
    expect(repairedChunk?.section_path).toBe(expectedSectionPath);
    const repairedMetaHead = JSON.parse(String(repairedChunk?.meta_head_json ?? "{}")) as {
      tier?: string;
      summarySource?: string;
      selectedTier?: string;
      tiers?: Record<string, { status?: string; reason?: string; summarySource?: string }>;
      docContext?: string;
      sectionPath?: string | null;
      sectionSummary?: string | null;
      chunkSummary?: string | null;
      roleHint?: string | null;
      relations?: Array<{ kind?: string; target?: string; label?: string | null }>;
      semanticRelations?: Array<{ kind?: string; target?: string }>;
    };
    expect(repairedMetaHead.tier).toBe("tier1");
    expect(repairedMetaHead.selectedTier).toBe("tier1");
    expect(repairedMetaHead.summarySource).toBe("local_extractive");
    expect(repairedMetaHead.tiers?.tier1?.status).toBe("available");
    expect(repairedMetaHead.tiers?.tier2?.status).toBe("disabled");
    expect(repairedMetaHead.tiers?.tier2?.reason).toBe("explicit_llm_chunk_meta_not_configured");
    expect(repairedMetaHead.sectionPath).toBe(expectedSectionPath);
    expect(repairedMetaHead.sectionSummary).toContain("Section: Registry Design");
    expect(repairedMetaHead.chunkSummary).toContain("registry design adapter");
    expect(repairedMetaHead.roleHint).toBe("body");
    expect(repairedMetaHead.relations?.some((relation) => relation.kind === "parent")).toBe(true);
    expect(repairedMetaHead.semanticRelations?.some((relation) => relation.kind === "parent")).toBe(
      true,
    );

    const embedding = harness.selectObject(
      "SELECT text_hash FROM source_embeddings WHERE target_id = ? AND target_kind = 'chunk' LIMIT 1",
      [String(sectionChunk?.id ?? "")],
    );
    expect(embedding?.text_hash).toBe(repairedChunk?.hash);
    expect(embedding?.text_hash).toBe(hashText(String(repairedChunk?.text ?? "")));
  });

  it("chunks markdown sections without crossing section boundaries", async () => {
    const harness = createHarness();
    const alphaMarker = "ALPHA_SECTION_ONLY_BOUNDARY_MARKER";
    const betaMarker = "BETA_SECTION_ONLY_BOUNDARY_MARKER";
    const capture = await harness.request({
      kind: "captureMarkdown",
      payload: {
        sourceUrl: "clio://upload/section-boundaries.md",
        sourceTitle: "Section Boundaries",
        capturedAt: "2026-07-05T00:00:00.000Z",
        markdownText: [
          "# Section Boundaries",
          "",
          "## Alpha",
          ragText(`alpha boundary ${alphaMarker}`, 240),
          "",
          "## Beta",
          ragText(`beta boundary ${betaMarker}`, 240),
        ].join("\n"),
        metadata: {
          abstract: "Section-aware chunking should not cross heading boundaries.",
        },
      },
    });
    expect(capture.status).toBe("saved");

    const rows = harness.selectObjects(
      `SELECT text, section_path
       FROM source_chunks
       WHERE source_id = ? AND role = 'child'
       ORDER BY ord ASC`,
      [capture.memory.id],
    );
    const alphaRows = rows.filter(
      (row) => String(row.section_path ?? "") === "Section Boundaries > Alpha",
    );
    const betaRows = rows.filter(
      (row) => String(row.section_path ?? "") === "Section Boundaries > Beta",
    );
    expect(alphaRows.length).toBeGreaterThan(0);
    expect(betaRows.length).toBeGreaterThan(0);
    expect(alphaRows.every((row) => String(row.text ?? "").includes(alphaMarker))).toBe(true);
    expect(alphaRows.every((row) => !String(row.text ?? "").includes(betaMarker))).toBe(true);
    expect(betaRows.every((row) => String(row.text ?? "").includes(betaMarker))).toBe(true);
    expect(betaRows.every((row) => !String(row.text ?? "").includes(alphaMarker))).toBe(true);
  });

  it("stores section parent chunks but keeps prompt and embedding paths child-only", async () => {
    const harness = createHarness();
    await activateTestEmbeddingModel(harness);
    const sectionBody = ragText("parent child boundary retrieval evidence", 950);
    const capture = await harness.request({
      kind: "captureMarkdown",
      payload: {
        sourceUrl: "clio://upload/parent-child-boundary.md",
        sourceTitle: "Parent Child Boundary",
        capturedAt: "2026-07-05T00:00:00.000Z",
        markdownText: [
          "# Parent Child Boundary",
          "",
          "## Retrieval Boundary",
          sectionBody,
          "",
          "## Queue Boundary",
          ragText("queue boundary repair evidence", 160),
        ].join("\n"),
        metadata: {
          abstract: "Parent chunks should remain structural and child chunks feed RAG.",
        },
      },
    });
    expect(capture.status).toBe("saved");
    const sourceId = capture.memory.id;
    const expectedSectionPath = "Parent Child Boundary > Retrieval Boundary";

    const parentRows = harness.selectObjects(
      `SELECT id, ord, text, fts_text, role, section_path, meta_head_json
       FROM source_chunks
       WHERE source_id = ? AND role = 'parent'
       ORDER BY ord ASC`,
      [sourceId],
    );
    const childRows = harness.selectObjects(
      `SELECT id, ord, parent_chunk_id, role, section_path
       FROM source_chunks
       WHERE source_id = ? AND role = 'child'
       ORDER BY ord ASC`,
      [sourceId],
    );
    expect(parentRows.length).toBeGreaterThan(0);
    expect(childRows.length).toBeGreaterThan(0);
    expect(parentRows[0]?.fts_text).toBe("");
    expect(Number(parentRows[0]?.ord ?? 0)).toBeGreaterThanOrEqual(1_000_000);

    const childInSection = childRows.find(
      (row) => String(row.section_path ?? "") === expectedSectionPath,
    );
    expect(childInSection?.parent_chunk_id).toBeTruthy();
    const parentForSection = parentRows.find((row) => row.id === childInSection?.parent_chunk_id);
    expect(parentForSection?.section_path).toBe(expectedSectionPath);
    const parentMetaHead = JSON.parse(String(parentForSection?.meta_head_json ?? "{}")) as {
      sectionPath?: string | null;
      sectionSummary?: string | null;
      roleHint?: string | null;
    };
    expect(parentMetaHead.sectionPath).toBe(expectedSectionPath);
    expect(parentMetaHead.sectionSummary).toBe("Section: Retrieval Boundary");
    expect(parentMetaHead.roleHint).toBe("parent");

    const queued = await harness.request({ kind: "getJobStatus", status: "queued" });
    const job = await harness.request({ kind: "runJob", id: queued.jobs[0]?.id ?? "" });
    expect(job.status).toBe("done");

    expect(
      harness.count(
        "source_embeddings se JOIN source_chunks c ON c.id = se.target_id",
        "se.source_id = ? AND se.target_kind = 'chunk' AND c.role = 'parent'",
        [sourceId],
      ),
    ).toBe(0);
    expect(
      harness.count(
        "source_embeddings se JOIN source_chunks c ON c.id = se.target_id",
        "se.source_id = ? AND se.target_kind = 'chunk' AND c.role = 'child'",
        [sourceId],
      ),
    ).toBeGreaterThan(0);
    expect(harness.count("source_fts", "source_id = ?", [sourceId])).toBe(childRows.length);

    const detail = await harness.request({ kind: "getMemory", id: sourceId });
    expect(detail?.chunks).toHaveLength(childRows.length);
    expect(detail?.chunks.some((chunk) => chunk.id.startsWith(`${sourceId}:parent:`))).toBe(false);

    const windows = await harness.request({
      kind: "getMemoryEvidenceWindows",
      payload: {
        memoryIds: [sourceId],
        query: "parent child boundary evidence",
        limit: 2,
        contextChunksBefore: 1,
        contextChunksAfter: 1,
      },
    });
    const windowChunkIds = windows.items.flatMap((item) => item.chunks.map((chunk) => chunk.id));
    expect(windowChunkIds.length).toBeGreaterThan(0);
    expect(windowChunkIds.some((id) => id.startsWith(`${sourceId}:parent:`))).toBe(false);

    const parentAnchor = await harness.request({
      kind: "getMemoryEvidenceWindows",
      payload: {
        anchors: [{ memoryId: sourceId, chunkId: String(parentRows[0]?.id ?? "") }],
        limit: 1,
      },
    });
    expect(parentAnchor.items).toHaveLength(0);

    const parentAnchorWithOrdFallback = await harness.request({
      kind: "getMemoryEvidenceWindows",
      payload: {
        anchors: [
          {
            memoryId: sourceId,
            chunkId: String(parentRows[0]?.id ?? ""),
            ord: Number(childRows[0]?.ord ?? 0),
          },
        ],
        limit: 1,
      },
    });
    expect(parentAnchorWithOrdFallback.items).toHaveLength(0);
  });

  it("uses an injected local embedding factory for jobs and vector retrieval", async () => {
    const remoteModel: ActiveEmbeddingModel = {
      modelId: "local-transformers:test:semantic-bridge:d3",
      provider: "local-transformers",
      dimension: 3,
    };
    const requestedModels: ActiveEmbeddingModel[] = [];
    const embeddedInputs: string[] = [];
    const harness = createHarness({
      embeddingProviderFactory: (model) => {
        requestedModels.push(model);
        if (
          model.modelId !== remoteModel.modelId ||
          model.provider !== remoteModel.provider ||
          model.dimension !== remoteModel.dimension
        ) {
          return null;
        }
        const provider: EmbeddingProvider = {
          ...remoteModel,
          embedTexts: async (inputs) => {
            embeddedInputs.push(...inputs);
            return inputs.map(remoteEmbeddingVector);
          },
        };
        return provider;
      },
    });

    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/remote-embedding",
        sourceTitle: "Remote Semantic Bridge",
        normalizedText: ragText("remote semantic bridge evidence", 80),
        metadata: {
          title: "Remote Semantic Bridge",
          abstract: "Remote semantic bridge evidence should use provider vectors.",
          source_type: "paper",
        },
      }),
    });
    const sourceId = capture.memory.id;
    const now = "2026-07-03T00:00:00.000Z";
    harness.exec("UPDATE embedding_models SET status = 'disabled'");
    harness.exec(
      `INSERT INTO embedding_models (
        id,
        provider,
        label,
        dimension,
        metric,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'cosine', 'active', ?, ?)`,
      [remoteModel.modelId, remoteModel.provider, "Remote test embeddings", 3, now, now],
    );

    const queued = await harness.request({ kind: "getJobStatus", status: "queued" });
    const job = await harness.request({ kind: "runJob", id: queued.jobs[0]?.id ?? "" });
    expect(job.status).toBe("done");
    expect(
      harness.count("source_embeddings", "source_id = ? AND model_id = ?", [
        sourceId,
        remoteModel.modelId,
      ]),
    ).toBeGreaterThan(1);
    expect(harness.count("embedding_models", "provider = 'local-deterministic'")).toBe(0);
    const childChunkTexts = harness
      .selectObjects("SELECT text FROM source_chunks WHERE source_id = ? AND role = 'child'", [
        sourceId,
      ])
      .map((row) => String(row.text ?? ""));
    expect(childChunkTexts.length).toBeGreaterThan(0);
    for (const chunkText of childChunkTexts) expect(embeddedInputs).toContain(chunkText);
    expect(
      embeddedInputs.filter((input) => input.startsWith("Title: Remote Semantic Bridge")),
    ).toHaveLength(0);

    const retrieved = await harness.request({
      kind: "retrieveSources",
      payload: { query: "remote semantic bridge", limit: 5, includeChunks: 1 },
    });
    expect(retrieved.items[0]?.id).toBe(sourceId);
    expect(trackStatus(retrieved, "vector_meta")).toBe("used");
    expect(trackStatus(retrieved, "vector_chunks")).toBe("used");
    expect(requestedModels.some((model) => model.modelId === remoteModel.modelId)).toBe(true);
    expect(embeddedInputs.some((input) => input.includes("Remote Semantic Bridge"))).toBe(true);
    expect(embeddedInputs).toContain("remote semantic bridge");
  });

  it("reindexes remote embeddings after authorization without switching early", async () => {
    const remoteModel = embeddingModelDescriptor("openai:remote-reindex:semantic:d3");
    const embeddedInputs: string[] = [];
    const harness = createHarness({
      embeddingProviderFactory: (model) =>
        model.modelId === remoteModel.id
          ? {
              modelId: model.modelId,
              provider: model.provider,
              dimension: model.dimension,
              embedTexts: async (inputs) => {
                embeddedInputs.push(...inputs);
                return inputs.map(remoteEmbeddingVector);
              },
            }
          : null,
    });
    const sourceText = ragText("remote semantic reindex evidence", 700);
    const active = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/remote-reindex-active",
        sourceTitle: "Remote Reindex Active",
        normalizedText: sourceText,
        metadata: {
          title: "Remote Reindex Active",
          abstract: "Remote semantic reindex evidence should rebuild safely.",
          source_type: "paper",
        },
      }),
    });
    const deleted = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/remote-reindex-deleted",
        sourceTitle: "Deleted Remote Reindex",
        normalizedText: ragText("deleted remote semantic reindex evidence", 50),
      }),
    });
    for (const job of (await harness.request({ kind: "getJobStatus", status: "queued" })).jobs) {
      await harness.request({ kind: "runJob", id: job.id });
    }
    await harness.request({ kind: "deleteMemory", id: deleted.memory.id });

    expect(await harness.request({ kind: "getActiveEmbeddingModel" })).toBeNull();

    const reindex = await harness.request({
      kind: "reindex",
      scope: "embeddings",
      model: remoteModel,
    });
    expect(reindex.status).toBe("done");
    expect(harness.count("jobs", "id = ? AND type = 'reindex_embeddings'", [reindex.jobId])).toBe(
      1,
    );
    const activeModel = await harness.request({ kind: "getActiveEmbeddingModel" });
    expect(activeModel).toMatchObject({
      id: remoteModel.id,
      provider: remoteModel.provider,
      label: remoteModel.label,
      dimension: remoteModel.dimension,
      metric: "cosine",
      status: "active",
    });
    expect(activeModel).not.toHaveProperty("apiKey");
    expect(
      harness.count("embedding_models", "id = ? AND status = 'active'", [remoteModel.id]),
    ).toBe(1);
    expect(harness.count("embedding_models", "provider = 'local-deterministic'")).toBe(0);
    expect(
      harness.count("source_embeddings", "source_id = ? AND model_id = ?", [
        active.memory.id,
        remoteModel.id,
      ]),
    ).toBeGreaterThan(1);
    expect(
      harness.count("source_embeddings", "source_id = ? AND model_id = ?", [
        deleted.memory.id,
        remoteModel.id,
      ]),
    ).toBe(0);
    expect(harness.count("source_embeddings", "source_id = ?", [active.memory.id])).toBeGreaterThan(
      0,
    );
    expect(embeddedInputs.every((input) => input.length < sourceText.length)).toBe(true);
    expect(embeddedInputs.some((input) => input.includes("Deleted Remote Reindex"))).toBe(false);

    const retrieved = await harness.request({
      kind: "retrieveSources",
      payload: { query: "remote semantic reindex", limit: 5, includeChunks: 1 },
    });
    expect(retrieved.items[0]?.id).toBe(active.memory.id);
    expect(trackStatus(retrieved, "vector_meta")).toBe("used");
    expect(trackStatus(retrieved, "vector_chunks")).toBe("used");
  });

  it("accepts a local-transformers model through the shared reindex path", async () => {
    const localModel = embeddingModelDescriptor(
      "local-transformers:xenova-multilingual-e5-small:test:int8:d3",
      "local-transformers",
    );
    const purposes: Array<"query" | "document"> = [];
    const harness = createHarness({
      embeddingProviderFactory: (model) =>
        model.modelId === localModel.id && model.provider === localModel.provider
          ? {
              modelId: model.modelId,
              provider: model.provider,
              dimension: model.dimension,
              embedTexts: async (inputs, purpose = "document") => {
                purposes.push(purpose);
                return inputs.map(remoteEmbeddingVector);
              },
            }
          : null,
    });
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/local-transformers-reindex",
        sourceTitle: "Local Transformers Reindex",
        normalizedText: ragText("local browser semantic embedding evidence", 80),
      }),
    });

    const reindex = await harness.request({
      kind: "reindex",
      scope: "embeddings",
      model: localModel,
    });

    expect(reindex.status).toBe("done");
    expect(await harness.request({ kind: "getActiveEmbeddingModel" })).toMatchObject({
      id: localModel.id,
      provider: "local-transformers",
      dimension: 3,
      status: "active",
    });
    expect(
      harness.count("source_embeddings", "source_id = ? AND model_id = ?", [
        capture.memory.id,
        localModel.id,
      ]),
    ).toBeGreaterThan(1);
    expect(purposes).toContain("document");

    await harness.request({
      kind: "retrieveSources",
      payload: { query: "local browser semantic", limit: 5, includeChunks: 1 },
    });
    expect(purposes).toContain("query");
  });

  it("reports per-source progress and cancels an async embedding rebuild without switching active vectors", async () => {
    const localModel = embeddingModelDescriptor(
      "local-transformers:xenova-multilingual-e5-small:cancel:int8:d3",
      "local-transformers",
    );
    const harness = createHarness({
      embeddingProviderFactory: (model) =>
        model.modelId === localModel.id
          ? {
              modelId: model.modelId,
              provider: model.provider,
              dimension: model.dimension,
              embedTexts: async (inputs) => {
                await new Promise((resolve) => setTimeout(resolve, 20));
                return inputs.map(remoteEmbeddingVector);
              },
            }
          : null,
    });
    const sourceIds: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const capture = await harness.request({
        kind: "capturePage",
        payload: pagePayload({
          sourceUrl: `https://example.test/local-reindex-cancel-${index}`,
          sourceTitle: `Local Reindex Cancel ${index}`,
          normalizedText: ragText(`local reindex cancellation source ${index}`, 30),
        }),
      });
      sourceIds.push(capture.memory.id);
    }
    for (const job of (await harness.request({ kind: "getJobStatus", status: "queued" })).jobs) {
      await harness.request({ kind: "runJob", id: job.id });
    }
    const initialVectorCount = harness.count("source_embeddings");

    const reindex = await harness.request({ kind: "enqueueEmbeddingReindex", model: localModel });
    expect(reindex.status).toBe("queued");
    const running = await waitForJob(harness, reindex.jobId, (job) => job.progressCurrent >= 1);
    expect(running.maxAttempts).toBe(1);
    expect(running.progressTotal).toBe(3);
    expect(running.progressCurrent).toBeGreaterThanOrEqual(1);

    const cancelRequested = await harness.request({ kind: "cancelJob", id: reindex.jobId });
    expect(cancelRequested.cancelRequested).toBe(true);
    const cancelled = await waitForJob(harness, reindex.jobId, (job) => job.status === "failed");
    expect(cancelled.lastError).toBe(
      "EMBEDDING_REINDEX_CANCELLED: Embedding rebuild cancelled by user.",
    );
    expect(cancelled.progressCurrent).toBeLessThan(cancelled.progressTotal);
    expect(await harness.request({ kind: "getActiveEmbeddingModel" })).toBeNull();
    expect(harness.count("embedding_models", "id LIKE '%::staging::%'")).toBe(0);
    expect(harness.count("source_embeddings", "model_id = ?", [localModel.id])).toBe(0);
    expect(harness.count("source_embeddings")).toBe(initialVectorCount);
  });

  it("finishes an async local reindex failure instead of leaving an unclaimed retry queued", async () => {
    const localModel = embeddingModelDescriptor(
      "local-transformers:xenova-multilingual-e5-small:failure:int8:d3",
      "local-transformers",
    );
    const harness = createHarness({
      embeddingProviderFactory: (model) =>
        model.modelId === localModel.id
          ? {
              modelId: model.modelId,
              provider: model.provider,
              dimension: model.dimension,
              embedTexts: async () => {
                throw new Error("local embedding runtime failed");
              },
            }
          : null,
    });
    await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/local-reindex-failure",
        sourceTitle: "Local Reindex Failure",
        normalizedText: ragText("local async rebuild failure", 20),
      }),
    });

    const reindex = await harness.request({ kind: "enqueueEmbeddingReindex", model: localModel });
    const failed = await waitForJob(harness, reindex.jobId, (job) => job.status === "failed");

    expect(failed.maxAttempts).toBe(1);
    expect(failed.lastError).toBe("local embedding runtime failed");
    expect(harness.count("embedding_models", "id LIKE '%::staging::%'")).toBe(0);
    expect(await harness.request({ kind: "getActiveEmbeddingModel" })).toBeNull();
  });

  it("keeps FTS retrieval available when the active local embedding runtime fails", async () => {
    const localModel = embeddingModelDescriptor(
      "local-transformers:xenova-multilingual-e5-small:degrade:int8:d3",
      "local-transformers",
    );
    let failQueries = false;
    const harness = createHarness({
      embeddingProviderFactory: (model) =>
        model.modelId === localModel.id
          ? {
              modelId: model.modelId,
              provider: model.provider,
              dimension: model.dimension,
              embedTexts: async (inputs, purpose = "document") => {
                if (purpose === "query" && failQueries) throw new Error("local runtime offline");
                return inputs.map(remoteEmbeddingVector);
              },
            }
          : null,
    });
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/local-runtime-degradation",
        sourceTitle: "Local Runtime Degradation",
        normalizedText: ragText("browser fallback keyword survives semantic outage", 40),
      }),
    });
    const reindex = await harness.request({
      kind: "reindex",
      scope: "embeddings",
      model: localModel,
    });
    expect(reindex.status).toBe("done");

    failQueries = true;
    const retrieved = await harness.request({
      kind: "retrieveSources",
      payload: { query: "fallback keyword", limit: 5, includeChunks: 1 },
    });

    expect(retrieved.items[0]?.id).toBe(capture.memory.id);
    expect(trackStatus(retrieved, "fts_chunks")).toBe("used");
    expect(trackStatus(retrieved, "vector_meta")).toBe("unavailable");
    expect(trackStatus(retrieved, "vector_chunks")).toBe("unavailable");
    expect(trackReason(retrieved, "vector_meta")).toBe("embedding_provider_error");
    expect(trackReason(retrieved, "vector_chunks")).toBe("embedding_provider_error");
  });

  it("keeps the previous active embedding model when remote reindex fails", async () => {
    const remoteModel = embeddingModelDescriptor("openai:failing-reindex:semantic:d3");
    const harness = createHarness({
      embeddingProviderFactory: (model) =>
        model.modelId === remoteModel.id
          ? {
              modelId: model.modelId,
              provider: model.provider,
              dimension: model.dimension,
              embedTexts: async () => {
                throw new Error("remote embedding failed");
              },
            }
          : null,
    });
    await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/failing-reindex",
        sourceTitle: "Failing Reindex",
        normalizedText: ragText("remote semantic failure evidence", 20),
      }),
    });

    const reindex = await harness.request({
      kind: "reindex",
      scope: "embeddings",
      model: remoteModel,
    });
    expect(reindex.status).toBe("queued");
    expect(harness.count("embedding_models", "provider = 'local-deterministic'")).toBe(0);
    expect(
      harness.count("embedding_models", "id = ? AND status = 'disabled'", [remoteModel.id]),
    ).toBe(0);
    expect(harness.count("embedding_models", "id LIKE '%::staging::%'")).toBe(0);
    expect(await harness.request({ kind: "getActiveEmbeddingModel" })).toBeNull();
  });

  it("keeps an active model and its vectors when rebuilding that same model fails", async () => {
    const remoteModel = embeddingModelDescriptor("openai:active-reindex:semantic:d3");
    let fail = false;
    const harness = createHarness({
      embeddingProviderFactory: (model) =>
        model.modelId === remoteModel.id
          ? {
              modelId: model.modelId,
              provider: model.provider,
              dimension: model.dimension,
              embedTexts: async (inputs) => {
                if (fail) throw new Error("active embedding rebuild failed");
                return inputs.map(remoteEmbeddingVector);
              },
            }
          : null,
    });
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/active-reindex-rollback",
        sourceTitle: "Active Reindex Rollback",
        normalizedText: ragText("active embedding rollback evidence", 80),
      }),
    });

    expect(
      (
        await harness.request({
          kind: "reindex",
          scope: "embeddings",
          model: remoteModel,
        })
      ).status,
    ).toBe("done");
    const vectorCount = harness.count("source_embeddings", "source_id = ? AND model_id = ?", [
      capture.memory.id,
      remoteModel.id,
    ]);
    expect(vectorCount).toBeGreaterThan(1);

    fail = true;
    expect(
      (
        await harness.request({
          kind: "reindex",
          scope: "embeddings",
          model: remoteModel,
        })
      ).status,
    ).toBe("queued");
    expect(await harness.request({ kind: "getActiveEmbeddingModel" })).toMatchObject({
      id: remoteModel.id,
      status: "active",
    });
    expect(
      harness.count("source_embeddings", "source_id = ? AND model_id = ?", [
        capture.memory.id,
        remoteModel.id,
      ]),
    ).toBe(vectorCount);
    expect(harness.count("embedding_models", "id LIKE '%::staging::%'")).toBe(0);
  });

  it("builds keyword index and expands knowledge base page search locally", async () => {
    const harness = createHarness();
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceTitle: "Long Context Degradation Study",
        normalizedText: ragText("attention failure evidence window retrieval", 24),
        metadata: {
          title: "Long Context Degradation Study",
          abstract: "Saved library terminology should help clipped queries find source evidence.",
          source_type: "paper",
          authors: ["Ada Lovelace"],
        },
      }),
    });
    const sourceId = capture.memory.id;

    expect(harness.count("keyword_index", "term = ?", ["degradation"])).toBe(1);
    expect(
      harness.count("keyword_index_sources", "term = ? AND source_id = ?", [
        "degradation",
        sourceId,
      ]),
    ).toBe(1);

    const original = await harness.request({
      kind: "retrieveSources",
      payload: { query: "degrad", limit: 5, includeChunks: 1 },
    });
    expect(original.items.map((item) => item.id)).not.toContain(sourceId);

    const expanded = await harness.request({
      kind: "searchKnowledgeBase",
      payload: { query: "degrad", limit: 5, includeChunks: 1 },
    });
    expect(expanded.items.map((item) => item.id)).toContain(sourceId);
    expect(expanded.expansion.status).toBe("used");
    expect(expanded.expansion.terms).toContain("degradation");
    expect(expanded.expansion.termSources).toContainEqual({
      term: "degradation",
      sources: ["keyword_index"],
      sourceCount: 1,
    });
    expect(expanded.expansion.expandedQuery).toContain("degradation");

    const filtered = await harness.request({
      kind: "searchKnowledgeBase",
      payload: {
        query: "degrad",
        limit: 5,
        filter: { sourceTypes: ["pdf"] },
      },
    });
    expect(filtered.items.map((item) => item.id)).not.toContain(sourceId);
    expect(filtered.expansion.status).toBe("skipped");

    harness.exec("DELETE FROM keyword_index_sources");
    harness.exec("DELETE FROM keyword_index");
    expect(harness.count("keyword_index")).toBe(0);
    const reindex = await harness.request({ kind: "reindex", scope: "fts" });
    expect(reindex.status).toBe("done");
    expect(harness.count("keyword_index", "term = ?", ["degradation"])).toBe(1);
  });

  it("keeps direct knowledge-base matches precise and bounds final semantic results", async () => {
    const model = embeddingModelDescriptor(
      "local-transformers:knowledge-base-search-precision:d3",
      "local-transformers",
    );
    const harness = createHarness({
      embeddingProviderFactory: (candidate) =>
        candidate.modelId === model.id
          ? {
              modelId: candidate.modelId,
              provider: candidate.provider,
              dimension: candidate.dimension,
              embedTexts: async (inputs) => inputs.map(knowledgeBasePrecisionVector),
            }
          : null,
    });
    const relevant = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceTitle: "MUARF precision fixture",
        normalizedText: ragText(
          "PurityChecker validates method purity before automated transformation",
          24,
        ),
      }),
    });
    const sourceIds = [relevant.memory.id];
    for (let index = 0; index < 9; index += 1) {
      const noise = await harness.request({
        kind: "capturePage",
        payload: pagePayload({
          sourceUrl: `https://example.test/vector-noise-${index}`,
          sourceTitle: `Noise source ${index}`,
          normalizedText: ragText(`Noise source ${index} unrelated browser fixture`, 24),
        }),
      });
      sourceIds.push(noise.memory.id);
    }

    const reindex = await harness.request({ kind: "reindex", scope: "embeddings", model });
    expect(reindex.status).toBe("done");

    const exact = await harness.request({
      kind: "searchKnowledgeBase",
      payload: { query: "PurityChecker", mode: "exact", limit: 40, includeChunks: 2 },
    });
    expect(exact.items.map((item) => item.id)).toEqual([relevant.memory.id]);
    expect(exact.expansion).toMatchObject({
      status: "skipped",
      reason: "exact_mode",
      expandedItemCount: 0,
    });
    expect(trackReason(exact, "meta_sources")).toBe("no_matches");
    expect(trackStatus(exact, "fts_chunks")).toBe("used");
    expect(trackReason(exact, "vector_meta")).toBe("exact_mode");
    expect(trackReason(exact, "vector_chunks")).toBe("exact_mode");

    const semantic = await harness.request({
      kind: "searchKnowledgeBase",
      payload: {
        query: "classify hidden mutation risks",
        mode: "semantic",
        limit: 5,
        includeChunks: 2,
      },
    });
    expect(semantic.items[0]?.id).toBe(relevant.memory.id);
    expect(semantic.items).toHaveLength(5);
    expect(semantic.bands).toHaveLength(3);
    expect(semantic.trace.stages?.map((stage) => stage.id)).toEqual([
      "recall",
      "source_grouping",
      "coarse_rank",
      "relevance_banding",
      "strength_selection",
      "evidence_selection",
    ]);
    expect(semantic.trace.coarseRank?.strategy).toBe("document_lanes_strength_aware_rrf");
    expect(semantic.trace.coarseRank?.candidateCount).toBe(sourceIds.length);
    expect(semantic.expansion).toMatchObject({
      status: "skipped",
      reason: "semantic_mode",
      expandedItemCount: 0,
    });
    expect(trackReason(semantic, "meta_sources")).toBe("semantic_mode");
    expect(trackReason(semantic, "fts_chunks")).toBe("semantic_mode");
    expect(semantic.items[0]?.tracks).toEqual(
      expect.arrayContaining(["vector_meta", "vector_chunks"]),
    );
  });

  it("keeps a wide cross-track vector pool before applying the final result limit", async () => {
    const model = embeddingModelDescriptor(
      "local-transformers:cross-track-source-pruning:d3",
      "local-transformers",
    );
    const harness = createHarness({
      embeddingProviderFactory: (candidate) =>
        candidate.modelId === model.id
          ? {
              modelId: candidate.modelId,
              provider: candidate.provider,
              dimension: candidate.dimension,
              embedTexts: async (inputs) => inputs.map(crossTrackSemanticVector),
            }
          : null,
    });

    for (let index = 0; index < 12; index += 1) {
      await harness.request({
        kind: "capturePage",
        payload: pagePayload({
          sourceUrl: `https://example.test/cross-track-${index}`,
          sourceTitle: `Cross track source ${index}`,
          normalizedText: ragText(`chunk-signal-${index} bounded evidence`, 24),
          metadata: {
            title: `Cross track source ${index}`,
            abstract: `meta-signal-${index} source summary`,
            source_type: "paper",
          },
        }),
      });
    }

    const reindex = await harness.request({ kind: "reindex", scope: "embeddings", model });
    expect(reindex.status).toBe("done");

    const semantic = await harness.request({
      kind: "searchKnowledgeBase",
      payload: {
        query: "cross-track query",
        mode: "semantic",
        limit: 5,
        includeChunks: 2,
      },
    });

    expect(semantic.items).toHaveLength(5);
    expect(semantic.trace.coarseRank?.candidateCount).toBe(12);
    expect(trackStatus(semantic, "vector_meta")).toBe("used");
    expect(trackStatus(semantic, "vector_chunks")).toBe("used");
  });

  it("caps positive vector chunk evidence per source before calculating breadth", async () => {
    const model = embeddingModelDescriptor(
      "local-transformers:bounded-vector-evidence:d3",
      "local-transformers",
    );
    const harness = createHarness({
      embeddingProviderFactory: (candidate) =>
        candidate.modelId === model.id
          ? {
              modelId: candidate.modelId,
              provider: candidate.provider,
              dimension: candidate.dimension,
              embedTexts: async (inputs) => inputs.map(() => [1, 0, 0]),
            }
          : null,
    });
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/bounded-vector-evidence",
        sourceTitle: "Bounded vector evidence source",
        normalizedText: ragText("uniform semantic evidence", 4_000),
      }),
    });

    const reindex = await harness.request({ kind: "reindex", scope: "embeddings", model });
    expect(reindex.status).toBe("done");

    const semantic = await harness.request({
      kind: "searchKnowledgeBase",
      payload: {
        query: "uniform semantic query",
        mode: "semantic",
        limit: 5,
        includeChunks: 8,
      },
    });
    const item = semantic.items.find((candidate) => candidate.id === capture.memory.id);
    const totalChunkCount = item?.coarseSignals?.totalChunkCount ?? 0;
    const uniqueHitChunkCount = item?.coarseSignals?.uniqueHitChunkCount ?? 0;

    expect(totalChunkCount).toBeGreaterThan(12);
    expect(uniqueHitChunkCount).toBeGreaterThan(1);
    expect(uniqueHitChunkCount).toBeLessThanOrEqual(12);
    expect(uniqueHitChunkCount).toBeLessThan(totalChunkCount);
  });

  it("counts each source once per track but uses normalized chunk breadth for document rank", async () => {
    const harness = createHarness();
    const dense = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/dense-rrf-source",
        sourceTitle: "Dense evidence source",
        normalizedText: ragText("rare fusion token evidence", 1_200),
      }),
    });
    const sparse = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/sparse-rrf-source",
        sourceTitle: "Sparse evidence source",
        normalizedText: `rare fusion token evidence. ${ragText("unrelated filler", 8)}`,
      }),
    });

    const result = await harness.request({
      kind: "searchKnowledgeBase",
      payload: {
        query: "rare fusion token",
        mode: "exact",
        limit: 10,
        includeChunks: 8,
      },
    });
    const denseItem = result.items.find((item) => item.id === dense.memory.id);
    const sparseItem = result.items.find((item) => item.id === sparse.memory.id);

    expect(denseItem?.hitChunks.length).toBeGreaterThan(1);
    expect(sparseItem).toBeDefined();
    expect(denseItem?.tracks).toEqual(["fts_chunks"]);
    expect(sparseItem?.tracks).toEqual(["fts_chunks"]);
    expect(denseItem?.coarseSignals?.uniqueHitChunkCount ?? 0).toBeGreaterThan(1);
    expect(denseItem?.coarseSignals?.breadth ?? 0).toBeGreaterThan(
      sparseItem?.coarseSignals?.breadth ?? 1,
    );
    expect(denseItem?.score ?? 0).toBeGreaterThan(sparseItem?.score ?? 1);
    expect(result.trace.fineRank?.status).toBe("not_configured");
  });

  it("uses source graph terms only as knowledge-base page expansion diagnostics", async () => {
    const harness = createHarness();
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceTitle: "Graph Term Expansion Study",
        normalizedText: ragText("retrieval adapter evidence window quality", 24),
        metadata: {
          title: "Graph Term Expansion Study",
          abstract: "Graph labels can help clipped queries reach bounded source evidence.",
          source_type: "paper",
          authors: ["Ada Lovelace"],
          categories: ["graph retrieval"],
          sectionOutline: [{ level: 1, text: "Retrieval Adapter Architecture" }],
        },
      }),
    });
    const sourceId = capture.memory.id;

    const keywordOnly = await harness.request({
      kind: "searchKnowledgeBase",
      payload: { query: "retriev", limit: 5, includeChunks: 1 },
    });
    expect(
      keywordOnly.expansion.termSources?.some((term) => term.sources.includes("source_graph")) ??
        false,
    ).toBe(false);

    const graph = await harness.request({
      kind: "buildSourceGraph",
      payload: { sourceId, mode: "deterministic" },
    });
    expect(graph.edgeCount).toBeGreaterThan(0);
    expect(harness.count("graph_edges")).toBeGreaterThan(0);

    const graphExpanded = await harness.request({
      kind: "searchKnowledgeBase",
      payload: { query: "retriev", limit: 5, includeChunks: 1 },
    });
    expect(graphExpanded.items.map((item) => item.id)).toContain(sourceId);
    expect(graphExpanded.expansion.status).toBe("used");
    expect(
      graphExpanded.expansion.termSources?.some((term) => term.sources.includes("source_graph")) ??
        false,
    ).toBe(true);

    await harness.request({ kind: "deleteMemory", id: sourceId });
    expect(harness.count("graph_edges")).toBe(0);
    const afterDelete = await harness.request({
      kind: "searchKnowledgeBase",
      payload: { query: "retriev", limit: 5, includeChunks: 1 },
    });
    expect(afterDelete.items.map((item) => item.id)).not.toContain(sourceId);
    expect(
      afterDelete.expansion.termSources?.some((term) => term.sources.includes("source_graph")) ??
        false,
    ).toBe(false);
  });

  it("groups recalled sources by research graph affinity without changing result ranking", async () => {
    const harness = createHarness({
      graphExtractor: {
        extract: async (input) => {
          const vision = input.sourceTitle?.includes("Gamma") === true;
          const entityId = vision ? "method:vision" : "method:retrieval";
          const label = vision ? "Vision models" : "Retrieval systems";
          return {
            status: "extracted",
            providerKind: "chat",
            entities: [{ id: entityId, kind: "method", label, confidence: 0.99 }],
            relations: [
              {
                sourceEntityId: "source",
                targetEntityId: entityId,
                dimension: "technical",
                edgeType: "uses",
                confidence: 0.99,
                evidenceChunkIds: [input.chunks[0]?.chunkId ?? ""],
              },
            ],
          };
        },
      },
    });
    const sourceIds: string[] = [];
    for (const title of ["Graph Alpha", "Graph Beta", "Graph Gamma"]) {
      const capture = await harness.request({
        kind: "capturePage",
        payload: pagePayload({
          sourceUrl: `https://example.test/${title.toLowerCase().replace(/\s+/g, "-")}`,
          sourceTitle: title,
          normalizedText: `${title}\n${ragText("shared graph clustering evidence token", 20)}`,
          metadata: { source_type: "paper" },
        }),
      });
      sourceIds.push(capture.memory.id);
      const graph = await harness.request({
        kind: "buildSourceGraph",
        payload: { sourceId: capture.memory.id, mode: "llm" },
      });
      expect(graph.appliedMode).toBe("llm");
    }

    const flat = await harness.request({
      kind: "searchKnowledgeBase",
      payload: { query: "shared graph clustering evidence token", limit: 10, includeChunks: 1 },
    });
    const grouped = await harness.request({
      kind: "searchKnowledgeBase",
      payload: {
        query: "shared graph clustering evidence token",
        limit: 10,
        includeChunks: 1,
        clustering: { clusterBy: "graph", granularity: "fine" },
      },
    });

    expect(grouped.items.map((item) => item.id)).toEqual(flat.items.map((item) => item.id));
    expect(grouped.clusters?.flatMap((cluster) => cluster.sourceIds).sort()).toEqual(
      sourceIds.sort(),
    );
    expect(grouped.clusters).toHaveLength(2);
    expect(grouped.clusters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Retrieval systems",
          sourceCount: 2,
          trace: expect.objectContaining({
            backend: "graph",
            method: "graph_entity_affinity",
          }),
        }),
        expect.objectContaining({
          label: "Vision models",
          sourceCount: 1,
          trace: expect.objectContaining({
            backend: "graph",
            method: "graph_entity_affinity",
          }),
        }),
      ]),
    );
  });

  it("clusters knowledge base page search results without graph or full document dependencies", async () => {
    const harness = createHarness();
    const fixture = [
      { title: "Cluster Alpha", sourceType: "paper", year: 2026, venue: "Local RAG Symposium" },
      { title: "Cluster Beta", sourceType: "paper", year: 2026, venue: "Local RAG Symposium" },
      { title: "Cluster Gamma", sourceType: "pdf", year: 2025, venue: "Browser Systems" },
      { title: "Cluster Delta", sourceType: "markdown", year: 2024, venue: "Browser Systems" },
      { title: "Cluster Epsilon", sourceType: "webpage", year: 2023, venue: "Memory Notes" },
      { title: "Cluster Zeta", sourceType: "paper", year: 2022, venue: "Graph Notes" },
      { title: "Cluster Eta", sourceType: "pdf", year: 2021, venue: "Citation Notes" },
      { title: "Cluster Theta", sourceType: "webpage", year: 2020, venue: "Parser Notes" },
    ];

    for (const item of fixture) {
      await harness.request({
        kind: "capturePage",
        payload: pagePayload({
          sourceTitle: item.title,
          sourceUrl: `https://example.test/${item.title.toLowerCase().replace(/\s+/g, "-")}`,
          normalizedText: ragText(`clusterable knowledge evidence ${item.title}`, 20),
          metadata: {
            title: item.title,
            abstract: "Clusterable source-level grouping fixture.",
            source_type: item.sourceType,
            year: item.year,
            venue: item.venue,
          },
        }),
      });
    }

    const flat = await harness.request({
      kind: "searchKnowledgeBase",
      payload: { query: "clusterable knowledge evidence", limit: 20, includeChunks: 1 },
    });
    expect(flat.items.length).toBeGreaterThanOrEqual(fixture.length);
    expect(flat.clusters).toBeUndefined();

    const semantic = await harness.request({
      kind: "searchKnowledgeBase",
      payload: {
        query: "clusterable knowledge evidence",
        limit: 20,
        includeChunks: 1,
        clustering: { clusterBy: "semantic", granularity: "fine" },
      },
    });
    expect(semantic.clusters?.map((cluster) => cluster.label)).toContain(
      "2026 / Local RAG Symposium",
    );
    expect(
      semantic.clusters?.find((cluster) => cluster.label === "2026 / Local RAG Symposium")
        ?.sourceCount,
    ).toBe(2);
    expect(semantic.clusters?.[0]?.trace).toMatchObject({
      backend: "metadata",
      method: "metadata_fallback",
      fallbackReason: "embedding_model_unavailable",
    });

    const sourceType = await harness.request({
      kind: "searchKnowledgeBase",
      payload: {
        query: "clusterable knowledge evidence",
        limit: 20,
        includeChunks: 1,
        clustering: { clusterBy: "source_type", granularity: "fine" },
      },
    });
    expect(sourceType.clusters?.map((cluster) => cluster.label)).toEqual(
      expect.arrayContaining(["Paper", "PDF", "Markdown", "Webpage"]),
    );

    const topic = await harness.request({
      kind: "searchKnowledgeBase",
      payload: {
        query: "clusterable knowledge evidence",
        limit: 20,
        includeChunks: 1,
        clustering: { clusterBy: "topic", granularity: "fine" },
      },
    });
    const topicClusters = topic.clusters ?? [];
    expect(topicClusters.map((cluster) => cluster.label)).toEqual(
      expect.arrayContaining(["Cluster"]),
    );
    expect(topicClusters.reduce((sum, cluster) => sum + cluster.sourceCount, 0)).toBe(
      topic.items.length,
    );
    expect(topicClusters[0]?.trace).toMatchObject({
      backend: "metadata",
      method: "metadata_topic_label",
      vectorCount: topic.items.length,
    });
    expect(topicClusters[0]?.summary).toContain("bounded metadata");

    const coarseVenue = await harness.request({
      kind: "searchKnowledgeBase",
      payload: {
        query: "clusterable knowledge evidence",
        limit: 20,
        includeChunks: 1,
        clustering: { clusterBy: "venue", granularity: "coarse" },
      },
    });
    const coarseClusters = coarseVenue.clusters ?? [];
    expect(coarseClusters.length).toBeLessThanOrEqual(4);
    expect(coarseClusters.map((cluster) => cluster.label)).toContain("Other");
    expect(coarseClusters.reduce((sum, cluster) => sum + cluster.sourceCount, 0)).toBe(
      coarseVenue.items.length,
    );
    expect(harness.count("graph_nodes")).toBe(0);
    expect(harness.count("graph_edges")).toBe(0);
  });

  it("clusters knowledge base semantic groups from existing source meta embeddings", async () => {
    const harness = createHarness();
    await activateTestEmbeddingModel(harness);
    const fixture = [
      {
        title: "Vector Alpha",
        sourceType: "paper",
        year: 2026,
        venue: "Vector Retrieval",
        vectorIndex: 0,
      },
      {
        title: "Vector Beta",
        sourceType: "paper",
        year: 2026,
        venue: "Vector Retrieval",
        vectorIndex: 0,
      },
      {
        title: "Citation Gamma",
        sourceType: "pdf",
        year: 2025,
        venue: "Citation Research",
        vectorIndex: 1,
      },
      {
        title: "Citation Delta",
        sourceType: "pdf",
        year: 2025,
        venue: "Citation Research",
        vectorIndex: 1,
      },
    ];
    const sourceIds: string[] = [];

    for (const item of fixture) {
      const capture = await harness.request({
        kind: "capturePage",
        payload: pagePayload({
          sourceTitle: item.title,
          sourceUrl: `https://example.test/${item.title.toLowerCase().replace(/\s+/g, "-")}`,
          normalizedText: ragText(`semantic vector cluster evidence ${item.title}`, 20),
          metadata: {
            title: item.title,
            abstract: "Semantic vector cluster fixture.",
            source_type: item.sourceType,
            year: item.year,
            venue: item.venue,
          },
        }),
      });
      sourceIds.push(capture.memory.id);
    }

    const now = "2026-07-09T00:00:00.000Z";
    for (let index = 0; index < sourceIds.length; index += 1) {
      const sourceId = sourceIds[index];
      const item = fixture[index];
      if (sourceId === undefined || item === undefined) continue;
      harness.exec(
        `INSERT INTO source_embeddings (
          model_id,
          target_kind,
          target_id,
          source_id,
          vector_json,
          text_hash,
          created_at,
          updated_at
        ) VALUES (?, 'meta', ?, ?, ?, ?, ?, ?)`,
        [
          testEmbeddingModel.id,
          sourceId,
          sourceId,
          JSON.stringify(unitVector64(item.vectorIndex)),
          hashText(`semantic-vector-${item.title}`),
          now,
          now,
        ],
      );
    }

    const semantic = await harness.request({
      kind: "searchKnowledgeBase",
      payload: {
        query: "semantic vector cluster evidence",
        limit: 10,
        includeChunks: 1,
        clustering: {
          clusterBy: "semantic",
          granularity: "medium",
          semanticBackend: "embedding",
        },
      },
    });
    const clusters = semantic.clusters ?? [];
    expect(clusters).toHaveLength(2);
    expect(clusters.every((cluster) => cluster.trace?.backend === "embedding")).toBe(true);
    expect(clusters.every((cluster) => cluster.trace?.method === "kmeans_meta_embedding")).toBe(
      true,
    );
    expect(clusters.every((cluster) => cluster.trace?.vectorCount === fixture.length)).toBe(true);
    expect(clusters.map((cluster) => cluster.sourceCount).sort()).toEqual([2, 2]);
    expect(clusters.map((cluster) => cluster.label)).toEqual(
      expect.arrayContaining(["2026 / Vector Retrieval", "2025 / Citation Research"]),
    );
    expect(clusters.every((cluster) => cluster.summary?.includes("examples:"))).toBe(true);

    const fallback = await harness.request({
      kind: "searchKnowledgeBase",
      payload: {
        query: "semantic vector cluster evidence",
        limit: 10,
        includeChunks: 1,
        clustering: {
          clusterBy: "semantic",
          granularity: "fine",
          semanticBackend: "metadata",
        },
      },
    });
    expect(fallback.clusters?.[0]?.trace).toMatchObject({
      backend: "metadata",
      method: "metadata_fallback",
      fallbackReason: "metadata_backend_selected",
    });
    expect(harness.count("graph_nodes")).toBe(0);
    expect(harness.count("graph_edges")).toBe(0);
  });

  it("repairs malformed chunk meta heads before post-capture embedding", async () => {
    const harness = createHarness();
    await activateTestEmbeddingModel(harness);
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/malformed-meta-head",
        sourceTitle: "Malformed Meta Head",
        normalizedText: ragText("malformed meta head fallback", 20),
        metadata: {
          source_type: "webpage",
        },
      }),
    });
    const sourceId = capture.memory.id;
    const chunk = harness.selectObject(
      "SELECT id, text, hash, meta_head_json FROM source_chunks WHERE source_id = ? ORDER BY ord ASC LIMIT 1",
      [sourceId],
    );
    const metaHead = JSON.parse(String(chunk?.meta_head_json ?? "{}")) as {
      docContext?: string;
      source?: { abstract?: string | null };
      chunkSummary?: string | null;
      roleHint?: string | null;
    };
    expect(metaHead.docContext).toContain("Malformed Meta Head");
    expect(metaHead.source?.abstract).toBeNull();
    expect(metaHead.chunkSummary).toContain("malformed meta head fallback");
    expect(metaHead.roleHint).toBe("body");

    harness.exec("UPDATE source_chunks SET meta_head_json = ? WHERE id = ?", [
      "{not valid json",
      String(chunk?.id ?? ""),
    ]);
    const queued = await harness.request({ kind: "getJobStatus", status: "queued" });
    const job = await harness.request({ kind: "runJob", id: queued.jobs[0]?.id ?? "" });
    expect(job.status).toBe("done");

    const finishedJob = harness.selectObject("SELECT result_json FROM jobs WHERE id = ? LIMIT 1", [
      queued.jobs[0]?.id ?? "",
    ]);
    const jobResult = JSON.parse(String(finishedJob?.result_json ?? "{}")) as {
      chunkMeta?: {
        selectedTier?: string;
        tier?: string;
        chunkCount?: number;
        tier2Reason?: string;
      };
    };
    expect(jobResult.chunkMeta?.tier).toBe("tier1");
    expect(jobResult.chunkMeta?.selectedTier).toBe("tier1");
    expect(jobResult.chunkMeta?.tier2Reason).toBe("explicit_llm_chunk_meta_not_configured");
    expect(jobResult.chunkMeta?.chunkCount ?? 0).toBeGreaterThan(0);

    const repairedChunk = harness.selectObject(
      "SELECT text, hash, meta_head_json FROM source_chunks WHERE id = ? LIMIT 1",
      [String(chunk?.id ?? "")],
    );
    const repairedMetaHead = JSON.parse(String(repairedChunk?.meta_head_json ?? "{}")) as {
      tier?: string;
      summarySource?: string;
      selectedTier?: string;
      tiers?: Record<string, { status?: string; reason?: string; summarySource?: string }>;
      docContext?: string;
      sectionPath?: string | null;
      sectionSummary?: string | null;
      chunkSummary?: string | null;
      roleHint?: string | null;
      semanticRelations?: Array<{ kind?: string; target?: string }>;
    };
    expect(repairedMetaHead.tier).toBe("tier1");
    expect(repairedMetaHead.selectedTier).toBe("tier1");
    expect(repairedMetaHead.summarySource).toBe("local_extractive");
    expect(repairedMetaHead.tiers?.tier1?.status).toBe("available");
    expect(repairedMetaHead.tiers?.tier2?.status).toBe("disabled");
    expect(repairedMetaHead.tiers?.tier2?.reason).toBe("explicit_llm_chunk_meta_not_configured");
    expect(repairedMetaHead.docContext).toContain("Malformed Meta Head");
    expect(repairedMetaHead.chunkSummary).toContain("malformed meta head fallback");
    expect(repairedMetaHead.roleHint).toBe("body");
    expect(repairedMetaHead.semanticRelations?.some((relation) => relation.kind === "role")).toBe(
      true,
    );

    const embedding = harness.selectObject(
      "SELECT text_hash FROM source_embeddings WHERE source_id = ? AND target_kind = 'chunk' ORDER BY target_id ASC LIMIT 1",
      [sourceId],
    );
    expect(embedding?.text_hash).toBe(repairedChunk?.hash);
    expect(embedding?.text_hash).toBe(hashText(String(repairedChunk?.text ?? "")));
  });

  it("keeps duplicate, page version, and selection capture behavior distinct", async () => {
    const harness = createHarness();
    const first = await harness.request({
      kind: "capturePage",
      payload: pagePayload({ normalizedText: ragText("version one body", 8) }),
    });
    const duplicate = await harness.request({
      kind: "capturePage",
      payload: pagePayload({ normalizedText: ragText("version one body", 8) }),
    });
    const second = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        normalizedText: ragText("version two body with changed terms", 8),
        capturedAt: "2026-07-01T00:02:00.000Z",
      }),
    });
    const selection = await harness.request({
      kind: "captureSelection",
      payload: selectionPayload({ normalizedText: ragText("version one body", 2) }),
    });

    expect(first.status).toBe("saved");
    expect(duplicate.status).toBe("duplicate");
    expect(duplicate.memory.id).toBe(first.memory.id);
    expect(second.status).toBe("saved");
    expect(second.memory.version.versionNo).toBe(2);
    expect(second.memory.version.supersedesMemoryId).toBe(first.memory.id);
    expect(selection.status).toBe("saved");
    expect(selection.memory.sourceKind).toBe("selection");
    expect(selection.memory.id).not.toBe(first.memory.id);
    expect(harness.count("sources")).toBe(3);

    const previous = await harness.request({ kind: "getMemory", id: first.memory.id });
    const current = await harness.request({ kind: "getMemory", id: second.memory.id });

    expect(previous?.version.isCurrent).toBe(false);
    expect(previous?.version.supersededByMemoryId).toBe(second.memory.id);
    expect(current?.version.isCurrent).toBe(true);

    const staleOnly = await harness.request({
      kind: "retrieveSources",
      payload: {
        query: "version one body",
        limit: 5,
        filter: { lifecycleStatuses: ["stale"] },
      },
    });
    expect(staleOnly.items.map((item) => item.id)).toContain(first.memory.id);
    expect(staleOnly.items.map((item) => item.id)).not.toContain(second.memory.id);
  });

  it("cleans source-derived rows on delete and reset", async () => {
    const harness = createHarness();
    await activateTestEmbeddingModel(harness);
    const capture = await harness.request({
      kind: "captureSelection",
      payload: selectionPayload({ normalizedText: ragText("cleanup derived rows", 10) }),
    });
    const sourceId = capture.memory.id;
    const compressionSession = await harness.request({
      kind: "createChatSession",
      payload: {
        id: "session-cleanup-compression",
        title: "Cleanup compression logs",
        createdAt: "2026-07-07T00:00:00.000Z",
      },
    });
    const queued = await harness.request({ kind: "getJobStatus", status: "queued" });
    await harness.request({ kind: "runJob", id: queued.jobs[0]?.id ?? "" });

    expect(harness.count("source_chunks", "source_id = ?", [sourceId])).toBeGreaterThan(0);
    expect(harness.count("source_fts", "source_id = ?", [sourceId])).toBeGreaterThan(0);
    expect(harness.count("source_metadata_fts", "source_id = ?", [sourceId])).toBe(1);
    expect(harness.count("keyword_index_sources", "source_id = ?", [sourceId])).toBeGreaterThan(0);
    expect(harness.count("source_embeddings", "source_id = ?", [sourceId])).toBeGreaterThan(0);
    expect(harness.count("source_metadata", "source_id = ?", [sourceId])).toBe(1);
    expect(harness.count("anchors", "memory_id = ?", [sourceId])).toBe(1);
    await harness.request({
      kind: "pinWorkingSetSource",
      payload: { sourceId, loadDepth: "chunks" },
    });
    await harness.request({
      kind: "appendSourceContextCompressionLogs",
      payload: {
        sessionId: compressionSession.id,
        runId: "run-cleanup-delete",
        entries: [
          {
            reason: "chunk_window_omitted",
            message: "Cleanup test compression log.",
            sourceId,
            omittedWindowCount: 1,
          },
        ],
      },
    });
    await harness.request({
      kind: "appendSourceContextMapArtifacts",
      payload: {
        sessionId: compressionSession.id,
        runId: "run-cleanup-delete",
        entries: [
          {
            stage: "map",
            status: "completed",
            groupId: "cleanup-group",
            sourceIds: [sourceId],
            windowRefs: [{ sourceId, chunkId: "chunk-cleanup", ord: 0 }],
            evidenceIds: [`memory:${sourceId}:chunk:chunk-cleanup`],
            inputSummary: "cleanup map input",
            outputSummary: "cleanup map output",
          },
        ],
      },
    });
    const chunkForAudit = harness.selectObject(
      "SELECT id FROM source_chunks WHERE source_id = ? ORDER BY ord ASC LIMIT 1",
      [sourceId],
    );
    harness.exec(
      `INSERT INTO chunk_meta_tier2_audit (
        id,
        source_id,
        chunk_id,
        job_id,
        tier,
        status,
        provider_kind,
        reason,
        section_summary_chars,
        chunk_summary_chars,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'tier2', 'summarized', 'chat', NULL, 24, 26, ?, ?)`,
      [
        "audit-cleanup-delete",
        sourceId,
        String(chunkForAudit?.id ?? ""),
        queued.jobs[0]?.id ?? null,
        "2026-07-07T00:00:01.000Z",
        "2026-07-07T00:00:01.000Z",
      ],
    );
    expect(harness.count("source_working_set", "source_id = ?", [sourceId])).toBe(1);
    expect(harness.count("source_context_compression_logs", "source_id = ?", [sourceId])).toBe(1);
    expect(harness.count("source_context_map_artifacts")).toBe(1);
    expect(harness.count("chunk_meta_tier2_audit", "source_id = ?", [sourceId])).toBe(1);

    const deleted = await harness.request({ kind: "deleteMemory", id: sourceId });
    expect(deleted.deleted).toBe(true);
    expect(harness.count("source_chunks", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_fts", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_metadata_fts", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("keyword_index_sources", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_embeddings", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_working_set", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_context_compression_logs", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_context_map_artifacts")).toBe(0);
    expect(harness.count("chunk_meta_tier2_audit", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_metadata", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("anchors", "memory_id = ?", [sourceId])).toBe(0);

    const retrievalAfterDelete = await harness.request({
      kind: "retrieveSources",
      payload: { query: "cleanup", limit: 5 },
    });
    expect(retrievalAfterDelete.items.map((item) => item.id)).not.toContain(sourceId);

    const resetSource = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/reset",
        normalizedText: ragText("reset library rows", 8),
      }),
    });
    await harness.request({
      kind: "pinWorkingSetSource",
      payload: { sourceId: resetSource.memory.id, loadDepth: "meta" },
    });
    await harness.request({
      kind: "appendSourceContextCompressionLogs",
      payload: {
        sessionId: compressionSession.id,
        runId: "run-cleanup-reset",
        entries: [
          {
            reason: "full_depth_bounded",
            message: "Reset test compression log.",
            sourceId: resetSource.memory.id,
          },
        ],
      },
    });
    await harness.request({
      kind: "appendSourceContextMapArtifacts",
      payload: {
        sessionId: compressionSession.id,
        runId: "run-cleanup-reset",
        entries: [
          {
            stage: "reduce",
            status: "started",
            sourceIds: [resetSource.memory.id],
            windowRefs: [{ sourceId: resetSource.memory.id, chunkId: "chunk-reset" }],
            mapArtifactIds: ["sctx_map_reset"],
            inputSummary: "reset reduce input",
          },
        ],
      },
    });
    const resetChunkForAudit = harness.selectObject(
      "SELECT id FROM source_chunks WHERE source_id = ? ORDER BY ord ASC LIMIT 1",
      [resetSource.memory.id],
    );
    harness.exec(
      `INSERT INTO chunk_meta_tier2_audit (
        id,
        source_id,
        chunk_id,
        job_id,
        tier,
        status,
        provider_kind,
        reason,
        section_summary_chars,
        chunk_summary_chars,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, NULL, 'tier2', 'skipped', NULL, 'chunk_meta_tier2_max_chunks_exceeded', NULL, NULL, ?, ?)`,
      [
        "audit-cleanup-reset",
        resetSource.memory.id,
        String(resetChunkForAudit?.id ?? ""),
        "2026-07-07T00:00:02.000Z",
        "2026-07-07T00:00:02.000Z",
      ],
    );
    expect(harness.count("sources", "lifecycle_status <> 'deleted'")).toBe(1);
    expect(harness.count("source_working_set")).toBe(1);
    expect(harness.count("source_context_compression_logs")).toBe(1);
    expect(harness.count("source_context_map_artifacts")).toBe(1);
    expect(harness.count("chunk_meta_tier2_audit")).toBe(1);

    const reset = await harness.request({ kind: "repair", action: "reset_library" });
    expect(reset.action).toBe("reset_library");
    expect(harness.count("sources")).toBe(0);
    expect(harness.count("source_chunks")).toBe(0);
    expect(harness.count("source_fts")).toBe(0);
    expect(harness.count("source_metadata_fts")).toBe(0);
    expect(harness.count("keyword_index")).toBe(0);
    expect(harness.count("keyword_index_sources")).toBe(0);
    expect(harness.count("source_embeddings")).toBe(0);
    expect(harness.count("source_working_set")).toBe(0);
    expect(harness.count("source_context_compression_logs")).toBe(0);
    expect(harness.count("source_context_map_artifacts")).toBe(0);
    expect(harness.count("chunk_meta_tier2_audit")).toBe(0);
    expect(harness.count("source_metadata")).toBe(0);
    expect(harness.count("anchors")).toBe(0);
    expect(harness.count("jobs")).toBe(0);
  });

  it("manages context working set state without leaking full source text", async () => {
    const harness = createHarness();
    const fullTextOnlyNeedle = "FULL_TEXT_ONLY_NEEDLE_SHOULD_NOT_LEAK";
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/working-set",
        sourceTitle: "Working Set Source",
        normalizedText: `${ragText("context manager bounded source", 30)} ${fullTextOnlyNeedle}`,
        metadata: {
          title: "Working Set Source",
          abstract: "Working set metadata stays bounded.",
          source_type: "research-note",
        },
      }),
    });
    const sourceId = capture.memory.id;

    const emptyStatus = await harness.request({ kind: "getWorkingSetStatus" });
    expect(emptyStatus.entries).toEqual([]);
    expect(emptyStatus.budget).toBe(32_000);

    const pinned = await harness.request({
      kind: "pinWorkingSetSource",
      payload: { sourceId, loadDepth: "meta" },
    });
    expect(pinned.entries).toHaveLength(1);
    expect(pinned.entries[0]?.source.id).toBe(sourceId);
    expect(pinned.entries[0]?.source.sourceType).toBe("research-note");
    expect(pinned.entries[0]?.source.abstract).toBe("Working set metadata stays bounded.");
    expect(pinned.entries[0]?.source.chunkCount).toBeGreaterThan(0);
    expect(pinned.entries[0]?.loadDepth).toBe("meta");
    expect(pinned.entries[0]?.pinStatus).toBe("pinned");
    expect(JSON.stringify(pinned)).not.toContain(fullTextOnlyNeedle);

    const deepened = await harness.request({
      kind: "setWorkingSetSourceDepth",
      payload: { sourceId, loadDepth: "chunks" },
    });
    expect(deepened.entries[0]?.loadDepth).toBe("chunks");
    expect(deepened.entries[0]?.pinStatus).toBe("pinned");
    expect(deepened.entries[0]?.tokenEstimate).toBeGreaterThan(
      pinned.entries[0]?.tokenEstimate ?? 0,
    );

    const evicted = await harness.request({
      kind: "evictWorkingSetSource",
      payload: { sourceId, reason: "over budget" },
    });
    expect(evicted.entries[0]?.loadDepth).toBe("meta");
    expect(evicted.entries[0]?.pinStatus).toBe("evicted");
    expect(evicted.entries[0]?.evictReason).toBe("over budget");

    const reloaded = await harness.request({
      kind: "reloadWorkingSetSource",
      payload: { sourceId, loadDepth: "outline" },
    });
    expect(reloaded.entries[0]?.loadDepth).toBe("outline");
    expect(reloaded.entries[0]?.pinStatus).toBe("auto");
    expect(reloaded.entries[0]?.reloadCount).toBe(1);

    const listed = await harness.request({ kind: "listWorkingSetEntries" });
    expect(listed.entries.map((entry) => entry.source.id)).toEqual([sourceId]);

    const deleted = await harness.request({ kind: "deleteMemory", id: sourceId });
    expect(deleted.deleted).toBe(true);
    expect(harness.count("source_working_set", "source_id = ?", [sourceId])).toBe(0);
    expect((await harness.request({ kind: "getWorkingSetStatus" })).entries).toEqual([]);
  });

  it("rejects working set operations for missing sources", async () => {
    const harness = createHarness();

    await expect(
      harness.request({
        kind: "pinWorkingSetSource",
        payload: { sourceId: "missing-source", loadDepth: "chunks" },
      }),
    ).rejects.toMatchObject({
      code: "WORKING_SET_SOURCE_NOT_FOUND",
    });
  });

  it("builds bounded source context packs for explicit sources and anchors", async () => {
    const harness = createHarness();
    const hiddenTailNeedle = "SOURCE_CONTEXT_PACK_HIDDEN_TAIL_NEEDLE";
    const sourceText = [
      "# Overview",
      "Context pack source overview keeps parent sections available.",
      "## Evidence Windows",
      `${ragText("alpha context pack anchor evidence", 700)} ${hiddenTailNeedle}`,
    ].join("\n");
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/context-pack",
        sourceTitle: "Context Pack Source",
        normalizedText: sourceText,
        metadata: {
          title: "Context Pack Source",
          abstract: "Context packing should select bounded chunk windows.",
          source_type: "paper",
          sectionOutline: [
            { level: 1, text: "Overview" },
            { level: 2, text: "Evidence Windows" },
          ],
        },
      }),
    });
    const sourceId = capture.memory.id;
    const firstChunk = harness.selectObject(
      "SELECT id FROM source_chunks WHERE source_id = ? ORDER BY ord ASC LIMIT 1",
      [sourceId],
    );

    const pack = await harness.request({
      kind: "buildSourceContextPack",
      payload: {
        query: "alpha context pack",
        sourceIds: [sourceId],
        anchors: [{ memoryId: sourceId, chunkId: String(firstChunk?.id ?? "") }],
        useWorkingSet: false,
        maxTotalTokens: 2_000,
        maxGroupTokens: 1_200,
        maxWindowsPerSource: 1,
        contextChunksBefore: 0,
        contextChunksAfter: 0,
      },
    });

    expect(pack.trace.strategy).toBe("source_context_pack_v1");
    expect(pack.trace.requestedSourceCount).toBe(1);
    expect(pack.trace.packedSourceCount).toBe(1);
    expect(pack.sources[0]?.id).toBe(sourceId);
    expect(pack.sources[0]?.sourceType).toBe("paper");
    expect(pack.sources[0]?.sectionOutline.map((item) => item.text)).toEqual([
      "Overview",
      "Evidence Windows",
    ]);
    expect(pack.sources[0]?.windowCount).toBe(1);
    expect(pack.groups).toHaveLength(1);
    expect(pack.groups[0]?.windows).toHaveLength(1);
    expect(pack.groups[0]?.windows[0]?.priority).toBe("anchor");
    expect(pack.groups[0]?.windows[0]?.sourceId).toBe(sourceId);
    expect(JSON.stringify(pack)).not.toContain(hiddenTailNeedle);

    const parentPack = await harness.request({
      kind: "buildSourceContextPack",
      payload: {
        query: "alpha context pack",
        sourceIds: [sourceId],
        anchors: [{ memoryId: sourceId, chunkId: String(firstChunk?.id ?? "") }],
        useWorkingSet: false,
        maxTotalTokens: 3_000,
        maxGroupTokens: 2_500,
        maxWindowsPerSource: 2,
        contextChunksBefore: 0,
        contextChunksAfter: 0,
      },
    });
    const parentWindow = parentPack.groups
      .flatMap((group) => group.windows)
      .find((window) => window.priority === "parent");
    expect(parentWindow).toBeDefined();
    expect(parentWindow?.sourceId).toBe(sourceId);
    expect(parentWindow?.text).toContain("Section summary:");
    expect(parentWindow?.text).toContain("Parent summary:");
    expect(parentWindow?.text.length ?? 0).toBeLessThanOrEqual(900);
    expect(JSON.stringify(parentPack)).not.toContain(hiddenTailNeedle);
    expect(parentPack.compressionLog.map((entry) => entry.reason)).toContain(
      "parent_context_selected",
    );

    const tightPack = await harness.request({
      kind: "buildSourceContextPack",
      payload: {
        sourceIds: [sourceId],
        useWorkingSet: false,
        maxTotalTokens: 80,
        maxGroupTokens: 80,
        maxWindowsPerSource: 3,
      },
    });
    const tightWindows = tightPack.groups.flatMap((group) => group.windows);
    expect(tightWindows.length).toBeLessThanOrEqual(1);
    expect(tightWindows.every((window) => window.priority === "parent")).toBe(true);
    expect(JSON.stringify(tightPack)).not.toContain(hiddenTailNeedle);
    expect(tightPack.compressionLog.map((entry) => entry.reason)).toEqual(
      expect.arrayContaining(["chunk_window_omitted", "parent_context_selected"]),
    );

    await harness.request({ kind: "deleteMemory", id: sourceId });
    const afterDelete = await harness.request({
      kind: "buildSourceContextPack",
      payload: { sourceIds: [sourceId], useWorkingSet: false },
    });
    expect(afterDelete.sources).toEqual([]);
    expect(afterDelete.groups).toEqual([]);
    expect(afterDelete.compressionLog.map((entry) => entry.reason)).toContain("source_not_found");
  });

  it("builds source context packs from working-set depths without full document loading", async () => {
    const harness = createHarness();
    const metaCapture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/context-pack-meta",
        sourceTitle: "Meta Depth Source",
        normalizedText: ragText("meta depth should stay metadata only", 120),
        metadata: {
          title: "Meta Depth Source",
          abstract: "Metadata-only source context.",
          source_type: "research-note",
        },
      }),
    });
    const fullCapture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/context-pack-full",
        sourceTitle: "Full Depth Source",
        normalizedText: ragText("full depth still uses bounded windows", 900),
        metadata: {
          title: "Full Depth Source",
          abstract: "Full depth must not load the whole source.",
          source_type: "paper",
        },
      }),
    });

    await harness.request({
      kind: "pinWorkingSetSource",
      payload: { sourceId: metaCapture.memory.id, loadDepth: "meta" },
    });
    await harness.request({
      kind: "pinWorkingSetSource",
      payload: { sourceId: fullCapture.memory.id, loadDepth: "full" },
    });

    const pack = await harness.request({
      kind: "buildSourceContextPack",
      payload: {
        useWorkingSet: true,
        maxWindowsPerSource: 1,
        contextChunksBefore: 0,
        contextChunksAfter: 0,
        maxTotalTokens: 3_000,
        maxGroupTokens: 1_500,
      },
    });

    const metaSource = pack.sources.find((source) => source.id === metaCapture.memory.id);
    const fullSource = pack.sources.find((source) => source.id === fullCapture.memory.id);
    expect(metaSource?.requestedLoadDepth).toBe("meta");
    expect(metaSource?.selectedLoadDepth).toBe("meta");
    expect(metaSource?.windowCount).toBe(0);
    expect(metaSource?.pinStatus).toBe("pinned");
    expect(fullSource?.requestedLoadDepth).toBe("full");
    expect(fullSource?.selectedLoadDepth).toBe("chunks");
    expect(fullSource?.windowCount).toBeLessThanOrEqual(1);
    expect(pack.groups.flatMap((group) => group.windows).length).toBeLessThanOrEqual(1);
    expect(pack.compressionLog.map((entry) => entry.reason)).toContain("full_depth_bounded");

    const overridePack = await harness.request({
      kind: "buildSourceContextPack",
      payload: {
        useWorkingSet: true,
        sourceDepthOverrides: [
          { sourceId: metaCapture.memory.id, loadDepth: "full" },
          { sourceId: fullCapture.memory.id, loadDepth: "meta" },
        ],
        maxWindowsPerSource: 1,
        contextChunksBefore: 0,
        contextChunksAfter: 0,
        maxTotalTokens: 3_000,
        maxGroupTokens: 1_500,
      },
    });

    const overriddenFullSource = overridePack.sources.find(
      (source) => source.id === metaCapture.memory.id,
    );
    const overriddenMetaSource = overridePack.sources.find(
      (source) => source.id === fullCapture.memory.id,
    );
    expect(overriddenFullSource?.requestedLoadDepth).toBe("full");
    expect(overriddenFullSource?.selectedLoadDepth).toBe("chunks");
    expect(overriddenFullSource?.windowCount).toBeLessThanOrEqual(1);
    expect(overriddenMetaSource?.requestedLoadDepth).toBe("meta");
    expect(overriddenMetaSource?.selectedLoadDepth).toBe("meta");
    expect(overriddenMetaSource?.windowCount).toBe(0);
    expect(overridePack.compressionLog).toContainEqual(
      expect.objectContaining({
        reason: "full_depth_bounded",
        sourceId: metaCapture.memory.id,
        requestedLoadDepth: "full",
      }),
    );
  });

  it("persists source context compression logs by session and run", async () => {
    const harness = createHarness();
    const session = await harness.request({
      kind: "createChatSession",
      payload: {
        id: "session-source-context-compression",
        title: "Source context compression",
        initialScope: "general",
        createdAt: "2026-07-07T00:00:00.000Z",
      },
    });
    const sourceText = [
      "# Compression Source",
      "Parent context should summarize bounded source windows.",
      "## Evidence",
      ragText("compression budget parent full depth evidence", 900),
    ].join("\n");
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/source-context-compression",
        sourceTitle: "Source Context Compression",
        normalizedText: sourceText,
        metadata: {
          title: "Source Context Compression",
          abstract: "Compression logs should be inspectable.",
          source_type: "paper",
        },
      }),
    });
    const sourceId = capture.memory.id;
    const firstChunk = harness.selectObject(
      "SELECT id FROM source_chunks WHERE source_id = ? ORDER BY ord ASC LIMIT 1",
      [sourceId],
    );
    const parentPack = await harness.request({
      kind: "buildSourceContextPack",
      payload: {
        sourceIds: [sourceId],
        anchors: [{ memoryId: sourceId, chunkId: String(firstChunk?.id ?? "") }],
        useWorkingSet: false,
        maxTotalTokens: 3_000,
        maxGroupTokens: 2_500,
        maxWindowsPerSource: 2,
      },
    });
    const tightPack = await harness.request({
      kind: "buildSourceContextPack",
      payload: {
        sourceIds: [sourceId],
        useWorkingSet: false,
        maxTotalTokens: 80,
        maxGroupTokens: 80,
        maxWindowsPerSource: 3,
      },
    });
    await harness.request({
      kind: "pinWorkingSetSource",
      payload: { sourceId, loadDepth: "full" },
    });
    const fullPack = await harness.request({
      kind: "buildSourceContextPack",
      payload: {
        useWorkingSet: true,
        maxWindowsPerSource: 1,
        maxTotalTokens: 3_000,
        maxGroupTokens: 1_500,
      },
    });

    const appended = await harness.request({
      kind: "appendSourceContextCompressionLogs",
      payload: {
        sessionId: session.id,
        runId: "run-source-context-compression",
        entries: [
          ...parentPack.compressionLog,
          ...tightPack.compressionLog,
          ...fullPack.compressionLog,
        ],
        createdAt: "2026-07-07T00:00:01.000Z",
      },
    });
    expect(appended.items.length).toBeGreaterThan(0);

    const listed = await harness.request({
      kind: "listSourceContextCompressionLogs",
      filter: { sessionId: session.id, runId: "run-source-context-compression", limit: 20 },
    });
    const reasons = listed.items.map((entry) => entry.reason);
    expect(reasons).toEqual(
      expect.arrayContaining([
        "parent_context_selected",
        "chunk_window_omitted",
        "full_depth_bounded",
      ]),
    );
    expect(
      listed.items.find((entry) => entry.reason === "full_depth_bounded")?.lostInfoTypes,
    ).toEqual(expect.arrayContaining(["full_document", "chunk_windows"]));
    expect(
      listed.items.find((entry) => entry.reason === "parent_context_selected")?.lostInfoTypes,
    ).toEqual(["chunk_detail"]);

    await harness.request({ kind: "deleteMemory", id: sourceId });
    expect(harness.count("source_context_compression_logs", "source_id = ?", [sourceId])).toBe(0);
    const afterDelete = await harness.request({
      kind: "buildSourceContextPack",
      payload: { sourceIds: [sourceId], useWorkingSet: false },
    });
    await harness.request({
      kind: "appendSourceContextCompressionLogs",
      payload: {
        sessionId: session.id,
        runId: "run-source-context-missing",
        entries: afterDelete.compressionLog,
      },
    });
    const missingSource = await harness.request({
      kind: "listSourceContextCompressionLogs",
      filter: { sessionId: session.id, runId: "run-source-context-missing" },
    });
    expect(missingSource.items.map((entry) => entry.reason)).toContain("source_not_found");

    const cleared = await harness.request({
      kind: "clearSourceContextCompressionLogs",
      filter: { sessionId: session.id },
    });
    expect(cleared.cleared).toBeGreaterThan(0);
    expect(harness.count("source_context_compression_logs", "session_id = ?", [session.id])).toBe(
      0,
    );
  });

  it("persists source context map artifacts as bounded diagnostics", async () => {
    const harness = createHarness();
    const fullTextNeedle = "FULL_SOURCE_TEXT_MUST_NOT_BE_STORED_IN_MAP_ARTIFACTS";
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/map-artifacts",
        normalizedText: ragText(`map artifacts ${fullTextNeedle}`, 8),
      }),
    });
    const sourceId = capture.memory.id;
    const session = await harness.request({
      kind: "createChatSession",
      payload: {
        id: "session-map-artifacts",
        title: "Map artifacts",
        createdAt: "2026-07-07T00:00:00.000Z",
      },
    });

    const appended = await harness.request({
      kind: "appendSourceContextMapArtifacts",
      payload: {
        sessionId: session.id,
        runId: "run-map-artifacts",
        createdAt: "2026-07-07T00:00:01.000Z",
        entries: [
          {
            stage: "map",
            status: "completed",
            groupId: "group-1",
            groupIndex: 0,
            sourceIds: [sourceId],
            windowRefs: [{ sourceId, chunkId: "chunk-1", ord: 0 }],
            evidenceIds: [`memory:${sourceId}:chunk:chunk-1`],
            tokenEstimate: 320,
            inputSummary: "group=group-1; windows=1; tokens=320",
            outputSummary: "bounded map finding",
          },
          {
            stage: "reduce",
            status: "failed",
            sourceIds: [sourceId],
            mapArtifactIds: ["sctx_map_group_1"],
            inputSummary: "map artifacts=1; groups=1; tokens=320",
            errorCode: "PROVIDER_ERROR",
            errorMessage: "reduce failed",
          },
        ],
      },
    });

    expect(appended.items).toHaveLength(2);
    expect(appended.items[0]).toMatchObject({
      sessionId: session.id,
      runId: "run-map-artifacts",
      stage: "map",
      status: "completed",
      groupId: "group-1",
      sourceIds: [sourceId],
      windowRefs: [{ sourceId, chunkId: "chunk-1", ord: 0 }],
      evidenceIds: [`memory:${sourceId}:chunk:chunk-1`],
      tokenEstimate: 320,
      outputSummary: "bounded map finding",
    });

    const bySource = await harness.request({
      kind: "listSourceContextMapArtifacts",
      filter: { sessionId: session.id, sourceId, limit: 10 },
    });
    expect(bySource.items.map((item) => item.stage)).toEqual(
      expect.arrayContaining(["map", "reduce"]),
    );

    const mapOnly = await harness.request({
      kind: "listSourceContextMapArtifacts",
      filter: { sessionId: session.id, runId: "run-map-artifacts", stage: "map", limit: 10 },
    });
    expect(mapOnly.items).toHaveLength(1);
    expect(mapOnly.items[0]?.status).toBe("completed");

    const rawArtifact = harness.selectObject(
      "SELECT input_summary, output_summary, source_ids_json, window_refs_json FROM source_context_map_artifacts WHERE stage = ? LIMIT 1",
      ["map"],
    );
    expect(JSON.stringify(rawArtifact)).not.toContain(fullTextNeedle);

    const cleared = await harness.request({
      kind: "clearSourceContextMapArtifacts",
      filter: { sessionId: session.id, stage: "map" },
    });
    expect(cleared.cleared).toBe(1);
    expect(harness.count("source_context_map_artifacts", "session_id = ?", [session.id])).toBe(1);
  });

  it("persists resumable source context map scheduler state", async () => {
    const harness = createHarness();
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/map-scheduler",
        normalizedText: ragText("map scheduler bounded evidence", 8),
      }),
    });
    const sourceId = capture.memory.id;
    const session = await harness.request({
      kind: "createChatSession",
      payload: {
        id: "session-map-scheduler",
        title: "Map scheduler",
        createdAt: "2026-07-09T00:00:00.000Z",
      },
    });
    const step = {
      groupId: "group-1",
      groupIndex: 0,
      sourceIds: [sourceId],
      windowRefs: [{ sourceId, chunkId: "chunk-1", ord: 0 }],
      evidenceIds: [`memory:${sourceId}:chunk:chunk-1`],
      tokenEstimate: 240,
      inputSummary: "group=group-1; windows=1; tokens=240",
      stepSignature: `step:${sourceId}:chunk-1`,
    };

    const run = await harness.request({
      kind: "createOrResumeSourceContextMapRun",
      payload: {
        id: "sctx-map-run-behavior",
        sessionId: session.id,
        ownerRunId: "run-map-scheduler",
        mode: "research",
        planSignature: "plan-signature-map-scheduler",
        maxConcurrentMaps: 2,
        steps: [step],
        createdAt: "2026-07-09T00:00:01.000Z",
      },
    });
    expect(run).toMatchObject({
      id: "sctx-map-run-behavior",
      sessionId: session.id,
      ownerRunId: "run-map-scheduler",
      mode: "research",
      status: "queued",
      maxConcurrentMaps: 2,
      progressCurrent: 0,
      progressTotal: 1,
    });
    expect(run.steps[0]).toMatchObject({
      status: "queued",
      sourceIds: [sourceId],
      windowRefs: [{ sourceId, chunkId: "chunk-1", ord: 0 }],
      evidenceIds: [`memory:${sourceId}:chunk:chunk-1`],
    });

    const claimed = await harness.request({
      kind: "claimSourceContextMapStep",
      runId: run.id,
      now: "2026-07-09T00:00:02.000Z",
    });
    expect(claimed.run.status).toBe("running");
    expect(claimed.step).toMatchObject({ status: "running", attemptCount: 1 });
    const stepId = claimed.step?.id ?? "";

    const completedStep = await harness.request({
      kind: "completeSourceContextMapStep",
      payload: {
        stepId,
        outputSummary: "bounded map finding",
        artifactId: "artifact-map-1",
        completedAt: "2026-07-09T00:00:03.000Z",
      },
    });
    expect(completedStep).toMatchObject({
      id: stepId,
      status: "completed",
      outputSummary: "bounded map finding",
      artifactId: "artifact-map-1",
    });

    const reducing = await harness.request({
      kind: "markSourceContextMapReduceStarted",
      payload: {
        runId: run.id,
        mapArtifactIds: ["artifact-map-1"],
        inputSummary: "map artifacts=1",
        startedAt: "2026-07-09T00:00:04.000Z",
      },
    });
    expect(reducing.status).toBe("reducing");
    expect(reducing.progressCurrent).toBe(1);
    expect(reducing.progressTotal).toBe(1);

    const done = await harness.request({
      kind: "markSourceContextMapReduceCompleted",
      payload: {
        runId: run.id,
        outputSummary: "final bounded answer",
        artifactId: "artifact-reduce-1",
        completedAt: "2026-07-09T00:00:05.000Z",
      },
    });
    expect(done).toMatchObject({
      status: "done",
      progressCurrent: 1,
      progressTotal: 1,
    });
    const doneRow = harness.selectObject(
      "SELECT reduce_output_summary, reduce_artifact_id FROM source_context_map_runs WHERE id = ? LIMIT 1",
      [run.id],
    );
    expect(doneRow).toMatchObject({
      reduce_output_summary: "final bounded answer",
      reduce_artifact_id: "artifact-reduce-1",
    });

    const listed = await harness.request({
      kind: "listSourceContextMapRuns",
      filter: { sessionId: session.id, limit: 10 },
    });
    expect(listed.runs.map((item) => item.id)).toContain(run.id);
    const detail = await harness.request({ kind: "getSourceContextMapRun", id: run.id });
    expect(detail?.steps[0]?.outputSummary).toBe("bounded map finding");
    const events = await harness.request({
      kind: "listSourceContextMapEvents",
      runId: run.id,
      limit: 20,
    });
    expect(events.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["queued", "step_claimed", "step_completed", "reduce_completed"]),
    );

    await harness.request({ kind: "deleteMemory", id: sourceId });
    expect(harness.count("source_context_map_runs", "id = ?", [run.id])).toBe(0);
    expect(harness.count("source_context_map_steps", "run_id = ?", [run.id])).toBe(0);
    expect(harness.count("source_context_map_events", "run_id = ?", [run.id])).toBe(0);
  });

  it("cancels retries resumes and resets source context map scheduler runs", async () => {
    const harness = createHarness();
    const session = await harness.request({
      kind: "createChatSession",
      payload: {
        id: "session-map-scheduler-control",
        title: "Map scheduler control",
        createdAt: "2026-07-09T00:01:00.000Z",
      },
    });
    const step = {
      groupId: "group-control",
      groupIndex: 0,
      sourceIds: ["source-control"],
      windowRefs: [{ sourceId: "source-control", chunkId: "chunk-control", ord: 0 }],
      evidenceIds: ["memory:source-control:chunk:chunk-control"],
      tokenEstimate: 120,
      inputSummary: "control map input",
      stepSignature: "step-control",
    };
    const run = (await harness.request({
      kind: "createOrResumeSourceContextMapRun",
      payload: {
        sessionId: session.id,
        ownerRunId: "run-map-scheduler-control",
        planSignature: "plan-signature-map-scheduler-control",
        maxConcurrentMaps: 1,
        steps: [step],
      },
    })) as SourceContextMapRunDetail;
    const runId = run.id;

    const cancelled = await harness.request({ kind: "cancelSourceContextMapRun", id: runId });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelRequested).toBe(true);
    expect(
      harness.count("source_context_map_steps", "run_id = ? AND status = 'cancelled'", [runId]),
    ).toBe(1);

    const resumed = await harness.request({ kind: "resumeSourceContextMapRun", id: runId });
    expect(resumed.status).toBe("queued");
    expect(resumed.cancelRequested).toBe(false);
    expect(
      harness.count("source_context_map_steps", "run_id = ? AND status = 'queued'", [runId]),
    ).toBe(1);

    const claim = await harness.request({ kind: "claimSourceContextMapStep", runId });
    const failedStep = await harness.request({
      kind: "failSourceContextMapStep",
      payload: {
        stepId: claim.step?.id ?? "",
        errorCode: "PROVIDER_ERROR",
        errorMessage: "map failed",
      },
    });
    expect(failedStep.status).toBe("failed");
    const failed = await harness.request({ kind: "getSourceContextMapRun", id: runId });
    expect(failed?.status).toBe("failed");

    const retry = await harness.request({ kind: "retrySourceContextMapRun", id: runId });
    expect(retry).toMatchObject({
      status: "queued",
      retryOfRunId: runId,
      progressCurrent: 0,
      progressTotal: 1,
    });
    expect(harness.count("source_context_map_runs", "retry_of_run_id = ?", [runId])).toBe(1);

    const reset = await harness.request({ kind: "repair", action: "reset_library" });
    expect(reset.action).toBe("reset_library");
    expect(harness.count("source_context_map_runs")).toBe(0);
    expect(harness.count("source_context_map_steps")).toBe(0);
    expect(harness.count("source_context_map_events")).toBe(0);
  });

  it("returns recent sources and truthful skipped traces for empty query", async () => {
    const harness = createHarness();
    const first = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/recent-a",
        normalizedText: ragText("recent first", 4),
        capturedAt: "2026-07-01T00:01:00.000Z",
        metadata: {
          title: "Recent Research Note",
          abstract: "Recent source type filter research note.",
          source_type: "research-note",
        },
      }),
    });
    const second = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/recent-b",
        normalizedText: ragText("recent second", 4),
        capturedAt: "2026-07-01T00:02:00.000Z",
      }),
    });

    const retrieved = await harness.request({
      kind: "retrieveSources",
      payload: { query: "", limit: 10 },
    });

    expect(retrieved.items.map((item) => item.id)).toEqual([second.memory.id, first.memory.id]);
    expect(trackStatus(retrieved, "recent_sources")).toBe("used");
    expect(trackReason(retrieved, "recent_sources")).toBe("empty_query");
    expect(trackStatus(retrieved, "meta_sources")).toBe("skipped");
    expect(trackReason(retrieved, "meta_sources")).toBe("empty_query");
    expect(trackStatus(retrieved, "vector_meta")).toBe("skipped");
    expect(trackReason(retrieved, "vector_meta")).toBe("empty_query");
    expect(trackStatus(retrieved, "fts_chunks")).toBe("skipped");
    expect(trackReason(retrieved, "fts_chunks")).toBe("empty_query");
    expect(trackStatus(retrieved, "vector_chunks")).toBe("skipped");
    expect(trackReason(retrieved, "vector_chunks")).toBe("empty_query");
    expect(retrieved.trace.stages?.map((stage) => stage.id)).toEqual([
      "recall",
      "source_grouping",
      "coarse_rank",
      "relevance_banding",
      "strength_selection",
      "evidence_selection",
    ]);
    expect(retrieved.bands?.find((band) => band.band === "high")?.itemCount).toBe(2);

    const filtered = await harness.request({
      kind: "retrieveSources",
      payload: { query: "", limit: 10, filter: { sourceTypes: ["webpage"] } },
    });
    expect(filtered.items.map((item) => item.id)).toEqual([second.memory.id]);
  });

  it("uses metadata FTS and applies source filters across retrieval tracks", async () => {
    const harness = createHarness();
    await activateTestEmbeddingModel(harness);
    const research = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/filtered-research",
        sourceTitle: "Filtered Research",
        normalizedText: ragText("shared retrieval body", 40),
        metadata: {
          title: "Filtered Research",
          abstract: "Neural atlas metadata exists only in the source abstract.",
          source_type: "research-note",
        },
      }),
    });
    const webpage = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/filtered-web",
        sourceTitle: "Filtered Web",
        normalizedText: ragText("shared retrieval body", 40),
        capturedAt: "2026-07-01T00:03:00.000Z",
        metadata: {
          title: "Filtered Web",
          abstract: "General webpage metadata.",
          source_type: "webpage",
        },
      }),
    });

    const queued = await harness.request({ kind: "getJobStatus", status: "queued", limit: 10 });
    for (const job of queued.jobs) {
      await harness.request({ kind: "runJob", id: job.id });
    }

    const metadataOnly = await harness.request({
      kind: "retrieveSources",
      payload: {
        query: "neural atlas",
        limit: 5,
        filter: { sourceTypes: ["research-note"] },
      },
    });
    expect(metadataOnly.items.map((item) => item.id)).toEqual([research.memory.id]);
    expect(trackStatus(metadataOnly, "meta_sources")).toBe("used");

    const chunkFiltered = await harness.request({
      kind: "retrieveSources",
      payload: {
        query: "shared retrieval body",
        limit: 10,
        includeChunks: 2,
        filter: { sourceTypes: ["webpage"] },
      },
    });
    expect(chunkFiltered.items.map((item) => item.id)).toEqual([webpage.memory.id]);
    expect(chunkFiltered.items[0]?.tracks).toEqual(
      expect.arrayContaining(["fts_chunks", "vector_chunks"]),
    );
  });

  it("captures markdown sources through the public captureMarkdown RPC", async () => {
    const harness = createHarness();
    const markdownText = [
      "---",
      "title: Uploaded Markdown Notes",
      "abstract: Markdown upload should use the public capture RPC.",
      "---",
      "# Uploaded Markdown Notes",
      "",
      "The upload path stores markdown as source-native evidence.",
    ].join("\n");

    const capture = await harness.request({
      kind: "captureMarkdown",
      payload: {
        sourceUrl: "clio://upload/notes.md",
        sourceTitle: "notes.md",
        markdownText,
        capturedAt: "2026-07-05T00:00:00.000Z",
        metadata: {
          file_name: "notes.md",
          file_size: markdownText.length,
        },
      },
    });

    expect(capture.status).toBe("saved");
    expect(capture.memory.sourceTitle).toBe("Uploaded Markdown Notes");
    expect(
      harness.count("sources", "id = ? AND source_type = 'markdown'", [capture.memory.id]),
    ).toBe(1);

    const detail = await harness.request({ kind: "getMemory", id: capture.memory.id });
    expect(detail?.metadata.adapter).toBe("markdown");
    expect(detail?.metadata.source_type).toBe("markdown");
    expect(detail?.metadata.file_name).toBe("notes.md");
    expect(detail?.normalizedText).not.toContain("file_size:");
  });

  it("adapts markdown sources through the registered adapter boundary", async () => {
    const harness = createHarness();
    const markdownText = [
      "---",
      "title: Markdown Adapter Notes",
      "abstract: Adapter registry metadata lives in markdown frontmatter.",
      "authors: [Ada Lovelace, Grace Hopper]",
      "source_url: https://example.test/notes.md",
      "captured_at: 2026-07-02T00:00:00.000Z",
      "---",
      "# Markdown Adapter Notes",
      "",
      "## Registry Design",
      "",
      "Adapter registry evidence appears in markdown body.",
    ].join("\n");

    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/raw",
        sourceTitle: "Raw Markdown Payload",
        normalizedText: markdownText,
        metadata: {
          source_type: "markdown",
          mime_type: "text/markdown",
        },
      }),
    });
    const sourceId = capture.memory.id;

    expect(capture.status).toBe("saved");
    expect(capture.memory.sourceUrl).toBe("https://example.test/notes.md");
    expect(capture.memory.sourceTitle).toBe("Markdown Adapter Notes");
    expect(harness.count("sources", "id = ? AND source_type = 'markdown'", [sourceId])).toBe(1);
    expect(
      harness.count(
        "source_metadata",
        "source_id = ? AND source_type = 'markdown' AND title = ? AND abstract = ?",
        [
          sourceId,
          "Markdown Adapter Notes",
          "Adapter registry metadata lives in markdown frontmatter.",
        ],
      ),
    ).toBe(1);
    expect(harness.count("source_metadata_fts", "source_id = ?", [sourceId])).toBe(1);

    const detail = await harness.request({ kind: "getMemory", id: sourceId });
    expect(detail?.normalizedText).not.toContain("captured_at:");
    expect(detail?.metadata.source_type).toBe("markdown");
    expect(detail?.metadata.adapter).toBe("markdown");
    expect(detail?.metadata.authors).toEqual(["Ada Lovelace", "Grace Hopper"]);
    expect(detail?.metadata.sectionOutline).toEqual([
      { level: 1, text: "Markdown Adapter Notes" },
      { level: 2, text: "Registry Design" },
    ]);

    const retrieved = await harness.request({
      kind: "retrieveSources",
      payload: {
        query: "adapter registry metadata",
        limit: 5,
        filter: { sourceTypes: ["markdown"] },
      },
    });
    expect(retrieved.items.map((item) => item.id)).toEqual([sourceId]);
    expect(trackStatus(retrieved, "meta_sources")).toBe("used");

    const excluded = await harness.request({
      kind: "retrieveSources",
      payload: {
        query: "adapter registry metadata",
        limit: 5,
        filter: { sourceTypes: ["webpage"] },
      },
    });
    expect(excluded.items.map((item) => item.id)).not.toContain(sourceId);
  });

  it("adapts arxiv sources through the paper adapter boundary", async () => {
    const harness = createHarness();
    const abstract =
      "This paper studies bounded evidence retrieval for local research memory systems.";
    const paperText = [
      "Title: Bounded Evidence Retrieval for Local Research Memory",
      "Authors: Ada Lovelace, Grace Hopper",
      `Abstract: ${abstract}`,
      "Subjects: Computation and Language (cs.CL); Machine Learning (cs.LG)",
      "DOI: 10.5555/clio.2024",
      "",
      "1 Introduction",
      "Bounded evidence retrieval keeps long documents out of prompt assembly.",
      "",
      "2 Method",
      "The method stores source metadata separately from chunk evidence.",
    ].join("\n");

    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://arxiv.org/abs/2401.01234v2",
        sourceTitle: "arXiv:2401.01234",
        normalizedText: paperText,
        metadata: {},
      }),
    });
    const sourceId = capture.memory.id;

    expect(capture.status).toBe("saved");
    expect(capture.memory.sourceTitle).toBe("Bounded Evidence Retrieval for Local Research Memory");
    expect(harness.count("sources", "id = ? AND source_type = 'paper'", [sourceId])).toBe(1);
    expect(
      harness.count(
        "source_metadata",
        "source_id = ? AND source_type = 'paper' AND title = ? AND abstract = ?",
        [sourceId, "Bounded Evidence Retrieval for Local Research Memory", abstract],
      ),
    ).toBe(1);
    expect(harness.count("source_metadata_fts", "source_id = ?", [sourceId])).toBe(1);

    const detail = await harness.request({ kind: "getMemory", id: sourceId });
    expect(detail?.metadata.source_type).toBe("paper");
    expect(detail?.metadata.adapter).toBe("paper");
    expect(detail?.metadata.paper_source).toBe("arxiv");
    expect(detail?.metadata.arxiv_id).toBe("2401.01234");
    expect(detail?.metadata.arxiv_version).toBe("v2");
    expect(detail?.metadata.year).toBe(2024);
    expect(detail?.metadata.doi).toBe("10.5555/clio.2024");
    expect(detail?.metadata.authors).toEqual(["Ada Lovelace", "Grace Hopper"]);
    expect(detail?.metadata.categories).toEqual(["cs.CL", "cs.LG"]);
    expect(detail?.metadata.sectionOutline).toEqual([
      { level: 1, text: "Introduction" },
      { level: 1, text: "Method" },
    ]);
    const paperMetadata = detail?.metadata.paper_metadata as
      | {
          version?: number;
          doi?: string;
          arxivId?: string;
          arxivVersion?: string;
          year?: number;
          authors?: string[];
          sourceTrust?: string;
          alternateUrls?: string[];
          fields?: Record<string, { source?: string; confidence?: number }>;
          remote?: { status?: string };
        }
      | undefined;
    expect(paperMetadata).toMatchObject({
      version: 1,
      doi: "10.5555/clio.2024",
      arxivId: "2401.01234",
      arxivVersion: "v2",
      year: 2024,
      authors: ["Ada Lovelace", "Grace Hopper"],
      sourceTrust: "high",
      remote: { status: "disabled" },
    });
    expect(paperMetadata?.alternateUrls).toEqual(
      expect.arrayContaining([
        "https://arxiv.org/abs/2401.01234v2",
        "https://arxiv.org/pdf/2401.01234v2.pdf",
        "https://doi.org/10.5555/clio.2024",
      ]),
    );
    expect(paperMetadata?.fields?.doi?.confidence ?? 0).toBeGreaterThan(0.7);

    const retrieved = await harness.request({
      kind: "retrieveSources",
      payload: {
        query: "bounded evidence retrieval local research",
        limit: 5,
        filter: { sourceTypes: ["paper"] },
      },
    });
    expect(retrieved.items.map((item) => item.id)).toEqual([sourceId]);
    expect(trackStatus(retrieved, "meta_sources")).toBe("used");

    const excluded = await harness.request({
      kind: "retrieveSources",
      payload: {
        query: "bounded evidence retrieval local research",
        limit: 5,
        filter: { sourceTypes: ["webpage"] },
      },
    });
    expect(excluded.items.map((item) => item.id)).not.toContain(sourceId);
  });

  it("uses explicit arxiv hints and keeps degraded paper capture non-blocking", async () => {
    const harness = createHarness();
    const hinted = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/papers/local-rag",
        sourceTitle: "Explicit Paper Hint",
        normalizedText: [
          "Title: Explicit Hint Paper",
          "Authors: Alan Turing and Barbara Liskov",
          "Abstract: Explicit adapter hints should route through paper metadata.",
          "Subjects: Computer Science (cs.AI)",
        ].join("\n"),
        metadata: {
          source_adapter: "arxiv",
        },
      }),
    });
    const hintedDetail = await harness.request({ kind: "getMemory", id: hinted.memory.id });
    expect(hinted.status).toBe("saved");
    expect(hintedDetail?.metadata.source_type).toBe("paper");
    expect(hintedDetail?.metadata.paper_source).toBe("arxiv");
    expect(hintedDetail?.metadata.authors).toEqual(["Alan Turing", "Barbara Liskov"]);

    const degraded = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://arxiv.org/abs/not-a-valid-id",
        sourceTitle: "Malformed Arxiv Metadata",
        normalizedText: "Readable paper text without structured metadata still saves.",
        metadata: {},
      }),
    });
    const degradedDetail = await harness.request({ kind: "getMemory", id: degraded.memory.id });

    expect(degraded.status).toBe("saved");
    expect(harness.count("sources", "id = ? AND source_type = 'paper'", [degraded.memory.id])).toBe(
      1,
    );
    expect(degradedDetail?.metadata.source_type).toBe("paper");
    expect(degradedDetail?.metadata.paper_source).toBe("arxiv");
    expect(degradedDetail?.metadata.arxiv_id).toBeUndefined();
    expect(degradedDetail?.metadata.paper_metadata).toMatchObject({
      version: 1,
      remote: { status: "disabled" },
    });
    expect(degraded.memory.sourceTitle).toBe("Malformed Arxiv Metadata");
  });

  it("runs paper metadata hardening and filters by structured paper fields", async () => {
    const harness = createHarness();
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/papers/metadata-filter",
        sourceTitle: "Structured Metadata Filter",
        normalizedText: [
          "Title: Structured Metadata Filter",
          "Abstract: Structured paper metadata should be queryable after hardening.",
          "",
          "1 Method",
          "The structured metadata body uses deterministic enrichment.",
        ].join("\n"),
        metadata: {
          source_type: "paper",
          doi: "https://doi.org/10.7777/CLIO.2026",
          arxiv_id: "2501.01234",
          arxiv_version: "v1",
          year: 2026,
          venue: "Clio Metadata Symposium",
          authors: ["Katherine Johnson", "Edsger Dijkstra"],
          references: ["Barbara Liskov. Durable local memory systems. 2024. doi:10.8888/clio.ref"],
        },
      }),
    });
    const sourceId = capture.memory.id;
    const queued = await harness.request({ kind: "getJobStatus", status: "queued", limit: 10 });
    const job = await harness.request({ kind: "runJob", id: queued.jobs[0]?.id ?? "" });
    expect(job.status).toBe("done");

    const finishedJob = harness.selectObject("SELECT result_json FROM jobs WHERE id = ? LIMIT 1", [
      queued.jobs[0]?.id ?? "",
    ]);
    const jobResult = JSON.parse(String(finishedJob?.result_json ?? "{}")) as {
      paperMetadata?: { version?: number; remoteStatus?: string; referenceCount?: number };
    };
    expect(jobResult.paperMetadata).toMatchObject({
      version: 1,
      remoteStatus: "disabled",
      referenceCount: 1,
    });

    const detail = await harness.request({ kind: "getMemory", id: sourceId });
    const paperMetadata = detail?.metadata.paper_metadata as
      | { referenceList?: Array<{ doi?: string; year?: number }> }
      | undefined;
    expect(paperMetadata?.referenceList).toMatchObject([{ doi: "10.8888/clio.ref", year: 2024 }]);

    const filterCases = [
      { doi: "https://doi.org/10.7777/CLIO.2026" },
      { arxivIds: ["https://arxiv.org/abs/2501.01234v1"] },
      { years: [2026] },
      { venues: ["metadata symposium"] },
      { authors: ["katherine johnson"] },
    ];
    for (const filter of filterCases) {
      const retrieved = await harness.request({
        kind: "retrieveSources",
        payload: { query: "", limit: 5, filter },
      });
      expect(retrieved.items.map((item) => item.id)).toEqual([sourceId]);
    }

    const excluded = await harness.request({
      kind: "retrieveSources",
      payload: { query: "", limit: 5, filter: { authors: ["unmatched author"] } },
    });
    expect(excluded.items.map((item) => item.id)).not.toContain(sourceId);
  });

  it("captures PDF bytes through the public capturePdf RPC", async () => {
    const page1 = "Uploaded PDF page one cites parser-backed capture [1].";
    const page2 = "Uploaded PDF page two keeps concrete page anchors.";
    const text = `${page1}\n\n${page2}`;
    const page2Start = page1.length + 2;
    const parsed: ParsedPdfDocument = {
      text,
      pages: [
        { pageNumber: 1, text: page1, charStart: 0, charEnd: page1.length },
        {
          pageNumber: 2,
          text: page2,
          charStart: page2Start,
          charEnd: page2Start + page2.length,
        },
      ],
      paragraphs: [
        {
          text: page1,
          pageNumber: 1,
          charStart: 0,
          charEnd: page1.length,
          contentKind: "body",
        },
        {
          text: page2,
          pageNumber: 2,
          charStart: page2Start,
          charEnd: page2Start + page2.length,
          contentKind: "body",
        },
      ],
      sections: [
        {
          level: 1,
          text: "Introduction",
          kind: "introduction",
          charStart: 0,
          charEnd: page2Start,
          pageStart: 1,
          pageEnd: 1,
        },
        {
          level: 1,
          text: "References",
          kind: "references",
          charStart: page2Start,
          charEnd: text.length,
          pageStart: 2,
          pageEnd: 2,
        },
      ],
      references: [
        {
          index: 0,
          label: "[1]",
          text: "Ada Lovelace. Parser-backed capture. 2024. doi:10.1234/clio.pdf",
          charStart: page2Start,
          charEnd: text.length,
          pageStart: 2,
          pageEnd: 2,
          doi: "10.1234/clio.pdf",
          year: 2024,
        },
      ],
      figures: [
        {
          id: "figure:1",
          kind: "figure",
          label: "Figure 1",
          caption: "Parser-backed capture flow.",
          charStart: 0,
          charEnd: page1.length,
          pageNumber: 1,
          confidence: "medium",
        },
      ],
      tables: [
        {
          id: "table:1",
          kind: "table",
          label: "Table 1",
          caption: "Concrete page anchors.",
          charStart: page2Start,
          charEnd: text.length,
          pageNumber: 2,
          confidence: "medium",
        },
      ],
      images: [
        {
          id: "image:1",
          pageNumber: 1,
          label: "Figure 1",
          caption: "Parser-backed capture flow.",
          captionCharStart: 0,
          captionCharEnd: page1.length,
          objectRef: "figure_image_1",
          source: "pdfjs_operator_list",
          extractionStatus: "operator_detected",
          visionAnalysis: {
            analysisId: "figure-analysis:1",
            status: "requires_visual_model",
            modelInput: "image",
            inputRequirement: "bounded_image_or_page_crop",
            inputStatus: "needs_bounded_crop",
            promptBoundary: "no_full_pdf_prompt",
            providerBoundary: "trusted_runtime_required",
          },
          confidence: "medium",
        },
      ],
      tableStructures: [
        {
          id: "table-structure:1",
          pageNumber: 2,
          charStart: page2Start,
          charEnd: text.length,
          rowCount: 2,
          columnCount: 2,
          rows: [
            ["Metric", "Value"],
            ["Precision", "0.91"],
          ],
          cells: [
            { rowIndex: 0, columnIndex: 0, text: "Metric", rowSpan: 1, columnSpan: 1 },
            { rowIndex: 0, columnIndex: 1, text: "Value", rowSpan: 1, columnSpan: 1 },
            { rowIndex: 1, columnIndex: 0, text: "Precision", rowSpan: 1, columnSpan: 1 },
            { rowIndex: 1, columnIndex: 1, text: "0.91", rowSpan: 1, columnSpan: 1 },
          ],
          semanticVersion: "clio-pdf-table-semantics-v1",
          headerRowCount: 1,
          headerRows: [0],
          columnTypes: ["text", "numeric"],
          columnSemantics: [
            {
              columnIndex: 0,
              header: "Metric",
              type: "text",
              nonEmptyCellCount: 1,
              numericCellRatio: 0,
              sampleValues: ["Precision"],
            },
            {
              columnIndex: 1,
              header: "Value",
              type: "numeric",
              nonEmptyCellCount: 1,
              numericCellRatio: 1,
              sampleValues: ["0.91"],
            },
          ],
          mergedCellHints: [],
          sparseRowIndexes: [],
          multiPageContinuation: {
            status: "single_page",
            confidence: "low",
          },
          semanticWarnings: [],
          markdownPreview: ["| Metric | Value |", "| --- | --- |", "| Precision | 0.91 |"].join(
            "\n",
          ),
          csvPreview: ["Metric,Value", "Precision,0.91"].join("\n"),
          captionLabel: "Table 1",
          caption: "Concrete page anchors.",
          captionCharStart: page2Start,
          captionCharEnd: text.length,
          source: "coordinate_text_items",
          confidence: "low",
        },
      ],
      figureAnalyses: [
        {
          id: "figure-analysis:1",
          imageId: "image:1",
          pageNumber: 1,
          label: "Figure 1",
          caption: "Parser-backed capture flow.",
          source: "pdfjs_operator_list",
          status: "requires_visual_model",
          modelInput: "image",
          inputRequirement: "bounded_image_or_page_crop",
          inputStatus: "needs_bounded_crop",
          promptBoundary: "no_full_pdf_prompt",
          providerBoundary: "trusted_runtime_required",
          reason: "bounded_image_crop_required",
          confidence: "medium",
        },
      ],
      citationLinks: [
        {
          id: "citation-link:1",
          marker: "[1]",
          citationStyle: "numeric_bracket",
          normalizedTargetLabel: "[1]",
          targetReferenceIndex: 0,
          targetReferenceLabel: "[1]",
          charStart: 50,
          charEnd: 53,
          pageNumber: 1,
          context: "Uploaded PDF page one cites parser-backed capture [1].",
          confidence: "high",
        },
      ],
      pageLabels: [
        { pageNumber: 1, label: "Page 1", charStart: 0, charEnd: page1.length },
        {
          pageNumber: 2,
          label: "Page 2",
          charStart: page2Start,
          charEnd: page2Start + page2.length,
        },
      ],
      parseProfile: {
        parser: "pdfjs",
        parserVersion: "clio-pdf-structure-v3",
        pageCount: 2,
        textHash: hashText(text),
        ocrStatus: "not_required",
        warnings: [],
      },
      parseQuality: {
        version: "clio-pdf-parse-quality-v1",
        status: "pass",
        score: 1,
        metrics: {
          pageCount: 2,
          textPageCoverage: 1,
          sectionCount: 2,
          referenceCount: 1,
          figureCaptionCount: 1,
          imageArtifactCount: 1,
          tableCaptionCount: 1,
          tableStructureCount: 1,
          tableSemanticCount: 1,
          figureAnalysisQueueCount: 1,
          figureVisionReadyCount: 1,
          citationLinkCount: 1,
          linkedReferenceRatio: 1,
        },
        warnings: [],
      },
      rawFile: {
        status: "not_persisted",
        reason: "raw_file_persistence_pending",
        byteLength: 3,
      },
      metadata: {
        title: "Uploaded Parser PDF",
        pageCount: 2,
        parser: "pdfjs",
        textHash: hashText(text),
      },
    };
    const parserInputSnapshots: number[][] = [];
    const pdfRawFileStore = new MemoryPdfRawFileStore();
    const harness = createHarness({
      pdfRawFileStore,
      pdfParser: async (bytes) => {
        const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        parserInputSnapshots.push(Array.from(input));
        structuredClone(input, { transfer: [input.buffer] });
        expect(input.byteLength).toBe(0);
        return parsed;
      },
    });

    const capture = await harness.request({
      kind: "capturePdf",
      payload: {
        sourceUrl: "clio://upload/parser.pdf",
        sourceTitle: "parser.pdf",
        capturedAt: "2026-07-01T00:00:00.000Z",
        bytes: new Uint8Array([1, 2, 3]),
        metadata: {
          file_name: "parser.pdf",
          file_size: 3,
        },
      },
    });
    const sourceId = capture.memory.id;

    expect(parserInputSnapshots).toEqual([[1, 2, 3]]);
    expect(pdfRawFileStore.writes).toHaveLength(1);
    expect(pdfRawFileStore.writes[0]).toMatchObject({
      sourceId,
      sourceUrl: "clio://upload/parser.pdf",
      sourceTitle: "Uploaded Parser PDF",
      capturedAt: "2026-07-01T00:00:00.000Z",
    });
    expect(Array.from(pdfRawFileStore.writes[0]?.bytes ?? [])).toEqual([1, 2, 3]);
    expect(capture.status).toBe("saved");
    expect(capture.memory.sourceTitle).toBe("Uploaded Parser PDF");
    expect(harness.count("sources", "id = ? AND source_type = 'pdf'", [sourceId])).toBe(1);

    const detail = await harness.request({ kind: "getMemory", id: sourceId });
    expect(detail?.metadata.adapter).toBe("pdf");
    expect(detail?.metadata.source_type).toBe("pdf");
    expect(detail?.metadata.parser).toBe("pdfjs");
    expect(detail?.metadata.pdf_page_count).toBe(2);
    expect(detail?.metadata.pdf_parse_profile).toMatchObject({
      parser: "pdfjs",
      parserVersion: "clio-pdf-structure-v3",
      pageCount: 2,
      ocrStatus: "not_required",
      warnings: [],
    });
    expect(detail?.metadata.sectionOutline).toEqual([
      { level: 1, text: "Introduction" },
      { level: 1, text: "References" },
    ]);
    expect(detail?.metadata.pdf_references).toMatchObject([
      {
        index: 0,
        label: "[1]",
        doi: "10.1234/clio.pdf",
        year: 2024,
        pageStart: 2,
        pageEnd: 2,
      },
    ]);
    expect(detail?.metadata.pdf_figures).toMatchObject([
      { label: "Figure 1", caption: "Parser-backed capture flow.", pageNumber: 1 },
    ]);
    expect(detail?.metadata.pdf_images).toMatchObject([
      {
        pageNumber: 1,
        label: "Figure 1",
        objectRef: "figure_image_1",
        source: "pdfjs_operator_list",
        extractionStatus: "operator_detected",
        visionAnalysis: {
          status: "requires_visual_model",
          modelInput: "image",
          inputStatus: "needs_bounded_crop",
        },
      },
    ]);
    expect(detail?.metadata.pdf_figure_analyses).toMatchObject([
      {
        imageId: "image:1",
        pageNumber: 1,
        label: "Figure 1",
        status: "requires_visual_model",
        modelInput: "image",
        inputStatus: "needs_bounded_crop",
      },
    ]);
    expect(detail?.metadata.pdf_tables).toMatchObject([
      { label: "Table 1", caption: "Concrete page anchors.", pageNumber: 2 },
    ]);
    expect(detail?.metadata.pdf_table_structures).toMatchObject([
      {
        pageNumber: 2,
        rowCount: 2,
        columnCount: 2,
        rows: [
          ["Metric", "Value"],
          ["Precision", "0.91"],
        ],
        cells: [
          { rowIndex: 0, columnIndex: 0, text: "Metric" },
          { rowIndex: 0, columnIndex: 1, text: "Value" },
          { rowIndex: 1, columnIndex: 0, text: "Precision" },
          { rowIndex: 1, columnIndex: 1, text: "0.91" },
        ],
        semanticVersion: "clio-pdf-table-semantics-v1",
        headerRowCount: 1,
        columnTypes: ["text", "numeric"],
        markdownPreview: ["| Metric | Value |", "| --- | --- |", "| Precision | 0.91 |"].join("\n"),
        csvPreview: "Metric,Value\nPrecision,0.91",
        captionLabel: "Table 1",
        source: "coordinate_text_items",
      },
    ]);
    expect(detail?.metadata.pdf_citation_links).toMatchObject([
      {
        marker: "[1]",
        normalizedTargetLabel: "[1]",
        targetReferenceIndex: 0,
        confidence: "high",
      },
    ]);
    expect(detail?.metadata.pdf_parse_quality).toMatchObject({
      version: "clio-pdf-parse-quality-v1",
      status: "pass",
      metrics: {
        referenceCount: 1,
        imageArtifactCount: 1,
        tableStructureCount: 1,
        tableSemanticCount: 1,
        figureAnalysisQueueCount: 1,
        figureVisionReadyCount: 1,
        citationLinkCount: 1,
      },
    });
    expect(detail?.metadata.pdf_raw_file).toMatchObject({
      status: "persisted",
      storage: "opfs",
      path: `memory://${sourceId}.pdf`,
      byteLength: 3,
      contentType: "application/pdf",
    });
    const rawFile = await harness.request({ kind: "getPdfRawFile", id: sourceId });
    expect(rawFile).toMatchObject({
      memoryId: sourceId,
      sourceTitle: "Uploaded Parser PDF",
      sourceUrl: "clio://upload/parser.pdf",
      byteLength: 3,
      contentType: "application/pdf",
    });
    expect(
      Array.from(
        rawFile.bytes instanceof Uint8Array ? rawFile.bytes : new Uint8Array(rawFile.bytes),
      ),
    ).toEqual([1, 2, 3]);
    expect(typeof (detail?.metadata.pdf_raw_file as { persistedAt?: unknown })?.persistedAt).toBe(
      "string",
    );
    expect(detail?.metadata.file_name).toBe("parser.pdf");
    expect(detail?.chunks[0]?.pageStart).toBe(1);
    expect(detail?.chunks[0]?.pageEnd).toBe(2);

    const retrieved = await harness.request({
      kind: "retrieveSources",
      payload: {
        query: "parser-backed capture page anchors",
        limit: 5,
        includeChunks: 1,
        filter: { sourceTypes: ["pdf"] },
      },
    });
    expect(retrieved.items.map((item) => item.id)).toEqual([sourceId]);
    expect(retrieved.items[0]?.hitChunks[0]?.pageStart).toBe(1);
    expect(retrieved.items[0]?.hitChunks[0]?.pageEnd).toBe(2);

    await harness.request({ kind: "deleteMemory", id: sourceId });
    expect(pdfRawFileStore.deletedSourceIds).toEqual([sourceId]);
  });

  it("runs the PDF figure vision queue with bounded image input and persists results", async () => {
    const page1 =
      "Introduction\nFigure 1: Parser-backed capture flow.\nThe figure shows a bounded PDF analysis pipeline.";
    const page2 = "References\n[1] Ada Lovelace. Notes on local memory. 2024.";
    const text = `${page1}\n\n${page2}`;
    const page2Start = page1.length + 2;
    const figureBbox = {
      xMin: 10,
      yMin: 20,
      xMax: 210,
      yMax: 220,
      unit: "pdf_user_space" as const,
    };
    const parsed: ParsedPdfDocument = {
      text,
      pages: [
        { pageNumber: 1, text: page1, charStart: 0, charEnd: page1.length },
        { pageNumber: 2, text: page2, charStart: page2Start, charEnd: page2Start + page2.length },
      ],
      paragraphs: [],
      sections: [
        {
          level: 1,
          text: "Introduction",
          kind: "introduction",
          charStart: 0,
          charEnd: page1.length,
          pageStart: 1,
          pageEnd: 1,
        },
      ],
      references: [],
      figures: [
        {
          id: "figure:1",
          kind: "figure",
          label: "Figure 1",
          caption: "Parser-backed capture flow.",
          charStart: 13,
          charEnd: 53,
          pageNumber: 1,
          bbox: figureBbox,
          confidence: "medium",
        },
      ],
      tables: [],
      images: [
        {
          id: "image:1",
          pageNumber: 1,
          label: "Figure 1",
          caption: "Parser-backed capture flow.",
          captionCharStart: 13,
          captionCharEnd: 53,
          bbox: figureBbox,
          objectRef: "figure_image_1",
          source: "pdfjs_operator_list",
          extractionStatus: "operator_detected",
          visionAnalysis: {
            analysisId: "figure-analysis:1",
            status: "requires_visual_model",
            modelInput: "image",
            inputRequirement: "bounded_image_or_page_crop",
            inputStatus: "needs_bounded_crop",
            promptBoundary: "no_full_pdf_prompt",
            providerBoundary: "trusted_runtime_required",
          },
          confidence: "medium",
        },
      ],
      tableStructures: [],
      figureAnalyses: [
        {
          id: "figure-analysis:1",
          imageId: "image:1",
          pageNumber: 1,
          label: "Figure 1",
          caption: "Parser-backed capture flow.",
          source: "pdfjs_operator_list",
          status: "requires_visual_model",
          modelInput: "image",
          inputRequirement: "bounded_image_or_page_crop",
          inputStatus: "needs_bounded_crop",
          promptBoundary: "no_full_pdf_prompt",
          providerBoundary: "trusted_runtime_required",
          reason: "bounded_image_crop_required",
          confidence: "medium",
        },
      ],
      citationLinks: [],
      pageLabels: [
        { pageNumber: 1, label: "Page 1", charStart: 0, charEnd: page1.length },
        {
          pageNumber: 2,
          label: "Page 2",
          charStart: page2Start,
          charEnd: page2Start + page2.length,
        },
      ],
      parseProfile: {
        parser: "pdfjs",
        parserVersion: "clio-pdf-structure-v3",
        pageCount: 2,
        textHash: hashText(text),
        ocrStatus: "not_required",
        warnings: [],
      },
      parseQuality: {
        version: "clio-pdf-parse-quality-v1",
        status: "pass",
        score: 0.92,
        metrics: {
          pageCount: 2,
          textPageCoverage: 1,
          sectionCount: 1,
          referenceCount: 0,
          figureCaptionCount: 1,
          imageArtifactCount: 1,
          tableCaptionCount: 0,
          tableStructureCount: 0,
          tableSemanticCount: 0,
          figureAnalysisQueueCount: 1,
          figureVisionReadyCount: 1,
          citationLinkCount: 0,
          linkedReferenceRatio: null,
        },
        warnings: ["figure_visual_model_required"],
      },
      rawFile: {
        status: "not_persisted",
        reason: "raw_file_persistence_pending",
        byteLength: 3,
      },
      metadata: {
        title: "Figure Vision PDF",
        pageCount: 2,
        parser: "pdfjs",
        textHash: hashText(text),
      },
    };
    const analyzerInputs: FigureVisionAnalysisInput[] = [];
    const extractorInputs: Array<{
      bytes: number[];
      pageNumber: number;
      bbox?: typeof figureBbox;
    }> = [];
    const pdfRawFileStore = new MemoryPdfRawFileStore();
    const harness = createHarness({
      pdfRawFileStore,
      pdfParser: async () => parsed,
      pdfFigureVisionImageExtractor: async (input) => {
        extractorInputs.push({
          bytes: Array.from(
            input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes),
          ),
          pageNumber: input.pageNumber,
          ...(input.bbox === undefined ? {} : { bbox: input.bbox }),
        });
        return {
          status: "ready",
          pageNumber: input.pageNumber,
          image: {
            base64: "UE5H",
            mimeType: "image/png",
            byteLength: 3,
          },
          crop: {
            kind: "exact_bbox_crop",
            pageNumber: input.pageNumber,
            width: 140,
            height: 120,
            scale: 0.5,
            maxWidth: 1024,
            maxHeight: 1024,
            sourcePage: {
              width: 320,
              height: 240,
            },
            cropRect: {
              x: 5,
              y: 10,
              width: 140,
              height: 120,
              marginPx: 8,
            },
            ...(input.bbox === undefined ? {} : { bbox: input.bbox }),
          },
        };
      },
      figureVisionAnalyzer: {
        async analyze(input) {
          analyzerInputs.push(input);
          return {
            status: "analyzed",
            analysisId: input.analysisId,
            imageId: input.imageId,
            providerKind: "chat",
            summary: "The figure summarizes the capture-to-analysis pipeline.",
            chartType: "diagram",
            extractedLabels: ["capture", "analysis"],
            extractedValues: ["bounded image"],
            claims: [
              {
                claimId: "claim:0",
                text: "The figure depicts a bounded PDF analysis pipeline.",
                confidence: "high",
              },
            ],
          };
        },
      },
    });

    const capture = await harness.request({
      kind: "capturePdf",
      payload: {
        sourceUrl: "clio://upload/figure-vision.pdf",
        sourceTitle: "figure-vision.pdf",
        capturedAt: "2026-07-01T00:00:00.000Z",
        bytes: new Uint8Array([7, 8, 9]),
      },
    });
    const queued = await harness.request({ kind: "getJobStatus", status: "queued", limit: 5 });
    expect(queued.jobs).toHaveLength(1);

    const job = await harness.request({ kind: "runJob", id: queued.jobs[0]?.id ?? "" });
    expect(job.status).toBe("done");

    expect(extractorInputs).toEqual([{ bytes: [7, 8, 9], pageNumber: 1, bbox: figureBbox }]);
    expect(analyzerInputs).toHaveLength(1);
    expect(analyzerInputs[0]).toMatchObject({
      analysisId: "figure-analysis:1",
      imageId: "image:1",
      pageNumber: 1,
      label: "Figure 1",
      caption: "Parser-backed capture flow.",
      pageContext: page1,
      image: {
        base64: "UE5H",
        mimeType: "image/png",
        byteLength: 3,
      },
    });
    expect(analyzerInputs[0]?.pageContext).not.toContain(page2);
    expect("pdfBytes" in ((analyzerInputs[0] ?? {}) as Record<string, unknown>)).toBe(false);
    expect("fullText" in ((analyzerInputs[0] ?? {}) as Record<string, unknown>)).toBe(false);
    expect("apiKey" in ((analyzerInputs[0] ?? {}) as Record<string, unknown>)).toBe(false);

    const detail = await harness.request({ kind: "getMemory", id: capture.memory.id });
    const analyses = detail?.metadata.pdf_figure_analyses as Array<Record<string, unknown>>;
    const results = detail?.metadata.pdf_figure_analysis_results as Array<Record<string, unknown>>;
    expect(analyses).toMatchObject([
      {
        id: "figure-analysis:1",
        imageId: "image:1",
        pageNumber: 1,
        status: "analyzed",
        resultId: "figure-analysis:1",
        resultStatus: "analyzed",
      },
    ]);
    expect(results).toMatchObject([
      {
        analysisId: "figure-analysis:1",
        imageId: "image:1",
        pageNumber: 1,
        label: "Figure 1",
        caption: "Parser-backed capture flow.",
        status: "analyzed",
        providerKind: "chat",
        summary: "The figure summarizes the capture-to-analysis pipeline.",
        chartType: "diagram",
        extractedLabels: ["capture", "analysis"],
        extractedValues: ["bounded image"],
        claims: [
          {
            claimId: "claim:0",
            text: "The figure depicts a bounded PDF analysis pipeline.",
            confidence: "high",
          },
        ],
        crop: {
          kind: "exact_bbox_crop",
          pageNumber: 1,
          width: 140,
          height: 120,
          sourcePage: {
            width: 320,
            height: 240,
          },
          cropRect: {
            x: 5,
            y: 10,
            width: 140,
            height: 120,
            marginPx: 8,
          },
        },
      },
    ]);
    expect(detail?.metadata.pdf_parse_quality).toMatchObject({
      metrics: {
        figureVisionResultCount: 1,
        figureVisionAnalyzedCount: 1,
        figureVisionUnavailableCount: 0,
        figureVisionErrorCount: 0,
      },
      warnings: [],
    });

    const finishedJob = harness.selectObject("SELECT result_json FROM jobs WHERE id = ? LIMIT 1", [
      job.id,
    ]);
    expect(JSON.parse(String(finishedJob?.result_json ?? "{}"))).toMatchObject({
      figureVision: {
        version: "clio-pdf-figure-vision-stage-v1",
        analyzed: 1,
        unavailable: 0,
        error: 0,
        resultCount: 1,
      },
    });
  });

  it("keeps PDF capture saved when raw persistence fails and repairs a duplicate re-upload", async () => {
    const text = "Uploaded PDF remains searchable when raw file persistence fails.";
    const parsed: ParsedPdfDocument = {
      text,
      pages: [{ pageNumber: 1, text, charStart: 0, charEnd: text.length }],
      paragraphs: [
        {
          text,
          pageNumber: 1,
          charStart: 0,
          charEnd: text.length,
          contentKind: "body",
        },
      ],
      sections: [],
      references: [],
      figures: [],
      tables: [],
      images: [],
      tableStructures: [],
      figureAnalyses: [],
      citationLinks: [],
      pageLabels: [{ pageNumber: 1, label: "Page 1", charStart: 0, charEnd: text.length }],
      parseProfile: {
        parser: "pdfjs",
        parserVersion: "clio-pdf-structure-v3",
        pageCount: 1,
        textHash: hashText(text),
        ocrStatus: "not_required",
        warnings: [],
      },
      parseQuality: {
        version: "clio-pdf-parse-quality-v1",
        status: "needs_review",
        score: 0.61,
        metrics: {
          pageCount: 1,
          textPageCoverage: 1,
          sectionCount: 0,
          referenceCount: 0,
          figureCaptionCount: 0,
          imageArtifactCount: 0,
          tableCaptionCount: 0,
          tableStructureCount: 0,
          tableSemanticCount: 0,
          figureAnalysisQueueCount: 0,
          figureVisionReadyCount: 0,
          citationLinkCount: 0,
          linkedReferenceRatio: null,
        },
        warnings: ["section_outline_unavailable"],
      },
      rawFile: {
        status: "not_persisted",
        reason: "raw_file_persistence_pending",
        byteLength: 4,
      },
      metadata: {
        title: "Persistence Failure PDF",
        pageCount: 1,
        parser: "pdfjs",
        textHash: hashText(text),
      },
    };
    const pdfRawFileStore = new MemoryPdfRawFileStore({ failWrite: true });
    const harness = createHarness({
      pdfRawFileStore,
      pdfParser: async () => parsed,
    });

    const capture = await harness.request({
      kind: "capturePdf",
      payload: {
        sourceUrl: "clio://upload/raw-failure.pdf",
        sourceTitle: "raw-failure.pdf",
        capturedAt: "2026-07-01T00:00:00.000Z",
        bytes: new Uint8Array([9, 8, 7, 6]),
        metadata: {},
      },
    });
    const detail = await harness.request({ kind: "getMemory", id: capture.memory.id });

    expect(capture.status).toBe("saved");
    expect(harness.count("sources", "id = ? AND source_type = 'pdf'", [capture.memory.id])).toBe(1);
    expect(pdfRawFileStore.writes).toHaveLength(1);
    expect(detail?.metadata.pdf_raw_file).toMatchObject({
      status: "persist_failed",
      reason: "PDF_RAW_FILE_PERSIST_FAILED",
      message: "raw store offline",
      byteLength: 4,
    });
    await expect(
      harness.request({ kind: "getPdfRawFile", id: capture.memory.id }),
    ).rejects.toMatchObject({
      code: "PDF_RAW_FILE_NOT_AVAILABLE",
    });
    expect(detail?.chunks[0]?.text).toContain("raw file persistence fails");

    pdfRawFileStore.failWrite = false;
    const retry = await harness.request({
      kind: "capturePdf",
      payload: {
        sourceUrl: "clio://upload/raw-failure.pdf",
        sourceTitle: "raw-failure.pdf",
        capturedAt: "2026-07-01T00:00:00.000Z",
        bytes: new Uint8Array([9, 8, 7, 6]),
        metadata: {},
      },
    });
    const repairedDetail = await harness.request({ kind: "getMemory", id: capture.memory.id });
    const repairedRawFile = await harness.request({
      kind: "getPdfRawFile",
      id: capture.memory.id,
    });

    expect(retry.status).toBe("duplicate");
    expect(retry.memory.id).toBe(capture.memory.id);
    expect(pdfRawFileStore.writes).toHaveLength(2);
    expect(repairedDetail?.metadata.pdf_raw_file).toMatchObject({
      status: "persisted",
      byteLength: 4,
      contentType: "application/pdf",
    });
    expect(
      Array.from(
        repairedRawFile.bytes instanceof Uint8Array
          ? repairedRawFile.bytes
          : new Uint8Array(repairedRawFile.bytes),
      ),
    ).toEqual([9, 8, 7, 6]);
  });

  it("calls OPFS getDirectory with its StorageManager receiver", async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    let storedBytes = new Uint8Array();
    const fileHandle = {
      async createWritable() {
        return {
          async write(data: Uint8Array | ArrayBuffer | string) {
            if (typeof data === "string") throw new Error("Expected binary PDF data.");
            storedBytes = new Uint8Array(data instanceof Uint8Array ? data : new Uint8Array(data));
          },
          async close() {},
        };
      },
      async getFile() {
        return {
          async arrayBuffer() {
            return new Uint8Array(storedBytes).buffer;
          },
        };
      },
    };
    const directory = {
      async getDirectoryHandle() {
        return directory;
      },
      async getFileHandle() {
        return fileHandle;
      },
      async removeEntry() {},
    };
    const storage = {
      async getDirectory() {
        if (this !== storage) throw new TypeError("Illegal invocation");
        return directory;
      },
    };
    vi.stubGlobal("navigator", { storage });

    try {
      const harness = createHarness({
        pdfParser: async () => minimalParsedPdf("Receiver-safe OPFS PDF"),
      });
      const capture = await harness.request({
        kind: "capturePdf",
        payload: {
          sourceUrl: "clio://upload/opfs-receiver.pdf",
          sourceTitle: "opfs-receiver.pdf",
          capturedAt: "2026-07-13T00:00:00.000Z",
          bytes,
          metadata: {},
        },
      });
      const rawFile = await harness.request({ kind: "getPdfRawFile", id: capture.memory.id });

      expect(capture.status).toBe("saved");
      expect(Array.from(storedBytes)).toEqual(Array.from(bytes));
      expect(
        Array.from(
          rawFile.bytes instanceof Uint8Array ? rawFile.bytes : new Uint8Array(rawFile.bytes),
        ),
      ).toEqual(Array.from(bytes));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("adapts ordinary PDF sources without classifying them as papers", async () => {
    const harness = createHarness();
    const page1 = "Product Guide page one covers local PDF evidence.";
    const page2 = "Product Guide page two covers retrieval page anchors.";
    const normalizedText = `${page1}\n\n${page2}`;
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/manuals/product-guide.pdf",
        sourceTitle: "Raw PDF Title",
        normalizedText,
        metadata: {
          mime_type: "application/pdf",
          pdf_page_count: 2,
          title: "Product Guide",
          pdf_pages: [
            { pageNumber: 1, charStart: 0, charEnd: page1.length },
            {
              pageNumber: 2,
              charStart: page1.length + 2,
              charEnd: page1.length + 2 + page2.length,
            },
          ],
        },
      }),
    });
    const sourceId = capture.memory.id;

    expect(capture.status).toBe("saved");
    expect(capture.memory.sourceTitle).toBe("Product Guide");
    expect(harness.count("sources", "id = ? AND source_type = 'pdf'", [sourceId])).toBe(1);
    expect(
      harness.count("source_metadata", "source_id = ? AND source_type = 'pdf' AND title = ?", [
        sourceId,
        "Product Guide",
      ]),
    ).toBe(1);

    const detail = await harness.request({ kind: "getMemory", id: sourceId });
    expect(detail?.metadata.source_type).toBe("pdf");
    expect(detail?.metadata.adapter).toBe("pdf");
    expect(detail?.metadata.parser).toBe("pdfjs");
    expect(detail?.metadata.mime_type).toBe("application/pdf");
    expect(detail?.metadata.pdf_page_count).toBe(2);
    expect(detail?.metadata.paper_source).toBeUndefined();
    expect(detail?.chunks[0]?.pageStart).toBe(1);
    expect(detail?.chunks[0]?.pageEnd).toBe(2);
    expect(
      harness.count("source_chunks", "source_id = ? AND page_start = 1 AND page_end = 2", [
        sourceId,
      ]),
    ).toBe(1);

    const retrieved = await harness.request({
      kind: "retrieveSources",
      payload: {
        query: "retrieval page anchors",
        limit: 5,
        includeChunks: 1,
        filter: { sourceTypes: ["pdf"] },
      },
    });
    expect(retrieved.items.map((item) => item.id)).toEqual([sourceId]);
    expect(retrieved.items[0]?.hitChunks[0]?.pageStart).toBe(1);
    expect(retrieved.items[0]?.hitChunks[0]?.pageEnd).toBe(2);

    const windows = await harness.request({
      kind: "getMemoryEvidenceWindows",
      payload: {
        anchors: [{ memoryId: sourceId, ord: 0 }],
        limit: 1,
        contextChunksBefore: 0,
        contextChunksAfter: 0,
      },
    });
    expect(windows.items[0]?.chunks[0]?.pageStart).toBe(1);
    expect(windows.items[0]?.chunks[0]?.pageEnd).toBe(2);

    const excluded = await harness.request({
      kind: "retrieveSources",
      payload: {
        query: "retrieval page anchors",
        limit: 5,
        filter: { sourceTypes: ["paper"] },
      },
    });
    expect(excluded.items.map((item) => item.id)).not.toContain(sourceId);
  });

  it("extracts paper metadata from arxiv PDF sources while preserving pdf source type", async () => {
    const harness = createHarness();
    const abstract = "PDF parser foundations keep paper evidence bounded before retrieval.";
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://arxiv.org/pdf/2601.01234v3.pdf",
        sourceTitle: "arXiv PDF",
        normalizedText: [
          "Title: Parser-First PDF Ingest for Local RAG",
          "Authors: Ada Lovelace and Grace Hopper",
          `Abstract: ${abstract}`,
          "Subjects: Computation and Language (cs.CL); Machine Learning (cs.LG)",
          "DOI: 10.5555/clio.pdf",
          "",
          "1 Introduction",
          "PDF parser output enters chunks before any model sees bounded windows.",
          "",
          "2 Method",
          "The adapter reuses paper metadata extraction.",
        ].join("\n"),
        metadata: {},
      }),
    });
    const sourceId = capture.memory.id;

    expect(capture.status).toBe("saved");
    expect(capture.memory.sourceTitle).toBe("Parser-First PDF Ingest for Local RAG");
    expect(harness.count("sources", "id = ? AND source_type = 'pdf'", [sourceId])).toBe(1);

    const detail = await harness.request({ kind: "getMemory", id: sourceId });
    expect(detail?.metadata.source_type).toBe("pdf");
    expect(detail?.metadata.adapter).toBe("pdf");
    expect(detail?.metadata.paper_source).toBe("arxiv");
    expect(detail?.metadata.arxiv_id).toBe("2601.01234");
    expect(detail?.metadata.arxiv_version).toBe("v3");
    expect(detail?.metadata.year).toBe(2026);
    expect(detail?.metadata.doi).toBe("10.5555/clio.pdf");
    expect(detail?.metadata.abstract).toBe(abstract);
    expect(detail?.metadata.authors).toEqual(["Ada Lovelace", "Grace Hopper"]);
    expect(detail?.metadata.categories).toEqual(["cs.CL", "cs.LG"]);
    expect(detail?.metadata.sectionOutline).toEqual([
      { level: 1, text: "Introduction" },
      { level: 1, text: "Method" },
    ]);
  });

  it("rejects PDFs without readable parser text", async () => {
    const harness = createHarness();

    await expect(
      harness.request({
        kind: "capturePage",
        payload: pagePayload({
          sourceUrl: "https://example.test/scanned.pdf",
          sourceTitle: "Scanned PDF",
          normalizedText: "   ",
          metadata: {
            source_type: "pdf",
            mime_type: "application/pdf",
          },
        }),
      }),
    ).rejects.toMatchObject({
      code: "EMPTY_CAPTURE",
    });

    expect(harness.count("sources", "source_type = 'pdf'")).toBe(0);
    expect(harness.count("source_chunks")).toBe(0);
  });

  it("publishes and hydrates atomic Wiki artifact batches with version idempotency", async () => {
    const harness = createHarness();
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceTitle: "Wiki Artifact Source",
        normalizedText: ragText("wiki artifact evidence", 12),
      }),
    });
    const sourceId = capture.memory.id;
    const chunkId = firstChunkId(harness, sourceId);
    const firstPayload = wikiSourcePublication(sourceId, chunkId, "wiki-input-v1");

    const first = await harness.request({ kind: "publishWikiArtifacts", payload: firstPayload });
    expect(first.createdCount).toBe(2);
    expect(first.reusedCount).toBe(0);
    expect(new Set(first.items.map((item) => item.artifact.versionGroupId))).toEqual(
      new Set([first.versionGroupId]),
    );
    expect(first.items.every((item) => item.disposition === "created")).toBe(true);

    const firstDigest = first.items.find(
      (item) => item.artifact.artifactKind === "source_digest",
    )?.artifact;
    const firstClaim = first.items.find((item) => item.artifact.artifactKind === "claim")?.artifact;
    expect(firstDigest).toBeDefined();
    expect(firstClaim).toBeDefined();

    const detail = await harness.request({
      kind: "getWikiArtifact",
      id: firstClaim?.id ?? "",
    });
    expect(detail?.artifact.payload).toEqual({ signature: "wiki-input-v1" });
    expect(detail?.artifact.coverage).toEqual({ sourceCount: 1 });
    expect(detail?.evidence).toEqual([
      expect.objectContaining({
        artifactId: firstClaim?.id,
        sourceId,
        chunkId,
        pageNo: 1,
        ordinal: 0,
        bbox: { x: 0.1, y: 0.2 },
        parserArtifactKind: "paragraph",
        parserArtifactId: "paragraph-1",
        anchor: { quote: "wiki artifact evidence" },
      }),
    ]);
    expect(detail?.outgoingLinks).toEqual([
      expect.objectContaining({
        fromArtifactId: firstClaim?.id,
        toArtifactId: firstDigest?.id,
        kind: "derived_from",
        createdBy: "compiler",
        creatorVersion: "compiler-v1",
      }),
    ]);

    const reused = await harness.request({ kind: "publishWikiArtifacts", payload: firstPayload });
    expect(reused.versionGroupId).toBe(first.versionGroupId);
    expect(reused.createdCount).toBe(0);
    expect(reused.reusedCount).toBe(2);
    expect(reused.items.map((item) => item.artifact.id)).toEqual(
      first.items.map((item) => item.artifact.id),
    );
    expect(reused.items.every((item) => item.disposition === "reused")).toBe(true);

    const incompleteRetry: PublishWikiArtifactsPayload = {
      ...firstPayload,
      artifacts: firstPayload.artifacts.slice(0, 1),
      links: [],
    };
    await expect(
      harness.request({ kind: "publishWikiArtifacts", payload: incompleteRetry }),
    ).rejects.toMatchObject({ code: "WIKI_ARTIFACT_PARTIAL_IDEMPOTENCY_CONFLICT" });
    expect(harness.count("wiki_artifacts", "input_signature = 'wiki-input-v1'")).toBe(2);

    const second = await harness.request({
      kind: "publishWikiArtifacts",
      payload: wikiSourcePublication(sourceId, chunkId, "wiki-input-v2"),
    });
    expect(second.items.map((item) => item.artifact.versionNo)).toEqual([2, 2]);
    for (const item of second.items) {
      const replaced = first.items.find(
        (candidate) =>
          candidate.artifact.artifactKind === item.artifact.artifactKind &&
          candidate.artifact.artifactKey === item.artifact.artifactKey,
      );
      expect(item.artifact.supersedesArtifactId).toBe(replaced?.artifact.id);
    }

    const current = await harness.request({
      kind: "listWikiArtifacts",
      filter: { scope: { kind: "source", id: sourceId } },
    });
    expect(current.items).toHaveLength(2);
    expect(current.items.every((artifact) => artifact.inputSignature === "wiki-input-v2")).toBe(
      true,
    );
    const history = await harness.request({
      kind: "listWikiArtifacts",
      filter: { scope: { kind: "source", id: sourceId }, includeHistory: true },
    });
    expect(history.items).toHaveLength(4);
    expect(history.items.filter((artifact) => artifact.inputSignature === "wiki-input-v1")).toEqual(
      [
        expect.objectContaining({ freshness: "stale", versionNo: 1 }),
        expect.objectContaining({ freshness: "stale", versionNo: 1 }),
      ],
    );
  });

  it("rejects invalid Wiki evidence and links without leaving a partial publication", async () => {
    const harness = createHarness();
    const firstCapture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/wiki-first",
        normalizedText: ragText("first wiki evidence", 8),
      }),
    });
    const secondCapture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/wiki-second",
        normalizedText: ragText("second wiki evidence", 8),
      }),
    });
    const firstSourceId = firstCapture.memory.id;
    const firstChunkIdValue = firstChunkId(harness, firstSourceId);
    const secondSourceId = secondCapture.memory.id;

    const claimWithoutEvidence: PublishWikiArtifactsPayload = {
      scope: { kind: "source", id: firstSourceId },
      inputSignature: "missing-claim-evidence",
      compilerVersion: "compiler-v1",
      promptVersion: "prompt-v1",
      artifacts: [
        {
          artifactKind: "claim",
          artifactKey: "claim:missing-evidence",
          title: "Unsupported claim",
          content: "This claim must not be persisted.",
        },
      ],
    };
    await expect(
      harness.request({ kind: "publishWikiArtifacts", payload: claimWithoutEvidence }),
    ).rejects.toMatchObject({ code: "WIKI_CLAIM_EVIDENCE_REQUIRED" });

    const missingChunk = wikiSourcePublication(
      firstSourceId,
      "missing-wiki-chunk",
      "missing-chunk",
    );
    await expect(
      harness.request({ kind: "publishWikiArtifacts", payload: missingChunk }),
    ).rejects.toMatchObject({ code: "WIKI_ARTIFACT_EVIDENCE_NOT_FOUND" });

    const mismatchedChunk = wikiSourcePublication(
      secondSourceId,
      firstChunkIdValue,
      "mismatched-chunk",
    );
    await expect(
      harness.request({ kind: "publishWikiArtifacts", payload: mismatchedChunk }),
    ).rejects.toMatchObject({ code: "WIKI_ARTIFACT_EVIDENCE_NOT_FOUND" });

    const missingLinkTarget: PublishWikiArtifactsPayload = {
      scope: { kind: "source", id: firstSourceId },
      inputSignature: "missing-link-target",
      compilerVersion: "compiler-v1",
      promptVersion: "prompt-v1",
      artifacts: [
        {
          artifactKind: "source_digest",
          artifactKey: "digest:rollback",
          title: "Rollback digest",
          content: "This entire batch must roll back.",
        },
      ],
      links: [
        {
          from: { artifactKind: "source_digest", artifactKey: "digest:rollback" },
          to: { artifactId: "missing-artifact" },
          kind: "derived_from",
          createdBy: "compiler",
        },
      ],
    };
    await expect(
      harness.request({ kind: "publishWikiArtifacts", payload: missingLinkTarget }),
    ).rejects.toMatchObject({ code: "WIKI_ARTIFACT_LINK_TARGET_NOT_FOUND" });

    expect(harness.count("wiki_artifacts")).toBe(0);
    expect(harness.count("wiki_artifact_evidence")).toBe(0);
    expect(harness.count("wiki_artifact_links")).toBe(0);
  });

  it("keeps Wiki user edits append-only across machine versions", async () => {
    const harness = createHarness();
    const first = await harness.request({
      kind: "publishWikiArtifacts",
      payload: wikiLibraryPublication("edit-input-v1", "topic:editable"),
    });
    const firstArtifact = first.items[0]?.artifact;
    const second = await harness.request({
      kind: "publishWikiArtifacts",
      payload: wikiLibraryPublication("edit-input-v2", "topic:editable"),
    });
    const secondArtifact = second.items[0]?.artifact;
    const unrelated = await harness.request({
      kind: "publishWikiArtifacts",
      payload: wikiLibraryPublication("edit-input-other", "topic:unrelated"),
    });

    const edit1 = await harness.request({
      kind: "appendWikiUserEdit",
      payload: {
        id: "wiki-edit-1",
        baseArtifactId: firstArtifact?.id ?? "",
        candidateArtifactId: secondArtifact?.id,
        editKind: "patch",
        payload: { operations: [{ op: "replace", path: "/title", value: "User title" }] },
        mergeOutcome: "authored",
        createdAt: "2026-08-11T01:00:00.000Z",
      },
    });
    const edit2 = await harness.request({
      kind: "appendWikiUserEdit",
      payload: {
        id: "wiki-edit-2",
        baseArtifactId: secondArtifact?.id ?? "",
        previousEditId: edit1.id,
        candidateArtifactId: firstArtifact?.id,
        editKind: "override",
        payload: { content: "User-owned content" },
        mergeOutcome: "manual_merge",
        createdAt: "2026-08-11T01:01:00.000Z",
      },
    });

    expect(edit1.versionNo).toBe(1);
    expect(edit2).toMatchObject({ previousEditId: edit1.id, versionNo: 2 });
    const history = await harness.request({
      kind: "listWikiUserEdits",
      artifactId: secondArtifact?.id ?? "",
    });
    expect(history.items.map((edit) => edit.id)).toEqual(["wiki-edit-1", "wiki-edit-2"]);
    const detail = await harness.request({
      kind: "getWikiArtifact",
      id: firstArtifact?.id ?? "",
    });
    expect(detail?.artifact.content).toContain("edit-input-v1");
    expect(detail?.userEdits.map((edit) => edit.id)).toEqual(["wiki-edit-1", "wiki-edit-2"]);

    await expect(
      harness.request({
        kind: "appendWikiUserEdit",
        payload: {
          baseArtifactId: secondArtifact?.id ?? "",
          previousEditId: edit2.id,
          candidateArtifactId: unrelated.items[0]?.artifact.id,
          editKind: "patch",
          payload: { rejected: true },
          mergeOutcome: "conflict",
        },
      }),
    ).rejects.toMatchObject({ code: "WIKI_ARTIFACT_LOGICAL_IDENTITY_MISMATCH" });
    expect(harness.count("wiki_user_edits")).toBe(2);
  });

  it("deletes only the selected Wiki artifact and stales recursive dependents", async () => {
    const harness = createHarness();
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({ normalizedText: ragText("artifact delete evidence", 8) }),
    });
    const sourceId = capture.memory.id;
    const chain = await createWikiDependencyChain(
      harness,
      sourceId,
      firstChunkId(harness, sourceId),
    );
    const sourceCount = harness.count("sources", "id = ?", [sourceId]);
    const chunkCount = harness.count("source_chunks", "source_id = ?", [sourceId]);

    const deleted = await harness.request({ kind: "deleteWikiArtifact", id: chain.digestId });
    expect(deleted).toEqual({ deleted: true, id: chain.digestId, staleArtifactCount: 2 });
    expect(await harness.request({ kind: "getWikiArtifact", id: chain.digestId })).toBeNull();
    expect(harness.count("wiki_artifacts", "freshness = 'stale'")).toBe(2);
    expect(harness.count("sources", "id = ?", [sourceId])).toBe(sourceCount);
    expect(harness.count("source_chunks", "source_id = ?", [sourceId])).toBe(chunkCount);
  });

  it("propagates Source deletion through Wiki evidence and clears Wiki Core on reset", async () => {
    const harness = createHarness();
    const capture = await harness.request({
      kind: "capturePage",
      payload: pagePayload({ normalizedText: ragText("source delete evidence", 8) }),
    });
    const sourceId = capture.memory.id;
    const chain = await createWikiDependencyChain(
      harness,
      sourceId,
      firstChunkId(harness, sourceId),
    );
    await harness.request({
      kind: "appendWikiUserEdit",
      payload: {
        baseArtifactId: chain.indexId,
        editKind: "patch",
        payload: { title: "Edited index" },
        mergeOutcome: "authored",
      },
    });
    expect(harness.count("wiki_artifact_evidence", "source_id = ?", [sourceId])).toBe(1);

    expect(await harness.request({ kind: "deleteMemory", id: sourceId })).toEqual({
      deleted: true,
      id: sourceId,
    });
    expect(harness.count("wiki_artifact_evidence", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("wiki_artifacts", "freshness = 'stale'")).toBe(3);
    expect(harness.count("sources", "id = ? AND lifecycle_status = 'deleted'", [sourceId])).toBe(1);

    await harness.request({ kind: "repair", action: "reset_library" });
    expect(harness.count("wiki_user_edits")).toBe(0);
    expect(harness.count("wiki_artifact_links")).toBe(0);
    expect(harness.count("wiki_artifact_evidence")).toBe(0);
    expect(harness.count("wiki_artifacts")).toBe(0);
  });
});

type BehaviorHarnessOptions = Omit<LocalEngineOptions, "openDatabase"> & {
  prepareDatabase?: (db: LocalEngineSqliteDb) => void;
};

const testEmbeddingModel = {
  id: "local-transformers:test-fixture:d64",
  provider: "local-transformers",
  label: "Test local embedding",
  dimension: 64,
  metric: "cosine",
} as const;

function createHarness(options: BehaviorHarnessOptions = {}) {
  const { prepareDatabase, ...engineOptions } = options;
  const dbPath = `/local-engine-behavior-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.sqlite3`;
  let db: LocalEngineSqliteDb | undefined;
  const engine = new LocalEngine({
    ...engineOptions,
    embeddingProviderFactory:
      engineOptions.embeddingProviderFactory ??
      ((model) =>
        model.modelId === testEmbeddingModel.id
          ? {
              modelId: model.modelId,
              provider: model.provider,
              dimension: model.dimension,
              async embedTexts(inputs) {
                return inputs.map(testEmbeddingVector);
              },
            }
          : null),
    openDatabase: async () => {
      db = new sqliteApi.oo1.DB({ filename: dbPath, flags: "c" });
      prepareDatabase?.(db);
      return {
        db,
        sqliteVersion: sqliteApi.version.libVersion,
        opfs: "unavailable",
      };
    },
  });
  engines.push(engine);

  return {
    request: <T extends EngineRequest>(request: T) =>
      engine.handle(request) as Promise<EngineResultFor<T>>,
    count(table: string, where?: string, bind: unknown[] = []) {
      if (db === undefined) throw new Error("Test database is not open.");
      const suffix = where === undefined || where.length === 0 ? "" : ` WHERE ${where}`;
      const sql = `SELECT COUNT(*) FROM ${table}${suffix}`;
      return Number((bind.length === 0 ? db.selectValue(sql) : db.selectValue(sql, bind)) ?? 0);
    },
    exec(sql: string, bind: unknown[] = []) {
      if (db === undefined) throw new Error("Test database is not open.");
      db.exec({ sql, bind });
    },
    selectObject(sql: string, bind: unknown[] = []) {
      if (db === undefined) throw new Error("Test database is not open.");
      return db.selectObject(sql, bind);
    },
    selectObjects(sql: string, bind: unknown[] = []) {
      if (db === undefined) throw new Error("Test database is not open.");
      return db.selectObjects(sql, bind);
    },
  };
}

function firstChunkId(harness: ReturnType<typeof createHarness>, sourceId: string) {
  const row = harness.selectObject(
    "SELECT id FROM source_chunks WHERE source_id = ? ORDER BY ord ASC LIMIT 1",
    [sourceId],
  );
  const id = row?.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`Source ${sourceId} has no test chunk.`);
  }
  return id;
}

function wikiSourcePublication(
  sourceId: string,
  chunkId: string,
  inputSignature: string,
): PublishWikiArtifactsPayload {
  return {
    scope: { kind: "source", id: sourceId },
    inputSignature,
    compilerVersion: "compiler-v1",
    promptVersion: "prompt-v1",
    modelId: "main-model",
    freshness: "fresh",
    artifacts: [
      {
        artifactKind: "source_digest",
        artifactKey: "digest:root",
        title: "Source digest",
        content: `Digest compiled from ${inputSignature}.`,
        payload: { signature: inputSignature },
        coverage: { sourceCount: 1 },
      },
      {
        artifactKind: "claim",
        artifactKey: "claim:root",
        title: "Supported claim",
        content: `Claim compiled from ${inputSignature}.`,
        payload: { signature: inputSignature },
        coverage: { sourceCount: 1 },
        evidence: [
          {
            sourceId,
            chunkId,
            pageNo: 1,
            bbox: { x: 0.1, y: 0.2 },
            parserArtifactKind: "paragraph",
            parserArtifactId: "paragraph-1",
            anchor: { quote: "wiki artifact evidence" },
          },
        ],
      },
    ],
    links: [
      {
        from: { artifactKind: "claim", artifactKey: "claim:root" },
        to: { artifactKind: "source_digest", artifactKey: "digest:root" },
        kind: "derived_from",
        createdBy: "compiler",
        creatorVersion: "compiler-v1",
      },
    ],
  };
}

function wikiLibraryPublication(
  inputSignature: string,
  artifactKey: string,
): PublishWikiArtifactsPayload {
  return {
    scope: { kind: "library", id: "default-library" },
    inputSignature,
    compilerVersion: "compiler-v1",
    promptVersion: "prompt-v1",
    artifacts: [
      {
        artifactKind: "topic",
        artifactKey,
        title: "Editable topic",
        content: `Machine content for ${inputSignature}.`,
        payload: { signature: inputSignature },
      },
    ],
  };
}

async function createWikiDependencyChain(
  harness: ReturnType<typeof createHarness>,
  sourceId: string,
  chunkId: string,
) {
  const digest = await harness.request({
    kind: "publishWikiArtifacts",
    payload: {
      scope: { kind: "source", id: sourceId },
      inputSignature: "dependency-digest-v1",
      compilerVersion: "compiler-v1",
      promptVersion: "prompt-v1",
      artifacts: [
        {
          artifactKind: "source_digest",
          artifactKey: "digest:dependency-root",
          title: "Dependency digest",
          content: "Root artifact for dependency propagation.",
        },
      ],
    },
  });
  const digestId = digest.items[0]?.artifact.id ?? "";
  const claim = await harness.request({
    kind: "publishWikiArtifacts",
    payload: {
      scope: { kind: "library", id: "default-library" },
      inputSignature: "dependency-claim-v1",
      compilerVersion: "compiler-v1",
      promptVersion: "prompt-v1",
      artifacts: [
        {
          artifactKind: "claim",
          artifactKey: "claim:dependency-middle",
          title: "Dependency claim",
          content: "Claim backed by the source.",
          evidence: [{ sourceId, chunkId }],
        },
      ],
      links: [
        {
          from: { artifactKind: "claim", artifactKey: "claim:dependency-middle" },
          to: { artifactId: digestId },
          kind: "derived_from",
          createdBy: "compiler",
        },
      ],
    },
  });
  const claimId = claim.items[0]?.artifact.id ?? "";
  const index = await harness.request({
    kind: "publishWikiArtifacts",
    payload: {
      scope: { kind: "library", id: "default-library" },
      inputSignature: "dependency-index-v1",
      compilerVersion: "compiler-v1",
      promptVersion: "prompt-v1",
      artifacts: [
        {
          artifactKind: "index",
          artifactKey: "index:dependency-leaf",
          title: "Dependency index",
          content: "Index derived from the claim.",
        },
      ],
      links: [
        {
          from: { artifactKind: "index", artifactKey: "index:dependency-leaf" },
          to: { artifactId: claimId },
          kind: "contains",
          createdBy: "compiler",
        },
      ],
    },
  });
  return {
    digestId,
    claimId,
    indexId: index.items[0]?.artifact.id ?? "",
  };
}

async function activateTestEmbeddingModel(harness: ReturnType<typeof createHarness>) {
  await harness.request({ kind: "getActiveEmbeddingModel" });
  const now = "2026-07-01T00:00:00.000Z";
  harness.exec("UPDATE embedding_models SET status = 'disabled', updated_at = ?", [now]);
  harness.exec(
    `INSERT INTO embedding_models (
      id,
      provider,
      label,
      dimension,
      metric,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(id) DO UPDATE SET status = 'active', updated_at = excluded.updated_at`,
    [
      testEmbeddingModel.id,
      testEmbeddingModel.provider,
      testEmbeddingModel.label,
      testEmbeddingModel.dimension,
      testEmbeddingModel.metric,
      now,
      now,
    ],
  );
}

function testEmbeddingVector(input: string) {
  const vector = Array.from({ length: testEmbeddingModel.dimension }, () => 0);
  const tokens = input.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [input.toLowerCase()];
  for (const token of tokens) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const bucket = (hash >>> 0) % vector.length;
    vector[bucket] = (vector[bucket] ?? 0) + 1;
  }
  return vector;
}

async function waitForJob(
  harness: ReturnType<typeof createHarness>,
  jobId: string,
  predicate: (job: JobSummary) => boolean,
) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const job = (await harness.request({ kind: "getJobStatus", limit: 100 })).jobs.find(
      (candidate) => candidate.id === jobId,
    );
    if (job !== undefined && predicate(job)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for job ${jobId}.`);
}

function unitVector64(index: number) {
  return Array.from({ length: 64 }, (_, vectorIndex) => (vectorIndex === index ? 1 : 0));
}

function minimalParsedPdf(text: string): ParsedPdfDocument {
  return {
    text,
    pages: [{ pageNumber: 1, text, charStart: 0, charEnd: text.length }],
    paragraphs: [
      {
        text,
        pageNumber: 1,
        charStart: 0,
        charEnd: text.length,
        contentKind: "body",
      },
    ],
    sections: [],
    references: [],
    figures: [],
    tables: [],
    images: [],
    tableStructures: [],
    figureAnalyses: [],
    citationLinks: [],
    pageLabels: [{ pageNumber: 1, label: "Page 1", charStart: 0, charEnd: text.length }],
    parseProfile: {
      parser: "pdfjs",
      parserVersion: "clio-pdf-structure-v3",
      pageCount: 1,
      textHash: hashText(text),
      ocrStatus: "not_required",
      warnings: [],
    },
    parseQuality: {
      version: "clio-pdf-parse-quality-v1",
      status: "needs_review",
      score: 0.61,
      metrics: {
        pageCount: 1,
        textPageCoverage: 1,
        sectionCount: 0,
        referenceCount: 0,
        figureCaptionCount: 0,
        imageArtifactCount: 0,
        tableCaptionCount: 0,
        tableStructureCount: 0,
        tableSemanticCount: 0,
        figureAnalysisQueueCount: 0,
        figureVisionReadyCount: 0,
        citationLinkCount: 0,
        linkedReferenceRatio: null,
      },
      warnings: ["section_outline_unavailable"],
    },
    rawFile: {
      status: "not_persisted",
      reason: "raw_file_persistence_pending",
      byteLength: text.length,
    },
    metadata: {
      title: text,
      pageCount: 1,
      parser: "pdfjs",
      textHash: hashText(text),
    },
  };
}

class MemoryPdfRawFileStore implements PdfRawFileStore {
  readonly writes: PdfRawFileStoreWriteInput[] = [];
  readonly deletedSourceIds: string[] = [];
  readonly files = new Map<string, Uint8Array>();
  clearCount = 0;

  failWrite: boolean;

  constructor(options: { failWrite?: boolean } = {}) {
    this.failWrite = options.failWrite === true;
  }

  async write(input: PdfRawFileStoreWriteInput): Promise<PdfRawFileStoreWriteResult> {
    this.writes.push({
      ...input,
      bytes: new Uint8Array(input.bytes),
    });
    if (this.failWrite) {
      throw new Error("raw store offline");
    }
    this.files.set(input.sourceId, new Uint8Array(input.bytes));
    return {
      storage: "opfs",
      path: `memory://${input.sourceId}.pdf`,
      byteLength: input.bytes.byteLength,
      contentType: "application/pdf",
      persistedAt: "2026-07-01T00:00:00.000Z",
    };
  }

  async read(sourceId: string): Promise<Uint8Array> {
    const bytes = this.files.get(sourceId);
    if (bytes === undefined) throw new Error("raw file missing");
    return new Uint8Array(bytes);
  }

  async delete(sourceId: string): Promise<void> {
    this.deletedSourceIds.push(sourceId);
  }

  async clear(): Promise<void> {
    this.clearCount += 1;
  }
}

function pagePayload(
  input: Partial<CaptureBasePayload> & { normalizedText: string },
): CaptureBasePayload {
  return {
    sourceUrl: input.sourceUrl ?? "https://example.test/rag",
    sourceTitle: input.sourceTitle ?? "Example RAG Source",
    normalizedText: input.normalizedText,
    capturedAt: input.capturedAt ?? "2026-07-01T00:00:00.000Z",
    metadata: input.metadata ?? {
      title: "Example RAG Source",
      abstract: "Local RAG behavior harness sample.",
      source_type: "webpage",
    },
  };
}

function selectionPayload(
  input: Partial<CaptureSelectionPayload> & { normalizedText: string },
): CaptureSelectionPayload {
  return {
    ...pagePayload(input),
    contextBefore: input.contextBefore ?? "Before selected local RAG context.",
    contextAfter: input.contextAfter ?? "After selected local RAG context.",
    xpath: input.xpath ?? "/html/body/main/p[1]",
    textFragment: input.textFragment ?? "text=local-rag",
  };
}

function ragText(seed: string, repeat: number) {
  return Array.from({ length: repeat }, (_, index) => `${seed} chunk ${index}.`).join(" ");
}

type ChunkMetaSemanticRelationForTest = {
  kind?: unknown;
  target?: unknown;
  source?: unknown;
};

type ChunkMetaTierStateForTest = {
  status?: unknown;
  summarySource?: unknown;
  reason?: unknown;
  sectionSummary?: string | null;
  chunkSummary?: string | null;
  semanticRelations?: ChunkMetaSemanticRelationForTest[];
};

type ChunkMetaHeadForTest = {
  tier?: string;
  summarySource?: string;
  selectedTier?: string;
  docContext?: string;
  sectionPath?: string | null;
  sectionSummary?: string | null;
  chunkSummary?: string | null;
  roleHint?: string | null;
  tiers?: Record<string, ChunkMetaTierStateForTest | undefined>;
  semanticRelations?: ChunkMetaSemanticRelationForTest[];
};

function knowledgeBasePrecisionVector(input: string) {
  const normalized = input.toLowerCase();
  if (
    normalized.includes("puritychecker") ||
    normalized.includes("muarf precision fixture") ||
    normalized.includes("classify hidden mutation risks")
  ) {
    return [1, 0, 0];
  }
  const noiseIndex = Number(normalized.match(/noise source (\d+)/)?.[1] ?? 9);
  const cosine = Math.max(0.1, 0.82 - noiseIndex * 0.01);
  return [cosine, Math.sqrt(1 - cosine * cosine), 0];
}

function crossTrackSemanticVector(input: string) {
  const normalized = input.toLowerCase();
  if (normalized.includes("cross-track query")) return [1, 0, 0];
  const chunkIndex = Number(normalized.match(/chunk-signal-(\d+)/)?.[1]);
  if (Number.isFinite(chunkIndex)) {
    const cosine = 0.79 + Math.min(11, chunkIndex) * 0.01;
    return [cosine, Math.sqrt(1 - cosine * cosine), 0];
  }
  const metaIndex = Number(normalized.match(/meta-signal-(\d+)/)?.[1]);
  if (Number.isFinite(metaIndex)) {
    const cosine = 0.9 - Math.min(11, metaIndex) * 0.01;
    return [cosine, Math.sqrt(1 - cosine * cosine), 0];
  }
  return [0, 1, 0];
}

function remoteEmbeddingVector(input: string) {
  const normalized = input.toLowerCase();
  return [
    normalized.includes("remote") ? 1 : 0,
    normalized.includes("semantic") ? 1 : 0,
    normalized.includes("bridge") ? 1 : 0,
  ];
}

function embeddingModelDescriptor(
  id: string,
  provider: EmbeddingReindexModelDescriptor["provider"] = "local-transformers",
): EmbeddingReindexModelDescriptor {
  return {
    id,
    provider,
    label: "Remote test embeddings",
    dimension: 3,
    metric: "cosine",
  };
}

function trackStatus(result: RetrieveSourcesResult, name: string) {
  return result.trace.tracks.find((track) => track.name === name)?.status;
}

function trackReason(result: RetrieveSourcesResult, name: string) {
  return result.trace.tracks.find((track) => track.name === name)?.reason;
}
