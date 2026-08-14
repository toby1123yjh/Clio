import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workerSource = readFileSync(
  fileURLToPath(new URL("./local-engine.worker.ts", import.meta.url)),
  "utf8",
);
const rpcSource = readFileSync(fileURLToPath(new URL("../shared/rpc.ts", import.meta.url)), "utf8");

function sourceSection(start: string, end: string) {
  const startIndex = workerSource.indexOf(start);
  const endIndex = workerSource.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return workerSource.slice(startIndex, endIndex);
}

describe("local engine source-native storage foundation", () => {
  it("defines source-native storage and drops the legacy memory substrate", () => {
    expect(workerSource).toContain("const schemaVersion = 24");
    expect(workerSource).toContain("const sourceNativeSchemaVersion = 12");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS sources");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_metadata");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_chunks");
    expect(workerSource).toContain("role TEXT NOT NULL DEFAULT 'child'");
    expect(workerSource).toContain("parent_chunk_id TEXT REFERENCES source_chunks(id)");
    expect(workerSource).toContain("section_path TEXT");
    expect(workerSource).toContain("char_start INTEGER");
    expect(workerSource).toContain("char_end INTEGER");
    expect(workerSource).toContain("page_start INTEGER");
    expect(workerSource).toContain("page_end INTEGER");
    expect(workerSource).toContain('ensureColumn(db, "source_chunks", "page_start", "INTEGER")');
    expect(workerSource).toContain('ensureColumn(db, "source_chunks", "page_end", "INTEGER")');
    expect(workerSource).toContain("meta_head_json TEXT");
    expect(workerSource).toContain("CREATE VIRTUAL TABLE IF NOT EXISTS source_fts");
    expect(workerSource).toContain("CREATE VIRTUAL TABLE IF NOT EXISTS source_metadata_fts");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_working_set");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS keyword_index");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS keyword_index_sources");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS chunk_meta_tier2_audit");
    expect(workerSource).toContain("load_depth TEXT NOT NULL CHECK");
    expect(workerSource).toContain("pin_status TEXT NOT NULL CHECK");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_lifecycle_events");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_audit_log");
    expect(workerSource).toContain("function dropPreSourceNativeTables(db: SqliteDb)");
    expect(workerSource).toContain("currentVersion < sourceNativeSchemaVersion");
    expect(workerSource).toContain("DROP TABLE IF EXISTS source_working_set");
    expect(workerSource).toContain("DROP TABLE IF EXISTS keyword_index_sources");
    expect(workerSource).toContain("DROP TABLE IF EXISTS keyword_index");
    expect(workerSource).toContain("DROP TABLE IF EXISTS source_metadata_fts");
    expect(workerSource).toContain("DROP TABLE IF EXISTS memory_fts");
    expect(workerSource).toContain("DROP TABLE IF EXISTS chunks");
    expect(workerSource).toContain("DROP TABLE IF EXISTS memories");
    expect(workerSource).not.toContain("CREATE TABLE IF NOT EXISTS memories");
    expect(workerSource).not.toContain("CREATE TABLE IF NOT EXISTS chunks");
    expect(workerSource).not.toContain("CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts");
    expect(workerSource).not.toContain('ensureColumn(db, "memories"');
    expect(workerSource).not.toContain('ensureColumn(db, "chunks"');
  });

  it("defines the isolated Wiki Artifact Core schema and RPC surface", () => {
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS wiki_artifacts");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS wiki_artifact_evidence");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS wiki_artifact_links");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS wiki_user_edits");
    expect(workerSource).toContain(
      "UNIQUE (scope_kind, scope_id, artifact_kind, artifact_key, version_no)",
    );
    expect(workerSource).toContain(
      "UNIQUE (scope_kind, scope_id, artifact_kind, artifact_key, input_signature)",
    );
    expect(workerSource).toContain("idx_wiki_artifacts_scope_current");
    expect(workerSource).toContain("idx_wiki_artifacts_input_signature");
    expect(workerSource).toContain("idx_wiki_artifact_evidence_source");
    expect(workerSource).toContain("idx_wiki_artifact_evidence_chunk");
    expect(workerSource).toContain("idx_wiki_artifact_links_from");
    expect(workerSource).toContain("idx_wiki_artifact_links_to");
    expect(workerSource).toContain("idx_wiki_user_edits_base");
    expect(workerSource).toContain("idx_wiki_user_edits_candidate");

    const handleSection = sourceSection("async handle", "private async health");
    expect(handleSection).toContain('case "publishWikiArtifacts"');
    expect(handleSection).toContain('case "listWikiArtifacts"');
    expect(handleSection).toContain('case "listWikiArtifactsForSource"');
    expect(handleSection).toContain('case "getWikiArtifact"');
    expect(handleSection).toContain('case "appendWikiUserEdit"');
    expect(handleSection).toContain('case "listWikiUserEdits"');
    expect(handleSection).toContain('case "deleteWikiArtifact"');

    const resetSection = sourceSection("private async resetLibrary", "private async ensureReady");
    expect(resetSection).toContain('db.exec("DELETE FROM wiki_user_edits")');
    expect(resetSection).toContain('db.exec("DELETE FROM wiki_artifact_links")');
    expect(resetSection).toContain('db.exec("DELETE FROM wiki_artifact_evidence")');
    expect(resetSection).toContain('db.exec("DELETE FROM wiki_artifacts")');

    const retrievalSection = sourceSection(
      "private async retrieveSources",
      "private async searchKnowledgeBase",
    );
    expect(retrievalSection).not.toContain("wiki_artifacts");
    expect(retrievalSection).not.toContain("wiki_artifact_evidence");
    expect(retrievalSection).not.toContain("wiki_artifact_links");
    expect(retrievalSection).not.toContain("wiki_user_edits");
  });

  it("defines the explicit source graph substrate without reusing wiki graph rows", () => {
    expect(workerSource).toContain('case "buildSourceGraph"');
    expect(workerSource).toContain('case "queryGraphNeighbors"');
    expect(workerSource).toContain('case "queryGraphSubgraph"');
    expect(workerSource).toContain('case "queryGraphPath"');
    expect(workerSource).toContain('case "queryGraphTimeline"');
    expect(workerSource).toContain("private async buildSourceGraph");
    expect(workerSource).toContain("private async queryGraphNeighbors");
    expect(workerSource).toContain("private async queryGraphSubgraph");
    expect(workerSource).toContain("private async queryGraphPath");
    expect(workerSource).toContain("private async queryGraphTimeline");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS graph_nodes");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS graph_edges");
    expect(workerSource).toContain(
      "kind IN ('source', 'person', 'venue', 'domain', 'problem', 'method', 'dataset', 'metric')",
    );
    expect(workerSource).toContain(
      "CHECK (dimension IN ('metadata', 'citation', 'domain', 'technical'))",
    );
    expect(workerSource).toContain("CHECK (created_by IN ('adapter', 'graph_builder', 'user'))");
    expect(workerSource).toContain("REFERENCES sources(id) ON DELETE CASCADE");
    expect(workerSource).toContain("idx_graph_nodes_kind_canonical");
    expect(workerSource).toContain("idx_graph_nodes_kind_ref");
    expect(workerSource).toContain("idx_graph_edges_source_dimension");
    expect(workerSource).toContain("idx_graph_edges_target_dimension");
    expect(workerSource).toContain("idx_graph_edges_evidence_source");
    expect(workerSource).toContain("function buildDeterministicGraphForSource");
    expect(workerSource).toContain("function queryGraphNeighbors");
    expect(workerSource).toContain("function queryGraphSubgraph");
    expect(workerSource).toContain("function queryGraphPath");
    expect(workerSource).toContain("function queryGraphTimeline");
    expect(workerSource).not.toContain(
      "INSERT INTO topic_graph_edges (\n            id,\n            from_topic_id",
    );
  });

  it("defines the local embedding substrate without a synthetic default model", () => {
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS embedding_models");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_embeddings");
    expect(workerSource).toContain("PRIMARY KEY (model_id, target_kind, target_id)");
    expect(workerSource).toContain(
      "CREATE INDEX IF NOT EXISTS idx_embedding_models_status ON embedding_models(status)",
    );
    expect(workerSource).toContain(
      "CREATE INDEX IF NOT EXISTS idx_source_embeddings_source ON source_embeddings(source_id)",
    );
    expect(workerSource).toContain(
      "CREATE INDEX IF NOT EXISTS idx_source_embeddings_target ON source_embeddings(target_kind, target_id)",
    );
    expect(workerSource).not.toContain('modelId: "clio-local-hash-v1"');
    expect(workerSource).not.toContain("function embedLocalDeterministic");
    expect(workerSource).toContain(
      "function removeLegacyDeterministicEmbeddingModel(db: SqliteDb)",
    );
    expect(workerSource).toContain(
      "DELETE FROM embedding_models WHERE provider = 'local-deterministic'",
    );
    expect(workerSource).toContain("function disableUnsupportedEmbeddingModels(db: SqliteDb)");
    expect(workerSource).toContain("provider <> 'local-transformers'");
    expect(workerSource.indexOf("removeLegacyDeterministicEmbeddingModel(db)")).toBeLessThan(
      workerSource.indexOf("disableUnsupportedEmbeddingModels(db)"),
    );
    expect(workerSource).not.toContain("function ensureDefaultEmbeddingModel(db: SqliteDb)");
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
    expect(rpcSource).toContain("export type PostCaptureStageName =");
    expect(workerSource).toContain("type PostCaptureStageName,");
    expect(workerSource).toContain('"paper_metadata"');
    expect(workerSource).toContain('"figure_vision"');
    expect(workerSource).toContain("function boundAuditPayload(payload: Record<string, unknown>)");
    expect(workerSource).toContain("function runPostCaptureHardeningJob");
    expect(workerSource).toContain("function runPaperMetadataStageForSource");
    expect(workerSource).toContain("function runChunkMetaStageForSource");
    expect(workerSource).toContain("function runPdfFigureVisionStageForSource");
    expect(workerSource).toContain("function runEmbeddingStageForSource");
    expect(workerSource).toContain("async function runSourceGraphBuildForSource");
    expect(workerSource).toContain("function buildCitationGraphForSource");
    expect(workerSource).toContain("function buildLlmGraphContribution");
    expect(workerSource).toContain("pdfFigureVisionImageExtractor");
    expect(workerSource).toContain("CLIO_WORKER_VISION_ANALYSIS_REQUEST");
    expect(workerSource).toContain("isWorkerVisionAnalysisResponseMessage");
    expect(workerSource).toContain("CLIO_WORKER_GRAPH_EXTRACTION_REQUEST");
    expect(workerSource).toContain("isWorkerGraphExtractionResponseMessage");
    expect(workerSource).toContain("pdf_figure_analysis_results");
    expect(workerSource).toContain("private async runQueuedJob");
    expect(workerSource).toContain('case "runJob"');
    expect(workerSource).toContain("function parsePostCaptureHardeningPayload");
    expect(rpcSource).toContain("export function isPostCaptureStageName");
    expect(workerSource).toContain("isPostCaptureStageName(stage)");
    expect(workerSource).toContain('payload.graphBuildMode === "deterministic"');
    expect(workerSource).toContain('payload.graphBuildMode === "llm"');
    expect(workerSource).toContain("function upsertSourceChunkEmbeddings");
    expect(workerSource).toContain("function upsertSourceMetaEmbedding");
    expect(workerSource).toContain("result = await runPostCaptureHardeningJob");
    expect(workerSource).toContain('reason: "explicit_build_required"');
    expect(workerSource).toContain('"EMBEDDING_MODEL_UNAVAILABLE"');
    expect(workerSource).not.toContain("Reserved job types are intentionally no-op");
    expect(workerSource).not.toContain('"ingest_embedding"');
    expect(workerSource).not.toContain('"ingest_chunk_meta"');
    expect(workerSource).not.toContain('"ingest_graph"');
  });

  it("keeps automatic post-capture jobs out of generic stale recovery", () => {
    const recoverSection = sourceSection(
      "function recoverStaleJobs",
      "const automaticPostCaptureJobPredicate",
    );
    const recoveryStatements = recoverSection.match(/sql: `UPDATE jobs[\s\S]*?`,/g) ?? [];

    expect(recoveryStatements).toHaveLength(2);
    for (const statement of recoveryStatements) {
      expect(statement).toContain("AND NOT ${automaticPostCaptureJobPredicate}");
    }
  });

  it("defines a Source Adapter registry for source-native capture", () => {
    expect(workerSource).toContain("interface SourceAdapter");
    expect(workerSource).toContain("class SourceAdapterRegistry");
    expect(workerSource).toContain("function createSourceAdapterRegistry");
    expect(workerSource).toContain("const defaultSourceAdapterRegistry");
    expect(workerSource).toContain("const webpageSourceAdapter");
    expect(workerSource).toContain("const markdownSourceAdapter");
    expect(workerSource).toContain("const pdfSourceAdapter");
    expect(workerSource).toContain("const paperSourceAdapter");
    expect(workerSource).toContain('sourceTypes: ["webpage"]');
    expect(workerSource).toContain('sourceTypes: ["markdown"]');
    expect(workerSource).toContain('sourceTypes: ["pdf"]');
    expect(workerSource).toContain('sourceTypes: ["paper"]');
    expect(workerSource).toContain("Duplicate source adapter id");
    expect(workerSource).toContain("Duplicate active source adapter for source_type");
    expect(workerSource).toContain("defaultSourceAdapterRegistry.resolve({ kind, payload })");
    expect(workerSource).toContain("adapter.adapt({ kind, payload })");

    const adapterContract = sourceSection("interface SourceAdapter", "export class LocalEngine");
    expect(adapterContract).not.toContain("SqliteDb");
    expect(adapterContract).not.toContain("db:");
  });

  it("exposes public PDF and Markdown capture RPCs through the same capture path", () => {
    const handleSection = sourceSection("async handle", "private async health");
    const markdownSection = sourceSection(
      "private async captureMarkdown",
      "private async capturePdf",
    );
    const pdfSection = sourceSection("private async capturePdf", "private async capture(");

    expect(handleSection).toContain('case "captureMarkdown"');
    expect(handleSection).toContain("return await this.captureMarkdown(request.payload)");
    expect(handleSection).toContain('case "capturePdf"');
    expect(handleSection).toContain("return await this.capturePdf(request.payload)");
    expect(markdownSection).toContain('source_type: "markdown"');
    expect(markdownSection).toContain('adapter: "markdown"');
    expect(markdownSection).toContain('return await this.capture("page"');
    expect(pdfSection).toContain("const pdfBytes = normalizePdfBytes(payload.bytes)");
    expect(pdfSection).toContain("const parsed = await this.pdfParser(parserBytes)");
    expect(pdfSection).toContain("pdfCapturePayloadFromParsedDocument");
    expect(pdfSection).toContain("afterSave");
    expect(pdfSection).toContain("afterDuplicate");
    expect(pdfSection).toContain("persistPdfRawFile");
    expect(pdfSection).toContain("return await this.capture(");
  });

  it("keeps capture source-native and defers embedding work outside the capture transaction", () => {
    const captureSection = sourceSection("private async capture(", "private async retrieveSources");

    expect(captureSection).toContain("defaultSourceAdapterRegistry.resolve");
    expect(captureSection).toContain("adapter.adapt");
    expect(captureSection).toContain("const chunks = chunkTextForDocument(draft)");
    expect(captureSection).toContain("const chunkRanges = locateChunkTextRanges");
    expect(captureSection).toContain("const materializedChunks = materializeSourceChunks");
    expect(captureSection).toContain("transaction(db, () => {");
    expect(captureSection).toContain("insertSourceRow(db");
    expect(captureSection).toContain("insertSourceLifecycleEvent(db");
    expect(captureSection).toContain("insertSourceAuditLog(db");
    expect(captureSection).toContain("INSERT INTO source_chunks");
    expect(captureSection).toContain("for (const parent of materializedChunks.parents)");
    expect(captureSection).toContain("'parent'");
    expect(captureSection).toContain("for (const materialized of materializedChunks.children)");
    expect(captureSection).toContain("'child'");
    expect(captureSection).toContain("parent_chunk_id");
    expect(workerSource).toContain("function pageRangeForChunk");
    expect(workerSource).toContain("pageRange: pageRangeForChunk(range, draft.pdfPages)");
    expect(workerSource).toContain("pageRange: pageRangeForChunk(parentRange, draft.pdfPages)");
    expect(captureSection).toContain("page_start");
    expect(captureSection).toContain("page_end");
    expect(captureSection).toContain("section_path");
    expect(captureSection).toContain("meta_head_json");
    expect(captureSection).toContain("insertSourceFtsRow(db");
    expect(captureSection).toContain("insertAnchor(");
    expect(captureSection).toContain('enqueueJob(db, "post_capture_hardening"');
    expect(captureSection).toContain('action: "source.stage_queued"');
    expect(captureSection).not.toContain("runEmbeddingStageForSource");
    expect(captureSection).not.toContain("upsertSourceChunkEmbedding");
    expect(captureSection).not.toContain("buildChunkEmbeddingInput");
    expect(captureSection).not.toContain("embedLocalDeterministic");
    expect(captureSection).not.toContain("pdfjs");
  });

  it("cleans up source embeddings on source delete and library reset", () => {
    expect(workerSource).toContain("DELETE FROM source_embeddings WHERE source_id = ?");
    expect(workerSource).toContain("DELETE FROM source_working_set WHERE source_id = ?");
    expect(workerSource).toContain("DELETE FROM source_metadata_fts WHERE source_id = ?");
    expect(workerSource).toContain("function deleteKeywordIndexForSource");
    expect(workerSource).toContain("function deleteGraphForSource");
    expect(workerSource).toContain('db.exec("DELETE FROM source_embeddings")');
    expect(workerSource).toContain('db.exec("DELETE FROM graph_edges")');
    expect(workerSource).toContain('db.exec("DELETE FROM graph_nodes")');
    expect(workerSource).toContain('db.exec("DELETE FROM source_working_set")');
    expect(workerSource).toContain('db.exec("DELETE FROM source_metadata_fts")');
    expect(workerSource).toContain('db.exec("DELETE FROM keyword_index_sources")');
    expect(workerSource).toContain('db.exec("DELETE FROM keyword_index")');

    const deleteSection = sourceSection(
      "private async delete",
      "private async publishWikiArtifacts",
    );
    expect(deleteSection).toContain("DELETE FROM anchors WHERE memory_id = ?");
    expect(deleteSection).toContain("deleteGraphForSource(db, id)");
    expect(deleteSection).toContain("DELETE FROM source_embeddings WHERE source_id = ?");
    expect(deleteSection).toContain("DELETE FROM source_working_set WHERE source_id = ?");
    expect(deleteSection).toContain("DELETE FROM source_metadata_fts WHERE source_id = ?");
    expect(deleteSection).toContain("DELETE FROM source_fts WHERE source_id = ?");
    expect(deleteSection).toContain("deleteKeywordIndexForSource(db, id)");
    expect(deleteSection).toContain("DELETE FROM source_chunks WHERE source_id = ?");
    expect(deleteSection).toContain("DELETE FROM source_metadata WHERE source_id = ?");
    expect(deleteSection).toContain("markSourceDeleted(db");
    expect(deleteSection).toContain("this.pdfRawFileStore.delete(id).catch(() => undefined)");

    const resetSection = sourceSection("private async resetLibrary", "private async ensureReady");
    expect(resetSection).toContain('db.exec("DELETE FROM orchestration_events")');
    expect(resetSection).toContain('db.exec("DELETE FROM orchestration_runs")');
    expect(resetSection).toContain('db.exec("DELETE FROM jobs")');
    expect(resetSection).toContain('db.exec("DELETE FROM graph_edges")');
    expect(resetSection).toContain('db.exec("DELETE FROM graph_nodes")');
    expect(resetSection).toContain('db.exec("DELETE FROM source_embeddings")');
    expect(resetSection).toContain('db.exec("DELETE FROM source_working_set")');
    expect(resetSection).toContain('db.exec("DELETE FROM source_metadata_fts")');
    expect(resetSection).toContain('db.exec("DELETE FROM keyword_index_sources")');
    expect(resetSection).toContain('db.exec("DELETE FROM keyword_index")');
    expect(resetSection).toContain('db.exec("DELETE FROM source_fts")');
    expect(resetSection).toContain('db.exec("DELETE FROM source_chunks")');
    expect(resetSection).toContain('db.exec("DELETE FROM sources")');
    expect(resetSection).toContain("this.pdfRawFileStore.clear().catch(() => undefined)");
  });

  it("defines independent orchestration storage without changing default retrieval", () => {
    expect(rpcSource).toContain('export type OrchestrationKind = "post_capture_job"');
    expect(rpcSource).toContain('"createOrchestrationRun"');
    expect(rpcSource).toContain('"runOrchestration"');
    expect(rpcSource).toContain('"cancelOrchestrationRun"');
    expect(rpcSource).toContain('"retryOrchestrationRun"');
    expect(rpcSource).toContain('"listOrchestrationEvents"');
    expect(workerSource).toContain('case "createOrchestrationRun"');
    expect(workerSource).toContain('case "runOrchestration"');
    expect(workerSource).toContain('case "cancelOrchestrationRun"');
    expect(workerSource).toContain('case "retryOrchestrationRun"');
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS orchestration_runs");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS orchestration_events");
    expect(workerSource).toContain("idx_orchestration_runs_status");
    expect(workerSource).toContain("idx_orchestration_runs_target");
    expect(workerSource).toContain("idx_orchestration_events_run");
    expect(workerSource).toContain("function recoverStaleOrchestrationRuns");
    expect(workerSource).toContain("recoverStaleOrchestrationRuns(db)");

    const retrieveSection = sourceSection("private async retrieveSources", "private async search");
    expect(retrieveSection).not.toContain("orchestration_runs");
    expect(retrieveSection).not.toContain("orchestration_events");
    const kbSection = sourceSection("private async searchKnowledgeBase", "private async search(");
    expect(kbSection).not.toContain("orchestration_runs");
    expect(kbSection).not.toContain("orchestration_events");
  });

  it("rebuilds FTS from source chunks without changing embedding rows", () => {
    const rebuildSection = sourceSection(
      "function rebuildFtsData",
      "async function runEmbeddingReindexJob",
    );
    expect(rebuildSection).toContain("DELETE FROM source_fts");
    expect(rebuildSection).toContain("DELETE FROM source_metadata_fts");
    expect(rebuildSection).toContain("DELETE FROM keyword_index_sources");
    expect(rebuildSection).toContain("DELETE FROM keyword_index");
    expect(rebuildSection).toContain("FROM source_chunks c");
    expect(rebuildSection).toContain("JOIN sources s ON s.id = c.source_id");
    expect(rebuildSection).toContain("WHERE s.lifecycle_status <> 'deleted'");
    expect(rebuildSection).toContain("AND c.role = 'child'");
    expect(rebuildSection).toContain("insertSourceFtsRow(db");
    expect(rebuildSection).toContain("LEFT JOIN source_metadata sm ON sm.source_id = s.id");
    expect(rebuildSection).toContain("insertSourceMetadataFtsRow(db");
    expect(rebuildSection).toContain("replaceKeywordIndexForSource(db");
    expect(rebuildSection).not.toContain("source_embeddings");
  });

  it("exposes knowledge-base search expansion over keyword and graph term sources", () => {
    expect(workerSource).toContain('case "searchKnowledgeBase"');
    expect(workerSource).toContain("private async searchKnowledgeBase");
    expect(workerSource).toContain("function replaceKeywordIndexForSource");
    expect(workerSource).toContain("function collectKeywordTermsForSource");
    expect(workerSource).toContain("function findKnowledgeBaseExpansionTerms");
    expect(workerSource).toContain("function loadKeywordExpansionTermCandidates");
    expect(workerSource).toContain("function loadGraphExpansionTermCandidates");
    expect(workerSource).toContain("function mergeKnowledgeBaseExpansionCandidates");
    expect(workerSource).toContain("function mergeKnowledgeBaseSearchItems");
    expect(workerSource).toContain("JOIN keyword_index_sources kis ON kis.term = ki.term");
    expect(workerSource).toContain("JOIN graph_edges ge ON ge.target_node_id = gn.id");
    expect(workerSource).toContain("JOIN sources s ON s.id = ge.evidence_source_id");
    expect(workerSource).toContain("JOIN sources s ON s.id = kis.source_id");
    expect(workerSource).toContain("const original = await this.retrieveSources");
    expect(workerSource).toContain("const expanded = await this.retrieveSources");
    expect(workerSource).toContain('source: "source_graph"');
    expect(workerSource).toContain("termSources: expansionTerms.termSources");
    expect(workerSource).toContain("expansion: {");
  });

  it("loads prompt evidence through bounded source chunk windows", () => {
    expect(workerSource).toContain('case "getMemoryEvidenceWindows"');
    expect(workerSource).toContain("private async getMemoryEvidenceWindows");
    expect(workerSource).toContain("FROM source_fts");
    expect(workerSource).toContain("JOIN source_chunks c ON c.id = source_fts.chunk_id");
    expect(workerSource).toContain("function loadSourceEvidenceWindow");
    expect(workerSource).toContain("function boundedEvidenceWindowAnchors");
    expect(workerSource).toContain("function resolveEvidenceWindowAnchorOrd");
    expect(workerSource).toContain("const explicitAnchors = boundedEvidenceWindowAnchors");
    expect(workerSource).toContain("FROM source_chunks");
    expect(workerSource).toContain("ord BETWEEN ? AND ?");
    expect(workerSource).toContain("AND role = 'child'");
    expect(workerSource).toContain("AND c.role = 'child'");

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
    expect(loaderSection).toContain("AND role = 'child'");
  });

  it("orders bounded evidence loading as anchors, then query hits, then requested-source fallback", () => {
    const evidenceWindowSection = sourceSection(
      "private async getMemoryEvidenceWindows",
      "private async delete",
    );
    const explicitAnchorIndex = evidenceWindowSection.indexOf(
      "for (const anchor of explicitAnchors)",
    );
    const ftsIndex = evidenceWindowSection.indexOf("if (ftsQuery.length > 0)");
    const fallbackIndex = evidenceWindowSection.indexOf(
      "if (windows.length < limit && sourceIds.length > 0)",
    );

    expect(explicitAnchorIndex).toBeGreaterThanOrEqual(0);
    expect(ftsIndex).toBeGreaterThan(explicitAnchorIndex);
    expect(fallbackIndex).toBeGreaterThan(ftsIndex);
    expect(evidenceWindowSection).toContain("contextChunksBefore");
    expect(evidenceWindowSection).toContain("contextChunksAfter");
    expect(evidenceWindowSection).toContain("maxWindowsPerMemory");
  });

  it("builds source context packs from bounded metadata and chunk windows", () => {
    expect(workerSource).toContain('case "buildSourceContextPack"');
    expect(workerSource).toContain("private async buildSourceContextPack");
    expect(workerSource).toContain("function buildSourceContextPack");
    expect(workerSource).toContain("function resolveSourceContextPackCandidates");
    expect(workerSource).toContain("function loadSourceContextSourceStates");
    expect(workerSource).toContain("function loadSourceContextCandidateWindows");
    expect(workerSource).toContain("function loadSourceContextParentWindows");
    expect(workerSource).toContain("function loadSourceContextParentWindowsByChildId");
    expect(workerSource).toContain("function sourceContextParentWindowText");
    expect(workerSource).toContain("function logSelectedParentContextWindows");
    expect(workerSource).toContain("function packSourceContextGroups");
    expect(workerSource).toContain("function trimSourceContextPackToBudget");
    expect(workerSource).toContain("FROM source_working_set ws");
    expect(workerSource).toContain("FROM source_fts");
    expect(workerSource).toContain("JOIN source_chunks c ON c.id = source_fts.chunk_id");
    expect(workerSource).toContain(
      "LEFT JOIN source_chunks c ON c.source_id = s.id AND c.role = 'child'",
    );
    expect(workerSource).toContain("LEFT JOIN source_metadata sm ON sm.source_id = s.id");
    expect(workerSource).toContain("full_depth_bounded");
    expect(workerSource).toContain("parent_context_selected");
    expect(workerSource).toContain('priority: "parent"');
    expect(workerSource).toContain("sourceContextPackParentWindowMaxChars");
    expect(workerSource).toContain("source_context_pack_v1");
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_context_compression_logs");
    expect(workerSource).toContain('case "appendSourceContextCompressionLogs"');
    expect(workerSource).toContain("CREATE TABLE IF NOT EXISTS source_context_map_artifacts");
    expect(workerSource).toContain('case "appendSourceContextMapArtifacts"');
    expect(workerSource).toContain('case "listSourceContextMapArtifacts"');
    expect(workerSource).toContain('case "clearSourceContextMapArtifacts"');

    const handlerSection = sourceSection(
      "private async buildSourceContextPack",
      "private async pinWorkingSetSource",
    );
    expect(handlerSection).not.toContain("normalized_text");
    const mapArtifactSection = sourceSection(
      "private async appendSourceContextMapArtifacts",
      "private async pinWorkingSetSource",
    );
    expect(mapArtifactSection).not.toContain("normalized_text");
    const packSection = sourceSection("function buildSourceContextPack", "function insertAnchor");
    expect(packSection).not.toContain("normalized_text");
    expect(packSection).not.toContain("getMemory(");

    const retrieveSection = sourceSection("private async retrieveSources", "private async search");
    expect(retrieveSection).not.toContain("buildSourceContextPack");
    const searchKnowledgeBaseSection = sourceSection(
      "private async searchKnowledgeBase",
      "private async getMemoryEvidenceWindows",
    );
    expect(searchKnowledgeBaseSection).not.toContain("buildSourceContextPack");
  });

  it("exposes source-native retrieval with RRF fusion and truthful vector trace", () => {
    expect(workerSource).toContain('case "retrieveSources"');
    expect(workerSource).toContain("private async retrieveSources");
    expect(workerSource).toContain("function loadMetaSourceRetrievalHits");
    expect(workerSource).toContain("function loadVectorMetaRetrievalHits");
    expect(workerSource).toContain("function loadFtsChunkRetrievalHits");
    expect(workerSource).toContain("function loadVectorChunkRetrievalHits");
    expect(workerSource).toContain("function normalizeRetrieveSourcesFilter");
    expect(workerSource).toContain("function sourceFilterWhereClause");
    expect(workerSource).toContain("function fuseSourceRetrievalHits");
    expect(workerSource).toContain("function reciprocalRankFusionScore");
    expect(workerSource).not.toContain("function embedLocalDeterministic");
    expect(workerSource).toContain("function cosineSimilarity");
    expect(workerSource).toContain("function parseEmbeddingVector");
    expect(workerSource).toContain("const defaultRrfK = 60");
    expect(workerSource).toContain("FROM source_fts");
    expect(workerSource).toContain("JOIN sources s ON s.id = source_fts.source_id");
    expect(workerSource).toContain("JOIN source_chunks c ON c.id = source_fts.chunk_id");
    expect(workerSource).toContain("FROM source_metadata_fts");
    expect(workerSource).toContain("source_metadata_fts MATCH ?");
    expect(workerSource).toContain("bm25(source_metadata_fts) AS score");
    expect(workerSource).toContain("LEFT JOIN source_metadata sm ON sm.source_id = s.id");
    expect(workerSource).toContain("s.lifecycle_status IN");
    expect(workerSource).toContain("s.source_type IN");
    expect(workerSource).toContain("FROM source_embeddings se");
    expect(workerSource).toContain("se.target_kind = 'meta'");
    expect(workerSource).toContain("JOIN source_chunks c ON c.id = se.target_id");
    expect(workerSource).toContain("cosineSimilarity(queryVector.vector, vector)");
    expect(workerSource).toContain('name: "meta_sources"');
    expect(workerSource).toContain('name: "vector_meta"');
    expect(workerSource).toContain('name: "vector_chunks"');
    expect(workerSource).toContain('status: "used"');
    expect(workerSource).toContain('status: "skipped"');
    expect(workerSource).toContain('status: "unavailable"');
    expect(workerSource).toContain("embedding_model_unavailable");
    expect(workerSource).toContain("no_embeddings");
    expect(workerSource).toContain("empty_query");

    const retrieveSection = workerSource.slice(
      workerSource.indexOf("private async retrieveSources"),
      workerSource.indexOf("private async search"),
    );
    expect(retrieveSection).toContain('mode: "hybrid" | KnowledgeBaseSearchMode = "hybrid"');
    expect(retrieveSection).toContain('const useLexicalTracks = mode !== "semantic"');
    expect(retrieveSection).toContain('const useVectorTracks = mode !== "exact"');
    expect(retrieveSection).toContain("loadMetaSourceRetrievalHits");
    expect(retrieveSection).toContain("await loadVectorMetaRetrievalHits");
    expect(retrieveSection).toContain('vectorMetaSkippedTrace("exact_mode")');
    expect(retrieveSection).toContain('reason: useLexicalTracks ? "no_matches" : "semantic_mode"');
    expect(retrieveSection).toContain("pruneCrossTrackVectorHits");
    expect(retrieveSection).toContain(
      "[...metaHits, ...vectorMetaHits, ...ftsHits, ...vectorChunkHits]",
    );
    expect(retrieveSection).not.toContain("normalized_text");
    expect(retrieveSection).not.toContain("graph_nodes");
    expect(retrieveSection).not.toContain("graph_edges");
    const searchKnowledgeBaseSection = workerSource.slice(
      workerSource.indexOf("private async searchKnowledgeBase"),
      workerSource.indexOf("private async getMemoryEvidenceWindows"),
    );
    expect(searchKnowledgeBaseSection).not.toContain("JOIN graph_nodes");
    expect(searchKnowledgeBaseSection).not.toContain("JOIN graph_edges");
    const graphExpansionSection = workerSource.slice(
      workerSource.indexOf("function loadGraphExpansionTermCandidates"),
      workerSource.indexOf("function graphExpansionTermsFromRow"),
    );
    expect(graphExpansionSection).toContain("FROM graph_nodes gn");
    expect(graphExpansionSection).toContain("JOIN graph_edges ge ON ge.target_node_id = gn.id");
    expect(graphExpansionSection).toContain("JOIN sources s ON s.id = ge.evidence_source_id");
    expect(graphExpansionSection).toContain("sourceFilterWhereClause");
    const metaRetrievalSection = workerSource.slice(
      workerSource.indexOf("function loadMetaSourceRetrievalHits"),
      workerSource.indexOf("function loadFtsChunkRetrievalHits"),
    );
    expect(metaRetrievalSection).not.toContain("normalized_text");
    expect(metaRetrievalSection).not.toContain("graph_nodes");
    expect(metaRetrievalSection).not.toContain("graph_edges");
    const ftsRetrievalSection = workerSource.slice(
      workerSource.indexOf("function loadFtsChunkRetrievalHits"),
      workerSource.indexOf("function fuseSourceRetrievalHits"),
    );
    expect(ftsRetrievalSection).toContain("const bodyFtsQuery = `body : (${ftsQuery})`");
    expect(ftsRetrievalSection).toContain("[bodyFtsQuery, ...sourceFilter.bind");
    expect(ftsRetrievalSection).not.toContain("normalized_text");
    expect(ftsRetrievalSection).not.toContain("graph_nodes");
    expect(ftsRetrievalSection).not.toContain("graph_edges");
    const vectorMetaRetrievalSection = workerSource.slice(
      workerSource.indexOf("function loadVectorMetaRetrievalHits"),
      workerSource.indexOf("function loadVectorChunkRetrievalHits"),
    );
    expect(vectorMetaRetrievalSection).toContain("se.target_kind = 'meta'");
    expect(vectorMetaRetrievalSection).toContain("se.target_id = s.id");
    expect(vectorMetaRetrievalSection).not.toContain("JOIN source_chunks");
    expect(vectorMetaRetrievalSection).not.toContain("normalized_text");
    expect(vectorMetaRetrievalSection).not.toContain("graph_nodes");
    expect(vectorMetaRetrievalSection).not.toContain("graph_edges");
    const vectorRetrievalSection = workerSource.slice(
      workerSource.indexOf("function loadVectorChunkRetrievalHits"),
      workerSource.indexOf("function fuseSourceRetrievalHits"),
    );
    expect(vectorRetrievalSection).not.toContain("normalized_text");
    expect(vectorRetrievalSection).toContain("AND c.role = 'child'");
    expect(vectorRetrievalSection).not.toContain("graph_nodes");
    expect(vectorRetrievalSection).not.toContain("graph_edges");
    const fusionSection = workerSource.slice(
      workerSource.indexOf("function fuseSourceRetrievalHits"),
      workerSource.indexOf("function mergeKnowledgeBaseSearchItems"),
    );
    expect(fusionSection).toContain("hit.chunk !== undefined");
    expect(fusionSection).toContain("sourceRanksByTrack");
    expect(fusionSection).toContain("if (!existing.tracks.has(hit.track))");
    expect(fusionSection).toContain("fallbackExcerpt");
    expect(fusionSection).toContain("chunks[0]?.snippet || item.fallbackExcerpt");
    expect(fusionSection).toContain("rankSourceCoarseCandidates");
    expect(fusionSection).toContain("selectSourceCoarseCandidates");
    expect(fusionSection).not.toContain("graph_nodes");
    expect(fusionSection).not.toContain("graph_edges");
    const knowledgeBaseClusterSection = workerSource.slice(
      workerSource.indexOf("function buildKnowledgeBaseSourceClusters"),
      workerSource.indexOf("function mergeRetrieveTracks"),
    );
    expect(knowledgeBaseClusterSection).toContain("loadKnowledgeBaseClusterMetadata");
    expect(knowledgeBaseClusterSection).toContain("source_embeddings");
    expect(knowledgeBaseClusterSection).not.toContain("source_chunks");
    expect(knowledgeBaseClusterSection).not.toContain("normalized_text");
    expect(knowledgeBaseClusterSection).toContain("buildKnowledgeBaseGraphSourceClusters");
    expect(knowledgeBaseClusterSection).toContain("graph_nodes");
    expect(knowledgeBaseClusterSection).toContain("graph_edges");
  });

  it("keeps embedding jobs idempotent and model-scoped", () => {
    const jobSection = sourceSection("function runJob", "function rebuildFtsData");
    expect(jobSection).toContain('type === "post_capture_hardening"');
    expect(jobSection).toContain('type === "reindex_embeddings"');
    expect(jobSection).toContain("await runPostCaptureHardeningJob");
    expect(jobSection).toContain("status = 'done'");
    expect(jobSection).toContain("status = ?");

    const reindexSection = sourceSection(
      "async function runEmbeddingReindexJob",
      "async function runPostCaptureHardeningJob",
    );
    expect(reindexSection).toContain("stagingModelId");
    expect(reindexSection).toContain("commitStagedEmbeddingModel");
    expect(reindexSection).toContain("DELETE FROM source_embeddings WHERE model_id = ?");
    expect(reindexSection).toContain("lifecycle_status <> 'deleted'");
    expect(reindexSection).toContain("runEmbeddingStageForSourceWithProvider");
    expect(reindexSection).toContain(
      "UPDATE source_embeddings SET model_id = ? WHERE model_id = ?",
    );
    expect(reindexSection).not.toContain("normalized_text");

    const embeddingStageSection = sourceSection(
      "function runEmbeddingStageForSource",
      "function upsertSourceMetaEmbedding",
    );
    expect(embeddingStageSection).toContain("SOURCE_NOT_FOUND");
    expect(embeddingStageSection).toContain("lifecycle_status = 'deleted'");
    expect(embeddingStageSection).toContain("source_deleted");
    expect(embeddingStageSection).toContain(
      "getActiveEmbeddingProvider(\n    db,\n    embeddingProviderOverride,\n    embeddingProviderFactory,\n  )",
    );
    expect(embeddingStageSection).toContain("embedding_model_unavailable");
    expect(embeddingStageSection).toContain("meta_head_json");
    expect(embeddingStageSection).toContain("AND role = 'child'");
    expect(embeddingStageSection).toContain("ORDER BY ord ASC");
    expect(embeddingStageSection).toContain("loadSourceMetaEmbeddingInput(db, sourceId)");
    expect(embeddingStageSection).toContain("buildSourceMetaEmbeddingText(metaInput)");
    expect(embeddingStageSection).toContain("upsertSourceMetaEmbedding");
    expect(embeddingStageSection).toContain("deleteSourceMetaEmbedding");
    expect(embeddingStageSection).toContain('targetKinds: ["chunk", "meta"]');
    expect(embeddingStageSection).toContain("metaSkippedReason");

    const upsertSection = sourceSection(
      "function upsertSourceChunkEmbeddings",
      "function insertSourceFtsRow",
    );
    expect(upsertSection).toContain("ON CONFLICT(model_id, target_kind, target_id) DO UPDATE");
    expect(upsertSection).toContain("provider.modelId");
    expect(upsertSection).toContain("'chunk'");
    expect(upsertSection).toContain("'meta'");
    expect(upsertSection).toContain("buildChunkEmbeddingInput(chunk)");
    expect(upsertSection).toContain('provider.embedTexts(inputs, "document")');
    expect(upsertSection).toContain("hashText(embeddingInput)");
    expect(upsertSection).toContain("hashText(input.text)");
    expect(upsertSection).toContain("EMBEDDING_DIMENSION_MISMATCH");
  });

  it("defines chunk meta head Tier0 builders without changing prompt evidence output", () => {
    expect(workerSource).toContain("interface ChunkMetaHeadV1");
    expect(workerSource).toContain("const chunkMetaHeadVersion = 1");
    expect(workerSource).toContain("type ChunkMetaTierV1");
    expect(workerSource).toContain("type ChunkMetaSummarySourceV1");
    expect(workerSource).toContain("interface ChunkMetaTierStateV1");
    expect(workerSource).toContain("interface ChunkMetaSemanticRelationV1");
    expect(workerSource).toContain("function buildChunkMetaHeadJson");
    expect(workerSource).toContain("function buildChunkMetaHeadJsonFromSourceMetadata");
    expect(workerSource).toContain("function runChunkMetaStageForSource");
    expect(workerSource).toContain("function localExtractiveChunkSummary");
    expect(workerSource).toContain("function localExtractiveSectionSummary");
    expect(workerSource).toContain("function buildLocalChunkMetaSemanticRelations");
    expect(workerSource).toContain("function normalizeChunkMetaSemanticRelations");
    expect(workerSource).toContain("function selectedChunkMetaTierState");
    expect(workerSource).toContain("type ChunkMetaSummarizerFactory");
    expect(workerSource).toContain("createWorkerChunkMetaSummarizer");
    expect(workerSource).toContain("CLIO_WORKER_CHUNK_META_SUMMARY_REQUEST");
    expect(workerSource).toContain("isWorkerChunkMetaSummaryResponseMessage");
    expect(workerSource).toContain("chunkMetaTier2");
    expect(workerSource).toContain('case "enqueueChunkMetaTier2Job"');
    expect(workerSource).toContain('case "listChunkMetaTier2Audit"');
    expect(workerSource).toContain('case "clearChunkMetaTier2Audit"');
    expect(workerSource).toContain("private async enqueueChunkMetaTier2Job");
    expect(workerSource).toContain("private async listChunkMetaTier2Audit");
    expect(workerSource).toContain("private async clearChunkMetaTier2Audit");
    expect(workerSource).toContain("idx_chunk_meta_tier2_audit_source_created");
    expect(workerSource).toContain("idx_chunk_meta_tier2_audit_job_created");
    expect(workerSource).toContain("idx_chunk_meta_tier2_audit_status_created");
    expect(workerSource).toContain("insertChunkMetaTier2AuditRow");
    expect(workerSource).toContain("chunkMetaTier2AuditRecordFromRow");
    expect(workerSource).toContain("chunkMetaTier2AuditWhereClause");
    expect(workerSource).toContain("semantic_relation_count");
    expect(workerSource).toContain("semanticRelationCount");
    expect(workerSource).toContain("chunk_meta_summarizer_unavailable");
    expect(workerSource).toContain("chunk_meta_tier2_max_chunks_exceeded");
    expect(workerSource).toContain("applyChunkMetaTier2Result");
    expect(workerSource).toContain("chunkMetaSemanticRelationsFromSummary");
    expect(workerSource).toContain('selectedTier: "tier2"');
    expect(workerSource).toContain('summarySource: "remote_llm"');
    expect(workerSource).toContain("function sectionHeadingRanges");
    expect(workerSource).toContain("function sectionPathForChunk");
    expect(workerSource).toContain("function sectionOutlineFromJson");
    expect(workerSource).toContain("function chunkTextRangeFromRow");
    expect(workerSource).toContain("function chunkTextForDocument");
    expect(workerSource).toContain("function chunkSegmentsForDocument");
    expect(workerSource).toContain("function materializeSourceChunks");
    expect(workerSource).toContain("function parentChunkGroupsForChildren");
    expect(workerSource).toContain("function parentChunkRange");
    expect(workerSource).toContain("const parentChunkOrdBase");
    expect(workerSource).toContain("const parentChunkTextMaxChars");
    expect(workerSource).toContain("const chunkMetaSectionSummaryMaxChars");
    expect(workerSource).toContain("const chunkMetaChunkSummaryMaxChars");
    expect(workerSource).toContain("const chunkMetaMaxRelations");
    expect(workerSource).toContain('tier: "tier0"');
    expect(workerSource).toContain('selectedTier: "tier1"');
    expect(workerSource).toContain('summarySource: "deterministic"');
    expect(workerSource).toContain('summarySource: "local_extractive"');
    expect(workerSource).toContain("explicit_llm_chunk_meta_not_configured");
    expect(workerSource).toContain("selectedTier");
    expect(workerSource).toContain("tiers");
    expect(workerSource).toContain("semanticRelations");
    expect(workerSource).toContain("tier2DisabledCount");
    expect(workerSource).toContain("docContext");
    expect(workerSource).toContain("sectionPath: string | null");
    expect(workerSource).toContain("sectionSummary: tier0SectionSummary");
    expect(workerSource).toContain("chunkSummary: tier0ChunkSummary");
    expect(workerSource).toContain("const roleHint = normalizeChunkMetaRoleHint(input.roleHint)");
    expect(workerSource).toContain("roleHint,");
    expect(workerSource).toContain("const relations = normalizeChunkMetaRelations");
    expect(workerSource).toContain("relations,");
    expect(workerSource).toContain("function parseChunkMetaRelations");
    expect(workerSource).toContain("function normalizeChunkMetaRelations");
    expect(workerSource).toContain("function isChunkMetaRelationKind");
    expect(workerSource).toContain("Section: ${sectionPath}");
    expect(workerSource).toContain("Section summary: ${sectionSummary}");
    expect(workerSource).toContain(
      "UPDATE source_chunks SET section_path = ?, meta_head_json = ? WHERE id = ?",
    );
    expect(workerSource).toContain(
      "SELECT id, ord, text, char_start, char_end, role, parent_chunk_id",
    );
    expect(workerSource).toContain("function buildChunkEmbeddingInput");
    expect(workerSource).not.toContain("function buildChunkMetaEmbeddingPrefix");
    expect(workerSource).toContain('const sourceChunkStrategyVersion = "e5-a-paragraph-v1"');
    expect(workerSource).toContain("const sourceChunkSoftTargetTokens = 300");
    expect(workerSource).toContain("const sourceChunkHardMaxTokens = 420");
    expect(workerSource).toContain("const sourceChunkOversizedOverlapTokens = 48");
    expect(workerSource).toContain("chunkTextByParagraphs(blocks");
    expect(workerSource).toContain('embeddingInput: "passage_only"');
    const embeddingInputSection = workerSource.slice(
      workerSource.indexOf("function buildChunkEmbeddingInput"),
      workerSource.indexOf("function selectedChunkMetaTierState"),
    );
    expect(embeddingInputSection).toContain('return stringField(chunk, "text");');
    expect(embeddingInputSection).not.toContain("meta_head_json");
    expect(embeddingInputSection).not.toContain("sectionPath");
    expect(embeddingInputSection).not.toContain("relationHints");
    expect(rpcSource).toContain("CLIO_WORKER_CHUNK_META_SUMMARY_REQUEST");
    expect(rpcSource).toContain("isWorkerChunkMetaSummaryRequestMessage");
    expect(rpcSource).toContain("forbiddenWorkerChunkMetaSummaryFields");
    expect(rpcSource).toContain('"apiKey"');
    expect(rpcSource).toContain('"fullText"');
    expect(rpcSource).toContain('"normalizedText"');
    expect(rpcSource).toContain('"pdfBytes"');
    expect(rpcSource).toContain('"rawBytes"');

    const evidenceWindowSection = workerSource.slice(
      workerSource.indexOf("function loadSourceEvidenceWindow"),
      workerSource.indexOf("function optionalAnchorFromRow"),
    );
    expect(evidenceWindowSection).not.toContain("meta_head_json");
    expect(evidenceWindowSection).not.toContain("docContext");
  });

  it("keeps provider-backed Knowledge Base cluster label refinement out of the Worker", () => {
    expect(rpcSource).toContain("CLIO_KB_CLUSTER_LABEL_REFINEMENT_REQUEST");
    expect(rpcSource).toContain("forbiddenKnowledgeBaseClusterLabelRefinementFields");
    expect(rpcSource).toContain('"apiKey"');
    expect(rpcSource).toContain('"fullText"');
    expect(rpcSource).toContain('"normalizedText"');
    expect(rpcSource).toContain('"chunkText"');
    expect(rpcSource).toContain('"rawProviderResponse"');
    expect(workerSource).not.toContain("CLIO_KB_CLUSTER_LABEL_REFINEMENT_REQUEST");
    expect(workerSource).not.toContain("KnowledgeBaseClusterLabelRefiner");
    expect(workerSource).not.toContain("ProviderBackedKnowledgeBaseClusterLabelRefiner");
  });
});
