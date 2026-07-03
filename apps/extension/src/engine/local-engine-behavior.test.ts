import type {
  CaptureBasePayload,
  CaptureSelectionPayload,
  EngineRequest,
  EngineResultFor,
  RetrieveSourcesResult,
} from "@/src/shared/rpc";
import { hashText } from "@/src/shared/text";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  LocalEngine,
  type LocalEngineSqliteApi,
  type LocalEngineSqliteDb,
} from "./local-engine.worker";

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
    expect(String(finishedJob?.result_json ?? "")).toContain("explicit_build_required");

    expect(harness.count("graph_nodes")).toBe(0);
    expect(harness.count("graph_edges")).toBe(0);

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
      docContext?: string;
      source?: { title?: string; type?: string; abstract?: string | null };
      chunkSummary?: string | null;
      roleHint?: string | null;
      relations?: unknown[];
    };
    expect(metaHead.version).toBe(1);
    expect(metaHead.tier).toBe("tier0");
    expect(metaHead.docContext).toContain("Alpha Metadata Retrieval");
    expect(metaHead.docContext).toContain(
      "Alpha metadata connects source-level search with bounded evidence windows.",
    );
    expect(metaHead.source?.type).toBe("research-note");
    expect(metaHead.chunkSummary).toBeNull();
    expect(metaHead.roleHint).toBeNull();
    expect(metaHead.relations).toEqual([]);

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
    const prefixedEmbeddingInput = `${metaHead.docContext}\n\n${String(firstChunk?.text ?? "")}`;
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

  it("falls back to raw chunk text when chunk meta head is missing or malformed", async () => {
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
    };
    expect(metaHead.docContext).toContain("Malformed Meta Head");
    expect(metaHead.source?.abstract).toBeNull();

    harness.exec("UPDATE source_chunks SET meta_head_json = ? WHERE id = ?", [
      "{not valid json",
      String(chunk?.id ?? ""),
    ]);
    const queued = await harness.request({ kind: "getJobStatus", status: "queued" });
    await harness.request({ kind: "runJob", id: queued.jobs[0]?.id ?? "" });

    const embedding = harness.selectObject(
      "SELECT text_hash FROM source_embeddings WHERE source_id = ? AND target_kind = 'chunk' ORDER BY target_id ASC LIMIT 1",
      [sourceId],
    );
    expect(embedding?.text_hash).toBe(hashText(String(chunk?.text ?? "")));
    expect(embedding?.text_hash).toBe(chunk?.hash);
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
    expect(harness.count("source_working_set", "source_id = ?", [sourceId])).toBe(1);

    const deleted = await harness.request({ kind: "deleteMemory", id: sourceId });
    expect(deleted.deleted).toBe(true);
    expect(harness.count("source_chunks", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_fts", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_metadata_fts", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("keyword_index_sources", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_embeddings", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_working_set", "source_id = ?", [sourceId])).toBe(0);
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
    expect(harness.count("sources", "lifecycle_status <> 'deleted'")).toBe(1);
    expect(harness.count("source_working_set")).toBe(1);

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
    const sourceText = `${ragText("alpha context pack anchor evidence", 700)} ${hiddenTailNeedle}`;
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
    expect(tightPack.groups[0]?.windows).toEqual([]);
    expect(tightPack.compressionLog.map((entry) => entry.reason)).toEqual(
      expect.arrayContaining(["chunk_window_omitted", "source_downgraded"]),
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
    expect(degraded.memory.sourceTitle).toBe("Malformed Arxiv Metadata");
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

function createHarness() {
  const dbPath = `/local-engine-behavior-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.sqlite3`;
  let db: LocalEngineSqliteDb | undefined;
  const engine = new LocalEngine({
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
  };
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

function trackStatus(result: RetrieveSourcesResult, name: string) {
  return result.trace.tracks.find((track) => track.name === name)?.status;
}

function trackReason(result: RetrieveSourcesResult, name: string) {
  return result.trace.tracks.find((track) => track.name === name)?.reason;
}
