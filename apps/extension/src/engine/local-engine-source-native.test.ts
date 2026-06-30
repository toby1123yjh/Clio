import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workerSource = readFileSync(
  fileURLToPath(new URL("./local-engine.worker.ts", import.meta.url)),
  "utf8",
);

describe("local engine source-native storage foundation", () => {
  it("defines source-native storage and drops the legacy memory substrate", () => {
    expect(workerSource).toContain("const schemaVersion = 12");
    expect(workerSource).toContain("const sourceNativeSchemaVersion = 12");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS sources");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_metadata");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_chunks");
    expect(workerSource).toContain("CREATE VIRTUAL TABLE IF NOT EXISTS source_fts");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_lifecycle_events");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_audit_log");
    expect(workerSource).toContain("function dropPreSourceNativeTables(db: SqliteDb)");
    expect(workerSource).toContain("currentVersion < sourceNativeSchemaVersion");
    expect(workerSource).toContain("DROP TABLE IF EXISTS topic_pages");
    expect(workerSource).toContain("DROP TABLE IF EXISTS wiki_compile_jobs");
    expect(workerSource).toContain("DROP TABLE IF EXISTS memory_fts");
    expect(workerSource).toContain("DROP TABLE IF EXISTS chunks");
    expect(workerSource).toContain("DROP TABLE IF EXISTS memories");
    expect(workerSource).not.toContain("CREATE TABLE IF NOT EXISTS memories");
    expect(workerSource).not.toContain("CREATE TABLE IF NOT EXISTS chunks");
    expect(workerSource).not.toContain("CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts");
    expect(workerSource).not.toContain('ensureColumn(db, "memories"');
    expect(workerSource).not.toContain('ensureColumn(db, "chunks"');
  });

  it("keeps public memory RPC as a facade over source ids", () => {
    expect(workerSource).toContain("SELECT *\n       FROM sources");
    expect(workerSource).toContain("FROM source_fts");
    expect(workerSource).toContain("JOIN sources s ON s.id = source_fts.source_id");
    expect(workerSource).toContain("JOIN source_chunks c ON c.id = source_fts.chunk_id");
    expect(workerSource).toContain("MemorySummary");
    expect(workerSource).toContain("supersedesMemoryId: supersedesSourceId");
  });

  it("queues bounded post-capture work and does not add public ingest job types", () => {
    expect(workerSource).toContain('enqueueJob(db, "post_capture_hardening"');
    expect(workerSource).toContain('stages: ["embedding", "chunk_meta", "graph"]');
    expect(workerSource).toContain("function boundAuditPayload(payload: Record<string, unknown>)");
    expect(workerSource).not.toContain('"ingest_embedding"');
    expect(workerSource).not.toContain('"ingest_chunk_meta"');
    expect(workerSource).not.toContain('"ingest_graph"');
  });

  it("loads prompt evidence through bounded source chunk windows", () => {
    expect(workerSource).toContain('case "getMemoryEvidenceWindows"');
    expect(workerSource).toContain("private async getMemoryEvidenceWindows");
    expect(workerSource).toContain("FROM source_fts");
    expect(workerSource).toContain("JOIN source_chunks c ON c.id = source_fts.chunk_id");
    expect(workerSource).toContain("function loadSourceEvidenceWindow");
    expect(workerSource).toContain("FROM source_chunks");
    expect(workerSource).toContain("ord BETWEEN ? AND ?");

    const evidenceWindowSection = workerSource.slice(
      workerSource.indexOf("private async getMemoryEvidenceWindows"),
      workerSource.indexOf("private async delete"),
    );
    expect(evidenceWindowSection).not.toContain("normalized_text");
    const loaderSection = workerSource.slice(
      workerSource.indexOf("function loadSourceEvidenceWindow"),
      workerSource.indexOf("function optionalAnchorFromRow"),
    );
    expect(loaderSection).not.toContain("normalized_text");
  });

  it("exposes source-native retrieval with RRF fusion and truthful vector trace", () => {
    expect(workerSource).toContain('case "retrieveSources"');
    expect(workerSource).toContain("private async retrieveSources");
    expect(workerSource).toContain("function loadFtsChunkRetrievalHits");
    expect(workerSource).toContain("function fuseSourceRetrievalHits");
    expect(workerSource).toContain("function reciprocalRankFusionScore");
    expect(workerSource).toContain("const defaultRrfK = 60");
    expect(workerSource).toContain("FROM source_fts");
    expect(workerSource).toContain("JOIN sources s ON s.id = source_fts.source_id");
    expect(workerSource).toContain("JOIN source_chunks c ON c.id = source_fts.chunk_id");
    expect(workerSource).toContain('name: "vector_chunks"');
    expect(workerSource).toContain('status: "unavailable"');
    expect(workerSource).toContain("embedding_index_not_available");

    const retrieveSection = workerSource.slice(
      workerSource.indexOf("private async retrieveSources"),
      workerSource.indexOf("private async search"),
    );
    expect(retrieveSection).not.toContain("normalized_text");
    const ftsRetrievalSection = workerSource.slice(
      workerSource.indexOf("function loadFtsChunkRetrievalHits"),
      workerSource.indexOf("function fuseSourceRetrievalHits"),
    );
    expect(ftsRetrievalSection).not.toContain("normalized_text");
  });
});
