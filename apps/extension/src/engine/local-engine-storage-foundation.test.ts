import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workerSource = readFileSync(
  fileURLToPath(new URL("./local-engine.worker.ts", import.meta.url)),
  "utf8",
);

describe("local engine storage foundation", () => {
  it("defines the source substrate without changing the public job surface", () => {
    expect(workerSource).toContain("const schemaVersion = 11");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS sources");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_metadata");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_lifecycle_events");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_audit_log");
    expect(workerSource).toContain('ensureColumn(db, "memories", "source_id"');
    expect(workerSource).toContain('ensureColumn(db, "chunks", "source_id"');
    expect(workerSource).toContain('ensureColumn(\n    db,\n    "chunks",\n    "role"');
    expect(workerSource).not.toContain('"ingest_embedding"');
    expect(workerSource).not.toContain('"ingest_chunk_meta"');
    expect(workerSource).not.toContain('"ingest_graph"');
  });

  it("backfills legacy memories into sources and chunk bridges idempotently", () => {
    expect(workerSource).toContain("function backfillSources(db: SqliteDb)");
    expect(workerSource).toContain("WHERE source_id IS NULL OR source_id = ''");
    expect(workerSource).toContain("SELECT id FROM sources WHERE legacy_memory_id = ? LIMIT 1");
    expect(workerSource).toContain("UPDATE memories SET source_id = ? WHERE id = ?");
    expect(workerSource).toContain("UPDATE chunks SET source_id = ? WHERE memory_id = ?");
    expect(workerSource).toContain("function backfillSourceVersionLinks(db: SqliteDb)");
  });

  it("writes source, compatibility memory, chunks, FTS, lifecycle, audit, and queued stages in capture", () => {
    expect(workerSource).toContain("const draft = buildDocumentDraft(kind, payload)");
    expect(workerSource).toContain("INSERT INTO memories (");
    expect(workerSource).toContain("insertSourceRow(db, {");
    expect(workerSource).toContain("INSERT INTO chunks (");
    expect(workerSource).toContain("source_id,");
    expect(workerSource).toContain("insertFtsRow(db, {");
    expect(workerSource).toContain("insertSourceLifecycleEvent(db, {");
    expect(workerSource).toContain("insertSourceAuditLog(db, {");
    expect(workerSource).toContain('enqueueJob(db, "post_capture_hardening"');
    expect(workerSource).toContain('stages: ["embedding", "chunk_meta", "graph"]');
  });

  it("keeps lifecycle and audit bounded during delete and reset", () => {
    expect(workerSource).toContain("function markSourceDeleted(");
    expect(workerSource).toContain("lifecycle_status = 'deleted'");
    expect(workerSource).toContain('action: "source.deleted"');
    expect(workerSource).toContain("DELETE FROM source_audit_log");
    expect(workerSource).toContain("DELETE FROM source_lifecycle_events");
    expect(workerSource).toContain("DELETE FROM source_metadata");
    expect(workerSource).toContain("DELETE FROM sources");
    expect(workerSource).toContain("function boundAuditPayload(payload: Record<string, unknown>)");
  });
});
