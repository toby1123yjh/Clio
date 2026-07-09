import type {
  ChunkMetaSummarizer,
  ChunkMetaSummaryInput,
  ChunkMetaSummaryResult,
} from "@/src/agent-runtime/chunk-meta-summary";
import type {
  FigureVisionAnalysisInput,
  FigureVisionAnalysisResult,
  FigureVisionAnalyzer,
} from "@/src/agent-runtime/figure-vision-analyzer";
import { buildMemoryVersionGroupKey } from "@/src/shared/reliability";
import {
  type ActiveEmbeddingModelSummary,
  type AnchorInfo,
  type AnchorResolveResult,
  type AppendSessionEvidencePayload,
  type AppendSourceContextCompressionLogsPayload,
  type AppendSourceContextMapArtifactsPayload,
  type BuildSourceContextPackPayload,
  type BuildSourceGraphPayload,
  type BuildSourceGraphResult,
  CLIO_WORKER_CHUNK_META_SUMMARY_REQUEST,
  CLIO_WORKER_EMBEDDING_REQUEST,
  CLIO_WORKER_RESPONSE,
  CLIO_WORKER_VISION_ANALYSIS_REQUEST,
  type CaptureBasePayload,
  type CaptureMarkdownPayload,
  type CapturePdfPayload,
  type CaptureResult,
  type CaptureSelectionPayload,
  type ChatMessageRecord,
  type ChatMessageRole,
  type ChatMessageStatus,
  type ChatSessionDetail,
  type ChatSessionSummary,
  type ChunkMetaTier2AuditFilter,
  type ChunkMetaTier2AuditRecord,
  type ChunkMetaTier2AuditStatus,
  type CompactionRecord,
  type CompleteSourceContextMapStepPayload,
  type CreateChatSessionPayload,
  type CreateCompactionPayload,
  type CreateOrResumeSourceContextMapRunPayload,
  type CreateOrchestrationRunPayload,
  type CreateTopicPagePayload,
  type CreateWikiCompileJobEventPayload,
  type CreateWikiCompileJobPayload,
  type DeleteMemoryResult,
  type DeleteTopicPageResult,
  type EmbeddingReindexModelDescriptor,
  type EngineHealth,
  type EngineRequest,
  EngineRpcError,
  type FailSourceContextMapStepPayload,
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
  type GraphNodeRef,
  type GraphPathPayload,
  type GraphQueryResult,
  type GraphSubgraphPayload,
  type GraphTimelinePayload,
  type ImageGenerationHistoryRecord,
  type JobStatus,
  type JobSummary,
  type JobType,
  type KnowledgeBaseClusteringOptions,
  type KnowledgeBaseEngineClusterBy,
  type KnowledgeBaseExpansionTermSource,
  type KnowledgeBaseExpansionTermTrace,
  type KnowledgeBaseSemanticClusterFallbackReason,
  type KnowledgeBaseSourceCluster,
  type KnowledgeBaseSourceClusterTrace,
  type ListMemoriesResult,
  type ListSourceContextMapEventsResult,
  type ListSourceContextMapRunsResult,
  type MarkSourceContextMapReduceCompletedPayload,
  type MarkSourceContextMapReduceFailedPayload,
  type MarkSourceContextMapReduceStartedPayload,
  type MemoryDetail,
  type MemoryEvidenceWindow,
  type MemorySummary,
  type OrchestrationEvent,
  type OrchestrationEventKind,
  type OrchestrationEventLevel,
  type OrchestrationKind,
  type OrchestrationRunFilter,
  type OrchestrationRunStatus,
  type OrchestrationRunSummary,
  type PdfRawFileResult,
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
  type SourceContextCompressionLogFilter,
  type SourceContextCompressionLogRecord,
  type SourceContextLostInfoType,
  type SourceContextMapArtifactEntry,
  type SourceContextMapArtifactFilter,
  type SourceContextMapArtifactRecord,
  type SourceContextMapArtifactStage,
  type SourceContextMapArtifactStatus,
  type SourceContextMapClaimStepResult,
  type SourceContextMapEvent,
  type SourceContextMapEventKind,
  type SourceContextMapEventLevel,
  type SourceContextMapRunDetail,
  type SourceContextMapRunFilter,
  type SourceContextMapRunStatus,
  type SourceContextMapRunSummary,
  type SourceContextMapStepPlan,
  type SourceContextMapStepRecord,
  type SourceContextMapStepStatus,
  type SourceContextPackGroup,
  type SourceContextPackOutlineItem,
  type SourceContextPackResult,
  type SourceContextPackSource,
  type SourceContextPackSourceDepthOverride,
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
  createRequestId,
  engineErrorFromUnknown,
  isWorkerChunkMetaSummaryResponseMessage,
  isWorkerEmbeddingResponseMessage,
  isWorkerRequestMessage,
  isWorkerVisionAnalysisResponseMessage,
} from "@/src/shared/rpc";
import {
  type TextChunk,
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
import {
  type ParsedPdfDocument,
  type ParsedPdfImageArtifact,
  type PdfFigureVisionImageExtractionInput,
  type PdfFigureVisionImageExtractionResult,
  extractPdfFigureVisionImageInput,
  parsePdfDocument,
  pdfCapturePayloadFromParsedDocument,
} from "./pdf-parser";

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
export interface PdfRawFileStoreWriteInput {
  sourceId: string;
  sourceUrl: string;
  sourceTitle: string;
  bytes: Uint8Array;
  capturedAt: string;
}
export interface PdfRawFileStoreWriteResult {
  storage: "opfs";
  path: string;
  byteLength: number;
  contentType: "application/pdf";
  persistedAt: string;
}
export interface PdfRawFileStore {
  write(input: PdfRawFileStoreWriteInput): Promise<PdfRawFileStoreWriteResult>;
  read(sourceId: string): Promise<Uint8Array>;
  delete(sourceId: string): Promise<void>;
  clear(): Promise<void>;
}

interface OpfsWritableFile {
  write(data: Uint8Array | ArrayBuffer | string): Promise<void>;
  close(): Promise<void>;
}

interface OpfsFileHandle {
  createWritable(): Promise<OpfsWritableFile>;
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
}

interface OpfsDirectoryHandle {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OpfsDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

interface OpfsNavigator {
  storage?: {
    getDirectory?: () => Promise<OpfsDirectoryHandle>;
  };
}

class OpfsPdfRawFileStore implements PdfRawFileStore {
  async write(input: PdfRawFileStoreWriteInput): Promise<PdfRawFileStoreWriteResult> {
    const directory = await this.directory(true);
    const fileName = this.fileName(input.sourceId);
    const handle = await directory.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(input.bytes);
    } finally {
      await writable.close();
    }
    return {
      storage: "opfs",
      path: `${pdfRawFileDirectoryName}/${fileName}`,
      byteLength: input.bytes.byteLength,
      contentType: "application/pdf",
      persistedAt: new Date().toISOString(),
    };
  }

  async read(sourceId: string): Promise<Uint8Array> {
    const directory = await this.directory(false);
    const handle = await directory.getFileHandle(this.fileName(sourceId));
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async delete(sourceId: string): Promise<void> {
    const directory = await this.directory(false);
    try {
      await directory.removeEntry(this.fileName(sourceId));
    } catch {
      // Raw file cleanup is best-effort; a missing blob should not block source deletion.
    }
  }

  async clear(): Promise<void> {
    const root = await this.root();
    try {
      await root.removeEntry(pdfRawFileDirectoryName, { recursive: true });
    } catch {
      // Raw file cleanup is best-effort; a missing directory should not block library reset.
    }
  }

  private async root(): Promise<OpfsDirectoryHandle> {
    const navigatorWithStorage = globalThis.navigator as OpfsNavigator | undefined;
    const getDirectory = navigatorWithStorage?.storage?.getDirectory;
    if (typeof getDirectory !== "function") {
      throw new EngineRpcError(
        "PDF_RAW_FILE_STORE_UNAVAILABLE",
        "Browser raw PDF storage is unavailable.",
      );
    }
    return await getDirectory();
  }

  private async directory(create: boolean): Promise<OpfsDirectoryHandle> {
    const root = await this.root();
    return await root.getDirectoryHandle(pdfRawFileDirectoryName, { create });
  }

  private fileName(sourceId: string): string {
    return `${encodeURIComponent(sourceId)}.pdf`;
  }
}

function normalizePdfBytes(bytes: Uint8Array | ArrayBuffer): Uint8Array {
  return bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes.slice(0));
}

export interface ActiveEmbeddingModel {
  modelId: string;
  provider: string;
  dimension: number;
}
export type EmbeddingProviderFactory = (model: ActiveEmbeddingModel) => EmbeddingProvider | null;
type PdfDocumentParser = (bytes: Uint8Array | ArrayBuffer) => Promise<ParsedPdfDocument>;
type PdfFigureVisionImageExtractor = (
  input: PdfFigureVisionImageExtractionInput,
) => Promise<PdfFigureVisionImageExtractionResult>;
export type ChunkMetaSummarizerFactory = () => ChunkMetaSummarizer | null;
export type FigureVisionAnalyzerFactory = () => FigureVisionAnalyzer | null;
export interface LocalEngineOptions {
  openDatabase?: LocalEngineDatabaseOpener;
  embeddingProvider?: EmbeddingProvider;
  embeddingProviderFactory?: EmbeddingProviderFactory;
  chunkMetaSummarizer?: ChunkMetaSummarizer;
  chunkMetaSummarizerFactory?: ChunkMetaSummarizerFactory;
  figureVisionAnalyzer?: FigureVisionAnalyzer;
  figureVisionAnalyzerFactory?: FigureVisionAnalyzerFactory;
  pdfParser?: PdfDocumentParser;
  pdfFigureVisionImageExtractor?: PdfFigureVisionImageExtractor;
  pdfRawFileStore?: PdfRawFileStore;
}

const databasePath = "/clio-browser-phase1.sqlite3";
const pdfRawFileDirectoryName = "clio-pdf-raw-files";
const schemaVersion = 21;
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
const knowledgeBaseSemanticClusterMaxSources = 80;
const knowledgeBaseSemanticClusterMaxIterations = 8;
const knowledgeBaseSemanticClusterLabelMaxChars = 80;
const knowledgeBaseSemanticClusterSummaryMaxChars = 220;
const graphBuilderMaxChunkSamples = 12;
const graphBuilderMaxChunkSampleChars = 24_000;
const graphBuilderMaxTermsPerKind = 12;
const chunkMetaHeadVersion = 1;
const chunkMetaTitleMaxChars = 500;
const chunkMetaSourceTypeMaxChars = 100;
const chunkMetaDocContextMaxChars = 1_600;
const chunkMetaAbstractMaxChars = 1_200;
const chunkMetaSectionPathMaxChars = 500;
const chunkMetaSectionSummaryMaxChars = 500;
const chunkMetaChunkSummaryMaxChars = 360;
const chunkMetaRelationLabelMaxChars = 160;
const chunkMetaMaxRelations = 12;
const chunkMetaEmbeddingPrefixMaxChars = 2_000;
const parentChunkTextMaxChars = 24_000;
const parentChunkOrdBase = 1_000_000;
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
const sourceContextPackParentWindowMaxChars = 900;
const figureVisionBridgeTimeoutMs = 60_000;
const figureVisionMaxPageContextChars = 1_200;
const figureVisionMaxAnalysesPerJob = 8;
const chunkMetaSummaryBridgeTimeoutMs = 60_000;
const defaultChunkMetaTier2MaxChunks = 8;
const maxChunkMetaTier2MaxChunks = 32;
const chunkMetaSummaryExcerptMaxChars = 1_800;
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
type PostCaptureStageName =
  | "paper_metadata"
  | "embedding"
  | "chunk_meta"
  | "graph"
  | "figure_vision";

interface SourceRetrievalHit {
  track: SourceRetrievalTrack;
  rank: number;
  source: SqlRow;
  chunk?: RetrieveSourceHitChunk;
  fallbackExcerpt?: string;
}

interface CaptureAfterSaveContext {
  db: SqliteDb;
  sourceId: string;
  draft: DocumentDraft;
}

interface CaptureOptions {
  afterSave?: (context: CaptureAfterSaveContext) => Promise<void>;
}

interface NormalizedRetrieveSourcesFilter {
  sourceTypes: string[];
  lifecycleStatuses: SearchableSourceLifecycleStatus[];
  doi?: string;
  arxivIds: string[];
  years: number[];
  venues: string[];
  authors: string[];
  hasSourceTypeFilter: boolean;
  hasPaperMetadataFilter: boolean;
  hasImpossibleFilter: boolean;
}

interface SqlWhereClause {
  sql: string;
  bind: unknown[];
}

export interface EmbeddingProvider {
  readonly modelId: string;
  readonly provider: string;
  readonly dimension: number;
  embedTexts(inputs: string[]): Promise<number[][]>;
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
  sourceDepthOverrides: SourceContextPackSourceDepthOverride[];
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
  loadDepthOverride?: WorkingSetLoadDepth;
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
  childChunkIds: string[];
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
  sectionHeadings: SectionHeadingRange[];
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

interface ChunkTextRange {
  charStart: number;
  charEnd: number;
}

interface SectionHeadingRange {
  level: number;
  text: string;
  charStart: number;
  path: string;
}

interface SectionOutlineItem {
  level: number;
  text: string;
}

interface TextLineRange {
  text: string;
  charStart: number;
  charEnd: number;
}

interface DocumentChunkSegment {
  text: string;
  charStart: number;
  charEnd: number;
  sectionPath: string | null;
}

interface MaterializedChildChunk {
  id: string;
  chunk: TextChunk;
  range?: ChunkTextRange;
  pageRange: ChunkPageRange;
  sectionPath: string | null;
  metaHeadJson: string;
  parentChunkId: string | null;
}

interface MaterializedParentChunk {
  id: string;
  ord: number;
  text: string;
  tokenCount: number;
  hash: string;
  sectionPath: string;
  charStart: number | null;
  charEnd: number | null;
  pageRange: ChunkPageRange;
  metaHeadJson: string;
}

interface ChunkMetaHeadV1 {
  version: typeof chunkMetaHeadVersion;
  tier: ChunkMetaTierV1;
  summarySource: ChunkMetaSummarySourceV1;
  selectedTier: ChunkMetaTierV1;
  tiers: Record<ChunkMetaTierV1, ChunkMetaTierStateV1>;
  source: {
    title: string;
    type: string;
    abstract: string | null;
  };
  docContext: string;
  sectionPath: string | null;
  sectionSummary: string | null;
  chunkSummary: string | null;
  roleHint: string | null;
  relations: ChunkMetaRelationV1[];
  semanticRelations: ChunkMetaSemanticRelationV1[];
}

type ChunkMetaTierV1 = "tier0" | "tier1" | "tier2";
type ChunkMetaSummarySourceV1 = "deterministic" | "local_extractive" | "remote_llm" | "unavailable";
type ChunkMetaTierStatusV1 = "available" | "disabled" | "unavailable" | "error";

interface ChunkMetaTierStateV1 {
  status: ChunkMetaTierStatusV1;
  summarySource: ChunkMetaSummarySourceV1;
  reason?: string;
  fallbackTier?: ChunkMetaTierV1;
  sectionSummary: string | null;
  chunkSummary: string | null;
  relations: ChunkMetaRelationV1[];
  semanticRelations: ChunkMetaSemanticRelationV1[];
}

type ChunkMetaRelationKindV1 = "parent" | "previous" | "next" | "section";
type ChunkMetaSemanticRelationKindV1 = ChunkMetaRelationKindV1 | "role" | "citation_hint";

interface ChunkMetaRelationV1 {
  kind: ChunkMetaRelationKindV1;
  target: string;
  label: string | null;
}

interface ChunkMetaSemanticRelationV1 {
  kind: ChunkMetaSemanticRelationKindV1;
  target: string;
  label: string | null;
  confidence: number;
  source: "deterministic" | "local_extractive" | "remote_llm";
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
  private readonly embeddingProviderOverride?: EmbeddingProvider;
  private readonly embeddingProviderFactory?: EmbeddingProviderFactory;
  private readonly chunkMetaSummarizerFactory?: ChunkMetaSummarizerFactory;
  private readonly figureVisionAnalyzerFactory?: FigureVisionAnalyzerFactory;
  private readonly pdfParser: PdfDocumentParser;
  private readonly pdfFigureVisionImageExtractor: PdfFigureVisionImageExtractor;
  private readonly pdfRawFileStore: PdfRawFileStore;

  constructor(options: LocalEngineOptions = {}) {
    this.openDatabase = options.openDatabase ?? openProductionDatabase;
    this.embeddingProviderOverride = options.embeddingProvider;
    this.embeddingProviderFactory = options.embeddingProviderFactory;
    this.chunkMetaSummarizerFactory =
      options.chunkMetaSummarizer === undefined
        ? options.chunkMetaSummarizerFactory
        : () => options.chunkMetaSummarizer ?? null;
    this.figureVisionAnalyzerFactory =
      options.figureVisionAnalyzer === undefined
        ? options.figureVisionAnalyzerFactory
        : () => options.figureVisionAnalyzer ?? null;
    this.pdfParser = options.pdfParser ?? parsePdfDocument;
    this.pdfFigureVisionImageExtractor =
      options.pdfFigureVisionImageExtractor ?? extractPdfFigureVisionImageInput;
    this.pdfRawFileStore = options.pdfRawFileStore ?? new OpfsPdfRawFileStore();
  }

  async handle(request: EngineRequest) {
    switch (request.kind) {
      case "health":
        return await this.health();
      case "capturePage":
        return await this.capture("page", request.payload);
      case "captureMarkdown":
        return await this.captureMarkdown(request.payload);
      case "capturePdf":
        return await this.capturePdf(request.payload);
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
      case "getPdfRawFile":
        return await this.getPdfRawFile(request.id);
      case "getMemoryEvidenceWindows":
        return await this.getMemoryEvidenceWindows(request.payload);
      case "buildSourceContextPack":
        return await this.buildSourceContextPack(request.payload);
      case "appendSourceContextCompressionLogs":
        return await this.appendSourceContextCompressionLogs(request.payload);
      case "listSourceContextCompressionLogs":
        return await this.listSourceContextCompressionLogs(request.filter);
      case "clearSourceContextCompressionLogs":
        return await this.clearSourceContextCompressionLogs(request.filter);
      case "appendSourceContextMapArtifacts":
        return await this.appendSourceContextMapArtifacts(request.payload);
      case "listSourceContextMapArtifacts":
        return await this.listSourceContextMapArtifacts(request.filter);
      case "clearSourceContextMapArtifacts":
        return await this.clearSourceContextMapArtifacts(request.filter);
      case "createOrResumeSourceContextMapRun":
        return await this.createOrResumeSourceContextMapRun(request.payload);
      case "listSourceContextMapRuns":
        return await this.listSourceContextMapRuns(request.filter);
      case "getSourceContextMapRun":
        return await this.getSourceContextMapRun(request.id);
      case "cancelSourceContextMapRun":
        return await this.cancelSourceContextMapRun(request.id);
      case "retrySourceContextMapRun":
        return await this.retrySourceContextMapRun(request.id);
      case "resumeSourceContextMapRun":
        return await this.resumeSourceContextMapRun(request.id);
      case "listSourceContextMapEvents":
        return await this.listSourceContextMapEvents(request.runId, request.limit);
      case "claimSourceContextMapStep":
        return await this.claimSourceContextMapStep(request.runId, request.now);
      case "completeSourceContextMapStep":
        return await this.completeSourceContextMapStep(request.payload);
      case "failSourceContextMapStep":
        return await this.failSourceContextMapStep(request.payload);
      case "markSourceContextMapReduceStarted":
        return await this.markSourceContextMapReduceStarted(request.payload);
      case "markSourceContextMapReduceCompleted":
        return await this.markSourceContextMapReduceCompleted(request.payload);
      case "markSourceContextMapReduceFailed":
        return await this.markSourceContextMapReduceFailed(request.payload);
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
      case "queryGraphPath":
        return await this.queryGraphPath(request.payload);
      case "queryGraphTimeline":
        return await this.queryGraphTimeline(request.payload);
      case "repair":
        return await this.repair(request.action);
      case "getActiveEmbeddingModel":
        return await this.getActiveEmbeddingModel();
      case "getJobStatus":
        return await this.getJobStatus(request.status, request.limit);
      case "runJob":
        return await this.runQueuedJob(request.id);
      case "createOrchestrationRun":
        return await this.createOrchestrationRun(request.payload);
      case "listOrchestrationRuns":
        return await this.listOrchestrationRuns(request.filter);
      case "runOrchestration":
        return await this.runOrchestration(request.id);
      case "cancelOrchestrationRun":
        return await this.cancelOrchestrationRun(request.id);
      case "retryOrchestrationRun":
        return await this.retryOrchestrationRun(request.id);
      case "listOrchestrationEvents":
        return await this.listOrchestrationEvents(request.runId, request.limit);
      case "enqueueChunkMetaTier2Job":
        return await this.enqueueChunkMetaTier2Job(request.payload);
      case "listChunkMetaTier2Audit":
        return await this.listChunkMetaTier2Audit(request.filter);
      case "clearChunkMetaTier2Audit":
        return await this.clearChunkMetaTier2Audit(request.filter);
      case "reindex":
        return await this.reindex(request);
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

  private async captureMarkdown(payload: CaptureMarkdownPayload): Promise<CaptureResult> {
    return await this.capture("page", {
      sourceUrl: payload.sourceUrl,
      sourceTitle: payload.sourceTitle,
      normalizedText: payload.markdownText,
      capturedAt: payload.capturedAt,
      metadata: {
        ...payload.metadata,
        adapter: "markdown",
        source_type: "markdown",
      },
    });
  }

  private async capturePdf(payload: CapturePdfPayload): Promise<CaptureResult> {
    const pdfBytes = normalizePdfBytes(payload.bytes);
    const parsed = await this.pdfParser(pdfBytes);
    return await this.capture(
      "page",
      pdfCapturePayloadFromParsedDocument({
        sourceUrl: payload.sourceUrl,
        sourceTitle: payload.sourceTitle,
        capturedAt: payload.capturedAt,
        metadata: payload.metadata,
        parsed,
      }),
      {
        afterSave: async ({ db, sourceId, draft }) => {
          await this.persistPdfRawFile(db, {
            sourceId,
            sourceUrl: draft.sourceUrl,
            sourceTitle: draft.sourceTitle,
            bytes: pdfBytes,
            capturedAt: draft.capturedAt,
          });
        },
      },
    );
  }

  private async capture(
    kind: SourceKind,
    payload: CaptureBasePayload,
    options: CaptureOptions = {},
  ): Promise<CaptureResult> {
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

    const chunks = chunkTextForDocument(draft);
    if (chunks.length === 0) {
      throw new EngineRpcError("EMPTY_CAPTURE", "Nothing readable was found to save.");
    }
    const chunkRanges = locateChunkTextRanges(draft.normalizedText, chunks);

    const sourceId = createId("src");
    const materializedChunks = materializeSourceChunks(sourceId, draft, chunks, chunkRanges);
    const previousVersion =
      draft.kind === "page" ? findCurrentPageVersion(db, draft.versionGroupKey) : undefined;
    const versionNo =
      previousVersion === undefined
        ? 1
        : Math.max(1, numberField(previousVersion, "version_no")) + 1;
    const supersedesSourceId =
      previousVersion === undefined ? undefined : stringField(previousVersion, "id");

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

      for (const parent of materializedChunks.parents) {
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
          ) VALUES (?, ?, ?, ?, ?, ?, '', 'parent', NULL, ?, ?, ?, ?, ?, ?)`,
          bind: [
            parent.id,
            sourceId,
            parent.ord,
            parent.text,
            parent.tokenCount,
            parent.hash,
            parent.sectionPath,
            parent.charStart,
            parent.charEnd,
            parent.pageRange.pageStart,
            parent.pageRange.pageEnd,
            parent.metaHeadJson,
          ],
        });
      }

      for (const materialized of materializedChunks.children) {
        const chunk = materialized.chunk;
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'child', ?, ?, ?, ?, ?, ?, ?)`,
          bind: [
            materialized.id,
            sourceId,
            chunk.ord,
            chunk.text,
            chunk.tokenCount,
            chunk.hash,
            expandChineseBigrams(chunk.text),
            materialized.parentChunkId,
            materialized.sectionPath,
            materialized.range?.charStart ?? null,
            materialized.range?.charEnd ?? null,
            materialized.pageRange.pageStart,
            materialized.pageRange.pageEnd,
            materialized.metaHeadJson,
          ],
        });
        insertSourceFtsRow(db, {
          sourceId,
          chunkId: materialized.id,
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

      const postCaptureStages: PostCaptureStageName[] = [
        "paper_metadata",
        "chunk_meta",
        "figure_vision",
        "embedding",
        "graph",
      ];
      const jobId = enqueueJob(db, "post_capture_hardening", {
        sourceId,
        stages: postCaptureStages,
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
          stages: postCaptureStages,
        },
      });
    });

    await options.afterSave?.({ db, sourceId, draft });

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

  private async persistPdfRawFile(db: SqliteDb, input: PdfRawFileStoreWriteInput): Promise<void> {
    let rawFileMetadata: Record<string, unknown>;
    try {
      const stored = await this.pdfRawFileStore.write(input);
      rawFileMetadata = {
        status: "persisted",
        storage: stored.storage,
        path: stored.path,
        byteLength: stored.byteLength,
        contentType: stored.contentType,
        persistedAt: stored.persistedAt,
      };
    } catch (error) {
      const engineError = engineErrorFromUnknown(error, "PDF_RAW_FILE_PERSIST_FAILED");
      rawFileMetadata = {
        status: "persist_failed",
        reason: engineError.code,
        message: engineError.message,
        byteLength: input.bytes.byteLength,
      };
    }

    try {
      updateSourceMetadataJson(db, input.sourceId, (metadata) => ({
        ...metadata,
        pdf_raw_file: rawFileMetadata,
      }));
    } catch {
      // Raw file status is diagnostic metadata and must not fail the capture.
    }
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
         LEFT JOIN source_metadata sm ON sm.source_id = s.id
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
    const vectorMetaResult = await loadVectorMetaRetrievalHits(db, {
      query,
      limit: Math.max(limit * 2, limit),
      filter: filters,
      embeddingProviderOverride: this.embeddingProviderOverride,
      embeddingProviderFactory: this.embeddingProviderFactory,
    });
    const ftsHits = loadFtsChunkRetrievalHits(db, {
      query,
      limit: Math.max(limit * Math.max(includeChunks, 1) * 2, limit),
      filter: filters,
    });
    const vectorResult = await loadVectorChunkRetrievalHits(db, {
      query,
      limit: Math.max(limit * Math.max(includeChunks, 1) * 2, limit),
      filter: filters,
      embeddingProviderOverride: this.embeddingProviderOverride,
      embeddingProviderFactory: this.embeddingProviderFactory,
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
      return knowledgeBaseSearchResultWithClusters(
        db,
        {
          ...original,
          expansion: {
            status: "skipped",
            terms: [],
            reason: "empty_query",
            originalItemCount: original.items.length,
            expandedItemCount: 0,
          },
        },
        payload.clustering,
      );
    }

    const filters = normalizeRetrieveSourcesFilter(payload.filter);
    if (filters.hasImpossibleFilter) {
      return knowledgeBaseSearchResultWithClusters(
        db,
        {
          ...original,
          expansion: {
            status: "skipped",
            terms: [],
            reason: "filter_no_match",
            originalItemCount: original.items.length,
            expandedItemCount: 0,
          },
        },
        payload.clustering,
      );
    }

    const expansionTerms = findKnowledgeBaseExpansionTerms(db, {
      query,
      limit: keywordIndexMaxExpansionTerms,
      filter: filters,
    });
    const { terms } = expansionTerms;
    if (terms.length === 0) {
      return knowledgeBaseSearchResultWithClusters(
        db,
        {
          ...original,
          expansion: {
            status: "skipped",
            terms: [],
            reason: "no_terms",
            originalItemCount: original.items.length,
            expandedItemCount: 0,
          },
        },
        payload.clustering,
      );
    }

    const expandedQuery = normalizeText([query, ...terms].join(" "));
    if (buildFtsQuery(expandedQuery).length === 0) {
      return knowledgeBaseSearchResultWithClusters(
        db,
        {
          ...original,
          expansion: {
            status: "skipped",
            terms,
            termSources: expansionTerms.termSources,
            reason: "expanded_query_empty",
            originalItemCount: original.items.length,
            expandedItemCount: 0,
          },
        },
        payload.clustering,
      );
    }

    const expanded = await this.retrieveSources({
      query: expandedQuery,
      limit,
      includeChunks,
      filter: payload.filter,
    });

    return knowledgeBaseSearchResultWithClusters(
      db,
      {
        ...original,
        items: mergeKnowledgeBaseSearchItems(original.items, expanded.items, {
          limit,
          includeChunks,
        }),
        expansion: {
          status: "used",
          terms,
          termSources: expansionTerms.termSources,
          expandedQuery,
          originalItemCount: original.items.length,
          expandedItemCount: expanded.items.length,
        },
      },
      payload.clustering,
    );
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
         AND c.role = 'child'
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
         AND role = 'child'
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

  private async getPdfRawFile(id: string): Promise<PdfRawFileResult> {
    const db = await this.ensureReady();
    const row = db.selectObject(
      "SELECT * FROM sources WHERE id = ? AND lifecycle_status <> 'deleted' LIMIT 1",
      [id],
    );
    if (row === undefined) {
      throw new EngineRpcError("PDF_RAW_FILE_NOT_FOUND", `PDF source not found: ${id}`);
    }
    const metadataRow = db.selectObject(
      "SELECT metadata_json FROM source_metadata WHERE source_id = ? LIMIT 1",
      [id],
    );
    const metadata = parseMetadata(stringField(metadataRow ?? {}, "metadata_json"));
    const rawFile = metadata.pdf_raw_file;
    if (!isRecord(rawFile) || rawFile.status !== "persisted") {
      throw new EngineRpcError("PDF_RAW_FILE_NOT_AVAILABLE", "Raw PDF file is not persisted.");
    }
    if (rawFile.contentType !== undefined && rawFile.contentType !== "application/pdf") {
      throw new EngineRpcError("PDF_RAW_FILE_NOT_AVAILABLE", "Raw file is not a PDF.");
    }

    let bytes: Uint8Array;
    try {
      bytes = await this.pdfRawFileStore.read(id);
    } catch (error) {
      const engineError = engineErrorFromUnknown(error, "PDF_RAW_FILE_READ_FAILED");
      throw new EngineRpcError(engineError.code, engineError.message, engineError.detail);
    }

    return {
      memoryId: id,
      sourceTitle: stringField(row, "source_title"),
      sourceUrl: stringField(row, "source_url"),
      bytes,
      byteLength: bytes.byteLength,
      contentType: "application/pdf",
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
           AND c.role = 'child'
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
           AND c.role = 'child'
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

  private async appendSourceContextCompressionLogs(
    payload: AppendSourceContextCompressionLogsPayload,
  ): Promise<{ items: SourceContextCompressionLogRecord[] }> {
    if (payload.entries.length === 0) return { items: [] };
    const db = await this.ensureReady();
    if (payload.sessionId !== undefined) {
      const session = db.selectObject("SELECT id FROM sessions WHERE id = ? LIMIT 1", [
        payload.sessionId,
      ]);
      if (session === undefined) {
        throw new EngineRpcError(
          "SESSION_NOT_FOUND",
          `Chat session not found: ${payload.sessionId}`,
        );
      }
    }

    const createdAt = payload.createdAt ?? new Date().toISOString();
    const ids = payload.entries.map(() => createId("sctx_cmp"));
    transaction(db, () => {
      payload.entries.forEach((entry, index) => {
        db.exec({
          sql: `INSERT INTO source_context_compression_logs (
            id,
            session_id,
            run_id,
            source_id,
            chunk_id,
            reason,
            message,
            requested_load_depth,
            selected_load_depth,
            token_estimate,
            omitted_token_estimate,
            omitted_window_count,
            lost_info_types_json,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          bind: [
            ids[index],
            payload.sessionId ?? null,
            payload.runId ?? null,
            entry.sourceId ?? null,
            entry.chunkId ?? null,
            entry.reason,
            entry.message,
            entry.requestedLoadDepth ?? null,
            entry.selectedLoadDepth ?? null,
            finiteNumberOrNull(entry.tokenEstimate),
            finiteNumberOrNull(entry.omittedTokenEstimate),
            finiteNumberOrNull(entry.omittedWindowCount),
            JSON.stringify(sourceContextLostInfoTypesForEntry(entry)),
            createdAt,
          ],
        });
      });
    });

    const rows = ids.flatMap((id) => {
      const row = db.selectObject("SELECT * FROM source_context_compression_logs WHERE id = ?", [
        id,
      ]);
      return row === undefined ? [] : [row];
    });
    return { items: rows.map(sourceContextCompressionLogRecordFromRow) };
  }

  private async listSourceContextCompressionLogs(
    filter: SourceContextCompressionLogFilter = {},
  ): Promise<{ items: SourceContextCompressionLogRecord[] }> {
    const db = await this.ensureReady();
    const where = sourceContextCompressionLogWhereClause(filter);
    const rows = db.selectObjects(
      `SELECT *
       FROM source_context_compression_logs
       ${where.sql}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [...where.bind, clampOptionalLimit(filter.limit, 30, 100)],
    );
    return { items: rows.map(sourceContextCompressionLogRecordFromRow) };
  }

  private async clearSourceContextCompressionLogs(
    filter: SourceContextCompressionLogFilter = {},
  ): Promise<{ cleared: number }> {
    const db = await this.ensureReady();
    const where = sourceContextCompressionLogWhereClause(filter);
    db.exec({
      sql: `DELETE FROM source_context_compression_logs ${where.sql}`,
      bind: where.bind,
    });
    return { cleared: Number(db.selectValue("SELECT changes()") ?? 0) };
  }

  private async appendSourceContextMapArtifacts(
    payload: AppendSourceContextMapArtifactsPayload,
  ): Promise<{ items: SourceContextMapArtifactRecord[] }> {
    if (payload.entries.length === 0) return { items: [] };
    const db = await this.ensureReady();
    if (payload.sessionId !== undefined) {
      const session = db.selectObject("SELECT id FROM sessions WHERE id = ? LIMIT 1", [
        payload.sessionId,
      ]);
      if (session === undefined) {
        throw new EngineRpcError(
          "SESSION_NOT_FOUND",
          `Chat session not found: ${payload.sessionId}`,
        );
      }
    }

    const createdAt = payload.createdAt ?? new Date().toISOString();
    const ids = payload.entries.map(() => createId("sctx_map"));
    transaction(db, () => {
      payload.entries.forEach((entry, index) => {
        const sourceIds = boundedArtifactStrings(entry.sourceIds, 100);
        const windowRefs = boundedSourceContextMapArtifactWindowRefs(entry.windowRefs, 300);
        const evidenceIds = boundedArtifactStrings(entry.evidenceIds, 300);
        const mapArtifactIds = boundedArtifactStrings(entry.mapArtifactIds, 100);
        db.exec({
          sql: `INSERT INTO source_context_map_artifacts (
            id,
            session_id,
            run_id,
            stage,
            status,
            group_id,
            group_index,
            source_ids_json,
            window_refs_json,
            evidence_ids_json,
            token_estimate,
            input_summary,
            output_summary,
            map_artifact_ids_json,
            error_code,
            error_message,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          bind: [
            ids[index],
            payload.sessionId ?? null,
            payload.runId,
            entry.stage,
            entry.status,
            normalizeOptionalArtifactText(entry.groupId, 160) ?? null,
            finiteNumberOrNull(entry.groupIndex),
            JSON.stringify(sourceIds),
            JSON.stringify(windowRefs),
            JSON.stringify(evidenceIds),
            finiteNumberOrNull(entry.tokenEstimate),
            normalizeOptionalArtifactText(entry.inputSummary, 2_000) ?? "",
            normalizeOptionalArtifactText(entry.outputSummary, 2_000) ?? "",
            JSON.stringify(mapArtifactIds),
            normalizeOptionalArtifactText(entry.errorCode, 120) ?? null,
            normalizeOptionalArtifactText(entry.errorMessage, 1_000) ?? null,
            entry.createdAt ?? createdAt,
          ],
        });
      });
    });

    const rows = ids.flatMap((id) => {
      const row = db.selectObject("SELECT * FROM source_context_map_artifacts WHERE id = ?", [id]);
      return row === undefined ? [] : [row];
    });
    return { items: rows.map(sourceContextMapArtifactRecordFromRow) };
  }

  private async listSourceContextMapArtifacts(
    filter: SourceContextMapArtifactFilter = {},
  ): Promise<{ items: SourceContextMapArtifactRecord[] }> {
    const db = await this.ensureReady();
    const where = sourceContextMapArtifactWhereClause(filter);
    const rows = db.selectObjects(
      `SELECT *
       FROM source_context_map_artifacts
       ${where.sql}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [...where.bind, clampOptionalLimit(filter.limit, 30, 100)],
    );
    return { items: rows.map(sourceContextMapArtifactRecordFromRow) };
  }

  private async clearSourceContextMapArtifacts(
    filter: SourceContextMapArtifactFilter = {},
  ): Promise<{ cleared: number }> {
    const db = await this.ensureReady();
    const where = sourceContextMapArtifactWhereClause(filter);
    db.exec({
      sql: `DELETE FROM source_context_map_artifacts ${where.sql}`,
      bind: where.bind,
    });
    return { cleared: Number(db.selectValue("SELECT changes()") ?? 0) };
  }

  private async createOrResumeSourceContextMapRun(
    payload: CreateOrResumeSourceContextMapRunPayload,
  ): Promise<SourceContextMapRunDetail> {
    const db = await this.ensureReady();
    return createOrResumeSourceContextMapRun(db, payload);
  }

  private async listSourceContextMapRuns(
    filter: SourceContextMapRunFilter = {},
  ): Promise<ListSourceContextMapRunsResult> {
    const db = await this.ensureReady();
    const where = sourceContextMapRunWhereClause(filter);
    const rows = db.selectObjects(
      `SELECT *
       FROM source_context_map_runs
       ${where.sql}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [...where.bind, clampOptionalLimit(filter.limit, 8, 50)],
    );
    return { runs: rows.map(sourceContextMapRunFromRow) };
  }

  private async getSourceContextMapRun(id: string): Promise<SourceContextMapRunDetail | null> {
    const db = await this.ensureReady();
    return loadSourceContextMapRunDetail(db, id);
  }

  private async cancelSourceContextMapRun(id: string): Promise<SourceContextMapRunSummary> {
    const db = await this.ensureReady();
    return cancelSourceContextMapRun(db, id);
  }

  private async retrySourceContextMapRun(id: string): Promise<SourceContextMapRunSummary> {
    const db = await this.ensureReady();
    return retrySourceContextMapRun(db, id);
  }

  private async resumeSourceContextMapRun(id: string): Promise<SourceContextMapRunSummary> {
    const db = await this.ensureReady();
    return resumeSourceContextMapRun(db, id);
  }

  private async listSourceContextMapEvents(
    runId: string,
    limit = 40,
  ): Promise<ListSourceContextMapEventsResult> {
    const db = await this.ensureReady();
    const rows = db.selectObjects(
      `SELECT *
       FROM source_context_map_events
       WHERE run_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [normalizeText(runId), clampLimit(limit, 100)],
    );
    return { events: rows.map(sourceContextMapEventFromRow) };
  }

  private async claimSourceContextMapStep(
    runId: string,
    now?: string,
  ): Promise<SourceContextMapClaimStepResult> {
    const db = await this.ensureReady();
    return claimSourceContextMapStep(db, runId, now);
  }

  private async completeSourceContextMapStep(
    payload: CompleteSourceContextMapStepPayload,
  ): Promise<SourceContextMapStepRecord> {
    const db = await this.ensureReady();
    return completeSourceContextMapStep(db, payload);
  }

  private async failSourceContextMapStep(
    payload: FailSourceContextMapStepPayload,
  ): Promise<SourceContextMapStepRecord> {
    const db = await this.ensureReady();
    return failSourceContextMapStep(db, payload);
  }

  private async markSourceContextMapReduceStarted(
    payload: MarkSourceContextMapReduceStartedPayload,
  ): Promise<SourceContextMapRunSummary> {
    const db = await this.ensureReady();
    return markSourceContextMapReduceStarted(db, payload);
  }

  private async markSourceContextMapReduceCompleted(
    payload: MarkSourceContextMapReduceCompletedPayload,
  ): Promise<SourceContextMapRunSummary> {
    const db = await this.ensureReady();
    return markSourceContextMapReduceCompleted(db, payload);
  }

  private async markSourceContextMapReduceFailed(
    payload: MarkSourceContextMapReduceFailedPayload,
  ): Promise<SourceContextMapRunSummary> {
    const db = await this.ensureReady();
    return markSourceContextMapReduceFailed(db, payload);
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
      db.exec({
        sql: "DELETE FROM source_context_compression_logs WHERE source_id = ?",
        bind: [id],
      });
      deleteSourceContextMapArtifactsForSource(db, id);
      deleteSourceContextMapSchedulerForSource(db, id);
      db.exec({
        sql: "DELETE FROM chunk_meta_tier2_audit WHERE source_id = ?",
        bind: [id],
      });
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
    if (deleted) {
      await this.pdfRawFileStore.delete(id).catch(() => undefined);
    }
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
    return runDeterministicGraphBuildForSource(db, sourceId);
  }

  private async queryGraphNeighbors(payload: GraphNeighborsPayload): Promise<GraphQueryResult> {
    const db = await this.ensureReady();
    return queryGraphNeighbors(db, payload);
  }

  private async queryGraphSubgraph(payload: GraphSubgraphPayload): Promise<GraphQueryResult> {
    const db = await this.ensureReady();
    return queryGraphSubgraph(db, payload);
  }

  private async queryGraphPath(payload: GraphPathPayload): Promise<GraphQueryResult> {
    const db = await this.ensureReady();
    return queryGraphPath(db, payload);
  }

  private async queryGraphTimeline(payload: GraphTimelinePayload): Promise<GraphQueryResult> {
    const db = await this.ensureReady();
    return queryGraphTimeline(db, payload);
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

  private async getActiveEmbeddingModel(): Promise<ActiveEmbeddingModelSummary | null> {
    const db = await this.ensureReady();
    const row = getActiveEmbeddingModelRow(db);
    return row === undefined ? null : activeEmbeddingModelSummaryFromRow(row);
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

  private async enqueueChunkMetaTier2Job(
    payload: Extract<EngineRequest, { kind: "enqueueChunkMetaTier2Job" }>["payload"],
  ): Promise<JobSummary> {
    const db = await this.ensureReady();
    const sourceId = normalizeText(payload.sourceId);
    const source = db.selectObject(
      "SELECT id FROM sources WHERE id = ? AND lifecycle_status <> 'deleted' LIMIT 1",
      [sourceId],
    );
    if (source === undefined) {
      throw new EngineRpcError("SOURCE_NOT_FOUND", `Source not found: ${sourceId}`);
    }

    const jobId = enqueueJob(db, "post_capture_hardening", {
      sourceId,
      stages: ["chunk_meta", "embedding"],
      chunkMetaTier2: {
        enabled: true,
        maxChunks: clampChunkMetaTier2MaxChunks(payload.maxChunks),
      },
      trigger: "manual_tier2_ui",
    });
    const job = db.selectObject("SELECT * FROM jobs WHERE id = ? LIMIT 1", [jobId]);
    if (job === undefined) {
      throw new EngineRpcError("JOB_NOT_FOUND", `Job not found after enqueue: ${jobId}`);
    }
    return jobSummaryFromRow(job);
  }

  private async listChunkMetaTier2Audit(
    filter: ChunkMetaTier2AuditFilter = {},
  ): Promise<{ items: ChunkMetaTier2AuditRecord[] }> {
    const db = await this.ensureReady();
    const where = chunkMetaTier2AuditWhereClause(filter);
    const rows = db.selectObjects(
      `SELECT *
       FROM chunk_meta_tier2_audit
       ${where.sql}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [...where.bind, clampOptionalLimit(filter.limit, 30, 100)],
    );
    return { items: rows.map(chunkMetaTier2AuditRecordFromRow) };
  }

  private async clearChunkMetaTier2Audit(
    filter: ChunkMetaTier2AuditFilter,
  ): Promise<{ cleared: number }> {
    const hasSource = normalizeText(filter.sourceId ?? "").length > 0;
    const hasJob = normalizeText(filter.jobId ?? "").length > 0;
    if (!hasSource && !hasJob) {
      throw new EngineRpcError(
        "INVALID_CHUNK_META_TIER2_AUDIT_FILTER",
        "Clearing Tier2 audit rows requires a sourceId or jobId.",
      );
    }
    const db = await this.ensureReady();
    const where = chunkMetaTier2AuditWhereClause(filter);
    db.exec({
      sql: `DELETE FROM chunk_meta_tier2_audit ${where.sql}`,
      bind: where.bind,
    });
    return { cleared: Number(db.selectValue("SELECT changes()") ?? 0) };
  }

  private async runQueuedJob(id: string): Promise<JobSummary> {
    const db = await this.ensureReady();
    return await runJob(
      db,
      id,
      this.embeddingProviderOverride,
      this.embeddingProviderFactory,
      this.chunkMetaSummarizerFactory,
      this.figureVisionAnalyzerFactory,
      this.pdfRawFileStore,
      this.pdfFigureVisionImageExtractor,
    );
  }

  private async createOrchestrationRun(
    payload: CreateOrchestrationRunPayload,
  ): Promise<OrchestrationRunSummary> {
    const db = await this.ensureReady();
    return createOrchestrationRun(db, payload);
  }

  private async listOrchestrationRuns(
    filter: OrchestrationRunFilter = {},
  ): Promise<{ runs: OrchestrationRunSummary[] }> {
    const db = await this.ensureReady();
    const where = orchestrationRunWhereClause(filter);
    const rows = db.selectObjects(
      `SELECT *
       FROM orchestration_runs
       ${where.sql}
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [...where.bind, clampOptionalLimit(filter.limit, 30, 100)],
    );
    return { runs: rows.map(orchestrationRunFromRow) };
  }

  private async listOrchestrationEvents(
    runId: string,
    limit = 40,
  ): Promise<{ events: OrchestrationEvent[] }> {
    const db = await this.ensureReady();
    const rows = db.selectObjects(
      `SELECT *
       FROM orchestration_events
       WHERE run_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [normalizeText(runId), clampLimit(limit, 100)],
    );
    return { events: rows.map(orchestrationEventFromRow) };
  }

  private async cancelOrchestrationRun(id: string): Promise<OrchestrationRunSummary> {
    const db = await this.ensureReady();
    return cancelOrchestrationRun(db, id);
  }

  private async retryOrchestrationRun(id: string): Promise<OrchestrationRunSummary> {
    const db = await this.ensureReady();
    return retryOrchestrationRun(db, id);
  }

  private async runOrchestration(id: string): Promise<OrchestrationRunSummary> {
    const db = await this.ensureReady();
    return await runOrchestration(
      db,
      id,
      this.embeddingProviderOverride,
      this.embeddingProviderFactory,
      this.chunkMetaSummarizerFactory,
      this.figureVisionAnalyzerFactory,
      this.pdfRawFileStore,
      this.pdfFigureVisionImageExtractor,
    );
  }

  private async reindex(
    request: Extract<EngineRequest, { kind: "reindex" }>,
  ): Promise<ReindexResult> {
    const db = await this.ensureReady();
    const jobId =
      request.scope === "embeddings"
        ? enqueueJob(db, "reindex_embeddings", {
            scope: "embeddings",
            model: request.model,
            authorizedAt: new Date().toISOString(),
          })
        : enqueueJob(db, "reindex_fts", { scope: "fts" });
    const job = await runJob(
      db,
      jobId,
      this.embeddingProviderOverride,
      this.embeddingProviderFactory,
      this.chunkMetaSummarizerFactory,
      this.figureVisionAnalyzerFactory,
      this.pdfRawFileStore,
      this.pdfFigureVisionImageExtractor,
    );
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
      db.exec("DELETE FROM orchestration_events");
      db.exec("DELETE FROM orchestration_runs");
      db.exec("DELETE FROM jobs");
      db.exec("DELETE FROM source_audit_log");
      db.exec("DELETE FROM source_lifecycle_events");
      db.exec("DELETE FROM graph_edges");
      db.exec("DELETE FROM graph_nodes");
      db.exec("DELETE FROM source_context_compression_logs");
      db.exec("DELETE FROM source_context_map_artifacts");
      db.exec("DELETE FROM source_context_map_events");
      db.exec("DELETE FROM source_context_map_steps");
      db.exec("DELETE FROM source_context_map_runs");
      db.exec("DELETE FROM chunk_meta_tier2_audit");
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
    await this.pdfRawFileStore.clear().catch(() => undefined);
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
      recoverStaleOrchestrationRuns(db);
      recoverStaleSourceContextMapRuns(db);
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

const embeddingBridgeTimeoutMs = 30_000;

function createWorkerEmbeddingProviderFactory(
  workerSelf: LocalEngineWorkerGlobal,
): EmbeddingProviderFactory {
  const pending = new Map<
    string,
    {
      resolve: (vectors: number[][]) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  workerSelf.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!isWorkerEmbeddingResponseMessage(event.data)) return;
    const entry = pending.get(event.data.requestId);
    if (entry === undefined) return;
    clearTimeout(entry.timer);
    pending.delete(event.data.requestId);
    if (event.data.response.ok) {
      entry.resolve(event.data.response.value);
      return;
    }
    entry.reject(
      new EngineRpcError(
        event.data.response.error.code,
        event.data.response.error.message,
        event.data.response.error.detail,
      ),
    );
  });

  return (model) => {
    if (!isBridgeEmbeddingProvider(model.provider)) return null;
    return {
      modelId: model.modelId,
      provider: model.provider,
      dimension: model.dimension,
      embedTexts(inputs: string[]) {
        if (inputs.length === 0) return Promise.resolve([]);
        const requestId = createRequestId();
        return new Promise<number[][]>((resolve, reject) => {
          const timer = setTimeout(() => {
            pending.delete(requestId);
            reject(
              new EngineRpcError(
                "EMBEDDING_BRIDGE_TIMEOUT",
                "Embedding provider request timed out.",
              ),
            );
          }, embeddingBridgeTimeoutMs);
          pending.set(requestId, { resolve, reject, timer });
          workerSelf.postMessage({
            type: CLIO_WORKER_EMBEDDING_REQUEST,
            requestId,
            request: {
              modelId: model.modelId,
              inputs,
            },
          });
        });
      },
    };
  };
}

function isBridgeEmbeddingProvider(provider: string) {
  return provider === "openai" || provider === "openai-compatible";
}

function createWorkerChunkMetaSummarizer(workerSelf: LocalEngineWorkerGlobal): ChunkMetaSummarizer {
  const pending = new Map<
    string,
    {
      resolve: (result: ChunkMetaSummaryResult) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  workerSelf.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!isWorkerChunkMetaSummaryResponseMessage(event.data)) return;
    const entry = pending.get(event.data.requestId);
    if (entry === undefined) return;
    clearTimeout(entry.timer);
    pending.delete(event.data.requestId);
    if (event.data.response.ok) {
      entry.resolve(event.data.response.value);
      return;
    }
    entry.reject(
      new EngineRpcError(
        event.data.response.error.code,
        event.data.response.error.message,
        event.data.response.error.detail,
      ),
    );
  });

  return {
    summarize(input: ChunkMetaSummaryInput) {
      const requestId = createRequestId();
      return new Promise<ChunkMetaSummaryResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(
            new EngineRpcError(
              "CHUNK_META_SUMMARY_BRIDGE_TIMEOUT",
              "Chunk meta summary request timed out.",
            ),
          );
        }, chunkMetaSummaryBridgeTimeoutMs);
        pending.set(requestId, { resolve, reject, timer });
        workerSelf.postMessage({
          type: CLIO_WORKER_CHUNK_META_SUMMARY_REQUEST,
          requestId,
          request: input,
        });
      });
    },
  };
}

function createWorkerFigureVisionAnalyzer(
  workerSelf: LocalEngineWorkerGlobal,
): FigureVisionAnalyzer {
  const pending = new Map<
    string,
    {
      resolve: (result: FigureVisionAnalysisResult) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  workerSelf.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (!isWorkerVisionAnalysisResponseMessage(event.data)) return;
    const entry = pending.get(event.data.requestId);
    if (entry === undefined) return;
    clearTimeout(entry.timer);
    pending.delete(event.data.requestId);
    if (event.data.response.ok) {
      entry.resolve(event.data.response.value);
      return;
    }
    entry.reject(
      new EngineRpcError(
        event.data.response.error.code,
        event.data.response.error.message,
        event.data.response.error.detail,
      ),
    );
  });

  return {
    analyze(input: FigureVisionAnalysisInput) {
      const requestId = createRequestId();
      return new Promise<FigureVisionAnalysisResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(
            new EngineRpcError(
              "FIGURE_VISION_BRIDGE_TIMEOUT",
              "Figure vision analysis request timed out.",
            ),
          );
        }, figureVisionBridgeTimeoutMs);
        pending.set(requestId, { resolve, reject, timer });
        workerSelf.postMessage({
          type: CLIO_WORKER_VISION_ANALYSIS_REQUEST,
          requestId,
          request: input,
        });
      });
    },
  };
}

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
  installWorkerMessageHandler(
    workerSelf,
    new LocalEngine({
      embeddingProviderFactory: createWorkerEmbeddingProviderFactory(workerSelf),
      chunkMetaSummarizer: createWorkerChunkMetaSummarizer(workerSelf),
      figureVisionAnalyzer: createWorkerFigureVisionAnalyzer(workerSelf),
    }),
  );
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
    CREATE TABLE IF NOT EXISTS orchestration_runs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('post_capture_job')),
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
      target_job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      progress_current INTEGER NOT NULL DEFAULT 0,
      progress_total INTEGER NOT NULL DEFAULT 1,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      retry_of_run_id TEXT REFERENCES orchestration_runs(id) ON DELETE SET NULL,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS orchestration_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES orchestration_runs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (
        kind IN (
          'queued',
          'claimed',
          'progress',
          'job_started',
          'job_completed',
          'cancel_requested',
          'cancelled',
          'failed',
          'retry_created'
        )
      ),
      level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
      message TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
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
    CREATE TABLE IF NOT EXISTS source_context_compression_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      run_id TEXT,
      source_id TEXT,
      chunk_id TEXT,
      reason TEXT NOT NULL CHECK (
        reason IN (
          'query_no_hits',
          'source_not_found',
          'source_over_budget',
          'source_downgraded',
          'chunk_window_omitted',
          'parent_context_selected',
          'full_depth_bounded',
          'group_limit_reached'
        )
      ),
      message TEXT NOT NULL,
      requested_load_depth TEXT CHECK (
        requested_load_depth IS NULL OR requested_load_depth IN ('meta', 'outline', 'chunks', 'full')
      ),
      selected_load_depth TEXT CHECK (
        selected_load_depth IS NULL OR selected_load_depth IN ('meta', 'outline', 'chunks', 'full')
      ),
      token_estimate INTEGER,
      omitted_token_estimate INTEGER,
      omitted_window_count INTEGER,
      lost_info_types_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_context_map_artifacts (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      run_id TEXT NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN ('map', 'reduce')),
      status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
      group_id TEXT,
      group_index INTEGER,
      source_ids_json TEXT NOT NULL DEFAULT '[]',
      window_refs_json TEXT NOT NULL DEFAULT '[]',
      evidence_ids_json TEXT NOT NULL DEFAULT '[]',
      token_estimate INTEGER,
      input_summary TEXT NOT NULL DEFAULT '',
      output_summary TEXT NOT NULL DEFAULT '',
      map_artifact_ids_json TEXT NOT NULL DEFAULT '[]',
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_context_map_runs (
      id TEXT PRIMARY KEY,
      session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      owner_run_id TEXT NOT NULL,
      mode TEXT CHECK (mode IS NULL OR mode IN ('research', 'auto')),
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'reducing', 'done', 'failed', 'cancelled')),
      plan_signature TEXT NOT NULL,
      source_ids_json TEXT NOT NULL DEFAULT '[]',
      max_concurrent_maps INTEGER NOT NULL DEFAULT 1,
      progress_current INTEGER NOT NULL DEFAULT 0,
      progress_total INTEGER NOT NULL DEFAULT 0,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      retry_of_run_id TEXT REFERENCES source_context_map_runs(id) ON DELETE SET NULL,
      reduce_map_artifact_ids_json TEXT NOT NULL DEFAULT '[]',
      reduce_input_summary TEXT NOT NULL DEFAULT '',
      reduce_output_summary TEXT NOT NULL DEFAULT '',
      reduce_artifact_id TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_context_map_steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES source_context_map_runs(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL,
      group_index INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
      step_signature TEXT NOT NULL,
      source_ids_json TEXT NOT NULL DEFAULT '[]',
      window_refs_json TEXT NOT NULL DEFAULT '[]',
      evidence_ids_json TEXT NOT NULL DEFAULT '[]',
      token_estimate INTEGER,
      input_summary TEXT NOT NULL DEFAULT '',
      output_summary TEXT NOT NULL DEFAULT '',
      artifact_id TEXT,
      error_code TEXT,
      error_message TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      claimed_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (run_id, group_index)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_context_map_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES source_context_map_runs(id) ON DELETE CASCADE,
      step_id TEXT REFERENCES source_context_map_steps(id) ON DELETE SET NULL,
      kind TEXT NOT NULL CHECK (
        kind IN (
          'queued',
          'resumed',
          'step_claimed',
          'step_completed',
          'step_failed',
          'reduce_started',
          'reduce_completed',
          'reduce_failed',
          'cancel_requested',
          'cancelled',
          'retry_created'
        )
      ),
      level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
      message TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunk_meta_tier2_audit (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      chunk_id TEXT NOT NULL REFERENCES source_chunks(id) ON DELETE CASCADE,
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      tier TEXT NOT NULL CHECK (tier IN ('tier2')),
      status TEXT NOT NULL CHECK (status IN ('summarized', 'unavailable', 'error', 'skipped')),
      provider_kind TEXT CHECK (provider_kind IS NULL OR provider_kind IN ('chat')),
      reason TEXT,
      section_summary_chars INTEGER,
      chunk_summary_chars INTEGER,
      semantic_relation_count INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  ensureColumn(db, "chunk_meta_tier2_audit", "semantic_relation_count", "INTEGER");
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
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_orchestration_runs_status ON orchestration_runs(status, created_at DESC)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_orchestration_runs_target ON orchestration_runs(target_job_id, created_at DESC)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_orchestration_runs_retry ON orchestration_runs(retry_of_run_id)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_orchestration_events_run ON orchestration_events(run_id, created_at DESC)",
  );
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
    `CREATE INDEX IF NOT EXISTS idx_source_context_compression_logs_session_created
     ON source_context_compression_logs(session_id, created_at DESC)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_source_context_compression_logs_run_created
     ON source_context_compression_logs(run_id, created_at DESC)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_source_context_compression_logs_source_created
     ON source_context_compression_logs(source_id, created_at DESC)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_source_context_map_artifacts_session_created
     ON source_context_map_artifacts(session_id, created_at DESC)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_source_context_map_artifacts_run_stage_created
     ON source_context_map_artifacts(run_id, stage, created_at DESC)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_source_context_map_artifacts_status_created
     ON source_context_map_artifacts(status, created_at DESC)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_source_context_map_runs_session_created
     ON source_context_map_runs(session_id, created_at DESC)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_source_context_map_runs_owner_plan
     ON source_context_map_runs(owner_run_id, plan_signature, created_at DESC)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_source_context_map_runs_status_created
     ON source_context_map_runs(status, created_at DESC)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_source_context_map_runs_retry
     ON source_context_map_runs(retry_of_run_id)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_source_context_map_steps_run_status
     ON source_context_map_steps(run_id, status, group_index)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_source_context_map_steps_run_group
     ON source_context_map_steps(run_id, group_index)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_source_context_map_events_run_created
     ON source_context_map_events(run_id, created_at DESC)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_chunk_meta_tier2_audit_source_created
     ON chunk_meta_tier2_audit(source_id, created_at DESC)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_chunk_meta_tier2_audit_job_created
     ON chunk_meta_tier2_audit(job_id, created_at DESC)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_chunk_meta_tier2_audit_status_created
     ON chunk_meta_tier2_audit(status, created_at DESC)`,
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

    normalizePaperMetadata(metadata, inputMetadata, extraction, sourceUrl);
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
    normalizePaperMetadata(metadata, inputMetadata, extraction, sourceUrl);

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
  const metadata = overrides.metadata ?? payload.metadata ?? {};
  return {
    kind,
    sourceUrl,
    normalizedSourceUrl,
    sourceTitle,
    normalizedText,
    textHash,
    capturedAt: overrides.capturedAt ?? payload.capturedAt ?? new Date().toISOString(),
    metadataJson: JSON.stringify(metadata),
    versionGroupKey: buildMemoryVersionGroupKey(kind, normalizedSourceUrl, textHash),
    pdfPages: pdfPageTextRanges(metadata),
    sectionHeadings: sectionHeadingRanges(normalizedText, sectionOutlineFromMetadata(metadata)),
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
  if (ranges.size === chunks.length) return ranges;

  const whitespaceInsensitive = compactTextWithoutWhitespaceWithOriginalOffsets(normalizedText);
  const whitespaceInsensitiveRanges = new Map<number, { charStart: number; charEnd: number }>();
  cursor = 0;
  for (const chunk of chunks) {
    const compactChunk = normalizeText(chunk.text).replace(/\s+/g, "");
    if (compactChunk.length === 0) continue;
    const compactStart = whitespaceInsensitive.text.indexOf(compactChunk, cursor);
    if (compactStart < 0) continue;
    const compactEnd = compactStart + compactChunk.length;
    const charStart = whitespaceInsensitive.offsets[compactStart];
    const charEndOffset = whitespaceInsensitive.offsets[Math.max(compactStart, compactEnd - 1)];
    if (charStart === undefined || charEndOffset === undefined) continue;
    whitespaceInsensitiveRanges.set(chunk.ord, { charStart, charEnd: charEndOffset + 1 });
    cursor = Math.max(cursor, compactStart + 1);
  }
  if (whitespaceInsensitiveRanges.size > ranges.size) return whitespaceInsensitiveRanges;
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

function compactTextWithoutWhitespaceWithOriginalOffsets(input: string) {
  const chars: string[] = [];
  const offsets: number[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === undefined || /\s/.test(char)) continue;
    chars.push(char);
    offsets.push(index);
  }
  return { text: chars.join(""), offsets };
}

function pageRangeForChunk(
  chunkRange: ChunkTextRange | undefined,
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

function chunkTextForDocument(draft: DocumentDraft): TextChunk[] {
  const segments = chunkSegmentsForDocument(draft);
  if (segments.length <= 1 && segments[0]?.charStart === 0) return chunkText(draft.normalizedText);

  const chunks: TextChunk[] = [];
  for (const segment of segments) {
    const segmentChunks = chunkText(segment.text, 900, 120, chunks.length);
    chunks.push(...segmentChunks);
  }
  return chunks;
}

function chunkSegmentsForDocument(draft: DocumentDraft): DocumentChunkSegment[] {
  if (draft.sectionHeadings.length === 0) {
    return [
      {
        text: draft.normalizedText,
        charStart: 0,
        charEnd: draft.normalizedText.length,
        sectionPath: null,
      },
    ];
  }

  const segments: DocumentChunkSegment[] = [];
  for (let index = 0; index < draft.sectionHeadings.length; index += 1) {
    const heading = draft.sectionHeadings[index];
    const nextHeading = draft.sectionHeadings[index + 1];
    if (heading === undefined) continue;
    const charStart = heading.charStart;
    const charEnd = nextHeading?.charStart ?? draft.normalizedText.length;
    const text = normalizeText(draft.normalizedText.slice(charStart, charEnd));
    if (text.length === 0) continue;
    segments.push({
      text,
      charStart,
      charEnd,
      sectionPath: heading.path,
    });
  }

  if (segments.length === 0) {
    return [
      {
        text: draft.normalizedText,
        charStart: 0,
        charEnd: draft.normalizedText.length,
        sectionPath: null,
      },
    ];
  }
  const firstSectionStart = segments[0]?.charStart ?? 0;
  if (firstSectionStart > 0) {
    const prefaceText = normalizeText(draft.normalizedText.slice(0, firstSectionStart));
    if (prefaceText.length > 0) {
      segments.unshift({
        text: prefaceText,
        charStart: 0,
        charEnd: firstSectionStart,
        sectionPath: null,
      });
    }
  }
  return segments;
}

function materializeSourceChunks(
  sourceId: string,
  draft: DocumentDraft,
  chunks: TextChunk[],
  chunkRanges: Map<number, ChunkTextRange>,
): { parents: MaterializedParentChunk[]; children: MaterializedChildChunk[] } {
  const children = chunks.map((chunk): MaterializedChildChunk => {
    const range = chunkRanges.get(chunk.ord);
    const sectionPath = sectionPathForChunk(range, draft.sectionHeadings);
    return {
      id: `${sourceId}:${chunk.ord}`,
      chunk,
      range,
      pageRange: pageRangeForChunk(range, draft.pdfPages),
      sectionPath,
      metaHeadJson: buildChunkMetaHeadJson(draft, {
        chunkText: chunk.text,
        sectionPath,
        roleHint: "child",
      }),
      parentChunkId: null,
    };
  });
  const parentGroups = parentChunkGroupsForChildren(children);
  const parents = parentGroups.map((group, index): MaterializedParentChunk => {
    const parentRange = parentChunkRange(group.children);
    const text = boundedParentChunkText(
      group.children.map((child) => child.chunk.text).join("\n\n"),
    );
    return {
      id: `${sourceId}:parent:${index}`,
      ord: parentChunkOrdBase + index,
      text,
      tokenCount: estimateTokens(text),
      hash: hashText(text),
      sectionPath: group.sectionPath,
      charStart: parentRange?.charStart ?? null,
      charEnd: parentRange?.charEnd ?? null,
      pageRange: pageRangeForChunk(parentRange, draft.pdfPages),
      metaHeadJson: buildChunkMetaHeadJson(draft, {
        chunkText: text,
        sectionPath: group.sectionPath,
        roleHint: "parent",
      }),
    };
  });
  for (let index = 0; index < parentGroups.length; index += 1) {
    const parent = parents[index];
    const group = parentGroups[index];
    if (parent === undefined || group === undefined) continue;
    for (const child of group.children) {
      child.parentChunkId = parent.id;
      child.metaHeadJson = buildChunkMetaHeadJson(draft, {
        chunkText: child.chunk.text,
        sectionPath: child.sectionPath,
        roleHint: "child",
        relations: [
          {
            kind: "parent",
            target: parent.id,
            label: child.sectionPath,
          },
        ],
      });
    }
  }
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child === undefined) continue;
    const relations = parseChunkMetaRelations(child.metaHeadJson);
    const previous = children[index - 1];
    const next = children[index + 1];
    if (previous !== undefined) {
      relations.push({ kind: "previous", target: previous.id, label: previous.sectionPath });
    }
    if (next !== undefined) {
      relations.push({ kind: "next", target: next.id, label: next.sectionPath });
    }
    child.metaHeadJson = buildChunkMetaHeadJson(draft, {
      chunkText: child.chunk.text,
      sectionPath: child.sectionPath,
      roleHint: "child",
      relations,
    });
  }
  return { parents, children };
}

function parentChunkGroupsForChildren(children: MaterializedChildChunk[]) {
  const groups: Array<{ sectionPath: string; children: MaterializedChildChunk[] }> = [];
  const bySectionPath = new Map<
    string,
    { sectionPath: string; children: MaterializedChildChunk[] }
  >();
  for (const child of children) {
    if (child.sectionPath === null || child.sectionPath.length === 0) continue;
    const group = bySectionPath.get(child.sectionPath) ?? {
      sectionPath: child.sectionPath,
      children: [],
    };
    group.children.push(child);
    if (!bySectionPath.has(child.sectionPath)) {
      bySectionPath.set(child.sectionPath, group);
      groups.push(group);
    }
  }
  return groups.filter((group) => group.children.length > 0);
}

function parentChunkRange(children: MaterializedChildChunk[]): ChunkTextRange | undefined {
  const ranges = children.flatMap((child) => (child.range === undefined ? [] : [child.range]));
  if (ranges.length === 0) return undefined;
  return {
    charStart: Math.min(...ranges.map((range) => range.charStart)),
    charEnd: Math.max(...ranges.map((range) => range.charEnd)),
  };
}

function boundedParentChunkText(input: string) {
  return boundedNormalizedText(input, parentChunkTextMaxChars);
}

function sectionOutlineFromMetadata(metadata: Record<string, unknown>): SectionOutlineItem[] {
  return sectionOutlineFromUnknown(metadata.sectionOutline);
}

function sectionOutlineFromJson(input: string): SectionOutlineItem[] {
  return sectionOutlineFromUnknown(parseJsonArray(input));
}

function sectionOutlineFromUnknown(input: unknown): SectionOutlineItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .flatMap((item): SectionOutlineItem[] => {
      if (!isRecord(item)) return [];
      const level = metadataNumber(item.level);
      const text = typeof item.text === "string" ? normalizeText(item.text) : "";
      if (level === undefined || text.length === 0) return [];
      return [{ level: Math.max(1, Math.min(6, Math.floor(level))), text }];
    })
    .slice(0, 200);
}

function sectionHeadingRanges(
  normalizedText: string,
  outline: SectionOutlineItem[],
): SectionHeadingRange[] {
  if (outline.length === 0) return [];
  const lines = textLineRanges(normalizedText);
  const headings: SectionHeadingRange[] = [];
  const stack: SectionHeadingRange[] = [];
  let lineCursor = 0;

  for (const item of outline) {
    const lineIndex = findSectionHeadingLine(lines, item, lineCursor);
    if (lineIndex < 0) continue;
    lineCursor = lineIndex + 1;
    const line = lines[lineIndex];
    if (line === undefined) continue;
    while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= item.level) {
      stack.pop();
    }
    const path = boundedNormalizedText(
      [...stack.map((heading) => heading.text), item.text].join(" > "),
      chunkMetaSectionPathMaxChars,
    );
    const heading = {
      level: item.level,
      text: item.text,
      charStart: line.charStart,
      path,
    };
    headings.push(heading);
    stack.push(heading);
  }

  return headings;
}

function textLineRanges(input: string): TextLineRange[] {
  const lines: TextLineRange[] = [];
  let start = 0;
  for (let index = 0; index <= input.length; index += 1) {
    if (index < input.length && input[index] !== "\n") continue;
    const rawLine = input.slice(start, index);
    const text = normalizeText(rawLine);
    if (text.length > 0) {
      lines.push({ text, charStart: start, charEnd: index });
    }
    start = index + 1;
  }
  return lines;
}

function findSectionHeadingLine(
  lines: TextLineRange[],
  item: SectionOutlineItem,
  startIndex: number,
) {
  const target = normalizeSectionHeadingText(item.text);
  if (target.length === 0) return -1;
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    if (normalizeSectionHeadingText(line.text) === target) return index;
  }
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) continue;
    if (normalizeSectionHeadingText(stripSectionHeadingMarker(line.text)) === target) return index;
  }
  return -1;
}

function stripSectionHeadingMarker(input: string) {
  return normalizeText(input)
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\d+(?:\.\d+)*\.?\s+/, "")
    .replace(/\s*#+$/, "");
}

function normalizeSectionHeadingText(input: string) {
  return stripSectionHeadingMarker(input).toLowerCase();
}

function sectionPathForChunk(
  chunkRange: ChunkTextRange | undefined,
  headings: SectionHeadingRange[],
) {
  if (chunkRange === undefined || headings.length === 0) return null;
  let active: SectionHeadingRange | undefined;
  for (const heading of headings) {
    if (heading.charStart > chunkRange.charStart) break;
    active = heading;
  }
  return active === undefined ? null : active.path;
}

function chunkTextRangeFromRow(row: SqlRow): ChunkTextRange | undefined {
  if (row.char_start === null || row.char_start === undefined) return undefined;
  if (row.char_end === null || row.char_end === undefined) return undefined;
  const charStart = metadataNumber(row.char_start);
  const charEnd = metadataNumber(row.char_end);
  if (charStart === undefined || charEnd === undefined) return undefined;
  if (charStart < 0 || charEnd < charStart) return undefined;
  return {
    charStart: Math.floor(charStart),
    charEnd: Math.floor(charEnd),
  };
}

function buildChunkMetaHeadJson(
  draft: DocumentDraft,
  input: {
    chunkText: string;
    sectionPath?: string | null;
    roleHint?: string | null;
    relations?: ChunkMetaRelationV1[];
    selectedTier?: ChunkMetaTierV1;
  },
) {
  return buildChunkMetaHeadJsonFromSourceMetadata({
    sourceTitle: draft.sourceTitle,
    sourceType: draft.kind,
    metadataJson: draft.metadataJson,
    chunkText: input.chunkText,
    sectionPath: input.sectionPath,
    roleHint: input.roleHint,
    relations: input.relations,
    selectedTier: input.selectedTier,
  });
}

function buildChunkMetaHeadJsonFromSourceMetadata(input: {
  sourceTitle: string;
  sourceType: string;
  metadataJson: string;
  chunkText: string;
  sectionPath?: string | null;
  roleHint?: string | null;
  relations?: ChunkMetaRelationV1[];
  selectedTier?: ChunkMetaTierV1;
}) {
  const metadata = parseMetadata(input.metadataJson);
  const title = boundedNormalizedText(
    stringMetadataField(metadata, "title") ?? input.sourceTitle,
    chunkMetaTitleMaxChars,
  );
  const sourceType = boundedNormalizedText(
    stringMetadataField(metadata, "source_type") ?? input.sourceType,
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
  const sectionPath =
    input.sectionPath === null || input.sectionPath === undefined
      ? null
      : boundedNormalizedText(input.sectionPath, chunkMetaSectionPathMaxChars);
  const normalizedSectionPath = sectionPath !== null && sectionPath.length > 0 ? sectionPath : null;
  const sectionRelation: ChunkMetaRelationV1[] =
    normalizedSectionPath === null
      ? []
      : [
          {
            kind: "section",
            target: normalizedSectionPath,
            label: normalizedSectionPath,
          },
        ];
  const relations = normalizeChunkMetaRelations([...sectionRelation, ...(input.relations ?? [])]);
  const roleHint = normalizeChunkMetaRoleHint(input.roleHint);
  const tier0SectionSummary = deterministicSectionSummary(normalizedSectionPath);
  const tier0ChunkSummary = deterministicChunkSummary(input.chunkText);
  const tier0SemanticRelations = normalizeChunkMetaSemanticRelations([]);
  const tier1SectionSummary = localExtractiveSectionSummary({
    sectionPath: normalizedSectionPath,
    chunkText: input.chunkText,
  });
  const tier1ChunkSummary = localExtractiveChunkSummary(input.chunkText);
  const tier1SemanticRelations = buildLocalChunkMetaSemanticRelations({
    roleHint,
    sectionPath: normalizedSectionPath,
    relations,
    chunkText: input.chunkText,
  });
  const selectedTier = selectChunkMetaTier(input.selectedTier);
  const selected =
    selectedTier === "tier1"
      ? {
          summarySource: "local_extractive" as const,
          sectionSummary: tier1SectionSummary,
          chunkSummary: tier1ChunkSummary,
          semanticRelations: tier1SemanticRelations,
        }
      : {
          summarySource: "deterministic" as const,
          sectionSummary: tier0SectionSummary,
          chunkSummary: tier0ChunkSummary,
          semanticRelations: tier0SemanticRelations,
        };
  const metaHead: ChunkMetaHeadV1 = {
    version: chunkMetaHeadVersion,
    tier: selectedTier,
    summarySource: selected.summarySource,
    selectedTier,
    tiers: {
      tier0: {
        status: "available",
        summarySource: "deterministic",
        sectionSummary: tier0SectionSummary,
        chunkSummary: tier0ChunkSummary,
        relations,
        semanticRelations: tier0SemanticRelations,
      },
      tier1:
        selectedTier === "tier1"
          ? {
              status: "available",
              summarySource: "local_extractive",
              fallbackTier: "tier0",
              sectionSummary: tier1SectionSummary,
              chunkSummary: tier1ChunkSummary,
              relations,
              semanticRelations: tier1SemanticRelations,
            }
          : {
              status: "unavailable",
              summarySource: "unavailable",
              reason: "chunk_meta_stage_not_run",
              fallbackTier: "tier0",
              sectionSummary: null,
              chunkSummary: null,
              relations: [],
              semanticRelations: [],
            },
      tier2: {
        status: "disabled",
        summarySource: "unavailable",
        reason: "explicit_llm_chunk_meta_not_configured",
        fallbackTier: selectedTier,
        sectionSummary: null,
        chunkSummary: null,
        relations: [],
        semanticRelations: [],
      },
    },
    source: {
      title,
      type: sourceType,
      abstract: boundedAbstract,
    },
    docContext,
    sectionPath: normalizedSectionPath,
    sectionSummary: selected.sectionSummary,
    chunkSummary: selected.chunkSummary,
    roleHint,
    relations,
    semanticRelations: selected.semanticRelations,
  };
  return JSON.stringify(metaHead);
}

function selectChunkMetaTier(input: ChunkMetaTierV1 | undefined): ChunkMetaTierV1 {
  return input === "tier1" ? "tier1" : "tier0";
}

function deterministicChunkSummary(input: string): string | null {
  const summary = excerpt(input, chunkMetaChunkSummaryMaxChars);
  return summary.length === 0 ? null : summary;
}

function localExtractiveChunkSummary(input: string): string | null {
  const normalized = normalizeText(input);
  if (normalized.length === 0) return null;
  const sentences = normalized
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => normalizeText(sentence))
    .filter((sentence) => sentence.length > 0);
  const selected = sentences.length === 0 ? normalized : sentences.slice(0, 2).join(" ");
  return boundedNormalizedText(selected, chunkMetaChunkSummaryMaxChars);
}

function deterministicSectionSummary(sectionPath?: string | null): string | null {
  if (sectionPath === null || sectionPath === undefined) return null;
  const parts = sectionPath
    .split(">")
    .map((part) => normalizeText(part))
    .filter((part) => part.length > 0);
  const sectionName = parts[parts.length - 1] ?? normalizeText(sectionPath);
  if (sectionName.length === 0) return null;
  return boundedNormalizedText(`Section: ${sectionName}`, chunkMetaSectionSummaryMaxChars);
}

function localExtractiveSectionSummary(input: {
  sectionPath: string | null;
  chunkText: string;
}): string | null {
  const sectionSummary = deterministicSectionSummary(input.sectionPath);
  const chunkSummary = localExtractiveChunkSummary(input.chunkText);
  if (sectionSummary === null) return chunkSummary;
  if (chunkSummary === null) return sectionSummary;
  return boundedNormalizedText(
    `${sectionSummary}. ${chunkSummary}`,
    chunkMetaSectionSummaryMaxChars,
  );
}

function normalizeChunkMetaRoleHint(input?: string | null): string | null {
  if (input === null || input === undefined) return null;
  const roleHint = boundedNormalizedText(input, 80);
  return roleHint.length === 0 ? null : roleHint;
}

function parseChunkMetaRelations(metaHeadJson: string): ChunkMetaRelationV1[] {
  const metaHead = parseMetadata(metaHeadJson);
  const relations = metaHead.relations;
  if (!Array.isArray(relations)) return [];
  const parsed = relations.flatMap((relation): ChunkMetaRelationV1[] => {
    if (!isRecord(relation)) return [];
    if (!isChunkMetaRelationKind(relation.kind)) return [];
    if (typeof relation.target !== "string") return [];
    const target = boundedNormalizedText(relation.target, chunkMetaSectionPathMaxChars);
    if (target.length === 0) return [];
    const label =
      typeof relation.label === "string"
        ? boundedNormalizedText(relation.label, chunkMetaRelationLabelMaxChars)
        : "";
    return [
      {
        kind: relation.kind,
        target,
        label: label.length === 0 ? null : label,
      },
    ];
  });
  return normalizeChunkMetaRelations(parsed);
}

function normalizeChunkMetaRelations(input?: ChunkMetaRelationV1[]): ChunkMetaRelationV1[] {
  if (input === undefined) return [];
  const seen = new Set<string>();
  const relations: ChunkMetaRelationV1[] = [];
  for (const relation of input) {
    if (!isChunkMetaRelationKind(relation.kind)) continue;
    const target = boundedNormalizedText(relation.target, chunkMetaSectionPathMaxChars);
    if (target.length === 0) continue;
    const key = `${relation.kind}:${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label =
      relation.label === null || relation.label === undefined
        ? null
        : boundedNormalizedText(relation.label, chunkMetaRelationLabelMaxChars);
    relations.push({
      kind: relation.kind,
      target,
      label: label !== null && label.length > 0 ? label : null,
    });
    if (relations.length >= chunkMetaMaxRelations) break;
  }
  return relations;
}

function isChunkMetaRelationKind(value: unknown): value is ChunkMetaRelationKindV1 {
  return value === "parent" || value === "previous" || value === "next" || value === "section";
}

function buildLocalChunkMetaSemanticRelations(input: {
  roleHint: string | null;
  sectionPath: string | null;
  relations: ChunkMetaRelationV1[];
  chunkText: string;
}): ChunkMetaSemanticRelationV1[] {
  const semanticRelations: ChunkMetaSemanticRelationV1[] = input.relations.map((relation) => ({
    kind: relation.kind,
    target: relation.target,
    label: relation.label,
    confidence: 0.8,
    source: "local_extractive",
  }));
  if (input.roleHint !== null) {
    semanticRelations.push({
      kind: "role",
      target: input.roleHint,
      label: input.sectionPath,
      confidence: 0.7,
      source: "local_extractive",
    });
  }
  const citationHints = extractChunkMetaCitationHints(input.chunkText);
  for (const hint of citationHints) {
    semanticRelations.push({
      kind: "citation_hint",
      target: hint,
      label: "citation-like reference",
      confidence: 0.55,
      source: "local_extractive",
    });
  }
  return normalizeChunkMetaSemanticRelations(semanticRelations);
}

function extractChunkMetaCitationHints(input: string): string[] {
  const text = normalizeText(input);
  const hints = new Set<string>();
  for (const match of text.matchAll(/\b(?:doi|DOI)\s*:\s*([^\s,;]+)|\b10\.\d{4,9}\/[^\s,;]+/g)) {
    const hint = normalizeText(match[1] ?? match[0] ?? "");
    if (hint.length > 0 && hints.size < 4) hints.add(hint);
  }
  return [...hints];
}

function normalizeChunkMetaSemanticRelations(
  input?: ChunkMetaSemanticRelationV1[],
): ChunkMetaSemanticRelationV1[] {
  if (input === undefined) return [];
  const seen = new Set<string>();
  const relations: ChunkMetaSemanticRelationV1[] = [];
  for (const relation of input) {
    if (!isChunkMetaSemanticRelationKind(relation.kind)) continue;
    const target = boundedNormalizedText(relation.target, chunkMetaSectionPathMaxChars);
    if (target.length === 0) continue;
    const key = `${relation.kind}:${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label =
      relation.label === null || relation.label === undefined
        ? null
        : boundedNormalizedText(relation.label, chunkMetaRelationLabelMaxChars);
    const confidence = Math.max(0, Math.min(1, relation.confidence));
    relations.push({
      kind: relation.kind,
      target,
      label: label !== null && label.length > 0 ? label : null,
      confidence,
      source: normalizeChunkMetaSemanticRelationSource(relation.source),
    });
    if (relations.length >= chunkMetaMaxRelations) break;
  }
  return relations;
}

function isChunkMetaSemanticRelationKind(value: unknown): value is ChunkMetaSemanticRelationKindV1 {
  return isChunkMetaRelationKind(value) || value === "role" || value === "citation_hint";
}

function normalizeChunkMetaSemanticRelationSource(
  value: unknown,
): ChunkMetaSemanticRelationV1["source"] {
  if (value === "deterministic" || value === "remote_llm") return value;
  return "local_extractive";
}

function buildChunkEmbeddingInput(chunk: SqlRow) {
  const text = stringField(chunk, "text");
  const prefix = buildChunkMetaEmbeddingPrefix(stringField(chunk, "meta_head_json"));
  return prefix.length === 0 ? text : `${prefix}\n\n${text}`;
}

function buildChunkMetaEmbeddingPrefix(metaHeadJson: string) {
  const metaHead = parseMetadata(metaHeadJson);
  const selectedTier =
    stringMetadataField(metaHead, "selectedTier") ?? stringMetadataField(metaHead, "tier");
  const selectedTierState = selectedChunkMetaTierState(metaHead, selectedTier);
  const docContext = stringMetadataField(metaHead, "docContext") ?? "";
  const sectionPath = stringMetadataField(metaHead, "sectionPath") ?? "";
  const sectionSummary =
    stringMetadataField(selectedTierState, "sectionSummary") ??
    stringMetadataField(metaHead, "sectionSummary") ??
    "";
  const chunkSummary =
    stringMetadataField(selectedTierState, "chunkSummary") ??
    stringMetadataField(metaHead, "chunkSummary") ??
    "";
  const roleHint = stringMetadataField(metaHead, "roleHint") ?? "";
  const relationHints = chunkMetaRelationHintsForEmbedding(metaHead, selectedTierState);
  return boundedNormalizedText(
    [
      docContext,
      sectionPath.length > 0 ? `Section: ${sectionPath}` : "",
      sectionSummary.length > 0 ? `Section summary: ${sectionSummary}` : "",
      chunkSummary.length > 0 ? `Chunk summary: ${chunkSummary}` : "",
      roleHint.length > 0 ? `Role: ${roleHint}` : "",
      relationHints.length > 0 ? `Relations: ${relationHints.join("; ")}` : "",
    ]
      .filter((part) => part.length > 0)
      .join("\n"),
    chunkMetaEmbeddingPrefixMaxChars,
  );
}

function selectedChunkMetaTierState(
  metaHead: Record<string, unknown>,
  selectedTier: string | null,
): Record<string, unknown> {
  const tiers = metaHead.tiers;
  if (!isRecord(tiers)) return {};
  const preferred = typeof selectedTier === "string" ? tiers[selectedTier] : undefined;
  if (isRecord(preferred) && preferred.status === "available") return preferred;
  const tier1 = tiers.tier1;
  if (isRecord(tier1) && tier1.status === "available") return tier1;
  const tier0 = tiers.tier0;
  return isRecord(tier0) ? tier0 : {};
}

function chunkMetaRelationHintsForEmbedding(
  metaHead: Record<string, unknown>,
  selectedTierState: Record<string, unknown>,
): string[] {
  const semanticRelations = Array.isArray(selectedTierState.semanticRelations)
    ? selectedTierState.semanticRelations
    : Array.isArray(metaHead.semanticRelations)
      ? metaHead.semanticRelations
      : [];
  const hints = semanticRelations.flatMap((relation): string[] => {
    if (!isRecord(relation)) return [];
    const kind = typeof relation.kind === "string" ? normalizeText(relation.kind) : "";
    const target = typeof relation.target === "string" ? normalizeText(relation.target) : "";
    if (kind.length === 0 || target.length === 0) return [];
    return [`${kind}:${target}`];
  });
  return hints.slice(0, 6);
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
  venue?: string;
  categories: string[];
  referenceList: PaperMetadataReferenceEntry[];
  sectionOutline: Array<{ level: number; text: string }>;
}

type PaperMetadataSourceTrust = "high" | "medium" | "low";

interface PaperMetadataFieldConfidence {
  source: string;
  confidence: number;
}

interface PaperMetadataReferenceEntry {
  index: number;
  raw: string;
  doi?: string;
  arxivId?: string;
  title?: string;
  year?: number;
}

interface PaperMetadataContractV1 {
  version: 1;
  doi?: string;
  arxivId?: string;
  arxivVersion?: string;
  authors: string[];
  year?: number;
  venue?: string;
  referenceList: PaperMetadataReferenceEntry[];
  alternateUrls: string[];
  sourceTrust: PaperMetadataSourceTrust;
  fields: Record<string, PaperMetadataFieldConfidence>;
  remote: {
    status: "disabled";
    reason: "explicit_remote_enrichment_not_configured";
  };
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
  sourceUrl: string,
) {
  const explicitAuthors = parseMetadataAuthors(inputMetadata);
  const explicitCategories = parseMetadataCategories(inputMetadata);
  const explicitYear = metadataInteger(inputMetadata, "year");
  const explicitDoi = normalizeDoi(metadataDisplayString(inputMetadata, "doi"));
  const explicitVenue = parseMetadataVenue(inputMetadata);
  const explicitReferences = parseMetadataReferenceList(inputMetadata);
  const explicitArxiv = parseExplicitArxivMetadata(inputMetadata);
  const explicitAdapterHint = adapterHintFromMetadata(inputMetadata);
  const explicitSourceType = metadataString(inputMetadata, "source_type");
  const explicitPaperSource =
    metadataString(inputMetadata, "paper_source") ??
    metadataString(inputMetadata, "source_provider");

  if (explicitAuthors.length > 0) metadata.authors = explicitAuthors;
  if (explicitCategories.length > 0) metadata.categories = explicitCategories;
  if (explicitYear !== undefined) metadata.year = explicitYear;
  if (explicitDoi !== undefined) metadata.doi = explicitDoi;
  if (explicitVenue !== undefined) metadata.venue = explicitVenue;

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
  setMetadataIfMissing(metadata, "arxiv_id", explicitArxiv.arxivId ?? extraction.arxivId);
  setMetadataIfMissing(
    metadata,
    "arxiv_version",
    explicitArxiv.arxivVersion ?? extraction.arxivVersion,
  );
  setMetadataIfMissing(metadata, "doi", extraction.doi);
  setMetadataIfMissing(metadata, "venue", extraction.venue);
  setMetadataIfMissing(metadata, "categories", extraction.categories);
  setMetadataIfMissing(
    metadata,
    "reference_list",
    explicitReferences.length > 0 ? explicitReferences : extraction.referenceList,
  );
  setMetadataIfMissing(metadata, "sectionOutline", extraction.sectionOutline);

  const contract = buildPaperMetadataContract({
    metadata,
    inputMetadata,
    extraction,
    sourceUrl,
    explicitAuthors,
    explicitYear,
    explicitDoi,
    explicitVenue,
    explicitReferences,
    explicitArxiv,
  });
  if (contract !== undefined) {
    metadata.paper_metadata = contract;
    metadata.alternate_urls = contract.alternateUrls;
    metadata.source_trust = contract.sourceTrust;
  }
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
    venue: extractPaperVenue(lines),
    categories: parsePaperCategories(categoryText ?? ""),
    referenceList: parsePaperReferencesFromText(text),
    sectionOutline: paperSectionOutline(text),
  };
}

function extractPaperVenue(lines: string[]) {
  return (
    extractLabeledLine(lines, [
      "venue",
      "journal-ref",
      "journal ref",
      "journal",
      "conference",
      "published",
      "publisher",
    ]) ?? undefined
  );
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

function parseMetadataVenue(metadata: Record<string, unknown>) {
  return (
    metadataDisplayString(metadata, "venue") ??
    metadataDisplayString(metadata, "journal_ref") ??
    metadataDisplayString(metadata, "journal-ref") ??
    metadataDisplayString(metadata, "journalRef") ??
    metadataDisplayString(metadata, "journal") ??
    metadataDisplayString(metadata, "conference") ??
    metadataDisplayString(metadata, "published")
  );
}

function parseExplicitArxivMetadata(metadata: Record<string, unknown>): ArxivParseResult {
  const rawId =
    metadataDisplayString(metadata, "arxiv_id") ??
    metadataDisplayString(metadata, "arxivId") ??
    metadataDisplayString(metadata, "arxiv") ??
    metadataDisplayString(metadata, "eprint");
  const rawVersion =
    metadataDisplayString(metadata, "arxiv_version") ??
    metadataDisplayString(metadata, "arxivVersion");
  if (rawId === undefined) return { isArxiv: false };
  const parsed = arxivParseResultFromIdCandidate(`${rawId}${rawVersion ?? ""}`);
  return {
    ...parsed,
    arxivVersion: parsed.arxivVersion ?? rawVersion?.toLowerCase(),
  };
}

function parseMetadataReferenceList(metadata: Record<string, unknown>) {
  const raw =
    metadata.reference_list ??
    metadata.referenceList ??
    metadata.references ??
    metadata.pdf_references;
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((item, index): PaperMetadataReferenceEntry[] => {
      if (typeof item === "string") return paperReferenceEntryFromRaw(index, item);
      if (!isRecord(item)) return [];
      const rawText =
        typeof item.raw === "string"
          ? item.raw
          : typeof item.text === "string"
            ? item.text
            : typeof item.title === "string"
              ? item.title
              : "";
      return paperReferenceEntryFromRaw(
        typeof item.index === "number" && Number.isFinite(item.index) ? item.index : index,
        rawText,
        item,
      );
    })
    .slice(0, 80);
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
  return normalizeDoi(match[1]);
}

function normalizeDoi(input: string | undefined) {
  if (input === undefined) return undefined;
  const normalized = normalizeText(input)
    .replace(/^doi\s*:\s*/i, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi\.org\//i, "")
    .replace(/[)\].,;]+$/, "")
    .toLowerCase();
  return /^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/i.test(normalized) ? normalized : undefined;
}

function parsePaperReferencesFromText(text: string) {
  const normalized = normalizeText(text);
  const lines = normalized.split("\n");
  const start = lines.findIndex((line) => /^(references|bibliography)\s*$/i.test(line.trim()));
  if (start < 0) return [];
  const entries: string[] = [];
  let current = "";
  for (const line of lines.slice(start + 1, start + 260)) {
    const trimmed = normalizeText(line);
    if (trimmed.length === 0) {
      if (current.length > 0) {
        entries.push(current);
        current = "";
      }
      continue;
    }
    if (looksLikePaperSectionHeading(trimmed) && entries.length > 0) break;
    if (/^(?:\[\d+\]|\d+[.)])\s+/.test(trimmed)) {
      if (current.length > 0) entries.push(current);
      current = trimmed;
      continue;
    }
    current = current.length === 0 ? trimmed : `${current} ${trimmed}`;
  }
  if (current.length > 0) entries.push(current);
  return entries.flatMap((entry, index) => paperReferenceEntryFromRaw(index, entry)).slice(0, 80);
}

function paperReferenceEntryFromRaw(
  index: number,
  rawInput: string,
  record: Record<string, unknown> = {},
): PaperMetadataReferenceEntry[] {
  const raw = normalizeText(rawInput).slice(0, 2_000);
  if (raw.length === 0) return [];
  const explicitDoi = typeof record.doi === "string" ? normalizeDoi(record.doi) : undefined;
  const explicitArxiv =
    typeof record.arxivId === "string"
      ? arxivParseResultFromIdCandidate(record.arxivId).arxivId
      : typeof record.arxiv_id === "string"
        ? arxivParseResultFromIdCandidate(record.arxiv_id).arxivId
        : undefined;
  const doi = explicitDoi ?? extractDoi(raw);
  const arxivId = explicitArxiv ?? parseArxivText(raw).arxivId;
  const year =
    typeof record.year === "number" && isReasonablePaperYear(record.year)
      ? Math.floor(record.year)
      : inferReferenceYear(raw);
  const title =
    typeof record.title === "string" && normalizeText(record.title).length > 0
      ? normalizeText(record.title).slice(0, 500)
      : inferReferenceTitle(raw);
  return [
    {
      index,
      raw,
      ...(doi === undefined ? {} : { doi }),
      ...(arxivId === undefined ? {} : { arxivId }),
      ...(title === undefined ? {} : { title }),
      ...(year === undefined ? {} : { year }),
    },
  ];
}

function inferReferenceYear(raw: string) {
  const match = /\b(19\d{2}|20\d{2}|2100)\b/.exec(raw);
  if (match === null) return undefined;
  const year = Number(match[1]);
  return isReasonablePaperYear(year) ? year : undefined;
}

function inferReferenceTitle(raw: string) {
  const cleaned = raw.replace(/^(?:\[\d+\]|\d+[.)])\s+/, "");
  const parts = cleaned
    .split(/\.\s+/)
    .map((part) => normalizeText(part))
    .filter((part) => part.length > 0);
  const candidate = parts.find((part) => part.length >= 8 && !/\b(19\d{2}|20\d{2})\b/.test(part));
  return candidate === undefined ? undefined : candidate.slice(0, 500);
}

function buildPaperMetadataContract(input: {
  metadata: Record<string, unknown>;
  inputMetadata: Record<string, unknown>;
  extraction: PaperMetadataExtraction;
  sourceUrl: string;
  explicitAuthors: string[];
  explicitYear?: number;
  explicitDoi?: string;
  explicitVenue?: string;
  explicitReferences: PaperMetadataReferenceEntry[];
  explicitArxiv: ArxivParseResult;
}): PaperMetadataContractV1 | undefined {
  const doi =
    normalizeDoi(metadataDisplayString(input.metadata, "doi")) ??
    input.explicitDoi ??
    input.extraction.doi;
  const arxivId =
    metadataDisplayString(input.metadata, "arxiv_id") ??
    metadataDisplayString(input.metadata, "arxivId") ??
    input.explicitArxiv.arxivId ??
    input.extraction.arxivId;
  const arxivVersion =
    metadataDisplayString(input.metadata, "arxiv_version") ??
    metadataDisplayString(input.metadata, "arxivVersion") ??
    input.explicitArxiv.arxivVersion ??
    input.extraction.arxivVersion;
  const authors = parseMetadataAuthors(input.metadata).slice(0, 50);
  const year =
    metadataInteger(input.metadata, "year") ?? input.explicitYear ?? input.extraction.year;
  const venue = parseMetadataVenue(input.metadata) ?? input.explicitVenue ?? input.extraction.venue;
  const referenceList = parseMetadataReferenceList(input.metadata).slice(0, 80);
  if (
    !paperMetadataHasSignal({
      metadata: input.metadata,
      extraction: input.extraction,
      doi,
      arxivId,
      authors,
      venue,
      referenceList,
    })
  ) {
    return undefined;
  }

  return {
    version: 1,
    ...(doi === undefined ? {} : { doi }),
    ...(arxivId === undefined ? {} : { arxivId }),
    ...(arxivVersion === undefined ? {} : { arxivVersion }),
    authors,
    ...(year === undefined ? {} : { year }),
    ...(venue === undefined ? {} : { venue }),
    referenceList,
    alternateUrls: paperMetadataAlternateUrls(input.sourceUrl, doi, arxivId, arxivVersion),
    sourceTrust: paperMetadataSourceTrust({
      metadata: input.metadata,
      inputMetadata: input.inputMetadata,
      extraction: input.extraction,
      doi,
      arxivId,
      referenceList,
    }),
    fields: paperMetadataFieldConfidence({
      explicitAuthors: input.explicitAuthors,
      explicitYear: input.explicitYear,
      explicitDoi: input.explicitDoi,
      explicitVenue: input.explicitVenue,
      explicitReferences: input.explicitReferences,
      explicitArxiv: input.explicitArxiv,
      extraction: input.extraction,
      doi,
      arxivId,
      authors,
      year,
      venue,
      referenceList,
    }),
    remote: {
      status: "disabled",
      reason: "explicit_remote_enrichment_not_configured",
    },
  };
}

function paperMetadataHasSignal(input: {
  metadata: Record<string, unknown>;
  extraction: PaperMetadataExtraction;
  doi?: string;
  arxivId?: string;
  authors: string[];
  venue?: string;
  referenceList: PaperMetadataReferenceEntry[];
}) {
  const sourceType = metadataString(input.metadata, "source_type");
  const paperSource =
    metadataString(input.metadata, "paper_source") ??
    metadataString(input.metadata, "source_provider");
  return (
    sourceType === "paper" ||
    sourceType === "arxiv" ||
    paperSource === "arxiv" ||
    input.extraction.isArxiv ||
    input.doi !== undefined ||
    input.arxivId !== undefined ||
    input.venue !== undefined ||
    input.referenceList.length > 0 ||
    (input.authors.length > 0 &&
      (input.extraction.abstract !== undefined || input.extraction.title !== undefined))
  );
}

function paperMetadataAlternateUrls(
  sourceUrl: string,
  doi: string | undefined,
  arxivId: string | undefined,
  arxivVersion: string | undefined,
) {
  const urls = new Set<string>();
  const normalizedSourceUrl = normalizeText(sourceUrl);
  if (normalizedSourceUrl.length > 0) urls.add(normalizedSourceUrl);
  if (doi !== undefined) urls.add(`https://doi.org/${doi}`);
  if (arxivId !== undefined) {
    const versionedId = `${arxivId}${arxivVersion ?? ""}`;
    urls.add(`https://arxiv.org/abs/${versionedId}`);
    urls.add(`https://arxiv.org/pdf/${versionedId}.pdf`);
  }
  return Array.from(urls).slice(0, 12);
}

function paperMetadataSourceTrust(input: {
  metadata: Record<string, unknown>;
  inputMetadata: Record<string, unknown>;
  extraction: PaperMetadataExtraction;
  doi?: string;
  arxivId?: string;
  referenceList: PaperMetadataReferenceEntry[];
}): PaperMetadataSourceTrust {
  if (
    input.arxivId !== undefined ||
    input.doi !== undefined ||
    metadataString(input.inputMetadata, "source_adapter") === "arxiv" ||
    metadataString(input.metadata, "paper_source") === "arxiv"
  ) {
    return "high";
  }
  if (input.extraction.title !== undefined || input.referenceList.length > 0) return "medium";
  return "low";
}

function paperMetadataFieldConfidence(input: {
  explicitAuthors: string[];
  explicitYear?: number;
  explicitDoi?: string;
  explicitVenue?: string;
  explicitReferences: PaperMetadataReferenceEntry[];
  explicitArxiv: ArxivParseResult;
  extraction: PaperMetadataExtraction;
  doi?: string;
  arxivId?: string;
  authors: string[];
  year?: number;
  venue?: string;
  referenceList: PaperMetadataReferenceEntry[];
}) {
  const fields: Record<string, PaperMetadataFieldConfidence> = {};
  const set = (key: string, source: string, confidence: number) => {
    fields[key] = { source, confidence };
  };
  if (input.doi !== undefined)
    set(
      "doi",
      input.explicitDoi !== undefined ? "payload" : "text",
      input.explicitDoi !== undefined ? 0.98 : 0.8,
    );
  if (input.arxivId !== undefined) {
    set(
      "arxivId",
      input.explicitArxiv.arxivId !== undefined ? "payload" : "url_or_text",
      input.explicitArxiv.arxivId !== undefined ? 0.98 : 0.9,
    );
  }
  if (
    input.explicitArxiv.arxivVersion !== undefined ||
    input.extraction.arxivVersion !== undefined
  ) {
    set(
      "arxivVersion",
      input.explicitArxiv.arxivVersion !== undefined ? "payload" : "url_or_text",
      input.explicitArxiv.arxivVersion !== undefined ? 0.98 : 0.9,
    );
  }
  if (input.authors.length > 0)
    set(
      "authors",
      input.explicitAuthors.length > 0 ? "payload" : "text",
      input.explicitAuthors.length > 0 ? 0.96 : 0.74,
    );
  if (input.year !== undefined)
    set(
      "year",
      input.explicitYear !== undefined ? "payload" : "url_or_text",
      input.explicitYear !== undefined ? 0.96 : 0.78,
    );
  if (input.venue !== undefined)
    set(
      "venue",
      input.explicitVenue !== undefined ? "payload" : "text",
      input.explicitVenue !== undefined ? 0.94 : 0.72,
    );
  if (input.referenceList.length > 0)
    set(
      "referenceList",
      input.explicitReferences.length > 0 ? "payload_or_parser" : "text",
      input.explicitReferences.length > 0 ? 0.9 : 0.68,
    );
  return fields;
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

function updateSourceMetadataJson(
  db: SqliteDb,
  sourceId: string,
  updater: (metadata: Record<string, unknown>) => Record<string, unknown>,
) {
  const row = db.selectObject(
    `SELECT metadata_json
     FROM source_metadata
     WHERE source_id = ?
     LIMIT 1`,
    [sourceId],
  );
  if (row === undefined) return;
  const metadata = updater(parseMetadata(stringField(row, "metadata_json")));
  const metadataJson = safeJsonObjectString(JSON.stringify(metadata));
  const abstract = stringMetadataField(metadata, "abstract");
  const authorsJson = JSON.stringify(stringArrayMetadataField(metadata, "authors"));
  const sectionOutlineJson = JSON.stringify(
    Array.isArray(metadata.sectionOutline) ? metadata.sectionOutline.slice(0, 200) : [],
  );
  db.exec({
    sql: `UPDATE source_metadata
          SET metadata_json = ?,
              section_outline_json = ?,
              abstract = ?,
              authors_json = ?,
              updated_at = ?
          WHERE source_id = ?`,
    bind: [
      metadataJson,
      sectionOutlineJson,
      abstract,
      authorsJson,
      new Date().toISOString(),
      sourceId,
    ],
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

function recoverStaleOrchestrationRuns(db: SqliteDb) {
  const now = new Date().toISOString();
  transaction(db, () => {
    db.exec({
      sql: `UPDATE orchestration_runs
            SET status = 'cancelled',
                updated_at = ?,
                finished_at = ?,
                last_error = NULL
            WHERE status = 'running'
              AND cancel_requested <> 0`,
      bind: [now, now],
    });
    db.exec({
      sql: `UPDATE orchestration_runs
            SET status = 'queued',
                started_at = NULL,
                updated_at = ?,
                last_error = COALESCE(last_error, 'Orchestration was running when the engine stopped.')
            WHERE status = 'running'
              AND cancel_requested = 0`,
      bind: [now],
    });
  });
}

function recoverStaleSourceContextMapRuns(db: SqliteDb) {
  const now = new Date().toISOString();
  transaction(db, () => {
    db.exec({
      sql: `UPDATE source_context_map_steps
            SET status = 'queued',
                claimed_at = NULL,
                updated_at = ?
            WHERE status = 'running'`,
      bind: [now],
    });
    db.exec({
      sql: `UPDATE source_context_map_runs
            SET status = 'cancelled',
                updated_at = ?,
                finished_at = ?,
                last_error = NULL
            WHERE status IN ('running', 'reducing')
              AND cancel_requested <> 0`,
      bind: [now, now],
    });
    db.exec({
      sql: `UPDATE source_context_map_runs
            SET status = 'queued',
                started_at = NULL,
                updated_at = ?,
                last_error = COALESCE(last_error, 'Source context map run was active when the engine stopped.')
            WHERE status IN ('running', 'reducing')
              AND cancel_requested = 0`,
      bind: [now],
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

function getActiveEmbeddingProvider(
  db: SqliteDb,
  embeddingProviderOverride?: EmbeddingProvider,
  embeddingProviderFactory?: EmbeddingProviderFactory,
): EmbeddingProvider | null {
  const row = getActiveEmbeddingModelRow(db);
  if (row === undefined) return null;
  const modelId = stringField(row, "id");
  const provider = stringField(row, "provider");
  const dimension = numberField(row, "dimension");
  return resolveEmbeddingProviderForModel(
    { modelId, provider, dimension },
    embeddingProviderOverride,
    embeddingProviderFactory,
  );
}

function getActiveEmbeddingModelRow(db: SqliteDb) {
  return db.selectObject(
    `SELECT *
     FROM embedding_models
     WHERE status = 'active'
       AND metric = 'cosine'
     ORDER BY updated_at DESC
     LIMIT 1`,
  );
}

function activeEmbeddingModelSummaryFromRow(row: SqlRow): ActiveEmbeddingModelSummary {
  return {
    id: stringField(row, "id"),
    provider: stringField(row, "provider"),
    label: stringField(row, "label"),
    dimension: numberField(row, "dimension"),
    metric: "cosine",
    status: "active",
    updatedAt: stringField(row, "updated_at"),
  };
}

function resolveEmbeddingProviderForModel(
  model: ActiveEmbeddingModel,
  embeddingProviderOverride?: EmbeddingProvider,
  embeddingProviderFactory?: EmbeddingProviderFactory,
): EmbeddingProvider | null {
  if (embeddingProviderOverride !== undefined) {
    if (
      model.modelId === embeddingProviderOverride.modelId &&
      model.provider === embeddingProviderOverride.provider &&
      model.dimension === embeddingProviderOverride.dimension
    ) {
      return embeddingProviderOverride;
    }
  }
  if (
    model.modelId === defaultEmbeddingProvider.modelId &&
    model.provider === defaultEmbeddingProvider.provider &&
    model.dimension === defaultEmbeddingProvider.dimension
  ) {
    return localDeterministicEmbeddingProvider;
  }
  return embeddingProviderFactory?.(model) ?? null;
}

const localDeterministicEmbeddingProvider: EmbeddingProvider = {
  modelId: defaultEmbeddingProvider.modelId,
  provider: defaultEmbeddingProvider.provider,
  dimension: defaultEmbeddingProvider.dimension,
  async embedTexts(inputs: string[]) {
    return inputs.map((input) =>
      embedLocalDeterministic(input, defaultEmbeddingProvider.dimension),
    );
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

function createOrchestrationRun(
  db: SqliteDb,
  payload: CreateOrchestrationRunPayload,
  retryOfRunId?: string,
): OrchestrationRunSummary {
  if (payload.kind !== "post_capture_job") {
    throw new EngineRpcError("INVALID_ORCHESTRATION_KIND", "Unsupported orchestration kind.");
  }
  const targetJobId = normalizeText(payload.targetJobId);
  const job = db.selectObject("SELECT * FROM jobs WHERE id = ? LIMIT 1", [targetJobId]);
  if (job === undefined) {
    throw new EngineRpcError("JOB_NOT_FOUND", `Job not found: ${targetJobId}`);
  }
  const jobType = jobTypeField(job, "type");
  if (jobType !== "post_capture_hardening") {
    throw new EngineRpcError(
      "INVALID_ORCHESTRATION_TARGET",
      `Orchestration target must be a post-capture job: ${targetJobId}`,
    );
  }

  const id = normalizeText(payload.id ?? "") || createId("orch");
  const now = new Date().toISOString();
  transaction(db, () => {
    db.exec({
      sql: `INSERT INTO orchestration_runs (
        id,
        kind,
        status,
        target_job_id,
        progress_current,
        progress_total,
        cancel_requested,
        retry_of_run_id,
        created_at,
        updated_at
      ) VALUES (?, ?, 'queued', ?, 0, 1, 0, ?, ?, ?)`,
      bind: [id, payload.kind, targetJobId, retryOfRunId ?? null, now, now],
    });
    insertOrchestrationEvent(db, {
      runId: id,
      kind: "queued",
      level: "info",
      message: "Orchestration run queued.",
      detail: { targetJobId, retryOfRunId },
      createdAt: now,
    });
  });
  return loadOrchestrationRunOrThrow(db, id);
}

async function runOrchestration(
  db: SqliteDb,
  runIdInput: string,
  embeddingProviderOverride?: EmbeddingProvider,
  embeddingProviderFactory?: EmbeddingProviderFactory,
  chunkMetaSummarizerFactory?: ChunkMetaSummarizerFactory,
  figureVisionAnalyzerFactory?: FigureVisionAnalyzerFactory,
  pdfRawFileStore?: PdfRawFileStore,
  pdfFigureVisionImageExtractor: PdfFigureVisionImageExtractor = extractPdfFigureVisionImageInput,
): Promise<OrchestrationRunSummary> {
  const runId = normalizeText(runIdInput);
  const existing = loadOrchestrationRunOrThrow(db, runId);
  if (isTerminalOrchestrationStatus(existing.status)) return existing;
  if (existing.cancelRequested) {
    return finishCancelledOrchestrationRun(db, runId, "Cancelled before orchestration start.");
  }
  if (existing.status !== "queued") return existing;

  const claimedAt = new Date().toISOString();
  db.exec({
    sql: `UPDATE orchestration_runs
          SET status = 'running',
              progress_current = 0,
              progress_total = 1,
              started_at = COALESCE(started_at, ?),
              updated_at = ?
          WHERE id = ?
            AND status = 'queued'
            AND cancel_requested = 0`,
    bind: [claimedAt, claimedAt, runId],
  });
  if (Number(db.selectValue("SELECT changes()") ?? 0) === 0) {
    return loadOrchestrationRunOrThrow(db, runId);
  }
  insertOrchestrationEvent(db, {
    runId,
    kind: "claimed",
    level: "info",
    message: "Orchestration run claimed.",
    detail: { targetJobId: existing.targetJobId },
    createdAt: claimedAt,
  });
  insertOrchestrationEvent(db, {
    runId,
    kind: "job_started",
    level: "info",
    message: "Wrapped job execution started.",
    detail: { targetJobId: existing.targetJobId },
  });

  try {
    const job = await runJob(
      db,
      existing.targetJobId,
      embeddingProviderOverride,
      embeddingProviderFactory,
      chunkMetaSummarizerFactory,
      figureVisionAnalyzerFactory,
      pdfRawFileStore,
      pdfFigureVisionImageExtractor,
    );
    const afterJob = loadOrchestrationRunOrThrow(db, runId);
    if (afterJob.cancelRequested) {
      return finishCancelledOrchestrationRun(
        db,
        runId,
        "Cancelled after the current orchestration boundary.",
      );
    }
    if (job.status === "done") {
      const finishedAt = new Date().toISOString();
      db.exec({
        sql: `UPDATE orchestration_runs
              SET status = 'done',
                  progress_current = 1,
                  progress_total = 1,
                  updated_at = ?,
                  finished_at = ?,
                  last_error = NULL
              WHERE id = ?`,
        bind: [finishedAt, finishedAt, runId],
      });
      insertOrchestrationEvent(db, {
        runId,
        kind: "job_completed",
        level: "info",
        message: "Wrapped job completed.",
        detail: { targetJobId: job.id, jobStatus: job.status },
        createdAt: finishedAt,
      });
      insertOrchestrationEvent(db, {
        runId,
        kind: "progress",
        level: "info",
        message: "Progress 1/1.",
        detail: { progressCurrent: 1, progressTotal: 1 },
        createdAt: finishedAt,
      });
      return loadOrchestrationRunOrThrow(db, runId);
    }

    return failOrchestrationRun(
      db,
      runId,
      job.lastError ?? `Wrapped job ended with status: ${job.status}`,
      { targetJobId: job.id, jobStatus: job.status },
    );
  } catch (error) {
    const engineError = engineErrorFromUnknown(error);
    return failOrchestrationRun(db, runId, engineError.message, {
      code: engineError.code,
      targetJobId: existing.targetJobId,
    });
  }
}

function cancelOrchestrationRun(db: SqliteDb, runIdInput: string): OrchestrationRunSummary {
  const runId = normalizeText(runIdInput);
  const run = loadOrchestrationRunOrThrow(db, runId);
  if (isTerminalOrchestrationStatus(run.status)) return run;
  const now = new Date().toISOString();
  insertOrchestrationEvent(db, {
    runId,
    kind: "cancel_requested",
    level: "warning",
    message:
      run.status === "running"
        ? "Cancellation requested; it will resolve at the next orchestration boundary."
        : "Cancellation requested before execution.",
    detail: { status: run.status, targetJobId: run.targetJobId },
    createdAt: now,
  });
  if (run.status === "running") {
    db.exec({
      sql: `UPDATE orchestration_runs
            SET cancel_requested = 1,
                updated_at = ?
            WHERE id = ?`,
      bind: [now, runId],
    });
    return loadOrchestrationRunOrThrow(db, runId);
  }
  return finishCancelledOrchestrationRun(db, runId, "Cancelled before orchestration start.", now);
}

function retryOrchestrationRun(db: SqliteDb, runIdInput: string): OrchestrationRunSummary {
  const runId = normalizeText(runIdInput);
  const run = loadOrchestrationRunOrThrow(db, runId);
  if (run.status !== "failed" && run.status !== "cancelled") {
    throw new EngineRpcError(
      "ORCHESTRATION_RETRY_NOT_ALLOWED",
      `Only failed or cancelled orchestration runs can be retried: ${runId}`,
    );
  }
  const targetJobId = retryTargetJobId(db, run.targetJobId);
  const replacement = createOrchestrationRun(
    db,
    {
      kind: run.kind,
      targetJobId,
    },
    run.id,
  );
  insertOrchestrationEvent(db, {
    runId,
    kind: "retry_created",
    level: "info",
    message: "Retry orchestration run created.",
    detail: { retryRunId: replacement.id, targetJobId },
  });
  return replacement;
}

function retryTargetJobId(db: SqliteDb, jobId: string) {
  const job = db.selectObject("SELECT * FROM jobs WHERE id = ? LIMIT 1", [jobId]);
  if (job === undefined) {
    throw new EngineRpcError("JOB_NOT_FOUND", `Job not found: ${jobId}`);
  }
  if (jobStatusField(job, "status") === "queued") return jobId;
  const jobType = jobTypeField(job, "type");
  if (jobType !== "post_capture_hardening") {
    throw new EngineRpcError(
      "INVALID_ORCHESTRATION_TARGET",
      `Retry target must be a post-capture job: ${jobId}`,
    );
  }
  return enqueueJob(db, jobType, parseMetadata(stringField(job, "payload_json")));
}

function failOrchestrationRun(
  db: SqliteDb,
  runId: string,
  message: string,
  detail: Record<string, unknown> = {},
): OrchestrationRunSummary {
  const now = new Date().toISOString();
  const lastError = boundedNormalizedText(message, 1_000);
  db.exec({
    sql: `UPDATE orchestration_runs
          SET status = 'failed',
              updated_at = ?,
              finished_at = ?,
              last_error = ?
          WHERE id = ?`,
    bind: [now, now, lastError, runId],
  });
  insertOrchestrationEvent(db, {
    runId,
    kind: "failed",
    level: "error",
    message: lastError,
    detail,
    createdAt: now,
  });
  return loadOrchestrationRunOrThrow(db, runId);
}

function finishCancelledOrchestrationRun(
  db: SqliteDb,
  runId: string,
  message: string,
  now = new Date().toISOString(),
): OrchestrationRunSummary {
  db.exec({
    sql: `UPDATE orchestration_runs
          SET status = 'cancelled',
              cancel_requested = 1,
              updated_at = ?,
              finished_at = ?,
              last_error = NULL
          WHERE id = ?`,
    bind: [now, now, runId],
  });
  insertOrchestrationEvent(db, {
    runId,
    kind: "cancelled",
    level: "warning",
    message,
    detail: {},
    createdAt: now,
  });
  return loadOrchestrationRunOrThrow(db, runId);
}

function createOrResumeSourceContextMapRun(
  db: SqliteDb,
  payload: CreateOrResumeSourceContextMapRunPayload,
): SourceContextMapRunDetail {
  const ownerRunId = normalizeText(payload.ownerRunId);
  const planSignature = normalizeText(payload.planSignature).slice(0, 512);
  if (ownerRunId.length === 0 || planSignature.length === 0) {
    throw new EngineRpcError("INVALID_SOURCE_CONTEXT_MAP_RUN", "Map run requires a plan.");
  }
  if (payload.sessionId !== undefined) assertChatSessionExists(db, payload.sessionId);

  const steps = normalizeSourceContextMapStepPlans(payload.steps);
  if (steps.length === 0) {
    throw new EngineRpcError("INVALID_SOURCE_CONTEXT_MAP_RUN", "Map run requires steps.");
  }

  const existing = db.selectObject(
    `SELECT *
     FROM source_context_map_runs
     WHERE owner_run_id = ?
       AND plan_signature = ?
       AND status NOT IN ('failed', 'cancelled')
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [ownerRunId, planSignature],
  );
  if (existing !== undefined) {
    reconcileSourceContextMapRunSteps(db, stringField(existing, "id"), steps);
    return loadSourceContextMapRunDetailOrThrow(db, stringField(existing, "id"));
  }

  const id = normalizeText(payload.id ?? "") || createId("sctx_map_run");
  const now = payload.createdAt ?? new Date().toISOString();
  const sourceIds = sourceContextMapPlanSourceIds(steps);
  const maxConcurrentMaps = normalizeSourceContextMaxConcurrentMaps(payload.maxConcurrentMaps);
  transaction(db, () => {
    db.exec({
      sql: `INSERT INTO source_context_map_runs (
        id,
        session_id,
        owner_run_id,
        mode,
        status,
        plan_signature,
        source_ids_json,
        max_concurrent_maps,
        progress_current,
        progress_total,
        cancel_requested,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, 0, ?, 0, ?, ?)`,
      bind: [
        id,
        payload.sessionId ?? null,
        ownerRunId,
        payload.mode ?? null,
        planSignature,
        JSON.stringify(sourceIds),
        maxConcurrentMaps,
        steps.length,
        now,
        now,
      ],
    });
    for (const step of steps) insertSourceContextMapStep(db, id, step, now);
    insertSourceContextMapEvent(db, {
      runId: id,
      kind: "queued",
      message: "Source context map run queued.",
      detail: { ownerRunId, stepCount: steps.length, maxConcurrentMaps },
      createdAt: now,
    });
  });
  return loadSourceContextMapRunDetailOrThrow(db, id);
}

function reconcileSourceContextMapRunSteps(
  db: SqliteDb,
  runId: string,
  steps: SourceContextMapStepPlan[],
) {
  const now = new Date().toISOString();
  for (const step of steps) {
    const existing = db.selectObject(
      "SELECT * FROM source_context_map_steps WHERE run_id = ? AND group_index = ? LIMIT 1",
      [runId, step.groupIndex],
    );
    if (existing === undefined) {
      insertSourceContextMapStep(db, runId, step, now);
      continue;
    }
    if (stringField(existing, "step_signature") !== step.stepSignature) {
      throw new EngineRpcError(
        "SOURCE_CONTEXT_MAP_PLAN_MISMATCH",
        `Map step signature changed for group ${step.groupIndex}.`,
      );
    }
  }
  refreshSourceContextMapRunProgress(db, runId, now);
}

function insertSourceContextMapStep(
  db: SqliteDb,
  runId: string,
  step: SourceContextMapStepPlan,
  createdAt: string,
) {
  db.exec({
    sql: `INSERT INTO source_context_map_steps (
      id,
      run_id,
      group_id,
      group_index,
      status,
      step_signature,
      source_ids_json,
      window_refs_json,
      evidence_ids_json,
      token_estimate,
      input_summary,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [
      createId("sctx_map_step"),
      runId,
      step.groupId,
      step.groupIndex,
      step.stepSignature,
      JSON.stringify(step.sourceIds),
      JSON.stringify(step.windowRefs),
      JSON.stringify(step.evidenceIds),
      finiteNumberOrNull(step.tokenEstimate),
      normalizeOptionalArtifactText(step.inputSummary, 2_000) ?? "",
      createdAt,
      createdAt,
    ],
  });
}

function claimSourceContextMapStep(
  db: SqliteDb,
  runIdInput: string,
  nowInput?: string,
): SourceContextMapClaimStepResult {
  const runId = normalizeText(runIdInput);
  const run = loadSourceContextMapRunOrThrow(db, runId);
  if (isTerminalSourceContextMapRunStatus(run.status)) return { run };
  if (run.cancelRequested) {
    return {
      run: finishCancelledSourceContextMapRun(db, runId, "Cancelled before next map step."),
    };
  }

  const step = db.selectObject(
    `SELECT *
     FROM source_context_map_steps
     WHERE run_id = ?
       AND status = 'queued'
     ORDER BY group_index ASC
     LIMIT 1`,
    [runId],
  );
  if (step === undefined) {
    return { run: refreshSourceContextMapRunProgress(db, runId) };
  }

  const now = nowInput ?? new Date().toISOString();
  const stepId = stringField(step, "id");
  db.exec({
    sql: `UPDATE source_context_map_steps
          SET status = 'running',
              attempt_count = attempt_count + 1,
              claimed_at = ?,
              updated_at = ?,
              error_code = NULL,
              error_message = NULL
          WHERE id = ?
            AND status = 'queued'`,
    bind: [now, now, stepId],
  });
  if (Number(db.selectValue("SELECT changes()") ?? 0) === 0) {
    return { run: loadSourceContextMapRunOrThrow(db, runId) };
  }
  db.exec({
    sql: `UPDATE source_context_map_runs
          SET status = 'running',
              started_at = COALESCE(started_at, ?),
              updated_at = ?
          WHERE id = ?
            AND status IN ('queued', 'running')`,
    bind: [now, now, runId],
  });
  insertSourceContextMapEvent(db, {
    runId,
    stepId,
    kind: "step_claimed",
    message: "Map step claimed.",
    detail: {
      groupIndex: numberField(step, "group_index"),
      groupId: stringField(step, "group_id"),
    },
    createdAt: now,
  });
  return {
    run: refreshSourceContextMapRunProgress(db, runId, now),
    step: loadSourceContextMapStepOrThrow(db, stepId),
  };
}

function completeSourceContextMapStep(
  db: SqliteDb,
  payload: CompleteSourceContextMapStepPayload,
): SourceContextMapStepRecord {
  const stepId = normalizeText(payload.stepId);
  const step = loadSourceContextMapStepOrThrow(db, stepId);
  const runId = step.runId;
  const now = payload.completedAt ?? new Date().toISOString();
  db.exec({
    sql: `UPDATE source_context_map_steps
          SET status = 'completed',
              output_summary = ?,
              artifact_id = ?,
              error_code = NULL,
              error_message = NULL,
              completed_at = ?,
              updated_at = ?
          WHERE id = ?`,
    bind: [
      boundedNormalizedText(payload.outputSummary, 2_000),
      normalizeOptionalAuditId(payload.artifactId) ?? null,
      now,
      now,
      stepId,
    ],
  });
  insertSourceContextMapEvent(db, {
    runId,
    stepId,
    kind: "step_completed",
    message: "Map step completed.",
    detail: { groupIndex: step.groupIndex, groupId: step.groupId },
    createdAt: now,
  });
  const run = refreshSourceContextMapRunProgress(db, runId, now);
  if (run.cancelRequested) {
    finishCancelledSourceContextMapRun(db, runId, "Cancelled after the current map step.", now);
  }
  return loadSourceContextMapStepOrThrow(db, stepId);
}

function failSourceContextMapStep(
  db: SqliteDb,
  payload: FailSourceContextMapStepPayload,
): SourceContextMapStepRecord {
  const stepId = normalizeText(payload.stepId);
  const step = loadSourceContextMapStepOrThrow(db, stepId);
  const now = payload.failedAt ?? new Date().toISOString();
  const errorMessage = boundedNormalizedText(payload.errorMessage, 1_000);
  db.exec({
    sql: `UPDATE source_context_map_steps
          SET status = 'failed',
              error_code = ?,
              error_message = ?,
              updated_at = ?
          WHERE id = ?`,
    bind: [normalizeOptionalAuditId(payload.errorCode) ?? null, errorMessage, now, stepId],
  });
  db.exec({
    sql: `UPDATE source_context_map_runs
          SET status = 'failed',
              last_error = ?,
              updated_at = ?,
              finished_at = ?
          WHERE id = ?`,
    bind: [errorMessage, now, now, step.runId],
  });
  insertSourceContextMapEvent(db, {
    runId: step.runId,
    stepId,
    kind: "step_failed",
    level: "error",
    message: errorMessage,
    detail: { groupIndex: step.groupIndex, groupId: step.groupId, errorCode: payload.errorCode },
    createdAt: now,
  });
  refreshSourceContextMapRunProgress(db, step.runId, now);
  return loadSourceContextMapStepOrThrow(db, stepId);
}

function cancelSourceContextMapRun(db: SqliteDb, runIdInput: string): SourceContextMapRunSummary {
  const runId = normalizeText(runIdInput);
  const run = loadSourceContextMapRunOrThrow(db, runId);
  if (isTerminalSourceContextMapRunStatus(run.status)) return run;
  const now = new Date().toISOString();
  insertSourceContextMapEvent(db, {
    runId,
    kind: "cancel_requested",
    level: "warning",
    message:
      run.status === "running" || run.status === "reducing"
        ? "Cancellation requested; active provider work resolves at the next boundary."
        : "Cancellation requested before map execution.",
    detail: { status: run.status },
    createdAt: now,
  });
  db.exec({
    sql: `UPDATE source_context_map_steps
          SET status = 'cancelled',
              updated_at = ?
          WHERE run_id = ?
            AND status IN ('queued', 'failed')`,
    bind: [now, runId],
  });
  const runningStepCount = Number(
    db.selectValue(
      "SELECT COUNT(*) FROM source_context_map_steps WHERE run_id = ? AND status = 'running'",
      [runId],
    ) ?? 0,
  );
  if (runningStepCount > 0 || run.status === "reducing") {
    db.exec({
      sql: `UPDATE source_context_map_runs
            SET cancel_requested = 1,
                updated_at = ?
            WHERE id = ?`,
      bind: [now, runId],
    });
    return refreshSourceContextMapRunProgress(db, runId, now);
  }
  return finishCancelledSourceContextMapRun(db, runId, "Cancelled before map execution.", now);
}

function resumeSourceContextMapRun(db: SqliteDb, runIdInput: string): SourceContextMapRunSummary {
  const runId = normalizeText(runIdInput);
  const run = loadSourceContextMapRunOrThrow(db, runId);
  if (run.status === "done" || run.status === "running" || run.status === "reducing") return run;
  const now = new Date().toISOString();
  transaction(db, () => {
    db.exec({
      sql: `UPDATE source_context_map_steps
            SET status = 'queued',
                error_code = NULL,
                error_message = NULL,
                updated_at = ?
            WHERE run_id = ?
              AND status IN ('failed', 'cancelled')`,
      bind: [now, runId],
    });
    db.exec({
      sql: `UPDATE source_context_map_runs
            SET status = 'queued',
                cancel_requested = 0,
                last_error = NULL,
                finished_at = NULL,
                updated_at = ?
            WHERE id = ?`,
      bind: [now, runId],
    });
    insertSourceContextMapEvent(db, {
      runId,
      kind: "resumed",
      message: "Source context map run marked resumable.",
      detail: {},
      createdAt: now,
    });
  });
  return refreshSourceContextMapRunProgress(db, runId, now);
}

function retrySourceContextMapRun(db: SqliteDb, runIdInput: string): SourceContextMapRunSummary {
  const runId = normalizeText(runIdInput);
  const run = loadSourceContextMapRunOrThrow(db, runId);
  if (run.status !== "failed" && run.status !== "cancelled") {
    throw new EngineRpcError(
      "SOURCE_CONTEXT_MAP_RETRY_NOT_ALLOWED",
      `Only failed or cancelled source context map runs can be retried: ${runId}`,
    );
  }
  const now = new Date().toISOString();
  const retryId = createId("sctx_map_run");
  const steps = loadSourceContextMapRunSteps(db, runId);
  transaction(db, () => {
    db.exec({
      sql: `INSERT INTO source_context_map_runs (
        id,
        session_id,
        owner_run_id,
        mode,
        status,
        plan_signature,
        source_ids_json,
        max_concurrent_maps,
        progress_current,
        progress_total,
        cancel_requested,
        retry_of_run_id,
        created_at,
        updated_at
      )
      SELECT ?, session_id, owner_run_id, mode, 'queued', plan_signature, source_ids_json,
             max_concurrent_maps, 0, progress_total, 0, id, ?, ?
      FROM source_context_map_runs
      WHERE id = ?`,
      bind: [retryId, now, now, runId],
    });
    for (const step of steps) {
      insertSourceContextMapStep(db, retryId, step, now);
    }
    insertSourceContextMapEvent(db, {
      runId: retryId,
      kind: "queued",
      message: "Source context map retry queued.",
      detail: { retryOfRunId: runId },
      createdAt: now,
    });
    insertSourceContextMapEvent(db, {
      runId,
      kind: "retry_created",
      message: "Retry source context map run created.",
      detail: { retryRunId: retryId },
      createdAt: now,
    });
  });
  return loadSourceContextMapRunOrThrow(db, retryId);
}

function markSourceContextMapReduceStarted(
  db: SqliteDb,
  payload: MarkSourceContextMapReduceStartedPayload,
): SourceContextMapRunSummary {
  const runId = normalizeText(payload.runId);
  const run = loadSourceContextMapRunOrThrow(db, runId);
  if (isTerminalSourceContextMapRunStatus(run.status)) return run;
  if (run.cancelRequested) {
    return finishCancelledSourceContextMapRun(db, runId, "Cancelled before reduce.");
  }
  const now = payload.startedAt ?? new Date().toISOString();
  const artifactIds = boundedArtifactStrings(payload.mapArtifactIds, 100);
  db.exec({
    sql: `UPDATE source_context_map_runs
          SET status = 'reducing',
              progress_current = progress_total,
              reduce_map_artifact_ids_json = ?,
              reduce_input_summary = ?,
              updated_at = ?
          WHERE id = ?`,
    bind: [
      JSON.stringify(artifactIds),
      normalizeOptionalArtifactText(payload.inputSummary, 2_000) ?? "",
      now,
      runId,
    ],
  });
  insertSourceContextMapEvent(db, {
    runId,
    kind: "reduce_started",
    message: "Source context reduce started.",
    detail: { mapArtifactCount: artifactIds.length, tokenEstimate: payload.tokenEstimate ?? 0 },
    createdAt: now,
  });
  return loadSourceContextMapRunOrThrow(db, runId);
}

function markSourceContextMapReduceCompleted(
  db: SqliteDb,
  payload: MarkSourceContextMapReduceCompletedPayload,
): SourceContextMapRunSummary {
  const runId = normalizeText(payload.runId);
  const now = payload.completedAt ?? new Date().toISOString();
  db.exec({
    sql: `UPDATE source_context_map_runs
          SET status = 'done',
              cancel_requested = 0,
              progress_current = progress_total,
              reduce_output_summary = ?,
              reduce_artifact_id = ?,
              last_error = NULL,
              updated_at = ?,
              finished_at = ?
          WHERE id = ?`,
    bind: [
      normalizeOptionalArtifactText(payload.outputSummary, 2_000) ?? "",
      normalizeOptionalAuditId(payload.artifactId) ?? null,
      now,
      now,
      runId,
    ],
  });
  insertSourceContextMapEvent(db, {
    runId,
    kind: "reduce_completed",
    message: "Source context reduce completed.",
    detail: { artifactId: payload.artifactId },
    createdAt: now,
  });
  return loadSourceContextMapRunOrThrow(db, runId);
}

function markSourceContextMapReduceFailed(
  db: SqliteDb,
  payload: MarkSourceContextMapReduceFailedPayload,
): SourceContextMapRunSummary {
  const runId = normalizeText(payload.runId);
  const now = payload.failedAt ?? new Date().toISOString();
  const message = boundedNormalizedText(payload.errorMessage, 1_000);
  db.exec({
    sql: `UPDATE source_context_map_runs
          SET status = 'failed',
              last_error = ?,
              updated_at = ?,
              finished_at = ?
          WHERE id = ?`,
    bind: [message, now, now, runId],
  });
  insertSourceContextMapEvent(db, {
    runId,
    kind: "reduce_failed",
    level: "error",
    message,
    detail: { errorCode: payload.errorCode },
    createdAt: now,
  });
  return loadSourceContextMapRunOrThrow(db, runId);
}

async function runJob(
  db: SqliteDb,
  jobId: string,
  embeddingProviderOverride?: EmbeddingProvider,
  embeddingProviderFactory?: EmbeddingProviderFactory,
  chunkMetaSummarizerFactory?: ChunkMetaSummarizerFactory,
  figureVisionAnalyzerFactory?: FigureVisionAnalyzerFactory,
  pdfRawFileStore?: PdfRawFileStore,
  pdfFigureVisionImageExtractor: PdfFigureVisionImageExtractor = extractPdfFigureVisionImageInput,
): Promise<JobSummary> {
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
    } else if (type === "reindex_embeddings") {
      result = await runEmbeddingReindexJob(
        db,
        stringField(job, "payload_json"),
        embeddingProviderOverride,
        embeddingProviderFactory,
      );
    } else if (type === "post_capture_hardening") {
      result = await runPostCaptureHardeningJob(
        db,
        stringField(job, "payload_json"),
        jobId,
        embeddingProviderOverride,
        embeddingProviderFactory,
        chunkMetaSummarizerFactory,
        figureVisionAnalyzerFactory,
        pdfRawFileStore,
        pdfFigureVisionImageExtractor,
      );
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
         AND c.role = 'child'
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

async function runEmbeddingReindexJob(
  db: SqliteDb,
  payloadJson: string,
  embeddingProviderOverride?: EmbeddingProvider,
  embeddingProviderFactory?: EmbeddingProviderFactory,
): Promise<Record<string, unknown>> {
  const payload = parseEmbeddingReindexPayload(payloadJson);
  const provider = resolveEmbeddingProviderForModel(
    {
      modelId: payload.model.id,
      provider: payload.model.provider,
      dimension: payload.model.dimension,
    },
    embeddingProviderOverride,
    embeddingProviderFactory,
  );
  if (provider === null) {
    throw new EngineRpcError(
      "EMBEDDING_MODEL_UNAVAILABLE",
      "Requested embedding model is unavailable.",
    );
  }

  upsertEmbeddingModel(db, payload.model, "disabled");
  db.exec({
    sql: "DELETE FROM source_embeddings WHERE model_id = ?",
    bind: [payload.model.id],
  });

  const sources = db.selectObjects(
    `SELECT id
     FROM sources
     WHERE lifecycle_status <> 'deleted'
     ORDER BY captured_at ASC, id ASC`,
  );
  for (const source of sources) {
    await runEmbeddingStageForSourceWithProvider(db, stringField(source, "id"), provider);
  }

  activateEmbeddingModel(db, payload.model.id);
  const chunkCount = countEmbeddingsForModel(db, payload.model.id, "chunk");
  const metaCount = countEmbeddingsForModel(db, payload.model.id, "meta");
  return {
    ok: true,
    scope: "embeddings",
    modelId: payload.model.id,
    provider: payload.model.provider,
    sourceCount: sources.length,
    chunkCount,
    metaCount,
    targetKinds: ["chunk", "meta"],
  };
}

function parseEmbeddingReindexPayload(payloadJson: string): {
  model: EmbeddingReindexModelDescriptor;
  authorizedAt?: string;
} {
  const payload = parseMetadata(payloadJson);
  const model = isRecord(payload.model) ? payload.model : {};
  const id = normalizeText(typeof model.id === "string" ? model.id : "");
  const provider = typeof model.provider === "string" ? model.provider : "";
  const label = normalizeText(typeof model.label === "string" ? model.label : "");
  const dimension = typeof model.dimension === "number" ? model.dimension : Number.NaN;
  if (
    id.length === 0 ||
    (provider !== "openai" && provider !== "openai-compatible") ||
    label.length === 0 ||
    !Number.isInteger(dimension) ||
    dimension <= 0 ||
    model.metric !== "cosine"
  ) {
    throw new EngineRpcError(
      "INVALID_JOB_PAYLOAD",
      "Embedding reindex job is missing a valid model descriptor.",
    );
  }
  return {
    model: {
      id,
      provider,
      label,
      dimension,
      metric: "cosine",
    },
    ...(typeof payload.authorizedAt === "string" ? { authorizedAt: payload.authorizedAt } : {}),
  };
}

function upsertEmbeddingModel(
  db: SqliteDb,
  model: EmbeddingReindexModelDescriptor,
  status: "active" | "disabled",
) {
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      provider = excluded.provider,
      label = excluded.label,
      dimension = excluded.dimension,
      metric = excluded.metric,
      status = excluded.status,
      updated_at = excluded.updated_at`,
    bind: [model.id, model.provider, model.label, model.dimension, model.metric, status, now, now],
  });
}

function activateEmbeddingModel(db: SqliteDb, modelId: string) {
  const now = new Date().toISOString();
  transaction(db, () => {
    db.exec({
      sql: "UPDATE embedding_models SET status = 'disabled', updated_at = ? WHERE id <> ?",
      bind: [now, modelId],
    });
    db.exec({
      sql: "UPDATE embedding_models SET status = 'active', updated_at = ? WHERE id = ?",
      bind: [now, modelId],
    });
  });
}

function countEmbeddingsForModel(db: SqliteDb, modelId: string, targetKind: "chunk" | "meta") {
  return Number(
    db.selectValue(
      "SELECT COUNT(*) FROM source_embeddings WHERE model_id = ? AND target_kind = ?",
      [modelId, targetKind],
    ) ?? 0,
  );
}

async function runPostCaptureHardeningJob(
  db: SqliteDb,
  payloadJson: string,
  jobId: string,
  embeddingProviderOverride?: EmbeddingProvider,
  embeddingProviderFactory?: EmbeddingProviderFactory,
  chunkMetaSummarizerFactory?: ChunkMetaSummarizerFactory,
  figureVisionAnalyzerFactory?: FigureVisionAnalyzerFactory,
  pdfRawFileStore?: PdfRawFileStore,
  pdfFigureVisionImageExtractor: PdfFigureVisionImageExtractor = extractPdfFigureVisionImageInput,
): Promise<Record<string, unknown>> {
  const payload = parsePostCaptureHardeningPayload(payloadJson);
  if (payload.sourceId.length === 0) {
    throw new EngineRpcError("INVALID_JOB_PAYLOAD", "Post-capture job is missing sourceId.");
  }
  const shouldRunPaperMetadata = payload.stages.includes("paper_metadata");
  const shouldRunChunkMeta = payload.stages.includes("chunk_meta");
  const shouldRunEmbedding = payload.stages.length === 0 || payload.stages.includes("embedding");
  const shouldRunGraph = payload.stages.includes("graph");
  const shouldRunFigureVision = payload.stages.includes("figure_vision");

  const paperMetadata = shouldRunPaperMetadata
    ? runPaperMetadataStageForSource(db, payload.sourceId)
    : { skipped: true, reason: "stage_not_requested" };
  const chunkMeta = shouldRunChunkMeta
    ? await runChunkMetaStageForSource(db, payload.sourceId, {
        tier2: payload.chunkMetaTier2,
        jobId,
        summarizerFactory: chunkMetaSummarizerFactory,
      })
    : { skipped: true, reason: "stage_not_requested" };
  const embeddingResult = shouldRunEmbedding
    ? await runEmbeddingStageForSource(
        db,
        payload.sourceId,
        embeddingProviderOverride,
        embeddingProviderFactory,
      )
    : { ok: true, embedding: { skipped: true, reason: "stage_not_requested" } };

  const figureVision = shouldRunFigureVision
    ? await runPdfFigureVisionStageForSource(
        db,
        payload.sourceId,
        pdfRawFileStore,
        figureVisionAnalyzerFactory,
        pdfFigureVisionImageExtractor,
      )
    : { skipped: true, reason: "stage_not_requested" };

  const graph =
    shouldRunGraph && payload.graphBuildMode === "deterministic"
      ? runDeterministicGraphBuildForSource(db, payload.sourceId)
      : shouldRunGraph
        ? { skipped: true, reason: "explicit_build_required" }
        : { skipped: true, reason: "stage_not_requested" };

  return {
    ok: true,
    paperMetadata,
    embedding: embeddingResult.embedding,
    chunkMeta,
    figureVision,
    graph,
  };
}

function parsePostCaptureHardeningPayload(payloadJson: string) {
  const payload = parseMetadata(payloadJson);
  const sourceId = typeof payload.sourceId === "string" ? normalizeText(payload.sourceId) : "";
  const stages = Array.isArray(payload.stages)
    ? payload.stages.flatMap((stage) => (isPostCaptureStageName(stage) ? [stage] : []))
    : [];
  const graphBuildMode = payload.graphBuildMode === "deterministic" ? "deterministic" : undefined;
  const rawChunkMetaTier2 = isRecord(payload.chunkMetaTier2) ? payload.chunkMetaTier2 : undefined;
  const chunkMetaTier2 = {
    enabled: rawChunkMetaTier2?.enabled === true,
    maxChunks: clampChunkMetaTier2MaxChunks(rawChunkMetaTier2?.maxChunks),
  };
  return { sourceId, stages, graphBuildMode, chunkMetaTier2 };
}

function clampChunkMetaTier2MaxChunks(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return defaultChunkMetaTier2MaxChunks;
  return Math.max(0, Math.min(maxChunkMetaTier2MaxChunks, Math.floor(value)));
}

function isPostCaptureStageName(value: unknown): value is PostCaptureStageName {
  return (
    value === "paper_metadata" ||
    value === "embedding" ||
    value === "chunk_meta" ||
    value === "graph" ||
    value === "figure_vision"
  );
}

function runPaperMetadataStageForSource(db: SqliteDb, sourceId: string): Record<string, unknown> {
  const source = db.selectObject(
    `SELECT
       s.id,
       s.source_kind,
       s.source_url,
       s.source_title,
       s.source_type,
       s.lifecycle_status,
       s.normalized_text,
       sm.metadata_json
     FROM sources s
     LEFT JOIN source_metadata sm ON sm.source_id = s.id
     WHERE s.id = ?
     LIMIT 1`,
    [sourceId],
  );
  if (source === undefined) {
    throw new EngineRpcError("SOURCE_NOT_FOUND", `Source not found: ${sourceId}`);
  }
  if (stringField(source, "lifecycle_status") === "deleted") {
    return { skipped: true, reason: "source_deleted" };
  }

  const sourceUrl = stringField(source, "source_url");
  const sourceTitle = stringField(source, "source_title");
  const metadata = parseMetadata(stringField(source, "metadata_json"));
  const extraction = extractPaperMetadata({
    sourceUrl,
    sourceTitle,
    normalizedText: stringField(source, "normalized_text"),
    metadata,
  });
  normalizePaperMetadata(metadata, metadata, extraction, sourceUrl);

  const contract = isRecord(metadata.paper_metadata)
    ? (metadata.paper_metadata as unknown as PaperMetadataContractV1)
    : undefined;
  if (contract === undefined) {
    return { skipped: true, reason: "no_paper_metadata_signal" };
  }

  updateSourceMetadataJson(db, sourceId, () => metadata);
  insertSourceMetadataFtsRow(db, {
    sourceId,
    sourceKind: sourceKindField(source, "source_kind"),
    sourceType: stringField(source, "source_type"),
    lifecycleStatus: searchableLifecycleStatusField(source, "lifecycle_status"),
    title: metadataDisplayString(metadata, "title") ?? sourceTitle,
    abstract: metadataDisplayString(metadata, "abstract") ?? "",
    url: sourceUrl,
  });
  replaceKeywordIndexForSource(db, sourceId);
  return {
    version: contract.version,
    sourceTrust: contract.sourceTrust,
    remoteStatus: contract.remote.status,
    referenceCount: contract.referenceList.length,
    alternateUrlCount: contract.alternateUrls.length,
  };
}

async function runPdfFigureVisionStageForSource(
  db: SqliteDb,
  sourceId: string,
  pdfRawFileStore: PdfRawFileStore | undefined,
  figureVisionAnalyzerFactory: FigureVisionAnalyzerFactory | undefined,
  pdfFigureVisionImageExtractor: PdfFigureVisionImageExtractor,
): Promise<Record<string, unknown>> {
  const row = db.selectObject(
    `SELECT
       s.id,
       s.lifecycle_status,
       s.normalized_text,
       sm.metadata_json
     FROM sources s
     LEFT JOIN source_metadata sm ON sm.source_id = s.id
     WHERE s.id = ?
     LIMIT 1`,
    [sourceId],
  );
  if (row === undefined) {
    throw new EngineRpcError("SOURCE_NOT_FOUND", `Source not found: ${sourceId}`);
  }
  if (stringField(row, "lifecycle_status") === "deleted") {
    return { skipped: true, reason: "source_deleted" };
  }

  const metadata = parseMetadata(stringField(row, "metadata_json"));
  const images = pdfImageArtifactsFromMetadata(metadata.pdf_images);
  const analyses = pdfFigureAnalysesFromMetadata(metadata.pdf_figure_analyses);
  if (images.length === 0 || analyses.length === 0) {
    return { skipped: true, reason: "no_pdf_figure_analyses" };
  }

  const rawFile = isRecord(metadata.pdf_raw_file) ? metadata.pdf_raw_file : {};
  if (rawFile.status !== "persisted" || pdfRawFileStore === undefined) {
    const result = writePdfFigureVisionUnavailable(metadata, analyses, "pdf_raw_file_unavailable");
    updateSourceMetadataJson(db, sourceId, () => metadata);
    return result;
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await pdfRawFileStore.read(sourceId);
  } catch {
    const result = writePdfFigureVisionUnavailable(metadata, analyses, "pdf_raw_file_read_failed");
    updateSourceMetadataJson(db, sourceId, () => metadata);
    return result;
  }

  const analyzer = figureVisionAnalyzerFactory?.() ?? null;
  if (analyzer === null) {
    const result = writePdfFigureVisionUnavailable(
      metadata,
      analyses,
      "figure_vision_analyzer_unavailable",
    );
    updateSourceMetadataJson(db, sourceId, () => metadata);
    return result;
  }

  const results = pdfFigureAnalysisResultsFromMetadata(metadata.pdf_figure_analysis_results);
  const resultById = new Map(results.map((result) => [result.analysisId, result]));
  const imageById = new Map(images.map((image) => [image.id, image]));
  const normalizedText = stringField(row, "normalized_text");
  let analyzed = 0;
  let unavailable = 0;
  let error = 0;
  let skipped = 0;

  for (const analysis of analyses) {
    if (analyzed + unavailable + error >= figureVisionMaxAnalysesPerJob) break;
    if (resultById.has(analysis.id)) {
      skipped += 1;
      continue;
    }
    const image = imageById.get(analysis.imageId);
    if (image === undefined || analysis.inputStatus !== "needs_bounded_crop") {
      const result = pdfFigureAnalysisUnavailableResult(
        analysis,
        image,
        "figure_image_pixels_unavailable",
      );
      resultById.set(result.analysisId, result);
      unavailable += 1;
      continue;
    }

    const extracted = await pdfFigureVisionImageExtractor({
      bytes: pdfBytes,
      pageNumber: analysis.pageNumber,
      bbox: image.bbox,
    });
    if (extracted.status !== "ready") {
      const result = pdfFigureAnalysisUnavailableResult(analysis, image, extracted.reason);
      resultById.set(result.analysisId, result);
      unavailable += 1;
      continue;
    }

    const input: FigureVisionAnalysisInput = {
      analysisId: analysis.id,
      imageId: analysis.imageId,
      pageNumber: analysis.pageNumber,
      ...(analysis.label === undefined ? {} : { label: analysis.label }),
      ...(analysis.caption === undefined ? {} : { caption: analysis.caption }),
      pageContext: pdfPageContextForAnalysis(normalizedText, metadata, analysis.pageNumber),
      image: extracted.image,
    };
    const output = await analyzer.analyze(input);
    const result = pdfFigureAnalysisResultFromAnalyzer(output, extracted.crop, analysis, image);
    resultById.set(result.analysisId, result);
    if (output.status === "analyzed") analyzed += 1;
    else if (output.status === "unavailable") unavailable += 1;
    else error += 1;
  }

  const nextResults = Array.from(resultById.values()).slice(0, 80);
  metadata.pdf_figure_analysis_results = nextResults;
  metadata.pdf_figure_analyses = analyses.map((analysis) => {
    const result = resultById.get(analysis.id);
    if (result === undefined) return analysis;
    return {
      ...analysis,
      status:
        result.status === "analyzed"
          ? "analyzed"
          : result.status === "error"
            ? "error"
            : "unavailable",
      resultId: result.analysisId,
      resultStatus: result.status,
      resultReason: result.reason,
      analyzedAt: result.analyzedAt,
    };
  });
  updatePdfParseQualityAfterFigureVision(metadata, nextResults);
  updateSourceMetadataJson(db, sourceId, () => metadata);

  return {
    version: "clio-pdf-figure-vision-stage-v1",
    analyzed,
    unavailable,
    error,
    skipped,
    resultCount: nextResults.length,
  };
}

interface PdfFigureVisionAnalysisMetadata {
  id: string;
  imageId: string;
  pageNumber: number;
  label?: string;
  caption?: string;
  inputStatus: "needs_bounded_crop" | "image_pixels_unavailable";
  [key: string]: unknown;
}

interface PdfFigureVisionImageMetadata {
  id: string;
  pageNumber: number;
  label?: string;
  caption?: string;
  bbox?: ParsedPdfImageArtifact["bbox"];
}

interface PdfFigureVisionPersistedResult {
  analysisId: string;
  imageId: string;
  pageNumber?: number;
  label?: string;
  caption?: string;
  status: FigureVisionAnalysisResult["status"];
  analyzedAt: string;
  providerKind?: "chat";
  summary?: string;
  chartType?: string;
  extractedLabels: string[];
  extractedValues: string[];
  claims: FigureVisionAnalysisResult["claims"];
  reason?: string;
  crop?: Record<string, unknown>;
}

function pdfImageArtifactsFromMetadata(value: unknown): PdfFigureVisionImageMetadata[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = metadataRecord(item);
    const id = pdfMetadataString(record?.id);
    const pageNumber = pdfMetadataNumber(record?.pageNumber);
    if (record === undefined || id === undefined || pageNumber === undefined) return [];
    return [
      {
        id,
        pageNumber,
        ...(pdfMetadataString(record.label) === undefined
          ? {}
          : { label: pdfMetadataString(record.label) }),
        ...(pdfMetadataString(record.caption) === undefined
          ? {}
          : { caption: pdfMetadataString(record.caption) }),
        ...(metadataBoundingBox(record.bbox) === undefined
          ? {}
          : { bbox: metadataBoundingBox(record.bbox) }),
      },
    ];
  });
}

function pdfFigureAnalysesFromMetadata(value: unknown): PdfFigureVisionAnalysisMetadata[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = metadataRecord(item);
    const id = pdfMetadataString(record?.id);
    const imageId = pdfMetadataString(record?.imageId);
    const pageNumber = pdfMetadataNumber(record?.pageNumber);
    if (
      record === undefined ||
      id === undefined ||
      imageId === undefined ||
      pageNumber === undefined
    ) {
      return [];
    }
    const inputStatus =
      record.inputStatus === "needs_bounded_crop"
        ? "needs_bounded_crop"
        : "image_pixels_unavailable";
    return [
      {
        ...record,
        id,
        imageId,
        pageNumber,
        inputStatus,
        ...(pdfMetadataString(record.label) === undefined
          ? {}
          : { label: pdfMetadataString(record.label) }),
        ...(pdfMetadataString(record.caption) === undefined
          ? {}
          : { caption: pdfMetadataString(record.caption) }),
      },
    ];
  });
}

function pdfFigureAnalysisResultsFromMetadata(value: unknown): PdfFigureVisionPersistedResult[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = metadataRecord(item);
    const analysisId = pdfMetadataString(record?.analysisId);
    const imageId = pdfMetadataString(record?.imageId);
    const status = metadataFigureVisionStatus(record?.status);
    const analyzedAt = pdfMetadataString(record?.analyzedAt);
    if (
      record === undefined ||
      analysisId === undefined ||
      imageId === undefined ||
      status === undefined ||
      analyzedAt === undefined
    ) {
      return [];
    }
    return [
      {
        analysisId,
        imageId,
        ...(pdfMetadataNumber(record.pageNumber) === undefined
          ? {}
          : { pageNumber: pdfMetadataNumber(record.pageNumber) }),
        status,
        analyzedAt,
        ...(record.providerKind === "chat" ? { providerKind: "chat" as const } : {}),
        ...(pdfMetadataString(record.summary) === undefined
          ? {}
          : { summary: pdfMetadataString(record.summary) }),
        ...(pdfMetadataString(record.chartType) === undefined
          ? {}
          : { chartType: pdfMetadataString(record.chartType) }),
        extractedLabels: pdfMetadataStringArray(record.extractedLabels).slice(0, 12),
        extractedValues: pdfMetadataStringArray(record.extractedValues).slice(0, 20),
        claims: metadataFigureVisionClaims(record.claims),
        ...(pdfMetadataString(record.reason) === undefined
          ? {}
          : { reason: pdfMetadataString(record.reason) }),
        ...(metadataRecord(record.crop) === undefined ? {} : { crop: metadataRecord(record.crop) }),
      },
    ];
  });
}

function writePdfFigureVisionUnavailable(
  metadata: Record<string, unknown>,
  analyses: PdfFigureVisionAnalysisMetadata[],
  reason: string,
) {
  const existing = pdfFigureAnalysisResultsFromMetadata(metadata.pdf_figure_analysis_results);
  const resultById = new Map(existing.map((result) => [result.analysisId, result]));
  let unavailable = 0;
  for (const analysis of analyses.slice(0, figureVisionMaxAnalysesPerJob)) {
    if (resultById.has(analysis.id)) continue;
    const result = pdfFigureAnalysisUnavailableResult(analysis, undefined, reason);
    resultById.set(result.analysisId, result);
    unavailable += 1;
  }
  const nextResults = Array.from(resultById.values()).slice(0, 80);
  metadata.pdf_figure_analysis_results = nextResults;
  metadata.pdf_figure_analyses = analyses.map((analysis) => {
    const result = resultById.get(analysis.id);
    if (result === undefined) return analysis;
    return {
      ...analysis,
      status: "unavailable",
      resultId: result.analysisId,
      resultStatus: result.status,
      resultReason: result.reason,
      analyzedAt: result.analyzedAt,
    };
  });
  updatePdfParseQualityAfterFigureVision(metadata, nextResults);
  return {
    version: "clio-pdf-figure-vision-stage-v1",
    analyzed: 0,
    unavailable,
    error: 0,
    skipped: analyses.length - unavailable,
    resultCount: nextResults.length,
    reason,
  };
}

function pdfFigureAnalysisUnavailableResult(
  analysis: PdfFigureVisionAnalysisMetadata,
  image: PdfFigureVisionImageMetadata | undefined,
  reason: string,
): PdfFigureVisionPersistedResult {
  return {
    analysisId: analysis.id,
    imageId: analysis.imageId,
    pageNumber: analysis.pageNumber,
    status: "unavailable",
    analyzedAt: new Date().toISOString(),
    providerKind: "chat",
    extractedLabels: [],
    extractedValues: [],
    claims: [],
    reason,
    ...(image?.label === undefined ? {} : { label: image.label }),
    ...(image?.caption === undefined ? {} : { caption: image.caption }),
  };
}

function pdfFigureAnalysisResultFromAnalyzer(
  output: FigureVisionAnalysisResult,
  crop: Record<string, unknown>,
  analysis: PdfFigureVisionAnalysisMetadata,
  image: PdfFigureVisionImageMetadata | undefined,
): PdfFigureVisionPersistedResult {
  const label = image?.label ?? analysis.label;
  const caption = image?.caption ?? analysis.caption;
  return {
    analysisId: output.analysisId,
    imageId: output.imageId,
    pageNumber: analysis.pageNumber,
    status: output.status,
    analyzedAt: new Date().toISOString(),
    ...(output.providerKind === undefined ? {} : { providerKind: output.providerKind }),
    ...(label === undefined ? {} : { label }),
    ...(caption === undefined ? {} : { caption }),
    ...(output.summary === undefined ? {} : { summary: output.summary }),
    ...(output.chartType === undefined ? {} : { chartType: output.chartType }),
    extractedLabels: output.extractedLabels,
    extractedValues: output.extractedValues,
    claims: output.claims,
    ...(output.reason === undefined ? {} : { reason: output.reason }),
    crop,
  };
}

function pdfPageContextForAnalysis(
  normalizedText: string,
  metadata: Record<string, unknown>,
  pageNumber: number,
) {
  const page = metadataRecordArray(metadata.pdf_pages).find(
    (record) => pdfMetadataNumber(record.pageNumber) === pageNumber,
  );
  const charStart = pdfMetadataNumber(page?.charStart);
  const charEnd = pdfMetadataNumber(page?.charEnd);
  const text =
    charStart === undefined || charEnd === undefined
      ? ""
      : normalizedText.slice(Math.max(0, charStart), Math.max(charStart, charEnd));
  return text.slice(0, figureVisionMaxPageContextChars);
}

function updatePdfParseQualityAfterFigureVision(
  metadata: Record<string, unknown>,
  results: PdfFigureVisionPersistedResult[],
) {
  const quality = metadataRecord(metadata.pdf_parse_quality);
  if (quality === undefined) return;
  const metrics = metadataRecord(quality.metrics) ?? {};
  const analyzed = results.filter((result) => result.status === "analyzed").length;
  const unavailable = results.filter((result) => result.status === "unavailable").length;
  const error = results.filter((result) => result.status === "error").length;
  quality.metrics = {
    ...metrics,
    figureVisionResultCount: results.length,
    figureVisionAnalyzedCount: analyzed,
    figureVisionUnavailableCount: unavailable,
    figureVisionErrorCount: error,
  };
  const warnings = pdfMetadataStringArray(quality.warnings).filter(
    (warning) => warning !== "figure_visual_model_required",
  );
  if (unavailable > 0 || error > 0) warnings.push("figure_vision_unavailable");
  quality.warnings = Array.from(new Set(warnings)).slice(0, 20);
  metadata.pdf_parse_quality = quality;
}

function metadataRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function metadataRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = metadataRecord(item);
        return record === undefined ? [] : [record];
      })
    : [];
}

function pdfMetadataString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function pdfMetadataNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function pdfMetadataStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" ? [item] : []))
    : [];
}

function metadataFigureVisionStatus(
  value: unknown,
): FigureVisionAnalysisResult["status"] | undefined {
  return value === "analyzed" || value === "unavailable" || value === "error" ? value : undefined;
}

function metadataFigureVisionClaims(value: unknown): FigureVisionAnalysisResult["claims"] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 6).flatMap((item) => {
    const record = metadataRecord(item);
    const claimId = pdfMetadataString(record?.claimId);
    const text = pdfMetadataString(record?.text);
    if (claimId === undefined || text === undefined) return [];
    return [
      {
        claimId,
        text,
        confidence:
          record?.confidence === "low" ||
          record?.confidence === "medium" ||
          record?.confidence === "high"
            ? record.confidence
            : "low",
      },
    ];
  });
}

function metadataBoundingBox(value: unknown): ParsedPdfImageArtifact["bbox"] | undefined {
  const record = metadataRecord(value);
  if (record === undefined) return undefined;
  const xMin = pdfMetadataNumber(record.xMin);
  const yMin = pdfMetadataNumber(record.yMin);
  const xMax = pdfMetadataNumber(record.xMax);
  const yMax = pdfMetadataNumber(record.yMax);
  if (
    xMin === undefined ||
    yMin === undefined ||
    xMax === undefined ||
    yMax === undefined ||
    record.unit !== "pdf_user_space"
  ) {
    return undefined;
  }
  return { xMin, yMin, xMax, yMax, unit: "pdf_user_space" };
}

interface RunChunkMetaStageOptions {
  tier2: {
    enabled: boolean;
    maxChunks: number;
  };
  jobId?: string;
  summarizerFactory?: ChunkMetaSummarizerFactory;
}

interface ChunkMetaStageRow {
  id: string;
  ord: number;
  row: SqlRow;
  role: string;
  sectionPath: string | null;
  metaHeadJson: string;
}

async function runChunkMetaStageForSource(
  db: SqliteDb,
  sourceId: string,
  options: RunChunkMetaStageOptions,
): Promise<Record<string, unknown>> {
  const source = db.selectObject(
    `SELECT
       s.id,
       s.source_kind,
       s.source_title,
       s.source_type,
       s.lifecycle_status,
       s.normalized_text,
       sm.title AS meta_title,
       sm.source_type AS meta_source_type,
       sm.metadata_json,
       sm.section_outline_json
     FROM sources s
     LEFT JOIN source_metadata sm ON sm.source_id = s.id
     WHERE s.id = ?
     LIMIT 1`,
    [sourceId],
  );
  if (source === undefined) {
    throw new EngineRpcError("SOURCE_NOT_FOUND", `Source not found: ${sourceId}`);
  }
  if (stringField(source, "lifecycle_status") === "deleted") {
    return {
      tier: "tier0",
      chunkCount: 0,
      skipped: true,
      reason: "source_deleted",
    };
  }

  const chunks = db.selectObjects(
    `SELECT id, ord, text, char_start, char_end, role, parent_chunk_id
     FROM source_chunks
     WHERE source_id = ?
     ORDER BY ord ASC`,
    [sourceId],
  );
  const headings = sectionHeadingRanges(
    stringField(source, "normalized_text"),
    sectionOutlineFromJson(stringField(source, "section_outline_json")),
  );
  const resolvedChunks = chunks.map((chunk) => {
    const chunkRange = chunkTextRangeFromRow(chunk);
    return {
      row: chunk,
      id: stringField(chunk, "id"),
      role: stringField(chunk, "role") || "child",
      sectionPath: sectionPathForChunk(chunkRange, headings),
    };
  });
  const childChunks = resolvedChunks.filter((chunk) => chunk.role === "child");
  const childIndexById = new Map(childChunks.map((chunk, index) => [chunk.id, index]));
  const sourceTitle = stringField(source, "meta_title") || stringField(source, "source_title");
  const sourceType =
    stringField(source, "meta_source_type") ||
    stringField(source, "source_type") ||
    sourceKindField(source, "source_kind");
  const chunkMetaRows: ChunkMetaStageRow[] = [];
  transaction(db, () => {
    for (const chunk of resolvedChunks) {
      const relations: ChunkMetaRelationV1[] = [];
      if (chunk.role === "child") {
        const parentChunkId = stringField(chunk.row, "parent_chunk_id");
        if (parentChunkId.length > 0) {
          relations.push({
            kind: "parent",
            target: parentChunkId,
            label: chunk.sectionPath,
          });
        }
        const childIndex = childIndexById.get(chunk.id);
        if (childIndex !== undefined) {
          const previous = childChunks[childIndex - 1];
          const next = childChunks[childIndex + 1];
          if (previous !== undefined) {
            relations.push({ kind: "previous", target: previous.id, label: previous.sectionPath });
          }
          if (next !== undefined) {
            relations.push({ kind: "next", target: next.id, label: next.sectionPath });
          }
        }
      }
      const metaHeadJson = buildChunkMetaHeadJsonFromSourceMetadata({
        sourceTitle,
        sourceType,
        metadataJson: stringField(source, "metadata_json"),
        chunkText: stringField(chunk.row, "text"),
        sectionPath: chunk.sectionPath,
        roleHint: chunk.role,
        relations,
        selectedTier: "tier1",
      });
      db.exec({
        sql: "UPDATE source_chunks SET section_path = ?, meta_head_json = ? WHERE id = ?",
        bind: [chunk.sectionPath, metaHeadJson, chunk.id],
      });
      chunkMetaRows.push({
        id: chunk.id,
        ord: numberField(chunk.row, "ord"),
        row: chunk.row,
        role: chunk.role,
        sectionPath: chunk.sectionPath,
        metaHeadJson,
      });
    }
  });
  const childChunkCount = chunks.filter((chunk) => stringField(chunk, "role") === "child").length;
  const baseResult = {
    tier: "tier1",
    selectedTier: "tier1",
    chunkCount: childChunkCount,
    childChunkCount,
    tier1Count: chunks.length,
    tier2DisabledCount: chunks.length,
    tier2Reason: "explicit_llm_chunk_meta_not_configured",
  };
  if (!options.tier2.enabled) return baseResult;

  const maxChunks = options.tier2.maxChunks;
  if (maxChunks <= 0) {
    updateChunkMetaTier2StateForRows(db, chunkMetaRows, {
      status: "disabled",
      reason: "chunk_meta_tier2_max_chunks_zero",
    });
    insertChunkMetaTier2AuditRowsForChunks(db, chunkMetaRows, {
      sourceId,
      jobId: options.jobId,
      status: "skipped",
      reason: "chunk_meta_tier2_max_chunks_zero",
    });
    return {
      ...baseResult,
      tier2Enabled: true,
      tier2DisabledCount: chunks.length,
      tier2UnavailableCount: 0,
      tier2ErrorCount: 0,
      tier2SummarizedCount: 0,
      tier2SkippedCount: chunks.length,
      tier2Reason: "chunk_meta_tier2_max_chunks_zero",
    };
  }

  const summarizer = options.summarizerFactory?.() ?? null;
  if (summarizer === null) {
    updateChunkMetaTier2StateForRows(db, chunkMetaRows, {
      status: "unavailable",
      reason: "chunk_meta_summarizer_unavailable",
    });
    insertChunkMetaTier2AuditRowsForChunks(db, chunkMetaRows, {
      sourceId,
      jobId: options.jobId,
      status: "unavailable",
      reason: "chunk_meta_summarizer_unavailable",
    });
    return {
      ...baseResult,
      tier2Enabled: true,
      tier2DisabledCount: 0,
      tier2UnavailableCount: chunks.length,
      tier2ErrorCount: 0,
      tier2SummarizedCount: 0,
      tier2SkippedCount: 0,
      tier2Reason: "chunk_meta_summarizer_unavailable",
    };
  }

  let summarizedCount = 0;
  let unavailableCount = 0;
  let errorCount = 0;
  const selectedRows = chunkMetaRows.slice(0, maxChunks);
  const skippedRows = chunkMetaRows.slice(maxChunks);
  for (const chunk of selectedRows) {
    const result = await summarizeChunkMetaRow(
      summarizer,
      sourceId,
      sourceTitle,
      sourceType,
      chunk,
    );
    const updated = applyChunkMetaTier2Result(chunk.metaHeadJson, result);
    db.exec({
      sql: "UPDATE source_chunks SET meta_head_json = ? WHERE id = ?",
      bind: [updated, chunk.id],
    });
    insertChunkMetaTier2AuditRow(db, {
      sourceId,
      chunkId: chunk.id,
      jobId: options.jobId,
      status: chunkMetaTier2AuditStatusFromSummary(result.status),
      providerKind: result.providerKind,
      reason: result.reason,
      sectionSummaryChars: chunkMetaSummaryCharCount(result.sectionSummary),
      chunkSummaryChars: chunkMetaSummaryCharCount(result.chunkSummary),
      semanticRelationCount: chunkMetaSummarySemanticRelationCount(result.semanticRelations),
    });
    if (result.status === "summarized") summarizedCount += 1;
    else if (result.status === "unavailable") unavailableCount += 1;
    else errorCount += 1;
  }
  if (skippedRows.length > 0) {
    updateChunkMetaTier2StateForRows(db, skippedRows, {
      status: "disabled",
      reason: "chunk_meta_tier2_max_chunks_exceeded",
    });
    insertChunkMetaTier2AuditRowsForChunks(db, skippedRows, {
      sourceId,
      jobId: options.jobId,
      status: "skipped",
      reason: "chunk_meta_tier2_max_chunks_exceeded",
    });
  }

  const tier2FullySelected = summarizedCount > 0 && summarizedCount === chunkMetaRows.length;
  return {
    ...baseResult,
    tier: tier2FullySelected ? "tier2" : "tier1",
    selectedTier: tier2FullySelected ? "tier2" : "tier1",
    tier2Enabled: true,
    tier2DisabledCount: skippedRows.length,
    tier2UnavailableCount: unavailableCount,
    tier2ErrorCount: errorCount,
    tier2SummarizedCount: summarizedCount,
    tier2SkippedCount: skippedRows.length,
    tier2MaxChunks: maxChunks,
    ...(summarizedCount === 0
      ? {
          tier2Reason: firstChunkMetaTier2FailureReason(
            unavailableCount,
            errorCount,
            skippedRows.length,
          ),
        }
      : {}),
  };
}

async function summarizeChunkMetaRow(
  summarizer: ChunkMetaSummarizer,
  sourceId: string,
  sourceTitle: string,
  sourceType: string,
  chunk: ChunkMetaStageRow,
): Promise<ChunkMetaSummaryResult> {
  const metaHead = parseMetadata(chunk.metaHeadJson);
  try {
    return await summarizer.summarize({
      sourceId,
      chunkId: chunk.id,
      ord: chunk.ord,
      role: chunk.role,
      sourceTitle,
      sourceType,
      docContext: stringMetadataField(metaHead, "docContext") ?? undefined,
      sectionPath: chunk.sectionPath ?? undefined,
      chunkTextExcerpt: boundedNormalizedText(
        stringField(chunk.row, "text"),
        chunkMetaSummaryExcerptMaxChars,
      ),
    });
  } catch (error) {
    return {
      status: "error",
      providerKind: "chat",
      reason: boundedNormalizedText(
        error instanceof Error ? error.message : "chunk_meta_summary_error",
        240,
      ),
    };
  }
}

interface InsertChunkMetaTier2AuditInput {
  sourceId: string;
  chunkId: string;
  jobId?: string;
  status: ChunkMetaTier2AuditStatus;
  providerKind?: "chat";
  reason?: string;
  sectionSummaryChars?: number;
  chunkSummaryChars?: number;
  semanticRelationCount?: number;
}

function insertChunkMetaTier2AuditRowsForChunks(
  db: SqliteDb,
  rows: ChunkMetaStageRow[],
  input: Omit<InsertChunkMetaTier2AuditInput, "chunkId">,
) {
  if (rows.length === 0) return;
  transaction(db, () => {
    for (const row of rows) {
      insertChunkMetaTier2AuditRow(db, {
        ...input,
        chunkId: row.id,
      });
    }
  });
}

function insertChunkMetaTier2AuditRow(db: SqliteDb, input: InsertChunkMetaTier2AuditInput) {
  const now = new Date().toISOString();
  db.exec({
    sql: `INSERT INTO chunk_meta_tier2_audit (
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
      semantic_relation_count,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, 'tier2', ?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [
      createId("cmeta_t2_audit"),
      input.sourceId,
      input.chunkId,
      normalizeOptionalAuditId(input.jobId) ?? null,
      input.status,
      input.providerKind ?? null,
      normalizeOptionalArtifactText(input.reason, 240) ?? null,
      finiteNumberOrNull(input.sectionSummaryChars),
      finiteNumberOrNull(input.chunkSummaryChars),
      finiteNumberOrNull(input.semanticRelationCount),
      now,
      now,
    ],
  });
}

function chunkMetaTier2AuditStatusFromSummary(
  status: ChunkMetaSummaryResult["status"],
): ChunkMetaTier2AuditStatus {
  if (status === "summarized" || status === "unavailable") return status;
  return "error";
}

function chunkMetaSummaryCharCount(value: string | undefined) {
  const normalized = normalizeText(value ?? "");
  return normalized.length === 0 ? undefined : normalized.length;
}

function chunkMetaSummarySemanticRelationCount(value: ChunkMetaSummaryResult["semanticRelations"]) {
  return chunkMetaSemanticRelationsFromSummary(value).length;
}

function updateChunkMetaTier2StateForRows(
  db: SqliteDb,
  rows: ChunkMetaStageRow[],
  input: {
    status: Extract<ChunkMetaTierStatusV1, "disabled" | "unavailable" | "error">;
    reason: string;
  },
) {
  transaction(db, () => {
    for (const row of rows) {
      db.exec({
        sql: "UPDATE source_chunks SET meta_head_json = ? WHERE id = ?",
        bind: [applyChunkMetaTier2Fallback(row.metaHeadJson, input.status, input.reason), row.id],
      });
    }
  });
}

function applyChunkMetaTier2Result(metaHeadJson: string, result: ChunkMetaSummaryResult): string {
  if (result.status !== "summarized") {
    return applyChunkMetaTier2Fallback(
      metaHeadJson,
      result.status === "error" ? "error" : "unavailable",
      result.reason ?? `chunk_meta_summary_${result.status}`,
    );
  }

  const metaHead = parseMetadata(metaHeadJson);
  const tiers = isRecord(metaHead.tiers) ? metaHead.tiers : {};
  const fallbackTier = fallbackChunkMetaTier(metaHead);
  const fallbackState = selectedChunkMetaTierState(metaHead, fallbackTier);
  const sectionSummary =
    result.sectionSummary ??
    stringMetadataField(fallbackState, "sectionSummary") ??
    stringMetadataField(metaHead, "sectionSummary");
  const chunkSummary =
    result.chunkSummary ??
    stringMetadataField(fallbackState, "chunkSummary") ??
    stringMetadataField(metaHead, "chunkSummary");
  const relations = parseChunkMetaRelations(metaHeadJson);
  const fallbackSemanticRelations = chunkMetaSemanticRelationsFromState(fallbackState);
  const semanticRelations = normalizeChunkMetaSemanticRelations([
    ...chunkMetaSemanticRelationsFromSummary(result.semanticRelations),
    ...fallbackSemanticRelations,
  ]);
  const updated: ChunkMetaHeadV1 = {
    ...(metaHead as unknown as ChunkMetaHeadV1),
    version: chunkMetaHeadVersion,
    tier: "tier2",
    selectedTier: "tier2",
    summarySource: "remote_llm",
    sectionSummary: sectionSummary ?? null,
    chunkSummary: chunkSummary ?? null,
    relations,
    semanticRelations,
    tiers: {
      ...(tiers as Record<ChunkMetaTierV1, ChunkMetaTierStateV1>),
      tier2: {
        status: "available",
        summarySource: "remote_llm",
        fallbackTier,
        sectionSummary: sectionSummary ?? null,
        chunkSummary: chunkSummary ?? null,
        relations,
        semanticRelations,
      },
    },
  };
  return JSON.stringify(updated);
}

function applyChunkMetaTier2Fallback(
  metaHeadJson: string,
  status: Extract<ChunkMetaTierStatusV1, "disabled" | "unavailable" | "error">,
  reason: string,
) {
  const metaHead = parseMetadata(metaHeadJson);
  const tiers = isRecord(metaHead.tiers) ? metaHead.tiers : {};
  const fallbackTier = fallbackChunkMetaTier(metaHead);
  const fallbackState = selectedChunkMetaTierState(metaHead, fallbackTier);
  const fallbackSummarySource: ChunkMetaSummarySourceV1 =
    fallbackTier === "tier1" ? "local_extractive" : "deterministic";
  const updated: ChunkMetaHeadV1 = {
    ...(metaHead as unknown as ChunkMetaHeadV1),
    version: chunkMetaHeadVersion,
    tier: fallbackTier,
    selectedTier: fallbackTier,
    summarySource: fallbackSummarySource,
    sectionSummary:
      stringMetadataField(fallbackState, "sectionSummary") ??
      stringMetadataField(metaHead, "sectionSummary") ??
      null,
    chunkSummary:
      stringMetadataField(fallbackState, "chunkSummary") ??
      stringMetadataField(metaHead, "chunkSummary") ??
      null,
    semanticRelations: chunkMetaSemanticRelationsFromState(fallbackState),
    tiers: {
      ...(tiers as Record<ChunkMetaTierV1, ChunkMetaTierStateV1>),
      tier2: {
        status,
        summarySource: "unavailable",
        reason: boundedNormalizedText(reason, 240),
        fallbackTier,
        sectionSummary: null,
        chunkSummary: null,
        relations: [],
        semanticRelations: [],
      },
    },
  };
  return JSON.stringify(updated);
}

function fallbackChunkMetaTier(metaHead: Record<string, unknown>): ChunkMetaTierV1 {
  const tiers = isRecord(metaHead.tiers) ? metaHead.tiers : {};
  const tier1 = tiers.tier1;
  if (isRecord(tier1) && tier1.status === "available") return "tier1";
  return "tier0";
}

function chunkMetaSemanticRelationsFromState(
  state: Record<string, unknown>,
): ChunkMetaSemanticRelationV1[] {
  if (!Array.isArray(state.semanticRelations)) return [];
  return normalizeChunkMetaSemanticRelations(
    state.semanticRelations.flatMap((relation): ChunkMetaSemanticRelationV1[] => {
      if (!isRecord(relation)) return [];
      if (!isChunkMetaSemanticRelationKind(relation.kind)) return [];
      const target = typeof relation.target === "string" ? relation.target : "";
      if (target.length === 0) return [];
      return [
        {
          kind: relation.kind,
          target,
          label: typeof relation.label === "string" ? relation.label : null,
          confidence:
            typeof relation.confidence === "number" && Number.isFinite(relation.confidence)
              ? relation.confidence
              : 0.5,
          source: normalizeChunkMetaSemanticRelationSource(relation.source),
        },
      ];
    }),
  );
}

function chunkMetaSemanticRelationsFromSummary(
  value: ChunkMetaSummaryResult["semanticRelations"],
): ChunkMetaSemanticRelationV1[] {
  if (!Array.isArray(value)) return [];
  return normalizeChunkMetaSemanticRelations(
    value.flatMap((relation): ChunkMetaSemanticRelationV1[] => {
      if (!isRecord(relation)) return [];
      if (!isChunkMetaSemanticRelationKind(relation.kind)) return [];
      if (typeof relation.target !== "string" || relation.target.length === 0) return [];
      return [
        {
          kind: relation.kind,
          target: relation.target,
          label: typeof relation.label === "string" ? relation.label : null,
          confidence:
            typeof relation.confidence === "number" && Number.isFinite(relation.confidence)
              ? relation.confidence
              : 0.5,
          source: "remote_llm",
        },
      ];
    }),
  );
}

function firstChunkMetaTier2FailureReason(
  unavailableCount: number,
  errorCount: number,
  skippedCount: number,
) {
  if (errorCount > 0) return "chunk_meta_summary_error";
  if (unavailableCount > 0) return "chunk_meta_summary_unavailable";
  if (skippedCount > 0) return "chunk_meta_tier2_max_chunks_exceeded";
  return "chunk_meta_summary_not_run";
}

async function runEmbeddingStageForSource(
  db: SqliteDb,
  sourceId: string,
  embeddingProviderOverride?: EmbeddingProvider,
  embeddingProviderFactory?: EmbeddingProviderFactory,
): Promise<Record<string, unknown>> {
  const provider = getActiveEmbeddingProvider(
    db,
    embeddingProviderOverride,
    embeddingProviderFactory,
  );
  if (provider === null) {
    throw new EngineRpcError(
      "EMBEDDING_MODEL_UNAVAILABLE",
      "Active embedding model is unavailable.",
    );
  }
  return runEmbeddingStageForSourceWithProvider(db, sourceId, provider);
}

async function runEmbeddingStageForSourceWithProvider(
  db: SqliteDb,
  sourceId: string,
  provider: EmbeddingProvider,
): Promise<Record<string, unknown>> {
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
        modelId: provider.modelId,
        chunkCount: 0,
        skipped: true,
        reason: "source_deleted",
      },
    };
  }
  const chunks = db.selectObjects(
    `SELECT id, source_id, text, hash, meta_head_json
     FROM source_chunks
     WHERE source_id = ?
       AND role = 'child'
     ORDER BY ord ASC`,
    [sourceId],
  );
  const now = new Date().toISOString();
  await upsertSourceChunkEmbeddings(db, provider, chunks, now);
  const metaInput = loadSourceMetaEmbeddingInput(db, sourceId);
  const metaText = metaInput === undefined ? "" : buildSourceMetaEmbeddingText(metaInput);
  if (metaText.length > 0) {
    await upsertSourceMetaEmbedding(db, provider, { sourceId, text: metaText }, now);
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

async function upsertSourceChunkEmbeddings(
  db: SqliteDb,
  provider: EmbeddingProvider,
  chunks: SqlRow[],
  now: string,
) {
  if (chunks.length === 0) return;
  const inputs = chunks.map((chunk) => buildChunkEmbeddingInput(chunk));
  const vectors = await provider.embedTexts(inputs);
  if (vectors.length !== chunks.length) {
    throw new EngineRpcError("EMBEDDING_VECTOR_COUNT_MISMATCH", "Embedding vector count mismatch.");
  }
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const embeddingInput = inputs[index];
    const vector = vectors[index];
    if (chunk === undefined || embeddingInput === undefined || vector === undefined) {
      throw new EngineRpcError(
        "EMBEDDING_VECTOR_COUNT_MISMATCH",
        "Embedding vector count mismatch.",
      );
    }
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
}

async function upsertSourceMetaEmbedding(
  db: SqliteDb,
  provider: EmbeddingProvider,
  input: { sourceId: string; text: string },
  now: string,
) {
  const [vector] = await provider.embedTexts([input.text]);
  if (vector === undefined) {
    throw new EngineRpcError("EMBEDDING_VECTOR_COUNT_MISMATCH", "Embedding vector count mismatch.");
  }
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

function runDeterministicGraphBuildForSource(
  db: SqliteDb,
  sourceId: string,
): BuildSourceGraphResult {
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
       AND role = 'child'
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

interface GraphPathSearchState {
  nodeId: string;
  nodeIds: string[];
  edgeIds: string[];
}

function queryGraphPath(db: SqliteDb, payload: GraphPathPayload): GraphQueryResult {
  const startNodes = resolveGraphNodeRef(db, payload.from, 8);
  const targetNodes = resolveGraphNodeRef(db, payload.to, 20);
  if (startNodes.length === 0 || targetNodes.length === 0) return emptyGraphQueryResult();

  const targetIds = new Set(targetNodes.map((node) => node.id));
  const sameEndpointNodes = startNodes.filter((node) => targetIds.has(node.id));
  if (sameEndpointNodes.length > 0) {
    return { nodes: sameEndpointNodes, edges: [], evidence: [] };
  }

  const maxDepth = clampOptionalLimit(payload.maxDepth, 3, 4);
  const limit = clampOptionalLimit(payload.limit, 80, 200);
  const dimension = normalizeGraphDimension(payload.dimension);
  const visitedNodeIds = new Set(startNodes.map((node) => node.id));
  const edgesById = new Map<string, GraphEdge>();
  let expandedEdgeCount = 0;
  let frontier: GraphPathSearchState[] = startNodes.map((node) => ({
    nodeId: node.id,
    nodeIds: [node.id],
    edgeIds: [],
  }));

  for (
    let depth = 0;
    depth < maxDepth && frontier.length > 0 && expandedEdgeCount < limit;
    depth += 1
  ) {
    const nextFrontier: GraphPathSearchState[] = [];
    for (const state of frontier) {
      if (expandedEdgeCount >= limit) break;
      const rows = loadGraphEdgesAdjacentToNodes(
        db,
        [state.nodeId],
        dimension,
        Math.min(40, limit - expandedEdgeCount),
      );
      for (const row of rows) {
        if (expandedEdgeCount >= limit) break;
        expandedEdgeCount += 1;
        const edge = graphEdgeFromRow(row);
        edgesById.set(edge.id, edge);
        const nextNodeId =
          edge.sourceNodeId === state.nodeId ? edge.targetNodeId : edge.sourceNodeId;
        if (state.nodeIds.includes(nextNodeId)) continue;

        const nextState: GraphPathSearchState = {
          nodeId: nextNodeId,
          nodeIds: [...state.nodeIds, nextNodeId],
          edgeIds: [...state.edgeIds, edge.id],
        };
        if (targetIds.has(nextNodeId)) return graphPathResult(db, nextState, edgesById);
        if (visitedNodeIds.has(nextNodeId)) continue;
        visitedNodeIds.add(nextNodeId);
        nextFrontier.push(nextState);
      }
    }
    frontier = nextFrontier;
  }

  return emptyGraphQueryResult();
}

function queryGraphTimeline(db: SqliteDb, payload: GraphTimelinePayload): GraphQueryResult {
  const limit = clampOptionalLimit(payload.limit, 80, 200);
  const rows = loadGraphTimelineEdges(db, payload, limit);
  const edges = rows.map(graphEdgeFromRow);
  return {
    nodes: loadGraphNodesForEdges(db, edges),
    edges,
    evidence: loadGraphEvidenceAnchors(db, edges),
  };
}

function graphPathResult(
  db: SqliteDb,
  state: GraphPathSearchState,
  edgesById: Map<string, GraphEdge>,
): GraphQueryResult {
  const edges = state.edgeIds.flatMap((edgeId) => {
    const edge = edgesById.get(edgeId);
    return edge === undefined ? [] : [edge];
  });
  return {
    nodes: loadGraphNodesByIds(db, state.nodeIds),
    edges,
    evidence: loadGraphEvidenceAnchors(db, edges),
  };
}

function resolveGraphStartNodes(db: SqliteDb, payload: GraphNeighborsPayload): GraphNode[] {
  return resolveGraphNodeRef(db, payload, 20);
}

function resolveGraphNodeRef(db: SqliteDb, ref: GraphNodeRef, maxRows: number): GraphNode[] {
  const limit = clampLimit(maxRows, 80);
  if (ref.nodeId !== undefined) {
    const node = loadGraphNode(db, normalizeText(ref.nodeId));
    return node === undefined ? [] : [node];
  }
  if (ref.sourceId !== undefined) {
    const rows = db.selectObjects(
      "SELECT * FROM graph_nodes WHERE kind = 'source' AND ref_id = ? ORDER BY updated_at DESC LIMIT ?",
      [normalizeText(ref.sourceId), limit],
    );
    return rows.map(graphNodeFromRow);
  }
  if (ref.canonicalId !== undefined) {
    const canonicalId = normalizeText(ref.canonicalId);
    if (canonicalId.length === 0) return [];
    const kind = normalizeGraphNodeKind(ref.kind);
    const rows =
      kind === undefined
        ? db.selectObjects(
            "SELECT * FROM graph_nodes WHERE canonical_id = ? ORDER BY updated_at DESC LIMIT ?",
            [canonicalId, limit],
          )
        : db.selectObjects(
            "SELECT * FROM graph_nodes WHERE kind = ? AND canonical_id = ? ORDER BY updated_at DESC LIMIT ?",
            [kind, canonicalId, limit],
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
  const sourceNodeIds = loadGraphSourceNodeIds(db, sourceIds, 80);
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

function loadGraphTimelineEdges(
  db: SqliteDb,
  payload: GraphTimelinePayload,
  limit: number,
): SqlRow[] {
  const sourceIds = boundedUniqueStrings(payload.sourceIds, 40);
  const sourceNodeIds = sourceIds.length > 0 ? loadGraphSourceNodeIds(db, sourceIds, 80) : [];
  const timelineNodeIds = resolveGraphTimelineNodeIds(db, payload);
  if (timelineNodeIds !== undefined && timelineNodeIds.length === 0) return [];

  const conditions: string[] = [];
  const bind: unknown[] = [];
  if (sourceIds.length > 0) {
    const sourceConditions = [`evidence_source_id IN (${sourceIds.map(() => "?").join(", ")})`];
    bind.push(...sourceIds);
    if (sourceNodeIds.length > 0) {
      sourceConditions.push(`source_node_id IN (${sourceNodeIds.map(() => "?").join(", ")})`);
      sourceConditions.push(`target_node_id IN (${sourceNodeIds.map(() => "?").join(", ")})`);
      bind.push(...sourceNodeIds, ...sourceNodeIds);
    }
    conditions.push(`(${sourceConditions.join(" OR ")})`);
  }
  if (timelineNodeIds !== undefined) {
    conditions.push(
      `(source_node_id IN (${timelineNodeIds.map(() => "?").join(", ")})
        OR target_node_id IN (${timelineNodeIds.map(() => "?").join(", ")}))`,
    );
    bind.push(...timelineNodeIds, ...timelineNodeIds);
  }

  const dimension = normalizeGraphDimension(payload.dimension);
  if (dimension !== undefined) {
    conditions.push("dimension = ?");
    bind.push(dimension);
  }

  const whereSql = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
  const orderSql = payload.order === "asc" ? "ASC" : "DESC";
  return db.selectObjects(
    `SELECT *
     FROM graph_edges
     ${whereSql}
     ORDER BY created_at ${orderSql}, weight DESC
     LIMIT ?`,
    [...bind, limit],
  );
}

function resolveGraphTimelineNodeIds(
  db: SqliteDb,
  payload: GraphTimelinePayload,
): string[] | undefined {
  const kind = normalizeGraphNodeKind(payload.kind);
  const canonicalId =
    payload.canonicalId === undefined ? undefined : normalizeText(payload.canonicalId);
  if (payload.kind === undefined && canonicalId === undefined) return undefined;
  if (payload.kind !== undefined && kind === undefined) return [];
  if (canonicalId !== undefined && canonicalId.length === 0) return [];

  const conditions: string[] = [];
  const bind: unknown[] = [];
  if (kind !== undefined) {
    conditions.push("kind = ?");
    bind.push(kind);
  }
  if (canonicalId !== undefined) {
    conditions.push("canonical_id = ?");
    bind.push(canonicalId);
  }
  const rows = db.selectObjects(
    `SELECT id
     FROM graph_nodes
     WHERE ${conditions.join(" AND ")}
     ORDER BY updated_at DESC
     LIMIT ?`,
    [...bind, 80],
  );
  return rows.map((row) => stringField(row, "id")).filter((id) => id.length > 0);
}

function loadGraphSourceNodeIds(db: SqliteDb, sourceIds: string[], maxRows: number) {
  const boundedSourceIds = boundedUniqueStrings(sourceIds, maxRows);
  if (boundedSourceIds.length === 0) return [];
  const rows = db.selectObjects(
    `SELECT id
     FROM graph_nodes
     WHERE kind = 'source'
       AND ref_id IN (${boundedSourceIds.map(() => "?").join(", ")})
     ORDER BY updated_at DESC
     LIMIT ?`,
    [...boundedSourceIds, clampLimit(maxRows, 120)],
  );
  return rows.map((row) => stringField(row, "id")).filter((id) => id.length > 0);
}

function loadGraphNode(db: SqliteDb, nodeId: string): GraphNode | undefined {
  const row = db.selectObject("SELECT * FROM graph_nodes WHERE id = ? LIMIT 1", [nodeId]);
  return row === undefined ? undefined : graphNodeFromRow(row);
}

function loadGraphNodesByIds(db: SqliteDb, nodeIds: string[]) {
  const boundedNodeIds = boundedUniqueStrings(nodeIds, 240);
  if (boundedNodeIds.length === 0) return [];
  const rows = db.selectObjects(
    `SELECT *
     FROM graph_nodes
     WHERE id IN (${boundedNodeIds.map(() => "?").join(", ")})`,
    boundedNodeIds,
  );
  const nodesById = new Map(rows.map((row) => [stringField(row, "id"), graphNodeFromRow(row)]));
  return boundedNodeIds.flatMap((nodeId) => {
    const node = nodesById.get(nodeId);
    return node === undefined ? [] : [node];
  });
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
         AND role = 'child'
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
         AND role = 'child'
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
       AND role = 'child'
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
     LEFT JOIN source_chunks c ON c.source_id = ws.source_id AND c.role = 'child'
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

function sourceContextCompressionLogWhereClause(
  filter: SourceContextCompressionLogFilter,
): SqlWhereClause {
  const conditions: string[] = [];
  const bind: unknown[] = [];
  if (filter.sessionId !== undefined) {
    conditions.push("session_id = ?");
    bind.push(filter.sessionId);
  }
  if (filter.runId !== undefined) {
    conditions.push("run_id = ?");
    bind.push(filter.runId);
  }
  if (filter.sourceId !== undefined) {
    conditions.push("source_id = ?");
    bind.push(filter.sourceId);
  }
  return {
    sql: conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`,
    bind,
  };
}

function sourceContextMapArtifactWhereClause(
  filter: SourceContextMapArtifactFilter,
): SqlWhereClause {
  const conditions: string[] = [];
  const bind: unknown[] = [];
  if (filter.sessionId !== undefined) {
    conditions.push("session_id = ?");
    bind.push(filter.sessionId);
  }
  if (filter.runId !== undefined) {
    conditions.push("run_id = ?");
    bind.push(filter.runId);
  }
  if (filter.stage !== undefined) {
    conditions.push("stage = ?");
    bind.push(filter.stage);
  }
  if (filter.status !== undefined) {
    conditions.push("status = ?");
    bind.push(filter.status);
  }
  if (filter.sourceId !== undefined) {
    const pattern = sourceContextMapArtifactJsonLikePattern(filter.sourceId);
    conditions.push("(source_ids_json LIKE ? ESCAPE '\\' OR window_refs_json LIKE ? ESCAPE '\\')");
    bind.push(pattern, pattern);
  }
  return {
    sql: conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`,
    bind,
  };
}

function chunkMetaTier2AuditWhereClause(filter: ChunkMetaTier2AuditFilter): SqlWhereClause {
  const conditions: string[] = [];
  const bind: unknown[] = [];
  const sourceId = normalizeOptionalAuditId(filter.sourceId);
  const jobId = normalizeOptionalAuditId(filter.jobId);
  if (sourceId !== undefined) {
    conditions.push("source_id = ?");
    bind.push(sourceId);
  }
  if (jobId !== undefined) {
    conditions.push("job_id = ?");
    bind.push(jobId);
  }
  if (filter.status !== undefined) {
    conditions.push("status = ?");
    bind.push(filter.status);
  }
  return {
    sql: conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`,
    bind,
  };
}

function sourceContextLostInfoTypesForEntry(
  entry: SourceContextCompressionLogEntry,
): SourceContextLostInfoType[] {
  const explicit = normalizeSourceContextLostInfoTypes(entry.lostInfoTypes ?? []);
  if (explicit.length > 0) return explicit;
  return sourceContextLostInfoTypesForReason(entry.reason);
}

function parseSourceContextLostInfoTypes(
  input: string,
  reason: SourceContextCompressionLogEntry["reason"],
): SourceContextLostInfoType[] {
  const parsed = normalizeSourceContextLostInfoTypes(parseStringArray(input));
  return parsed.length === 0 ? sourceContextLostInfoTypesForReason(reason) : parsed;
}

function normalizeSourceContextLostInfoTypes(
  input: readonly string[],
): SourceContextLostInfoType[] {
  const output: SourceContextLostInfoType[] = [];
  for (const value of input) {
    const normalized = sourceContextLostInfoTypeFromString(value);
    if (normalized === undefined || output.includes(normalized)) continue;
    output.push(normalized);
  }
  return output;
}

function sourceContextLostInfoTypesForReason(
  reason: SourceContextCompressionLogEntry["reason"],
): SourceContextLostInfoType[] {
  switch (reason) {
    case "query_no_hits":
      return ["query_candidates"];
    case "source_not_found":
    case "source_over_budget":
      return ["source"];
    case "source_downgraded":
      return ["load_depth"];
    case "chunk_window_omitted":
      return ["chunk_windows"];
    case "parent_context_selected":
      return ["chunk_detail"];
    case "full_depth_bounded":
      return ["full_document", "chunk_windows"];
    case "group_limit_reached":
      return ["groups"];
  }
}

function sourceContextLostInfoTypeFromString(value: string): SourceContextLostInfoType | undefined {
  if (
    value === "query_candidates" ||
    value === "source" ||
    value === "load_depth" ||
    value === "chunk_windows" ||
    value === "chunk_detail" ||
    value === "full_document" ||
    value === "groups"
  ) {
    return value;
  }
  return undefined;
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
    sourceDepthOverrides: normalizeSourceContextPackDepthOverrides(
      payload.sourceDepthOverrides,
      maxSourceContextPackSources,
    ),
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

function normalizeSourceContextPackDepthOverrides(
  value: SourceContextPackSourceDepthOverride[] | undefined,
  limit: number,
): SourceContextPackSourceDepthOverride[] {
  const bySourceId = new Map<string, WorkingSetLoadDepth>();
  for (const override of value ?? []) {
    const sourceId = normalizeText(override.sourceId);
    if (sourceId.length === 0 || !isWorkingSetLoadDepthValue(override.loadDepth)) continue;
    bySourceId.delete(sourceId);
    bySourceId.set(sourceId, override.loadDepth);
  }
  return [...bySourceId.entries()]
    .slice(0, Math.max(0, Math.floor(limit)))
    .map(([sourceId, loadDepth]) => ({ sourceId, loadDepth }));
}

function isWorkingSetLoadDepthValue(value: unknown): value is WorkingSetLoadDepth {
  return value === "meta" || value === "outline" || value === "chunks" || value === "full";
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
  const loadDepthOverrideBySourceId = new Map(
    options.sourceDepthOverrides.map((override) => [override.sourceId, override.loadDepth]),
  );

  const touchCandidate = (
    sourceId: string,
    update: Omit<Partial<SourceContextPackCandidate>, "sourceId" | "rank">,
  ) => {
    const id = normalizeText(sourceId);
    if (id.length === 0) return;
    const existing = candidates.get(id);
    const loadDepthOverride = loadDepthOverrideBySourceId.get(id);
    if (existing === undefined && candidates.size >= options.maxSources) return;
    if (existing === undefined) {
      candidates.set(id, {
        sourceId: id,
        rank: candidates.size,
        explicit: update.explicit === true,
        anchored: update.anchored === true,
        query: update.query === true,
        ...(loadDepthOverride === undefined ? {} : { loadDepthOverride }),
        ...(update.workingSet === undefined ? {} : { workingSet: update.workingSet }),
      });
      return;
    }
    candidates.set(id, {
      ...existing,
      explicit: existing.explicit || update.explicit === true,
      anchored: existing.anchored || update.anchored === true,
      query: existing.query || update.query === true,
      loadDepthOverride: loadDepthOverride ?? existing.loadDepthOverride,
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
     LEFT JOIN source_chunks c ON c.source_id = s.id AND c.role = 'child'
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
        candidate.loadDepthOverride ??
        (optionalString(row, "load_depth") === undefined
          ? "chunks"
          : workingSetLoadDepthField(row, "load_depth"));
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

  const windows = loadSourceContextParentWindows(
    db,
    state,
    loadSourceContextCandidateWindows(db, state, options),
  );
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
         AND c.role = 'child'
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
       WHERE source_id = ?
         AND role = 'child'`,
      [state.source.id],
    );
    if (fallback !== undefined) addWindow(numberField(fallback, "chunk_ord"), "fallback");
  }

  return windows;
}

function loadSourceContextParentWindows(
  db: SqliteDb,
  state: SourceContextSourceState,
  windows: InternalSourceContextWindow[],
): InternalSourceContextWindow[] {
  const depth = state.source.requestedLoadDepth;
  if ((depth !== "chunks" && depth !== "full") || windows.length === 0) return windows;

  const childChunkIds = boundedUniqueStrings(
    windows.flatMap((window) => window.childChunkIds),
    maxSourceContextPackWindowsPerSource * 4,
  );
  if (childChunkIds.length === 0) return windows;

  const parentByChildId = loadSourceContextParentWindowsByChildId(db, state, childChunkIds);
  if (parentByChildId.size === 0) return windows;

  const result: InternalSourceContextWindow[] = [];
  const seenParentIds = new Set<string>();
  for (const window of windows) {
    result.push(window);
    for (const childChunkId of window.childChunkIds) {
      const parentWindow = parentByChildId.get(childChunkId);
      if (parentWindow === undefined || seenParentIds.has(parentWindow.chunkId)) continue;
      seenParentIds.add(parentWindow.chunkId);
      result.push(parentWindow);
      break;
    }
  }
  return result;
}

function loadSourceContextParentWindowsByChildId(
  db: SqliteDb,
  state: SourceContextSourceState,
  childChunkIds: string[],
): Map<string, InternalSourceContextWindow> {
  const rows = db.selectObjects(
    `SELECT
      c.id AS child_id,
      p.id,
      p.ord,
      p.text,
      p.meta_head_json,
      p.page_start,
      p.page_end
     FROM source_chunks c
     JOIN source_chunks p ON p.id = c.parent_chunk_id
     WHERE c.source_id = ?
       AND c.role = 'child'
       AND c.id IN (${childChunkIds.map(() => "?").join(", ")})
       AND p.source_id = ?
       AND p.role = 'parent'
     ORDER BY c.ord ASC`,
    [state.source.id, ...childChunkIds, state.source.id],
  );
  const parentById = new Map<string, InternalSourceContextWindow>();
  const parentByChildId = new Map<string, InternalSourceContextWindow>();
  for (const row of rows) {
    const parentId = stringField(row, "id");
    if (parentId.length === 0) continue;
    const existing =
      parentById.get(parentId) ?? sourceContextParentWindowFromRow(row, state.source);
    if (existing === undefined) continue;
    parentById.set(parentId, existing);
    parentByChildId.set(stringField(row, "child_id"), existing);
  }
  return parentByChildId;
}

function sourceContextParentWindowFromRow(
  row: SqlRow,
  source: SourceContextPackSource,
): InternalSourceContextWindow | undefined {
  const parentId = stringField(row, "id");
  if (parentId.length === 0) return undefined;
  const text = sourceContextParentWindowText(
    stringField(row, "meta_head_json"),
    stringField(row, "text"),
  );
  if (text.length === 0) return undefined;
  const tokenEstimate = estimateTokens(text);
  return {
    sourceId: source.id,
    chunkId: parentId,
    ord: numberField(row, "ord"),
    text,
    tokenCount: tokenEstimate,
    tokenEstimate,
    sourceKind: source.sourceKind,
    sourceUrl: source.sourceUrl,
    sourceTitle: source.sourceTitle,
    sourceType: source.sourceType,
    priority: "parent",
    childChunkIds: [],
    ...optionalPageRangeFromRow(row),
  };
}

function sourceContextParentWindowText(metaHeadJson: string, fallbackText: string) {
  const metaHead = parseMetadata(metaHeadJson);
  const selectedTier =
    stringMetadataField(metaHead, "selectedTier") ?? stringMetadataField(metaHead, "tier");
  const tierState = selectedChunkMetaTierState(metaHead, selectedTier);
  const sectionPath = stringMetadataField(metaHead, "sectionPath") ?? "";
  const sectionSummary =
    stringMetadataField(tierState, "sectionSummary") ??
    stringMetadataField(metaHead, "sectionSummary") ??
    "";
  const chunkSummary =
    stringMetadataField(tierState, "chunkSummary") ??
    stringMetadataField(metaHead, "chunkSummary") ??
    "";
  const summary = boundedNormalizedText(
    [
      sectionPath.length > 0 ? `Section: ${sectionPath}` : "",
      sectionSummary.length > 0 ? `Section summary: ${sectionSummary}` : "",
      chunkSummary.length > 0 ? `Parent summary: ${chunkSummary}` : "",
    ]
      .filter((part) => part.length > 0)
      .join("\n"),
    sourceContextPackParentWindowMaxChars,
  );
  if (summary.length > 0) return summary;
  return excerpt(fallbackText, sourceContextPackParentWindowMaxChars);
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
    childChunkIds: window.chunks.map((chunk) => chunk.id),
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
    logSelectedParentContextWindows(candidate, compressionLog);
    current.windows.push(...candidate.windows.map(publicSourceContextWindow));
    totalTokenEstimate += candidate.tokenEstimate;
    sources.push(candidate.source);
  }

  flushCurrent();
  return { sources, groups };
}

function logSelectedParentContextWindows(
  pack: SourceContextSourcePack,
  compressionLog: SourceContextCompressionLogEntry[],
) {
  for (const window of pack.windows) {
    if (window.priority !== "parent") continue;
    compressionLog.push({
      reason: "parent_context_selected",
      sourceId: pack.source.id,
      chunkId: window.chunkId,
      requestedLoadDepth: pack.source.requestedLoadDepth,
      selectedLoadDepth: pack.source.selectedLoadDepth,
      tokenEstimate: window.tokenEstimate,
      message: "Selected a bounded parent chunk summary as compressed source context.",
    });
  }
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
      `SELECT ord, role
       FROM source_chunks
       WHERE source_id = ?
         AND id = ?
       LIMIT 1`,
      [anchor.memoryId, anchor.chunkId],
    );
    if (chunk !== undefined) {
      if (stringField(chunk, "role") !== "child") return undefined;
      return numberField(chunk, "ord");
    }
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
       AND role = 'child'
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
  const doi = normalizeDoi(filter?.doi);
  const arxivIds = normalizeArxivIdFilters(filter?.arxivIds);
  const years = normalizePaperYearFilters(filter?.years);
  const venues = normalizePaperTextFilters(filter?.venues);
  const authors = normalizePaperTextFilters(filter?.authors);
  const hasPaperMetadataFilter =
    filter?.doi !== undefined ||
    filter?.arxivIds !== undefined ||
    filter?.years !== undefined ||
    filter?.venues !== undefined ||
    filter?.authors !== undefined;
  const lifecycleStatuses =
    filter?.lifecycleStatuses === undefined
      ? [...searchableSourceLifecycleStatuses]
      : normalizeSourceLifecycleFilters(filter.lifecycleStatuses);
  return {
    sourceTypes,
    lifecycleStatuses,
    ...(doi === undefined ? {} : { doi }),
    arxivIds,
    years,
    venues,
    authors,
    hasSourceTypeFilter,
    hasPaperMetadataFilter,
    hasImpossibleFilter:
      (hasSourceTypeFilter && sourceTypes.length === 0) ||
      (filter?.lifecycleStatuses !== undefined && lifecycleStatuses.length === 0) ||
      (filter?.doi !== undefined && doi === undefined) ||
      (filter?.arxivIds !== undefined && arxivIds.length === 0) ||
      (filter?.years !== undefined && years.length === 0) ||
      (filter?.venues !== undefined && venues.length === 0) ||
      (filter?.authors !== undefined && authors.length === 0),
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

function normalizeArxivIdFilters(values: string[] | undefined) {
  if (values === undefined) return [];
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const fromUrl = parseArxivUrl(value).arxivId;
    const fromCandidate = arxivParseResultFromIdCandidate(value).arxivId;
    const normalized = fromUrl ?? fromCandidate;
    if (normalized === undefined || seen.has(normalized) || seen.size >= 24) return [];
    seen.add(normalized);
    return [normalized];
  });
}

function normalizePaperYearFilters(values: number[] | undefined) {
  if (values === undefined) return [];
  const seen = new Set<number>();
  return values.flatMap((value) => {
    const year = Math.floor(value);
    if (
      !Number.isFinite(value) ||
      !isReasonablePaperYear(year) ||
      seen.has(year) ||
      seen.size >= 24
    ) {
      return [];
    }
    seen.add(year);
    return [year];
  });
}

function normalizePaperTextFilters(values: string[] | undefined) {
  if (values === undefined) return [];
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const normalized = normalizeText(value).toLocaleLowerCase();
    if (normalized.length === 0 || seen.has(normalized) || seen.size >= 24) return [];
    seen.add(normalized);
    return [normalized];
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
  if (filter.doi !== undefined) {
    clauses.push("LOWER(COALESCE(sm.metadata_json, '')) LIKE ? ESCAPE '\\'");
    bind.push(`%${escapeSqlLike(filter.doi)}%`);
  }
  for (const arxivId of filter.arxivIds) {
    clauses.push("LOWER(COALESCE(sm.metadata_json, '')) LIKE ? ESCAPE '\\'");
    bind.push(`%${escapeSqlLike(arxivId)}%`);
  }
  for (const year of filter.years) {
    clauses.push("COALESCE(sm.metadata_json, '') LIKE ?");
    bind.push(`%${year}%`);
  }
  for (const venue of filter.venues) {
    clauses.push("LOWER(COALESCE(sm.metadata_json, '')) LIKE ? ESCAPE '\\'");
    bind.push(`%${escapeSqlLike(venue)}%`);
  }
  for (const author of filter.authors) {
    clauses.push("LOWER(COALESCE(sm.metadata_json, '')) LIKE ? ESCAPE '\\'");
    bind.push(`%${escapeSqlLike(author)}%`);
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

interface KnowledgeBaseExpansionCandidate {
  term: string;
  source: KnowledgeBaseExpansionTermSource;
  sourceIds: string[];
  sourceCount: number;
  hitCount: number;
  score: number;
}

interface KnowledgeBaseExpansionQueryContext {
  query: string;
  limit: number;
  filter: NormalizedRetrieveSourcesFilter;
  needles: string[];
  normalizedQuery: string | undefined;
  likeNeedles: string[];
}

function findKnowledgeBaseExpansionTerms(
  db: SqliteDb,
  input: { query: string; limit: number; filter: NormalizedRetrieveSourcesFilter },
): { terms: string[]; termSources: KnowledgeBaseExpansionTermTrace[] } {
  const needles = keywordTokens(input.query).filter(isUsefulKeywordToken).slice(0, 8);
  const normalizedQuery = normalizeKeywordTerm(input.query);
  if (needles.length === 0 && normalizedQuery === undefined) return { terms: [], termSources: [] };
  const likeNeedles =
    needles.length > 0 ? needles : normalizedQuery === undefined ? [] : [normalizedQuery];
  if (likeNeedles.length === 0) return { terms: [], termSources: [] };
  const context: KnowledgeBaseExpansionQueryContext = {
    ...input,
    needles,
    normalizedQuery,
    likeNeedles,
  };
  return mergeKnowledgeBaseExpansionCandidates(
    [
      ...loadKeywordExpansionTermCandidates(db, context),
      ...loadGraphExpansionTermCandidates(db, context),
    ],
    input.limit,
  );
}

function loadKeywordExpansionTermCandidates(
  db: SqliteDb,
  input: KnowledgeBaseExpansionQueryContext,
): KnowledgeBaseExpansionCandidate[] {
  const sourceFilter = sourceFilterWhereClause(input.filter);
  const likeClause = input.likeNeedles
    .map(() => "ki.normalized_term LIKE ? ESCAPE '\\'")
    .join(" OR ");
  const rows = db.selectObjects(
    `SELECT
      ki.term,
      ki.normalized_term,
      COUNT(DISTINCT kis.source_id) AS source_count,
      COALESCE(SUM(kis.hit_count), 0) AS hit_count,
      GROUP_CONCAT(DISTINCT kis.source_id) AS source_ids
     FROM keyword_index ki
     JOIN keyword_index_sources kis ON kis.term = ki.term
     JOIN sources s ON s.id = kis.source_id
     LEFT JOIN source_metadata sm ON sm.source_id = s.id
     WHERE (${likeClause})
       AND ${sourceFilter.sql}
     GROUP BY ki.term, ki.normalized_term
     ORDER BY source_count DESC, hit_count DESC, ki.term ASC
     LIMIT ?`,
    [
      ...input.likeNeedles.map((needle) => `%${escapeSqlLike(needle)}%`),
      ...sourceFilter.bind,
      Math.max(input.limit * 8, 24),
    ],
  );

  return rows
    .flatMap((row) => {
      const term = normalizeKeywordTerm(stringField(row, "term"));
      if (term === undefined) return [];
      if (input.normalizedQuery !== undefined && term === input.normalizedQuery) return [];
      return [
        {
          term,
          source: "keyword_index" as const,
          sourceIds: sqlGroupConcatStrings(row, "source_ids"),
          sourceCount: numberField(row, "source_count"),
          hitCount: numberField(row, "hit_count"),
          score: keywordExpansionScore(term, {
            normalizedQuery: input.normalizedQuery,
            needles: input.needles,
            sourceCount: numberField(row, "source_count"),
            hitCount: numberField(row, "hit_count"),
          }),
        },
      ];
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.term.localeCompare(right.term));
}

function loadGraphExpansionTermCandidates(
  db: SqliteDb,
  input: KnowledgeBaseExpansionQueryContext,
): KnowledgeBaseExpansionCandidate[] {
  const sourceFilter = sourceFilterWhereClause(input.filter);
  const likeClause = input.likeNeedles
    .map(() => "(LOWER(gn.label) LIKE ? ESCAPE '\\' OR LOWER(gn.canonical_id) LIKE ? ESCAPE '\\')")
    .join(" OR ");
  const rows = db.selectObjects(
    `SELECT
      gn.label,
      gn.canonical_id,
      COUNT(DISTINCT ge.evidence_source_id) AS source_count,
      COUNT(DISTINCT ge.id) AS hit_count,
      COALESCE(SUM(ge.weight), 0) AS weight_sum,
      GROUP_CONCAT(DISTINCT ge.evidence_source_id) AS source_ids
     FROM graph_nodes gn
     JOIN graph_edges ge ON ge.target_node_id = gn.id
     JOIN sources s ON s.id = ge.evidence_source_id
     LEFT JOIN source_metadata sm ON sm.source_id = s.id
     WHERE gn.kind <> 'source'
       AND (${likeClause})
       AND ${sourceFilter.sql}
     GROUP BY gn.id, gn.label, gn.canonical_id
     ORDER BY source_count DESC, hit_count DESC, weight_sum DESC, gn.label ASC
     LIMIT ?`,
    [
      ...input.likeNeedles.flatMap((needle) => {
        const likeNeedle = `%${escapeSqlLike(needle.toLocaleLowerCase())}%`;
        return [likeNeedle, likeNeedle];
      }),
      ...sourceFilter.bind,
      Math.max(input.limit * 8, 24),
    ],
  );

  return rows
    .flatMap((row) => {
      const sourceCount = numberField(row, "source_count");
      const hitCount = numberField(row, "hit_count");
      const weightSum = realField(row, "weight_sum");
      return graphExpansionTermsFromRow(row).flatMap((term) => {
        if (input.normalizedQuery !== undefined && term === input.normalizedQuery) return [];
        const score =
          keywordExpansionScore(term, {
            normalizedQuery: input.normalizedQuery,
            needles: input.needles,
            sourceCount,
            hitCount,
          }) +
          Math.min(weightSum, 8) * 0.1;
        if (score <= 0) return [];
        return [
          {
            term,
            source: "source_graph" as const,
            sourceIds: sqlGroupConcatStrings(row, "source_ids"),
            sourceCount,
            hitCount,
            score,
          },
        ];
      });
    })
    .sort((left, right) => right.score - left.score || left.term.localeCompare(right.term));
}

function graphExpansionTermsFromRow(row: SqlRow) {
  const rawTerms = [
    stringField(row, "label"),
    stringField(row, "canonical_id").replace(/^[\p{L}\p{N}_-]+:/u, ""),
  ];
  const seen = new Set<string>();
  return rawTerms.flatMap((rawTerm) => {
    const term = normalizeKeywordTerm(rawTerm);
    if (term === undefined || seen.has(term)) return [];
    seen.add(term);
    return [term];
  });
}

function mergeKnowledgeBaseExpansionCandidates(
  candidates: KnowledgeBaseExpansionCandidate[],
  limit: number,
) {
  const byTerm = new Map<
    string,
    {
      term: string;
      score: number;
      sources: Set<KnowledgeBaseExpansionTermSource>;
      sourceIds: Set<string>;
      sourceCount: number;
    }
  >();
  for (const candidate of candidates) {
    const entry =
      byTerm.get(candidate.term) ??
      ({
        term: candidate.term,
        score: 0,
        sources: new Set<KnowledgeBaseExpansionTermSource>(),
        sourceIds: new Set<string>(),
        sourceCount: 0,
      } satisfies {
        term: string;
        score: number;
        sources: Set<KnowledgeBaseExpansionTermSource>;
        sourceIds: Set<string>;
        sourceCount: number;
      });
    entry.score = Math.max(entry.score, candidate.score);
    entry.sources.add(candidate.source);
    for (const sourceId of candidate.sourceIds) entry.sourceIds.add(sourceId);
    entry.sourceCount = Math.max(entry.sourceCount, candidate.sourceCount);
    byTerm.set(candidate.term, entry);
  }

  const ranked = Array.from(byTerm.values())
    .map((entry) => {
      const sourceCount = entry.sourceIds.size > 0 ? entry.sourceIds.size : entry.sourceCount;
      return {
        ...entry,
        sourceCount,
        score: entry.score + Math.min(sourceCount, 8) * 0.05 + (entry.sources.size > 1 ? 0.25 : 0),
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.term.localeCompare(right.term))
    .slice(0, limit);

  return {
    terms: ranked.map((entry) => entry.term),
    termSources: ranked.map((entry) => ({
      term: entry.term,
      sources: knowledgeBaseExpansionTermSources(entry.sources),
      sourceCount: entry.sourceCount,
    })),
  };
}

function knowledgeBaseExpansionTermSources(sources: Set<KnowledgeBaseExpansionTermSource>) {
  return (["keyword_index", "source_graph"] as const).filter((source) => sources.has(source));
}

function sqlGroupConcatStrings(row: SqlRow, key: string) {
  return boundedUniqueStrings(stringField(row, key).split(","), 100);
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
     LEFT JOIN source_metadata sm ON sm.source_id = s.id
     JOIN source_chunks c ON c.id = source_fts.chunk_id
     WHERE source_fts MATCH ?
       AND ${sourceFilter.sql}
       AND c.role = 'child'
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

async function loadVectorMetaRetrievalHits(
  db: SqliteDb,
  input: {
    query: string;
    limit: number;
    filter: NormalizedRetrieveSourcesFilter;
    embeddingProviderOverride?: EmbeddingProvider;
    embeddingProviderFactory?: EmbeddingProviderFactory;
  },
): Promise<{ hits: SourceRetrievalHit[]; trace: RetrieveSourcesTraceTrack }> {
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
  const provider = getActiveEmbeddingProvider(
    db,
    input.embeddingProviderOverride,
    input.embeddingProviderFactory,
  );
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
  const queryVector = await embedRetrievalQuery(provider, input.query, "vector_meta");
  if (queryVector.trace !== undefined) return { hits: [], trace: queryVector.trace };
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
          score: cosineSimilarity(queryVector.vector, vector),
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

async function loadVectorChunkRetrievalHits(
  db: SqliteDb,
  input: {
    query: string;
    limit: number;
    filter: NormalizedRetrieveSourcesFilter;
    embeddingProviderOverride?: EmbeddingProvider;
    embeddingProviderFactory?: EmbeddingProviderFactory;
  },
): Promise<{ hits: SourceRetrievalHit[]; trace: RetrieveSourcesTraceTrack }> {
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
  const provider = getActiveEmbeddingProvider(
    db,
    input.embeddingProviderOverride,
    input.embeddingProviderFactory,
  );
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
  const queryVector = await embedRetrievalQuery(provider, input.query, "vector_chunks");
  if (queryVector.trace !== undefined) return { hits: [], trace: queryVector.trace };
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
     LEFT JOIN source_metadata sm ON sm.source_id = s.id
     WHERE se.model_id = ?
       AND se.target_kind = 'chunk'
       AND c.role = 'child'
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
          score: cosineSimilarity(queryVector.vector, vector),
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

async function embedRetrievalQuery(
  provider: EmbeddingProvider,
  query: string,
  track: "vector_meta" | "vector_chunks",
): Promise<
  { vector: number[]; trace?: undefined } | { vector?: undefined; trace: RetrieveSourcesTraceTrack }
> {
  try {
    const [vector] = await provider.embedTexts([query]);
    if (vector === undefined || vector.length !== provider.dimension) {
      return {
        trace: {
          name: track,
          status: "unavailable",
          itemCount: 0,
          reason: "embedding_dimension_mismatch",
        },
      };
    }
    return { vector };
  } catch (error) {
    return {
      trace: {
        name: track,
        status: "unavailable",
        itemCount: 0,
        reason: embeddingUnavailableReason(error),
      },
    };
  }
}

function embeddingUnavailableReason(error: unknown) {
  if (error instanceof EngineRpcError) {
    if (error.code === "PROVIDER_PERMISSION_REQUIRED") return "embedding_permission_required";
    if (error.code === "EMBEDDING_DIMENSION_MISMATCH") return "embedding_dimension_mismatch";
    if (error.code === "EMBEDDING_MODEL_MISMATCH") return "embedding_model_mismatch";
    if (error.code === "EMBEDDING_PROVIDER_CONFIG_REQUIRED")
      return "embedding_provider_unconfigured";
  }
  return "embedding_provider_error";
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

function knowledgeBaseSearchResultWithClusters(
  db: SqliteDb,
  result: SearchKnowledgeBaseResult,
  clustering: KnowledgeBaseClusteringOptions | undefined,
): SearchKnowledgeBaseResult {
  if (clustering === undefined) return result;
  return {
    ...result,
    clusters: buildKnowledgeBaseSourceClusters(db, result.items, clustering),
  };
}

interface KnowledgeBaseClusterSourceMetadata {
  sourceId: string;
  sourceType: string;
  sourceTitle: string;
  metaTitle: string;
  abstract: string;
  capturedAt: string;
  metadata: Record<string, unknown>;
}

interface KnowledgeBaseClusterDraft {
  label: string;
  sourceIds: string[];
  sourceCount: number;
  score: number;
  bestRank: number;
  summary?: string;
  trace?: KnowledgeBaseSourceClusterTrace;
  idSeed?: string;
}

interface KnowledgeBaseSemanticVector {
  sourceId: string;
  vector: number[];
}

interface KnowledgeBaseSemanticVectorLoad {
  vectors: KnowledgeBaseSemanticVector[];
  reason?: KnowledgeBaseSemanticClusterFallbackReason;
}

function buildKnowledgeBaseSourceClusters(
  db: SqliteDb,
  items: RetrieveSourceItem[],
  clustering: KnowledgeBaseClusteringOptions,
): KnowledgeBaseSourceCluster[] {
  if (items.length === 0) return [];
  const metadataBySourceId = loadKnowledgeBaseClusterMetadata(
    db,
    items.map((item) => item.id),
  );
  if (clustering.clusterBy === "semantic") {
    return buildKnowledgeBaseSemanticSourceClusters(db, items, clustering, metadataBySourceId);
  }
  if (clustering.clusterBy === "topic") {
    return buildKnowledgeBaseTopicSourceClusters(items, clustering, metadataBySourceId);
  }
  return buildKnowledgeBaseMetadataSourceClusters(items, clustering, metadataBySourceId);
}

function buildKnowledgeBaseTopicSourceClusters(
  items: RetrieveSourceItem[],
  clustering: KnowledgeBaseClusteringOptions,
  metadataBySourceId: Map<string, KnowledgeBaseClusterSourceMetadata>,
): KnowledgeBaseSourceCluster[] {
  const grouped = new Map<string, Array<{ item: RetrieveSourceItem; rank: number }>>();
  items.forEach((item, index) => {
    const topic = knowledgeBaseSourceTopicSignal(item, metadataBySourceId.get(item.id));
    const existing = grouped.get(topic.key) ?? [];
    existing.push({ item, rank: index + 1 });
    grouped.set(topic.key, existing);
  });

  const trace: KnowledgeBaseSourceClusterTrace = {
    backend: "metadata",
    method: "metadata_topic_label",
    vectorCount: items.length,
  };
  const drafts = Array.from(grouped.entries()).flatMap(([key, members]) => {
    if (members.length === 0) return [];
    const memberItems = members.map((member) => member.item);
    const label = knowledgeBaseTopicClusterLabel(memberItems, metadataBySourceId);
    return [
      {
        label,
        sourceIds: memberItems.map((item) => item.id),
        sourceCount: memberItems.length,
        score: members.reduce((sum, member) => {
          const score = Number.isFinite(member.item.score) ? member.item.score : 0;
          return sum + score;
        }, 0),
        bestRank: Math.min(...members.map((member) => member.rank)),
        summary: knowledgeBaseTopicClusterSummary(memberItems, metadataBySourceId),
        trace,
        idSeed: `${key}:${memberItems.map((item) => item.id).join("|")}`,
      },
    ];
  });
  return finalizeKnowledgeBaseClusterDrafts(drafts, clustering.clusterBy, clustering.granularity);
}

function buildKnowledgeBaseMetadataSourceClusters(
  items: RetrieveSourceItem[],
  clustering: KnowledgeBaseClusteringOptions,
  metadataBySourceId: Map<string, KnowledgeBaseClusterSourceMetadata>,
  trace?: KnowledgeBaseSourceClusterTrace,
): KnowledgeBaseSourceCluster[] {
  const grouped = new Map<string, KnowledgeBaseClusterDraft>();

  items.forEach((item, index) => {
    const metadata = metadataBySourceId.get(item.id);
    const label = knowledgeBaseClusterLabel(clustering.clusterBy, item, metadata);
    const key = `${clustering.clusterBy}:${label.toLowerCase()}`;
    const existing = grouped.get(key);
    const score = Number.isFinite(item.score) ? item.score : 0;
    if (existing === undefined) {
      grouped.set(key, {
        label,
        sourceIds: [item.id],
        sourceCount: 1,
        score,
        bestRank: index + 1,
        ...(clustering.clusterBy === "semantic"
          ? {
              summary: knowledgeBaseMetadataClusterSummary([item], metadataBySourceId),
              trace,
            }
          : {}),
      });
      return;
    }
    existing.sourceIds.push(item.id);
    existing.sourceCount += 1;
    existing.score += score;
    existing.bestRank = Math.min(existing.bestRank, index + 1);
    if (clustering.clusterBy === "semantic") {
      existing.summary = knowledgeBaseMetadataClusterSummary(
        items.filter((candidate) => existing.sourceIds.includes(candidate.id)),
        metadataBySourceId,
      );
      existing.trace = trace;
    }
  });

  return finalizeKnowledgeBaseClusterDrafts(
    Array.from(grouped.values()),
    clustering.clusterBy,
    clustering.granularity,
  );
}

function finalizeKnowledgeBaseClusterDrafts(
  drafts: KnowledgeBaseClusterDraft[],
  clusterBy: KnowledgeBaseEngineClusterBy,
  granularity: KnowledgeBaseClusteringOptions["granularity"],
): KnowledgeBaseSourceCluster[] {
  const sorted = drafts.sort(
    (left, right) =>
      right.score - left.score ||
      left.bestRank - right.bestRank ||
      right.sourceCount - left.sourceCount ||
      left.label.localeCompare(right.label),
  );
  const selectedGranularity = granularity ?? "medium";
  const maxClusters =
    selectedGranularity === "coarse"
      ? 3
      : selectedGranularity === "medium"
        ? 6
        : Number.POSITIVE_INFINITY;
  const visible = sorted.slice(0, maxClusters);
  const overflow = sorted.slice(maxClusters);
  if (overflow.length > 0) {
    visible.push({
      label: "Other",
      sourceIds: overflow.flatMap((cluster) => cluster.sourceIds),
      sourceCount: overflow.reduce((sum, cluster) => sum + cluster.sourceCount, 0),
      score: overflow.reduce((sum, cluster) => sum + cluster.score, 0),
      bestRank: Math.min(...overflow.map((cluster) => cluster.bestRank)),
      summary: "Additional lower-ranked clusters merged by granularity.",
      trace: commonClusterTrace(overflow),
      idSeed: `Other:${overflow.flatMap((cluster) => cluster.sourceIds).join("|")}`,
    });
  }

  return visible.map((cluster) => ({
    id: knowledgeBaseClusterId(clusterBy, cluster.idSeed ?? cluster.label),
    label: cluster.label,
    clusterBy,
    sourceIds: cluster.sourceIds,
    sourceCount: cluster.sourceCount,
    score: Number(cluster.score.toFixed(6)),
    ...(cluster.summary === undefined ? {} : { summary: cluster.summary }),
    ...(cluster.trace === undefined ? {} : { trace: cluster.trace }),
  }));
}

function buildKnowledgeBaseSemanticSourceClusters(
  db: SqliteDb,
  items: RetrieveSourceItem[],
  clustering: KnowledgeBaseClusteringOptions,
  metadataBySourceId: Map<string, KnowledgeBaseClusterSourceMetadata>,
): KnowledgeBaseSourceCluster[] {
  const backend = clustering.semanticBackend ?? "auto";
  if (backend === "metadata") {
    return buildKnowledgeBaseMetadataSourceClusters(
      items,
      clustering,
      metadataBySourceId,
      metadataFallbackClusterTrace("metadata_backend_selected"),
    );
  }

  const vectorLoad = loadKnowledgeBaseSemanticClusterVectors(
    db,
    items.map((item) => item.id),
  );
  if (vectorLoad.reason !== undefined) {
    return buildKnowledgeBaseMetadataSourceClusters(
      items,
      clustering,
      metadataBySourceId,
      metadataFallbackClusterTrace(vectorLoad.reason, vectorLoad.vectors.length),
    );
  }

  const vectorsBySourceId = new Map(vectorLoad.vectors.map((entry) => [entry.sourceId, entry]));
  const rankedVectors = items.flatMap((item) => {
    const vector = vectorsBySourceId.get(item.id);
    return vector === undefined ? [] : [{ item, vector: vector.vector }];
  });
  if (rankedVectors.length !== items.length || rankedVectors.length < 2) {
    return buildKnowledgeBaseMetadataSourceClusters(
      items,
      clustering,
      metadataBySourceId,
      metadataFallbackClusterTrace("insufficient_embeddings", vectorLoad.vectors.length),
    );
  }

  const assignments = assignKnowledgeBaseSemanticClusters(
    rankedVectors.map((entry) => entry.vector),
    semanticClusterCount(rankedVectors.length, clustering.granularity),
  );
  if (assignments.length !== rankedVectors.length) {
    return buildKnowledgeBaseMetadataSourceClusters(
      items,
      clustering,
      metadataBySourceId,
      metadataFallbackClusterTrace("invalid_embeddings", vectorLoad.vectors.length),
    );
  }

  const grouped = new Map<number, Array<(typeof rankedVectors)[number] & { rank: number }>>();
  rankedVectors.forEach((entry, index) => {
    const clusterIndex = assignments[index];
    if (clusterIndex === undefined) return;
    const existing = grouped.get(clusterIndex) ?? [];
    existing.push({ ...entry, rank: index + 1 });
    grouped.set(clusterIndex, existing);
  });

  const trace: KnowledgeBaseSourceClusterTrace = {
    backend: "embedding",
    method: "kmeans_meta_embedding",
    vectorCount: rankedVectors.length,
  };
  const drafts = Array.from(grouped.values()).flatMap((members) => {
    if (members.length === 0) return [];
    const memberItems = members.map((member) => member.item);
    const label = knowledgeBaseSemanticEmbeddingClusterLabel(memberItems, metadataBySourceId);
    return [
      {
        label,
        sourceIds: memberItems.map((item) => item.id),
        sourceCount: memberItems.length,
        score: members.reduce((sum, member) => {
          const score = Number.isFinite(member.item.score) ? member.item.score : 0;
          return sum + score;
        }, 0),
        bestRank: Math.min(...members.map((member) => member.rank)),
        summary: knowledgeBaseSemanticClusterSummary(memberItems, metadataBySourceId),
        trace,
        idSeed: `${label}:${memberItems.map((item) => item.id).join("|")}`,
      },
    ];
  });

  if (drafts.length === 0) {
    return buildKnowledgeBaseMetadataSourceClusters(
      items,
      clustering,
      metadataBySourceId,
      metadataFallbackClusterTrace("invalid_embeddings", vectorLoad.vectors.length),
    );
  }
  return finalizeKnowledgeBaseClusterDrafts(drafts, clustering.clusterBy, clustering.granularity);
}

function loadKnowledgeBaseSemanticClusterVectors(
  db: SqliteDb,
  sourceIds: string[],
): KnowledgeBaseSemanticVectorLoad {
  const model = getActiveEmbeddingModelRow(db);
  if (model === undefined) {
    return { vectors: [], reason: "embedding_model_unavailable" };
  }
  const modelId = stringField(model, "id");
  const dimension = numberField(model, "dimension");
  if (modelId.length === 0 || dimension <= 0) {
    return { vectors: [], reason: "embedding_model_unavailable" };
  }
  const uniqueIds = Array.from(new Set(sourceIds.filter((id) => id.length > 0))).slice(
    0,
    knowledgeBaseSemanticClusterMaxSources,
  );
  if (uniqueIds.length < 2) {
    return { vectors: [], reason: "insufficient_embeddings" };
  }
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const rows = db.selectObjects(
    `SELECT se.source_id, se.vector_json
     FROM source_embeddings se
     JOIN sources s ON s.id = se.source_id
     WHERE se.model_id = ?
       AND se.target_kind = 'meta'
       AND se.target_id = se.source_id
       AND se.source_id IN (${placeholders})
       AND s.lifecycle_status <> 'deleted'`,
    [modelId, ...uniqueIds],
  );
  if (rows.length < uniqueIds.length) {
    return { vectors: [], reason: "insufficient_embeddings" };
  }
  const vectors = rows.flatMap((row) => {
    const vector = parseEmbeddingVector(stringField(row, "vector_json"), dimension);
    if (vector === null) return [];
    return [{ sourceId: stringField(row, "source_id"), vector }];
  });
  if (vectors.length < uniqueIds.length) {
    return {
      vectors,
      reason: vectors.length === 0 ? "invalid_embeddings" : "insufficient_embeddings",
    };
  }
  return { vectors };
}

function semanticClusterCount(
  itemCount: number,
  granularity: KnowledgeBaseClusteringOptions["granularity"],
) {
  if (itemCount <= 2) return itemCount;
  if (granularity === "coarse") return Math.min(3, itemCount);
  if (granularity === "fine") return Math.min(10, Math.max(2, Math.ceil(itemCount / 2)));
  return Math.min(6, Math.max(2, Math.ceil(itemCount / 3)));
}

function assignKnowledgeBaseSemanticClusters(vectors: number[][], clusterCount: number) {
  if (vectors.length === 0 || clusterCount <= 0) return [];
  const centroids = initializeKnowledgeBaseSemanticCentroids(vectors, clusterCount);
  let assignments = vectors.map(() => -1);
  for (let iteration = 0; iteration < knowledgeBaseSemanticClusterMaxIterations; iteration += 1) {
    const nextAssignments = vectors.map((vector) =>
      nearestSemanticCentroidIndex(vector, centroids),
    );
    if (nextAssignments.every((assignment, index) => assignment === assignments[index])) {
      assignments = nextAssignments;
      break;
    }
    assignments = nextAssignments;
    updateKnowledgeBaseSemanticCentroids(vectors, assignments, centroids);
  }
  return assignments;
}

function initializeKnowledgeBaseSemanticCentroids(vectors: number[][], clusterCount: number) {
  const centroids: number[][] = [vectors[0]?.slice() ?? []];
  while (centroids.length < clusterCount && centroids.length < vectors.length) {
    let bestIndex = -1;
    let bestDistance = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < vectors.length; index += 1) {
      const vector = vectors[index];
      if (vector === undefined || centroids.some((centroid) => vectorsEqual(centroid, vector))) {
        continue;
      }
      const distance = Math.min(
        ...centroids.map((centroid) => 1 - cosineSimilarity(vector, centroid)),
      );
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) break;
    centroids.push(vectors[bestIndex]?.slice() ?? []);
  }
  return centroids;
}

function updateKnowledgeBaseSemanticCentroids(
  vectors: number[][],
  assignments: number[],
  centroids: number[][],
) {
  for (let clusterIndex = 0; clusterIndex < centroids.length; clusterIndex += 1) {
    const members = vectors.filter((_, index) => assignments[index] === clusterIndex);
    if (members.length === 0) continue;
    const dimension = members[0]?.length ?? 0;
    const average = Array.from(
      { length: dimension },
      (_, dimensionIndex) =>
        members.reduce((sum, vector) => sum + (vector[dimensionIndex] ?? 0), 0) / members.length,
    );
    centroids[clusterIndex] = normalizeVector(average);
  }
}

function nearestSemanticCentroidIndex(vector: number[], centroids: number[][]) {
  let bestIndex = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < centroids.length; index += 1) {
    const score = cosineSimilarity(vector, centroids[index] ?? []);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function vectorsEqual(left: number[], right: number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function metadataFallbackClusterTrace(
  reason: KnowledgeBaseSemanticClusterFallbackReason,
  vectorCount?: number,
): KnowledgeBaseSourceClusterTrace {
  return {
    backend: "metadata",
    method: "metadata_fallback",
    ...(vectorCount === undefined ? {} : { vectorCount }),
    fallbackReason: reason,
  };
}

function commonClusterTrace(clusters: KnowledgeBaseClusterDraft[]) {
  const [first] = clusters;
  if (first?.trace === undefined) return undefined;
  return clusters.every((cluster) => sameClusterTrace(cluster.trace, first.trace))
    ? first.trace
    : undefined;
}

function sameClusterTrace(
  left: KnowledgeBaseSourceClusterTrace | undefined,
  right: KnowledgeBaseSourceClusterTrace | undefined,
) {
  return (
    left?.backend === right?.backend &&
    left?.method === right?.method &&
    left?.fallbackReason === right?.fallbackReason &&
    left?.vectorCount === right?.vectorCount
  );
}

function knowledgeBaseSourceTopicSignal(
  item: RetrieveSourceItem,
  sourceMetadata: KnowledgeBaseClusterSourceMetadata | undefined,
) {
  const explicitSignals = knowledgeBaseExplicitTopicSignals(sourceMetadata);
  const titleSignals = knowledgeBaseMetadataTextTerms(
    [
      sourceMetadata?.metaTitle,
      sourceMetadata?.sourceTitle,
      item.sourceTitle,
      sourceMetadata?.abstract,
    ],
    3,
  );
  const signal = explicitSignals[0] ?? titleSignals[0];
  if (signal !== undefined) {
    const normalized = normalizeText(signal);
    if (normalized.length > 0) {
      return {
        key: `topic:${normalized.toLowerCase()}`,
        label: titleCaseClusterTerm(normalized),
      };
    }
  }
  return {
    key: `fallback:${semanticFallbackClusterLabel(item, sourceMetadata).toLowerCase()}`,
    label: semanticFallbackClusterLabel(item, sourceMetadata),
  };
}

function knowledgeBaseTopicClusterLabel(
  items: RetrieveSourceItem[],
  metadataBySourceId: Map<string, KnowledgeBaseClusterSourceMetadata>,
) {
  const explicitSignals = mostFrequentKnowledgeBaseClusterValues(
    items.flatMap((item) => knowledgeBaseExplicitTopicSignals(metadataBySourceId.get(item.id))),
  );
  const titleSignals = mostFrequentKnowledgeBaseClusterValues(
    knowledgeBaseMetadataTextTerms(
      items.flatMap((item) => {
        const metadata = metadataBySourceId.get(item.id);
        return [metadata?.metaTitle, metadata?.sourceTitle, item.sourceTitle, metadata?.abstract];
      }),
      8,
    ),
  );
  const selected = explicitSignals[0]?.value ?? titleSignals[0]?.value;
  if (selected !== undefined) {
    return truncateKnowledgeBaseClusterText(
      titleCaseClusterTerm(selected),
      knowledgeBaseSemanticClusterLabelMaxChars,
    );
  }
  return knowledgeBaseSemanticEmbeddingClusterLabel(items, metadataBySourceId);
}

function knowledgeBaseTopicClusterSummary(
  items: RetrieveSourceItem[],
  metadataBySourceId: Map<string, KnowledgeBaseClusterSourceMetadata>,
) {
  const signals = mostFrequentKnowledgeBaseClusterValues(
    items.flatMap((item) => knowledgeBaseExplicitTopicSignals(metadataBySourceId.get(item.id))),
  )
    .slice(0, 3)
    .map((signal) => signal.value);
  const metadataSignals = knowledgeBaseClusterSignalParts(items, metadataBySourceId);
  const examples = items
    .map((item) => knowledgeBaseClusterSourceTitle(item, metadataBySourceId.get(item.id)))
    .filter((title) => title.length > 0)
    .slice(0, 2);
  return truncateKnowledgeBaseClusterText(
    [
      `${items.length} source${items.length === 1 ? "" : "s"}`,
      signals.length > 0 ? `topics: ${signals.join(", ")}` : "bounded metadata label",
      metadataSignals.length > 0 ? `signals: ${metadataSignals.join(", ")}` : "",
      examples.length > 0 ? `examples: ${examples.join("; ")}` : "",
    ]
      .filter((part) => part.length > 0)
      .join(" / "),
    knowledgeBaseSemanticClusterSummaryMaxChars,
  );
}

function knowledgeBaseExplicitTopicSignals(
  sourceMetadata: KnowledgeBaseClusterSourceMetadata | undefined,
) {
  if (sourceMetadata === undefined) return [];
  const metadata = sourceMetadata.metadata;
  const keys = [
    "topic",
    "topics",
    "auto_topic",
    "user_topic",
    "keywords",
    "keyword",
    "tags",
    "tag",
    "concepts",
    "concept",
    "methods",
    "method",
    "datasets",
    "dataset",
    "domains",
    "domain",
    "categories",
    "subjects",
  ];
  const signals = keys.flatMap((key) => knowledgeBaseMetadataSignalValues(metadata[key]));
  return normalizeKnowledgeBaseTopicSignals(signals);
}

function knowledgeBaseMetadataSignalValues(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[,;|]/u)
      .map((part) => normalizeText(part))
      .filter((part) => part.length > 0);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => knowledgeBaseMetadataSignalValues(item));
  }
  if (isRecord(value)) {
    const label = value.label ?? value.name ?? value.title ?? value.canonical ?? value.value;
    return knowledgeBaseMetadataSignalValues(label);
  }
  return [];
}

function normalizeKnowledgeBaseTopicSignals(values: string[]) {
  const seen = new Set<string>();
  const signals: string[] = [];
  for (const value of values) {
    const normalized = truncateKnowledgeBaseClusterText(
      value,
      knowledgeBaseSemanticClusterLabelMaxChars,
    );
    if (normalized.length === 0) continue;
    const lower = normalized.toLowerCase();
    if (keywordIndexStopWords.has(lower) || /^\d+$/u.test(lower)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    signals.push(normalized);
    if (signals.length >= 6) break;
  }
  return signals;
}

function knowledgeBaseMetadataTextTerms(values: Array<string | undefined>, maxTerms: number) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const text = normalizeText(value ?? "").toLowerCase();
    for (const term of text.match(/[\p{L}\p{N}][\p{L}\p{N}-]{2,}/gu) ?? []) {
      if (keywordIndexStopWords.has(term) || /^\d+$/u.test(term)) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, maxTerms)
    .map(([term]) => term);
}

function knowledgeBaseSemanticEmbeddingClusterLabel(
  items: RetrieveSourceItem[],
  metadataBySourceId: Map<string, KnowledgeBaseClusterSourceMetadata>,
) {
  const venues = mostFrequentKnowledgeBaseClusterValues(
    items.flatMap((item) => {
      const metadata = metadataBySourceId.get(item.id);
      const venue = knowledgeBaseSourceVenue(metadata?.metadata);
      return venue === undefined ? [] : [venue];
    }),
  );
  const years = mostFrequentKnowledgeBaseClusterValues(
    items.flatMap((item) => {
      const year = knowledgeBaseSourceYear(metadataBySourceId.get(item.id));
      return year === undefined ? [] : [year];
    }),
  );
  const sourceTypes = mostFrequentKnowledgeBaseClusterValues(
    items.map((item) => {
      const metadata = metadataBySourceId.get(item.id);
      return sourceTypeClusterLabel(metadata?.sourceType, item.sourceKind);
    }),
  );
  if (venues[0] !== undefined && years[0] !== undefined) {
    return truncateKnowledgeBaseClusterText(
      `${years[0].value} / ${venues[0].value}`,
      knowledgeBaseSemanticClusterLabelMaxChars,
    );
  }
  if (venues[0] !== undefined) {
    return truncateKnowledgeBaseClusterText(
      venues[0].value,
      knowledgeBaseSemanticClusterLabelMaxChars,
    );
  }
  const titleTerms = knowledgeBaseSemanticTitleTerms(items, metadataBySourceId);
  if (titleTerms.length > 0) {
    return truncateKnowledgeBaseClusterText(
      titleTerms.map(titleCaseClusterTerm).join(" "),
      knowledgeBaseSemanticClusterLabelMaxChars,
    );
  }
  if (years[0] !== undefined && sourceTypes[0] !== undefined) {
    return truncateKnowledgeBaseClusterText(
      `${years[0].value} / ${sourceTypes[0].value}`,
      knowledgeBaseSemanticClusterLabelMaxChars,
    );
  }
  return sourceTypes[0]?.value ?? "Semantic cluster";
}

function knowledgeBaseSemanticClusterSummary(
  items: RetrieveSourceItem[],
  metadataBySourceId: Map<string, KnowledgeBaseClusterSourceMetadata>,
) {
  const signals = knowledgeBaseClusterSignalParts(items, metadataBySourceId);
  const examples = items
    .map((item) => knowledgeBaseClusterSourceTitle(item, metadataBySourceId.get(item.id)))
    .filter((title) => title.length > 0)
    .slice(0, 2);
  return truncateKnowledgeBaseClusterText(
    [
      `${items.length} source${items.length === 1 ? "" : "s"}`,
      signals.length > 0 ? `signals: ${signals.join(", ")}` : "",
      examples.length > 0 ? `examples: ${examples.join("; ")}` : "",
    ]
      .filter((part) => part.length > 0)
      .join(" / "),
    knowledgeBaseSemanticClusterSummaryMaxChars,
  );
}

function knowledgeBaseMetadataClusterSummary(
  items: RetrieveSourceItem[],
  metadataBySourceId: Map<string, KnowledgeBaseClusterSourceMetadata>,
) {
  const signals = knowledgeBaseClusterSignalParts(items, metadataBySourceId);
  return truncateKnowledgeBaseClusterText(
    [
      `${items.length} source${items.length === 1 ? "" : "s"}`,
      signals.length > 0 ? `metadata: ${signals.join(", ")}` : "metadata fallback",
    ].join(" / "),
    knowledgeBaseSemanticClusterSummaryMaxChars,
  );
}

function knowledgeBaseClusterSignalParts(
  items: RetrieveSourceItem[],
  metadataBySourceId: Map<string, KnowledgeBaseClusterSourceMetadata>,
) {
  const venues = mostFrequentKnowledgeBaseClusterValues(
    items.flatMap((item) => {
      const value = knowledgeBaseSourceVenue(metadataBySourceId.get(item.id)?.metadata);
      return value === undefined ? [] : [value];
    }),
  );
  const years = mostFrequentKnowledgeBaseClusterValues(
    items.flatMap((item) => {
      const value = knowledgeBaseSourceYear(metadataBySourceId.get(item.id));
      return value === undefined ? [] : [value];
    }),
  );
  const sourceTypes = mostFrequentKnowledgeBaseClusterValues(
    items.map((item) => {
      const metadata = metadataBySourceId.get(item.id);
      return sourceTypeClusterLabel(metadata?.sourceType, item.sourceKind);
    }),
  );
  return [
    venues[0] === undefined ? "" : venues[0].value,
    years[0] === undefined ? "" : years[0].value,
    sourceTypes[0] === undefined ? "" : sourceTypes[0].value,
  ].filter((part) => part.length > 0);
}

function knowledgeBaseSemanticTitleTerms(
  items: RetrieveSourceItem[],
  metadataBySourceId: Map<string, KnowledgeBaseClusterSourceMetadata>,
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const title = knowledgeBaseClusterSourceTitle(item, metadataBySourceId.get(item.id));
    for (const term of title.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? []) {
      if (keywordIndexStopWords.has(term)) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([term]) => term);
}

function knowledgeBaseClusterSourceTitle(
  item: RetrieveSourceItem,
  sourceMetadata: KnowledgeBaseClusterSourceMetadata | undefined,
) {
  return truncateKnowledgeBaseClusterText(
    normalizeText(sourceMetadata?.metaTitle || sourceMetadata?.sourceTitle || item.sourceTitle),
    knowledgeBaseSemanticClusterLabelMaxChars,
  );
}

function mostFrequentKnowledgeBaseClusterValues(values: string[]) {
  const counts = new Map<string, { value: string; count: number }>();
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized.length === 0) continue;
    const key = normalized.toLowerCase();
    const existing = counts.get(key);
    if (existing === undefined) {
      counts.set(key, { value: normalized, count: 1 });
    } else {
      existing.count += 1;
    }
  }
  return Array.from(counts.values()).sort(
    (left, right) => right.count - left.count || left.value.localeCompare(right.value),
  );
}

function titleCaseClusterTerm(term: string) {
  return `${term.slice(0, 1).toUpperCase()}${term.slice(1).toLowerCase()}`;
}

function truncateKnowledgeBaseClusterText(input: string, maxChars: number) {
  const text = normalizeText(input);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function loadKnowledgeBaseClusterMetadata(db: SqliteDb, sourceIds: string[]) {
  const uniqueIds = Array.from(new Set(sourceIds.filter((id) => id.length > 0))).slice(0, 80);
  const metadataBySourceId = new Map<string, KnowledgeBaseClusterSourceMetadata>();
  if (uniqueIds.length === 0) return metadataBySourceId;
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const rows = db.selectObjects(
    `SELECT
       s.id,
       s.source_type,
       s.source_title,
       s.captured_at,
       sm.title AS meta_title,
       sm.abstract AS meta_abstract,
       sm.metadata_json
     FROM sources s
     LEFT JOIN source_metadata sm ON sm.source_id = s.id
     WHERE s.id IN (${placeholders})
       AND s.lifecycle_status <> 'deleted'`,
    uniqueIds,
  );
  for (const row of rows) {
    const sourceId = stringField(row, "id");
    if (sourceId.length === 0) continue;
    metadataBySourceId.set(sourceId, {
      sourceId,
      sourceType: stringField(row, "source_type"),
      sourceTitle: stringField(row, "source_title"),
      metaTitle: stringField(row, "meta_title"),
      abstract: stringField(row, "meta_abstract"),
      capturedAt: stringField(row, "captured_at"),
      metadata: parseMetadata(stringField(row, "metadata_json")),
    });
  }
  return metadataBySourceId;
}

function knowledgeBaseClusterLabel(
  clusterBy: KnowledgeBaseEngineClusterBy,
  item: RetrieveSourceItem,
  sourceMetadata: KnowledgeBaseClusterSourceMetadata | undefined,
) {
  switch (clusterBy) {
    case "year":
      return knowledgeBaseSourceYear(sourceMetadata) ?? "Unknown year";
    case "venue":
      return (
        knowledgeBaseSourceVenue(sourceMetadata?.metadata) ??
        sourceTypeClusterLabel(sourceMetadata?.sourceType, item.sourceKind)
      );
    case "source_type":
      return sourceTypeClusterLabel(sourceMetadata?.sourceType, item.sourceKind);
    case "semantic":
      return semanticFallbackClusterLabel(item, sourceMetadata);
    case "topic":
      return knowledgeBaseSourceTopicSignal(item, sourceMetadata).label;
  }
}

function semanticFallbackClusterLabel(
  item: RetrieveSourceItem,
  sourceMetadata: KnowledgeBaseClusterSourceMetadata | undefined,
) {
  const year = knowledgeBaseSourceYear(sourceMetadata);
  const venue = knowledgeBaseSourceVenue(sourceMetadata?.metadata);
  if (year !== undefined && venue !== undefined) return `${year} / ${venue}`;
  if (venue !== undefined) return venue;
  if (year !== undefined) return year;
  return sourceTypeClusterLabel(sourceMetadata?.sourceType, item.sourceKind);
}

function knowledgeBaseSourceYear(sourceMetadata: KnowledgeBaseClusterSourceMetadata | undefined) {
  if (sourceMetadata === undefined) return undefined;
  const metadataYear =
    metadataInteger(sourceMetadata.metadata, "year") ??
    metadataInteger(sourceMetadata.metadata, "published_year");
  if (metadataYear !== undefined) return String(metadataYear);
  const arxivYear = parseExplicitArxivMetadata(sourceMetadata.metadata).year;
  if (arxivYear !== undefined) return String(arxivYear);
  const capturedYear = new Date(sourceMetadata.capturedAt).getUTCFullYear();
  return isReasonablePaperYear(capturedYear) ? String(capturedYear) : undefined;
}

function knowledgeBaseSourceVenue(metadata: Record<string, unknown> | undefined) {
  if (metadata === undefined) return undefined;
  return parseMetadataVenue(metadata);
}

function sourceTypeClusterLabel(sourceType: string | undefined, fallbackKind: SourceKind) {
  const normalized = normalizeText(sourceType ?? "");
  const rawLabel = normalized.length > 0 ? normalized : fallbackKind;
  if (rawLabel.toLowerCase() === "pdf") return "PDF";
  const words = rawLabel
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return "Unknown type";
  return words
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function knowledgeBaseClusterId(clusterBy: KnowledgeBaseEngineClusterBy, label: string) {
  return `kb-cluster:${clusterBy}:${stableHashNumber(label).toString(36)}`;
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

function orchestrationRunFromRow(row: SqlRow): OrchestrationRunSummary {
  const retryOfRunId = optionalString(row, "retry_of_run_id");
  const lastError = optionalString(row, "last_error");
  const startedAt = optionalString(row, "started_at");
  const finishedAt = optionalString(row, "finished_at");
  return {
    id: stringField(row, "id"),
    kind: orchestrationKindField(row, "kind"),
    status: orchestrationRunStatusField(row, "status"),
    targetJobId: stringField(row, "target_job_id"),
    progressCurrent: Math.max(0, numberField(row, "progress_current")),
    progressTotal: Math.max(1, numberField(row, "progress_total")),
    cancelRequested: numberField(row, "cancel_requested") !== 0,
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
    ...(retryOfRunId === undefined ? {} : { retryOfRunId }),
    ...(lastError === undefined ? {} : { lastError }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(finishedAt === undefined ? {} : { finishedAt }),
  };
}

function orchestrationEventFromRow(row: SqlRow): OrchestrationEvent {
  return {
    id: stringField(row, "id"),
    runId: stringField(row, "run_id"),
    kind: orchestrationEventKindField(row, "kind"),
    level: orchestrationEventLevelField(row, "level"),
    message: stringField(row, "message"),
    detail: parseMetadata(stringField(row, "detail_json")),
    createdAt: stringField(row, "created_at"),
  };
}

function loadOrchestrationRunOrThrow(db: SqliteDb, id: string): OrchestrationRunSummary {
  const row = db.selectObject("SELECT * FROM orchestration_runs WHERE id = ? LIMIT 1", [id]);
  if (row === undefined) {
    throw new EngineRpcError("ORCHESTRATION_NOT_FOUND", `Orchestration run not found: ${id}`);
  }
  return orchestrationRunFromRow(row);
}

function orchestrationRunWhereClause(filter: OrchestrationRunFilter) {
  const clauses: string[] = [];
  const bind: unknown[] = [];
  if (filter.kind !== undefined) {
    clauses.push("kind = ?");
    bind.push(filter.kind);
  }
  if (filter.status !== undefined) {
    clauses.push("status = ?");
    bind.push(filter.status);
  }
  if (filter.targetJobId !== undefined && normalizeText(filter.targetJobId).length > 0) {
    clauses.push("target_job_id = ?");
    bind.push(normalizeText(filter.targetJobId));
  }
  return {
    sql: clauses.length === 0 ? "" : `WHERE ${clauses.join(" AND ")}`,
    bind,
  };
}

function insertOrchestrationEvent(
  db: SqliteDb,
  input: {
    runId: string;
    kind: OrchestrationEventKind;
    level?: OrchestrationEventLevel;
    message: string;
    detail?: Record<string, unknown>;
    createdAt?: string;
  },
): OrchestrationEvent {
  const id = createId("orch_evt");
  const createdAt = input.createdAt ?? new Date().toISOString();
  const message = boundedNormalizedText(input.message, 1_000);
  db.exec({
    sql: `INSERT INTO orchestration_events (
      id,
      run_id,
      kind,
      level,
      message,
      detail_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    bind: [
      id,
      input.runId,
      input.kind,
      input.level ?? "info",
      message,
      JSON.stringify(boundAuditPayload(input.detail ?? {})),
      createdAt,
    ],
  });
  const row = db.selectObject("SELECT * FROM orchestration_events WHERE id = ? LIMIT 1", [id]);
  if (row === undefined) {
    throw new EngineRpcError(
      "ORCHESTRATION_EVENT_CREATE_FAILED",
      "Orchestration event was not saved.",
    );
  }
  return orchestrationEventFromRow(row);
}

function isTerminalOrchestrationStatus(status: OrchestrationRunStatus) {
  return status === "done" || status === "failed" || status === "cancelled";
}

function sourceContextMapRunFromRow(row: SqlRow): SourceContextMapRunSummary {
  const sessionId = optionalString(row, "session_id");
  const mode = optionalSourceContextMapMode(row, "mode");
  const retryOfRunId = optionalString(row, "retry_of_run_id");
  const lastError = optionalString(row, "last_error");
  const startedAt = optionalString(row, "started_at");
  const finishedAt = optionalString(row, "finished_at");
  return {
    id: stringField(row, "id"),
    ...(sessionId === undefined ? {} : { sessionId }),
    ownerRunId: stringField(row, "owner_run_id"),
    ...(mode === undefined ? {} : { mode }),
    status: sourceContextMapRunStatusField(row, "status"),
    planSignature: stringField(row, "plan_signature"),
    maxConcurrentMaps: Math.max(1, numberField(row, "max_concurrent_maps")),
    progressCurrent: Math.max(0, numberField(row, "progress_current")),
    progressTotal: Math.max(0, numberField(row, "progress_total")),
    cancelRequested: numberField(row, "cancel_requested") !== 0,
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
    ...(retryOfRunId === undefined ? {} : { retryOfRunId }),
    ...(lastError === undefined ? {} : { lastError }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(finishedAt === undefined ? {} : { finishedAt }),
  };
}

function sourceContextMapStepFromRow(row: SqlRow): SourceContextMapStepRecord {
  const outputSummary = optionalString(row, "output_summary");
  const artifactId = optionalString(row, "artifact_id");
  const errorCode = optionalString(row, "error_code");
  const errorMessage = optionalString(row, "error_message");
  const claimedAt = optionalString(row, "claimed_at");
  const completedAt = optionalString(row, "completed_at");
  return {
    id: stringField(row, "id"),
    runId: stringField(row, "run_id"),
    groupId: stringField(row, "group_id"),
    groupIndex: Math.max(0, numberField(row, "group_index")),
    status: sourceContextMapStepStatusField(row, "status"),
    stepSignature: stringField(row, "step_signature"),
    sourceIds: parseStringArray(stringField(row, "source_ids_json")),
    windowRefs: parseSourceContextMapArtifactWindowRefs(stringField(row, "window_refs_json")),
    evidenceIds: parseStringArray(stringField(row, "evidence_ids_json")),
    tokenEstimate: Math.max(0, numberField(row, "token_estimate")),
    inputSummary: stringField(row, "input_summary"),
    attemptCount: Math.max(0, numberField(row, "attempt_count")),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
    ...(outputSummary === undefined || outputSummary.length === 0 ? {} : { outputSummary }),
    ...(artifactId === undefined ? {} : { artifactId }),
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(errorMessage === undefined ? {} : { errorMessage }),
    ...(claimedAt === undefined ? {} : { claimedAt }),
    ...(completedAt === undefined ? {} : { completedAt }),
  };
}

function sourceContextMapEventFromRow(row: SqlRow): SourceContextMapEvent {
  const stepId = optionalString(row, "step_id");
  return {
    id: stringField(row, "id"),
    runId: stringField(row, "run_id"),
    ...(stepId === undefined ? {} : { stepId }),
    kind: sourceContextMapEventKindField(row, "kind"),
    level: sourceContextMapEventLevelField(row, "level"),
    message: stringField(row, "message"),
    detail: parseMetadata(stringField(row, "detail_json")),
    createdAt: stringField(row, "created_at"),
  };
}

function loadSourceContextMapRunDetail(
  db: SqliteDb,
  idInput: string,
): SourceContextMapRunDetail | null {
  const id = normalizeText(idInput);
  const row = db.selectObject("SELECT * FROM source_context_map_runs WHERE id = ? LIMIT 1", [id]);
  if (row === undefined) return null;
  return {
    ...sourceContextMapRunFromRow(row),
    steps: loadSourceContextMapRunSteps(db, id),
  };
}

function loadSourceContextMapRunDetailOrThrow(db: SqliteDb, id: string): SourceContextMapRunDetail {
  const detail = loadSourceContextMapRunDetail(db, id);
  if (detail === null) {
    throw new EngineRpcError("SOURCE_CONTEXT_MAP_RUN_NOT_FOUND", `Map run not found: ${id}`);
  }
  return detail;
}

function loadSourceContextMapRunOrThrow(db: SqliteDb, idInput: string): SourceContextMapRunSummary {
  const id = normalizeText(idInput);
  const row = db.selectObject("SELECT * FROM source_context_map_runs WHERE id = ? LIMIT 1", [id]);
  if (row === undefined) {
    throw new EngineRpcError("SOURCE_CONTEXT_MAP_RUN_NOT_FOUND", `Map run not found: ${id}`);
  }
  return sourceContextMapRunFromRow(row);
}

function loadSourceContextMapStepOrThrow(
  db: SqliteDb,
  idInput: string,
): SourceContextMapStepRecord {
  const id = normalizeText(idInput);
  const row = db.selectObject("SELECT * FROM source_context_map_steps WHERE id = ? LIMIT 1", [id]);
  if (row === undefined) {
    throw new EngineRpcError("SOURCE_CONTEXT_MAP_STEP_NOT_FOUND", `Map step not found: ${id}`);
  }
  return sourceContextMapStepFromRow(row);
}

function loadSourceContextMapRunSteps(db: SqliteDb, runId: string): SourceContextMapStepRecord[] {
  const rows = db.selectObjects(
    `SELECT *
     FROM source_context_map_steps
     WHERE run_id = ?
     ORDER BY group_index ASC, created_at ASC`,
    [runId],
  );
  return rows.map(sourceContextMapStepFromRow);
}

function sourceContextMapRunWhereClause(filter: SourceContextMapRunFilter) {
  const clauses: string[] = [];
  const bind: unknown[] = [];
  if (filter.sessionId !== undefined && normalizeText(filter.sessionId).length > 0) {
    clauses.push("session_id = ?");
    bind.push(normalizeText(filter.sessionId));
  }
  if (filter.ownerRunId !== undefined && normalizeText(filter.ownerRunId).length > 0) {
    clauses.push("owner_run_id = ?");
    bind.push(normalizeText(filter.ownerRunId));
  }
  if (filter.status !== undefined) {
    clauses.push("status = ?");
    bind.push(filter.status);
  }
  return {
    sql: clauses.length === 0 ? "" : `WHERE ${clauses.join(" AND ")}`,
    bind,
  };
}

function insertSourceContextMapEvent(
  db: SqliteDb,
  input: {
    runId: string;
    stepId?: string;
    kind: SourceContextMapEventKind;
    level?: SourceContextMapEventLevel;
    message: string;
    detail?: Record<string, unknown>;
    createdAt?: string;
  },
): SourceContextMapEvent {
  const id = createId("sctx_map_evt");
  const createdAt = input.createdAt ?? new Date().toISOString();
  db.exec({
    sql: `INSERT INTO source_context_map_events (
      id,
      run_id,
      step_id,
      kind,
      level,
      message,
      detail_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    bind: [
      id,
      input.runId,
      input.stepId ?? null,
      input.kind,
      input.level ?? "info",
      boundedNormalizedText(input.message, 1_000),
      JSON.stringify(boundAuditPayload(input.detail ?? {})),
      createdAt,
    ],
  });
  const row = db.selectObject("SELECT * FROM source_context_map_events WHERE id = ? LIMIT 1", [id]);
  if (row === undefined) {
    throw new EngineRpcError(
      "SOURCE_CONTEXT_MAP_EVENT_CREATE_FAILED",
      "Source context map event was not saved.",
    );
  }
  return sourceContextMapEventFromRow(row);
}

function refreshSourceContextMapRunProgress(
  db: SqliteDb,
  runId: string,
  now = new Date().toISOString(),
): SourceContextMapRunSummary {
  const completed = Number(
    db.selectValue(
      "SELECT COUNT(*) FROM source_context_map_steps WHERE run_id = ? AND status = 'completed'",
      [runId],
    ) ?? 0,
  );
  const total = Number(
    db.selectValue("SELECT COUNT(*) FROM source_context_map_steps WHERE run_id = ?", [runId]) ?? 0,
  );
  db.exec({
    sql: `UPDATE source_context_map_runs
          SET progress_current = ?,
              progress_total = ?,
              updated_at = ?
          WHERE id = ?`,
    bind: [completed, total, now, runId],
  });
  return loadSourceContextMapRunOrThrow(db, runId);
}

function finishCancelledSourceContextMapRun(
  db: SqliteDb,
  runId: string,
  message: string,
  now = new Date().toISOString(),
): SourceContextMapRunSummary {
  db.exec({
    sql: `UPDATE source_context_map_steps
          SET status = 'cancelled',
              updated_at = ?
          WHERE run_id = ?
            AND status IN ('queued', 'running', 'failed')`,
    bind: [now, runId],
  });
  db.exec({
    sql: `UPDATE source_context_map_runs
          SET status = 'cancelled',
              cancel_requested = 1,
              updated_at = ?,
              finished_at = ?,
              last_error = NULL
          WHERE id = ?`,
    bind: [now, now, runId],
  });
  insertSourceContextMapEvent(db, {
    runId,
    kind: "cancelled",
    level: "warning",
    message,
    detail: {},
    createdAt: now,
  });
  return refreshSourceContextMapRunProgress(db, runId, now);
}

function normalizeSourceContextMapStepPlans(
  steps: SourceContextMapStepPlan[],
): SourceContextMapStepPlan[] {
  const byGroupIndex = new Map<number, SourceContextMapStepPlan>();
  for (const step of steps) {
    const groupIndex = Math.max(0, Math.floor(step.groupIndex));
    const groupId = normalizeText(step.groupId).slice(0, 160);
    const stepSignature = normalizeText(step.stepSignature).slice(0, 512);
    if (groupId.length === 0 || stepSignature.length === 0) continue;
    byGroupIndex.set(groupIndex, {
      groupId,
      groupIndex,
      sourceIds: boundedArtifactStrings(step.sourceIds, 100),
      windowRefs: boundedSourceContextMapArtifactWindowRefs(step.windowRefs, 300),
      evidenceIds: boundedArtifactStrings(step.evidenceIds, 300),
      tokenEstimate: Math.max(0, Math.floor(step.tokenEstimate)),
      inputSummary: normalizeOptionalArtifactText(step.inputSummary, 2_000),
      stepSignature,
    });
  }
  return [...byGroupIndex.values()].sort((left, right) => left.groupIndex - right.groupIndex);
}

function sourceContextMapPlanSourceIds(steps: SourceContextMapStepPlan[]) {
  const seen = new Set<string>();
  for (const step of steps) {
    for (const sourceId of step.sourceIds) {
      if (seen.size >= 200) break;
      seen.add(sourceId);
    }
  }
  return [...seen];
}

function normalizeSourceContextMaxConcurrentMaps(value: number | undefined) {
  const raw = value ?? 1;
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.max(1, Math.min(4, Math.floor(raw)));
}

function isTerminalSourceContextMapRunStatus(status: SourceContextMapRunStatus) {
  return status === "done" || status === "failed" || status === "cancelled";
}

function assertChatSessionExists(db: SqliteDb, sessionId: string) {
  const normalized = normalizeText(sessionId);
  const session = db.selectObject("SELECT id FROM sessions WHERE id = ? LIMIT 1", [normalized]);
  if (session === undefined) {
    throw new EngineRpcError("SESSION_NOT_FOUND", `Chat session not found: ${normalized}`);
  }
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

function sourceContextCompressionLogRecordFromRow(row: SqlRow): SourceContextCompressionLogRecord {
  const sessionId = optionalString(row, "session_id");
  const runId = optionalString(row, "run_id");
  const sourceId = optionalString(row, "source_id");
  const chunkId = optionalString(row, "chunk_id");
  const requestedLoadDepth = optionalWorkingSetLoadDepth(row, "requested_load_depth");
  const selectedLoadDepth = optionalWorkingSetLoadDepth(row, "selected_load_depth");
  const tokenEstimate = optionalNumber(row, "token_estimate");
  const omittedTokenEstimate = optionalNumber(row, "omitted_token_estimate");
  const omittedWindowCount = optionalNumber(row, "omitted_window_count");
  return {
    id: stringField(row, "id"),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(runId === undefined ? {} : { runId }),
    reason: sourceContextCompressionReasonField(row, "reason"),
    message: stringField(row, "message"),
    ...(sourceId === undefined ? {} : { sourceId }),
    ...(chunkId === undefined ? {} : { chunkId }),
    ...(requestedLoadDepth === undefined ? {} : { requestedLoadDepth }),
    ...(selectedLoadDepth === undefined ? {} : { selectedLoadDepth }),
    ...(tokenEstimate === undefined ? {} : { tokenEstimate }),
    ...(omittedTokenEstimate === undefined ? {} : { omittedTokenEstimate }),
    ...(omittedWindowCount === undefined ? {} : { omittedWindowCount }),
    lostInfoTypes: parseSourceContextLostInfoTypes(
      stringField(row, "lost_info_types_json"),
      sourceContextCompressionReasonField(row, "reason"),
    ),
    createdAt: stringField(row, "created_at"),
  };
}

function sourceContextMapArtifactRecordFromRow(row: SqlRow): SourceContextMapArtifactRecord {
  const sessionId = optionalString(row, "session_id");
  const groupId = optionalString(row, "group_id");
  const groupIndex = optionalNumber(row, "group_index");
  const tokenEstimate = optionalNumber(row, "token_estimate");
  const inputSummary = optionalString(row, "input_summary");
  const outputSummary = optionalString(row, "output_summary");
  const errorCode = optionalString(row, "error_code");
  const errorMessage = optionalString(row, "error_message");
  return {
    id: stringField(row, "id"),
    ...(sessionId === undefined ? {} : { sessionId }),
    runId: stringField(row, "run_id"),
    stage: sourceContextMapArtifactStageField(row, "stage"),
    status: sourceContextMapArtifactStatusField(row, "status"),
    ...(groupId === undefined ? {} : { groupId }),
    ...(groupIndex === undefined ? {} : { groupIndex }),
    sourceIds: parseStringArray(stringField(row, "source_ids_json")),
    windowRefs: parseSourceContextMapArtifactWindowRefs(stringField(row, "window_refs_json")),
    evidenceIds: parseStringArray(stringField(row, "evidence_ids_json")),
    ...(tokenEstimate === undefined ? {} : { tokenEstimate }),
    ...(inputSummary === undefined ? {} : { inputSummary }),
    ...(outputSummary === undefined ? {} : { outputSummary }),
    mapArtifactIds: parseStringArray(stringField(row, "map_artifact_ids_json")),
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(errorMessage === undefined ? {} : { errorMessage }),
    createdAt: stringField(row, "created_at"),
  };
}

function chunkMetaTier2AuditRecordFromRow(row: SqlRow): ChunkMetaTier2AuditRecord {
  const jobId = optionalString(row, "job_id");
  const providerKind = optionalChunkMetaTier2AuditProvider(row, "provider_kind");
  const reason = optionalString(row, "reason");
  const sectionSummaryChars = optionalNumber(row, "section_summary_chars");
  const chunkSummaryChars = optionalNumber(row, "chunk_summary_chars");
  const semanticRelationCount = optionalNumber(row, "semantic_relation_count");
  return {
    id: stringField(row, "id"),
    sourceId: stringField(row, "source_id"),
    chunkId: stringField(row, "chunk_id"),
    ...(jobId === undefined ? {} : { jobId }),
    tier: "tier2",
    status: chunkMetaTier2AuditStatusField(row, "status"),
    ...(providerKind === undefined ? {} : { providerKind }),
    ...(reason === undefined ? {} : { reason }),
    ...(sectionSummaryChars === undefined ? {} : { sectionSummaryChars }),
    ...(chunkSummaryChars === undefined ? {} : { chunkSummaryChars }),
    ...(semanticRelationCount === undefined ? {} : { semanticRelationCount }),
    createdAt: stringField(row, "created_at"),
    updatedAt: stringField(row, "updated_at"),
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

function parseSourceContextMapArtifactWindowRefs(
  input: string,
): NonNullable<SourceContextMapArtifactEntry["windowRefs"]> {
  return parseJsonArray(input).flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.sourceId !== "string" || typeof record.chunkId !== "string") return [];
    return [
      {
        sourceId: record.sourceId,
        chunkId: record.chunkId,
        ...(typeof record.ord === "number" && Number.isFinite(record.ord)
          ? { ord: Math.floor(record.ord) }
          : {}),
      },
    ];
  });
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

function optionalWorkingSetLoadDepth(row: SqlRow, key: string): WorkingSetLoadDepth | undefined {
  const value = optionalString(row, key);
  if (value === undefined) return undefined;
  if (value === "outline" || value === "chunks" || value === "full") return value;
  if (value === "meta") return value;
  return undefined;
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

function orchestrationKindField(row: SqlRow, key: string): OrchestrationKind {
  const value = stringField(row, key);
  if (value === "post_capture_job") return value;
  return "post_capture_job";
}

function orchestrationRunStatusField(row: SqlRow, key: string): OrchestrationRunStatus {
  const value = stringField(row, key);
  if (value === "running" || value === "done" || value === "failed" || value === "cancelled") {
    return value;
  }
  return "queued";
}

function orchestrationEventKindField(row: SqlRow, key: string): OrchestrationEventKind {
  const value = stringField(row, key);
  if (
    value === "claimed" ||
    value === "progress" ||
    value === "job_started" ||
    value === "job_completed" ||
    value === "cancel_requested" ||
    value === "cancelled" ||
    value === "failed" ||
    value === "retry_created"
  ) {
    return value;
  }
  return "queued";
}

function orchestrationEventLevelField(row: SqlRow, key: string): OrchestrationEventLevel {
  const value = stringField(row, key);
  if (value === "warning" || value === "error") return value;
  return "info";
}

function optionalSourceContextMapMode(
  row: SqlRow,
  key: string,
): SourceContextMapRunSummary["mode"] | undefined {
  const value = optionalString(row, key);
  return value === "research" || value === "auto" ? value : undefined;
}

function sourceContextMapRunStatusField(row: SqlRow, key: string): SourceContextMapRunStatus {
  const value = stringField(row, key);
  if (
    value === "running" ||
    value === "reducing" ||
    value === "done" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "queued";
}

function sourceContextMapStepStatusField(row: SqlRow, key: string): SourceContextMapStepStatus {
  const value = stringField(row, key);
  if (value === "running" || value === "completed" || value === "failed" || value === "cancelled") {
    return value;
  }
  return "queued";
}

function sourceContextMapEventKindField(row: SqlRow, key: string): SourceContextMapEventKind {
  const value = stringField(row, key);
  if (
    value === "resumed" ||
    value === "step_claimed" ||
    value === "step_completed" ||
    value === "step_failed" ||
    value === "reduce_started" ||
    value === "reduce_completed" ||
    value === "reduce_failed" ||
    value === "cancel_requested" ||
    value === "cancelled" ||
    value === "retry_created"
  ) {
    return value;
  }
  return "queued";
}

function sourceContextMapEventLevelField(row: SqlRow, key: string): SourceContextMapEventLevel {
  const value = stringField(row, key);
  if (value === "warning" || value === "error") return value;
  return "info";
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
  if (value === "reindex_embeddings") return value;
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

function sourceContextCompressionReasonField(
  row: SqlRow,
  key: string,
): SourceContextCompressionLogEntry["reason"] {
  const value = stringField(row, key);
  if (
    value === "query_no_hits" ||
    value === "source_not_found" ||
    value === "source_over_budget" ||
    value === "source_downgraded" ||
    value === "chunk_window_omitted" ||
    value === "parent_context_selected" ||
    value === "full_depth_bounded" ||
    value === "group_limit_reached"
  ) {
    return value;
  }
  return "chunk_window_omitted";
}

function sourceContextMapArtifactStageField(
  row: SqlRow,
  key: string,
): SourceContextMapArtifactStage {
  const value = stringField(row, key);
  return value === "reduce" ? "reduce" : "map";
}

function sourceContextMapArtifactStatusField(
  row: SqlRow,
  key: string,
): SourceContextMapArtifactStatus {
  const value = stringField(row, key);
  if (value === "completed" || value === "failed") return value;
  return "started";
}

function chunkMetaTier2AuditStatusField(row: SqlRow, key: string): ChunkMetaTier2AuditStatus {
  const value = stringField(row, key);
  if (value === "summarized" || value === "unavailable" || value === "error") return value;
  return "skipped";
}

function optionalChunkMetaTier2AuditProvider(row: SqlRow, key: string): "chat" | undefined {
  return stringField(row, key) === "chat" ? "chat" : undefined;
}

function agentScopeField(row: SqlRow, key: string): ChatMessageRecord["scope"] {
  const value = stringField(row, key);
  if (value === "general" || value === "selection") return value;
  return "current-page";
}

function optionalNumber(row: SqlRow, key: string) {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  const parsed = numberField(row, key);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function finiteNumberOrNull(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : null;
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

function normalizeOptionalArtifactText(value: string | undefined, maxLength: number) {
  if (value === undefined) return undefined;
  const normalized = normalizeText(value);
  return normalized.length === 0 ? undefined : normalized.slice(0, maxLength);
}

function normalizeOptionalAuditId(value: string | undefined) {
  if (value === undefined) return undefined;
  const normalized = normalizeText(value).slice(0, 240);
  return normalized.length === 0 ? undefined : normalized;
}

function boundedArtifactStrings(values: string[] | undefined, max: number) {
  if (values === undefined) return [];
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const normalized = normalizeText(value).slice(0, 240);
    if (normalized.length === 0 || seen.has(normalized) || seen.size >= max) return [];
    seen.add(normalized);
    return [normalized];
  });
}

function boundedSourceContextMapArtifactWindowRefs(
  refs: SourceContextMapArtifactEntry["windowRefs"],
  max: number,
) {
  if (refs === undefined) return [];
  const seen = new Set<string>();
  return refs.flatMap((ref) => {
    const sourceId = normalizeText(ref.sourceId).slice(0, 240);
    const chunkId = normalizeText(ref.chunkId).slice(0, 240);
    const key = `${sourceId}\n${chunkId}\n${ref.ord ?? ""}`;
    if (sourceId.length === 0 || chunkId.length === 0 || seen.has(key) || seen.size >= max) {
      return [];
    }
    seen.add(key);
    return [
      {
        sourceId,
        chunkId,
        ...(typeof ref.ord === "number" && Number.isFinite(ref.ord)
          ? { ord: Math.floor(ref.ord) }
          : {}),
      },
    ];
  });
}

function sourceContextMapArtifactJsonLikePattern(value: string) {
  return `%"${escapeLikePattern(value)}"%`;
}

function deleteSourceContextMapArtifactsForSource(db: SqliteDb, sourceId: string) {
  const pattern = sourceContextMapArtifactJsonLikePattern(sourceId);
  db.exec({
    sql: `DELETE FROM source_context_map_artifacts
          WHERE source_ids_json LIKE ? ESCAPE '\\'
             OR window_refs_json LIKE ? ESCAPE '\\'`,
    bind: [pattern, pattern],
  });
}

function deleteSourceContextMapSchedulerForSource(db: SqliteDb, sourceId: string) {
  const pattern = sourceContextMapArtifactJsonLikePattern(sourceId);
  db.exec({
    sql: `DELETE FROM source_context_map_runs
          WHERE source_ids_json LIKE ? ESCAPE '\\'
             OR id IN (
               SELECT run_id
               FROM source_context_map_steps
               WHERE source_ids_json LIKE ? ESCAPE '\\'
                  OR window_refs_json LIKE ? ESCAPE '\\'
             )`,
    bind: [pattern, pattern, pattern],
  });
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
