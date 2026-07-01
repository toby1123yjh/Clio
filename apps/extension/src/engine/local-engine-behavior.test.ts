import type {
  CaptureBasePayload,
  CaptureSelectionPayload,
  EngineRequest,
  EngineResultFor,
  RetrieveSourcesResult,
} from "@/src/shared/rpc";
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
    expect(harness.count("source_embeddings", "source_id = ?", [sourceId])).toBeGreaterThan(0);
    expect(harness.count("source_metadata", "source_id = ?", [sourceId])).toBe(1);
    expect(harness.count("anchors", "memory_id = ?", [sourceId])).toBe(1);

    const deleted = await harness.request({ kind: "deleteMemory", id: sourceId });
    expect(deleted.deleted).toBe(true);
    expect(harness.count("source_chunks", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_fts", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_metadata_fts", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_embeddings", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("source_metadata", "source_id = ?", [sourceId])).toBe(0);
    expect(harness.count("anchors", "memory_id = ?", [sourceId])).toBe(0);

    const retrievalAfterDelete = await harness.request({
      kind: "retrieveSources",
      payload: { query: "cleanup", limit: 5 },
    });
    expect(retrievalAfterDelete.items.map((item) => item.id)).not.toContain(sourceId);

    await harness.request({
      kind: "capturePage",
      payload: pagePayload({
        sourceUrl: "https://example.test/reset",
        normalizedText: ragText("reset library rows", 8),
      }),
    });
    expect(harness.count("sources", "lifecycle_status <> 'deleted'")).toBe(1);

    const reset = await harness.request({ kind: "repair", action: "reset_library" });
    expect(reset.action).toBe("reset_library");
    expect(harness.count("sources")).toBe(0);
    expect(harness.count("source_chunks")).toBe(0);
    expect(harness.count("source_fts")).toBe(0);
    expect(harness.count("source_metadata_fts")).toBe(0);
    expect(harness.count("source_embeddings")).toBe(0);
    expect(harness.count("source_metadata")).toBe(0);
    expect(harness.count("anchors")).toBe(0);
    expect(harness.count("jobs")).toBe(0);
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
