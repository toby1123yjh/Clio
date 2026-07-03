import { buildMemoryVersionGroupKey } from "@/src/shared/reliability";
import {
  type AnchorInfo,
  type AnchorResolveResult,
  type AppendSessionEvidencePayload,
  type BuildSourceContextPackPayload,
  type BuildSourceGraphPayload,
  type BuildSourceGraphResult,
  CLIO_WORKER_RESPONSE,
  type CaptureBasePayload,
  type CaptureResult,
  type CaptureSelectionPayload,
  type ChatMessageRecord,
  type ChatMessageRole,
  type ChatMessageStatus,
  type ChatSessionDetail,
  type ChatSessionSummary,
  type CompactionRecord,
  type CreateChatSessionPayload,
  type CreateCompactionPayload,
  type CreateTopicPagePayload,
  type CreateWikiCompileJobEventPayload,
  type CreateWikiCompileJobPayload,
  type DeleteMemoryResult,
  type DeleteTopicPageResult,
  type EngineHealth,
  type EngineRequest,
  EngineRpcError,
  type GetJobStatusResult,
  type GetMemoryEvidenceWindowAnchor,
  type GetMemoryEvidenceWindowsPayload,
  type GetMemoryEvidenceWindowsResult,
  type GraphEdge,
  type GraphEdgeCreatedBy,
  type GraphEdgeDimension,
  type GraphEvidenceAnchor,
  type GraphNeighborsPayload,
  type GraphNode,
  type GraphNodeKind,
  type GraphQueryResult,
  type GraphSubgraphPayload,
  type ImageGenerationHistoryRecord,
  type JobStatus,
  type JobSummary,
  type JobType,
  type ListMemoriesResult,
  type MemoryDetail,
  type MemoryEvidenceWindow,
  type MemorySummary,
  type ReindexResult,
  type RepairAction,
  type RepairResult,
  type RetrieveSourceHitChunk,
  type RetrieveSourceItem,
  type RetrieveSourcesFilter,
  type RetrieveSourcesPayload,
  type RetrieveSourcesResult,
  type RetrieveSourcesTraceTrack,
  type RetrieveTrackName,
  type SearchKnowledgeBasePayload,
  type SearchKnowledgeBaseResult,
  type SearchMemoryResult,
  type SessionEvidenceRecord,
  type SessionLeaseResult,
  type SourceContextCompressionLogEntry,
  type SourceContextPackGroup,
  type SourceContextPackOutlineItem,
  type SourceContextPackResult,
  type SourceContextPackSource,
  type SourceContextPackWindow,
  type SourceContextPackWindowPriority,
  type SourceKind,
  type TopicGraphEdge,
  type TopicGraphEdgeInput,
  type TopicGraphEdgeKind,
  type TopicPageDetail,
  type TopicPageSourceRef,
  type UpdateChatMessagePayload,
  type UpdateTopicPagePayload,
  type UpsertChatMessagePayload,
  type WebSearchHistoryRecord,
  type WikiCompileEventKind,
  type WikiCompileEventLevel,
  type WikiCompileJobEvent,
  type WikiCompileJobStatus,
  type WikiCompileJobSummary,
  type WikiCompileResultPayload,
  type WorkingSetLoadDepth,
  type WorkingSetStatusResult,
  engineErrorFromUnknown,
  isWorkerRequestMessage,
} from "@/src/shared/rpc";
import {
  buildFtsQuery,
  chunkText,
  excerpt,
  expandChineseBigrams,
  hashText,
  normalizeSourceUrl,
  normalizeText,
} from "@/src/shared/text";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import { compareChatMessagesForDisplay } from "./chat-message-order";

type SqlValue = string | number | bigint | null | Uint8Array;
type SqlRow = Record<string, SqlValue>;
type SqliteDb = {
  filename: string;
  exec: (options: string | { sql: string; bind?: unknown[] }) => void;
  selectValue: (sql: string, bind?: unknown[]) => SqlValue | undefined;
  selectObject: (sql: string, bind?: unknown[]) => SqlRow | undefined;
  selectObjects: (sql: string, bind?: unknown[]) => SqlRow[];
  close: () => void;
};
export type LocalEngineSqliteDb = SqliteDb;
type SqliteOpenOptions = {
  filename?: string;
  flags?: string;
  vfs?: string;
};
export type LocalEngineSqliteApi = {
  oo1: {
    DB: new (filenameOrOptions?: string | SqliteOpenOptions, flags?: string) => SqliteDb;
    OpfsDb?: new (filenameOrOptions?: string | SqliteOpenOptions, flags?: string) => SqliteDb;
  };
  version: {
    libVersion: string;
  };
  opfs?: unknown;
};
type SqliteInitModule = (config?: {
  locateFile?: (path: string) => string;
}) => Promise<LocalEngineSqliteApi>;
type LocalEngineDatabaseOpenResult = {
  db: SqliteDb;
  sqliteVersion?: string;
  opfs?: EngineHealth["opfs"];
};
type LocalEngineDatabaseOpener = () => Promise<LocalEngineDatabaseOpenResult>;
export interface LocalEngineOptions {
  openDatabase?: LocalEngineDatabaseOpener;
}

const databasePath = "/clio-browser-phase1.sqlite3";
const schemaVersion = 18;
const sourceNativeSchemaVersion = 12;
const staleJobMs = 60_000;
const defaultJobMaxAttempts = 3;
const staleSessionLeaseMs = 30_000;
const defaultRrfK = 60;
const keywordIndexMaxExpansionTerms = 6;
const keywordIndexMaxTermsPerSource = 160;
const keywordIndexMaxTermChars = 160;
const keywordIndexMaxChunkSamples = 12;
const keywordIndexMaxChunkSampleChars = 12_000;
const keywordIndexChunkTextMaxChars = 24_000;
const graphBuilderMaxChunkSamples = 12;
const graphBuilderMaxChunkSampleChars = 24_000;
const graphBuilderMaxTermsPerKind = 12;
const chunkMetaHeadVersion = 1;
const chunkMetaTitleMaxChars = 500;
const chunkMetaSourceTypeMaxChars = 100;
const chunkMetaDocContextMaxChars = 1_600;
const chunkMetaAbstractMaxChars = 1_200;
const chunkMetaEmbeddingPrefixMaxChars = 2_000;
const defaultWorkingSetBudgetTokens = 32_000;
const workingSetExcerptMaxChars = 280;
const defaultSourceContextPackTotalTokens = 12_000;
const maxSourceContextPackTotalTokens = 64_000;
const defaultSourceContextPackGroupTokens = 4_000;
const maxSourceContextPackGroupTokens = 24_000;
const defaultSourceContextPackGroups = 4;
const maxSourceContextPackGroups = 12;
const defaultSourceContextPackSources = 8;
const maxSourceContextPackSources = 40;
const defaultSourceContextPackWindowsPerSource = 2;
const maxSourceContextPackWindowsPerSource = 8;
const sourceContextPackMetaMaxTokens = 600;
const sourceContextPackOutlineMaxItems = 40;
const sourceContextPackOutlineMaxTokens = 800;
const sourceContextPackWindowSearchLimitMultiplier = 4;
const defaultEmbeddingProvider = {
  modelId: "clio-local-hash-v1",
  provider: "local-deterministic",
  label: "Clio local deterministic hash v1",
  dimension: 64,
  metric: "cosine",
} as const;
const searchableSourceLifecycleStatuses = ["fresh", "stale", "archived"] as const;
const keywordIndexStopWords = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "before",
  "between",
  "but",
  "can",
  "chunk",
  "could",
  "for",
  "from",
  "has",
  "have",
  "into",
  "its",
  "local",
  "may",
  "not",
  "or",
  "our",
  "source",
  "such",
  "than",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "this",
  "through",
  "using",
  "was",
  "were",
  "with",
]);

type SourceLifecycleStatus = "fresh" | "stale" | "archived" | "deleted";
type SearchableSourceLifecycleStatus = Exclude<SourceLifecycleStatus, "deleted">;
type SourceAnalysisLevel = "saved" | "analyzed";
const workingSetLoadDepths = ["meta", "outline", "chunks", "full"] as const;
type SourceAuditAction =
  | "source.created"
  | "source.superseded"
  | "source.deleted"
  | "source.stage_queued";

type SourceRetrievalTrack = "meta_sources" | "vector_meta" | "fts_chunks" | "vector_chunks";

interface SourceRetrievalHit {
  track: SourceRetrievalTrack;
  rank: number;
  source: SqlRow;
  chunk?: RetrieveSourceHitChunk;
  fallbackExcerpt?: string;
}

interface NormalizedRetrieveSourcesFilter {
  sourceTypes: string[];
  lifecycleStatuses: SearchableSourceLifecycleStatus[];
  hasSourceTypeFilter: boolean;
  hasImpossibleFilter: boolean;
}

interface SqlWhereClause {
  sql: string;
  bind: unknown[];
}

interface EmbeddingProvider {
  readonly modelId: string;
  readonly provider: string;
  readonly dimension: number;
  embed(input: string): number[];
}

interface GraphNodeInput {
  kind: GraphNodeKind;
  label: string;
  canonicalId: string;
  refId?: string;
}

interface GraphEdgeInput {
  sourceNodeId: string;
  targetNodeId: string;
  dimension: GraphEdgeDimension;
  edgeType: string;
  evidenceSourceId?: string;
  evidenceChunkIds: string[];
  weight: number;
  createdBy: GraphEdgeCreatedBy;
}

interface DeterministicGraphBuild {
  nodes: GraphNodeInput[];
  edges: Array<
    Omit<GraphEdgeInput, "sourceNodeId" | "targetNodeId"> & { targetCanonicalId: string }
  >;
  evidenceChunkIds: string[];
}

interface SourceContextPackOptions {
  query: string;
  ftsQuery: string;
  sourceIds: string[];
  anchors: GetMemoryEvidenceWindowAnchor[];
  useWorkingSet: boolean;
  maxTotalTokens: number;
  maxGroups: number;
  maxGroupTokens: number;
  maxSources: number;
  maxWindowsPerSource: number;
  contextChunksBefore: number;
  contextChunksAfter: number;
}

interface SourceContextPackCandidate {
  sourceId: string;
  rank: number;
  explicit: boolean;
  anchored: boolean;
  query: boolean;
  workingSet?: {
    loadDepth: WorkingSetLoadDepth;
    pinStatus: WorkingSetStatusResult["entries"][number]["pinStatus"];
    updatedAt: string;
  };
}

interface SourceContextSourceState {
  source: SourceContextPackSource;
  rank: number;
  capturedAt: string;
  updatedAt: string;
  metaTokenEstimate: number;
  outlineTokenEstimate: number;
  totalChunkTokens: number;
}

interface InternalSourceContextWindow extends SourceContextPackWindow {
  tokenEstimate: number;
}

interface SourceContextSourcePack {
  source: SourceContextPackSource;
  windows: InternalSourceContextWindow[];
  tokenEstimate: number;
  omittedWindowCount: number;
  omittedTokenEstimate: number;
}

interface DocumentDraft {
  kind: SourceKind;
  sourceUrl: string;
  normalizedSourceUrl: string;
  sourceTitle: string;
  normalizedText: string;
  textHash: string;
  capturedAt: string;
  metadataJson: string;
  versionGroupKey: string;
  pdfPages: PdfPageTextRange[];
}

interface PdfPageTextRange {
  pageNumber: number;
  charStart: number;
  charEnd: number;
}

interface ChunkPageRange {
  pageStart: number | null;
  pageEnd: number | null;
}

interface ChunkMetaHeadV1 {
  version: typeof chunkMetaHeadVersion;
  tier: "tier0";
  source: {
    title: string;
    type: string;
    abstract: string | null;
  };
  docContext: string;
  sectionPath: string | null;
  chunkSummary: string | null;
  roleHint: string | null;
  relations: string[];
}

interface SourceAdapterInput {
  kind: SourceKind;
  payload: CaptureBasePayload;
}

interface SourceAdapter {
  readonly id: string;
  readonly sourceTypes: readonly string[];
  match(input: SourceAdapterInput): boolean;
  adapt(input: SourceAdapterInput): DocumentDraft;
}

export class LocalEngine {
  private db: SqliteDb | null = null;
  private healthState: EngineHealth = startingHealth();
  private readonly openDatabase: LocalEngineDatabaseOpener;

  constructor(options: LocalEngineOptions = {}) {
    this.openDatabase = options.openDatabase ?? openProductionDatabase;
  }

  async handle(request: EngineRequest) {
    switch (request.kind) {
      case "health":
        return await this.health();
      case "capturePage":
        return await this.capture("page", request.payload);
      case "captureSelection":
        return await this.capture("selection", request.payload);
      case "retrieveSources":
        return await this.retrieveSources(request.payload);
      case "searchKnowledgeBase":
        return await this.searchKnowledgeBase(request.payload);
      case "listWorkingSetEntries":
      case "getWorkingSetStatus":
        return await this.getWorkingSetStatus();
      case "pinWorkingSetSource":
        return await this.pinWorkingSetSource(request.payload.sourceId, request.payload.loadDepth);
      case "evictWorkingSetSource":
        return await this.evictWorkingSetSource(request.payload.sourceId, request.payload.reason);
      case "setWorkingSetSourceDepth":
        return await this.setWorkingSetSourceDepth(
          request.payload.sourceId,
          request.payload.loadDepth,
        );
      case "reloadWorkingSetSource":
        return await this.reloadWorkingSetSource(
          request.payload.sourceId,
          request.payload.loadDepth,
        );
      case "searchMemory":
        return await this.search(request.query, request.limit);
      case "listMemories":
        return await this.list(request.limit);
      case "getMemory":
        return await this.get(request.id);
      case "getMemoryEvidenceWindows":
        return await this.getMemoryEvidenceWindows(request.payload);
      case "buildSourceContextPack":
        return await this.buildSourceContextPack(request.payload);
      case "deleteMemory":
        return await this.delete(request.id);
      case "listTopicPages":
        return await this.listTopicPages(request.query, request.limit);
      case "getTopicPage":
        return await this.getTopicPage(request.id);
      case "createTopicPage":
        return await this.createTopicPage(request.payload);
      case "updateTopicPage":
        return await this.updateTopicPage(request.id, request.payload);
      case "deleteTopicPage":
        return await this.deleteTopicPage(request.id);
      case "enqueueWikiCompile":
        return await this.enqueueWikiCompile(request.payload);
      case "listWikiCompileJobs":
        return await this.listWikiCompileJobs(request.status, request.limit);
      case "getWikiCompileJob":
        return await this.getWikiCompileJob(request.id);
      case "appendWikiCompileJobEvent":
        return await this.appendWikiCompileJobEvent(request.payload);
      case "listWikiCompileJobEvents":
        return await this.listWikiCompileJobEvents(request.jobId, request.limit);
      case "claimNextWikiCompileJob":
        return await this.claimNextWikiCompileJob(request.id, request.now);
      case "completeWikiCompileJob":
        return await this.completeWikiCompileJob(request.id, request.result);
      case "failWikiCompileJob":
        return await this.failWikiCompileJob(
          request.id,
          request.error,
          request.retryAfter,
          request.now,
        );
      case "listTopicGraphEdges":
        return await this.listTopicGraphEdges(request.topicId, request.edgeKind);
      case "buildSourceGraph":
        return await this.buildSourceGraph(request.payload);
      case "queryGraphNeighbors":
        return await this.queryGraphNeighbors(request.payload);
      case "queryGraphSubgraph":
        return await this.queryGraphSubgraph(request.payload);
      case "repair":
        return await this.repair(request.action);
      case "getJobStatus":
        return await this.getJobStatus(request.status, request.limit);
      case "runJob":
        return await this.runQueuedJob(request.id);
      case "reindex":
        return await this.reindex(request.scope);
      case "resolveAnchor":
        return await this.resolveAnchor(request.memoryId);
      case "createChatSession":
        return await this.createChatSession(request.payload);
      case "listChatSessions":
        return await this.listChatSessions(request.limit);
      case "loadChatSession":
        return await this.loadChatSession(request.sessionId);
      case "claimChatSession":
        return await this.claimChatSession(request.sessionId, request.ownerId, request.now);
      case "heartbeatChatSession":
        return await this.heartbeatChatSession(request.sessionId, request.ownerId, request.now);
      case "releaseChatSession":
        return await this.releaseChatSession(request.sessionId, request.ownerId);
      case "appendSessionEvidence":
        return await this.appendSessionEvidence(request.payload);
      case "appendCompaction":
        return await this.appendCompaction(request.payload);
      case "listCompactions":
        return await this.listCompactions(request.sessionId, request.limit);
      case "getLatestCompaction":
        return await this.getLatestCompaction(request.sessionId);
      case "upsertChatMessage":
        return await this.upsertChatMessage(request.payload);
      case "updateChatMessage":
        return await this.updateChatMessage(request.payload);
      case "deleteChatMessage":
        return await this.deleteChatMessage(request.sessionId, request.messageId);
      case "clearQueuedChatMessages":
        return await this.clearQueuedChatMessages(request.sessionId);
      case "recoverInterruptedChatSession":
        return await this.recoverInterruptedChatSession(request.sessionId);
      case "listWebSearchHistory":
        return await this.listWebSearchHistory(request.limit);
      case "appendWebSearchHistory":
        return await this.appendWebSearchHistory(request.payload);
      case "deleteWebSearchHistory":
        return await this.deleteWebSearchHistory(request.id);
      case "clearWebSearchHistory":
        return await this.clearWebSearchHistory();
      case "listImageGenerationHistory":
        return await this.listImageGenerationHistory(request.limit);
      case "appendImageGenerationHistory":
        return await this.appendImageGenerationHistory(request.payload);
      case "deleteImageGenerationHistory":
        return await this.deleteImageGenerationHistory(request.id);
      default:
        return assertNever(request);
    }
  }

  private async health(): Promise<EngineHealth> {
    if (this.db === null && this.healthState.status !== "error") {
      try {
        await this.ensureReady();
      } catch {
        return this.healthState;
      }
    }
    return this.healthState;
  }

  private async capture(kind: SourceKind, payload: CaptureBasePayload): Promise<CaptureResult> {
    const db = await this.ensureReady();
    const adapter = defaultSourceAdapterRegistry.resolve({ kind, payload });
    const draft = adapter.adapt({ kind, payload });
    const existing = db.selectObject(
      `SELECT *
       FROM sources
       WHERE source_kind = ?
         AND normalized_source_url = ?
         AND content_hash = ?
         AND lifecycle_status <> 'deleted'
       LIMIT 1`,
      [draft.kind, draft.normalizedSourceUrl, draft.textHash],
    );
    if (existing !== undefined) {
      return {
        status: "duplicate",
        memory: memorySummaryFromRow(existing),
      };
    }

    const chunks = chunkText(draft.normalizedText);
    if (chunks.length === 0) {
      throw new EngineRpcError("EMPTY_CAPTURE", "Nothing readable was found to save.");
    }
    const chunkRanges = locateChunkTextRanges(draft.normalizedText, chunks);

    const sourceId = createId("src");
    const previousVersion =
      draft.kind === "page" ? findCurrentPageVersion(db, draft.versionGroupKey) : undefined;
    const versionNo =
      previousVersion === undefined
        ? 1
        : Math.max(1, numberField(previousVersion, "version_no")) + 1;
    const supersedesSourceId =
      previousVersion === undefined ? undefined : stringField(previousVersion, "id");
    const chunkMetaHeadJson = buildChunkMetaHeadJson(draft);

    transaction(db, () => {
      insertSourceRow(db, {
        id: sourceId,
        kind: draft.kind,
        sourceUrl: draft.sourceUrl,
        normalizedSourceUrl: draft.normalizedSourceUrl,
        sourceTitle: draft.sourceTitle,
        capturedAt: draft.capturedAt,
        normalizedText: draft.normalizedText,
        contentHash: draft.textHash,
        metadataJson: draft.metadataJson,
        versionGroupKey: draft.versionGroupKey,
        versionNo,
        supersedesSourceId,
      });
      insertSourceLifecycleEvent(db, {
        sourceId,
        fromStatus: null,
        toStatus: "fresh",
        reason: "capture",
        createdAt: draft.capturedAt,
        payload: { sourceKind: draft.kind, versionNo },
      });
      insertSourceAuditLog(db, {
        action: "source.created",
        sourceId,
        targetKind: "source",
        targetId: sourceId,
        reason: "capture",
        createdAt: draft.capturedAt,
        payload: {
          sourceKind: draft.kind,
          versionNo,
          supersedesSourceId: supersedesSourceId ?? null,
        },
      });
      if (draft.kind === "page" && supersedesSourceId !== undefined) {
        markSourceSuperseded(db, {
          sourceId: supersedesSourceId,
          supersededBySourceId: sourceId,
          at: draft.capturedAt,
        });
      }

      for (const chunk of chunks) {
        const chunkId = `${sourceId}:${chunk.ord}`;
        const pageRange = pageRangeForChunk(chunkRanges.get(chunk.ord), draft.pdfPages);
        db.exec({
          sql: `INSERT INTO source_chunks (
            id,
            source_id,
            ord,
            text,
            token_count,
            hash,
            fts_text,
            role,
            parent_chunk_id,
            section_path,
            char_start,
            char_end,
            page_start,
            page_end,
            meta_head_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'child', NULL, NULL, ?, ?, ?, ?, ?)`,
          bind: [
            chunkId,
            sourceId,
            chunk.ord,
            chunk.text,
            chunk.tokenCount,
            chunk.hash,
            expandChineseBigrams(chunk.text),
            chunkRanges.get(chunk.ord)?.charStart ?? null,
            chunkRanges.get(chunk.ord)?.charEnd ?? null,
            pageRange.pageStart,
            pageRange.pageEnd,
            chunkMetaHeadJson,
          ],
        });
        insertSourceFtsRow(db, {
          sourceId,
          chunkId,
          sourceKind: draft.kind,
          title: draft.sourceTitle,
          text: chunk.text,
        });
      }
      replaceKeywordIndexForSource(db, sourceId);

      if (draft.kind === "selection") {
        insertAnchor(
          db,
          sourceId,
          payload as CaptureSelectionPayload,
          draft.normalizedText,
          draft.capturedAt,
        );
      }

      const jobId = enqueueJob(db, "post_capture_hardening", {
        sourceId,
        stages: ["embedding", "chunk_meta", "graph"],
      });
      insertSourceAuditLog(db, {
        action: "source.stage_queued",
        sourceId,
        targetKind: "job",
        targetId: jobId,
        reason: "post_capture_hardening",
        createdAt: draft.capturedAt,
        payload: {
          jobType: "post_capture_hardening",
          stages: ["embedding", "chunk_meta", "graph"],
        },
      });
    });

    const saved = db.selectObject("SELECT * FROM sources WHERE id = ? LIMIT 1", [sourceId]);
    return {
      status: "saved",
      memory:
        saved === undefined
          ? {
              id: sourceId,
              sourceKind: draft.kind,
              sourceUrl: draft.sourceUrl,
              sourceTitle: draft.sourceTitle,
              capturedAt: draft.capturedAt,
              excerpt: excerpt(draft.normalizedText),
              version: {
                groupKey: draft.versionGroupKey,
                versionNo,
                isCurrent: true,
                supersedesMemoryId: supersedesSourceId,
              },
            }
          : memorySummaryFromRow(saved),
    };
  }

  private async retrieveSources(payload: RetrieveSourcesPayload): Promise<RetrieveSourcesResult> {
    const db = await this.ensureReady();
    const query = normalizeText(payload.query);
    const limit = clampOptionalLimit(payload.limit, 20, 50);
    const includeChunks = clampOptionalLimit(payload.includeChunks, 3, 8);
    const ftsQuery = buildFtsQuery(query);
    const filters = normalizeRetrieveSourcesFilter(payload.filter);
    const traceTracks: RetrieveSourcesTraceTrack[] = [];

    if (filters.hasImpossibleFilter) {
      return emptyFilteredRetrieveSourcesResult(query, ftsQuery.length === 0);
    }

    if (ftsQuery.length === 0) {
      const sourceFilter = sourceFilterWhereClause(filters);
      const rows = db.selectObjects(
        `SELECT
          s.id,
          s.source_kind,
          s.source_url,
          s.normalized_source_url,
          s.source_title,
          s.captured_at,
          s.content_hash,
          s.version_group_key,
          s.version_no,
          s.supersedes_source_id,
          s.superseded_by_source_id,
          s.is_current
         FROM sources s
         WHERE ${sourceFilter.sql}
         ORDER BY s.captured_at DESC
         LIMIT ?`,
        [...sourceFilter.bind, limit],
      );
      traceTracks.push({
        name: "recent_sources",
        status: "used",
        itemCount: rows.length,
        reason: "empty_query",
      });
      traceTracks.push({
        name: "meta_sources",
        status: "skipped",
        itemCount: 0,
        reason: "empty_query",
      });
      traceTracks.push(vectorMetaSkippedTrace("empty_query"));
      traceTracks.push({
        name: "fts_chunks",
        status: "skipped",
        itemCount: 0,
        reason: "empty_query",
      });
      traceTracks.push(vectorSkippedTrace("empty_query"));
      return {
        query,
        items: rows.map((row, index) => ({
          ...memorySummaryFromRetrievalRow(
            row,
            stringField(row, "source_title") || stringField(row, "source_url"),
          ),
          score: reciprocalRankFusionScore(index + 1),
          tracks: ["recent_sources"],
          hitChunks: [],
        })),
        trace: {
          strategy: "rrf",
          rrfK: defaultRrfK,
          tracks: traceTracks,
        },
      };
    }

    const metaHits = loadMetaSourceRetrievalHits(db, {
      query,
      limit: Math.max(limit * 2, limit),
      filter: filters,
    });
    const vectorMetaResult = loadVectorMetaRetrievalHits(db, {
      query,
      limit: Math.max(limit * 2, limit),
      filter: filters,
    });
    const ftsHits = loadFtsChunkRetrievalHits(db, {
      query,
      limit: Math.max(limit * Math.max(includeChunks, 1) * 2, limit),
      filter: filters,
    });
    const vectorResult = loadVectorChunkRetrievalHits(db, {
      query,
      limit: Math.max(limit * Math.max(includeChunks, 1) * 2, limit),
      filter: filters,
    });
    const items = fuseSourceRetrievalHits(
      [...metaHits, ...vectorMetaResult.hits, ...ftsHits, ...vectorResult.hits],
      {
        limit,
        includeChunks,
        rrfK: defaultRrfK,
      },
    );
    traceTracks.push({
      name: "meta_sources",
      status: metaHits.length > 0 ? "used" : "skipped",
      itemCount: metaHits.length,
      ...(metaHits.length === 0 ? { reason: "no_matches" } : {}),
    });
    traceTracks.push(vectorMetaResult.trace);
    traceTracks.push({
      name: "fts_chunks",
      status: ftsHits.length > 0 ? "used" : "skipped",
      itemCount: ftsHits.length,
      ...(ftsHits.length === 0 ? { reason: "no_matches" } : {}),
    });
    traceTracks.push(vectorResult.trace);

    return {
      query,
      items,
      trace: {
        strategy: "rrf",
        rrfK: defaultRrfK,
        tracks: traceTracks,
      },
    };
  }

  private async searchKnowledgeBase(
    payload: SearchKnowledgeBasePayload,
  ): Promise<SearchKnowledgeBaseResult> {
    const db = await this.ensureReady();
    const query = normalizeText(payload.query);
    const limit = clampOptionalLimit(payload.limit, 20, 50);
    const includeChunks = clampOptionalLimit(payload.includeChunks, 3, 8);
    const original = await this.retrieveSources({
      query,
      limit,
      includeChunks,
      filter: payload.filter,
    });

    if (query.length === 0) {
      return {
        ...original,
        expansion: {
          status: "skipped",
          terms: [],
          reason: "empty_query",
          originalItemCount: original.items.length,
          expandedItemCount: 0,
        },
      };
    }

    const filters = normalizeRetrieveSourcesFilter(payload.filter);
    if (filters.hasImpossibleFilter) {
      return {
        ...original,
        expansion: {
          status: "skipped",
          terms: [],
          reason: "filter_no_match",
          originalItemCount: original.items.length,
          expandedItemCount: 0,
        },
      };
    }

    const terms = findKeywordExpansionTerms(db, {
      query,
      limit: keywordIndexMaxExpansionTerms,
      filter: filters,
    });
    if (terms.length === 0) {
      return {
        ...original,
        expansion: {
          status: "skipped",
          terms: [],
          reason: "no_terms",
          originalItemCount: original.items.length,
          expandedItemCount: 0,
        },
      };
    }

    const expandedQuery = normalizeText([query, ...terms].join(" "));
    if (buildFtsQuery(expandedQuery).length === 0) {
      return {
        ...original,
        expansion: {
          status: "skipped",
          terms,
          reason: "expanded_query_empty",
          originalItemCount: original.items.length,
          expandedItemCount: 0,
        },
      };
    }

    const expanded = await this.retrieveSources({
      query: expandedQuery,
      limit,
      includeChunks,
      filter: payload.filter,
    });

    return {
      ...original,
      items: mergeKnowledgeBaseSearchItems(original.items, expanded.items, {
        limit,
        includeChunks,
      }),
      expansion: {
        status: "used",
        terms,
        expandedQuery,
        originalItemCount: original.items.length,
        expandedItemCount: expanded.items.length,
      },
    };
  }

  private async search(query: string, limit = 30): Promise<SearchMemoryResult> {
    const db = await this.ensureReady();
    const normalizedQuery = normalizeText(query);
    const ftsQuery = buildFtsQuery(normalizedQuery);
    if (ftsQuery.length === 0) {
      return this.list(Math.min(limit, 50)).then((result) => ({
        items: result.items.map((item) => ({ ...item, snippet: item.excerpt })),
        query: normalizedQuery,
      }));
    }

    const rows = db.selectObjects(
      `SELECT
        s.id,
        s.source_kind,
        s.source_url,
        s.normalized_source_url,
        s.source_title,
        s.captured_at,
        s.normalized_text,
        s.content_hash,
        s.version_group_key,
        s.version_no,
        s.supersedes_source_id,
        s.superseded_by_source_id,
        s.is_current,
        c.text AS chunk_text,
        bm25(source_fts) AS score
       FROM source_fts
       JOIN sources s ON s.id = source_fts.source_id
       JOIN source_chunks c ON c.id = source_fts.chunk_id
       WHERE source_fts MATCH ?
         AND s.lifecycle_status <> 'deleted'
       ORDER BY score ASC
       LIMIT ?`,
      [ftsQuery, clampLimit(limit, 80)],
    );

    const seen = new Set<string>();
    const items = rows.flatMap((row) => {
      const id = stringField(row, "id");
      if (seen.has(id)) return [];
      seen.add(id);
      return [
        {
          ...memorySummaryFromRow(row),
          snippet: excerpt(stringField(row, "chunk_text") || stringField(row, "normalized_text")),
        },
      ];
    });

    return {
      items,
      query: normalizedQuery,
    };
  }

  private async list(limit = 30): Promise<ListMemoriesResult> {
    const db = await this.ensureReady();
    const rows = db.selectObjects(
      `SELECT *
       FROM sources
       WHERE lifecycle_status <> 'deleted'
       ORDER BY captured_at DESC
       LIMIT ?`,
      [clampLimit(limit, 100)],
    );
    return {
      items: rows.map(memorySummaryFromRow),
    };
  }

  private async get(id: string): Promise<MemoryDetail | null> {
    const db = await this.ensureReady();
    const row = db.selectObject(
      "SELECT * FROM sources WHERE id = ? AND lifecycle_status <> 'deleted' LIMIT 1",
      [id],
    );
    if (row === undefined) return null;
    const chunkRows = db.selectObjects(
      `SELECT id, ord, text, token_count, page_start, page_end
       FROM source_chunks
       WHERE source_id = ?
       ORDER BY ord ASC`,
      [id],
    );
    const anchor = db.selectObject("SELECT * FROM anchors WHERE memory_id = ? LIMIT 1", [id]);
    const metadata = db.selectObject(
      "SELECT metadata_json FROM source_metadata WHERE source_id = ? LIMIT 1",
      [id],
    );

    return {
      ...memorySummaryFromRow(row),
      normalizedText: stringField(row, "normalized_text"),
      metadata: parseMetadata(stringField(metadata ?? {}, "metadata_json")),
      anchor: anchor === undefined ? undefined : anchorFromRow(anchor),
      chunks: chunkRows.map((chunk) => ({
        id: stringField(chunk, "id"),
        ord: numberField(chunk, "ord"),
        text: stringField(chunk, "text"),
        tokenCount: numberField(chunk, "token_count"),
        ...optionalPageRangeFromRow(chunk),
      })),
    };
  }

  private async getMemoryEvidenceWindows(
    payload: GetMemoryEvidenceWindowsPayload,
  ): Promise<GetMemoryEvidenceWindowsResult> {
    const db = await this.ensureReady();
    const query = normalizeText(payload.query ?? "");
    const ftsQuery = buildFtsQuery(query);
    const sourceIds = boundedUniqueStrings(payload.memoryIds, 40);
    const explicitAnchors = boundedEvidenceWindowAnchors(payload.anchors, 80);
    const limit = clampOptionalLimit(payload.limit, 8, 20);
    const maxWindowsPerMemory = clampOptionalLimit(payload.maxWindowsPerMemory, 2, 4);
    const contextChunksBefore = clampOptionalCount(payload.contextChunksBefore, 1, 3);
    const contextChunksAfter = clampOptionalCount(payload.contextChunksAfter, 1, 3);
    const anchorRows = loadAnchorsBySourceId(db, [
      ...sourceIds,
      ...explicitAnchors.map((anchor) => anchor.memoryId),
    ]);
    const windows: MemoryEvidenceWindow[] = [];
    const seenWindows = new Set<string>();
    const windowsBySource = new Map<string, number>();

    const addWindow = (sourceId: string, anchorOrd: number) => {
      if (windows.length >= limit) return;
      const sourceCount = windowsBySource.get(sourceId) ?? 0;
      if (sourceCount >= maxWindowsPerMemory) return;
      const window = loadSourceEvidenceWindow(db, {
        sourceId,
        anchorOrd,
        contextChunksBefore,
        contextChunksAfter,
        anchor: anchorRows.get(sourceId),
      });
      if (window === undefined) return;
      const key = `${window.memoryId}:${window.chunkId}`;
      if (seenWindows.has(key)) return;
      seenWindows.add(key);
      windowsBySource.set(sourceId, sourceCount + 1);
      windows.push(window);
    };

    for (const anchor of explicitAnchors) {
      const anchorOrd = resolveEvidenceWindowAnchorOrd(db, anchor);
      if (anchorOrd === undefined) continue;
      addWindow(anchor.memoryId, anchorOrd);
    }

    if (ftsQuery.length > 0) {
      const bindings: unknown[] = [ftsQuery];
      const sourceFilter =
        sourceIds.length === 0 ? "" : ` AND s.id IN (${sourceIds.map(() => "?").join(", ")})`;
      bindings.push(...sourceIds, Math.max(limit * 4, limit + sourceIds.length));
      const rows = db.selectObjects(
        `SELECT
          s.id AS source_id,
          c.ord AS chunk_ord
         FROM source_fts
         JOIN sources s ON s.id = source_fts.source_id
         JOIN source_chunks c ON c.id = source_fts.chunk_id
         WHERE source_fts MATCH ?
           AND s.lifecycle_status <> 'deleted'
           ${sourceFilter}
         ORDER BY bm25(source_fts) ASC
         LIMIT ?`,
        bindings,
      );
      for (const row of rows) {
        addWindow(stringField(row, "source_id"), numberField(row, "chunk_ord"));
      }
    }

    if (windows.length < limit && sourceIds.length > 0) {
      const fallbackRows = db.selectObjects(
        `SELECT
          s.id AS source_id,
          MIN(c.ord) AS chunk_ord
         FROM sources s
         JOIN source_chunks c ON c.source_id = s.id
         WHERE s.lifecycle_status <> 'deleted'
           AND s.id IN (${sourceIds.map(() => "?").join(", ")})
         GROUP BY s.id
         ORDER BY s.captured_at DESC
         LIMIT ?`,
        [...sourceIds, sourceIds.length],
      );
      const fallbackOrdBySource = new Map(
        fallbackRows.map((row) => [stringField(row, "source_id"), numberField(row, "chunk_ord")]),
      );
      for (const sourceId of sourceIds) {
        const anchorOrd = fallbackOrdBySource.get(sourceId);
        if (anchorOrd === undefined) continue;
        addWindow(sourceId, anchorOrd);
      }
    }

    return {
      items: windows,
      ...(query.length === 0 ? {} : { query }),
    };
  }

  private async getWorkingSetStatus(): Promise<WorkingSetStatusResult> {
    const db = await this.ensureReady();
    return loadWorkingSetStatus(db);
  }

  private async buildSourceContextPack(
    payload: BuildSourceContextPackPayload,
  ): Promise<SourceContextPackResult> {
    const db = await this.ensureReady();
    return buildSourceContextPack(db, payload);
  }

  private async pinWorkingSetSource(
    sourceId: string,
    loadDepth: WorkingSetLoadDepth = "meta",
  ): Promise<WorkingSetStatusResult> {
    const db = await this.ensureReady();
    upsertWorkingSetEntry(db, {
      sourceId,
      loadDepth,
      pinStatus: "pinned",
      evictReason: null,
      reload: false,
    });
    return loadWorkingSetStatus(db);
  }

  private async evictWorkingSetSource(
    sourceId: string,
    reason?: string,
  ): Promise<WorkingSetStatusResult> {
    const db = await this.ensureReady();
    assertWorkingSetSource(db, sourceId);
    const now = new Date().toISOString();
    db.exec({
      sql: `INSERT INTO source_working_set (
              source_id,
              load_depth,
              pin_status,
              evict_reason,
              reload_count,
              loaded_at,
              updated_at
            ) VALUES (?, 'meta', 'evicted', ?, 0, ?, ?)
            ON CONFLICT(source_id) DO UPDATE SET
              load_depth = 'meta',
              pin_status = 'evicted',
              evict_reason = excluded.evict_reason,
              updated_at = excluded.updated_at`,
      bind: [normalizeRequiredId(sourceId, "sourceId"), normalizeText(reason ?? ""), now, now],
    });
    return loadWorkingSetStatus(db);
  }

  private async setWorkingSetSourceDepth(
    sourceId: string,
    loadDepth: WorkingSetLoadDepth,
  ): Promise<WorkingSetStatusResult> {
    const db = await this.ensureReady();
    upsertWorkingSetEntry(db, {
      sourceId,
      loadDepth,
      pinStatus: "auto",
      evictReason: null,
      reload: false,
    });
    return loadWorkingSetStatus(db);
  }

  private async reloadWorkingSetSource(
    sourceId: string,
    loadDepth: WorkingSetLoadDepth = "chunks",
  ): Promise<WorkingSetStatusResult> {
    const db = await this.ensureReady();
    upsertWorkingSetEntry(db, {
      sourceId,
      loadDepth,
      pinStatus: "auto",
      evictReason: null,
      reload: true,
    });
    return loadWorkingSetStatus(db);
  }

  private async delete(id: string): Promise<DeleteMemoryResult> {
    const db = await this.ensureReady();
    let deleted = false;
    transaction(db, () => {
      const source = db.selectObject(
        "SELECT * FROM sources WHERE id = ? AND lifecycle_status <> 'deleted' LIMIT 1",
        [id],
      );
      if (source === undefined) return;
      const deletedAt = new Date().toISOString();
      db.exec({
        sql: `UPDATE sources
              SET superseded_by_source_id = NULL
              WHERE superseded_by_source_id = ?`,
        bind: [id],
      });
      db.exec({
        sql: `UPDATE sources
              SET supersedes_source_id = NULL
              WHERE supersedes_source_id = ?`,
        bind: [id],
      });
      db.exec({ sql: "DELETE FROM anchors WHERE memory_id = ?", bind: [id] });
      db.exec({ sql: "DELETE FROM topic_graph_edges WHERE memory_id = ?", bind: [id] });
      deleteGraphForSource(db, id);
      db.exec({ sql: "DELETE FROM source_embeddings WHERE source_id = ?", bind: [id] });
      db.exec({ sql: "DELETE FROM source_working_set WHERE source_id = ?", bind: [id] });
      db.exec({ sql: "DELETE FROM source_metadata_fts WHERE source_id = ?", bind: [id] });
      db.exec({ sql: "DELETE FROM source_fts WHERE source_id = ?", bind: [id] });
      deleteKeywordIndexForSource(db, id);
      db.exec({ sql: "DELETE FROM source_chunks WHERE source_id = ?", bind: [id] });
      db.exec({ sql: "DELETE FROM source_metadata WHERE source_id = ?", bind: [id] });
      markSourceDeleted(db, {
        sourceId: id,
        deletedAt,
        reason: "delete_memory",
      });
      deleted = true;
    });
    return {
      deleted,
      id,
    };
  }

  private async listTopicPages(query: string | undefined, limit = 30) {
    const db = await this.ensureReady();
    const normalizedQuery = normalizeText(query ?? "");
    const clampedLimit = clampLimit(limit, 100);
    const rows =
      normalizedQuery.length === 0
        ? db.selectObjects(
            `SELECT *
             FROM topic_pages
             ORDER BY updated_at DESC
             LIMIT ?`,
            [clampedLimit],
          )
        : db.selectObjects(
            `SELECT *
             FROM topic_pages
             WHERE title LIKE ? ESCAPE '\\'
                OR summary LIKE ? ESCAPE '\\'
                OR content LIKE ? ESCAPE '\\'
             ORDER BY updated_at DESC
             LIMIT ?`,
            [
              `%${escapeLikePattern(normalizedQuery)}%`,
              `%${escapeLikePattern(normalizedQuery)}%`,
              `%${escapeLikePattern(normalizedQuery)}%`,
              clampedLimit,
            ],
          );
    return {
      items: rows.map(topicPageSummaryFromRow),
      ...(normalizedQuery.length === 0 ? {} : { query: normalizedQuery }),
    };
  }

  private async getTopicPage(id: string): Promise<TopicPageDetail | null> {
    const db = await this.ensureReady();
    const row = db.selectObject("SELECT * FROM topic_pages WHERE id = ? LIMIT 1", [id]);
    return row === undefined ? null : topicPageDetailFromRow(row);
  }

  private async createTopicPage(payload: CreateTopicPagePayload): Promise<TopicPageDetail> {
    const db = await this.ensureReady();
    const row = transaction(db, () => createTopicPageRow(db, payload));
    return topicPageDetailFromRow(row);
  }

  private async updateTopicPage(
    id: string,
    payload: UpdateTopicPagePayload,
  ): Promise<TopicPageDetail | null> {
    const db = await this.ensureReady();
    const row = transaction(db, () => updateTopicPageRow(db, id, payload));
    return row === undefined ? null : topicPageDetailFromRow(row);
  }

  private async deleteTopicPage(id: string): Promise<DeleteTopicPageResult> {
    const db = await this.ensureReady();
    transaction(db, () => {
      db.exec({
        sql: "DELETE FROM topic_graph_edges WHERE from_topic_id = ? OR to_topic_id = ?",
        bind: [id, id],
      });
      db.exec({
        sql: `UPDATE wiki_compile_jobs
              SET topic_id = CASE WHEN topic_id = ? THEN NULL ELSE topic_id END,
                  result_topic_id = CASE WHEN result_topic_id = ? THEN NULL ELSE result_topic_id END
              WHERE topic_id = ? OR result_topic_id = ?`,
        bind: [id, id, id, id],
      });
      db.exec({ sql: "DELETE FROM topic_pages WHERE id = ?", bind: [id] });
    });
    return {
      deleted: db.selectValue("SELECT changes()") !== 0,
      id,
    };
  }

  private async enqueueWikiCompile(
    payload: CreateWikiCompileJobPayload,
  ): Promise<WikiCompileJobSummary> {
    const db = await this.ensureReady();
    const now = normalizeOptionalIso(payload.createdAt) ?? new Date().toISOString();
    const id = payload.id ?? createId("wiki_job");
    const query = normalizeWikiCompileQuery(payload.query);
    const instructions = normalizeTopicText(payload.instructions ?? "", 4_000);
    const sourceMemoryIds = normalizeWikiSourceMemoryIds(payload.sourceMemoryIds ?? []);
    const maxAttempts = normalizeWikiMaxAttempts(payload.maxAttempts);
    const runAfter = normalizeOptionalIso(payload.runAfter);

    transaction(db, () => {
      db.exec({
        sql: `INSERT INTO wiki_compile_jobs (
          id,
          status,
          topic_id,
          query,
          instructions,
          source_memory_ids_json,
          attempts,
          max_attempts,
          run_after,
          created_at,
          updated_at
        ) VALUES (?, 'queued', ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        bind: [
          id,
          payload.topicId ?? null,
          query,
          instructions,
          JSON.stringify(sourceMemoryIds),
          maxAttempts,
          runAfter ?? null,
          now,
          now,
        ],
      });
      insertWikiCompileJobEvent(db, {
        jobId: id,
        kind: "queued",
        level: "info",
        message: "Compile queued.",
        detail: {
          query,
          sourceMemoryCount: sourceMemoryIds.length,
          hasTopic: payload.topicId !== undefined,
        },
        createdAt: now,
      });
    });

    const row = db.selectObject("SELECT * FROM wiki_compile_jobs WHERE id = ? LIMIT 1", [id]);
    if (row === undefined) {
      throw new EngineRpcError("WIKI_JOB_CREATE_FAILED", "Wiki compile job was not saved.");
    }
    return wikiCompileJobFromRow(row);
  }

  private async listWikiCompileJobs(
    status?: WikiCompileJobStatus,
    limit = 30,
  ): Promise<{ jobs: WikiCompileJobSummary[] }> {
    const db = await this.ensureReady();
    const clampedLimit = clampLimit(limit, 100);
    const rows =
      status === undefined
        ? db.selectObjects(
            `SELECT *
             FROM wiki_compile_jobs
             ORDER BY created_at DESC
             LIMIT ?`,
            [clampedLimit],
          )
        : db.selectObjects(
            `SELECT *
             FROM wiki_compile_jobs
             WHERE status = ?
             ORDER BY created_at DESC
             LIMIT ?`,
            [status, clampedLimit],
          );
    return { jobs: rows.map(wikiCompileJobFromRow) };
  }

  private async getWikiCompileJob(id: string): Promise<WikiCompileJobSummary | null> {
    const db = await this.ensureReady();
    const row = db.selectObject("SELECT * FROM wiki_compile_jobs WHERE id = ? LIMIT 1", [id]);
    return row === undefined ? null : wikiCompileJobFromRow(row);
  }

  private async appendWikiCompileJobEvent(
    payload: CreateWikiCompileJobEventPayload,
  ): Promise<WikiCompileJobEvent> {
    const db = await this.ensureReady();
    return insertWikiCompileJobEvent(db, payload);
  }

  private async listWikiCompileJobEvents(jobId: string, limit = 40) {
    const db = await this.ensureReady();
    const rows = db.selectObjects(
      `SELECT *
       FROM wiki_compile_job_events
       WHERE job_id = ?
       ORDER BY created_at ASC, id ASC
       LIMIT ?`,
      [jobId, clampLimit(limit, 100)],
    );
    return { events: rows.map(wikiCompileJobEventFromRow) };
  }

  private async claimNextWikiCompileJob(
    id?: string,
    nowInput?: string,
  ): Promise<WikiCompileJobSummary | null> {
    const db = await this.ensureReady();
    const now = normalizeOptionalIso(nowInput) ?? new Date().toISOString();
    let jobId: string | undefined;
    transaction(db, () => {
      const row =
        id === undefined
          ? db.selectObject(
              `SELECT *
               FROM wiki_compile_jobs
               WHERE status = 'queued'
                 AND (run_after IS NULL OR run_after <= ?)
               ORDER BY created_at ASC
               LIMIT 1`,
              [now],
            )
          : db.selectObject(
              `SELECT *
               FROM wiki_compile_jobs
               WHERE id = ?
                 AND status = 'queued'
                 AND (run_after IS NULL OR run_after <= ?)
               LIMIT 1`,
              [id, now],
            );
      if (row === undefined) return;
      jobId = stringField(row, "id");
      db.exec({
        sql: `UPDATE wiki_compile_jobs
              SET status = 'running',
                  attempts = attempts + 1,
                  claimed_at = ?,
                  updated_at = ?,
                  last_error = NULL
              WHERE id = ?`,
        bind: [now, now, jobId],
      });
      insertWikiCompileJobEvent(db, {
        jobId,
        kind: "claimed",
        level: "info",
        message: "Compile started.",
        createdAt: now,
      });
    });
    if (jobId === undefined) return null;
    const row = db.selectObject("SELECT * FROM wiki_compile_jobs WHERE id = ? LIMIT 1", [jobId]);
    return row === undefined ? null : wikiCompileJobFromRow(row);
  }

  private async completeWikiCompileJob(id: string, result: WikiCompileResultPayload) {
    const db = await this.ensureReady();
    const completedAt = normalizeOptionalIso(result.completedAt) ?? new Date().toISOString();
    let topicRow: SqlRow | undefined;
    let jobRow: SqlRow | undefined;

    transaction(db, () => {
      const job = db.selectObject("SELECT * FROM wiki_compile_jobs WHERE id = ? LIMIT 1", [id]);
      if (job === undefined) {
        throw new EngineRpcError("WIKI_JOB_NOT_FOUND", `Wiki compile job not found: ${id}`);
      }

      const existingTopicId = optionalString(job, "topic_id");
      const existingTopic =
        existingTopicId === undefined
          ? undefined
          : db.selectObject("SELECT * FROM topic_pages WHERE id = ? LIMIT 1", [existingTopicId]);
      const sourceRefs = compileSourceRefs(result);
      if (existingTopic !== undefined && existingTopicId !== undefined) {
        topicRow =
          updateTopicPageRow(db, existingTopicId, {
            ...compileTopicUpdatePayload(result),
            sourceRefs,
            updatedAt: completedAt,
          }) ?? undefined;
      }
      if (topicRow === undefined) {
        topicRow = createTopicPageRow(
          db,
          compileTopicCreatePayload(job, result, sourceRefs, completedAt),
        );
      }

      const topicId = stringField(topicRow, "id");
      const edgeCount = refreshTopicGraphEdges(
        db,
        topicId,
        sourceRefs,
        result.edges ?? [],
        completedAt,
      );
      db.exec({
        sql: `UPDATE wiki_compile_jobs
              SET status = 'done',
                  finished_at = ?,
                  updated_at = ?,
                  last_error = NULL,
                  result_topic_id = ?
              WHERE id = ?`,
        bind: [completedAt, completedAt, topicId, id],
      });
      insertWikiCompileJobEvent(db, {
        jobId: id,
        kind: "completed",
        level: "info",
        message: "Topic page saved.",
        detail: {
          topicId,
          sourceCount: sourceRefs.length,
          edgeCount,
        },
        createdAt: completedAt,
      });
      jobRow = db.selectObject("SELECT * FROM wiki_compile_jobs WHERE id = ? LIMIT 1", [id]);
    });

    if (topicRow === undefined || jobRow === undefined) {
      throw new EngineRpcError("WIKI_JOB_COMPLETE_FAILED", "Wiki compile job was not completed.");
    }
    return {
      job: wikiCompileJobFromRow(jobRow),
      topic: topicPageDetailFromRow(topicRow),
    };
  }

  private async failWikiCompileJob(
    id: string,
    error: string,
    retryAfter?: string,
    nowInput?: string,
  ): Promise<WikiCompileJobSummary | null> {
    const db = await this.ensureReady();
    const row = db.selectObject("SELECT * FROM wiki_compile_jobs WHERE id = ? LIMIT 1", [id]);
    if (row === undefined) return null;

    const now = normalizeOptionalIso(nowInput) ?? new Date().toISOString();
    const retryAt = normalizeOptionalIso(retryAfter);
    const attempts = numberField(row, "attempts");
    const maxAttempts = numberField(row, "max_attempts");
    const willRetry = retryAt !== undefined && attempts < maxAttempts;
    const message = normalizeTopicText(error, 2_000);
    transaction(db, () => {
      db.exec({
        sql: `UPDATE wiki_compile_jobs
              SET status = ?,
                  run_after = ?,
                  claimed_at = NULL,
                  finished_at = ?,
                  last_error = ?,
                  updated_at = ?
              WHERE id = ?`,
        bind: [
          willRetry ? "queued" : "failed",
          willRetry ? retryAt : null,
          willRetry ? null : now,
          message,
          now,
          id,
        ],
      });
      insertWikiCompileJobEvent(db, {
        jobId: id,
        kind: "failed",
        level: willRetry ? "warning" : "error",
        message,
        detail: {
          willRetry,
          attempts,
          maxAttempts,
          ...(retryAt === undefined ? {} : { retryAfter: retryAt }),
        },
        createdAt: now,
      });
    });

    const updated = db.selectObject("SELECT * FROM wiki_compile_jobs WHERE id = ? LIMIT 1", [id]);
    return updated === undefined ? null : wikiCompileJobFromRow(updated);
  }

  private async listTopicGraphEdges(topicId: string, kind?: TopicGraphEdgeKind) {
    const db = await this.ensureReady();
    const rows =
      kind === undefined
        ? db.selectObjects(
            `SELECT *
             FROM topic_graph_edges
             WHERE from_topic_id = ? OR to_topic_id = ?
             ORDER BY kind ASC, weight DESC, created_at DESC`,
            [topicId, topicId],
          )
        : db.selectObjects(
            `SELECT *
             FROM topic_graph_edges
             WHERE (from_topic_id = ? OR to_topic_id = ?)
               AND kind = ?
             ORDER BY weight DESC, created_at DESC`,
            [topicId, topicId, kind],
          );
    return { edges: rows.map(topicGraphEdgeFromRow) };
  }

  private async buildSourceGraph(
    payload: BuildSourceGraphPayload,
  ): Promise<BuildSourceGraphResult> {
    const db = await this.ensureReady();
    const sourceId = normalizeRequiredId(payload.sourceId, "sourceId");
    if (payload.mode !== undefined && payload.mode !== "deterministic") {
      throw new EngineRpcError("INVALID_GRAPH_MODE", `Unsupported graph mode: ${payload.mode}`);
    }

    const source = db.selectObject(
      `SELECT id
       FROM sources
       WHERE id = ?
         AND lifecycle_status <> 'deleted'
       LIMIT 1`,
      [sourceId],
    );
    if (source === undefined) {
      throw new EngineRpcError("SOURCE_NOT_FOUND", `Source not found: ${sourceId}`);
    }

    let result: BuildSourceGraphResult = {
      sourceId,
      nodeCount: 0,
      edgeCount: 0,
      evidenceChunkCount: 0,
    };
    transaction(db, () => {
      deleteGraphForSource(db, sourceId);
      const build = buildDeterministicGraphForSource(db, sourceId);
      if (build.nodes.length === 0) {
        result = {
          sourceId,
          nodeCount: 0,
          edgeCount: 0,
          evidenceChunkCount: 0,
          skipped: true,
          reason: "no_graph_candidates",
        };
        return;
      }

      const now = new Date().toISOString();
      const nodeIdsByCanonicalId = new Map<string, string>();
      for (const node of build.nodes) {
        const nodeId = upsertGraphNode(db, node, now);
        nodeIdsByCanonicalId.set(node.canonicalId, nodeId);
      }

      const sourceNodeId = nodeIdsByCanonicalId.get(`source:${sourceId}`);
      if (sourceNodeId === undefined) {
        throw new EngineRpcError("GRAPH_BUILD_FAILED", `Source graph node missing: ${sourceId}`);
      }

      let edgeCount = 0;
      for (const edge of build.edges) {
        const targetNodeId = nodeIdsByCanonicalId.get(edge.targetCanonicalId);
        if (targetNodeId === undefined) continue;
        insertGraphEdge(
          db,
          {
            sourceNodeId,
            targetNodeId,
            dimension: edge.dimension,
            edgeType: edge.edgeType,
            evidenceSourceId: edge.evidenceSourceId,
            evidenceChunkIds: edge.evidenceChunkIds,
            weight: edge.weight,
            createdBy: edge.createdBy,
          },
          now,
        );
        edgeCount += 1;
      }

      db.exec({
        sql: `UPDATE sources
              SET analysis_level = 'analyzed',
                  updated_at = ?
              WHERE id = ?`,
        bind: [now, sourceId],
      });

      result = {
        sourceId,
        nodeCount: build.nodes.length,
        edgeCount,
        evidenceChunkCount: build.evidenceChunkIds.length,
      };
    });
    return result;
  }

  private async queryGraphNeighbors(payload: GraphNeighborsPayload): Promise<GraphQueryResult> {
    const db = await this.ensureReady();
    return queryGraphNeighbors(db, payload);
  }

  private async queryGraphSubgraph(payload: GraphSubgraphPayload): Promise<GraphQueryResult> {
    const db = await this.ensureReady();
    return queryGraphSubgraph(db, payload);
  }

  private async repair(action: RepairAction): Promise<RepairResult> {
    switch (action) {
      case "retry_init":
        this.close();
        this.healthState = startingHealth();
        await this.ensureReady();
        return { action, health: this.healthState };
      case "rebuild_fts":
        await this.rebuildFts();
        return { action, health: this.healthState };
      case "reset_library":
        await this.resetLibrary();
        return { action, health: this.healthState };
      default:
        return assertNever(action);
    }
  }

  private async getJobStatus(status?: JobStatus, limit = 30): Promise<GetJobStatusResult> {
    const db = await this.ensureReady();
    const clampedLimit = clampLimit(limit, 100);
    const rows =
      status === undefined
        ? db.selectObjects(
            `SELECT *
             FROM jobs
             ORDER BY created_at DESC
             LIMIT ?`,
            [clampedLimit],
          )
        : db.selectObjects(
            `SELECT *
             FROM jobs
             WHERE status = ?
             ORDER BY created_at DESC
             LIMIT ?`,
            [status, clampedLimit],
          );
    return {
      jobs: rows.map(jobSummaryFromRow),
    };
  }

  private async runQueuedJob(id: string): Promise<JobSummary> {
    const db = await this.ensureReady();
    return runJob(db, id);
  }

  private async reindex(scope: "fts"): Promise<ReindexResult> {
    if (scope !== "fts") {
      throw new EngineRpcError("UNSUPPORTED_REINDEX_SCOPE", `Unsupported reindex scope: ${scope}`);
    }
    const db = await this.ensureReady();
    const jobId = enqueueJob(db, "reindex_fts", { scope });
    const job = runJob(db, jobId);
    return {
      jobId,
      status: job.status,
    };
  }

  private async resolveAnchor(memoryId: string): Promise<AnchorResolveResult> {
    const db = await this.ensureReady();
    const source = db.selectObject(
      "SELECT * FROM sources WHERE id = ? AND lifecycle_status <> 'deleted' LIMIT 1",
      [memoryId],
    );
    if (source === undefined) {
      return { status: "missing_memory", memoryId };
    }
    const anchor = db.selectObject("SELECT * FROM anchors WHERE memory_id = ? LIMIT 1", [memoryId]);
    if (anchor === undefined) {
      return {
        status: "missing_anchor",
        memoryId,
        sourceUrl: stringField(source, "source_url"),
        sourceTitle: stringField(source, "source_title"),
        sourceKind: sourceKindField(source, "source_kind"),
      };
    }

    const resolvedAt = new Date().toISOString();
    db.exec({
      sql: `UPDATE anchors
            SET last_resolved_at = ?,
                last_resolution_status = 'returned'
            WHERE id = ?`,
      bind: [resolvedAt, stringField(anchor, "id")],
    });

    return {
      status: "resolved",
      memoryId,
      sourceUrl: stringField(source, "source_url"),
      sourceTitle: stringField(source, "source_title"),
      sourceKind: sourceKindField(source, "source_kind"),
      anchor: {
        ...anchorFromRow(anchor),
        lastResolutionStatus: "returned",
      },
    };
  }

  private async createChatSession(payload: CreateChatSessionPayload): Promise<ChatSessionSummary> {
    const db = await this.ensureReady();
    const now = payload.createdAt ?? new Date().toISOString();
    const sessionId = payload.id ?? createId("sess");
    const title = normalizeSessionTitle(payload.title);
    const pageUrl = payload.pageUrl?.trim() || null;
    const pageTitle = payload.pageTitle?.trim() || null;
    const normalizedPageUrl = pageUrl === null ? null : normalizeSourceUrl(pageUrl);

    db.exec({
      sql: `INSERT INTO sessions (
        id,
        title,
        source_page_url,
        source_page_title,
        normalized_page_url,
        initial_scope,
        current_evidence_revision,
        message_count,
        last_message_excerpt,
        owner_id,
        owner_heartbeat_at,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, '', ?, ?, ?, ?, ?)`,
      bind: [
        sessionId,
        title,
        pageUrl,
        pageTitle,
        normalizedPageUrl,
        payload.initialScope ?? null,
        payload.ownerId ?? null,
        payload.ownerId === undefined ? null : now,
        JSON.stringify(payload.metadata ?? {}),
        now,
        now,
      ],
    });

    const row = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    if (row === undefined) {
      throw new EngineRpcError("SESSION_CREATE_FAILED", "Chat session was not created.");
    }
    return chatSessionSummaryFromRow(row);
  }

  private async listChatSessions(limit = 30): Promise<{ items: ChatSessionSummary[] }> {
    const db = await this.ensureReady();
    const rows = db.selectObjects(
      `SELECT *
       FROM sessions
       ORDER BY updated_at DESC
       LIMIT ?`,
      [clampLimit(limit, 30)],
    );
    return {
      items: rows.map(chatSessionSummaryFromRow),
    };
  }

  private async loadChatSession(sessionId: string): Promise<ChatSessionDetail | null> {
    const db = await this.ensureReady();
    return loadChatSessionDetail(db, sessionId);
  }

  private async claimChatSession(
    sessionId: string,
    ownerId: string,
    nowInput?: string,
  ): Promise<SessionLeaseResult> {
    const db = await this.ensureReady();
    const row = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    if (row === undefined) return { status: "missing" };

    const existingOwnerId = optionalString(row, "owner_id");
    const heartbeatAt = optionalString(row, "owner_heartbeat_at");
    const now = nowInput ?? new Date().toISOString();
    if (
      existingOwnerId !== undefined &&
      existingOwnerId !== ownerId &&
      heartbeatAt !== undefined &&
      !isStaleSessionLease(heartbeatAt)
    ) {
      return {
        status: "already_open",
        session: chatSessionSummaryFromRow(row),
        ownerId: existingOwnerId,
        ownerHeartbeatAt: heartbeatAt,
      };
    }

    db.exec({
      sql: `UPDATE sessions
            SET owner_id = ?,
                owner_heartbeat_at = ?
            WHERE id = ?`,
      bind: [ownerId, now, sessionId],
    });
    const updated = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    return {
      status: "claimed",
      session:
        updated === undefined ? chatSessionSummaryFromRow(row) : chatSessionSummaryFromRow(updated),
    };
  }

  private async heartbeatChatSession(
    sessionId: string,
    ownerId: string,
    nowInput?: string,
  ): Promise<SessionLeaseResult> {
    const db = await this.ensureReady();
    const row = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    if (row === undefined) return { status: "missing" };
    const existingOwnerId = optionalString(row, "owner_id");
    const heartbeatAt = optionalString(row, "owner_heartbeat_at");
    if (
      existingOwnerId !== undefined &&
      existingOwnerId !== ownerId &&
      heartbeatAt !== undefined &&
      !isStaleSessionLease(heartbeatAt)
    ) {
      return {
        status: "already_open",
        session: chatSessionSummaryFromRow(row),
        ownerId: existingOwnerId,
        ownerHeartbeatAt: heartbeatAt,
      };
    }

    const now = nowInput ?? new Date().toISOString();
    db.exec({
      sql: `UPDATE sessions
            SET owner_id = ?,
                owner_heartbeat_at = ?
            WHERE id = ?`,
      bind: [ownerId, now, sessionId],
    });
    const updated = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    return {
      status: "claimed",
      session:
        updated === undefined ? chatSessionSummaryFromRow(row) : chatSessionSummaryFromRow(updated),
    };
  }

  private async releaseChatSession(
    sessionId: string,
    ownerId: string,
  ): Promise<SessionLeaseResult> {
    const db = await this.ensureReady();
    const row = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    if (row === undefined) return { status: "missing" };
    if (optionalString(row, "owner_id") !== ownerId) {
      return {
        status: "already_open",
        session: chatSessionSummaryFromRow(row),
        ownerId: optionalString(row, "owner_id"),
        ownerHeartbeatAt: optionalString(row, "owner_heartbeat_at"),
      };
    }
    db.exec({
      sql: `UPDATE sessions
            SET owner_id = NULL,
                owner_heartbeat_at = NULL
            WHERE id = ?`,
      bind: [sessionId],
    });
    const updated = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
    return {
      status: "claimed",
      session:
        updated === undefined ? chatSessionSummaryFromRow(row) : chatSessionSummaryFromRow(updated),
    };
  }

  private async appendSessionEvidence(
    payload: AppendSessionEvidencePayload,
  ): Promise<SessionEvidenceRecord> {
    const db = await this.ensureReady();
    const session = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [
      payload.sessionId,
    ]);
    if (session === undefined) {
      throw new EngineRpcError("SESSION_NOT_FOUND", `Chat session not found: ${payload.sessionId}`);
    }

    const now = payload.createdAt ?? new Date().toISOString();
    const evidenceId = payload.id ?? createId("ev");
    let revision = 1;
    transaction(db, () => {
      const currentRevision = db.selectValue(
        "SELECT COALESCE(MAX(revision), 0) FROM session_evidence WHERE session_id = ?",
        [payload.sessionId],
      );
      revision =
        typeof currentRevision === "number" ? currentRevision + 1 : Number(currentRevision) + 1;
      const metadata = {
        ...(payload.metadata ?? {}),
        ...(payload.evidence.anchor === undefined ? {} : { anchor: payload.evidence.anchor }),
      };
      db.exec({
        sql: `INSERT INTO session_evidence (
          id,
          session_id,
          revision,
          source_kind,
          page_url,
          page_title,
          text,
          excerpt,
          metadata_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [
          evidenceId,
          payload.sessionId,
          revision,
          payload.evidence.sourceKind,
          payload.evidence.sourceUrl,
          payload.evidence.sourceTitle,
          payload.evidence.text,
          payload.evidence.excerpt,
          JSON.stringify(metadata),
          now,
        ],
      });
      db.exec({
        sql: `UPDATE sessions
              SET current_evidence_revision = ?,
                  updated_at = ?
              WHERE id = ?`,
        bind: [revision, now, payload.sessionId],
      });
    });

    const row = db.selectObject("SELECT * FROM session_evidence WHERE id = ? LIMIT 1", [
      evidenceId,
    ]);
    if (row === undefined) {
      throw new EngineRpcError("EVIDENCE_CREATE_FAILED", "Session evidence was not created.");
    }
    return sessionEvidenceFromRow(row);
  }

  private async appendCompaction(payload: CreateCompactionPayload): Promise<CompactionRecord> {
    const db = await this.ensureReady();
    const session = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [
      payload.sessionId,
    ]);
    if (session === undefined) {
      throw new EngineRpcError("SESSION_NOT_FOUND", `Chat session not found: ${payload.sessionId}`);
    }

    const previousCompactionId =
      payload.previousCompactionId === undefined ? null : payload.previousCompactionId;
    if (previousCompactionId !== null) {
      const previous = db.selectObject(
        "SELECT id FROM compactions WHERE id = ? AND session_id = ? LIMIT 1",
        [previousCompactionId, payload.sessionId],
      );
      if (previous === undefined) {
        throw new EngineRpcError(
          "COMPACTION_PREVIOUS_NOT_FOUND",
          `Previous compaction not found: ${previousCompactionId}`,
        );
      }
    }

    const compactionId = payload.id ?? createId("cmp");
    const createdAt = payload.createdAt ?? new Date().toISOString();
    db.exec({
      sql: `INSERT INTO compactions (
        id,
        session_id,
        summary,
        first_kept_message_id,
        evidence_summary,
        first_kept_evidence_id,
        first_kept_evidence_revision,
        previous_compaction_id,
        covered_evidence_json,
        tokens_before,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        compactionId,
        payload.sessionId,
        payload.summary,
        payload.firstKeptMessageId,
        payload.evidenceSummary,
        payload.firstKeptEvidenceId ?? null,
        payload.firstKeptEvidenceRevision ?? null,
        previousCompactionId,
        JSON.stringify(payload.coveredEvidence ?? []),
        payload.tokensBefore,
        createdAt,
      ],
    });

    const row = db.selectObject("SELECT * FROM compactions WHERE id = ? LIMIT 1", [compactionId]);
    if (row === undefined) {
      throw new EngineRpcError("COMPACTION_CREATE_FAILED", "Compaction record was not created.");
    }
    return compactionRecordFromRow(row);
  }

  private async listCompactions(
    sessionId: string,
    limit = 30,
  ): Promise<{ items: CompactionRecord[] }> {
    const db = await this.ensureReady();
    const rows = db.selectObjects(
      `SELECT *
       FROM compactions
       WHERE session_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [sessionId, clampLimit(limit, 30)],
    );
    return {
      items: rows.map(compactionRecordFromRow),
    };
  }

  private async getLatestCompaction(sessionId: string): Promise<CompactionRecord | null> {
    const db = await this.ensureReady();
    const row = db.selectObject(
      `SELECT *
       FROM compactions
       WHERE session_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [sessionId],
    );
    return row === undefined ? null : compactionRecordFromRow(row);
  }

  private async upsertChatMessage(payload: UpsertChatMessagePayload): Promise<ChatMessageRecord> {
    const db = await this.ensureReady();
    const session = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [
      payload.sessionId,
    ]);
    if (session === undefined) {
      throw new EngineRpcError("SESSION_NOT_FOUND", `Chat session not found: ${payload.sessionId}`);
    }

    const now = payload.updatedAt ?? payload.createdAt ?? new Date().toISOString();
    const createdAt = payload.createdAt ?? now;
    const piAgentMessageJson = payload.piAgentMessageJson ?? defaultPiAgentMessageJson(payload);
    transaction(db, () => {
      db.exec({
        sql: `INSERT INTO messages (
          id,
          session_id,
          role,
          status,
          content,
          scope,
          page_url,
          page_title,
          selection_text,
          citations_json,
          world_knowledge_json,
          evidence_refs_json,
          error_json,
          retry_json,
          pi_agent_message_json,
          run_id,
          queue_order,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          content = excluded.content,
          page_url = excluded.page_url,
          page_title = excluded.page_title,
          selection_text = excluded.selection_text,
          citations_json = excluded.citations_json,
          world_knowledge_json = excluded.world_knowledge_json,
          evidence_refs_json = excluded.evidence_refs_json,
          error_json = excluded.error_json,
          retry_json = excluded.retry_json,
          pi_agent_message_json = excluded.pi_agent_message_json,
          run_id = excluded.run_id,
          queue_order = excluded.queue_order,
          updated_at = excluded.updated_at`,
        bind: [
          payload.id,
          payload.sessionId,
          payload.role,
          payload.status,
          payload.content,
          payload.scope,
          payload.pageUrl ?? null,
          payload.pageTitle ?? null,
          payload.selectionText ?? null,
          JSON.stringify(payload.citations ?? []),
          JSON.stringify(payload.worldKnowledge ?? []),
          JSON.stringify(payload.evidenceRefs ?? []),
          JSON.stringify(payload.error ?? null),
          JSON.stringify(payload.retry ?? null),
          JSON.stringify(piAgentMessageJson),
          payload.runId ?? null,
          payload.queueOrder ?? null,
          createdAt,
          now,
        ],
      });
      refreshSessionStats(db, payload.sessionId, now);
    });

    const row = db.selectObject("SELECT * FROM messages WHERE id = ? LIMIT 1", [payload.id]);
    if (row === undefined) {
      throw new EngineRpcError("MESSAGE_UPSERT_FAILED", "Chat message was not saved.");
    }
    return chatMessageRecordFromRow(row);
  }

  private async updateChatMessage(payload: UpdateChatMessagePayload): Promise<ChatMessageRecord> {
    const db = await this.ensureReady();
    const row = db.selectObject("SELECT * FROM messages WHERE id = ? AND session_id = ? LIMIT 1", [
      payload.id,
      payload.sessionId,
    ]);
    if (row === undefined) {
      throw new EngineRpcError("MESSAGE_NOT_FOUND", `Chat message not found: ${payload.id}`);
    }
    const existing = chatMessageRecordFromRow(row);
    const error = payload.clearError === true ? undefined : (payload.error ?? existing.error);
    const retry = payload.clearRetry === true ? undefined : (payload.retry ?? existing.retry);
    const piAgentMessageJson = payload.piAgentMessageJson ?? existing.piAgentMessageJson;
    const runId = payload.runId ?? existing.runId;
    const queueOrder = payload.queueOrder ?? existing.queueOrder;
    const merged: UpsertChatMessagePayload = {
      id: existing.id,
      sessionId: existing.sessionId,
      role: existing.role,
      status: payload.status ?? existing.status,
      content:
        payload.content ??
        (payload.appendContent === undefined
          ? existing.content
          : `${existing.content}${payload.appendContent}`),
      scope: existing.scope,
      createdAt: existing.createdAt,
      updatedAt: payload.updatedAt ?? new Date().toISOString(),
      ...(existing.pageUrl === undefined ? {} : { pageUrl: existing.pageUrl }),
      ...(existing.pageTitle === undefined ? {} : { pageTitle: existing.pageTitle }),
      ...(existing.selectionText === undefined ? {} : { selectionText: existing.selectionText }),
      citations: payload.citations ?? existing.citations,
      worldKnowledge: payload.worldKnowledge ?? existing.worldKnowledge,
      evidenceRefs: payload.evidenceRefs ?? existing.evidenceRefs,
      ...(error === undefined ? {} : { error }),
      ...(retry === undefined ? {} : { retry }),
      ...(piAgentMessageJson === undefined ? {} : { piAgentMessageJson }),
      ...(runId === undefined ? {} : { runId }),
      ...(queueOrder === undefined ? {} : { queueOrder }),
    };
    return await this.upsertChatMessage(merged);
  }

  private async deleteChatMessage(
    sessionId: string,
    messageId: string,
  ): Promise<{ deleted: boolean }> {
    const db = await this.ensureReady();
    const now = new Date().toISOString();
    let deleted = 0;
    transaction(db, () => {
      db.exec({
        sql: `DELETE FROM messages
              WHERE id = ?
                AND session_id = ?`,
        bind: [messageId, sessionId],
      });
      deleted = Number(db.selectValue("SELECT changes()") ?? 0);
      refreshSessionStats(db, sessionId, now);
    });
    return { deleted: deleted > 0 };
  }

  private async clearQueuedChatMessages(sessionId: string): Promise<{ cleared: number }> {
    const db = await this.ensureReady();
    const now = new Date().toISOString();
    db.exec({
      sql: `UPDATE messages
            SET status = 'cancelled',
                error_json = ?,
                updated_at = ?
            WHERE session_id = ?
              AND status = 'queued'`,
      bind: [
        JSON.stringify({ code: "CANCELLED", message: "Queued message cleared." }),
        now,
        sessionId,
      ],
    });
    const cleared = Number(db.selectValue("SELECT changes()") ?? 0);
    refreshSessionStats(db, sessionId, now);
    return { cleared };
  }

  private async recoverInterruptedChatSession(
    sessionId: string,
  ): Promise<ChatSessionDetail | null> {
    const db = await this.ensureReady();
    const now = new Date().toISOString();
    transaction(db, () => {
      db.exec({
        sql: `UPDATE messages
              SET status = 'interrupted',
                  error_json = ?,
                  updated_at = ?
              WHERE session_id = ?
                AND role = 'assistant'
                AND status = 'streaming'`,
        bind: [
          JSON.stringify({
            code: "PROVIDER_INTERRUPTED",
            message: "Clio lost the active answer. Retry when ready.",
          }),
          now,
          sessionId,
        ],
      });
      refreshSessionStats(db, sessionId, now);
    });
    return loadChatSessionDetail(db, sessionId);
  }

  private async listWebSearchHistory(limit = 10): Promise<{ items: WebSearchHistoryRecord[] }> {
    const db = await this.ensureReady();
    const rows = db.selectObjects(
      `SELECT *
       FROM web_search_history
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [clampLimit(limit, 10)],
    );
    return { items: rows.map(webSearchHistoryRecordFromRow) };
  }

  private async appendWebSearchHistory(
    payload: WebSearchHistoryRecord,
  ): Promise<WebSearchHistoryRecord> {
    const db = await this.ensureReady();
    transaction(db, () => {
      db.exec({
        sql: `INSERT INTO web_search_history (
          id,
          query,
          answer,
          sources_json,
          provider,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          query = excluded.query,
          answer = excluded.answer,
          sources_json = excluded.sources_json,
          provider = excluded.provider,
          created_at = excluded.created_at`,
        bind: [
          payload.id,
          payload.query,
          payload.answer,
          JSON.stringify(payload.sources),
          payload.provider,
          payload.createdAt,
        ],
      });
      db.exec(`
        DELETE FROM web_search_history
        WHERE id NOT IN (
          SELECT id
          FROM web_search_history
          ORDER BY created_at DESC, id DESC
          LIMIT 10
        )
      `);
    });

    const row = db.selectObject("SELECT * FROM web_search_history WHERE id = ? LIMIT 1", [
      payload.id,
    ]);
    if (row === undefined) {
      throw new EngineRpcError("WEB_SEARCH_HISTORY_CREATE_FAILED", "Search history was not saved.");
    }
    return webSearchHistoryRecordFromRow(row);
  }

  private async deleteWebSearchHistory(id: string): Promise<{ deleted: boolean }> {
    const db = await this.ensureReady();
    db.exec({
      sql: "DELETE FROM web_search_history WHERE id = ?",
      bind: [id],
    });
    return { deleted: Number(db.selectValue("SELECT changes()") ?? 0) > 0 };
  }

  private async clearWebSearchHistory(): Promise<{ cleared: number }> {
    const db = await this.ensureReady();
    db.exec("DELETE FROM web_search_history");
    return { cleared: Number(db.selectValue("SELECT changes()") ?? 0) };
  }

  private async listImageGenerationHistory(
    limit = 20,
  ): Promise<{ items: ImageGenerationHistoryRecord[] }> {
    const db = await this.ensureReady();
    const rows = db.selectObjects(
      `SELECT *
       FROM image_generation_history
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [clampLimit(limit, 20)],
    );
    return { items: rows.map(imageGenerationHistoryRecordFromRow) };
  }

  private async appendImageGenerationHistory(
    payload: ImageGenerationHistoryRecord,
  ): Promise<ImageGenerationHistoryRecord> {
    const db = await this.ensureReady();
    transaction(db, () => {
      db.exec({
        sql: `INSERT INTO image_generation_history (
          id,
          mode,
          prompt,
          model,
          size,
          provider,
          output_mime_type,
          output_data_url,
          output_b64_json,
          input_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          mode = excluded.mode,
          prompt = excluded.prompt,
          model = excluded.model,
          size = excluded.size,
          provider = excluded.provider,
          output_mime_type = excluded.output_mime_type,
          output_data_url = excluded.output_data_url,
          output_b64_json = excluded.output_b64_json,
          input_json = excluded.input_json,
          created_at = excluded.created_at`,
        bind: [
          payload.id,
          payload.mode,
          payload.prompt,
          payload.model,
          payload.size,
          payload.provider,
          payload.output.mimeType,
          payload.output.dataUrl,
          payload.output.b64Json,
          JSON.stringify(payload.input ?? null),
          payload.createdAt,
        ],
      });
      db.exec(`
        DELETE FROM image_generation_history
        WHERE id NOT IN (
          SELECT id
          FROM image_generation_history
          ORDER BY created_at DESC, id DESC
          LIMIT 20
        )
      `);
    });

    const row = db.selectObject("SELECT * FROM image_generation_history WHERE id = ? LIMIT 1", [
      payload.id,
    ]);
    if (row === undefined) {
      throw new EngineRpcError(
        "IMAGE_GENERATION_HISTORY_CREATE_FAILED",
        "Image generation history was not saved.",
      );
    }
    return imageGenerationHistoryRecordFromRow(row);
  }

  private async deleteImageGenerationHistory(id: string): Promise<{ deleted: boolean }> {
    const db = await this.ensureReady();
    db.exec({
      sql: "DELETE FROM image_generation_history WHERE id = ?",
      bind: [id],
    });
    return { deleted: Number(db.selectValue("SELECT changes()") ?? 0) > 0 };
  }

  private async rebuildFts() {
    const db = await this.ensureReady();
    rebuildFtsData(db);
    this.healthState = readyHealth(this.healthState.sqliteVersion);
  }

  private async resetLibrary() {
    const db = await this.ensureReady();
    transaction(db, () => {
      db.exec("DELETE FROM jobs");
      db.exec("DELETE FROM source_audit_log");
      db.exec("DELETE FROM source_lifecycle_events");
      db.exec("DELETE FROM graph_edges");
      db.exec("DELETE FROM graph_nodes");
      db.exec("DELETE FROM source_working_set");
      db.exec("DELETE FROM source_metadata");
      db.exec("DELETE FROM keyword_index_sources");
      db.exec("DELETE FROM keyword_index");
      db.exec("DELETE FROM topic_graph_edges");
      db.exec("DELETE FROM wiki_compile_job_events");
      db.exec("DELETE FROM wiki_compile_jobs");
      db.exec("DELETE FROM topic_pages");
      db.exec("DELETE FROM anchors");
      db.exec("DELETE FROM source_embeddings");
      db.exec("DELETE FROM source_metadata_fts");
      db.exec("DELETE FROM source_fts");
      db.exec("DELETE FROM source_chunks");
      db.exec("DELETE FROM sources");
    });
    this.healthState = readyHealth(this.healthState.sqliteVersion);
  }

  private async ensureReady() {
    if (this.db !== null) return this.db;
    if (this.healthState.status === "error") {
      throw new EngineRpcError(
        "ENGINE_UNAVAILABLE",
        this.healthState.message ?? "Engine unavailable",
      );
    }

    this.healthState = startingHealth();
    try {
      const opened = await this.openDatabase();
      const db = opened.db;
      const opfs = opened.opfs ?? "available";
      this.db = db;
      migrate(db);
      recoverStaleJobs(db);
      const integrity = db.selectValue("PRAGMA integrity_check");
      if (integrity !== "ok") {
        this.healthState = {
          status: "degraded",
          message: "SQLite integrity check did not return ok.",
          detail: String(integrity),
          sqliteVersion: opened.sqliteVersion,
          opfs,
          checkedAt: new Date().toISOString(),
        };
        throw new EngineRpcError("SQLITE_INTEGRITY", "Local memory storage needs repair.");
      }

      this.healthState = readyHealth(opened.sqliteVersion, opfs);
      return db;
    } catch (error) {
      if (error instanceof EngineRpcError && error.code === "SQLITE_INTEGRITY") {
        throw error;
      }
      const engineError = engineErrorFromUnknown(error, "ENGINE_INIT_FAILED");
      this.close();
      this.healthState = {
        status: "error",
        message: engineError.message,
        detail: engineError.detail,
        opfs: "unavailable",
        checkedAt: new Date().toISOString(),
      };
      throw new EngineRpcError(engineError.code, engineError.message, engineError.detail);
    }
  }

  close() {
    if (this.db === null) return;
    this.db.close();
    this.db = null;
  }
}

async function openProductionDatabase(): Promise<LocalEngineDatabaseOpenResult> {
  const sqliteInit = sqlite3InitModule as unknown as SqliteInitModule;
  const sqlite3 = await sqliteInit({
    locateFile: (path) =>
      path === "sqlite3.wasm" ? new URL(sqliteWasmUrl, location.href).href : path,
  });
  if (sqlite3.oo1.OpfsDb === undefined) {
    throw new EngineRpcError(
      "OPFS_UNAVAILABLE",
      "SQLite OPFS storage is unavailable in this browser context.",
    );
  }

  return {
    db: new sqlite3.oo1.OpfsDb(databasePath, "c"),
    sqliteVersion: sqlite3.version.libVersion,
    opfs: "available",
  };
}

type LocalEngineWorkerGlobal = typeof globalThis & {
  addEventListener: (type: "message", listener: (event: MessageEvent<unknown>) => void) => void;
  postMessage: (message: unknown) => void;
};

function installWorkerMessageHandler(workerSelf: LocalEngineWorkerGlobal, engine: LocalEngine) {
  workerSelf.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!isWorkerRequestMessage(event.data)) return;
    const { requestId, request } = event.data;
    void engine
      .handle(request)
      .then((value) => {
        workerSelf.postMessage({
          type: CLIO_WORKER_RESPONSE,
          requestId,
          response: { ok: true, value },
        });
      })
      .catch((error) => {
        workerSelf.postMessage({
          type: CLIO_WORKER_RESPONSE,
          requestId,
          response: {
            ok: false,
            error: engineErrorFromUnknown(error),
          },
        });
      });
  });
}

function currentWorkerGlobal(): LocalEngineWorkerGlobal | null {
  const candidate = globalThis as Partial<LocalEngineWorkerGlobal>;
  if (typeof window !== "undefined") return null;
  if (typeof candidate.addEventListener !== "function") return null;
  if (typeof candidate.postMessage !== "function") return null;
  return candidate as LocalEngineWorkerGlobal;
}

const workerSelf = currentWorkerGlobal();
if (workerSelf !== null) {
  installWorkerMessageHandler(workerSelf, new LocalEngine());
}

function migrate(db: SqliteDb) {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  const currentVersion = Number(db.selectValue("PRAGMA user_version") ?? 0);
  if (currentVersion < sourceNativeSchemaVersion) {
    dropPreSourceNativeTables(db);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      source_kind TEXT NOT NULL CHECK (source_kind IN ('page', 'selection')),
      source_type TEXT NOT NULL,
      source_url TEXT NOT NULL,
      normalized_source_url TEXT NOT NULL,
      source_title TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL CHECK (
        lifecycle_status IN ('fresh', 'stale', 'archived', 'deleted')
      ),
      analysis_level TEXT NOT NULL CHECK (analysis_level IN ('saved', 'analyzed')),
      version_group_key TEXT,
      version_no INTEGER NOT NULL DEFAULT 1,
      supersedes_source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
      superseded_by_source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
      is_current INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_metadata (
      source_id TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT '',
      content_hash TEXT NOT NULL DEFAULT '',
      captured_at TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      section_outline_json TEXT NOT NULL DEFAULT '[]',
      abstract TEXT,
      authors_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_chunks (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      ord INTEGER NOT NULL,
      text TEXT NOT NULL,
      token_count INTEGER NOT NULL,
      hash TEXT NOT NULL,
      fts_text TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'child' CHECK (role IN ('parent', 'child')),
      parent_chunk_id TEXT REFERENCES source_chunks(id) ON DELETE SET NULL,
      section_path TEXT,
      char_start INTEGER,
      char_end INTEGER,
      page_start INTEGER,
      page_end INTEGER,
      meta_head_json TEXT,
      UNIQUE (source_id, ord)
    )
  `);
  ensureColumn(db, "source_chunks", "page_start", "INTEGER");
  ensureColumn(db, "source_chunks", "page_end", "INTEGER");
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS source_fts USING fts5(
      source_id UNINDEXED,
      chunk_id UNINDEXED,
      source_kind UNINDEXED,
      title,
      body,
      tokenize = 'unicode61 remove_diacritics 2'
    )
  `);
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS source_metadata_fts USING fts5(
      source_id UNINDEXED,
      source_kind UNINDEXED,
      lifecycle_status UNINDEXED,
      title,
      abstract,
      source_type,
      url,
      tokenize = 'unicode61 remove_diacritics 2'
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS embedding_models (
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
    CREATE TABLE IF NOT EXISTS source_embeddings (
      model_id TEXT NOT NULL REFERENCES embedding_models(id) ON DELETE CASCADE,
      target_kind TEXT NOT NULL CHECK (target_kind IN ('chunk', 'meta')),
      target_id TEXT NOT NULL,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      vector_json TEXT NOT NULL,
      text_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (model_id, target_kind, target_id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS keyword_index (
      term TEXT PRIMARY KEY,
      normalized_term TEXT NOT NULL,
      source_count INTEGER NOT NULL DEFAULT 0,
      hit_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS keyword_index_sources (
      term TEXT NOT NULL REFERENCES keyword_index(term) ON DELETE CASCADE,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      hit_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (term, source_id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_working_set (
      source_id TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
      load_depth TEXT NOT NULL CHECK (load_depth IN ('meta', 'outline', 'chunks', 'full')),
      pin_status TEXT NOT NULL CHECK (pin_status IN ('pinned', 'auto', 'evicted')),
      evict_reason TEXT,
      reload_count INTEGER NOT NULL DEFAULT 0,
      loaded_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_lifecycle_events (
      id TEXT PRIMARY KEY,
      source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
      from_status TEXT CHECK (
        from_status IS NULL OR from_status IN ('fresh', 'stale', 'archived', 'deleted')
      ),
      to_status TEXT NOT NULL CHECK (to_status IN ('fresh', 'stale', 'archived', 'deleted')),
      reason TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_audit_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      source_id TEXT REFERENCES sources(id) ON DELETE SET NULL,
      target_kind TEXT NOT NULL DEFAULT '',
      target_id TEXT,
      reason TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS anchors (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('dom')),
      selected_text TEXT NOT NULL,
      context_before TEXT NOT NULL,
      context_after TEXT NOT NULL,
      xpath TEXT,
      text_fragment TEXT,
      created_at TEXT NOT NULL,
      last_resolved_at TEXT,
      last_resolution_status TEXT,
      confidence REAL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      run_after TEXT,
      heartbeat_at TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      result_json TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_page_url TEXT,
      source_page_title TEXT,
      normalized_page_url TEXT,
      initial_scope TEXT CHECK (initial_scope IS NULL OR initial_scope IN ('general', 'current-page', 'selection')),
      current_evidence_revision INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      last_message_excerpt TEXT NOT NULL DEFAULT '',
      owner_id TEXT,
      owner_heartbeat_at TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_evidence (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      source_kind TEXT NOT NULL CHECK (source_kind IN ('page', 'selection')),
      page_url TEXT NOT NULL,
      page_title TEXT NOT NULL,
      text TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      UNIQUE (session_id, revision)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'evidence')),
      status TEXT NOT NULL CHECK (status IN ('queued', 'streaming', 'completed', 'failed', 'cancelled', 'interrupted')),
      content TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('general', 'current-page', 'selection')),
      page_url TEXT,
      page_title TEXT,
      selection_text TEXT,
      citations_json TEXT NOT NULL DEFAULT '[]',
      world_knowledge_json TEXT NOT NULL DEFAULT '[]',
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      error_json TEXT,
      retry_json TEXT,
      pi_agent_message_json TEXT,
      run_id TEXT,
      queue_order INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS compactions (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      first_kept_message_id TEXT NOT NULL,
      evidence_summary TEXT NOT NULL,
      first_kept_evidence_id TEXT,
      first_kept_evidence_revision INTEGER,
      previous_compaction_id TEXT REFERENCES compactions(id) ON DELETE SET NULL,
      covered_evidence_json TEXT NOT NULL DEFAULT '[]',
      tokens_before INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS web_search_history (
      id TEXT PRIMARY KEY,
      query TEXT NOT NULL,
      answer TEXT NOT NULL,
      sources_json TEXT NOT NULL DEFAULT '[]',
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS image_generation_history (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL CHECK (mode IN ('generate', 'edit')),
      prompt TEXT NOT NULL,
      model TEXT NOT NULL,
      size TEXT NOT NULL,
      provider TEXT NOT NULL,
      output_mime_type TEXT NOT NULL,
      output_data_url TEXT NOT NULL,
      output_b64_json TEXT NOT NULL,
      input_json TEXT,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS topic_pages (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      source_refs_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS wiki_compile_jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
      topic_id TEXT REFERENCES topic_pages(id) ON DELETE SET NULL,
      query TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      source_memory_ids_json TEXT NOT NULL DEFAULT '[]',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      run_after TEXT,
      claimed_at TEXT,
      finished_at TEXT,
      last_error TEXT,
      result_topic_id TEXT REFERENCES topic_pages(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS wiki_compile_job_events (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES wiki_compile_jobs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (
        kind IN (
          'queued',
          'claimed',
          'sources_selected',
          'provider_started',
          'provider_delta',
          'completed',
          'failed'
        )
      ),
      level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
      message TEXT NOT NULL DEFAULT '',
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS topic_graph_edges (
      id TEXT PRIMARY KEY,
      from_topic_id TEXT NOT NULL REFERENCES topic_pages(id) ON DELETE CASCADE,
      to_topic_id TEXT REFERENCES topic_pages(id) ON DELETE CASCADE,
      memory_id TEXT REFERENCES sources(id) ON DELETE CASCADE,
      chunk_id TEXT REFERENCES source_chunks(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('source', 'related', 'mentions')),
      weight REAL NOT NULL DEFAULT 1,
      label TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS graph_nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (
        kind IN ('source', 'person', 'venue', 'domain', 'problem', 'method', 'dataset', 'metric')
      ),
      label TEXT NOT NULL,
      canonical_id TEXT NOT NULL,
      ref_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (kind, canonical_id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS graph_edges (
      id TEXT PRIMARY KEY,
      source_node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
      target_node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
      dimension TEXT NOT NULL CHECK (dimension IN ('metadata', 'citation', 'domain', 'technical')),
      edge_type TEXT NOT NULL,
      evidence_source_id TEXT REFERENCES sources(id) ON DELETE CASCADE,
      evidence_chunk_ids_json TEXT NOT NULL DEFAULT '[]',
      weight REAL NOT NULL DEFAULT 1 CHECK (weight >= 0 AND weight <= 1),
      created_by TEXT NOT NULL CHECK (created_by IN ('adapter', 'graph_builder', 'user')),
      created_at TEXT NOT NULL
    )
  `);
  ensureAgentScopeCheckConstraints(db);

  db.exec("CREATE INDEX IF NOT EXISTS idx_sources_captured_at ON sources(captured_at DESC)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sources_version_group ON sources(version_group_key)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sources_current ON sources(is_current)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(lifecycle_status)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_sources_identity ON sources(source_kind, normalized_source_url, content_hash)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_source_chunks_source_ord ON source_chunks(source_id, ord)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_source_chunks_parent ON source_chunks(parent_chunk_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_source_metadata_source ON source_metadata(source_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_embedding_models_status ON embedding_models(status)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_source_embeddings_source ON source_embeddings(source_id)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_source_embeddings_target ON source_embeddings(target_kind, target_id)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_keyword_index_normalized_term ON keyword_index(normalized_term)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_keyword_index_sources_source ON keyword_index_sources(source_id)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_source_working_set_updated ON source_working_set(pin_status, updated_at DESC)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_source_lifecycle_source ON source_lifecycle_events(source_id, created_at)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_source_audit_source ON source_audit_log(source_id, created_at)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_source_audit_target ON source_audit_log(target_kind, target_id)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_anchors_memory ON anchors(memory_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, run_after)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at DESC)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_sessions_owner ON sessions(owner_id, owner_heartbeat_at)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_session_evidence_session ON session_evidence(session_id, revision)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_messages_run ON messages(run_id)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_compactions_session_created ON compactions(session_id, created_at)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_compactions_previous ON compactions(previous_compaction_id)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_web_search_history_created ON web_search_history(created_at DESC)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_image_generation_history_created ON image_generation_history(created_at DESC)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_topic_pages_updated ON topic_pages(updated_at DESC)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_topic_pages_slug ON topic_pages(slug)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_wiki_compile_jobs_status ON wiki_compile_jobs(status, run_after)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_wiki_compile_jobs_topic ON wiki_compile_jobs(topic_id)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_wiki_compile_events_job ON wiki_compile_job_events(job_id, created_at)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_topic_graph_edges_from ON topic_graph_edges(from_topic_id, kind)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_topic_graph_edges_to ON topic_graph_edges(to_topic_id, kind)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_topic_graph_edges_memory ON topic_graph_edges(memory_id, kind)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_graph_nodes_kind_canonical ON graph_nodes(kind, canonical_id)",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_graph_nodes_kind_ref ON graph_nodes(kind, ref_id)");
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_graph_edges_source_dimension ON graph_edges(source_node_id, dimension)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_graph_edges_target_dimension ON graph_edges(target_node_id, dimension)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_graph_edges_evidence_source ON graph_edges(evidence_source_id)",
  );
  ensureDefaultEmbeddingModel(db);
  db.exec(`PRAGMA user_version = ${schemaVersion}`);
}

function dropPreSourceNativeTables(db: SqliteDb) {
  db.exec("DROP TABLE IF EXISTS topic_graph_edges");
  db.exec("DROP TABLE IF EXISTS wiki_compile_job_events");
  db.exec("DROP TABLE IF EXISTS wiki_compile_jobs");
  db.exec("DROP TABLE IF EXISTS topic_pages");
  db.exec("DROP TABLE IF EXISTS anchors");
  db.exec("DROP TABLE IF EXISTS source_working_set");
  db.exec("DROP TABLE IF EXISTS keyword_index_sources");
  db.exec("DROP TABLE IF EXISTS keyword_index");
  db.exec("DROP TABLE IF EXISTS source_embeddings");
  db.exec("DROP TABLE IF EXISTS embedding_models");
  db.exec("DROP TABLE IF EXISTS source_metadata_fts");
  db.exec("DROP TABLE IF EXISTS source_fts");
  db.exec("DROP TABLE IF EXISTS source_chunks");
  db.exec("DROP TABLE IF EXISTS source_audit_log");
  db.exec("DROP TABLE IF EXISTS source_lifecycle_events");
  db.exec("DROP TABLE IF EXISTS source_metadata");
  db.exec("DROP TABLE IF EXISTS sources");
  db.exec("DROP TABLE IF EXISTS memory_fts");
  db.exec("DROP TABLE IF EXISTS chunks");
  db.exec("DROP TABLE IF EXISTS memories");
}

function ensureAgentScopeCheckConstraints(db: SqliteDb) {
  const sessionsSql = tableCreateSql(db, "sessions");
  const messagesSql = tableCreateSql(db, "messages");
  if (sessionsSql.includes("'general'") && messagesSql.includes("'general'")) return;

  db.exec("PRAGMA foreign_keys = OFF");
  try {
    transaction(db, () => {
      if (!sessionsSql.includes("'general'")) rebuildSessionsTable(db);
      if (!messagesSql.includes("'general'")) rebuildMessagesTable(db);
    });
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function tableCreateSql(db: SqliteDb, table: string) {
  const row = db.selectObject("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", [
    table,
  ]);
  return stringField(row ?? {}, "sql");
}

function ensureColumn(db: SqliteDb, table: string, column: string, definition: string) {
  const rows = db.selectObjects(`PRAGMA table_info(${table})`);
  if (rows.some((row) => stringField(row, "name") === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

class SourceAdapterRegistry {
  private readonly adapters: SourceAdapter[] = [];
  private readonly adaptersById = new Map<string, SourceAdapter>();
  private readonly adaptersBySourceType = new Map<string, SourceAdapter>();

  constructor(private readonly fallbackAdapter: SourceAdapter) {}

  registerAdapter(adapter: SourceAdapter) {
    const adapterId = normalizeAdapterKey(adapter.id);
    if (adapterId === undefined) throw new Error("Source adapter id is required.");
    if (this.adaptersById.has(adapterId)) {
      throw new Error(`Duplicate source adapter id: ${adapter.id}`);
    }

    const sourceTypes = adapter.sourceTypes.map((value) => normalizeAdapterKey(value));
    for (const sourceType of sourceTypes) {
      if (sourceType === undefined) continue;
      if (this.adaptersBySourceType.has(sourceType)) {
        throw new Error(`Duplicate active source adapter for source_type: ${sourceType}`);
      }
    }

    this.adapters.push(adapter);
    this.adaptersById.set(adapterId, adapter);
    for (const sourceType of sourceTypes) {
      if (sourceType !== undefined) this.adaptersBySourceType.set(sourceType, adapter);
    }
  }

  resolve(input: SourceAdapterInput): SourceAdapter {
    const metadata = payloadMetadata(input.payload);
    const adapterHint = adapterHintFromMetadata(metadata);
    const hintedAdapter =
      adapterHint === undefined
        ? undefined
        : (this.adaptersById.get(adapterHint) ?? this.adaptersBySourceType.get(adapterHint));
    if (hintedAdapter !== undefined) return hintedAdapter;

    const sourceType = metadataString(metadata, "source_type");
    const sourceTypeAdapter =
      sourceType === undefined ? undefined : this.adaptersBySourceType.get(sourceType);
    if (sourceTypeAdapter !== undefined) return sourceTypeAdapter;

    const matched = this.adapters.find(
      (adapter) => adapter !== this.fallbackAdapter && adapter.match(input),
    );
    return matched ?? this.fallbackAdapter;
  }
}

const webpageSourceAdapter: SourceAdapter = {
  id: "webpage",
  sourceTypes: ["webpage"],
  match: () => true,
  adapt: ({ kind, payload }) => buildDocumentDraft(kind, payload),
};

const markdownSourceAdapter: SourceAdapter = {
  id: "markdown",
  sourceTypes: ["markdown"],
  match: (input) => isMarkdownAdapterInput(input),
  adapt: ({ kind, payload }) => {
    const source = parseMarkdownDocument(payload.normalizedText);
    const inputMetadata = payloadMetadata(payload);
    const frontmatter = source.frontmatter;
    const sourceUrl = metadataDisplayString(frontmatter, "source_url") ?? payload.sourceUrl;
    const capturedAt = metadataDisplayString(frontmatter, "captured_at") ?? payload.capturedAt;
    const sourceTitle =
      metadataDisplayString(frontmatter, "title") ??
      firstMarkdownHeading(source.body, 1) ??
      payload.sourceTitle;
    const sectionOutline = markdownSectionOutline(source.body);
    const metadata: Record<string, unknown> = {
      ...inputMetadata,
      ...frontmatter,
      adapter: "markdown",
      source_type: "markdown",
      title: sourceTitle,
      source_url: sourceUrl,
    };
    const abstract = metadataDisplayString(frontmatter, "abstract");
    if (abstract !== undefined) metadata.abstract = abstract;
    const authors = metadataStringArray(frontmatter, "authors");
    if (authors.length > 0) metadata.authors = authors;
    if (sectionOutline.length > 0) metadata.sectionOutline = sectionOutline;

    return buildDocumentDraft(kind, payload, {
      sourceUrl,
      sourceTitle,
      normalizedText: source.body,
      capturedAt,
      metadata,
    });
  },
};

const paperSourceAdapter: SourceAdapter = {
  id: "paper",
  sourceTypes: ["paper"],
  match: (input) => isPaperAdapterInput(input),
  adapt: ({ kind, payload }) => {
    const inputMetadata = payloadMetadata(payload);
    const extraction = extractPaperMetadata(payload);
    const sourceUrl = metadataDisplayString(inputMetadata, "source_url") ?? payload.sourceUrl;
    const capturedAt = metadataDisplayString(inputMetadata, "captured_at") ?? payload.capturedAt;
    const metadata: Record<string, unknown> = {
      ...inputMetadata,
      adapter: "paper",
      source_type: "paper",
    };

    normalizePaperMetadata(metadata, inputMetadata, extraction);
    const sourceTitle =
      metadataDisplayString(metadata, "title") ?? extraction.title ?? payload.sourceTitle;
    setMetadataIfMissing(metadata, "title", sourceTitle);

    return buildDocumentDraft(kind, payload, {
      sourceUrl,
      sourceTitle,
      capturedAt,
      metadata,
    });
  },
};

const pdfSourceAdapter: SourceAdapter = {
  id: "pdf",
  sourceTypes: ["pdf"],
  match: (input) => isPdfAdapterInput(input),
  adapt: ({ kind, payload }) => {
    const inputMetadata = payloadMetadata(payload);
    const extraction = extractPaperMetadata(payload);
    const sourceUrl = metadataDisplayString(inputMetadata, "source_url") ?? payload.sourceUrl;
    const capturedAt = metadataDisplayString(inputMetadata, "captured_at") ?? payload.capturedAt;
    const metadata: Record<string, unknown> = {
      ...inputMetadata,
      adapter: "pdf",
      source_type: "pdf",
    };

    setMetadataIfMissing(metadata, "mime_type", "application/pdf");
    setMetadataIfMissing(metadata, "parser", "pdfjs");
    normalizePaperMetadata(metadata, inputMetadata, extraction);

    const sourceTitle =
      metadataDisplayString(metadata, "title") ?? extraction.title ?? payload.sourceTitle;
    setMetadataIfMissing(metadata, "title", sourceTitle);

    return buildDocumentDraft(kind, payload, {
      sourceUrl,
      sourceTitle,
      capturedAt,
      metadata,
    });
  },
};

const defaultSourceAdapterRegistry = createSourceAdapterRegistry([
  webpageSourceAdapter,
  markdownSourceAdapter,
  pdfSourceAdapter,
  paperSourceAdapter,
]);

function createSourceAdapterRegistry(adapters: SourceAdapter[]) {
  const fallbackAdapter =
    adapters.find((adapter) => adapter.id === "webpage") ?? webpageSourceAdapter;
  const registry = new SourceAdapterRegistry(fallbackAdapter);
  registry.registerAdapter(fallbackAdapter);
  for (const adapter of adapters) {
    if (adapter !== fallbackAdapter) registry.registerAdapter(adapter);
  }
  return registry;
}

function buildDocumentDraft(
  kind: SourceKind,
  payload: CaptureBasePayload,
  overrides: {
    sourceUrl?: string;
    sourceTitle?: string;
    normalizedText?: string;
    capturedAt?: string;
    metadata?: Record<string, unknown>;
  } = {},
): DocumentDraft {
  const normalizedText = normalizeText(overrides.normalizedText ?? payload.normalizedText);
  if (normalizedText.length === 0) {
    throw new EngineRpcError("EMPTY_CAPTURE", "Nothing readable was found to save.");
  }

  const sourceUrl = (overrides.sourceUrl ?? payload.sourceUrl).trim();
  const normalizedSourceUrl = normalizeSourceUrl(sourceUrl);
  const sourceTitle =
    (overrides.sourceTitle ?? payload.sourceTitle).trim() || fallbackTitle(sourceUrl);
  const textHash = hashText(normalizedText);
  return {
    kind,
    sourceUrl,
    normalizedSourceUrl,
    sourceTitle,
    normalizedText,
    textHash,
    capturedAt: overrides.capturedAt ?? payload.capturedAt ?? new Date().toISOString(),
    metadataJson: JSON.stringify(overrides.metadata ?? payload.metadata ?? {}),
    versionGroupKey: buildMemoryVersionGroupKey(kind, normalizedSourceUrl, textHash),
    pdfPages: pdfPageTextRanges(overrides.metadata ?? payload.metadata ?? {}),
  };
}

function pdfPageTextRanges(metadata: Record<string, unknown>): PdfPageTextRange[] {
  const rawPages = metadata.pdf_pages;
  if (!Array.isArray(rawPages)) return [];
  return rawPages
    .flatMap((page): PdfPageTextRange[] => {
      if (!isRecord(page)) return [];
      const pageNumber = metadataNumber(page.pageNumber);
      const charStart = metadataNumber(page.charStart);
      const charEnd = metadataNumber(page.charEnd);
      if (
        pageNumber === undefined ||
        charStart === undefined ||
        charEnd === undefined ||
        pageNumber < 1 ||
        charStart < 0 ||
        charEnd < charStart
      ) {
        return [];
      }
      return [
        {
          pageNumber: Math.floor(pageNumber),
          charStart: Math.floor(charStart),
          charEnd: Math.floor(charEnd),
        },
      ];
    })
    .sort((left, right) => left.charStart - right.charStart || left.pageNumber - right.pageNumber);
}

function locateChunkTextRanges(
  normalizedText: string,
  chunks: Array<{ ord: number; text: string }>,
) {
  const ranges = new Map<number, { charStart: number; charEnd: number }>();
  let cursor = 0;
  for (const chunk of chunks) {
    const charStart = normalizedText.indexOf(chunk.text, cursor);
    if (charStart < 0) break;
    const charEnd = charStart + chunk.text.length;
    ranges.set(chunk.ord, { charStart, charEnd });
    cursor = Math.max(cursor, charStart + 1);
  }
  if (ranges.size === chunks.length) return ranges;

  const compact = compactTextWithOriginalOffsets(normalizedText);
  ranges.clear();
  cursor = 0;
  for (const chunk of chunks) {
    const compactChunk = normalizeText(chunk.text).replace(/\s+/g, " ");
    const compactStart = compact.text.indexOf(compactChunk, cursor);
    if (compactStart < 0) continue;
    const compactEnd = compactStart + compactChunk.length;
    const charStart = compact.offsets[compactStart];
    const charEndOffset = compact.offsets[Math.max(compactStart, compactEnd - 1)];
    if (charStart === undefined || charEndOffset === undefined) continue;
    ranges.set(chunk.ord, { charStart, charEnd: charEndOffset + 1 });
    cursor = Math.max(cursor, compactStart + 1);
  }
  return ranges;
}

function compactTextWithOriginalOffsets(input: string) {
  const chars: string[] = [];
  const offsets: number[] = [];
  let inWhitespace = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === undefined) continue;
    if (/\s/.test(char)) {
      if (!inWhitespace && chars.length > 0) {
        chars.push(" ");
        offsets.push(index);
      }
      inWhitespace = true;
      continue;
    }
    chars.push(char);
    offsets.push(index);
    inWhitespace = false;
  }
  if (chars[chars.length - 1] === " ") {
    chars.pop();
    offsets.pop();
  }
  return { text: chars.join(""), offsets };
}

function pageRangeForChunk(
  chunkRange: { charStart: number; charEnd: number } | undefined,
  pages: PdfPageTextRange[],
): ChunkPageRange {
  if (chunkRange === undefined || pages.length === 0) {
    return { pageStart: null, pageEnd: null };
  }
  const overlapping = pages.filter(
    (page) => page.charEnd > chunkRange.charStart && page.charStart < chunkRange.charEnd,
  );
  if (overlapping.length === 0) {
    return { pageStart: null, pageEnd: null };
  }
  return {
    pageStart: overlapping[0]?.pageNumber ?? null,
    pageEnd: overlapping[overlapping.length - 1]?.pageNumber ?? null,
  };
}

function buildChunkMetaHeadJson(draft: DocumentDraft) {
  const metadata = parseMetadata(draft.metadataJson);
  const title = boundedNormalizedText(
    stringMetadataField(metadata, "title") ?? draft.sourceTitle,
    chunkMetaTitleMaxChars,
  );
  const sourceType = boundedNormalizedText(
    stringMetadataField(metadata, "source_type") ?? draft.kind,
    chunkMetaSourceTypeMaxChars,
  );
  const abstract = stringMetadataField(metadata, "abstract");
  const boundedAbstract =
    abstract === null ? null : boundedNormalizedText(abstract, chunkMetaAbstractMaxChars);
  const docContext = boundedNormalizedText(
    [
      title.length > 0 ? `Title: ${title}` : "",
      sourceType.length > 0 ? `Source type: ${sourceType}` : "",
      boundedAbstract !== null && boundedAbstract.length > 0 ? `Abstract: ${boundedAbstract}` : "",
    ]
      .filter((part) => part.length > 0)
      .join("\n"),
    chunkMetaDocContextMaxChars,
  );
  const metaHead: ChunkMetaHeadV1 = {
    version: chunkMetaHeadVersion,
    tier: "tier0",
    source: {
      title,
      type: sourceType,
      abstract: boundedAbstract,
    },
    docContext,
    sectionPath: null,
    chunkSummary: null,
    roleHint: null,
    relations: [],
  };
  return JSON.stringify(metaHead);
}

function buildChunkEmbeddingInput(chunk: SqlRow) {
  const text = stringField(chunk, "text");
  const prefix = buildChunkMetaEmbeddingPrefix(stringField(chunk, "meta_head_json"));
  return prefix.length === 0 ? text : `${prefix}\n\n${text}`;
}

function buildChunkMetaEmbeddingPrefix(metaHeadJson: string) {
  const metaHead = parseMetadata(metaHeadJson);
  const docContext = stringMetadataField(metaHead, "docContext") ?? "";
  const chunkSummary = stringMetadataField(metaHead, "chunkSummary") ?? "";
  return boundedNormalizedText(
    [docContext, chunkSummary.length > 0 ? `Chunk summary: ${chunkSummary}` : ""]
      .filter((part) => part.length > 0)
      .join("\n"),
    chunkMetaEmbeddingPrefixMaxChars,
  );
}

function boundedNormalizedText(input: string, maxLength: number) {
  const normalized = normalizeText(input);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function payloadMetadata(payload: CaptureBasePayload): Record<string, unknown> {
  return payload.metadata ?? {};
}

function normalizeAdapterKey(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeText(value).toLowerCase();
  return normalized.length === 0 ? undefined : normalized;
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  return normalizeAdapterKey(metadata[key]);
}

function metadataDisplayString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (typeof value !== "string") return undefined;
  const normalized = normalizeText(value);
  return normalized.length === 0 ? undefined : normalized;
}

function metadataStringArray(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item !== "string") return [];
      const normalized = normalizeText(item);
      return normalized.length === 0 ? [] : [normalized];
    });
  }
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => normalizeText(stripYamlScalarQuotes(item)))
    .filter((item) => item.length > 0);
}

function adapterHintFromMetadata(metadata: Record<string, unknown>) {
  return metadataString(metadata, "adapter") ?? metadataString(metadata, "source_adapter");
}

function isMarkdownAdapterInput(input: SourceAdapterInput) {
  const metadata = payloadMetadata(input.payload);
  const adapterHint = adapterHintFromMetadata(metadata);
  if (adapterHint === "markdown") return true;
  if (metadataString(metadata, "source_type") === "markdown") return true;
  const mimeType = metadataMimeType(metadata);
  if (mimeType === "text/markdown" || mimeType === "text/x-markdown" || mimeType === "text/md") {
    return true;
  }
  return markdownUrlPath(input.payload.sourceUrl);
}

function markdownUrlPath(sourceUrl: string) {
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    return pathname.endsWith(".md") || pathname.endsWith(".markdown");
  } catch {
    const normalized = sourceUrl.trim().toLowerCase();
    return normalized.endsWith(".md") || normalized.endsWith(".markdown");
  }
}

function parseMarkdownDocument(input: string): {
  body: string;
  frontmatter: Record<string, unknown>;
} {
  const normalized = input.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "---") return { body: input, frontmatter: {} };
  const maxFrontmatterLines = Math.min(lines.length, 80);
  let endLine = -1;
  for (let index = 1; index < maxFrontmatterLines; index += 1) {
    if (lines[index]?.trim() === "---") {
      endLine = index;
      break;
    }
  }
  if (endLine < 0) return { body: input, frontmatter: {} };
  return {
    body: lines.slice(endLine + 1).join("\n"),
    frontmatter: parseMarkdownFrontmatterLines(lines.slice(1, endLine)),
  };
}

function parseMarkdownFrontmatterLines(lines: string[]) {
  const metadata: Record<string, unknown> = {};
  for (const line of lines.slice(0, 80)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (match === null) continue;
    const key = match[1];
    if (key === undefined) continue;
    const rawValue = match[2]?.trim() ?? "";
    if (key === "authors") {
      metadata.authors = parseMarkdownAuthors(rawValue);
      continue;
    }
    metadata[key] = stripYamlScalarQuotes(rawValue);
  }
  return metadata;
}

function parseMarkdownAuthors(input: string) {
  const trimmed = input.trim();
  const body = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  return body
    .split(",")
    .map((item) => normalizeText(stripYamlScalarQuotes(item)))
    .filter((item) => item.length > 0)
    .slice(0, 50);
}

function stripYamlScalarQuotes(input: string) {
  const trimmed = input.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function firstMarkdownHeading(markdown: string, level: number) {
  const prefix = "#".repeat(level);
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trim());
    if (match !== null && match[1] === prefix) {
      const text = normalizeText(match[2] ?? "");
      if (text.length > 0) return text;
    }
  }
  return undefined;
}

function markdownSectionOutline(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line.trim());
      if (match === null) return [];
      const marker = match[1];
      if (marker === undefined) return [];
      const text = normalizeText(match[2] ?? "");
      if (text.length === 0) return [];
      return [{ level: marker.length, text }];
    })
    .slice(0, 200);
}

interface ArxivParseResult {
  isArxiv: boolean;
  arxivId?: string;
  arxivVersion?: string;
  year?: number;
}

interface PaperMetadataExtraction extends ArxivParseResult {
  title?: string;
  abstract?: string;
  authors: string[];
  doi?: string;
  categories: string[];
  sectionOutline: Array<{ level: number; text: string }>;
}

function isPdfAdapterInput(input: SourceAdapterInput) {
  const metadata = payloadMetadata(input.payload);
  const adapterHint = adapterHintFromMetadata(metadata);
  if (adapterHint === "pdf") return true;
  if (metadataString(metadata, "source_type") === "pdf") return true;
  if (metadataMimeType(metadata) === "application/pdf") return true;
  return pdfUrlPath(input.payload.sourceUrl);
}

function metadataMimeType(metadata: Record<string, unknown>) {
  return (
    metadataString(metadata, "mime_type") ??
    metadataString(metadata, "mimeType") ??
    metadataString(metadata, "content_type") ??
    metadataString(metadata, "contentType")
  );
}

function pdfUrlPath(sourceUrl: string) {
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    return pathname.endsWith(".pdf");
  } catch {
    return sourceUrl.trim().toLowerCase().split(/[?#]/, 1)[0]?.endsWith(".pdf") ?? false;
  }
}

function isPaperAdapterInput(input: SourceAdapterInput) {
  const metadata = payloadMetadata(input.payload);
  const adapterHint = adapterHintFromMetadata(metadata);
  if (adapterHint === "paper" || adapterHint === "arxiv") return true;
  const sourceType = metadataString(metadata, "source_type");
  if (sourceType === "paper" || sourceType === "arxiv") return true;
  const paperSource =
    metadataString(metadata, "paper_source") ?? metadataString(metadata, "source_provider");
  if (paperSource === "arxiv") return true;
  if (parseArxivUrl(input.payload.sourceUrl).isArxiv) return true;
  return hasArxivTextPattern(input.payload.normalizedText);
}

function extractPaperMetadata(payload: CaptureBasePayload): PaperMetadataExtraction {
  const fromUrl = parseArxivUrl(payload.sourceUrl);
  const textMetadata = extractPaperTextMetadata(payload.normalizedText);
  const fromText = parseArxivText(payload.normalizedText);
  const arxivId = fromUrl.arxivId ?? fromText.arxivId;
  const arxivVersion = fromUrl.arxivVersion ?? fromText.arxivVersion;
  const year = fromUrl.year ?? inferArxivYear(arxivId);

  return {
    isArxiv: fromUrl.isArxiv || fromText.isArxiv || hasArxivTextPattern(payload.normalizedText),
    ...(arxivId === undefined ? {} : { arxivId }),
    ...(arxivVersion === undefined ? {} : { arxivVersion }),
    ...(year === undefined ? {} : { year }),
    ...textMetadata,
  };
}

function normalizePaperMetadata(
  metadata: Record<string, unknown>,
  inputMetadata: Record<string, unknown>,
  extraction: PaperMetadataExtraction,
) {
  const explicitAuthors = parseMetadataAuthors(inputMetadata);
  const explicitCategories = parseMetadataCategories(inputMetadata);
  const explicitYear = metadataInteger(inputMetadata, "year");
  const explicitAdapterHint = adapterHintFromMetadata(inputMetadata);
  const explicitSourceType = metadataString(inputMetadata, "source_type");
  const explicitPaperSource =
    metadataString(inputMetadata, "paper_source") ??
    metadataString(inputMetadata, "source_provider");

  if (explicitAuthors.length > 0) metadata.authors = explicitAuthors;
  if (explicitCategories.length > 0) metadata.categories = explicitCategories;
  if (explicitYear !== undefined) metadata.year = explicitYear;

  if (
    extraction.isArxiv ||
    explicitAdapterHint === "arxiv" ||
    explicitSourceType === "arxiv" ||
    explicitPaperSource === "arxiv"
  ) {
    setMetadataIfMissing(metadata, "paper_source", "arxiv");
  }
  setMetadataIfMissing(metadata, "title", extraction.title);
  setMetadataIfMissing(metadata, "abstract", extraction.abstract);
  setMetadataIfMissing(metadata, "authors", extraction.authors);
  setMetadataIfMissing(metadata, "year", extraction.year);
  setMetadataIfMissing(metadata, "arxiv_id", extraction.arxivId);
  setMetadataIfMissing(metadata, "arxiv_version", extraction.arxivVersion);
  setMetadataIfMissing(metadata, "doi", extraction.doi);
  setMetadataIfMissing(metadata, "categories", extraction.categories);
  setMetadataIfMissing(metadata, "sectionOutline", extraction.sectionOutline);
}

function parseArxivUrl(sourceUrl: string): ArxivParseResult {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();
    if (host !== "arxiv.org" && !host.endsWith(".arxiv.org")) return { isArxiv: false };
    const match = /^\/(?:abs|html|pdf)\/([^?#/]+)(?:\.pdf)?$/i.exec(url.pathname);
    if (match === null) return { isArxiv: false };
    return arxivParseResultFromIdCandidate(match[1] ?? "");
  } catch {
    const match = /arxiv\.org\/(?:abs|html|pdf)\/([^?#/]+)(?:\.pdf)?/i.exec(sourceUrl);
    if (match === null) return { isArxiv: false };
    return arxivParseResultFromIdCandidate(match[1] ?? "");
  }
}

function parseArxivText(text: string): ArxivParseResult {
  const prefix = normalizeText(text).slice(0, 16_000);
  const match = /\barxiv(?:\s*id)?\s*[: ]\s*([a-z.-]+\/\d{7}|\d{4}\.\d{4,5})(v\d+)?\b/i.exec(
    prefix,
  );
  if (match === null) return { isArxiv: false };
  return arxivParseResultFromIdCandidate(`${match[1] ?? ""}${match[2] ?? ""}`);
}

function arxivParseResultFromIdCandidate(candidate: string): ArxivParseResult {
  const decoded = decodeURIComponent(candidate)
    .replace(/\.pdf$/i, "")
    .trim();
  const match = /^([a-z.-]+\/\d{7}|\d{4}\.\d{4,5})(v\d+)?$/i.exec(decoded);
  if (match === null) return { isArxiv: true };
  const arxivId = (match[1] ?? "").toLowerCase();
  const arxivVersion = match[2]?.toLowerCase();
  const year = inferArxivYear(arxivId);
  return {
    isArxiv: true,
    arxivId,
    ...(arxivVersion === undefined ? {} : { arxivVersion }),
    ...(year === undefined ? {} : { year }),
  };
}

function inferArxivYear(arxivId: string | undefined) {
  if (arxivId === undefined) return undefined;
  const match = /^(\d{2})(\d{2})\.\d{4,5}$/i.exec(arxivId);
  if (match === null) return undefined;
  const shortYear = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(shortYear) || month < 1 || month > 12) return undefined;
  const year = shortYear < 90 ? 2000 + shortYear : 1900 + shortYear;
  return isReasonablePaperYear(year) ? year : undefined;
}

function extractPaperTextMetadata(
  text: string,
): Omit<PaperMetadataExtraction, "isArxiv" | "arxivId" | "arxivVersion" | "year"> {
  const prefix = normalizeText(text).slice(0, 24_000);
  const lines = prefix.split("\n").slice(0, 320);
  const categoryText =
    extractLabeledLine(lines, ["subjects", "categories", "category"]) ??
    extractLabeledBlock(lines, ["subjects", "categories", "category"]);

  return {
    title: extractLabeledLine(lines, ["title"]),
    abstract: extractLabeledBlock(lines, ["abstract"]),
    authors: parsePaperAuthors(extractLabeledLine(lines, ["authors", "author"]) ?? ""),
    doi: extractDoi(prefix),
    categories: parsePaperCategories(categoryText ?? ""),
    sectionOutline: paperSectionOutline(text),
  };
}

function extractLabeledLine(lines: string[], labels: string[]) {
  for (const line of lines) {
    const value = labeledValue(line, labels);
    if (value !== undefined) return value;
  }
  return undefined;
}

function extractLabeledBlock(lines: string[], labels: string[]) {
  const stopLabels = [
    "authors",
    "author",
    "subjects",
    "categories",
    "category",
    "comments",
    "journal-ref",
    "doi",
    "msc class",
    "acm class",
    "submitted",
  ];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const inlineValue = labeledValue(line, labels);
    const isStandaloneLabel = inlineValue === undefined && isStandaloneLabelLine(line, labels);
    if (inlineValue === undefined && !isStandaloneLabel) continue;

    const parts: string[] = inlineValue === undefined ? [] : [inlineValue];
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 40); cursor += 1) {
      const next = normalizeText(lines[cursor] ?? "");
      if (next.length === 0 && parts.length > 0) break;
      if (labeledValue(next, stopLabels) !== undefined) break;
      if (isStandaloneLabelLine(next, stopLabels)) break;
      if (parts.length > 0 && looksLikePaperSectionHeading(next)) break;
      if (next.length > 0) parts.push(next);
    }
    const joined = normalizeText(parts.join(" "));
    if (joined.length > 0) return joined.slice(0, 4_000);
  }
  return undefined;
}

function labeledValue(line: string, labels: string[]) {
  const normalized = normalizeText(line);
  for (const label of labels) {
    const escaped = escapeRegExp(label);
    const match = new RegExp(`^${escaped}\\s*:\\s*(.+)$`, "i").exec(normalized);
    if (match === null) continue;
    const value = normalizeText(match[1] ?? "");
    if (value.length > 0) return value;
  }
  return undefined;
}

function isStandaloneLabelLine(line: string, labels: string[]) {
  const normalized = normalizeText(line).replace(/:$/, "");
  return labels.some((label) => normalized.toLowerCase() === label.toLowerCase());
}

function parseMetadataAuthors(metadata: Record<string, unknown>) {
  const arrayAuthors = metadataStringArray(metadata, "authors");
  if (arrayAuthors.length > 0) return arrayAuthors;
  return parsePaperAuthors(metadataDisplayString(metadata, "authors") ?? "");
}

function parseMetadataCategories(metadata: Record<string, unknown>) {
  const arrayCategories = metadataStringArray(metadata, "categories");
  if (arrayCategories.length > 0) return arrayCategories;
  return parsePaperCategories(
    metadataDisplayString(metadata, "categories") ??
      metadataDisplayString(metadata, "subjects") ??
      "",
  );
}

function parsePaperAuthors(input: string) {
  return input
    .replace(/^authors?\s*:\s*/i, "")
    .split(/\s+(?:and|&)\s+|[,;]/i)
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0)
    .slice(0, 50);
}

function parsePaperCategories(input: string) {
  const normalized = normalizeText(input.replace(/^subjects?\s*:\s*/i, ""));
  const codeMatches = Array.from(normalized.matchAll(/\(([a-z-]+(?:\.[A-Z]{2})?)\)/gi)).map(
    (match) => normalizeText(match[1] ?? ""),
  );
  const values =
    codeMatches.length > 0
      ? codeMatches
      : normalized
          .split(/[;,]/)
          .map((item) => normalizeText(item))
          .filter((item) => item.length > 0);
  return Array.from(new Set(values)).slice(0, 30);
}

function extractDoi(input: string) {
  const match = /\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/i.exec(input);
  if (match === null) return undefined;
  return normalizeText(match[1] ?? "").replace(/[).,;]+$/, "");
}

function paperSectionOutline(text: string) {
  const markdownOutline = markdownSectionOutline(text);
  if (markdownOutline.length > 0) return markdownOutline.slice(0, 200);

  return normalizeText(text)
    .split("\n")
    .slice(0, 1_200)
    .flatMap((line) => {
      const heading = normalizeText(line);
      if (!looksLikePaperSectionHeading(heading)) return [];
      const level = paperHeadingLevel(heading);
      const text = heading.replace(/^\d+(?:\.\d+)*\.?\s+/, "");
      return [{ level, text }];
    })
    .slice(0, 200);
}

function looksLikePaperSectionHeading(line: string) {
  if (line.length === 0 || line.length > 140) return false;
  if (/^(?:title|authors?|abstract|subjects?|categories|comments|doi)\s*:/i.test(line)) {
    return false;
  }
  if (/^\d+(?:\.\d+)*\.?\s+[A-Z][\p{L}\p{N} ,:;()/-]{2,}$/u.test(line)) return true;
  return /^(abstract|introduction|related work|background|method|methods|approach|experiments|evaluation|results|discussion|conclusion|references|bibliography|appendix)\b/i.test(
    line,
  );
}

function paperHeadingLevel(line: string) {
  const match = /^(\d+(?:\.\d+)*)/.exec(line);
  if (match === null) return 1;
  return Math.min(6, match[1]?.split(".").length ?? 1);
}

function hasArxivTextPattern(text: string) {
  const prefix = normalizeText(text).slice(0, 12_000);
  if (/\barxiv(?:\s*id)?\s*[: ]\s*(?:[a-z.-]+\/\d{7}|\d{4}\.\d{4,5})/i.test(prefix)) {
    return true;
  }
  return (
    /\btitle\s*:/i.test(prefix) &&
    /\bauthors?\s*:/i.test(prefix) &&
    /\babstract\s*:/i.test(prefix) &&
    /\bsubjects?\s*:/i.test(prefix)
  );
}

function setMetadataIfMissing(metadata: Record<string, unknown>, key: string, value: unknown) {
  if (metadataHasValue(metadata, key)) return;
  const normalized = normalizeMetadataValue(value);
  if (normalized !== undefined) metadata[key] = normalized;
}

function metadataHasValue(metadata: Record<string, unknown>, key: string) {
  return normalizeMetadataValue(metadata[key]) !== undefined;
}

function normalizeMetadataValue(value: unknown): unknown {
  if (typeof value === "string") {
    const normalized = normalizeText(value);
    return normalized.length === 0 ? undefined : normalized;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    if (value.every((item) => typeof item === "string")) {
      const normalized = value.flatMap((item) => {
        const text = normalizeText(item);
        return text.length === 0 ? [] : [text];
      });
      return normalized.length === 0 ? undefined : normalized;
    }
    return value.slice(0, 200);
  }
  return undefined;
}

function metadataInteger(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isInteger(numberValue)) return undefined;
  return isReasonablePaperYear(numberValue) ? numberValue : undefined;
}

function isReasonablePaperYear(year: number) {
  return year >= 1900 && year <= 2100;
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function insertSourceRow(
  db: SqliteDb,
  input: {
    id: string;
    kind: SourceKind;
    sourceUrl: string;
    normalizedSourceUrl: string;
    sourceTitle: string;
    capturedAt: string;
    normalizedText: string;
    contentHash: string;
    metadataJson: string;
    versionGroupKey: string;
    versionNo: number;
    supersedesSourceId?: string;
  },
) {
  const analysisLevel: SourceAnalysisLevel = "saved";
  const metadata = parseMetadata(input.metadataJson);
  const sourceType = stringMetadataField(metadata, "source_type") || input.kind;
  db.exec({
    sql: `INSERT INTO sources (
      id,
      source_kind,
      source_type,
      source_url,
      normalized_source_url,
      source_title,
      content_hash,
      captured_at,
      normalized_text,
      lifecycle_status,
      analysis_level,
      version_group_key,
      version_no,
      supersedes_source_id,
      superseded_by_source_id,
      is_current,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'fresh', ?, ?, ?, ?, NULL, 1, ?, ?)`,
    bind: [
      input.id,
      input.kind,
      sourceType,
      input.sourceUrl,
      input.normalizedSourceUrl,
      input.sourceTitle,
      input.contentHash,
      input.capturedAt,
      input.normalizedText,
      analysisLevel,
      input.versionGroupKey,
      input.versionNo,
      input.supersedesSourceId ?? null,
      input.capturedAt,
      input.capturedAt,
    ],
  });
  upsertSourceMetadata(db, {
    sourceId: input.id,
    sourceKind: input.kind,
    sourceTitle: input.sourceTitle,
    sourceUrl: input.sourceUrl,
    sourceType,
    contentHash: input.contentHash,
    capturedAt: input.capturedAt,
    metadataJson: safeJsonObjectString(input.metadataJson),
    updatedAt: input.capturedAt,
  });
}

function upsertSourceMetadata(
  db: SqliteDb,
  input: {
    sourceId: string;
    sourceKind: SourceKind;
    sourceTitle: string;
    sourceUrl: string;
    sourceType: string;
    contentHash: string;
    capturedAt: string;
    metadataJson: string;
    updatedAt: string;
  },
) {
  const metadata = parseMetadata(input.metadataJson);
  const abstract = stringMetadataField(metadata, "abstract");
  const authorsJson = JSON.stringify(stringArrayMetadataField(metadata, "authors"));
  const sectionOutlineJson = JSON.stringify(
    Array.isArray(metadata.sectionOutline) ? metadata.sectionOutline.slice(0, 200) : [],
  );
  db.exec({
    sql: `INSERT INTO source_metadata (
      source_id,
      title,
      url,
      source_type,
      content_hash,
      captured_at,
      metadata_json,
      section_outline_json,
      abstract,
      authors_json,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET
      title = excluded.title,
      url = excluded.url,
      source_type = excluded.source_type,
      content_hash = excluded.content_hash,
      captured_at = excluded.captured_at,
      metadata_json = excluded.metadata_json,
      section_outline_json = excluded.section_outline_json,
      abstract = excluded.abstract,
      authors_json = excluded.authors_json,
      updated_at = excluded.updated_at`,
    bind: [
      input.sourceId,
      input.sourceTitle,
      input.sourceUrl,
      input.sourceType,
      input.contentHash,
      input.capturedAt,
      safeJsonObjectString(input.metadataJson),
      sectionOutlineJson,
      abstract,
      authorsJson,
      input.updatedAt,
    ],
  });
  insertSourceMetadataFtsRow(db, {
    sourceId: input.sourceId,
    sourceKind: input.sourceKind,
    sourceType: input.sourceType,
    lifecycleStatus: "fresh",
    title: input.sourceTitle,
    abstract: abstract ?? "",
    url: input.sourceUrl,
  });
}

function markSourceSuperseded(
  db: SqliteDb,
  input: {
    sourceId: string;
    supersededBySourceId: string;
    at: string;
  },
) {
  db.exec({
    sql: `UPDATE sources
          SET lifecycle_status = 'stale',
              superseded_by_source_id = ?,
              is_current = 0,
              updated_at = ?
          WHERE id = ?`,
    bind: [input.supersededBySourceId, input.at, input.sourceId],
  });
  insertSourceLifecycleEvent(db, {
    sourceId: input.sourceId,
    fromStatus: "fresh",
    toStatus: "stale",
    reason: "superseded",
    createdAt: input.at,
    payload: {
      supersededBySourceId: input.supersededBySourceId,
    },
  });
  insertSourceAuditLog(db, {
    action: "source.superseded",
    sourceId: input.sourceId,
    targetKind: "source",
    targetId: input.supersededBySourceId,
    reason: "superseded",
    createdAt: input.at,
    payload: {},
  });
}

function markSourceDeleted(
  db: SqliteDb,
  input: { sourceId: string; deletedAt: string; reason: string },
) {
  const previous = db.selectObject("SELECT lifecycle_status FROM sources WHERE id = ? LIMIT 1", [
    input.sourceId,
  ]);
  const fromStatus = sourceLifecycleStatusFromRow(previous, "lifecycle_status");
  db.exec({
    sql: `UPDATE sources
          SET lifecycle_status = 'deleted',
              is_current = 0,
              updated_at = ?
          WHERE id = ?`,
    bind: [input.deletedAt, input.sourceId],
  });
  insertSourceLifecycleEvent(db, {
    sourceId: input.sourceId,
    fromStatus,
    toStatus: "deleted",
    reason: input.reason,
    createdAt: input.deletedAt,
    payload: {},
  });
  insertSourceAuditLog(db, {
    action: "source.deleted",
    sourceId: input.sourceId,
    targetKind: "source",
    targetId: input.sourceId,
    reason: input.reason,
    createdAt: input.deletedAt,
    payload: {},
  });
}

function insertSourceLifecycleEvent(
  db: SqliteDb,
  input: {
    sourceId: string;
    fromStatus: SourceLifecycleStatus | null;
    toStatus: SourceLifecycleStatus;
    reason: string;
    payload: Record<string, unknown>;
    createdAt: string;
  },
) {
  db.exec({
    sql: `INSERT INTO source_lifecycle_events (
      id,
      source_id,
      from_status,
      to_status,
      reason,
      payload_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    bind: [
      createId("src_life"),
      input.sourceId,
      input.fromStatus,
      input.toStatus,
      input.reason,
      JSON.stringify(boundAuditPayload(input.payload)),
      input.createdAt,
    ],
  });
}

function insertSourceAuditLog(
  db: SqliteDb,
  input: {
    action: SourceAuditAction;
    sourceId: string;
    targetKind: string;
    targetId?: string;
    reason: string;
    payload: Record<string, unknown>;
    createdAt: string;
  },
) {
  db.exec({
    sql: `INSERT INTO source_audit_log (
      id,
      action,
      source_id,
      target_kind,
      target_id,
      reason,
      payload_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [
      createId("src_audit"),
      input.action,
      input.sourceId,
      input.targetKind,
      input.targetId ?? null,
      input.reason,
      JSON.stringify(boundAuditPayload(input.payload)),
      input.createdAt,
    ],
  });
}

function safeJsonObjectString(input: string) {
  return JSON.stringify(parseMetadata(input));
}

function stringMetadataField(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? normalizeText(value).slice(0, 4_000) : null;
}

function stringArrayMetadataField(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" ? [normalizeText(item)] : [])).slice(0, 50)
    : [];
}

function boundAuditPayload(payload: Record<string, unknown>) {
  const bounded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload).slice(0, 20)) {
    if (value === null || typeof value === "boolean" || typeof value === "number") {
      bounded[key] = value;
      continue;
    }
    if (typeof value === "string") {
      bounded[key] = value.slice(0, 500);
      continue;
    }
    if (Array.isArray(value)) {
      bounded[key] = value
        .slice(0, 20)
        .flatMap((item) =>
          item === null ||
          typeof item === "boolean" ||
          typeof item === "number" ||
          typeof item === "string"
            ? [typeof item === "string" ? item.slice(0, 200) : item]
            : [],
        );
    }
  }
  return bounded;
}

function rebuildSessionsTable(db: SqliteDb) {
  db.exec(`
    CREATE TABLE sessions_new (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_page_url TEXT,
      source_page_title TEXT,
      normalized_page_url TEXT,
      initial_scope TEXT CHECK (initial_scope IS NULL OR initial_scope IN ('general', 'current-page', 'selection')),
      current_evidence_revision INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      last_message_excerpt TEXT NOT NULL DEFAULT '',
      owner_id TEXT,
      owner_heartbeat_at TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    INSERT INTO sessions_new (
      id,
      title,
      source_page_url,
      source_page_title,
      normalized_page_url,
      initial_scope,
      current_evidence_revision,
      message_count,
      last_message_excerpt,
      owner_id,
      owner_heartbeat_at,
      metadata_json,
      created_at,
      updated_at
    )
    SELECT
      id,
      title,
      source_page_url,
      source_page_title,
      normalized_page_url,
      initial_scope,
      current_evidence_revision,
      message_count,
      last_message_excerpt,
      owner_id,
      owner_heartbeat_at,
      metadata_json,
      created_at,
      updated_at
    FROM sessions
  `);
  db.exec("DROP TABLE sessions");
  db.exec("ALTER TABLE sessions_new RENAME TO sessions");
}

function rebuildMessagesTable(db: SqliteDb) {
  db.exec(`
    CREATE TABLE messages_new (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'evidence')),
      status TEXT NOT NULL CHECK (status IN ('queued', 'streaming', 'completed', 'failed', 'cancelled', 'interrupted')),
      content TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('general', 'current-page', 'selection')),
      page_url TEXT,
      page_title TEXT,
      selection_text TEXT,
      citations_json TEXT NOT NULL DEFAULT '[]',
      world_knowledge_json TEXT NOT NULL DEFAULT '[]',
      evidence_refs_json TEXT NOT NULL DEFAULT '[]',
      error_json TEXT,
      retry_json TEXT,
      pi_agent_message_json TEXT,
      run_id TEXT,
      queue_order INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    INSERT INTO messages_new (
      id,
      session_id,
      role,
      status,
      content,
      scope,
      page_url,
      page_title,
      selection_text,
      citations_json,
      world_knowledge_json,
      evidence_refs_json,
      error_json,
      retry_json,
      pi_agent_message_json,
      run_id,
      queue_order,
      created_at,
      updated_at
    )
    SELECT
      id,
      session_id,
      role,
      status,
      content,
      scope,
      page_url,
      page_title,
      selection_text,
      citations_json,
      world_knowledge_json,
      evidence_refs_json,
      error_json,
      retry_json,
      pi_agent_message_json,
      run_id,
      queue_order,
      created_at,
      updated_at
    FROM messages
  `);
  db.exec("DROP TABLE messages");
  db.exec("ALTER TABLE messages_new RENAME TO messages");
}

function recoverStaleJobs(db: SqliteDb) {
  const cutoff = new Date(Date.now() - staleJobMs).toISOString();
  transaction(db, () => {
    db.exec({
      sql: `UPDATE jobs
            SET status = 'failed',
                finished_at = ?,
                last_error = COALESCE(last_error, 'Job was running when the engine stopped.')
            WHERE status = 'running'
              AND attempts >= max_attempts
              AND (heartbeat_at IS NULL OR heartbeat_at < ?)`,
      bind: [new Date().toISOString(), cutoff],
    });
    db.exec({
      sql: `UPDATE jobs
            SET status = 'queued',
                started_at = NULL,
                heartbeat_at = NULL,
                run_after = ?
            WHERE status = 'running'
              AND attempts < max_attempts
              AND (heartbeat_at IS NULL OR heartbeat_at < ?)`,
      bind: [new Date().toISOString(), cutoff],
    });
  });
}

function ensureDefaultEmbeddingModel(db: SqliteDb) {
  const now = new Date().toISOString();
  db.exec({
    sql: `INSERT INTO embedding_models (
      id,
      provider,
      label,
      dimension,
      metric,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      label = excluded.label,
      dimension = excluded.dimension,
      metric = excluded.metric,
      status = CASE
        WHEN embedding_models.status = 'disabled' THEN 'disabled'
        ELSE excluded.status
      END,
      updated_at = excluded.updated_at`,
    bind: [
      defaultEmbeddingProvider.modelId,
      defaultEmbeddingProvider.provider,
      defaultEmbeddingProvider.label,
      defaultEmbeddingProvider.dimension,
      defaultEmbeddingProvider.metric,
      now,
      now,
    ],
  });
}

function getActiveEmbeddingProvider(db: SqliteDb): EmbeddingProvider | null {
  const row = db.selectObject(
    `SELECT *
     FROM embedding_models
     WHERE id = ?
       AND provider = ?
       AND status = 'active'
       AND metric = 'cosine'
     LIMIT 1`,
    [defaultEmbeddingProvider.modelId, defaultEmbeddingProvider.provider],
  );
  if (row === undefined) return null;
  const dimension = numberField(row, "dimension");
  if (dimension !== defaultEmbeddingProvider.dimension) return null;
  return localDeterministicEmbeddingProvider;
}

const localDeterministicEmbeddingProvider: EmbeddingProvider = {
  modelId: defaultEmbeddingProvider.modelId,
  provider: defaultEmbeddingProvider.provider,
  dimension: defaultEmbeddingProvider.dimension,
  embed(input: string) {
    return embedLocalDeterministic(input, defaultEmbeddingProvider.dimension);
  },
};

function enqueueJob(db: SqliteDb, type: JobType, payload: Record<string, unknown>) {
  const now = new Date().toISOString();
  const jobId = createId("job");
  db.exec({
    sql: `INSERT INTO jobs (
      id,
      type,
      status,
      attempts,
      max_attempts,
      run_after,
      payload_json,
      created_at
    ) VALUES (?, ?, 'queued', 0, ?, ?, ?, ?)`,
    bind: [jobId, type, defaultJobMaxAttempts, now, JSON.stringify(payload), now],
  });
  return jobId;
}

function runJob(db: SqliteDb, jobId: string): JobSummary {
  const job = db.selectObject("SELECT * FROM jobs WHERE id = ? LIMIT 1", [jobId]);
  if (job === undefined) {
    throw new EngineRpcError("JOB_NOT_FOUND", `Job not found: ${jobId}`);
  }
  if (stringField(job, "status") !== "queued") return jobSummaryFromRow(job);

  const now = new Date().toISOString();
  const attempts = numberField(job, "attempts") + 1;
  db.exec({
    sql: `UPDATE jobs
          SET status = 'running',
              attempts = ?,
              started_at = COALESCE(started_at, ?),
              heartbeat_at = ?,
              last_error = NULL
          WHERE id = ?`,
    bind: [attempts, now, now, jobId],
  });

  try {
    const type = jobTypeField(job, "type");
    let result: Record<string, unknown> = { ok: true };
    if (type === "reindex_fts") {
      rebuildFtsData(db);
    } else if (type === "post_capture_hardening") {
      result = runPostCaptureHardeningJob(db, stringField(job, "payload_json"));
    } else if (type === "resolve_anchor") {
      result = { ok: true, reserved: "resolve_anchor" };
    } else {
      throw new EngineRpcError("UNKNOWN_JOB_TYPE", `Unknown job type: ${stringField(job, "type")}`);
    }
    const finishedAt = new Date().toISOString();
    db.exec({
      sql: `UPDATE jobs
            SET status = 'done',
                heartbeat_at = ?,
                finished_at = ?,
                result_json = ?
            WHERE id = ?`,
      bind: [finishedAt, finishedAt, JSON.stringify(result), jobId],
    });
  } catch (error) {
    const engineError = engineErrorFromUnknown(error);
    const maxAttempts = Math.max(1, numberField(job, "max_attempts"));
    const failed = attempts >= maxAttempts;
    db.exec({
      sql: `UPDATE jobs
            SET status = ?,
                run_after = ?,
                heartbeat_at = NULL,
                finished_at = ?,
                last_error = ?
            WHERE id = ?`,
      bind: [
        failed ? "failed" : "queued",
        new Date(Date.now() + attempts * 1000).toISOString(),
        failed ? new Date().toISOString() : null,
        engineError.message,
        jobId,
      ],
    });
  }

  const updated = db.selectObject("SELECT * FROM jobs WHERE id = ? LIMIT 1", [jobId]);
  if (updated === undefined) {
    throw new EngineRpcError("JOB_NOT_FOUND", `Job not found after run: ${jobId}`);
  }
  return jobSummaryFromRow(updated);
}

function rebuildFtsData(db: SqliteDb) {
  transaction(db, () => {
    db.exec("DELETE FROM source_fts");
    db.exec("DELETE FROM source_metadata_fts");
    db.exec("DELETE FROM keyword_index_sources");
    db.exec("DELETE FROM keyword_index");
    const rows = db.selectObjects(
      `SELECT
        s.id AS source_id,
        s.source_kind,
        s.source_title,
        c.id AS chunk_id,
        c.text
       FROM source_chunks c
       JOIN sources s ON s.id = c.source_id
       WHERE s.lifecycle_status <> 'deleted'
       ORDER BY s.captured_at DESC, c.ord ASC`,
    );
    for (const row of rows) {
      insertSourceFtsRow(db, {
        sourceId: stringField(row, "source_id"),
        chunkId: stringField(row, "chunk_id"),
        sourceKind: sourceKindField(row, "source_kind"),
        title: stringField(row, "source_title"),
        text: stringField(row, "text"),
      });
    }
    const metadataRows = db.selectObjects(
      `SELECT
        s.id AS source_id,
        s.source_kind,
        s.source_type,
        s.source_url,
        s.source_title,
        s.lifecycle_status,
        sm.title AS meta_title,
        sm.abstract AS meta_abstract,
        sm.source_type AS meta_source_type
       FROM sources s
       LEFT JOIN source_metadata sm ON sm.source_id = s.id
       WHERE s.lifecycle_status <> 'deleted'
       ORDER BY s.captured_at DESC`,
    );
    for (const row of metadataRows) {
      const lifecycleStatus = sourceLifecycleStatusFromRow(row, "lifecycle_status");
      if (lifecycleStatus === null || lifecycleStatus === "deleted") continue;
      insertSourceMetadataFtsRow(db, {
        sourceId: stringField(row, "source_id"),
        sourceKind: sourceKindField(row, "source_kind"),
        sourceType: stringField(row, "meta_source_type") || stringField(row, "source_type"),
        lifecycleStatus,
        title: stringField(row, "meta_title") || stringField(row, "source_title"),
        abstract: stringField(row, "meta_abstract"),
        url: stringField(row, "source_url"),
      });
      replaceKeywordIndexForSource(db, stringField(row, "source_id"));
    }
  });
}

function runPostCaptureHardeningJob(db: SqliteDb, payloadJson: string): Record<string, unknown> {
  const payload = parsePostCaptureHardeningPayload(payloadJson);
  if (payload.sourceId.length === 0) {
    throw new EngineRpcError("INVALID_JOB_PAYLOAD", "Post-capture job is missing sourceId.");
  }
  const shouldRunEmbedding = payload.stages.length === 0 || payload.stages.includes("embedding");
  const shouldRunGraph = payload.stages.includes("graph");
  const result = shouldRunEmbedding
    ? runEmbeddingStageForSource(db, payload.sourceId)
    : { ok: true, embedding: { skipped: true, reason: "stage_not_requested" } };
  return {
    ...result,
    graph: shouldRunGraph
      ? { skipped: true, reason: "explicit_build_required" }
      : { skipped: true, reason: "stage_not_requested" },
  };
}

function parsePostCaptureHardeningPayload(payloadJson: string) {
  const payload = parseMetadata(payloadJson);
  const sourceId = typeof payload.sourceId === "string" ? normalizeText(payload.sourceId) : "";
  const stages = Array.isArray(payload.stages)
    ? payload.stages.flatMap((stage) => (typeof stage === "string" ? [stage] : []))
    : [];
  return { sourceId, stages };
}

function runEmbeddingStageForSource(db: SqliteDb, sourceId: string): Record<string, unknown> {
  const source = db.selectObject("SELECT id FROM sources WHERE id = ? LIMIT 1", [sourceId]);
  if (source === undefined) {
    throw new EngineRpcError("SOURCE_NOT_FOUND", `Source not found: ${sourceId}`);
  }
  const deleted = db.selectObject(
    "SELECT id FROM sources WHERE id = ? AND lifecycle_status = 'deleted' LIMIT 1",
    [sourceId],
  );
  if (deleted !== undefined) {
    return {
      ok: true,
      embedding: {
        modelId: defaultEmbeddingProvider.modelId,
        chunkCount: 0,
        skipped: true,
        reason: "source_deleted",
      },
    };
  }
  const provider = getActiveEmbeddingProvider(db);
  if (provider === null) {
    throw new EngineRpcError(
      "EMBEDDING_MODEL_UNAVAILABLE",
      "Active embedding model is unavailable.",
    );
  }
  const chunks = db.selectObjects(
    `SELECT id, source_id, text, hash, meta_head_json
     FROM source_chunks
     WHERE source_id = ?
     ORDER BY ord ASC`,
    [sourceId],
  );
  const now = new Date().toISOString();
  for (const chunk of chunks) {
    upsertSourceChunkEmbedding(db, provider, chunk, now);
  }
  const metaInput = loadSourceMetaEmbeddingInput(db, sourceId);
  const metaText = metaInput === undefined ? "" : buildSourceMetaEmbeddingText(metaInput);
  if (metaText.length > 0) {
    upsertSourceMetaEmbedding(db, provider, { sourceId, text: metaText }, now);
  } else {
    deleteSourceMetaEmbedding(db, provider.modelId, sourceId);
  }
  return {
    ok: true,
    embedding: {
      modelId: provider.modelId,
      provider: provider.provider,
      targetKinds: ["chunk", "meta"],
      chunkCount: chunks.length,
      metaCount: metaText.length > 0 ? 1 : 0,
      ...(metaText.length === 0 ? { metaSkippedReason: "empty_meta" } : {}),
    },
  };
}

function loadSourceMetaEmbeddingInput(db: SqliteDb, sourceId: string) {
  return db.selectObject(
    `SELECT
      s.id AS source_id,
      s.source_title,
      sm.title AS meta_title,
      sm.abstract AS meta_abstract,
      sm.source_type AS meta_source_type
     FROM sources s
     LEFT JOIN source_metadata sm ON sm.source_id = s.id
     WHERE s.id = ?
     LIMIT 1`,
    [sourceId],
  );
}

function buildSourceMetaEmbeddingText(row: SqlRow) {
  return [
    stringField(row, "meta_title") || stringField(row, "source_title"),
    stringField(row, "meta_abstract"),
    stringField(row, "meta_source_type"),
  ]
    .map((part) => normalizeText(part))
    .filter((part) => part.length > 0)
    .join("\n\n");
}

function deleteSourceMetaEmbedding(db: SqliteDb, modelId: string, sourceId: string) {
  db.exec({
    sql: "DELETE FROM source_embeddings WHERE model_id = ? AND target_kind = 'meta' AND target_id = ?",
    bind: [modelId, sourceId],
  });
}

function upsertSourceChunkEmbedding(
  db: SqliteDb,
  provider: EmbeddingProvider,
  chunk: SqlRow,
  now: string,
) {
  const embeddingInput = buildChunkEmbeddingInput(chunk);
  const vector = provider.embed(embeddingInput);
  if (vector.length !== provider.dimension) {
    throw new EngineRpcError("EMBEDDING_DIMENSION_MISMATCH", "Embedding dimension mismatch.");
  }
  db.exec({
    sql: `INSERT INTO source_embeddings (
      model_id,
      target_kind,
      target_id,
      source_id,
      vector_json,
      text_hash,
      created_at,
      updated_at
    ) VALUES (?, 'chunk', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_id, target_kind, target_id) DO UPDATE SET
      source_id = excluded.source_id,
      vector_json = excluded.vector_json,
      text_hash = excluded.text_hash,
      updated_at = excluded.updated_at`,
    bind: [
      provider.modelId,
      stringField(chunk, "id"),
      stringField(chunk, "source_id"),
      JSON.stringify(vector),
      hashText(embeddingInput),
      now,
      now,
    ],
  });
}

function upsertSourceMetaEmbedding(
  db: SqliteDb,
  provider: EmbeddingProvider,
  input: { sourceId: string; text: string },
  now: string,
) {
  const vector = provider.embed(input.text);
  if (vector.length !== provider.dimension) {
    throw new EngineRpcError("EMBEDDING_DIMENSION_MISMATCH", "Embedding dimension mismatch.");
  }
  db.exec({
    sql: `INSERT INTO source_embeddings (
      model_id,
      target_kind,
      target_id,
      source_id,
      vector_json,
      text_hash,
      created_at,
      updated_at
    ) VALUES (?, 'meta', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_id, target_kind, target_id) DO UPDATE SET
      source_id = excluded.source_id,
      vector_json = excluded.vector_json,
      text_hash = excluded.text_hash,
      updated_at = excluded.updated_at`,
    bind: [
      provider.modelId,
      input.sourceId,
      input.sourceId,
      JSON.stringify(vector),
      hashText(input.text),
      now,
      now,
    ],
  });
}

function insertSourceFtsRow(
  db: SqliteDb,
  input: {
    sourceId: string;
    chunkId: string;
    sourceKind: SourceKind;
    title: string;
    text: string;
  },
) {
  db.exec({
    sql: `INSERT INTO source_fts (
      source_id,
      chunk_id,
      source_kind,
      title,
      body
    ) VALUES (?, ?, ?, ?, ?)`,
    bind: [
      input.sourceId,
      input.chunkId,
      input.sourceKind,
      input.title,
      expandChineseBigrams(input.text),
    ],
  });
}

function insertSourceMetadataFtsRow(
  db: SqliteDb,
  input: {
    sourceId: string;
    sourceKind: SourceKind;
    sourceType: string;
    lifecycleStatus: SearchableSourceLifecycleStatus;
    title: string;
    abstract: string;
    url: string;
  },
) {
  db.exec({ sql: "DELETE FROM source_metadata_fts WHERE source_id = ?", bind: [input.sourceId] });
  db.exec({
    sql: `INSERT INTO source_metadata_fts (
      source_id,
      source_kind,
      lifecycle_status,
      title,
      abstract,
      source_type,
      url
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    bind: [
      input.sourceId,
      input.sourceKind,
      input.lifecycleStatus,
      expandChineseBigrams(input.title),
      expandChineseBigrams(input.abstract),
      expandChineseBigrams(input.sourceType),
      input.url,
    ],
  });
}

function buildDeterministicGraphForSource(db: SqliteDb, sourceId: string): DeterministicGraphBuild {
  const source = db.selectObject(
    `SELECT
      s.id,
      s.source_title,
      s.source_type,
      sm.title AS meta_title,
      sm.abstract AS meta_abstract,
      sm.authors_json,
      sm.metadata_json,
      sm.section_outline_json
     FROM sources s
     LEFT JOIN source_metadata sm ON sm.source_id = s.id
     WHERE s.id = ?
       AND s.lifecycle_status <> 'deleted'
     LIMIT 1`,
    [sourceId],
  );
  if (source === undefined) return { nodes: [], edges: [], evidenceChunkIds: [] };

  const nodesByCanonicalId = new Map<string, GraphNodeInput>();
  const edges: DeterministicGraphBuild["edges"] = [];
  const evidenceChunkIds = new Set<string>();
  const metadata = parseMetadata(stringField(source, "metadata_json"));
  const sourceLabel =
    stringField(source, "meta_title") || stringField(source, "source_title") || sourceId;
  const sourceNode: GraphNodeInput = {
    kind: "source",
    label: sourceLabel,
    canonicalId: `source:${sourceId}`,
    refId: sourceId,
  };
  addGraphNodeInput(nodesByCanonicalId, sourceNode);

  const addEntityEdge = (
    kind: GraphNodeKind,
    label: string,
    input: {
      dimension: GraphEdgeDimension;
      edgeType: string;
      weight: number;
      evidenceChunkIds?: string[];
    },
  ) => {
    const node = graphEntityNodeInput(kind, label);
    if (node === undefined) return;
    addGraphNodeInput(nodesByCanonicalId, node);
    const chunks = boundedUniqueStrings(input.evidenceChunkIds, 8);
    for (const chunkId of chunks) evidenceChunkIds.add(chunkId);
    edges.push({
      targetCanonicalId: node.canonicalId,
      dimension: input.dimension,
      edgeType: input.edgeType,
      evidenceSourceId: sourceId,
      evidenceChunkIds: chunks,
      weight: clampGraphWeight(input.weight),
      createdBy: "graph_builder",
    });
  };

  for (const author of parseStringArray(stringField(source, "authors_json")).slice(0, 20)) {
    addEntityEdge("person", author, {
      dimension: "metadata",
      edgeType: "authored_by",
      weight: 1,
    });
  }

  const venue =
    stringMetadataField(metadata, "venue") ??
    stringMetadataField(metadata, "paper_source") ??
    stringMetadataField(metadata, "publisher");
  if (venue !== null) {
    addEntityEdge("venue", venue, {
      dimension: "metadata",
      edgeType: "published_in",
      weight: 0.9,
    });
  }

  for (const domain of [
    stringField(source, "source_type"),
    ...stringArrayMetadataField(metadata, "categories"),
    ...stringArrayMetadataField(metadata, "subjects"),
    ...stringArrayMetadataField(metadata, "keywords"),
  ]) {
    addEntityEdge("domain", domain, {
      dimension: "metadata",
      edgeType: "in_domain",
      weight: 0.75,
    });
  }

  const headingRows = graphSectionHeadingLabels(stringField(source, "section_outline_json"));
  for (const heading of headingRows) {
    addEntityEdge(classifyGraphHeadingKind(heading), heading, {
      dimension: "domain",
      edgeType: "section_mentions",
      weight: 0.65,
    });
  }

  const chunkRows = db.selectObjects(
    `SELECT id, ord, text, meta_head_json, page_start, page_end
     FROM source_chunks
     WHERE source_id = ?
     ORDER BY ord ASC
     LIMIT ?`,
    [sourceId, graphBuilderMaxChunkSamples],
  );
  let sampledChunkChars = 0;
  const chunkTermsByKind = new Map<
    GraphNodeKind,
    Map<string, { hitCount: number; chunks: Set<string> }>
  >();
  for (const chunk of chunkRows) {
    const chunkId = stringField(chunk, "id");
    const metaHead = parseMetadata(stringField(chunk, "meta_head_json"));
    const textParts = [
      stringMetadataField(metaHead, "docContext") ?? "",
      stringMetadataField(metaHead, "chunkSummary") ?? "",
    ];
    if (sampledChunkChars < graphBuilderMaxChunkSampleChars) {
      const sample = stringField(chunk, "text").slice(
        0,
        Math.max(0, graphBuilderMaxChunkSampleChars - sampledChunkChars),
      );
      sampledChunkChars += sample.length;
      textParts.push(sample);
    }
    for (const term of graphCandidateTerms(textParts.join("\n"))) {
      const kind = classifyGraphTermKind(term);
      const byTerm =
        chunkTermsByKind.get(kind) ?? new Map<string, { hitCount: number; chunks: Set<string> }>();
      const entry = byTerm.get(term) ?? { hitCount: 0, chunks: new Set<string>() };
      entry.hitCount += 1;
      if (chunkId.length > 0) entry.chunks.add(chunkId);
      byTerm.set(term, entry);
      chunkTermsByKind.set(kind, byTerm);
    }
  }

  for (const [kind, byTerm] of chunkTermsByKind) {
    const sorted = Array.from(byTerm.entries())
      .sort(
        (left, right) => right[1].hitCount - left[1].hitCount || left[0].localeCompare(right[0]),
      )
      .slice(0, graphBuilderMaxTermsPerKind);
    for (const [term, entry] of sorted) {
      const dimension: GraphEdgeDimension = kind === "method" ? "technical" : "domain";
      addEntityEdge(kind, term, {
        dimension,
        edgeType: dimension === "technical" ? "uses" : "mentions",
        weight: Math.min(0.85, 0.45 + entry.hitCount * 0.08),
        evidenceChunkIds: Array.from(entry.chunks).slice(0, 4),
      });
    }
  }

  return {
    nodes: Array.from(nodesByCanonicalId.values()),
    edges: dedupeGraphEdgeInputs(edges),
    evidenceChunkIds: Array.from(evidenceChunkIds),
  };
}

function addGraphNodeInput(nodes: Map<string, GraphNodeInput>, node: GraphNodeInput) {
  if (node.label.length === 0 || node.canonicalId.length === 0) return;
  if (!nodes.has(node.canonicalId)) nodes.set(node.canonicalId, node);
}

function graphEntityNodeInput(kind: GraphNodeKind, label: string): GraphNodeInput | undefined {
  if (kind === "source") return undefined;
  const normalizedLabel = normalizeGraphLabel(label);
  const canonicalLabel = normalizeGraphCanonicalLabel(normalizedLabel);
  if (normalizedLabel.length === 0 || canonicalLabel.length === 0) return undefined;
  return {
    kind,
    label: normalizedLabel,
    canonicalId: `${kind}:${canonicalLabel}`,
  };
}

function upsertGraphNode(db: SqliteDb, input: GraphNodeInput, now: string) {
  const existing = db.selectObject(
    "SELECT id FROM graph_nodes WHERE kind = ? AND canonical_id = ? LIMIT 1",
    [input.kind, input.canonicalId],
  );
  const nodeId = stringField(existing ?? {}, "id") || createId("graph_node");
  db.exec({
    sql: `INSERT INTO graph_nodes (
            id,
            kind,
            label,
            canonical_id,
            ref_id,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(kind, canonical_id) DO UPDATE SET
            label = excluded.label,
            ref_id = COALESCE(excluded.ref_id, graph_nodes.ref_id),
            updated_at = excluded.updated_at`,
    bind: [nodeId, input.kind, input.label, input.canonicalId, input.refId ?? null, now, now],
  });
  return nodeId;
}

function insertGraphEdge(db: SqliteDb, input: GraphEdgeInput, now: string) {
  db.exec({
    sql: `INSERT INTO graph_edges (
            id,
            source_node_id,
            target_node_id,
            dimension,
            edge_type,
            evidence_source_id,
            evidence_chunk_ids_json,
            weight,
            created_by,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [
      createId("graph_edge"),
      input.sourceNodeId,
      input.targetNodeId,
      input.dimension,
      normalizeText(input.edgeType),
      input.evidenceSourceId ?? null,
      JSON.stringify(boundedUniqueStrings(input.evidenceChunkIds, 8)),
      clampGraphWeight(input.weight),
      input.createdBy,
      now,
    ],
  });
}

function deleteGraphForSource(db: SqliteDb, sourceId: string) {
  const sourceNodeRows = db.selectObjects(
    "SELECT id FROM graph_nodes WHERE kind = 'source' AND ref_id = ?",
    [sourceId],
  );
  const sourceNodeIds = sourceNodeRows
    .map((row) => stringField(row, "id"))
    .filter((id) => id.length > 0);
  db.exec({ sql: "DELETE FROM graph_edges WHERE evidence_source_id = ?", bind: [sourceId] });
  if (sourceNodeIds.length > 0) {
    db.exec({
      sql: `DELETE FROM graph_edges
            WHERE source_node_id IN (${sourceNodeIds.map(() => "?").join(", ")})
               OR target_node_id IN (${sourceNodeIds.map(() => "?").join(", ")})`,
      bind: [...sourceNodeIds, ...sourceNodeIds],
    });
  }
  db.exec({
    sql: "DELETE FROM graph_nodes WHERE kind = 'source' AND ref_id = ?",
    bind: [sourceId],
  });
  db.exec(`
    DELETE FROM graph_nodes
    WHERE kind <> 'source'
      AND id NOT IN (
        SELECT source_node_id FROM graph_edges
        UNION
        SELECT target_node_id FROM graph_edges
      )
  `);
}

function queryGraphNeighbors(db: SqliteDb, payload: GraphNeighborsPayload): GraphQueryResult {
  const startNodes = resolveGraphStartNodes(db, payload);
  if (startNodes.length === 0) return emptyGraphQueryResult();
  const limit = clampOptionalLimit(payload.limit, 50, 200);
  const depth = Math.max(1, Math.min(2, Math.floor(payload.depth ?? 1)));
  const dimension = normalizeGraphDimension(payload.dimension);
  const edgesById = new Map<string, GraphEdge>();
  const nodesById = new Map<string, GraphNode>();
  let frontier = startNodes.map((node) => node.id);
  for (const node of startNodes) nodesById.set(node.id, node);

  for (let level = 0; level < depth && frontier.length > 0 && edgesById.size < limit; level += 1) {
    const rows = loadGraphEdgesAdjacentToNodes(db, frontier, dimension, limit - edgesById.size);
    const nextFrontier: string[] = [];
    for (const row of rows) {
      const edge = graphEdgeFromRow(row);
      if (!edgesById.has(edge.id)) edgesById.set(edge.id, edge);
      for (const nodeId of [edge.sourceNodeId, edge.targetNodeId]) {
        if (nodesById.has(nodeId)) continue;
        const node = loadGraphNode(db, nodeId);
        if (node === undefined) continue;
        nodesById.set(nodeId, node);
        nextFrontier.push(nodeId);
      }
    }
    frontier = nextFrontier;
  }

  const edges = Array.from(edgesById.values()).slice(0, limit);
  const nodes = Array.from(nodesById.values()).slice(0, limit + startNodes.length);
  return {
    nodes,
    edges,
    evidence: loadGraphEvidenceAnchors(db, edges),
  };
}

function queryGraphSubgraph(db: SqliteDb, payload: GraphSubgraphPayload): GraphQueryResult {
  const sourceIds = boundedUniqueStrings(payload.sourceIds, 40);
  const limit = clampOptionalLimit(payload.limit, 80, 200);
  const dimension = normalizeGraphDimension(payload.dimension);
  const rows =
    sourceIds.length === 0
      ? loadGraphEdges(db, dimension, limit)
      : loadGraphEdgesForSources(db, sourceIds, dimension, limit);
  const edges = rows.map(graphEdgeFromRow);
  return {
    nodes: loadGraphNodesForEdges(db, edges),
    edges,
    evidence: loadGraphEvidenceAnchors(db, edges),
  };
}

function resolveGraphStartNodes(db: SqliteDb, payload: GraphNeighborsPayload): GraphNode[] {
  if (payload.nodeId !== undefined) {
    const node = loadGraphNode(db, normalizeText(payload.nodeId));
    return node === undefined ? [] : [node];
  }
  if (payload.sourceId !== undefined) {
    const rows = db.selectObjects(
      "SELECT * FROM graph_nodes WHERE kind = 'source' AND ref_id = ? ORDER BY updated_at DESC LIMIT 5",
      [normalizeText(payload.sourceId)],
    );
    return rows.map(graphNodeFromRow);
  }
  if (payload.canonicalId !== undefined) {
    const canonicalId = normalizeText(payload.canonicalId);
    const kind = normalizeGraphNodeKind(payload.kind);
    const rows =
      kind === undefined
        ? db.selectObjects(
            "SELECT * FROM graph_nodes WHERE canonical_id = ? ORDER BY updated_at DESC LIMIT 20",
            [canonicalId],
          )
        : db.selectObjects(
            "SELECT * FROM graph_nodes WHERE kind = ? AND canonical_id = ? ORDER BY updated_at DESC LIMIT 20",
            [kind, canonicalId],
          );
    return rows.map(graphNodeFromRow);
  }
  return [];
}

function loadGraphEdgesAdjacentToNodes(
  db: SqliteDb,
  nodeIds: string[],
  dimension: GraphEdgeDimension | undefined,
  limit: number,
) {
  const boundedNodeIds = boundedUniqueStrings(nodeIds, 80);
  if (boundedNodeIds.length === 0) return [];
  const placeholders = boundedNodeIds.map(() => "?").join(", ");
  const dimensionSql = dimension === undefined ? "" : " AND dimension = ?";
  const bind = [
    ...boundedNodeIds,
    ...boundedNodeIds,
    ...(dimension === undefined ? [] : [dimension]),
    limit,
  ];
  return db.selectObjects(
    `SELECT *
     FROM graph_edges
     WHERE (source_node_id IN (${placeholders}) OR target_node_id IN (${placeholders}))
       ${dimensionSql}
     ORDER BY weight DESC, created_at DESC
     LIMIT ?`,
    bind,
  );
}

function loadGraphEdges(db: SqliteDb, dimension: GraphEdgeDimension | undefined, limit: number) {
  return dimension === undefined
    ? db.selectObjects(
        `SELECT *
         FROM graph_edges
         ORDER BY weight DESC, created_at DESC
         LIMIT ?`,
        [limit],
      )
    : db.selectObjects(
        `SELECT *
         FROM graph_edges
         WHERE dimension = ?
         ORDER BY weight DESC, created_at DESC
         LIMIT ?`,
        [dimension, limit],
      );
}

function loadGraphEdgesForSources(
  db: SqliteDb,
  sourceIds: string[],
  dimension: GraphEdgeDimension | undefined,
  limit: number,
) {
  const sourceNodes = db.selectObjects(
    `SELECT id
     FROM graph_nodes
     WHERE kind = 'source'
       AND ref_id IN (${sourceIds.map(() => "?").join(", ")})`,
    sourceIds,
  );
  const sourceNodeIds = sourceNodes
    .map((row) => stringField(row, "id"))
    .filter((id) => id.length > 0);
  const nodeSql =
    sourceNodeIds.length === 0
      ? ""
      : ` OR source_node_id IN (${sourceNodeIds.map(() => "?").join(", ")})
            OR target_node_id IN (${sourceNodeIds.map(() => "?").join(", ")})`;
  const dimensionSql = dimension === undefined ? "" : " AND dimension = ?";
  return db.selectObjects(
    `SELECT *
     FROM graph_edges
     WHERE (evidence_source_id IN (${sourceIds.map(() => "?").join(", ")})${nodeSql})
       ${dimensionSql}
     ORDER BY weight DESC, created_at DESC
     LIMIT ?`,
    [
      ...sourceIds,
      ...sourceNodeIds,
      ...sourceNodeIds,
      ...(dimension === undefined ? [] : [dimension]),
      limit,
    ],
  );
}

function loadGraphNode(db: SqliteDb, nodeId: string): GraphNode | undefined {
  const row = db.selectObject("SELECT * FROM graph_nodes WHERE id = ? LIMIT 1", [nodeId]);
  return row === undefined ? undefined : graphNodeFromRow(row);
}

function loadGraphNodesForEdges(db: SqliteDb, edges: GraphEdge[]) {
  const nodeIds = boundedUniqueStrings(
    edges.flatMap((edge) => [edge.sourceNodeId, edge.targetNodeId]),
    240,
  );
  if (nodeIds.length === 0) return [];
  const rows = db.selectObjects(
    `SELECT *
     FROM graph_nodes
     WHERE id IN (${nodeIds.map(() => "?").join(", ")})
     ORDER BY kind ASC, label ASC`,
    nodeIds,
  );
  return rows.map(graphNodeFromRow);
}

function loadGraphEvidenceAnchors(db: SqliteDb, edges: GraphEdge[]): GraphEvidenceAnchor[] {
  const anchorsByKey = new Map<string, GraphEvidenceAnchor>();
  const chunkIds = boundedUniqueStrings(
    edges.flatMap((edge) => edge.evidenceChunkIds),
    240,
  );
  if (chunkIds.length > 0) {
    const rows = db.selectObjects(
      `SELECT source_id, id, ord, text, page_start, page_end
       FROM source_chunks
       WHERE id IN (${chunkIds.map(() => "?").join(", ")})
       ORDER BY source_id ASC, ord ASC`,
      chunkIds,
    );
    for (const row of rows) {
      const anchor = graphEvidenceAnchorFromChunkRow(row);
      anchorsByKey.set(`${anchor.sourceId}:${anchor.chunkId ?? ""}`, anchor);
    }
  }

  const sourceOnlyIds = boundedUniqueStrings(
    edges.flatMap((edge) =>
      edge.evidenceSourceId !== undefined && edge.evidenceChunkIds.length === 0
        ? [edge.evidenceSourceId]
        : [],
    ),
    80,
  );
  for (const sourceId of sourceOnlyIds) {
    if (Array.from(anchorsByKey.values()).some((anchor) => anchor.sourceId === sourceId)) continue;
    const row = db.selectObject(
      `SELECT source_id, id, ord, text, page_start, page_end
       FROM source_chunks
       WHERE source_id = ?
       ORDER BY ord ASC
       LIMIT 1`,
      [sourceId],
    );
    if (row === undefined) continue;
    const anchor = graphEvidenceAnchorFromChunkRow(row);
    anchorsByKey.set(`${anchor.sourceId}:${anchor.chunkId ?? ""}`, anchor);
  }

  return Array.from(anchorsByKey.values());
}

function graphNodeFromRow(row: SqlRow): GraphNode {
  const refId = optionalString(row, "ref_id");
  return {
    id: stringField(row, "id"),
    kind: graphNodeKindField(row, "kind"),
    label: stringField(row, "label"),
    canonicalId: stringField(row, "canonical_id"),
    ...(refId === undefined ? {} : { refId }),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
  };
}

function graphEdgeFromRow(row: SqlRow): GraphEdge {
  const evidenceSourceId = optionalString(row, "evidence_source_id");
  return {
    id: stringField(row, "id"),
    sourceNodeId: stringField(row, "source_node_id"),
    targetNodeId: stringField(row, "target_node_id"),
    dimension: graphEdgeDimensionField(row, "dimension"),
    edgeType: stringField(row, "edge_type"),
    ...(evidenceSourceId === undefined ? {} : { evidenceSourceId }),
    evidenceChunkIds: parseStringArray(stringField(row, "evidence_chunk_ids_json")),
    weight: realField(row, "weight"),
    createdBy: graphEdgeCreatedByField(row, "created_by"),
    createdAt: stringField(row, "created_at"),
  };
}

function graphEvidenceAnchorFromChunkRow(row: SqlRow): GraphEvidenceAnchor {
  return {
    sourceId: stringField(row, "source_id"),
    chunkId: stringField(row, "id"),
    ord: numberField(row, "ord"),
    excerpt: excerpt(stringField(row, "text")),
    ...optionalPageRangeFromRow(row),
  };
}

function emptyGraphQueryResult(): GraphQueryResult {
  return { nodes: [], edges: [], evidence: [] };
}

function clampGraphWeight(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function graphSectionHeadingLabels(sectionOutlineJson: string) {
  const headings = parseJsonArray(sectionOutlineJson);
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const item of headings) {
    if (typeof item !== "object" || item === null) continue;
    const text =
      "text" in item && typeof item.text === "string" ? normalizeGraphLabel(item.text) : "";
    const key = normalizeGraphCanonicalLabel(text);
    if (text.length === 0 || key.length === 0 || text.length > 160 || seen.has(key)) continue;
    seen.add(key);
    labels.push(text);
    if (labels.length >= 40) break;
  }
  return labels;
}

function classifyGraphHeadingKind(label: string): GraphNodeKind {
  const normalized = normalizeGraphCanonicalLabel(label);
  if (
    /\b(method|methods|approach|architecture|implementation|pipeline|algorithm|adapter)\b/u.test(
      normalized,
    )
  ) {
    return "method";
  }
  if (/\b(problem|challenge|limitation|failure|risk|error)\b/u.test(normalized)) return "problem";
  if (/\b(dataset|benchmark|corpus|evaluation set)\b/u.test(normalized)) return "dataset";
  if (/\b(metric|evaluation|result|score|accuracy|latency|recall|precision)\b/u.test(normalized)) {
    return "metric";
  }
  return "domain";
}

function graphCandidateTerms(input: string) {
  const terms = new Map<string, number>();
  const tokens = keywordTokens(input).filter(isUsefulKeywordToken).slice(0, 400);
  for (const token of tokens) {
    addGraphCandidateTerm(terms, token, 1);
    if (isHanText(token)) {
      for (const bigram of hanBigrams(token)) addGraphCandidateTerm(terms, bigram, 1);
    }
  }
  for (let index = 0; index < tokens.length; index += 1) {
    for (let size = 2; size <= 4; size += 1) {
      const slice = tokens.slice(index, index + size);
      if (slice.length !== size || !slice.every(isUsefulKeywordToken)) continue;
      addGraphCandidateTerm(terms, slice.join(" "), size);
    }
  }
  return Array.from(terms.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([term]) => term)
    .slice(0, 80);
}

function addGraphCandidateTerm(terms: Map<string, number>, input: string, weight: number) {
  const label = normalizeGraphLabel(input);
  const canonical = normalizeGraphCanonicalLabel(label);
  if (label.length === 0 || canonical.length === 0) return;
  if (label.length < 2 || label.length > 80) return;
  if (
    /^(http|https|www|com|org|net|pdf|page|section|figure|table|appendix|copyright)$/iu.test(
      canonical,
    )
  ) {
    return;
  }
  terms.set(label, (terms.get(label) ?? 0) + weight);
}

function classifyGraphTermKind(term: string): GraphNodeKind {
  const normalized = normalizeGraphCanonicalLabel(term);
  if (
    /\b(model|algorithm|rag|retrieval|embedding|parser|adapter|index|search|queue|graph|api|agent|workflow|pipeline|chunk|rerank)\b/u.test(
      normalized,
    )
  ) {
    return "method";
  }
  if (/\b(dataset|benchmark|corpus|sample|eval set)\b/u.test(normalized)) return "dataset";
  if (
    /\b(accuracy|latency|recall|precision|score|metric|evaluation|throughput|quality)\b/u.test(
      normalized,
    )
  ) {
    return "metric";
  }
  if (/\b(failure|problem|error|limitation|challenge|risk|gap|issue)\b/u.test(normalized))
    return "problem";
  return "domain";
}

function dedupeGraphEdgeInputs(edges: DeterministicGraphBuild["edges"]) {
  const byKey = new Map<string, DeterministicGraphBuild["edges"][number]>();
  for (const edge of edges) {
    const key = [
      edge.targetCanonicalId,
      edge.dimension,
      normalizeText(edge.edgeType),
      edge.evidenceSourceId ?? "",
    ].join("|");
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, {
        ...edge,
        edgeType: normalizeText(edge.edgeType),
        evidenceChunkIds: boundedUniqueStrings(edge.evidenceChunkIds, 8),
        weight: clampGraphWeight(edge.weight),
      });
      continue;
    }
    byKey.set(key, {
      ...existing,
      evidenceChunkIds: boundedUniqueStrings(
        [...existing.evidenceChunkIds, ...edge.evidenceChunkIds],
        8,
      ),
      weight: Math.max(existing.weight, clampGraphWeight(edge.weight)),
    });
  }
  return Array.from(byKey.values());
}

function normalizeGraphLabel(label: string) {
  return normalizeText(label)
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})\]]+$/gu, "")
    .slice(0, 120)
    .trim();
}

function normalizeGraphCanonicalLabel(label: string) {
  return normalizeText(label)
    .toLocaleLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .slice(0, 160)
    .trim();
}

function normalizeGraphDimension(
  value: GraphEdgeDimension | undefined,
): GraphEdgeDimension | undefined {
  if (value === "metadata" || value === "citation" || value === "domain" || value === "technical") {
    return value;
  }
  return undefined;
}

function normalizeGraphNodeKind(value: GraphNodeKind | undefined): GraphNodeKind | undefined {
  if (
    value === "source" ||
    value === "person" ||
    value === "venue" ||
    value === "domain" ||
    value === "problem" ||
    value === "method" ||
    value === "dataset" ||
    value === "metric"
  ) {
    return value;
  }
  return undefined;
}

function graphNodeKindField(row: SqlRow, key: string): GraphNodeKind {
  return normalizeGraphNodeKind(stringField(row, key) as GraphNodeKind) ?? "domain";
}

function graphEdgeDimensionField(row: SqlRow, key: string): GraphEdgeDimension {
  return normalizeGraphDimension(stringField(row, key) as GraphEdgeDimension) ?? "domain";
}

function graphEdgeCreatedByField(row: SqlRow, key: string): GraphEdgeCreatedBy {
  const value = stringField(row, key);
  if (value === "adapter" || value === "user") return value;
  return "graph_builder";
}

function replaceKeywordIndexForSource(db: SqliteDb, sourceId: string) {
  const previousTerms = new Set(
    db
      .selectObjects("SELECT term FROM keyword_index_sources WHERE source_id = ?", [sourceId])
      .map((row) => stringField(row, "term"))
      .filter((term) => term.length > 0),
  );
  db.exec({ sql: "DELETE FROM keyword_index_sources WHERE source_id = ?", bind: [sourceId] });

  const terms = collectKeywordTermsForSource(db, sourceId);
  const now = new Date().toISOString();
  for (const [term, hitCount] of terms) {
    const normalizedTerm = normalizeKeywordTerm(term);
    if (normalizedTerm === undefined) continue;
    db.exec({
      sql: `INSERT INTO keyword_index (
              term,
              normalized_term,
              source_count,
              hit_count,
              updated_at
            ) VALUES (?, ?, 0, 0, ?)
            ON CONFLICT(term) DO UPDATE SET
              normalized_term = excluded.normalized_term,
              updated_at = excluded.updated_at`,
      bind: [normalizedTerm, normalizedTerm, now],
    });
    db.exec({
      sql: `INSERT INTO keyword_index_sources (
              term,
              source_id,
              hit_count
            ) VALUES (?, ?, ?)
            ON CONFLICT(term, source_id) DO UPDATE SET
              hit_count = excluded.hit_count`,
      bind: [normalizedTerm, sourceId, hitCount],
    });
    previousTerms.add(normalizedTerm);
  }

  for (const term of previousTerms) {
    refreshKeywordIndexTerm(db, term, now);
  }
}

function deleteKeywordIndexForSource(db: SqliteDb, sourceId: string) {
  const terms = new Set(
    db
      .selectObjects("SELECT term FROM keyword_index_sources WHERE source_id = ?", [sourceId])
      .map((row) => stringField(row, "term"))
      .filter((term) => term.length > 0),
  );
  db.exec({ sql: "DELETE FROM keyword_index_sources WHERE source_id = ?", bind: [sourceId] });
  const now = new Date().toISOString();
  for (const term of terms) {
    refreshKeywordIndexTerm(db, term, now);
  }
}

function refreshKeywordIndexTerm(db: SqliteDb, term: string, updatedAt: string) {
  const normalizedTerm = normalizeKeywordTerm(term);
  if (normalizedTerm === undefined) return;
  const aggregate = db.selectObject(
    `SELECT
      COUNT(DISTINCT source_id) AS source_count,
      COALESCE(SUM(hit_count), 0) AS hit_count
     FROM keyword_index_sources
     WHERE term = ?`,
    [normalizedTerm],
  );
  const sourceCount = numberField(aggregate ?? {}, "source_count");
  if (sourceCount <= 0) {
    db.exec({ sql: "DELETE FROM keyword_index WHERE term = ?", bind: [normalizedTerm] });
    return;
  }
  db.exec({
    sql: `UPDATE keyword_index
          SET source_count = ?,
              hit_count = ?,
              updated_at = ?
          WHERE term = ?`,
    bind: [sourceCount, numberField(aggregate ?? {}, "hit_count"), updatedAt, normalizedTerm],
  });
}

function collectKeywordTermsForSource(db: SqliteDb, sourceId: string) {
  const row = db.selectObject(
    `SELECT
      s.source_title,
      s.source_url,
      s.source_type,
      s.lifecycle_status,
      sm.title AS meta_title,
      sm.abstract AS meta_abstract,
      sm.source_type AS meta_source_type,
      sm.authors_json,
      sm.metadata_json
     FROM sources s
     LEFT JOIN source_metadata sm ON sm.source_id = s.id
     WHERE s.id = ?
       AND s.lifecycle_status <> 'deleted'
     LIMIT 1`,
    [sourceId],
  );
  const terms = new Map<string, number>();
  if (row === undefined) return terms;

  addKeywordTermsFromText(terms, stringField(row, "source_title"), 5);
  addKeywordTermsFromText(terms, stringField(row, "meta_title"), 5);
  addKeywordTermsFromText(terms, stringField(row, "meta_abstract"), 3);
  addKeywordTermsFromText(terms, stringField(row, "meta_source_type"), 2);
  addKeywordTermsFromText(terms, stringField(row, "source_type"), 2);
  for (const author of parseStringArray(stringField(row, "authors_json")).slice(0, 20)) {
    addKeywordTermsFromText(terms, author, 2);
  }

  const metadata = parseMetadata(stringField(row, "metadata_json"));
  for (const key of ["title", "abstract", "source_type", "paper_source", "venue", "doi"]) {
    const value = stringMetadataField(metadata, key);
    if (value !== null) addKeywordTermsFromText(terms, value, key === "abstract" ? 2 : 3);
  }
  for (const key of ["authors", "categories", "subjects", "keywords"]) {
    for (const value of stringArrayMetadataField(metadata, key)) {
      addKeywordTermsFromText(terms, value, 2);
    }
  }

  let sampledChunkChars = 0;
  const chunkRows = db.selectObjects(
    `SELECT text, meta_head_json
     FROM source_chunks
     WHERE source_id = ?
     ORDER BY ord ASC
     LIMIT ?`,
    [sourceId, keywordIndexMaxChunkSamples],
  );
  for (const chunk of chunkRows) {
    const metaHead = parseMetadata(stringField(chunk, "meta_head_json"));
    const docContext = stringMetadataField(metaHead, "docContext");
    if (docContext !== null) addKeywordTermsFromText(terms, docContext, 2);
    const chunkSummary = stringMetadataField(metaHead, "chunkSummary");
    if (chunkSummary !== null) addKeywordTermsFromText(terms, chunkSummary, 2);

    if (sampledChunkChars < keywordIndexChunkTextMaxChars) {
      const sample = stringField(chunk, "text").slice(
        0,
        Math.max(0, keywordIndexMaxChunkSampleChars),
      );
      sampledChunkChars += sample.length;
      addKeywordTermsFromText(terms, sample, 1);
    }
    if (terms.size >= keywordIndexMaxTermsPerSource) break;
  }

  return terms;
}

function addKeywordTermsFromText(terms: Map<string, number>, input: string, weight: number) {
  if (terms.size >= keywordIndexMaxTermsPerSource) return;
  const tokens = keywordTokens(input).filter(isUsefulKeywordToken);
  for (const token of tokens) {
    addKeywordTerm(terms, token, weight);
    if (terms.size >= keywordIndexMaxTermsPerSource) return;
    if (isHanText(token)) {
      for (const bigram of hanBigrams(token)) {
        addKeywordTerm(terms, bigram, weight);
        if (terms.size >= keywordIndexMaxTermsPerSource) return;
      }
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    for (let size = 2; size <= 4; size += 1) {
      const slice = tokens.slice(index, index + size);
      if (slice.length !== size || !slice.every(isUsefulKeywordToken)) continue;
      addKeywordTerm(terms, slice.join(" "), weight + size - 1);
      if (terms.size >= keywordIndexMaxTermsPerSource) return;
    }
  }
}

function addKeywordTerm(terms: Map<string, number>, input: string, weight: number) {
  const term = normalizeKeywordTerm(input);
  if (term === undefined) return;
  terms.set(term, (terms.get(term) ?? 0) + Math.max(1, Math.floor(weight)));
}

function keywordTokens(input: string) {
  return (
    normalizeText(input)
      .toLocaleLowerCase()
      .match(/\p{Script=Han}+|[\p{L}\p{N}_-]+/gu) ?? []
  ).flatMap((token) => {
    const normalized = normalizeKeywordTerm(token);
    return normalized === undefined ? [] : [normalized];
  });
}

function normalizeKeywordTerm(input: string) {
  const normalized = normalizeText(input)
    .toLocaleLowerCase()
    .replace(/[_-]{2,}/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .slice(0, keywordIndexMaxTermChars)
    .trim();
  if (normalized.length < 2 || normalized.length > keywordIndexMaxTermChars) return undefined;
  if (/^\d+$/u.test(normalized)) return undefined;
  if (!normalized.match(/[\p{L}\p{N}]/u)) return undefined;
  if (keywordIndexStopWords.has(normalized)) return undefined;
  return normalized;
}

function isUsefulKeywordToken(token: string) {
  if (keywordIndexStopWords.has(token)) return false;
  if (/^\d+$/u.test(token)) return false;
  if (isHanText(token)) return Array.from(token).length >= 2;
  return token.length >= 3;
}

function isHanText(input: string) {
  return /^\p{Script=Han}+$/u.test(input);
}

function hanBigrams(input: string) {
  const chars = Array.from(input);
  const bigrams: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    const current = chars[index];
    const next = chars[index + 1];
    if (current !== undefined && next !== undefined) bigrams.push(`${current}${next}`);
  }
  return bigrams;
}

function loadWorkingSetStatus(db: SqliteDb): WorkingSetStatusResult {
  const rows = db.selectObjects(
    `SELECT
      ws.source_id,
      s.id,
      ws.load_depth,
      ws.pin_status,
      ws.evict_reason,
      ws.reload_count,
      ws.loaded_at,
      ws.updated_at,
      s.source_kind,
      s.source_url,
      s.normalized_source_url,
      s.source_title,
      s.captured_at,
      s.content_hash,
      s.lifecycle_status,
      s.version_group_key,
      s.version_no,
      s.supersedes_source_id,
      s.superseded_by_source_id,
      s.is_current,
      sm.source_type,
      sm.abstract,
      COUNT(c.id) AS chunk_count,
      COALESCE(SUM(c.token_count), 0) AS chunk_tokens
     FROM source_working_set ws
     JOIN sources s ON s.id = ws.source_id
     LEFT JOIN source_metadata sm ON sm.source_id = ws.source_id
     LEFT JOIN source_chunks c ON c.source_id = ws.source_id
     WHERE s.lifecycle_status <> 'deleted'
     GROUP BY ws.source_id
     ORDER BY
      CASE ws.pin_status
        WHEN 'pinned' THEN 0
        WHEN 'auto' THEN 1
        ELSE 2
      END,
      ws.updated_at DESC,
      s.captured_at DESC`,
  );
  const entries = rows.map((row) => workingSetEntryFromRow(row));
  return {
    entries,
    totalTokenEstimate: entries.reduce((sum, entry) => sum + entry.tokenEstimate, 0),
    budget: defaultWorkingSetBudgetTokens,
  };
}

function upsertWorkingSetEntry(
  db: SqliteDb,
  input: {
    sourceId: string;
    loadDepth: WorkingSetLoadDepth;
    pinStatus: "pinned" | "auto";
    evictReason: string | null;
    reload: boolean;
  },
) {
  const sourceId = normalizeRequiredId(input.sourceId, "sourceId");
  assertWorkingSetLoadDepth(input.loadDepth);
  assertWorkingSetSource(db, sourceId);
  const now = new Date().toISOString();
  db.exec({
    sql: `INSERT INTO source_working_set (
            source_id,
            load_depth,
            pin_status,
            evict_reason,
            reload_count,
            loaded_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id) DO UPDATE SET
            load_depth = excluded.load_depth,
            pin_status = CASE
              WHEN source_working_set.pin_status = 'pinned'
                AND excluded.pin_status = 'auto'
              THEN 'pinned'
              ELSE excluded.pin_status
            END,
            evict_reason = excluded.evict_reason,
            reload_count = source_working_set.reload_count + ?,
            loaded_at = CASE
              WHEN ? = 1 THEN excluded.loaded_at
              ELSE source_working_set.loaded_at
            END,
            updated_at = excluded.updated_at`,
    bind: [
      sourceId,
      input.loadDepth,
      input.pinStatus,
      input.evictReason,
      input.reload ? 1 : 0,
      now,
      now,
      input.reload ? 1 : 0,
      input.reload ? 1 : 0,
    ],
  });
}

function assertWorkingSetSource(db: SqliteDb, sourceId: string) {
  const id = normalizeRequiredId(sourceId, "sourceId");
  const source = db.selectObject(
    "SELECT id FROM sources WHERE id = ? AND lifecycle_status <> 'deleted' LIMIT 1",
    [id],
  );
  if (source === undefined) {
    throw new EngineRpcError("WORKING_SET_SOURCE_NOT_FOUND", `Source not found: ${id}`);
  }
}

function normalizeRequiredId(value: string, fieldName: string) {
  const id = normalizeText(value);
  if (id.length === 0) {
    throw new EngineRpcError("INVALID_REQUEST", `${fieldName} is required.`);
  }
  return id;
}

function assertWorkingSetLoadDepth(value: WorkingSetLoadDepth) {
  if (!workingSetLoadDepths.includes(value)) {
    throw new EngineRpcError("INVALID_WORKING_SET_DEPTH", `Invalid working-set depth: ${value}`);
  }
}

function workingSetEntryFromRow(row: SqlRow): WorkingSetStatusResult["entries"][number] {
  const abstract = optionalString(row, "abstract");
  const loadDepth = workingSetLoadDepthField(row, "load_depth");
  const chunkCount = numberField(row, "chunk_count");
  const chunkTokens = numberField(row, "chunk_tokens");
  const fallbackExcerpt =
    abstract ?? (stringField(row, "source_title") || stringField(row, "source_url"));
  return {
    source: {
      ...memorySummaryFromRetrievalRow(row, fallbackExcerpt),
      sourceType: stringField(row, "source_type") || "webpage",
      lifecycleStatus: searchableLifecycleStatusField(row, "lifecycle_status"),
      ...(abstract === undefined ? {} : { abstract: excerpt(abstract, workingSetExcerptMaxChars) }),
      chunkCount,
    },
    loadDepth,
    pinStatus: workingSetPinStatusField(row, "pin_status"),
    ...(optionalString(row, "evict_reason") === undefined
      ? {}
      : { evictReason: stringField(row, "evict_reason") }),
    reloadCount: numberField(row, "reload_count"),
    loadedAt: stringField(row, "loaded_at"),
    updatedAt: stringField(row, "updated_at"),
    tokenEstimate: estimateWorkingSetTokens(loadDepth, chunkCount, chunkTokens, abstract),
  };
}

function estimateWorkingSetTokens(
  loadDepth: WorkingSetLoadDepth,
  chunkCount: number,
  chunkTokens: number,
  abstract: string | undefined,
) {
  const metaTokens = Math.max(80, Math.ceil((abstract?.length ?? workingSetExcerptMaxChars) / 4));
  if (loadDepth === "meta") return metaTokens;
  if (loadDepth === "outline") return metaTokens + Math.min(400, Math.max(80, chunkCount * 24));
  if (loadDepth === "chunks") return metaTokens + Math.min(chunkTokens, 8_000);
  return metaTokens + Math.min(chunkTokens, 16_000);
}

function buildSourceContextPack(
  db: SqliteDb,
  payload: BuildSourceContextPackPayload,
): SourceContextPackResult {
  const options = normalizeSourceContextPackOptions(payload);
  const compressionLog: SourceContextCompressionLogEntry[] = [];
  const candidates = resolveSourceContextPackCandidates(db, options, compressionLog);
  const states = loadSourceContextSourceStates(db, candidates, compressionLog);
  const sourcePacks = states.flatMap((state) => {
    const pack = buildSourceContextSourcePack(db, state, options, compressionLog);
    return pack === undefined ? [] : [pack];
  });
  const packed = packSourceContextGroups(sourcePacks, options, compressionLog);
  const totalTokenEstimate = packed.groups.reduce((sum, group) => sum + group.tokenEstimate, 0);

  return {
    ...(options.query.length === 0 ? {} : { query: options.query }),
    sources: packed.sources,
    groups: packed.groups,
    compressionLog,
    trace: {
      strategy: "source_context_pack_v1",
      requestedSourceCount: candidates.length,
      packedSourceCount: packed.sources.length,
      totalTokenEstimate,
      budget: options.maxTotalTokens,
    },
  };
}

function normalizeSourceContextPackOptions(
  payload: BuildSourceContextPackPayload,
): SourceContextPackOptions {
  const query = normalizeText(payload.query ?? "");
  const maxTotalTokens = clampTokenBudget(
    payload.maxTotalTokens,
    defaultSourceContextPackTotalTokens,
    maxSourceContextPackTotalTokens,
  );
  const maxGroupTokens = Math.min(
    maxTotalTokens,
    clampTokenBudget(
      payload.maxGroupTokens,
      Math.min(defaultSourceContextPackGroupTokens, maxTotalTokens),
      maxSourceContextPackGroupTokens,
    ),
  );
  return {
    query,
    ftsQuery: buildFtsQuery(query),
    sourceIds: boundedUniqueStrings(payload.sourceIds, maxSourceContextPackSources),
    anchors: boundedEvidenceWindowAnchors(payload.anchors, 80),
    useWorkingSet: payload.useWorkingSet !== false,
    maxTotalTokens,
    maxGroups: clampOptionalLimit(
      payload.maxGroups,
      defaultSourceContextPackGroups,
      maxSourceContextPackGroups,
    ),
    maxGroupTokens,
    maxSources: clampOptionalLimit(
      payload.maxSources,
      defaultSourceContextPackSources,
      maxSourceContextPackSources,
    ),
    maxWindowsPerSource: clampOptionalLimit(
      payload.maxWindowsPerSource,
      defaultSourceContextPackWindowsPerSource,
      maxSourceContextPackWindowsPerSource,
    ),
    contextChunksBefore: clampOptionalCount(payload.contextChunksBefore, 1, 3),
    contextChunksAfter: clampOptionalCount(payload.contextChunksAfter, 1, 3),
  };
}

function clampTokenBudget(value: number | undefined, fallback: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(Math.floor(value), max));
}

function resolveSourceContextPackCandidates(
  db: SqliteDb,
  options: SourceContextPackOptions,
  compressionLog: SourceContextCompressionLogEntry[],
): SourceContextPackCandidate[] {
  const candidates = new Map<string, SourceContextPackCandidate>();

  const touchCandidate = (
    sourceId: string,
    update: Omit<Partial<SourceContextPackCandidate>, "sourceId" | "rank">,
  ) => {
    const id = normalizeText(sourceId);
    if (id.length === 0) return;
    const existing = candidates.get(id);
    if (existing === undefined && candidates.size >= options.maxSources) return;
    if (existing === undefined) {
      candidates.set(id, {
        sourceId: id,
        rank: candidates.size,
        explicit: update.explicit === true,
        anchored: update.anchored === true,
        query: update.query === true,
        ...(update.workingSet === undefined ? {} : { workingSet: update.workingSet }),
      });
      return;
    }
    candidates.set(id, {
      ...existing,
      explicit: existing.explicit || update.explicit === true,
      anchored: existing.anchored || update.anchored === true,
      query: existing.query || update.query === true,
      workingSet: update.workingSet ?? existing.workingSet,
    });
  };

  for (const sourceId of options.sourceIds) {
    touchCandidate(sourceId, { explicit: true });
  }
  for (const anchor of options.anchors) {
    touchCandidate(anchor.memoryId, { anchored: true });
  }
  if (options.useWorkingSet) {
    for (const row of loadActiveWorkingSetSourceRows(db, options.maxSources)) {
      touchCandidate(stringField(row, "source_id"), {
        workingSet: {
          loadDepth: workingSetLoadDepthField(row, "load_depth"),
          pinStatus: workingSetPinStatusField(row, "pin_status"),
          updatedAt: stringField(row, "updated_at"),
        },
      });
    }
  }
  if (candidates.size === 0 && options.ftsQuery.length > 0) {
    for (const sourceId of loadSourceContextQuerySourceIds(
      db,
      options.ftsQuery,
      options.maxSources,
    )) {
      touchCandidate(sourceId, { query: true });
    }
    if (candidates.size === 0) {
      compressionLog.push({
        reason: "query_no_hits",
        message: "Query did not match any saved source for context packing.",
      });
    }
  }

  return [...candidates.values()].slice(0, options.maxSources);
}

function loadActiveWorkingSetSourceRows(db: SqliteDb, limit: number) {
  return db.selectObjects(
    `SELECT
      ws.source_id,
      ws.load_depth,
      ws.pin_status,
      ws.updated_at
     FROM source_working_set ws
     JOIN sources s ON s.id = ws.source_id
     WHERE s.lifecycle_status <> 'deleted'
       AND ws.pin_status <> 'evicted'
     ORDER BY
      CASE ws.pin_status
        WHEN 'pinned' THEN 0
        ELSE 1
      END,
      ws.updated_at DESC,
      s.captured_at DESC
     LIMIT ?`,
    [limit],
  );
}

function loadSourceContextQuerySourceIds(db: SqliteDb, ftsQuery: string, limit: number) {
  const ids: string[] = [];
  const seen = new Set<string>();
  const addRows = (rows: SqlRow[]) => {
    for (const row of rows) {
      const id = stringField(row, "source_id");
      if (id.length === 0 || seen.has(id) || ids.length >= limit) continue;
      seen.add(id);
      ids.push(id);
    }
  };

  addRows(
    db.selectObjects(
      `SELECT
        s.id AS source_id,
        bm25(source_fts) AS score
       FROM source_fts
       JOIN sources s ON s.id = source_fts.source_id
       WHERE source_fts MATCH ?
         AND s.lifecycle_status <> 'deleted'
       ORDER BY score ASC
       LIMIT ?`,
      [ftsQuery, limit * 2],
    ),
  );
  if (ids.length < limit) {
    addRows(
      db.selectObjects(
        `SELECT
          s.id AS source_id,
          bm25(source_metadata_fts) AS score
         FROM source_metadata_fts
         JOIN sources s ON s.id = source_metadata_fts.source_id
         WHERE source_metadata_fts MATCH ?
           AND s.lifecycle_status <> 'deleted'
         ORDER BY score ASC
         LIMIT ?`,
        [ftsQuery, limit * 2],
      ),
    );
  }

  return ids;
}

function loadSourceContextSourceStates(
  db: SqliteDb,
  candidates: SourceContextPackCandidate[],
  compressionLog: SourceContextCompressionLogEntry[],
): SourceContextSourceState[] {
  if (candidates.length === 0) return [];
  const candidateById = new Map(candidates.map((candidate) => [candidate.sourceId, candidate]));
  const rows = db.selectObjects(
    `SELECT
      s.id,
      s.source_kind,
      s.source_type,
      s.source_url,
      s.source_title,
      s.captured_at,
      sm.source_type AS meta_source_type,
      sm.abstract,
      sm.section_outline_json,
      ws.load_depth,
      ws.pin_status,
      ws.updated_at AS working_set_updated_at,
      COUNT(c.id) AS chunk_count,
      COALESCE(SUM(c.token_count), 0) AS chunk_tokens
     FROM sources s
     LEFT JOIN source_metadata sm ON sm.source_id = s.id
     LEFT JOIN source_working_set ws ON ws.source_id = s.id
     LEFT JOIN source_chunks c ON c.source_id = s.id
     WHERE s.lifecycle_status <> 'deleted'
       AND s.id IN (${candidates.map(() => "?").join(", ")})
     GROUP BY s.id`,
    candidates.map((candidate) => candidate.sourceId),
  );
  const found = new Set(rows.map((row) => stringField(row, "id")));
  for (const candidate of candidates) {
    if (!found.has(candidate.sourceId)) {
      compressionLog.push({
        reason: "source_not_found",
        sourceId: candidate.sourceId,
        message: "Requested source was missing or deleted and was skipped.",
      });
    }
  }

  return rows
    .flatMap((row): SourceContextSourceState[] => {
      const sourceId = stringField(row, "id");
      const candidate = candidateById.get(sourceId);
      if (candidate === undefined) return [];
      const abstract = optionalString(row, "abstract");
      const sectionOutline = parseSourceContextSectionOutline(
        stringField(row, "section_outline_json"),
      );
      const chunkCount = numberField(row, "chunk_count");
      const totalChunkTokens = numberField(row, "chunk_tokens");
      const sourceType =
        stringField(row, "meta_source_type") || stringField(row, "source_type") || "webpage";
      const requestedLoadDepth =
        optionalString(row, "load_depth") === undefined
          ? "chunks"
          : workingSetLoadDepthField(row, "load_depth");
      const pinStatus =
        optionalString(row, "pin_status") === undefined
          ? undefined
          : workingSetPinStatusField(row, "pin_status");
      const metaTokenEstimate = estimateSourceContextMetaTokens(row, abstract);
      const outlineTokenEstimate = estimateSourceContextOutlineTokens(sectionOutline);
      return [
        {
          rank: candidate.rank,
          capturedAt: stringField(row, "captured_at"),
          updatedAt:
            optionalString(row, "working_set_updated_at") ?? stringField(row, "captured_at"),
          metaTokenEstimate,
          outlineTokenEstimate,
          totalChunkTokens,
          source: {
            id: sourceId,
            sourceKind: sourceKindField(row, "source_kind"),
            sourceUrl: stringField(row, "source_url"),
            sourceTitle: stringField(row, "source_title"),
            capturedAt: stringField(row, "captured_at"),
            sourceType,
            ...(abstract === undefined
              ? {}
              : { abstract: excerpt(abstract, chunkMetaAbstractMaxChars) }),
            sectionOutline,
            chunkCount,
            tokenEstimate: metaTokenEstimate + outlineTokenEstimate + totalChunkTokens,
            selectedTokenEstimate: 0,
            requestedLoadDepth,
            selectedLoadDepth: requestedLoadDepth,
            ...(pinStatus === undefined ? {} : { pinStatus }),
            windowCount: 0,
          },
        },
      ];
    })
    .sort(compareSourceContextSourceState);
}

function parseSourceContextSectionOutline(input: string): SourceContextPackOutlineItem[] {
  const raw = parseJsonArray(input).slice(0, sourceContextPackOutlineMaxItems);
  return raw.flatMap((item): SourceContextPackOutlineItem[] => {
    if (!isRecord(item)) return [];
    const text = typeof item.text === "string" ? normalizeText(item.text).slice(0, 240) : "";
    if (text.length === 0) return [];
    const level =
      typeof item.level === "number" && Number.isFinite(item.level)
        ? Math.max(1, Math.min(Math.floor(item.level), 6))
        : undefined;
    return [{ text, ...(level === undefined ? {} : { level }) }];
  });
}

function estimateSourceContextMetaTokens(row: SqlRow, abstract: string | undefined) {
  const text = [
    stringField(row, "source_title"),
    stringField(row, "source_url"),
    stringField(row, "meta_source_type") || stringField(row, "source_type"),
    abstract ?? "",
  ]
    .map(normalizeText)
    .filter((part) => part.length > 0)
    .join("\n");
  return Math.min(sourceContextPackMetaMaxTokens, estimateTokens(text || "source metadata"));
}

function estimateSourceContextOutlineTokens(outline: SourceContextPackOutlineItem[]) {
  if (outline.length === 0) return 0;
  return Math.min(
    sourceContextPackOutlineMaxTokens,
    estimateTokens(outline.map((item) => item.text).join("\n")),
  );
}

function compareSourceContextSourceState(
  left: SourceContextSourceState,
  right: SourceContextSourceState,
) {
  const leftPinned = left.source.pinStatus === "pinned" ? 0 : 1;
  const rightPinned = right.source.pinStatus === "pinned" ? 0 : 1;
  if (leftPinned !== rightPinned) return leftPinned - rightPinned;
  if (left.rank !== right.rank) return left.rank - right.rank;
  if (left.source.selectedTokenEstimate !== right.source.selectedTokenEstimate) {
    return left.source.selectedTokenEstimate - right.source.selectedTokenEstimate;
  }
  const updated = right.updatedAt.localeCompare(left.updatedAt);
  if (updated !== 0) return updated;
  const captured = right.capturedAt.localeCompare(left.capturedAt);
  if (captured !== 0) return captured;
  return left.source.id.localeCompare(right.source.id);
}

function buildSourceContextSourcePack(
  db: SqliteDb,
  state: SourceContextSourceState,
  options: SourceContextPackOptions,
  compressionLog: SourceContextCompressionLogEntry[],
): SourceContextSourcePack | undefined {
  const requestedDepth = state.source.requestedLoadDepth;
  const baseTokenEstimate = sourceContextBaseTokenEstimate(state, requestedDepth);
  const metaOnlyTokenEstimate = sourceContextBaseTokenEstimate(state, "meta");
  if (metaOnlyTokenEstimate > options.maxGroupTokens) {
    compressionLog.push({
      reason: "source_over_budget",
      sourceId: state.source.id,
      requestedLoadDepth: requestedDepth,
      tokenEstimate: metaOnlyTokenEstimate,
      message: "Source metadata exceeded the per-group context budget and was skipped.",
    });
    return undefined;
  }

  const windows = loadSourceContextCandidateWindows(db, state, options);
  const maxSourceTokens = Math.min(options.maxGroupTokens, options.maxTotalTokens);
  let selectedDepth = requestedDepth;
  let tokenEstimate = baseTokenEstimate;
  const selectedWindows: InternalSourceContextWindow[] = [];
  let omittedWindowCount = 0;
  let omittedTokenEstimate = 0;

  if (baseTokenEstimate > maxSourceTokens) {
    selectedDepth = "meta";
    tokenEstimate = metaOnlyTokenEstimate;
    compressionLog.push({
      reason: "source_downgraded",
      sourceId: state.source.id,
      requestedLoadDepth: requestedDepth,
      selectedLoadDepth: selectedDepth,
      tokenEstimate: baseTokenEstimate,
      message: "Source outline/context metadata was downgraded to metadata-only to fit budget.",
    });
  }

  for (const window of windows) {
    if (selectedWindows.length >= options.maxWindowsPerSource) {
      omittedWindowCount += 1;
      omittedTokenEstimate += window.tokenEstimate;
      continue;
    }
    if (tokenEstimate + window.tokenEstimate > maxSourceTokens) {
      omittedWindowCount += 1;
      omittedTokenEstimate += window.tokenEstimate;
      continue;
    }
    selectedWindows.push(window);
    tokenEstimate += window.tokenEstimate;
  }

  if (requestedDepth === "full") {
    const selectedWindowTokens = selectedWindows.reduce(
      (sum, window) => sum + window.tokenEstimate,
      0,
    );
    compressionLog.push({
      reason: "full_depth_bounded",
      sourceId: state.source.id,
      requestedLoadDepth: "full",
      selectedLoadDepth: selectedWindows.length > 0 ? "chunks" : selectedDepth,
      omittedTokenEstimate: Math.max(0, state.totalChunkTokens - selectedWindowTokens),
      message: "Full depth was bounded to selected chunk windows; no whole source text was loaded.",
    });
  }
  if (omittedWindowCount > 0) {
    compressionLog.push({
      reason: "chunk_window_omitted",
      sourceId: state.source.id,
      requestedLoadDepth: requestedDepth,
      omittedTokenEstimate,
      omittedWindowCount,
      message: "Some candidate chunk windows were omitted because of per-source or token limits.",
    });
  }

  const effectiveDepth = selectedSourceContextDepth(requestedDepth, selectedDepth, selectedWindows);
  if (effectiveDepth !== requestedDepth && requestedDepth !== "full") {
    compressionLog.push({
      reason: "source_downgraded",
      sourceId: state.source.id,
      requestedLoadDepth: requestedDepth,
      selectedLoadDepth: effectiveDepth,
      message: "Source context depth was downgraded after bounded window selection.",
    });
  }

  return {
    source: {
      ...state.source,
      selectedTokenEstimate: tokenEstimate,
      selectedLoadDepth: effectiveDepth,
      windowCount: selectedWindows.length,
    },
    windows: selectedWindows,
    tokenEstimate,
    omittedWindowCount,
    omittedTokenEstimate,
  };
}

function sourceContextBaseTokenEstimate(
  state: SourceContextSourceState,
  depth: WorkingSetLoadDepth,
) {
  if (depth === "meta") return state.metaTokenEstimate;
  return state.metaTokenEstimate + state.outlineTokenEstimate;
}

function selectedSourceContextDepth(
  requestedDepth: WorkingSetLoadDepth,
  selectedDepth: WorkingSetLoadDepth,
  windows: InternalSourceContextWindow[],
): WorkingSetLoadDepth {
  if (windows.length > 0) return requestedDepth === "full" ? "chunks" : selectedDepth;
  if (selectedDepth === "meta") return "meta";
  return selectedDepth === "full" || selectedDepth === "chunks" ? "outline" : selectedDepth;
}

function loadSourceContextCandidateWindows(
  db: SqliteDb,
  state: SourceContextSourceState,
  options: SourceContextPackOptions,
): InternalSourceContextWindow[] {
  const windows: InternalSourceContextWindow[] = [];
  const seenWindows = new Set<string>();
  const anchorRows = loadAnchorsBySourceId(db, [state.source.id]);

  const addWindow = (anchorOrd: number, priority: SourceContextPackWindowPriority) => {
    const window = loadSourceEvidenceWindow(db, {
      sourceId: state.source.id,
      anchorOrd,
      contextChunksBefore: options.contextChunksBefore,
      contextChunksAfter: options.contextChunksAfter,
      anchor: anchorRows.get(state.source.id),
    });
    if (window === undefined) return;
    const key = `${window.memoryId}:${window.chunkId}`;
    if (seenWindows.has(key)) return;
    seenWindows.add(key);
    windows.push(sourceContextWindowFromEvidenceWindow(window, state.source.sourceType, priority));
  };

  for (const anchor of options.anchors) {
    if (anchor.memoryId !== state.source.id) continue;
    const anchorOrd = resolveEvidenceWindowAnchorOrd(db, anchor);
    if (anchorOrd === undefined) continue;
    addWindow(anchorOrd, "anchor");
  }

  const depth = state.source.requestedLoadDepth;
  if (depth === "meta" || depth === "outline") {
    return windows;
  }

  if (options.ftsQuery.length > 0) {
    const rows = db.selectObjects(
      `SELECT
        c.ord AS chunk_ord,
        bm25(source_fts) AS score
       FROM source_fts
       JOIN sources s ON s.id = source_fts.source_id
       JOIN source_chunks c ON c.id = source_fts.chunk_id
       WHERE source_fts MATCH ?
         AND s.id = ?
         AND s.lifecycle_status <> 'deleted'
       ORDER BY score ASC
       LIMIT ?`,
      [
        options.ftsQuery,
        state.source.id,
        Math.max(
          options.maxWindowsPerSource * sourceContextPackWindowSearchLimitMultiplier,
          options.maxWindowsPerSource,
        ),
      ],
    );
    for (const row of rows) {
      addWindow(numberField(row, "chunk_ord"), "query");
    }
  }

  if (windows.length < options.maxWindowsPerSource) {
    const fallback = db.selectObject(
      `SELECT MIN(ord) AS chunk_ord
       FROM source_chunks
       WHERE source_id = ?`,
      [state.source.id],
    );
    if (fallback !== undefined) addWindow(numberField(fallback, "chunk_ord"), "fallback");
  }

  return windows;
}

function sourceContextWindowFromEvidenceWindow(
  window: MemoryEvidenceWindow,
  sourceType: string,
  priority: SourceContextPackWindowPriority,
): InternalSourceContextWindow {
  const text = window.chunks.map((chunk) => chunk.text).join("\n\n");
  const tokenEstimate = window.chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0);
  const pageStart = firstDefinedNumber(window.chunks.map((chunk) => chunk.pageStart));
  const pageEnd = lastDefinedNumber(window.chunks.map((chunk) => chunk.pageEnd));
  return {
    sourceId: window.memoryId,
    chunkId: window.chunkId,
    ord:
      window.chunks.find((chunk) => chunk.id === window.chunkId)?.ord ?? window.chunks[0]?.ord ?? 0,
    text,
    tokenCount: tokenEstimate,
    tokenEstimate: Math.max(1, tokenEstimate),
    sourceKind: window.sourceKind,
    sourceUrl: window.sourceUrl,
    sourceTitle: window.sourceTitle,
    sourceType,
    priority,
    ...(window.anchor === undefined ? {} : { anchor: window.anchor }),
    ...(pageStart === undefined ? {} : { pageStart }),
    ...(pageEnd === undefined ? {} : { pageEnd }),
  };
}

function firstDefinedNumber(values: Array<number | undefined>) {
  return values.find((value) => typeof value === "number");
}

function lastDefinedNumber(values: Array<number | undefined>) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (typeof value === "number") return value;
  }
  return undefined;
}

function packSourceContextGroups(
  packs: SourceContextSourcePack[],
  options: SourceContextPackOptions,
  compressionLog: SourceContextCompressionLogEntry[],
): { sources: SourceContextPackSource[]; groups: SourceContextPackGroup[] } {
  const groups: SourceContextPackGroup[] = [];
  const sources: SourceContextPackSource[] = [];
  let current = emptySourceContextPackGroup(1);
  let totalTokenEstimate = 0;

  const flushCurrent = () => {
    if (current.sourceIds.length === 0) return;
    groups.push(current);
    current = emptySourceContextPackGroup(groups.length + 1);
  };

  for (const pack of packs) {
    if (totalTokenEstimate >= options.maxTotalTokens) {
      compressionLog.push({
        reason: "source_over_budget",
        sourceId: pack.source.id,
        tokenEstimate: pack.tokenEstimate,
        message: "Source was skipped because the total context pack budget was exhausted.",
      });
      continue;
    }

    let candidate = trimSourceContextPackToBudget(
      pack,
      options.maxTotalTokens - totalTokenEstimate,
      compressionLog,
    );
    if (candidate === undefined) continue;

    if (
      current.sourceIds.length > 0 &&
      current.tokenEstimate + candidate.tokenEstimate > options.maxGroupTokens
    ) {
      flushCurrent();
    }
    if (groups.length >= options.maxGroups) {
      compressionLog.push({
        reason: "group_limit_reached",
        sourceId: candidate.source.id,
        tokenEstimate: candidate.tokenEstimate,
        message: "Source was skipped because the context pack group limit was reached.",
      });
      continue;
    }

    candidate = trimSourceContextPackToBudget(
      candidate,
      Math.min(
        options.maxGroupTokens - current.tokenEstimate,
        options.maxTotalTokens - totalTokenEstimate,
      ),
      compressionLog,
    );
    if (candidate === undefined) continue;

    current.sourceIds.push(candidate.source.id);
    current.tokenEstimate += candidate.tokenEstimate;
    current.windows.push(...candidate.windows.map(publicSourceContextWindow));
    totalTokenEstimate += candidate.tokenEstimate;
    sources.push(candidate.source);
  }

  flushCurrent();
  return { sources, groups };
}

function emptySourceContextPackGroup(index: number): SourceContextPackGroup {
  return {
    id: `context-pack-group-${index}`,
    sourceIds: [],
    tokenEstimate: 0,
    windows: [],
  };
}

function trimSourceContextPackToBudget(
  pack: SourceContextSourcePack,
  budget: number,
  compressionLog: SourceContextCompressionLogEntry[],
): SourceContextSourcePack | undefined {
  if (budget <= 0) return undefined;
  if (pack.tokenEstimate <= budget) return pack;
  const windowTokens = pack.windows.reduce((sum, window) => sum + window.tokenEstimate, 0);
  const baseTokenEstimate = pack.tokenEstimate - windowTokens;
  if (baseTokenEstimate > budget) {
    compressionLog.push({
      reason: "source_over_budget",
      sourceId: pack.source.id,
      tokenEstimate: baseTokenEstimate,
      message: "Source metadata could not fit the remaining context pack budget.",
    });
    return undefined;
  }

  const selectedWindows: InternalSourceContextWindow[] = [];
  let tokenEstimate = baseTokenEstimate;
  let omittedWindowCount = pack.omittedWindowCount;
  let omittedTokenEstimate = pack.omittedTokenEstimate;
  for (const window of pack.windows) {
    if (tokenEstimate + window.tokenEstimate <= budget) {
      selectedWindows.push(window);
      tokenEstimate += window.tokenEstimate;
      continue;
    }
    omittedWindowCount += 1;
    omittedTokenEstimate += window.tokenEstimate;
  }
  if (omittedWindowCount > pack.omittedWindowCount) {
    compressionLog.push({
      reason: "chunk_window_omitted",
      sourceId: pack.source.id,
      requestedLoadDepth: pack.source.requestedLoadDepth,
      omittedWindowCount: omittedWindowCount - pack.omittedWindowCount,
      omittedTokenEstimate: omittedTokenEstimate - pack.omittedTokenEstimate,
      message: "Chunk windows were omitted while fitting source context into group/global budget.",
    });
  }
  const selectedLoadDepth = selectedSourceContextDepth(
    pack.source.requestedLoadDepth,
    pack.source.selectedLoadDepth,
    selectedWindows,
  );
  return {
    ...pack,
    windows: selectedWindows,
    tokenEstimate,
    omittedWindowCount,
    omittedTokenEstimate,
    source: {
      ...pack.source,
      selectedTokenEstimate: tokenEstimate,
      selectedLoadDepth,
      windowCount: selectedWindows.length,
    },
  };
}

function publicSourceContextWindow(window: InternalSourceContextWindow): SourceContextPackWindow {
  return {
    sourceId: window.sourceId,
    chunkId: window.chunkId,
    ord: window.ord,
    text: window.text,
    tokenCount: window.tokenCount,
    sourceKind: window.sourceKind,
    sourceUrl: window.sourceUrl,
    sourceTitle: window.sourceTitle,
    sourceType: window.sourceType,
    priority: window.priority,
    ...(window.anchor === undefined ? {} : { anchor: window.anchor }),
    ...(window.pageStart === undefined ? {} : { pageStart: window.pageStart }),
    ...(window.pageEnd === undefined ? {} : { pageEnd: window.pageEnd }),
  };
}

function estimateTokens(input: string) {
  const normalized = normalizeText(input);
  if (normalized.length === 0) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function insertAnchor(
  db: SqliteDb,
  memoryId: string,
  payload: CaptureSelectionPayload,
  selectedText: string,
  createdAt: string,
) {
  db.exec({
    sql: `INSERT INTO anchors (
      id,
      memory_id,
      kind,
      selected_text,
      context_before,
      context_after,
      xpath,
      text_fragment,
      created_at
    ) VALUES (?, ?, 'dom', ?, ?, ?, ?, ?, ?)`,
    bind: [
      createId("anchor"),
      memoryId,
      selectedText,
      payload.contextBefore ?? "",
      payload.contextAfter ?? "",
      payload.xpath ?? null,
      payload.textFragment ?? null,
      createdAt,
    ],
  });
}

function findCurrentPageVersion(db: SqliteDb, versionGroupKey: string) {
  return db.selectObject(
    `SELECT *
     FROM sources
     WHERE source_kind = 'page'
       AND version_group_key = ?
       AND is_current = 1
       AND lifecycle_status <> 'deleted'
     ORDER BY captured_at DESC
     LIMIT 1`,
    [versionGroupKey],
  );
}

function transaction<T>(db: SqliteDb, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = work();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Keep the original operation error.
    }
    throw error;
  }
}

function memorySummaryFromRow(row: SqlRow): MemorySummary {
  const sourceKind = sourceKindField(row, "source_kind");
  const normalizedSourceUrl =
    stringField(row, "normalized_source_url") || normalizeSourceUrl(stringField(row, "source_url"));
  const groupKey =
    stringField(row, "version_group_key") ||
    buildMemoryVersionGroupKey(sourceKind, normalizedSourceUrl, stringField(row, "content_hash"));
  const supersedesMemoryId = optionalString(row, "supersedes_source_id");
  const supersededByMemoryId = optionalString(row, "superseded_by_source_id");
  return {
    id: stringField(row, "id"),
    sourceKind,
    sourceUrl: stringField(row, "source_url"),
    sourceTitle: stringField(row, "source_title"),
    capturedAt: stringField(row, "captured_at"),
    excerpt: excerpt(stringField(row, "normalized_text")),
    version: {
      groupKey,
      versionNo: Math.max(1, numberField(row, "version_no")),
      isCurrent: numberField(row, "is_current") !== 0,
      ...(supersedesMemoryId === undefined ? {} : { supersedesMemoryId }),
      ...(supersededByMemoryId === undefined ? {} : { supersededByMemoryId }),
    },
  };
}

function memorySummaryFromRetrievalRow(row: SqlRow, fallbackExcerpt: string): MemorySummary {
  const sourceKind = sourceKindField(row, "source_kind");
  const normalizedSourceUrl =
    stringField(row, "normalized_source_url") || normalizeSourceUrl(stringField(row, "source_url"));
  const groupKey =
    stringField(row, "version_group_key") ||
    buildMemoryVersionGroupKey(sourceKind, normalizedSourceUrl, stringField(row, "content_hash"));
  const supersedesMemoryId = optionalString(row, "supersedes_source_id");
  const supersededByMemoryId = optionalString(row, "superseded_by_source_id");
  return {
    id: stringField(row, "id"),
    sourceKind,
    sourceUrl: stringField(row, "source_url"),
    sourceTitle: stringField(row, "source_title"),
    capturedAt: stringField(row, "captured_at"),
    excerpt: excerpt(fallbackExcerpt),
    version: {
      groupKey,
      versionNo: Math.max(1, numberField(row, "version_no")),
      isCurrent: numberField(row, "is_current") !== 0,
      ...(supersedesMemoryId === undefined ? {} : { supersedesMemoryId }),
      ...(supersededByMemoryId === undefined ? {} : { supersededByMemoryId }),
    },
  };
}

function topicPageSummaryFromRow(row: SqlRow): Omit<TopicPageDetail, "content" | "sourceRefs"> {
  const sourceRefs = parseTopicSourceRefs(stringField(row, "source_refs_json"));
  return {
    id: stringField(row, "id"),
    slug: stringField(row, "slug"),
    title: stringField(row, "title"),
    summary: stringField(row, "summary"),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
    sourceCount: sourceRefs.length,
  };
}

function topicPageDetailFromRow(row: SqlRow): TopicPageDetail {
  return {
    ...topicPageSummaryFromRow(row),
    content: stringField(row, "content"),
    sourceRefs: parseTopicSourceRefs(stringField(row, "source_refs_json")),
  };
}

function wikiCompileJobFromRow(row: SqlRow): WikiCompileJobSummary {
  const topicId = optionalString(row, "topic_id");
  const runAfter = optionalString(row, "run_after");
  const claimedAt = optionalString(row, "claimed_at");
  const finishedAt = optionalString(row, "finished_at");
  const lastError = optionalString(row, "last_error");
  const resultTopicId = optionalString(row, "result_topic_id");
  return {
    id: stringField(row, "id"),
    status: wikiCompileJobStatusField(row, "status"),
    ...(topicId === undefined ? {} : { topicId }),
    query: stringField(row, "query"),
    instructions: stringField(row, "instructions"),
    sourceMemoryIds: parseStringArray(stringField(row, "source_memory_ids_json")),
    attempts: numberField(row, "attempts"),
    maxAttempts: numberField(row, "max_attempts"),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
    ...(runAfter === undefined ? {} : { runAfter }),
    ...(claimedAt === undefined ? {} : { claimedAt }),
    ...(finishedAt === undefined ? {} : { finishedAt }),
    ...(lastError === undefined ? {} : { lastError }),
    ...(resultTopicId === undefined ? {} : { resultTopicId }),
  };
}

function wikiCompileJobEventFromRow(row: SqlRow): WikiCompileJobEvent {
  return {
    id: stringField(row, "id"),
    jobId: stringField(row, "job_id"),
    kind: wikiCompileEventKindField(row, "kind"),
    level: wikiCompileEventLevelField(row, "level"),
    message: stringField(row, "message"),
    detail: parseMetadata(stringField(row, "detail_json")),
    createdAt: stringField(row, "created_at"),
  };
}

function topicGraphEdgeFromRow(row: SqlRow): TopicGraphEdge {
  const toTopicId = optionalString(row, "to_topic_id");
  const memoryId = optionalString(row, "memory_id");
  const chunkId = optionalString(row, "chunk_id");
  return {
    id: stringField(row, "id"),
    fromTopicId: stringField(row, "from_topic_id"),
    ...(toTopicId === undefined ? {} : { toTopicId }),
    ...(memoryId === undefined ? {} : { memoryId }),
    ...(chunkId === undefined ? {} : { chunkId }),
    kind: topicGraphEdgeKindField(row, "kind"),
    weight: realField(row, "weight"),
    label: stringField(row, "label"),
    createdAt: stringField(row, "created_at"),
  };
}

function anchorFromRow(row: SqlRow): AnchorInfo {
  const xpath = optionalString(row, "xpath");
  const textFragment = optionalString(row, "text_fragment");
  const lastResolutionStatus = optionalString(row, "last_resolution_status");
  return {
    id: stringField(row, "id"),
    memoryId: stringField(row, "memory_id"),
    selectedText: stringField(row, "selected_text"),
    contextBefore: stringField(row, "context_before"),
    contextAfter: stringField(row, "context_after"),
    ...(xpath === undefined ? {} : { xpath }),
    ...(textFragment === undefined ? {} : { textFragment }),
    ...(lastResolutionStatus === undefined ? {} : { lastResolutionStatus }),
  };
}

function loadAnchorsBySourceId(db: SqliteDb, sourceIds: string[]) {
  const boundedSourceIds = boundedUniqueStrings(sourceIds, 80);
  if (boundedSourceIds.length === 0) return new Map<string, AnchorInfo>();
  const rows = db.selectObjects(
    `SELECT *
     FROM anchors
     WHERE memory_id IN (${boundedSourceIds.map(() => "?").join(", ")})`,
    boundedSourceIds,
  );
  return new Map(rows.map((row) => [stringField(row, "memory_id"), anchorFromRow(row)]));
}

function boundedEvidenceWindowAnchors(
  anchors: GetMemoryEvidenceWindowAnchor[] | undefined,
  max: number,
) {
  if (anchors === undefined) return [];
  const seen = new Set<string>();
  return anchors.flatMap((anchor) => {
    const memoryId = normalizeText(anchor.memoryId);
    const chunkId = normalizeText(anchor.chunkId ?? "");
    const ord =
      anchor.ord === undefined || !Number.isFinite(anchor.ord)
        ? undefined
        : Math.max(0, Math.floor(anchor.ord));
    if (memoryId.length === 0 || (chunkId.length === 0 && ord === undefined)) return [];
    const key = `${memoryId}:${chunkId || `ord:${ord}`}`;
    if (seen.has(key) || seen.size >= max) return [];
    seen.add(key);
    return [
      {
        memoryId,
        ...(chunkId.length === 0 ? {} : { chunkId }),
        ...(ord === undefined ? {} : { ord }),
      },
    ];
  });
}

function resolveEvidenceWindowAnchorOrd(
  db: SqliteDb,
  anchor: GetMemoryEvidenceWindowAnchor,
): number | undefined {
  if (anchor.chunkId !== undefined && anchor.chunkId.length > 0) {
    const chunk = db.selectObject(
      `SELECT ord
       FROM source_chunks
       WHERE source_id = ?
         AND id = ?
       LIMIT 1`,
      [anchor.memoryId, anchor.chunkId],
    );
    if (chunk !== undefined) return numberField(chunk, "ord");
  }
  if (anchor.ord === undefined || !Number.isFinite(anchor.ord)) return undefined;
  return Math.max(0, Math.floor(anchor.ord));
}

function loadSourceEvidenceWindow(
  db: SqliteDb,
  input: {
    sourceId: string;
    anchorOrd: number;
    contextChunksBefore: number;
    contextChunksAfter: number;
    anchor?: AnchorInfo;
  },
): MemoryEvidenceWindow | undefined {
  const source = db.selectObject(
    `SELECT
      id,
      source_kind,
      source_url,
      source_title
     FROM sources
     WHERE id = ?
       AND lifecycle_status <> 'deleted'
     LIMIT 1`,
    [input.sourceId],
  );
  if (source === undefined) return undefined;

  const startOrd = Math.max(0, input.anchorOrd - input.contextChunksBefore);
  const endOrd = input.anchorOrd + input.contextChunksAfter;
  const rows = db.selectObjects(
    `SELECT id, ord, text, token_count, page_start, page_end
     FROM source_chunks
     WHERE source_id = ?
       AND ord BETWEEN ? AND ?
     ORDER BY ord ASC`,
    [input.sourceId, startOrd, endOrd],
  );
  if (rows.length === 0) return undefined;

  const chunks = rows.map((row) => ({
    id: stringField(row, "id"),
    ord: numberField(row, "ord"),
    text: stringField(row, "text"),
    tokenCount: numberField(row, "token_count"),
    ...optionalPageRangeFromRow(row),
  }));
  const anchorChunk =
    chunks.find((chunk) => chunk.ord === input.anchorOrd) ?? chunks[Math.floor(chunks.length / 2)];
  if (anchorChunk === undefined) return undefined;
  const anchor =
    input.anchor ??
    optionalAnchorFromRow(
      db.selectObject("SELECT * FROM anchors WHERE memory_id = ? LIMIT 1", [input.sourceId]),
    );
  const text = chunks.map((chunk) => chunk.text).join("\n\n");

  return {
    memoryId: stringField(source, "id"),
    chunkId: anchorChunk.id,
    sourceKind: sourceKindField(source, "source_kind"),
    sourceUrl: stringField(source, "source_url"),
    sourceTitle: stringField(source, "source_title"),
    excerpt: excerpt(text),
    ...(anchor === undefined ? {} : { anchor }),
    chunks,
  };
}

function optionalAnchorFromRow(row: SqlRow | undefined) {
  return row === undefined ? undefined : anchorFromRow(row);
}

function normalizeRetrieveSourcesFilter(
  filter: RetrieveSourcesFilter | undefined,
): NormalizedRetrieveSourcesFilter {
  const sourceTypes = normalizeSourceTypeFilters(filter?.sourceTypes);
  const hasSourceTypeFilter = filter?.sourceTypes !== undefined;
  const lifecycleStatuses =
    filter?.lifecycleStatuses === undefined
      ? [...searchableSourceLifecycleStatuses]
      : normalizeSourceLifecycleFilters(filter.lifecycleStatuses);
  return {
    sourceTypes,
    lifecycleStatuses,
    hasSourceTypeFilter,
    hasImpossibleFilter:
      (hasSourceTypeFilter && sourceTypes.length === 0) ||
      (filter?.lifecycleStatuses !== undefined && lifecycleStatuses.length === 0),
  };
}

function normalizeSourceTypeFilters(values: string[] | undefined) {
  if (values === undefined) return [];
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const normalized = normalizeText(value).toLocaleLowerCase();
    if (normalized.length === 0 || seen.has(normalized) || seen.size >= 24) return [];
    seen.add(normalized);
    return [normalized];
  });
}

function normalizeSourceLifecycleFilters(
  values: SearchableSourceLifecycleStatus[],
): SearchableSourceLifecycleStatus[] {
  const seen = new Set<SearchableSourceLifecycleStatus>();
  return values.flatMap((value) => {
    if (!searchableSourceLifecycleStatuses.includes(value) || seen.has(value)) return [];
    seen.add(value);
    return [value];
  });
}

function sourceFilterWhereClause(filter: NormalizedRetrieveSourcesFilter): SqlWhereClause {
  if (filter.hasImpossibleFilter) return { sql: "1 = 0", bind: [] };
  const clauses = [`s.lifecycle_status IN (${filter.lifecycleStatuses.map(() => "?").join(", ")})`];
  const bind: unknown[] = [...filter.lifecycleStatuses];
  if (filter.hasSourceTypeFilter) {
    clauses.push(`s.source_type IN (${filter.sourceTypes.map(() => "?").join(", ")})`);
    bind.push(...filter.sourceTypes);
  }
  return {
    sql: clauses.join("\n       AND "),
    bind,
  };
}

function emptyFilteredRetrieveSourcesResult(
  query: string,
  includeRecentSourcesTrack: boolean,
): RetrieveSourcesResult {
  const tracks: RetrieveSourcesTraceTrack[] = [];
  if (includeRecentSourcesTrack) {
    tracks.push({
      name: "recent_sources",
      status: "skipped",
      itemCount: 0,
      reason: "filter_no_match",
    });
  }
  tracks.push({
    name: "meta_sources",
    status: "skipped",
    itemCount: 0,
    reason: "filter_no_match",
  });
  tracks.push(vectorMetaSkippedTrace("filter_no_match"));
  tracks.push({
    name: "fts_chunks",
    status: "skipped",
    itemCount: 0,
    reason: "filter_no_match",
  });
  tracks.push(vectorSkippedTrace("filter_no_match"));
  return {
    query,
    items: [],
    trace: {
      strategy: "rrf",
      rrfK: defaultRrfK,
      tracks,
    },
  };
}

function findKeywordExpansionTerms(
  db: SqliteDb,
  input: { query: string; limit: number; filter: NormalizedRetrieveSourcesFilter },
) {
  const needles = keywordTokens(input.query).filter(isUsefulKeywordToken).slice(0, 8);
  const normalizedQuery = normalizeKeywordTerm(input.query);
  if (needles.length === 0 && normalizedQuery === undefined) return [];
  const likeNeedles =
    needles.length > 0 ? needles : normalizedQuery === undefined ? [] : [normalizedQuery];
  if (likeNeedles.length === 0) return [];

  const sourceFilter = sourceFilterWhereClause(input.filter);
  const likeClause = likeNeedles.map(() => "ki.normalized_term LIKE ? ESCAPE '\\'").join(" OR ");
  const rows = db.selectObjects(
    `SELECT
      ki.term,
      ki.normalized_term,
      COUNT(DISTINCT kis.source_id) AS source_count,
      COALESCE(SUM(kis.hit_count), 0) AS hit_count
     FROM keyword_index ki
     JOIN keyword_index_sources kis ON kis.term = ki.term
     JOIN sources s ON s.id = kis.source_id
     WHERE (${likeClause})
       AND ${sourceFilter.sql}
     GROUP BY ki.term, ki.normalized_term
     ORDER BY source_count DESC, hit_count DESC, ki.term ASC
     LIMIT ?`,
    [
      ...likeNeedles.map((needle) => `%${escapeSqlLike(needle)}%`),
      ...sourceFilter.bind,
      Math.max(input.limit * 8, 24),
    ],
  );

  return rows
    .flatMap((row) => {
      const term = normalizeKeywordTerm(stringField(row, "term"));
      if (term === undefined) return [];
      if (normalizedQuery !== undefined && term === normalizedQuery) return [];
      return [
        {
          term,
          score: keywordExpansionScore(term, {
            normalizedQuery,
            needles,
            sourceCount: numberField(row, "source_count"),
            hitCount: numberField(row, "hit_count"),
          }),
        },
      ];
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.term.localeCompare(right.term))
    .slice(0, input.limit)
    .map((candidate) => candidate.term);
}

function keywordExpansionScore(
  term: string,
  input: {
    normalizedQuery: string | undefined;
    needles: string[];
    sourceCount: number;
    hitCount: number;
  },
) {
  let score = 0;
  if (input.normalizedQuery !== undefined && term.includes(input.normalizedQuery)) score += 10;
  for (const needle of input.needles) {
    if (term === needle) score += 4;
    else if (term.startsWith(needle)) score += 6;
    else if (term.includes(needle)) score += 3;
  }
  score += Math.min(input.sourceCount, 8) * 0.25;
  score += Math.min(input.hitCount, 40) * 0.02;
  return score;
}

function escapeSqlLike(input: string) {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function loadMetaSourceRetrievalHits(
  db: SqliteDb,
  input: { query: string; limit: number; filter: NormalizedRetrieveSourcesFilter },
): SourceRetrievalHit[] {
  if (input.filter.hasImpossibleFilter) return [];
  const ftsQuery = buildFtsQuery(input.query);
  if (ftsQuery.length === 0) return [];
  const sourceFilter = sourceFilterWhereClause(input.filter);
  const outputLimit = clampLimit(input.limit, 100);
  const rows = db.selectObjects(
    `SELECT
      s.id,
      s.source_kind,
      s.source_url,
      s.normalized_source_url,
      s.source_title,
      s.captured_at,
      s.content_hash,
      s.version_group_key,
      s.version_no,
      s.supersedes_source_id,
      s.superseded_by_source_id,
      s.is_current,
      sm.title AS meta_title,
      sm.abstract AS meta_abstract,
      sm.source_type AS meta_source_type,
      bm25(source_metadata_fts) AS score
     FROM source_metadata_fts
     JOIN sources s ON s.id = source_metadata_fts.source_id
     LEFT JOIN source_metadata sm ON sm.source_id = s.id
     WHERE source_metadata_fts MATCH ?
       AND ${sourceFilter.sql}
     ORDER BY score ASC
     LIMIT ?`,
    [ftsQuery, ...sourceFilter.bind, outputLimit],
  );
  return rows.slice(0, outputLimit).map((row, index) => ({
    track: "meta_sources",
    rank: index + 1,
    source: row,
    fallbackExcerpt: metaSourceFallbackExcerpt(row, input.query),
  }));
}

function loadFtsChunkRetrievalHits(
  db: SqliteDb,
  input: { query: string; limit: number; filter: NormalizedRetrieveSourcesFilter },
): SourceRetrievalHit[] {
  if (input.filter.hasImpossibleFilter) return [];
  const ftsQuery = buildFtsQuery(input.query);
  if (ftsQuery.length === 0) return [];
  const sourceFilter = sourceFilterWhereClause(input.filter);
  const rows = db.selectObjects(
    `SELECT
      s.id,
      s.source_kind,
      s.source_url,
      s.normalized_source_url,
      s.source_title,
      s.captured_at,
      s.content_hash,
      s.version_group_key,
      s.version_no,
      s.supersedes_source_id,
      s.superseded_by_source_id,
      s.is_current,
      c.id AS chunk_id,
      c.ord AS chunk_ord,
      c.text AS chunk_text,
      c.page_start AS chunk_page_start,
      c.page_end AS chunk_page_end,
      bm25(source_fts) AS score
     FROM source_fts
     JOIN sources s ON s.id = source_fts.source_id
     JOIN source_chunks c ON c.id = source_fts.chunk_id
     WHERE source_fts MATCH ?
       AND ${sourceFilter.sql}
     ORDER BY score ASC
     LIMIT ?`,
    [ftsQuery, ...sourceFilter.bind, clampLimit(input.limit, 400)],
  );
  return rows.map((row, index) => ({
    track: "fts_chunks",
    rank: index + 1,
    source: row,
    chunk: {
      chunkId: stringField(row, "chunk_id"),
      ord: numberField(row, "chunk_ord"),
      snippet: excerpt(stringField(row, "chunk_text")),
      score: realField(row, "score"),
      track: "fts_chunks",
      ...optionalChunkPageRangeFromRow(row),
    },
  }));
}

function loadVectorMetaRetrievalHits(
  db: SqliteDb,
  input: { query: string; limit: number; filter: NormalizedRetrieveSourcesFilter },
): { hits: SourceRetrievalHit[]; trace: RetrieveSourcesTraceTrack } {
  if (input.filter.hasImpossibleFilter) {
    return {
      hits: [],
      trace: {
        name: "vector_meta",
        status: "skipped",
        itemCount: 0,
        reason: "filter_no_match",
      },
    };
  }
  const provider = getActiveEmbeddingProvider(db);
  if (provider === null) {
    return {
      hits: [],
      trace: {
        name: "vector_meta",
        status: "unavailable",
        itemCount: 0,
        reason: "embedding_model_unavailable",
      },
    };
  }
  const queryVector = provider.embed(input.query);
  const sourceFilter = sourceFilterWhereClause(input.filter);
  const rows = db.selectObjects(
    `SELECT
      s.id,
      s.source_kind,
      s.source_url,
      s.normalized_source_url,
      s.source_title,
      s.captured_at,
      s.content_hash,
      s.version_group_key,
      s.version_no,
      s.supersedes_source_id,
      s.superseded_by_source_id,
      s.is_current,
      sm.title AS meta_title,
      sm.abstract AS meta_abstract,
      sm.source_type AS meta_source_type,
      se.vector_json,
      se.text_hash
     FROM source_embeddings se
     JOIN sources s ON s.id = se.source_id
     LEFT JOIN source_metadata sm ON sm.source_id = s.id
     WHERE se.model_id = ?
       AND se.target_kind = 'meta'
       AND se.target_id = s.id
       AND ${sourceFilter.sql}`,
    [provider.modelId, ...sourceFilter.bind],
  );
  if (rows.length === 0) {
    return {
      hits: [],
      trace: {
        name: "vector_meta",
        status: "skipped",
        itemCount: 0,
        reason: "no_embeddings",
      },
    };
  }
  const ranked = rows
    .flatMap((row) => {
      const vector = parseEmbeddingVector(stringField(row, "vector_json"), provider.dimension);
      if (vector === null) return [];
      return [
        {
          row,
          score: cosineSimilarity(queryVector, vector),
        },
      ];
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, clampLimit(input.limit, 200));
  if (ranked.length === 0) {
    return {
      hits: [],
      trace: {
        name: "vector_meta",
        status: "skipped",
        itemCount: 0,
        reason: "invalid_embeddings",
      },
    };
  }
  return {
    hits: ranked.map(({ row }, index) => ({
      track: "vector_meta",
      rank: index + 1,
      source: row,
      fallbackExcerpt: metaSourceFallbackExcerpt(row, input.query),
    })),
    trace: {
      name: "vector_meta",
      status: "used",
      itemCount: ranked.length,
    },
  };
}

function loadVectorChunkRetrievalHits(
  db: SqliteDb,
  input: { query: string; limit: number; filter: NormalizedRetrieveSourcesFilter },
): { hits: SourceRetrievalHit[]; trace: RetrieveSourcesTraceTrack } {
  if (input.filter.hasImpossibleFilter) {
    return {
      hits: [],
      trace: {
        name: "vector_chunks",
        status: "skipped",
        itemCount: 0,
        reason: "filter_no_match",
      },
    };
  }
  const provider = getActiveEmbeddingProvider(db);
  if (provider === null) {
    return {
      hits: [],
      trace: {
        name: "vector_chunks",
        status: "unavailable",
        itemCount: 0,
        reason: "embedding_model_unavailable",
      },
    };
  }
  const queryVector = provider.embed(input.query);
  const sourceFilter = sourceFilterWhereClause(input.filter);
  const rows = db.selectObjects(
    `SELECT
      s.id,
      s.source_kind,
      s.source_url,
      s.normalized_source_url,
      s.source_title,
      s.captured_at,
      s.content_hash,
      s.version_group_key,
      s.version_no,
      s.supersedes_source_id,
      s.superseded_by_source_id,
      s.is_current,
      c.id AS chunk_id,
      c.ord AS chunk_ord,
      c.text AS chunk_text,
      c.page_start AS chunk_page_start,
      c.page_end AS chunk_page_end,
      se.vector_json,
      se.text_hash
     FROM source_embeddings se
     JOIN source_chunks c ON c.id = se.target_id
     JOIN sources s ON s.id = se.source_id
     WHERE se.model_id = ?
       AND se.target_kind = 'chunk'
       AND ${sourceFilter.sql}`,
    [provider.modelId, ...sourceFilter.bind],
  );
  if (rows.length === 0) {
    return {
      hits: [],
      trace: {
        name: "vector_chunks",
        status: "skipped",
        itemCount: 0,
        reason: "no_embeddings",
      },
    };
  }
  const ranked = rows
    .flatMap((row) => {
      const vector = parseEmbeddingVector(stringField(row, "vector_json"), provider.dimension);
      if (vector === null) return [];
      return [
        {
          row,
          score: cosineSimilarity(queryVector, vector),
        },
      ];
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, clampLimit(input.limit, 400));
  if (ranked.length === 0) {
    return {
      hits: [],
      trace: {
        name: "vector_chunks",
        status: "skipped",
        itemCount: 0,
        reason: "invalid_embeddings",
      },
    };
  }
  return {
    hits: ranked.map(({ row, score }, index) => ({
      track: "vector_chunks",
      rank: index + 1,
      source: row,
      chunk: {
        chunkId: stringField(row, "chunk_id"),
        ord: numberField(row, "chunk_ord"),
        snippet: excerpt(stringField(row, "chunk_text")),
        score,
        track: "vector_chunks",
        ...optionalChunkPageRangeFromRow(row),
      },
    })),
    trace: {
      name: "vector_chunks",
      status: "used",
      itemCount: ranked.length,
    },
  };
}

function metaSourceQueryTerms(input: string) {
  const normalized = normalizeText(input);
  if (normalized.length === 0) return [];
  const expanded = expandChineseBigrams(normalized);
  const seen = new Set<string>();
  return [normalized, ...(expanded.match(/[\p{L}\p{N}_]+/gu) ?? [])].flatMap((term) => {
    const value = normalizeText(term);
    const key = value.toLocaleLowerCase();
    if (value.length === 0 || seen.has(key) || seen.size >= 16) return [];
    seen.add(key);
    return [value];
  });
}

function metaSourceFallbackExcerpt(row: SqlRow, query: string) {
  const title = stringField(row, "meta_title") || stringField(row, "source_title");
  const sourceType = stringField(row, "meta_source_type");
  const abstractText = stringField(row, "meta_abstract");
  const queryTerms = metaSourceQueryTerms(query).map((term) => term.toLocaleLowerCase());
  const matchingAbstract =
    abstractText.length > 0 &&
    queryTerms.some((term) => abstractText.toLocaleLowerCase().includes(term));
  const parts = [title, sourceType, matchingAbstract ? abstractText : ""].filter(
    (part) => part.length > 0,
  );
  return parts.length > 0 ? excerpt(parts.join(" - ")) : stringField(row, "source_url");
}

function fuseSourceRetrievalHits(
  hits: SourceRetrievalHit[],
  input: { limit: number; includeChunks: number; rrfK: number },
): RetrieveSourceItem[] {
  const grouped = new Map<
    string,
    {
      source: SqlRow;
      score: number;
      bestRank: number;
      tracks: Set<RetrieveTrackName>;
      chunks: RetrieveSourceHitChunk[];
      seenChunks: Set<string>;
      fallbackExcerpt: string;
    }
  >();

  for (const hit of hits) {
    const sourceId = stringField(hit.source, "id");
    if (sourceId.length === 0) continue;
    const existing = grouped.get(sourceId) ?? {
      source: hit.source,
      score: 0,
      bestRank: Number.MAX_SAFE_INTEGER,
      tracks: new Set<RetrieveTrackName>(),
      chunks: [],
      seenChunks: new Set<string>(),
      fallbackExcerpt:
        hit.fallbackExcerpt ||
        stringField(hit.source, "source_title") ||
        stringField(hit.source, "source_url"),
    };
    existing.score += reciprocalRankFusionScore(hit.rank, input.rrfK);
    existing.bestRank = Math.min(existing.bestRank, hit.rank);
    existing.tracks.add(hit.track);
    if (
      hit.chunk !== undefined &&
      existing.chunks.length < input.includeChunks &&
      hit.chunk.chunkId.length > 0 &&
      !existing.seenChunks.has(hit.chunk.chunkId)
    ) {
      existing.seenChunks.add(hit.chunk.chunkId);
      existing.chunks.push(hit.chunk);
    }
    grouped.set(sourceId, existing);
  }

  return Array.from(grouped.values())
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.bestRank - right.bestRank ||
        stringField(right.source, "captured_at").localeCompare(
          stringField(left.source, "captured_at"),
        ) ||
        stringField(left.source, "source_title").localeCompare(
          stringField(right.source, "source_title"),
        ),
    )
    .slice(0, input.limit)
    .map((item) => ({
      ...memorySummaryFromRetrievalRow(
        item.source,
        item.chunks[0]?.snippet || item.fallbackExcerpt,
      ),
      score: item.score,
      tracks: Array.from(item.tracks),
      hitChunks: item.chunks,
    }));
}

function mergeKnowledgeBaseSearchItems(
  originalItems: RetrieveSourceItem[],
  expandedItems: RetrieveSourceItem[],
  input: { limit: number; includeChunks: number },
): RetrieveSourceItem[] {
  const merged = new Map<
    string,
    {
      item: RetrieveSourceItem;
      score: number;
      firstSeenRank: number;
    }
  >();

  const addItem = (item: RetrieveSourceItem, rank: number, source: "original" | "expanded") => {
    const existing = merged.get(item.id);
    const weightedScore = source === "original" ? item.score + 1 : item.score * 0.75;
    if (existing === undefined) {
      merged.set(item.id, {
        item: {
          ...item,
          score: weightedScore,
          tracks: [...item.tracks],
          hitChunks: item.hitChunks.slice(0, input.includeChunks),
        },
        score: weightedScore,
        firstSeenRank: source === "original" ? rank : rank + originalItems.length,
      });
      return;
    }

    existing.score += weightedScore;
    existing.item = {
      ...existing.item,
      score: existing.score,
      excerpt:
        existing.item.hitChunks.length > 0 || item.hitChunks.length === 0
          ? existing.item.excerpt
          : item.excerpt,
      tracks: mergeRetrieveTracks(existing.item.tracks, item.tracks),
      hitChunks: mergeRetrieveHitChunks(
        existing.item.hitChunks,
        item.hitChunks,
        input.includeChunks,
      ),
    };
    existing.firstSeenRank = Math.min(
      existing.firstSeenRank,
      source === "original" ? rank : rank + originalItems.length,
    );
  };

  originalItems.forEach((item, index) => addItem(item, index + 1, "original"));
  expandedItems.forEach((item, index) => addItem(item, index + 1, "expanded"));

  return Array.from(merged.values())
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.firstSeenRank - right.firstSeenRank ||
        right.item.capturedAt.localeCompare(left.item.capturedAt) ||
        left.item.sourceTitle.localeCompare(right.item.sourceTitle),
    )
    .slice(0, input.limit)
    .map(({ item, score }) => ({
      ...item,
      score,
    }));
}

function mergeRetrieveTracks(left: RetrieveTrackName[], right: RetrieveTrackName[]) {
  return Array.from(new Set<RetrieveTrackName>([...left, ...right]));
}

function mergeRetrieveHitChunks(
  left: RetrieveSourceHitChunk[],
  right: RetrieveSourceHitChunk[],
  limit: number,
) {
  const seen = new Set<string>();
  const chunks: RetrieveSourceHitChunk[] = [];
  for (const chunk of [...left, ...right]) {
    if (seen.has(chunk.chunkId)) continue;
    seen.add(chunk.chunkId);
    chunks.push(chunk);
    if (chunks.length >= limit) break;
  }
  return chunks;
}

function reciprocalRankFusionScore(rank: number, rrfK = defaultRrfK) {
  return 1 / (rrfK + Math.max(1, Math.floor(rank)));
}

function vectorSkippedTrace(reason: string): RetrieveSourcesTraceTrack {
  return {
    name: "vector_chunks",
    status: "skipped",
    itemCount: 0,
    reason,
  };
}

function vectorMetaSkippedTrace(reason: string): RetrieveSourcesTraceTrack {
  return {
    name: "vector_meta",
    status: "skipped",
    itemCount: 0,
    reason,
  };
}

function embedLocalDeterministic(input: string, dimension: number) {
  const vector = Array.from({ length: dimension }, () => 0);
  const tokens =
    normalizeText(input)
      .toLowerCase()
      .match(/[\p{L}\p{N}_]+/gu) ?? [];
  for (const token of tokens.length === 0 ? [normalizeText(input).toLowerCase()] : tokens) {
    if (token.length === 0) continue;
    const hash = stableHashNumber(token);
    const index = hash % dimension;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign;
  }
  return normalizeVector(vector);
}

function stableHashNumber(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeVector(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector.map(() => 0);
  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let score = 0;
  for (let index = 0; index < length; index += 1) {
    score += (left[index] ?? 0) * (right[index] ?? 0);
  }
  return score;
}

function parseEmbeddingVector(input: string, dimension: number): number[] | null {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== dimension) return null;
    const vector = parsed.map((value) => (typeof value === "number" ? value : Number.NaN));
    if (vector.some((value) => !Number.isFinite(value))) return null;
    return vector;
  } catch {
    return null;
  }
}

function jobSummaryFromRow(row: SqlRow): JobSummary {
  const lastError = optionalString(row, "last_error");
  const startedAt = optionalString(row, "started_at");
  const finishedAt = optionalString(row, "finished_at");
  return {
    id: stringField(row, "id"),
    type: jobTypeField(row, "type"),
    status: jobStatusField(row, "status"),
    attempts: numberField(row, "attempts"),
    maxAttempts: numberField(row, "max_attempts"),
    createdAt: stringField(row, "created_at"),
    ...(lastError === undefined ? {} : { lastError }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(finishedAt === undefined ? {} : { finishedAt }),
  };
}

function chatSessionSummaryFromRow(row: SqlRow): ChatSessionSummary {
  const sourcePageUrl = optionalString(row, "source_page_url");
  const sourcePageTitle = optionalString(row, "source_page_title");
  const ownerId = optionalString(row, "owner_id");
  const ownerHeartbeatAt = optionalString(row, "owner_heartbeat_at");
  return {
    id: stringField(row, "id"),
    title: stringField(row, "title"),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
    messageCount: numberField(row, "message_count"),
    lastMessageExcerpt: stringField(row, "last_message_excerpt"),
    currentEvidenceRevision: numberField(row, "current_evidence_revision"),
    ...(sourcePageUrl === undefined ? {} : { sourcePageUrl }),
    ...(sourcePageTitle === undefined ? {} : { sourcePageTitle }),
    ...(ownerId === undefined ? {} : { ownerId }),
    ...(ownerHeartbeatAt === undefined ? {} : { ownerHeartbeatAt }),
  };
}

function sessionEvidenceFromRow(row: SqlRow): SessionEvidenceRecord {
  return {
    id: stringField(row, "id"),
    sessionId: stringField(row, "session_id"),
    revision: numberField(row, "revision"),
    sourceKind: sourceKindField(row, "source_kind"),
    pageUrl: stringField(row, "page_url"),
    pageTitle: stringField(row, "page_title"),
    text: stringField(row, "text"),
    excerpt: stringField(row, "excerpt"),
    metadata: parseMetadata(stringField(row, "metadata_json")),
    createdAt: stringField(row, "created_at"),
  };
}

function compactionRecordFromRow(row: SqlRow): CompactionRecord {
  const firstKeptEvidenceId = optionalString(row, "first_kept_evidence_id");
  const rawFirstKeptEvidenceRevision = row.first_kept_evidence_revision;
  const firstKeptEvidenceRevision =
    rawFirstKeptEvidenceRevision === null || rawFirstKeptEvidenceRevision === undefined
      ? undefined
      : numberField(row, "first_kept_evidence_revision");
  const previousCompactionId = optionalString(row, "previous_compaction_id");
  return {
    id: stringField(row, "id"),
    sessionId: stringField(row, "session_id"),
    summary: stringField(row, "summary"),
    firstKeptMessageId: stringField(row, "first_kept_message_id"),
    evidenceSummary: stringField(row, "evidence_summary"),
    ...(firstKeptEvidenceId === undefined ? {} : { firstKeptEvidenceId }),
    ...(firstKeptEvidenceRevision === undefined ? {} : { firstKeptEvidenceRevision }),
    ...(previousCompactionId === undefined ? {} : { previousCompactionId }),
    coveredEvidence: parseCoveredEvidence(stringField(row, "covered_evidence_json")),
    tokensBefore: numberField(row, "tokens_before"),
    createdAt: stringField(row, "created_at"),
  };
}

function chatMessageRecordFromRow(row: SqlRow): ChatMessageRecord {
  const pageUrl = optionalString(row, "page_url");
  const pageTitle = optionalString(row, "page_title");
  const selectionText = optionalString(row, "selection_text");
  const error = parseOptionalRecord(stringField(row, "error_json"));
  const retry = parseOptionalRecord(stringField(row, "retry_json"));
  const piAgentMessageJson = parseOptionalRecord(stringField(row, "pi_agent_message_json"));
  const runId = optionalString(row, "run_id");
  const rawQueueOrder = row.queue_order;
  const queueOrder =
    rawQueueOrder === null || rawQueueOrder === undefined
      ? undefined
      : numberField(row, "queue_order");
  return {
    id: stringField(row, "id"),
    sessionId: stringField(row, "session_id"),
    role: chatMessageRoleField(row, "role"),
    status: chatMessageStatusField(row, "status"),
    content: stringField(row, "content"),
    scope: agentScopeField(row, "scope"),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
    ...(pageUrl === undefined ? {} : { pageUrl }),
    ...(pageTitle === undefined ? {} : { pageTitle }),
    ...(selectionText === undefined ? {} : { selectionText }),
    citations: parseJsonArray(stringField(row, "citations_json")) as ChatMessageRecord["citations"],
    worldKnowledge: parseStringArray(stringField(row, "world_knowledge_json")),
    evidenceRefs: parseStringArray(stringField(row, "evidence_refs_json")),
    ...(error === undefined ? {} : { error: error as unknown as ChatMessageRecord["error"] }),
    ...(retry === undefined ? {} : { retry }),
    ...(piAgentMessageJson === undefined ? {} : { piAgentMessageJson }),
    ...(runId === undefined ? {} : { runId }),
    ...(queueOrder === undefined ? {} : { queueOrder }),
  };
}

function webSearchHistoryRecordFromRow(row: SqlRow): WebSearchHistoryRecord {
  return {
    id: stringField(row, "id"),
    query: stringField(row, "query"),
    answer: stringField(row, "answer"),
    sources: parseWebSearchSources(stringField(row, "sources_json")),
    provider: stringField(row, "provider"),
    createdAt: stringField(row, "created_at"),
  };
}

function imageGenerationHistoryRecordFromRow(row: SqlRow): ImageGenerationHistoryRecord {
  const input = parseImageInput(stringField(row, "input_json"));
  return {
    id: stringField(row, "id"),
    mode: imageGenerationModeField(row, "mode"),
    prompt: stringField(row, "prompt"),
    model: stringField(row, "model"),
    size: stringField(row, "size"),
    provider: stringField(row, "provider"),
    createdAt: stringField(row, "created_at"),
    output: {
      mimeType: stringField(row, "output_mime_type"),
      dataUrl: stringField(row, "output_data_url"),
      b64Json: stringField(row, "output_b64_json"),
    },
    ...(input === undefined ? {} : { input }),
  };
}

function loadChatSessionDetail(db: SqliteDb, sessionId: string): ChatSessionDetail | null {
  const row = db.selectObject("SELECT * FROM sessions WHERE id = ? LIMIT 1", [sessionId]);
  if (row === undefined) return null;
  const messageRows = db.selectObjects(
    `SELECT *
     FROM messages
     WHERE session_id = ?
     ORDER BY created_at ASC, id ASC`,
    [sessionId],
  );
  const evidenceRows = db.selectObjects(
    `SELECT *
     FROM session_evidence
     WHERE session_id = ?
     ORDER BY revision ASC`,
    [sessionId],
  );
  return {
    ...chatSessionSummaryFromRow(row),
    messages: messageRows.map(chatMessageRecordFromRow).sort(compareChatMessagesForDisplay),
    evidence: evidenceRows.map(sessionEvidenceFromRow),
  };
}

function refreshSessionStats(db: SqliteDb, sessionId: string, updatedAt: string) {
  const messageCount = Number(
    db.selectValue("SELECT count(*) FROM messages WHERE session_id = ?", [sessionId]) ?? 0,
  );
  const latest = db.selectObject(
    `SELECT content
     FROM messages
     WHERE session_id = ?
       AND role IN ('user', 'assistant')
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    [sessionId],
  );
  db.exec({
    sql: `UPDATE sessions
          SET message_count = ?,
              last_message_excerpt = ?,
              updated_at = ?
          WHERE id = ?`,
    bind: [messageCount, excerpt(stringField(latest ?? {}, "content"), 140), updatedAt, sessionId],
  });
}

function defaultPiAgentMessageJson(payload: UpsertChatMessagePayload): Record<string, unknown> {
  if (payload.role === "evidence") {
    return {
      role: "system",
      kind: "clio_evidence_event",
      content: payload.content,
      evidenceRefs: payload.evidenceRefs ?? [],
      timestamp: Date.parse(payload.createdAt ?? "") || Date.now(),
    };
  }
  return {
    role: payload.role,
    content: payload.content,
    timestamp: Date.parse(payload.createdAt ?? "") || Date.now(),
  };
}

function normalizeSessionTitle(value: string) {
  const normalized = normalizeText(value).slice(0, 40);
  return normalized.length > 0 ? normalized : "New conversation";
}

function isStaleSessionLease(heartbeatAt: string) {
  const timestamp = Date.parse(heartbeatAt);
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp > staleSessionLeaseMs;
}

function parseMetadata(input: string): Record<string, unknown> {
  try {
    const value = JSON.parse(input) as unknown;
    if (isRecord(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalPageRangeFromRow(row: SqlRow) {
  if (row.page_start === undefined || row.page_start === null) return {};
  if (row.page_end === undefined || row.page_end === null) return {};
  const pageStart = numberField(row, "page_start");
  const pageEnd = numberField(row, "page_end");
  if (pageStart < 1 || pageEnd < pageStart) return {};
  return { pageStart, pageEnd };
}

function optionalChunkPageRangeFromRow(row: SqlRow) {
  if (row.chunk_page_start === undefined || row.chunk_page_start === null) return {};
  if (row.chunk_page_end === undefined || row.chunk_page_end === null) return {};
  const pageStart = numberField(row, "chunk_page_start");
  const pageEnd = numberField(row, "chunk_page_end");
  if (pageStart < 1 || pageEnd < pageStart) return {};
  return { pageStart, pageEnd };
}

function parseOptionalRecord(input: string): Record<string, unknown> | undefined {
  if (input.length === 0 || input === "null") return undefined;
  const parsed = parseMetadata(input);
  return Object.keys(parsed).length === 0 ? undefined : parsed;
}

function parseJsonArray(input: string): unknown[] {
  try {
    const value = JSON.parse(input) as unknown;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function parseStringArray(input: string): string[] {
  return parseJsonArray(input).flatMap((item) => (typeof item === "string" ? [item] : []));
}

function parseTopicSourceRefs(input: string): TopicPageSourceRef[] {
  return normalizeTopicSourceRefs(
    parseJsonArray(input).flatMap((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      if (typeof record.memoryId !== "string") return [];
      return [
        {
          memoryId: record.memoryId,
          ...(typeof record.chunkId === "string" ? { chunkId: record.chunkId } : {}),
          ...(typeof record.quote === "string" ? { quote: record.quote } : {}),
        },
      ];
    }),
  );
}

function parseCoveredEvidence(input: string) {
  return parseJsonArray(input).flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.revision !== "number") return [];
    return [{ id: record.id, revision: record.revision }];
  });
}

function parseWebSearchSources(input: string): WebSearchHistoryRecord["sources"] {
  return parseJsonArray(input).flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.id !== "string" ||
      typeof record.title !== "string" ||
      typeof record.url !== "string" ||
      typeof record.domain !== "string" ||
      typeof record.snippet !== "string"
    ) {
      return [];
    }
    return [
      {
        id: record.id,
        title: record.title,
        url: record.url,
        domain: record.domain,
        snippet: record.snippet,
      },
    ];
  });
}

function parseImageInput(input: string): ImageGenerationHistoryRecord["input"] | undefined {
  if (input.length === 0 || input === "null") return undefined;
  try {
    const value = JSON.parse(input) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    if (
      (record.kind !== "data_url" && record.kind !== "base64" && record.kind !== "url") ||
      typeof record.value !== "string"
    ) {
      return undefined;
    }
    return {
      kind: record.kind,
      value: record.value,
      ...(typeof record.mimeType === "string" ? { mimeType: record.mimeType } : {}),
      ...(typeof record.name === "string" ? { name: record.name } : {}),
    };
  } catch {
    return undefined;
  }
}

function stringField(row: SqlRow, key: string) {
  const value = row[key];
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return "";
}

function optionalString(row: SqlRow, key: string) {
  const value = stringField(row, key);
  return value.length === 0 ? undefined : value;
}

function numberField(row: SqlRow, key: string) {
  const value = row[key];
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number.parseInt(value, 10) || 0;
  return 0;
}

function realField(row: SqlRow, key: string) {
  const value = row[key];
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number.parseFloat(value) || 0;
  return 0;
}

function sourceKindField(row: SqlRow, key: string): SourceKind {
  return stringField(row, key) === "selection" ? "selection" : "page";
}

function sourceLifecycleStatusFromRow(
  row: SqlRow | undefined,
  key: string,
): SourceLifecycleStatus | null {
  if (row === undefined) return null;
  const value = stringField(row, key);
  if (value === "fresh" || value === "stale" || value === "archived" || value === "deleted") {
    return value;
  }
  return null;
}

function searchableLifecycleStatusField(row: SqlRow, key: string): SearchableSourceLifecycleStatus {
  const value = sourceLifecycleStatusFromRow(row, key);
  if (value === "stale" || value === "archived") return value;
  return "fresh";
}

function workingSetLoadDepthField(row: SqlRow, key: string): WorkingSetLoadDepth {
  const value = stringField(row, key);
  if (value === "outline" || value === "chunks" || value === "full") return value;
  return "meta";
}

function workingSetPinStatusField(
  row: SqlRow,
  key: string,
): WorkingSetStatusResult["entries"][number]["pinStatus"] {
  const value = stringField(row, key);
  if (value === "pinned" || value === "evicted") return value;
  return "auto";
}

function imageGenerationModeField(row: SqlRow, key: string): ImageGenerationHistoryRecord["mode"] {
  return stringField(row, key) === "edit" ? "edit" : "generate";
}

function jobStatusField(row: SqlRow, key: string): JobStatus {
  const value = stringField(row, key);
  if (value === "running" || value === "done" || value === "failed") return value;
  return "queued";
}

function wikiCompileJobStatusField(row: SqlRow, key: string): WikiCompileJobStatus {
  const value = stringField(row, key);
  if (value === "running" || value === "done" || value === "failed") return value;
  return "queued";
}

function wikiCompileEventKindField(row: SqlRow, key: string): WikiCompileEventKind {
  const value = stringField(row, key);
  if (
    value === "claimed" ||
    value === "sources_selected" ||
    value === "provider_started" ||
    value === "provider_delta" ||
    value === "completed" ||
    value === "failed"
  ) {
    return value;
  }
  return "queued";
}

function wikiCompileEventLevelField(row: SqlRow, key: string): WikiCompileEventLevel {
  const value = stringField(row, key);
  if (value === "warning" || value === "error") return value;
  return "info";
}

function topicGraphEdgeKindField(row: SqlRow, key: string): TopicGraphEdgeKind {
  const value = stringField(row, key);
  if (value === "related" || value === "mentions") return value;
  return "source";
}

function jobTypeField(row: SqlRow, key: string): JobType {
  const value = stringField(row, key);
  if (value === "resolve_anchor" || value === "post_capture_hardening") return value;
  return "reindex_fts";
}

function chatMessageRoleField(row: SqlRow, key: string): ChatMessageRole {
  const value = stringField(row, key);
  if (value === "assistant" || value === "evidence") return value;
  return "user";
}

function chatMessageStatusField(row: SqlRow, key: string): ChatMessageStatus {
  const value = stringField(row, key);
  if (
    value === "streaming" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "interrupted"
  ) {
    return value;
  }
  return "queued";
}

function agentScopeField(row: SqlRow, key: string): ChatMessageRecord["scope"] {
  const value = stringField(row, key);
  if (value === "general" || value === "selection") return value;
  return "current-page";
}

function clampLimit(limit: number, max: number) {
  if (!Number.isFinite(limit)) return max;
  return Math.max(1, Math.min(Math.floor(limit), max));
}

function clampOptionalLimit(value: number | undefined, fallback: number, max: number) {
  return clampLimit(value ?? fallback, max);
}

function clampOptionalCount(value: number | undefined, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.floor(value), max));
}

function boundedUniqueStrings(values: string[] | undefined, max: number) {
  if (values === undefined) return [];
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const normalized = normalizeText(value);
    if (normalized.length === 0 || seen.has(normalized) || seen.size >= max) return [];
    seen.add(normalized);
    return [normalized];
  });
}

function normalizeTopicTitle(value: string) {
  const title = normalizeText(value).slice(0, 120);
  if (title.length === 0) {
    throw new EngineRpcError("EMPTY_TOPIC_TITLE", "Topic title is required.");
  }
  return title;
}

function normalizeTopicText(value: string, maxLength: number) {
  return normalizeText(value).slice(0, maxLength);
}

function createTopicPageRow(db: SqliteDb, payload: CreateTopicPagePayload): SqlRow {
  const title = normalizeTopicTitle(payload.title);
  const now = new Date().toISOString();
  const createdAt = normalizeOptionalIso(payload.createdAt) ?? now;
  const updatedAt = normalizeOptionalIso(payload.updatedAt) ?? createdAt;
  const id = payload.id ?? createId("topic");
  const slug = uniqueTopicSlug(db, payload.slug ?? title, id);
  const summary = normalizeTopicText(payload.summary ?? "", 800);
  const content = normalizeTopicText(payload.content ?? "", 100_000);
  const sourceRefs = normalizeTopicSourceRefs(payload.sourceRefs ?? []);

  db.exec({
    sql: `INSERT INTO topic_pages (
      id,
      slug,
      title,
      summary,
      content,
      source_refs_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [id, slug, title, summary, content, JSON.stringify(sourceRefs), createdAt, updatedAt],
  });

  const row = db.selectObject("SELECT * FROM topic_pages WHERE id = ? LIMIT 1", [id]);
  if (row === undefined) {
    throw new EngineRpcError("TOPIC_CREATE_FAILED", "Topic page was not saved.");
  }
  return row;
}

function updateTopicPageRow(
  db: SqliteDb,
  id: string,
  payload: UpdateTopicPagePayload,
): SqlRow | undefined {
  const existing = db.selectObject("SELECT * FROM topic_pages WHERE id = ? LIMIT 1", [id]);
  if (existing === undefined) return undefined;

  const title =
    payload.title === undefined
      ? stringField(existing, "title")
      : normalizeTopicTitle(payload.title);
  const slug =
    payload.slug === undefined
      ? stringField(existing, "slug")
      : uniqueTopicSlug(db, payload.slug, id);
  const summary =
    payload.summary === undefined
      ? stringField(existing, "summary")
      : normalizeTopicText(payload.summary, 800);
  const content =
    payload.content === undefined
      ? stringField(existing, "content")
      : normalizeTopicText(payload.content, 100_000);
  const sourceRefs =
    payload.sourceRefs === undefined
      ? parseTopicSourceRefs(stringField(existing, "source_refs_json"))
      : normalizeTopicSourceRefs(payload.sourceRefs);
  const updatedAt = normalizeOptionalIso(payload.updatedAt) ?? new Date().toISOString();

  db.exec({
    sql: `UPDATE topic_pages
          SET slug = ?,
              title = ?,
              summary = ?,
              content = ?,
              source_refs_json = ?,
              updated_at = ?
          WHERE id = ?`,
    bind: [slug, title, summary, content, JSON.stringify(sourceRefs), updatedAt, id],
  });

  return db.selectObject("SELECT * FROM topic_pages WHERE id = ? LIMIT 1", [id]);
}

function compileTopicCreatePayload(
  job: SqlRow,
  result: WikiCompileResultPayload,
  sourceRefs: TopicPageSourceRef[],
  completedAt: string,
): CreateTopicPagePayload {
  const topic = result.topic ?? {};
  const title =
    typeof topic.title === "string" && normalizeText(topic.title).length > 0
      ? topic.title
      : stringField(job, "query");
  const topicId = "id" in topic && typeof topic.id === "string" ? topic.id : undefined;
  return {
    ...(topicId === undefined ? {} : { id: topicId }),
    ...(typeof topic.slug === "string" ? { slug: topic.slug } : {}),
    title,
    summary: typeof topic.summary === "string" ? topic.summary : "",
    content: typeof topic.content === "string" ? topic.content : "",
    sourceRefs,
    createdAt: completedAt,
    updatedAt: completedAt,
  };
}

function compileTopicUpdatePayload(result: WikiCompileResultPayload): UpdateTopicPagePayload {
  const topic = result.topic ?? {};
  return {
    ...(typeof topic.slug === "string" ? { slug: topic.slug } : {}),
    ...(typeof topic.title === "string" ? { title: topic.title } : {}),
    ...(typeof topic.summary === "string" ? { summary: topic.summary } : {}),
    ...(typeof topic.content === "string" ? { content: topic.content } : {}),
  };
}

function compileSourceRefs(result: WikiCompileResultPayload): TopicPageSourceRef[] {
  const topicSourceRefs =
    result.topic !== undefined &&
    "sourceRefs" in result.topic &&
    result.topic.sourceRefs !== undefined
      ? result.topic.sourceRefs
      : [];
  return normalizeTopicSourceRefs([...(result.sourceRefs ?? []), ...topicSourceRefs]);
}

function insertWikiCompileJobEvent(
  db: SqliteDb,
  payload: CreateWikiCompileJobEventPayload,
): WikiCompileJobEvent {
  const jobExists =
    db.selectObject("SELECT id FROM wiki_compile_jobs WHERE id = ? LIMIT 1", [payload.jobId]) !==
    undefined;
  if (!jobExists) {
    throw new EngineRpcError("WIKI_JOB_NOT_FOUND", `Wiki compile job not found: ${payload.jobId}`);
  }

  const id = payload.id ?? createId("wiki_event");
  const createdAt = normalizeOptionalIso(payload.createdAt) ?? new Date().toISOString();
  const level = normalizeWikiCompileEventLevel(payload.level);
  const message = normalizeTopicText(payload.message ?? "", 1_000);
  const detail = normalizeWikiCompileEventDetail(payload.detail ?? {});
  db.exec({
    sql: `INSERT INTO wiki_compile_job_events (
      id,
      job_id,
      kind,
      level,
      message,
      detail_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    bind: [id, payload.jobId, payload.kind, level, message, JSON.stringify(detail), createdAt],
  });
  const row = db.selectObject("SELECT * FROM wiki_compile_job_events WHERE id = ? LIMIT 1", [id]);
  if (row === undefined) {
    throw new EngineRpcError("WIKI_JOB_EVENT_CREATE_FAILED", "Wiki compile event was not saved.");
  }
  return wikiCompileJobEventFromRow(row);
}

function refreshTopicGraphEdges(
  db: SqliteDb,
  topicId: string,
  sourceRefs: TopicPageSourceRef[],
  edgeInputs: TopicGraphEdgeInput[],
  createdAt: string,
) {
  db.exec({
    sql: "DELETE FROM topic_graph_edges WHERE from_topic_id = ?",
    bind: [topicId],
  });

  const edges = normalizeTopicGraphEdges(topicId, sourceRefs, edgeInputs, createdAt);
  for (const edge of edges) {
    db.exec({
      sql: `INSERT INTO topic_graph_edges (
        id,
        from_topic_id,
        to_topic_id,
        memory_id,
        chunk_id,
        kind,
        weight,
        label,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        edge.id,
        edge.fromTopicId,
        edge.toTopicId ?? null,
        edge.memoryId ?? null,
        edge.chunkId ?? null,
        edge.kind,
        edge.weight,
        edge.label,
        edge.createdAt,
      ],
    });
  }
  return edges.length;
}

function normalizeTopicSourceRefs(refs: TopicPageSourceRef[]): TopicPageSourceRef[] {
  const seen = new Set<string>();
  return refs.slice(0, 100).flatMap((ref) => {
    const memoryId = normalizeText(ref.memoryId);
    if (memoryId.length === 0) return [];
    const chunkId = ref.chunkId === undefined ? undefined : normalizeText(ref.chunkId);
    const quote = ref.quote === undefined ? undefined : normalizeTopicText(ref.quote, 500);
    const key = `${memoryId}:${chunkId ?? ""}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        memoryId,
        ...(chunkId === undefined || chunkId.length === 0 ? {} : { chunkId }),
        ...(quote === undefined || quote.length === 0 ? {} : { quote }),
      },
    ];
  });
}

function normalizeTopicGraphEdges(
  topicId: string,
  sourceRefs: TopicPageSourceRef[],
  edgeInputs: TopicGraphEdgeInput[],
  createdAt: string,
): TopicGraphEdge[] {
  const seen = new Set<string>();
  const sourceEdges: TopicGraphEdgeInput[] = sourceRefs.map((ref) => ({
    kind: "source" as const,
    memoryId: ref.memoryId,
    chunkId: ref.chunkId,
    label: ref.quote,
    weight: 1,
  }));
  return [...sourceEdges, ...edgeInputs].slice(0, 200).flatMap((input) => {
    const kind = normalizeTopicGraphEdgeKind(input.kind);
    const fromTopicId = topicId;
    const toTopicId =
      input.toTopicId === undefined ? undefined : normalizeText(input.toTopicId).slice(0, 200);
    const memoryId =
      input.memoryId === undefined ? undefined : normalizeText(input.memoryId).slice(0, 200);
    const chunkId =
      input.chunkId === undefined ? undefined : normalizeText(input.chunkId).slice(0, 200);
    if (
      (toTopicId === undefined || toTopicId.length === 0) &&
      (memoryId === undefined || memoryId.length === 0)
    ) {
      return [];
    }
    const key = `${fromTopicId}:${kind}:${toTopicId ?? ""}:${memoryId ?? ""}:${chunkId ?? ""}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [
      {
        id: input.id ?? createId("topic_edge"),
        fromTopicId,
        ...(toTopicId === undefined || toTopicId.length === 0 ? {} : { toTopicId }),
        ...(memoryId === undefined || memoryId.length === 0 ? {} : { memoryId }),
        ...(chunkId === undefined || chunkId.length === 0 ? {} : { chunkId }),
        kind,
        weight: normalizeTopicGraphWeight(input.weight),
        label: normalizeTopicText(input.label ?? "", 200),
        createdAt: normalizeOptionalIso(input.createdAt) ?? createdAt,
      },
    ];
  });
}

function normalizeTopicGraphEdgeKind(value: TopicGraphEdgeKind): TopicGraphEdgeKind {
  if (value === "related" || value === "mentions") return value;
  return "source";
}

function normalizeTopicGraphWeight(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function normalizeWikiCompileEventLevel(
  value: WikiCompileEventLevel | undefined,
): WikiCompileEventLevel {
  if (value === "warning" || value === "error") return value;
  return "info";
}

function normalizeWikiCompileEventDetail(value: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 20)) {
    if (entry === undefined) continue;
    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      normalized[key] = entry;
      continue;
    }
    if (Array.isArray(entry)) {
      normalized[key] = entry
        .slice(0, 20)
        .filter(
          (item) =>
            item === null ||
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean",
        );
    }
  }
  return normalized;
}

function normalizeWikiCompileQuery(value: string) {
  const query = normalizeTopicText(value, 500);
  if (query.length === 0) {
    throw new EngineRpcError("EMPTY_WIKI_QUERY", "Wiki compile query is required.");
  }
  return query;
}

function normalizeWikiSourceMemoryIds(values: string[]) {
  const seen = new Set<string>();
  return values.slice(0, 50).flatMap((value) => {
    const id = normalizeText(value);
    if (id.length === 0 || seen.has(id)) return [];
    seen.add(id);
    return [id];
  });
}

function normalizeWikiMaxAttempts(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return defaultJobMaxAttempts;
  return Math.max(1, Math.min(10, Math.floor(value)));
}

function normalizeTopicSlug(value: string) {
  const ascii = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (ascii.length > 0) return ascii;
  const fallback = Array.from(normalizeText(value))
    .map((char) => char.codePointAt(0)?.toString(36) ?? "")
    .filter((part) => part.length > 0)
    .join("-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
  return fallback.length > 0 ? fallback : "topic";
}

function uniqueTopicSlug(db: SqliteDb, value: string, id: string) {
  const base = normalizeTopicSlug(value);
  let slug = base;
  let suffix = 2;
  while (true) {
    const row = db.selectObject("SELECT id FROM topic_pages WHERE slug = ? LIMIT 1", [slug]);
    if (row === undefined || stringField(row, "id") === id) return slug;
    const suffixText = `-${suffix}`;
    slug = `${base.slice(0, Math.max(1, 80 - suffixText.length))}${suffixText}`;
    suffix += 1;
  }
}

function normalizeOptionalIso(value: string | undefined) {
  if (value === undefined) return undefined;
  const normalized = normalizeText(value);
  return normalized.length === 0 ? undefined : normalized;
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function createId(prefix: string) {
  const id =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${id}`;
}

function fallbackTitle(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return "Untitled";
  }
}

function startingHealth(): EngineHealth {
  return {
    status: "starting",
    message: "Local memory engine is starting.",
    checkedAt: new Date().toISOString(),
  };
}

function readyHealth(
  sqliteVersion?: string,
  opfs: EngineHealth["opfs"] = "available",
): EngineHealth {
  return {
    status: "ready",
    message: "Local memory engine is ready.",
    sqliteVersion,
    opfs,
    checkedAt: new Date().toISOString(),
  };
}

function assertNever(value: never): never {
  throw new EngineRpcError("UNSUPPORTED_REQUEST", `Unsupported request: ${String(value)}`);
}
