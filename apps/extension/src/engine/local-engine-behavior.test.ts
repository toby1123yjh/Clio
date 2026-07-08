import type { FigureVisionAnalysisInput } from "@/src/agent-runtime/figure-vision-analyzer";
import type {
  CaptureBasePayload,
  CaptureSelectionPayload,
  EmbeddingReindexModelDescriptor,
  EngineRequest,
  EngineResultFor,
  RetrieveSourcesResult,
} from "@/src/shared/rpc";
import { hashText } from "@/src/shared/text";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
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

  it("runs capture, post-capture embedding, retrieval, and evidence windows", async () => {
    const harness = createHarness();
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
    expect(metaHead.roleHint).toBe("child");
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
    const prefixedEmbeddingInput = chunkMetaEmbeddingInputForTest(
      repairedMetaHead,
      String(repairedFirstChunk?.text ?? ""),
    );
    expect(chunkEmbedding?.text_hash).toBe(hashText(prefixedEmbeddingInput));
    expect(chunkEmbedding?.text_hash).not.toBe(firstChunk?.hash);

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

  it("materializes section-aware chunk meta and repairs it before embedding", async () => {
    const harness = createHarness();
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
    expect(capturedMetaHead.roleHint).toBe("child");
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
    expect(repairedMetaHead.roleHint).toBe("child");
    expect(repairedMetaHead.relations?.some((relation) => relation.kind === "parent")).toBe(true);
    expect(repairedMetaHead.semanticRelations?.some((relation) => relation.kind === "parent")).toBe(
      true,
    );

    const embedding = harness.selectObject(
      "SELECT text_hash FROM source_embeddings WHERE target_id = ? AND target_kind = 'chunk' LIMIT 1",
      [String(sectionChunk?.id ?? "")],
    );
    expect(embedding?.text_hash).toBe(
      hashText(chunkMetaEmbeddingInputForTest(repairedMetaHead, String(repairedChunk?.text ?? ""))),
    );
    expect(embedding?.text_hash).not.toBe(repairedChunk?.hash);
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

  it("uses a remote active embedding factory for jobs and vector retrieval", async () => {
    const remoteModel: ActiveEmbeddingModel = {
      modelId: "openai:remote-test:semantic-bridge:d3",
      provider: "openai",
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
    expect(
      harness.count("source_embeddings", "source_id = ? AND model_id = 'clio-local-hash-v1'", [
        sourceId,
      ]),
    ).toBe(0);

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

    const initialModel = await harness.request({ kind: "getActiveEmbeddingModel" });
    expect(initialModel).toMatchObject({
      id: "clio-local-hash-v1",
      provider: "local-deterministic",
      dimension: 64,
      metric: "cosine",
      status: "active",
    });
    expect(initialModel).not.toHaveProperty("apiKey");

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
    expect(
      harness.count("embedding_models", "id = 'clio-local-hash-v1' AND status = 'disabled'"),
    ).toBe(1);
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
    expect(
      harness.count("source_embeddings", "source_id = ? AND model_id = 'clio-local-hash-v1'", [
        active.memory.id,
      ]),
    ).toBeGreaterThan(0);
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
    expect(
      harness.count("embedding_models", "id = 'clio-local-hash-v1' AND status = 'active'"),
    ).toBe(1);
    expect(
      harness.count("embedding_models", "id = ? AND status = 'disabled'", [remoteModel.id]),
    ).toBe(1);
    expect(await harness.request({ kind: "getActiveEmbeddingModel" })).toMatchObject({
      id: "clio-local-hash-v1",
      provider: "local-deterministic",
      status: "active",
    });
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

  it("repairs malformed chunk meta heads before post-capture embedding", async () => {
    const harness = createHarness();
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
    expect(metaHead.roleHint).toBe("child");

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
    expect(repairedMetaHead.roleHint).toBe("child");
    expect(repairedMetaHead.semanticRelations?.some((relation) => relation.kind === "role")).toBe(
      true,
    );

    const embedding = harness.selectObject(
      "SELECT text_hash FROM source_embeddings WHERE source_id = ? AND target_kind = 'chunk' ORDER BY target_id ASC LIMIT 1",
      [sourceId],
    );
    expect(embedding?.text_hash).toBe(
      hashText(chunkMetaEmbeddingInputForTest(repairedMetaHead, String(repairedChunk?.text ?? ""))),
    );
    expect(embedding?.text_hash).not.toBe(repairedChunk?.hash);
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
    expect(harness.count("source_working_set", "source_id = ?", [sourceId])).toBe(1);
    expect(harness.count("source_context_compression_logs", "source_id = ?", [sourceId])).toBe(1);

    const deleted = await harness.request({ kind: "deleteMemory", id: sourceId });
    expect(deleted.deleted).toBe(true);
    expect(harness.count("source_chunks", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_fts", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_metadata_fts", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("keyword_index_sources", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_embeddings", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_working_set", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_context_compression_logs", "source_id = ?", [sourceId])).toBe(0);
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
    expect(harness.count("sources", "lifecycle_status <> 'deleted'")).toBe(1);
    expect(harness.count("source_working_set")).toBe(1);
    expect(harness.count("source_context_compression_logs")).toBe(1);

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

    const filtered = await harness.request({
      kind: "retrieveSources",
      payload: { query: "", limit: 10, filter: { sourceTypes: ["webpage"] } },
    });
    expect(filtered.items.map((item) => item.id)).toEqual([second.memory.id]);
  });

  it("uses metadata FTS and applies source filters across retrieval tracks", async () => {
    const harness = createHarness();
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
        parserVersion: "clio-pdf-structure-v2",
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
    const parserInputs: Array<Uint8Array | ArrayBuffer> = [];
    const pdfRawFileStore = new MemoryPdfRawFileStore();
    const harness = createHarness({
      pdfRawFileStore,
      pdfParser: async (bytes) => {
        parserInputs.push(bytes);
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

    expect(parserInputs).toHaveLength(1);
    expect(parserInputs[0]).toBeInstanceOf(Uint8Array);
    expect(Array.from(parserInputs[0] as Uint8Array)).toEqual([1, 2, 3]);
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
      parserVersion: "clio-pdf-structure-v2",
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
        parserVersion: "clio-pdf-structure-v2",
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

  it("keeps PDF capture saved when raw file persistence fails", async () => {
    const text = "Uploaded PDF remains searchable when raw file persistence fails.";
    const parsed: ParsedPdfDocument = {
      text,
      pages: [{ pageNumber: 1, text, charStart: 0, charEnd: text.length }],
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
        parserVersion: "clio-pdf-structure-v2",
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
});

function createHarness(options: Omit<LocalEngineOptions, "openDatabase"> = {}) {
  const dbPath = `/local-engine-behavior-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.sqlite3`;
  let db: LocalEngineSqliteDb | undefined;
  const engine = new LocalEngine({
    ...options,
    openDatabase: async () => {
      db = new sqliteApi.oo1.DB({ filename: dbPath, flags: "c" });
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

class MemoryPdfRawFileStore implements PdfRawFileStore {
  readonly writes: PdfRawFileStoreWriteInput[] = [];
  readonly deletedSourceIds: string[] = [];
  readonly files = new Map<string, Uint8Array>();
  clearCount = 0;

  constructor(private readonly options: { failWrite?: boolean } = {}) {}

  async write(input: PdfRawFileStoreWriteInput): Promise<PdfRawFileStoreWriteResult> {
    this.writes.push({
      ...input,
      bytes: new Uint8Array(input.bytes),
    });
    if (this.options.failWrite === true) {
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

function chunkMetaEmbeddingInputForTest(metaHead: ChunkMetaHeadForTest, text: string) {
  const selectedTierState = selectedChunkMetaTierStateForTest(metaHead);
  const sectionSummary =
    stringFieldForTest(selectedTierState?.sectionSummary) ?? metaHead.sectionSummary;
  const chunkSummary = stringFieldForTest(selectedTierState?.chunkSummary) ?? metaHead.chunkSummary;
  const relationHints = chunkMetaRelationHintsForTest(metaHead, selectedTierState);
  const prefix = [
    metaHead.docContext ?? "",
    metaHead.sectionPath === null || metaHead.sectionPath === undefined
      ? ""
      : `Section: ${metaHead.sectionPath}`,
    sectionSummary === null || sectionSummary === undefined
      ? ""
      : `Section summary: ${sectionSummary}`,
    chunkSummary === null || chunkSummary === undefined ? "" : `Chunk summary: ${chunkSummary}`,
    metaHead.roleHint === null || metaHead.roleHint === undefined
      ? ""
      : `Role: ${metaHead.roleHint}`,
    relationHints.length === 0 ? "" : `Relations: ${relationHints.join("; ")}`,
  ]
    .filter((part) => part.length > 0)
    .join("\n");
  const normalizedPrefix = boundedNormalizedTextForTest(prefix, 2_000);
  return normalizedPrefix.length === 0 ? text : `${normalizedPrefix}\n\n${text}`;
}

function selectedChunkMetaTierStateForTest(
  metaHead: ChunkMetaHeadForTest,
): ChunkMetaTierStateForTest | undefined {
  const tiers = metaHead.tiers;
  if (tiers === undefined) return undefined;
  const selectedTier = metaHead.selectedTier ?? metaHead.tier;
  const preferred = selectedTier === undefined ? undefined : tiers[selectedTier];
  if (preferred?.status === "available") return preferred;
  if (tiers.tier1?.status === "available") return tiers.tier1;
  return tiers.tier0;
}

function chunkMetaRelationHintsForTest(
  metaHead: ChunkMetaHeadForTest,
  selectedTierState: ChunkMetaTierStateForTest | undefined,
) {
  const relations = selectedTierState?.semanticRelations ?? metaHead.semanticRelations ?? [];
  return relations
    .flatMap((relation): string[] => {
      const kind = typeof relation.kind === "string" ? normalizeTextForTest(relation.kind) : "";
      const target =
        typeof relation.target === "string" ? normalizeTextForTest(relation.target) : "";
      if (kind.length === 0 || target.length === 0) return [];
      return [`${kind}:${target}`];
    })
    .slice(0, 6);
}

function stringFieldForTest(input: unknown): string | null | undefined {
  if (input === null || input === undefined) return input;
  return typeof input === "string" ? input : undefined;
}

function boundedNormalizedTextForTest(input: string, maxLength: number) {
  const normalized = normalizeTextForTest(input);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function normalizeTextForTest(input: string) {
  return input
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function remoteEmbeddingVector(input: string) {
  const normalized = input.toLowerCase();
  return [
    normalized.includes("remote") ? 1 : 0,
    normalized.includes("semantic") ? 1 : 0,
    normalized.includes("bridge") ? 1 : 0,
  ];
}

function embeddingModelDescriptor(id: string): EmbeddingReindexModelDescriptor {
  return {
    id,
    provider: "openai",
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
