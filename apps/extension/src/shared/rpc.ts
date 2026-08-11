import type {
  ChunkMetaSummaryInput,
  ChunkMetaSummaryResult,
} from "@/src/agent-runtime/chunk-meta-summary";
import {
  isCitationValidationReason,
  isCitationValidationResult,
} from "@/src/agent-runtime/citation-validator";
import {
  type EmbeddingReindexProviderId,
  type EmbeddingRuntimeProviderId,
  isEmbeddingReindexProviderId,
} from "@/src/agent-runtime/embedding-provider-ids";
import type {
  FigureVisionAnalysisInput,
  FigureVisionAnalysisResult,
} from "@/src/agent-runtime/figure-vision-analyzer";
import type {
  GraphExtractionInput,
  GraphExtractionResult,
} from "@/src/agent-runtime/graph-extractor";
import type {
  ImageGenerationSettings,
  SaveImageGenerationSettingsInput,
} from "@/src/agent-runtime/image-generation-settings";
import type {
  KnowledgeBaseAiSettings,
  SaveKnowledgeBaseAiSettingsInput,
} from "@/src/agent-runtime/knowledge-base-ai-settings";
import type {
  KnowledgeBaseClusterLabelRefinementInput,
  KnowledgeBaseClusterLabelRefinementResult as KnowledgeBaseClusterLabelRefinementRuntimeResult,
} from "@/src/agent-runtime/knowledge-base-cluster-label-refiner";
import type { ProviderId, ProviderSettings } from "@/src/agent-runtime/provider-settings";
import type {
  SearchOpenAICompatibleOverrideSettings,
  SearchOpenAIOverrideSettings,
  SearchProviderId,
  SearchProviderSettings,
} from "@/src/agent-runtime/search-provider-settings";
import { isSourceContextPackRequestOptions } from "@/src/agent-runtime/source-context-pack-options";
import type {
  AgentChatRequest,
  AgentErrorInfo,
  AgentScope,
  AgentStreamEvent,
  EvidenceItem,
  EvidenceSourceKind,
  LocalCitation,
} from "@/src/agent-runtime/types";
import {
  type SaveVisionProviderSettingsInput,
  type VisionProviderId,
  type VisionProviderSettings,
  isVisionProviderId,
} from "@/src/agent-runtime/vision-provider-settings";
import {
  type LocalEmbeddingModelRequest,
  type LocalEmbeddingModelResult,
  type LocalEmbeddingPurpose,
  isLocalEmbeddingModelRequest,
} from "@/src/local-embedding/contracts";
import {
  type CompleteWikiCompileReducePayload,
  type CompleteWikiCompileStepPayload,
  type CreateWikiCompileRunPayload,
  type EnqueueWikiCompileRunPayload,
  type FailWikiCompileStagePayload,
  type ListWikiCompileEventsResult,
  type ListWikiCompileRunsResult,
  type PauseWikiCompileRunPayload,
  type RecoverWikiCompileRunsPayload,
  type RecoverWikiCompileRunsResult,
  type WikiCompileClaimReduceResult,
  type WikiCompileClaimStepResult,
  type WikiCompileCreateResult,
  type WikiCompileMapInput,
  type WikiCompileReduceInput,
  type WikiCompileRunDetail,
  type WikiCompileRunFilter,
  type WikiCompileRunSummary,
  type WikiCompileStepRecord,
  isCompleteWikiCompileReducePayload,
  isCompleteWikiCompileStepPayload,
  isCreateWikiCompileRunPayload,
  isEnqueueWikiCompileRunPayload,
  isFailWikiCompileStagePayload,
  isPauseWikiCompileRunPayload,
  isRecoverWikiCompileRunsPayload,
  isWikiCompileRunFilter,
} from "@/src/shared/wiki-compile";

export type {
  CompleteWikiCompileReducePayload,
  CompleteWikiCompileStepPayload,
  CreateWikiCompileRunPayload,
  EnqueueWikiCompileRunPayload,
  FailWikiCompileStagePayload,
  ListWikiCompileEventsResult,
  ListWikiCompileRunsResult,
  PauseWikiCompileRunPayload,
  RecoverWikiCompileRunsPayload,
  RecoverWikiCompileRunsResult,
  WikiCompileBudget,
  WikiCompileCheckpoint,
  WikiCompileClaimReduceResult,
  WikiCompileClaimStepResult,
  WikiCompileCreateResult,
  WikiCompileEvent,
  WikiCompileInputManifest,
  WikiCompileMapInput,
  WikiCompileMapResult,
  WikiCompileReduceInput,
  WikiCompileReduceResult,
  WikiCompileRunDetail,
  WikiCompileRunFilter,
  WikiCompileRunStatus,
  WikiCompileRunSummary,
  WikiCompileStepPlan,
  WikiCompileStepRecord,
  WikiCompileStepStatus,
} from "@/src/shared/wiki-compile";

export const CLIO_ENGINE_REQUEST = "clio:engine:request";
export const CLIO_OFFSCREEN_REQUEST = "clio:offscreen:request";
export const CLIO_WIKI_COMPILE_WAKE = "clio:wiki-compile:wake";
export const CLIO_LOCAL_EMBEDDING_REQUEST = "clio:local-embedding:request";
export const CLIO_WORKER_REQUEST = "clio:worker:request";
export const CLIO_WORKER_RESPONSE = "clio:worker:response";
export const CLIO_WORKER_EMBEDDING_REQUEST = "clio:worker:embedding:request";
export const CLIO_WORKER_EMBEDDING_RESPONSE = "clio:worker:embedding:response";
export const CLIO_WORKER_CHUNK_META_SUMMARY_REQUEST = "clio:worker:chunk-meta-summary:request";
export const CLIO_WORKER_CHUNK_META_SUMMARY_RESPONSE = "clio:worker:chunk-meta-summary:response";
export const CLIO_WORKER_VISION_ANALYSIS_REQUEST = "clio:worker:vision-analysis:request";
export const CLIO_WORKER_VISION_ANALYSIS_RESPONSE = "clio:worker:vision-analysis:response";
export const CLIO_WORKER_GRAPH_EXTRACTION_REQUEST = "clio:worker:graph-extraction:request";
export const CLIO_WORKER_GRAPH_EXTRACTION_RESPONSE = "clio:worker:graph-extraction:response";
export const CLIO_KB_CLUSTER_LABEL_REFINEMENT_REQUEST = "clio:kb-cluster-label-refinement:request";
export const CLIO_CONTENT_COMMAND = "clio:content:command";
export const CLIO_PROVIDER_REQUEST = "clio:provider:request";
export const CLIO_PROVIDER_CONFIG_REQUEST = "clio:provider-config:request";
export const CLIO_UI_REQUEST = "clio:ui:request";
export const CLIO_AGENT_STREAM_PORT = "clio:agent:stream";
export const CLIO_AGENT_STREAM_REQUEST = "clio:agent:stream:request";
export const CLIO_AGENT_STREAM_SUBSCRIBE = "clio:agent:stream:subscribe";
export const CLIO_AGENT_STREAM_COMPACT = "clio:agent:stream:compact";
export const CLIO_AGENT_STREAM_CANCEL = "clio:agent:stream:cancel";
export const CLIO_AGENT_STREAM_EVENT = "clio:agent:stream:event";
export const CLIO_AGENT_RUN_REQUEST = "clio:agent:run:request";
export const CLIO_AGENT_RUN_EVENT = "clio:agent:run:event";
export const CLIO_WEB_SEARCH_STREAM_PORT = "clio:web-search:stream";
export const CLIO_WEB_SEARCH_STREAM_REQUEST = "clio:web-search:stream:request";
export const CLIO_WEB_SEARCH_STREAM_EVENT = "clio:web-search:stream:event";
export const CLIO_WEB_SEARCH_RUN_REQUEST = "clio:web-search:run:request";
export const CLIO_WEB_SEARCH_RUN_EVENT = "clio:web-search:run:event";
export const CLIO_IMAGE_GENERATION_STREAM_PORT = "clio:image-generation:stream";
export const CLIO_IMAGE_GENERATION_STREAM_REQUEST = "clio:image-generation:stream:request";
export const CLIO_IMAGE_GENERATION_STREAM_CANCEL = "clio:image-generation:stream:cancel";
export const CLIO_IMAGE_GENERATION_STREAM_EVENT = "clio:image-generation:stream:event";
export const CLIO_IMAGE_GENERATION_RUN_REQUEST = "clio:image-generation:run:request";
export const CLIO_IMAGE_GENERATION_RUN_EVENT = "clio:image-generation:run:event";

export type EngineHealthStatus = "starting" | "ready" | "degraded" | "error";
export type SourceKind = "page" | "selection";
export type RepairAction = "retry_init" | "rebuild_fts" | "reset_library";
export type JobStatus = "queued" | "running" | "done" | "failed";
export type JobType =
  | "reindex_fts"
  | "reindex_embeddings"
  | "resolve_anchor"
  | "post_capture_hardening";
export type OrchestrationKind = "post_capture_job";
export type OrchestrationRunStatus = "queued" | "running" | "done" | "failed" | "cancelled";
export type OrchestrationEventLevel = "info" | "warning" | "error";
export type OrchestrationEventKind =
  | "queued"
  | "claimed"
  | "progress"
  | "job_started"
  | "job_completed"
  | "cancel_requested"
  | "cancelled"
  | "failed"
  | "retry_created";
export type SourceContextMapRunStatus =
  | "queued"
  | "running"
  | "reducing"
  | "done"
  | "failed"
  | "cancelled";
export type SourceContextMapStepStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
export type SourceContextMapEventLevel = "info" | "warning" | "error";
export type SourceContextMapEventKind =
  | "queued"
  | "resumed"
  | "step_claimed"
  | "step_completed"
  | "step_failed"
  | "reduce_started"
  | "reduce_completed"
  | "reduce_failed"
  | "cancel_requested"
  | "cancelled"
  | "retry_created";
export type WikiCompileJobStatus = "queued" | "running" | "done" | "failed";
export type WikiCompileEventLevel = "info" | "warning" | "error";
export type WikiCompileEventKind =
  | "queued"
  | "claimed"
  | "sources_selected"
  | "provider_started"
  | "provider_delta"
  | "completed"
  | "failed";
export type WikiArtifactScopeKind = "source" | "topic" | "library";
export type WikiArtifactKind = "source_digest" | "section" | "topic" | "claim" | "index";
export type WikiArtifactFreshness = "partial" | "fresh" | "stale";
export type WikiArtifactLinkKind = "derived_from" | "contains" | "related" | "contradicts";
export type WikiArtifactLinkCreatedBy = "compiler" | "projector" | "user";
export type WikiUserEditKind = "patch" | "override";
export type WikiUserEditMergeOutcome =
  | "authored"
  | "unchanged"
  | "auto_merged"
  | "conflict"
  | "keep_user"
  | "accept_machine"
  | "manual_merge";
export type WikiArtifactPublicationDisposition = "created" | "reused";
export type TopicGraphEdgeKind = "source" | "related" | "mentions";
export type GraphNodeKind =
  | "source"
  | "person"
  | "venue"
  | "domain"
  | "problem"
  | "method"
  | "dataset"
  | "metric";
export type GraphEdgeDimension = "metadata" | "citation" | "domain" | "technical";
export type GraphEdgeCreatedBy = "adapter" | "graph_builder" | "user";
export type ReindexScope = "fts" | "embeddings";
export type ChatMessageRole = "user" | "assistant" | "evidence";
export type ChatMessageStatus =
  | "queued"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";
export type SessionLeaseStatus = "claimed" | "already_open" | "missing";
export type WorkingSetLoadDepth = "meta" | "outline" | "chunks" | "full";
export type WorkingSetPinStatus = "pinned" | "auto" | "evicted";

export interface EngineHealth {
  status: EngineHealthStatus;
  message?: string;
  detail?: string;
  sqliteVersion?: string;
  opfs?: "available" | "unavailable";
  checkedAt: string;
}

export interface MemorySummary {
  id: string;
  sourceKind: SourceKind;
  sourceUrl: string;
  sourceTitle: string;
  capturedAt: string;
  excerpt: string;
  version: MemoryVersionInfo;
}

export interface MemoryDetail extends MemorySummary {
  normalizedText: string;
  metadata: Record<string, unknown>;
  anchor?: AnchorInfo;
  chunks: Array<{
    id: string;
    ord: number;
    text: string;
    tokenCount: number;
    pageStart?: number;
    pageEnd?: number;
  }>;
}

export interface GetMemoryEvidenceWindowAnchor {
  memoryId: string;
  chunkId?: string;
  ord?: number;
}

export interface GetMemoryEvidenceWindowsPayload {
  query?: string;
  memoryIds?: string[];
  anchors?: GetMemoryEvidenceWindowAnchor[];
  limit?: number;
  maxWindowsPerMemory?: number;
  contextChunksBefore?: number;
  contextChunksAfter?: number;
}

export interface MemoryEvidenceWindow {
  memoryId: string;
  chunkId: string;
  sourceKind: SourceKind;
  sourceUrl: string;
  sourceTitle: string;
  excerpt: string;
  anchor?: AnchorInfo;
  chunks: Array<{
    id: string;
    ord: number;
    text: string;
    tokenCount: number;
    pageStart?: number;
    pageEnd?: number;
  }>;
}

export interface GetMemoryEvidenceWindowsResult {
  items: MemoryEvidenceWindow[];
  query?: string;
}

export type RetrieveSourcesScope = "all";
export type RetrieveStrength = "strict" | "balanced" | "broad";
export type RetrieveRelevanceBand = "high" | "medium" | "low";
export type RetrieveTrackName =
  | "meta_sources"
  | "vector_meta"
  | "fts_chunks"
  | "vector_chunks"
  | "recent_sources";
export type RetrieveTrackStatus = "used" | "unavailable" | "skipped";
export type RetrieveFusionStrategy = "rrf";
export type RetrieveSourceLifecycleFilter = "fresh" | "stale" | "archived";

export interface RetrieveSourcesFilter {
  sourceTypes?: string[];
  lifecycleStatuses?: RetrieveSourceLifecycleFilter[];
  doi?: string;
  arxivIds?: string[];
  years?: number[];
  venues?: string[];
  authors?: string[];
}

export interface RetrieveSourcesPayload {
  query: string;
  strength?: RetrieveStrength;
  limit?: number;
  scope?: RetrieveSourcesScope;
  includeChunks?: number;
  filter?: RetrieveSourcesFilter;
}

export interface RetrieveSourceHitChunk {
  chunkId: string;
  ord: number;
  snippet: string;
  score: number;
  track: "fts_chunks" | "vector_chunks";
  sectionPath?: string;
  pageStart?: number;
  pageEnd?: number;
}

export type RetrieveSourceCoarseLaneName =
  | "topic"
  | "local_peak"
  | "breadth"
  | "specificity"
  | "agreement";

export interface RetrieveSourceCoarseLaneSignal {
  name: RetrieveSourceCoarseLaneName;
  eligible: boolean;
  rawScore: number;
  fusionStrength: number;
  rank?: number;
}

export interface RetrieveSourceCoarseSignals {
  topicEvidence: number;
  localPeak: number;
  breadth: number;
  specificity: number;
  agreement: number;
  uniqueHitChunkCount: number;
  totalChunkCount: number;
  hitChunkRatio: number;
  evidenceRegionCount: number;
  distinctSectionCount: number;
  totalSectionCount: number;
  matchedMetadataFields: Array<"title" | "abstract" | "keywords" | "heading">;
  lanes: RetrieveSourceCoarseLaneSignal[];
}

export interface RetrieveSourceItem extends MemorySummary {
  score: number;
  tracks: RetrieveTrackName[];
  hitChunks: RetrieveSourceHitChunk[];
  coarseSignals?: RetrieveSourceCoarseSignals;
}

export interface RetrieveSourcesTraceTrack {
  name: RetrieveTrackName;
  status: RetrieveTrackStatus;
  itemCount: number;
  reason?: string;
}

export interface RetrieveSourcesStageTrace {
  id:
    | "recall"
    | "source_grouping"
    | "coarse_rank"
    | "relevance_banding"
    | "strength_selection"
    | "evidence_selection";
  strategy: string;
  inputCount: number;
  outputCount: number;
  droppedCount: number;
  reason?: string;
}

export interface RetrieveSourceRelevanceBand {
  band: RetrieveRelevanceBand;
  items: RetrieveSourceItem[];
  itemCount: number;
  scoreFloor?: number;
  scoreCeiling?: number;
}

export interface RetrieveSourcesRelevanceTrace {
  strategy: string;
  strength: RetrieveStrength;
  candidateCount: number;
  eligibleCount: number;
  selectedCount: number;
  selectedBands: RetrieveRelevanceBand[];
  bandCounts: Record<RetrieveRelevanceBand, number>;
  safetyCapped: boolean;
  boundaries: Array<{
    afterRank: number;
    gap: number;
    relativeGap: number;
  }>;
}

export interface RetrieveSourcesResult {
  query: string;
  items: RetrieveSourceItem[];
  bands?: RetrieveSourceRelevanceBand[];
  trace: {
    strategy: RetrieveFusionStrategy;
    rrfK: number;
    tracks: RetrieveSourcesTraceTrack[];
    stages?: RetrieveSourcesStageTrace[];
    relevance?: RetrieveSourcesRelevanceTrace;
    coarseRank?: {
      strategy: "document_lanes_strength_aware_rrf";
      lanes: RetrieveSourceCoarseLaneName[];
      candidateCount: number;
    };
    fineRank?: {
      status: "not_configured" | "applied" | "failed" | "skipped";
      reason?: string;
    };
  };
}

export type KnowledgeBaseClusterBy =
  | "none"
  | "semantic"
  | "topic"
  | "graph"
  | "year"
  | "venue"
  | "source_type";
export type KnowledgeBaseClusterGranularity = "coarse" | "medium" | "fine";
export type KnowledgeBaseEngineClusterBy = Exclude<KnowledgeBaseClusterBy, "none">;
export type KnowledgeBaseSemanticClusterBackend = "auto" | "embedding" | "metadata";
export type KnowledgeBaseClusterTraceBackend = "embedding" | "metadata" | "graph";
export type KnowledgeBaseClusterTraceMethod =
  | "kmeans_meta_embedding"
  | "metadata_fallback"
  | "metadata_topic_label"
  | "graph_entity_affinity";
export type KnowledgeBaseSemanticClusterFallbackReason =
  | "metadata_backend_selected"
  | "embedding_model_unavailable"
  | "insufficient_embeddings"
  | "invalid_embeddings";
export type KnowledgeBaseClusterFallbackReason =
  | KnowledgeBaseSemanticClusterFallbackReason
  | "no_graph_signal";

export interface KnowledgeBaseClusteringOptions {
  clusterBy: KnowledgeBaseEngineClusterBy;
  granularity?: KnowledgeBaseClusterGranularity;
  semanticBackend?: KnowledgeBaseSemanticClusterBackend;
  refinement?: {
    providerBackedLabels?: boolean;
  };
}

export interface KnowledgeBaseSourceClusterTrace {
  backend: KnowledgeBaseClusterTraceBackend;
  method: KnowledgeBaseClusterTraceMethod;
  vectorCount?: number;
  graphEdgeCount?: number;
  fallbackReason?: KnowledgeBaseClusterFallbackReason;
  labelRefinement?: {
    status: "refined" | "unavailable" | "error";
    method: "provider_llm";
    reason?: string;
  };
}

export interface KnowledgeBaseSourceCluster {
  id: string;
  label: string;
  clusterBy: KnowledgeBaseEngineClusterBy;
  sourceIds: string[];
  sourceCount: number;
  score: number;
  summary?: string;
  deterministicLabel?: string;
  deterministicSummary?: string;
  trace?: KnowledgeBaseSourceClusterTrace;
}

export type KnowledgeBaseSearchMode = "exact" | "semantic";

export interface SearchKnowledgeBasePayload {
  query: string;
  mode?: KnowledgeBaseSearchMode;
  strength?: RetrieveStrength;
  limit?: number;
  includeChunks?: number;
  filter?: RetrieveSourcesFilter;
  clustering?: KnowledgeBaseClusteringOptions;
}

export type KnowledgeBaseExpansionTermSource = "keyword_index" | "source_graph";

export interface KnowledgeBaseExpansionTermTrace {
  term: string;
  sources: KnowledgeBaseExpansionTermSource[];
  sourceCount: number;
}

export interface KnowledgeBaseExpansionTrace {
  status: "used" | "skipped";
  terms: string[];
  termSources?: KnowledgeBaseExpansionTermTrace[];
  reason?:
    | "empty_query"
    | "filter_no_match"
    | "direct_matches"
    | "exact_mode"
    | "semantic_mode"
    | "no_terms"
    | "expanded_query_empty";
  expandedQuery?: string;
  originalItemCount?: number;
  expandedItemCount?: number;
}

export interface SearchKnowledgeBaseResult extends RetrieveSourcesResult {
  expansion: KnowledgeBaseExpansionTrace;
  clusters?: KnowledgeBaseSourceCluster[];
}

export interface WorkingSetSourceSummary extends MemorySummary {
  sourceType: string;
  lifecycleStatus: RetrieveSourceLifecycleFilter;
  abstract?: string;
  chunkCount: number;
}

export interface WorkingSetEntry {
  source: WorkingSetSourceSummary;
  loadDepth: WorkingSetLoadDepth;
  pinStatus: WorkingSetPinStatus;
  evictReason?: string;
  reloadCount: number;
  loadedAt: string;
  updatedAt: string;
  tokenEstimate: number;
}

export interface WorkingSetStatusResult {
  entries: WorkingSetEntry[];
  totalTokenEstimate: number;
  budget: number;
}

export interface WorkingSetSourcePayload {
  sourceId: string;
  loadDepth?: WorkingSetLoadDepth;
}

export interface EvictWorkingSetSourcePayload {
  sourceId: string;
  reason?: string;
}

export interface SetWorkingSetSourceDepthPayload {
  sourceId: string;
  loadDepth: WorkingSetLoadDepth;
}

export interface SourceContextPackSourceDepthOverride {
  sourceId: string;
  loadDepth: WorkingSetLoadDepth;
}

export interface BuildSourceContextPackPayload {
  query?: string;
  sourceIds?: string[];
  sourceDepthOverrides?: SourceContextPackSourceDepthOverride[];
  anchors?: GetMemoryEvidenceWindowAnchor[];
  useWorkingSet?: boolean;
  maxTotalTokens?: number;
  maxGroups?: number;
  maxGroupTokens?: number;
  maxSources?: number;
  maxWindowsPerSource?: number;
  contextChunksBefore?: number;
  contextChunksAfter?: number;
}

export interface SourceContextPackOutlineItem {
  level?: number;
  text: string;
}

export interface SourceContextPackSource {
  id: string;
  sourceKind: SourceKind;
  sourceUrl: string;
  sourceTitle: string;
  capturedAt: string;
  sourceType: string;
  abstract?: string;
  sectionOutline: SourceContextPackOutlineItem[];
  chunkCount: number;
  tokenEstimate: number;
  selectedTokenEstimate: number;
  requestedLoadDepth: WorkingSetLoadDepth;
  selectedLoadDepth: WorkingSetLoadDepth;
  pinStatus?: WorkingSetPinStatus;
  windowCount: number;
}

export type SourceContextPackWindowPriority = "anchor" | "query" | "fallback" | "parent";

export interface SourceContextPackWindow {
  sourceId: string;
  chunkId: string;
  ord: number;
  text: string;
  tokenCount: number;
  sourceKind: SourceKind;
  sourceUrl: string;
  sourceTitle: string;
  sourceType: string;
  priority: SourceContextPackWindowPriority;
  anchor?: AnchorInfo;
  pageStart?: number;
  pageEnd?: number;
}

export interface SourceContextPackGroup {
  id: string;
  sourceIds: string[];
  tokenEstimate: number;
  windows: SourceContextPackWindow[];
}

export type SourceContextCompressionReason =
  | "query_no_hits"
  | "source_not_found"
  | "source_over_budget"
  | "source_downgraded"
  | "chunk_window_omitted"
  | "parent_context_selected"
  | "full_depth_bounded"
  | "group_limit_reached";

export type SourceContextLostInfoType =
  | "query_candidates"
  | "source"
  | "load_depth"
  | "chunk_windows"
  | "chunk_detail"
  | "full_document"
  | "groups";

export interface SourceContextCompressionLogEntry {
  reason: SourceContextCompressionReason;
  message: string;
  sourceId?: string;
  chunkId?: string;
  requestedLoadDepth?: WorkingSetLoadDepth;
  selectedLoadDepth?: WorkingSetLoadDepth;
  tokenEstimate?: number;
  omittedTokenEstimate?: number;
  omittedWindowCount?: number;
  lostInfoTypes?: SourceContextLostInfoType[];
}

export interface SourceContextCompressionLogRecord
  extends Omit<SourceContextCompressionLogEntry, "lostInfoTypes"> {
  id: string;
  sessionId?: string;
  runId?: string;
  lostInfoTypes: SourceContextLostInfoType[];
  createdAt: string;
}

export interface AppendSourceContextCompressionLogsPayload {
  sessionId?: string;
  runId?: string;
  entries: SourceContextCompressionLogEntry[];
  createdAt?: string;
}

export interface SourceContextCompressionLogFilter {
  sessionId?: string;
  runId?: string;
  sourceId?: string;
  limit?: number;
}

export type SourceContextMapArtifactStage = "map" | "reduce";
export type SourceContextMapArtifactStatus = "started" | "completed" | "failed";

export interface SourceContextMapWindowRef {
  sourceId: string;
  chunkId: string;
  ord?: number;
}

export interface SourceContextMapArtifactEntry {
  stage: SourceContextMapArtifactStage;
  status: SourceContextMapArtifactStatus;
  groupId?: string;
  groupIndex?: number;
  sourceIds?: string[];
  windowRefs?: SourceContextMapWindowRef[];
  evidenceIds?: string[];
  tokenEstimate?: number;
  inputSummary?: string;
  outputSummary?: string;
  mapArtifactIds?: string[];
  errorCode?: string;
  errorMessage?: string;
  createdAt?: string;
}

export interface SourceContextMapArtifactRecord extends SourceContextMapArtifactEntry {
  id: string;
  sessionId?: string;
  runId: string;
  createdAt: string;
}

export interface AppendSourceContextMapArtifactsPayload {
  sessionId?: string;
  runId: string;
  entries: SourceContextMapArtifactEntry[];
  createdAt?: string;
}

export interface SourceContextMapArtifactFilter {
  sessionId?: string;
  runId?: string;
  stage?: SourceContextMapArtifactStage;
  status?: SourceContextMapArtifactStatus;
  sourceId?: string;
  limit?: number;
}

export interface SourceContextMapStepPlan {
  groupId: string;
  groupIndex: number;
  sourceIds: string[];
  windowRefs: SourceContextMapWindowRef[];
  evidenceIds: string[];
  tokenEstimate: number;
  inputSummary?: string;
  stepSignature: string;
}

export interface CreateOrResumeSourceContextMapRunPayload {
  id?: string;
  sessionId?: string;
  ownerRunId: string;
  mode?: "research" | "auto";
  planSignature: string;
  maxConcurrentMaps?: number;
  steps: SourceContextMapStepPlan[];
  createdAt?: string;
}

export interface SourceContextMapRunFilter {
  sessionId?: string;
  ownerRunId?: string;
  status?: SourceContextMapRunStatus;
  limit?: number;
}

export interface SourceContextMapRunSummary {
  id: string;
  sessionId?: string;
  ownerRunId: string;
  mode?: "research" | "auto";
  status: SourceContextMapRunStatus;
  planSignature: string;
  maxConcurrentMaps: number;
  progressCurrent: number;
  progressTotal: number;
  cancelRequested: boolean;
  retryOfRunId?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface SourceContextMapStepRecord extends SourceContextMapStepPlan {
  id: string;
  runId: string;
  status: SourceContextMapStepStatus;
  attemptCount: number;
  outputSummary?: string;
  artifactId?: string;
  errorCode?: string;
  errorMessage?: string;
  claimedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SourceContextMapRunDetail extends SourceContextMapRunSummary {
  steps: SourceContextMapStepRecord[];
}

export interface ListSourceContextMapRunsResult {
  runs: SourceContextMapRunSummary[];
}

export interface SourceContextMapClaimStepResult {
  run: SourceContextMapRunSummary;
  step?: SourceContextMapStepRecord;
}

export interface CompleteSourceContextMapStepPayload {
  stepId: string;
  outputSummary: string;
  artifactId?: string;
  completedAt?: string;
}

export interface FailSourceContextMapStepPayload {
  stepId: string;
  errorCode?: string;
  errorMessage: string;
  failedAt?: string;
}

export interface MarkSourceContextMapReduceStartedPayload {
  runId: string;
  mapArtifactIds?: string[];
  inputSummary?: string;
  tokenEstimate?: number;
  startedAt?: string;
}

export interface MarkSourceContextMapReduceCompletedPayload {
  runId: string;
  outputSummary?: string;
  artifactId?: string;
  completedAt?: string;
}

export interface MarkSourceContextMapReduceFailedPayload {
  runId: string;
  errorCode?: string;
  errorMessage: string;
  failedAt?: string;
}

export interface SourceContextMapEvent {
  id: string;
  runId: string;
  stepId?: string;
  kind: SourceContextMapEventKind;
  level: SourceContextMapEventLevel;
  message: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface ListSourceContextMapEventsResult {
  events: SourceContextMapEvent[];
}

export interface EnqueueChunkMetaTier2JobPayload {
  sourceId: string;
  maxChunks?: number;
}

export type ChunkMetaTier2AuditStatus = "summarized" | "unavailable" | "error" | "skipped";

export interface ChunkMetaTier2AuditRecord {
  id: string;
  sourceId: string;
  chunkId: string;
  jobId?: string;
  tier: "tier2";
  status: ChunkMetaTier2AuditStatus;
  providerKind?: "chat";
  reason?: string;
  sectionSummaryChars?: number;
  chunkSummaryChars?: number;
  semanticRelationCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChunkMetaTier2AuditFilter {
  sourceId?: string;
  jobId?: string;
  status?: ChunkMetaTier2AuditStatus;
  limit?: number;
}

export interface SourceContextPackResult {
  query?: string;
  sources: SourceContextPackSource[];
  groups: SourceContextPackGroup[];
  compressionLog: SourceContextCompressionLogEntry[];
  trace: {
    strategy: "source_context_pack_v1";
    requestedSourceCount: number;
    packedSourceCount: number;
    totalTokenEstimate: number;
    budget: number;
  };
}

export interface SearchMemoryItem extends MemorySummary {
  snippet: string;
}

export interface TopicPageSourceRef {
  memoryId: string;
  chunkId?: string;
  quote?: string;
}

export interface TopicPageSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  sourceCount: number;
}

export interface TopicPageDetail extends TopicPageSummary {
  content: string;
  sourceRefs: TopicPageSourceRef[];
}

export interface CreateTopicPagePayload {
  id?: string;
  slug?: string;
  title: string;
  summary?: string;
  content?: string;
  sourceRefs?: TopicPageSourceRef[];
  createdAt?: string;
  updatedAt?: string;
}

export interface UpdateTopicPagePayload {
  slug?: string;
  title?: string;
  summary?: string;
  content?: string;
  sourceRefs?: TopicPageSourceRef[];
  updatedAt?: string;
}

export interface ListTopicPagesResult {
  items: TopicPageSummary[];
  query?: string;
}

export interface DeleteTopicPageResult {
  deleted: boolean;
  id: string;
}

export type WikiArtifactJsonValue =
  | string
  | number
  | boolean
  | null
  | WikiArtifactJsonValue[]
  | WikiArtifactJsonObject;

export interface WikiArtifactJsonObject {
  [key: string]: WikiArtifactJsonValue;
}

export interface WikiArtifactScope {
  kind: WikiArtifactScopeKind;
  id: string;
}

export interface WikiArtifactEvidenceInput {
  sourceId: string;
  chunkId: string;
  pageNo?: number;
  bbox?: WikiArtifactJsonObject;
  parserArtifactKind?: string;
  parserArtifactId?: string;
  anchor?: WikiArtifactJsonObject;
}

export interface WikiArtifactDraft {
  artifactKind: WikiArtifactKind;
  artifactKey: string;
  title: string;
  content: string;
  payload?: WikiArtifactJsonObject;
  coverage?: WikiArtifactJsonObject;
  evidence?: WikiArtifactEvidenceInput[];
}

export interface WikiArtifactBatchRef {
  artifactKind: WikiArtifactKind;
  artifactKey: string;
}

export type WikiArtifactLinkTarget = { artifactId: string } | WikiArtifactBatchRef;

export interface WikiArtifactLinkInput {
  from: WikiArtifactBatchRef;
  to: WikiArtifactLinkTarget;
  kind: WikiArtifactLinkKind;
  createdBy: WikiArtifactLinkCreatedBy;
  creatorVersion?: string;
}

export interface PublishWikiArtifactsPayload {
  scope: WikiArtifactScope;
  inputSignature: string;
  compilerVersion: string;
  promptVersion: string;
  modelId?: string;
  freshness?: Exclude<WikiArtifactFreshness, "stale">;
  artifacts: WikiArtifactDraft[];
  links?: WikiArtifactLinkInput[];
}

export interface WikiArtifactMachineVersion {
  id: string;
  scope: WikiArtifactScope;
  sourceId?: string;
  artifactKind: WikiArtifactKind;
  artifactKey: string;
  versionNo: number;
  versionGroupId: string;
  supersedesArtifactId?: string;
  inputSignature: string;
  compilerVersion: string;
  promptVersion: string;
  modelId?: string;
  title: string;
  content: string;
  payload: WikiArtifactJsonObject;
  coverage: WikiArtifactJsonObject;
  freshness: WikiArtifactFreshness;
  createdAt: string;
  publishedAt: string;
}

export interface WikiArtifactEvidence extends WikiArtifactEvidenceInput {
  id: string;
  artifactId: string;
  ordinal: number;
}

export interface WikiArtifactLink {
  id: string;
  fromArtifactId: string;
  toArtifactId: string;
  kind: WikiArtifactLinkKind;
  createdBy: WikiArtifactLinkCreatedBy;
  creatorVersion?: string;
  createdAt: string;
}

export interface WikiUserEdit {
  id: string;
  baseArtifactId: string;
  previousEditId?: string;
  candidateArtifactId?: string;
  versionNo: number;
  editKind: WikiUserEditKind;
  payload: WikiArtifactJsonObject;
  mergeOutcome: WikiUserEditMergeOutcome;
  createdAt: string;
}

export interface PublishWikiArtifactsResult {
  versionGroupId: string;
  items: Array<{
    artifact: WikiArtifactMachineVersion;
    disposition: WikiArtifactPublicationDisposition;
  }>;
  createdCount: number;
  reusedCount: number;
}

export interface WikiArtifactFilter {
  scope?: WikiArtifactScope;
  artifactKind?: WikiArtifactKind;
  freshness?: WikiArtifactFreshness;
  inputSignature?: string;
  includeHistory?: boolean;
  limit?: number;
}

export interface ListWikiArtifactsResult {
  items: WikiArtifactMachineVersion[];
}

export interface WikiArtifactDetail {
  artifact: WikiArtifactMachineVersion;
  evidence: WikiArtifactEvidence[];
  outgoingLinks: WikiArtifactLink[];
  incomingLinks: WikiArtifactLink[];
  userEdits: WikiUserEdit[];
}

export interface AppendWikiUserEditPayload {
  id?: string;
  baseArtifactId: string;
  previousEditId?: string;
  candidateArtifactId?: string;
  editKind: WikiUserEditKind;
  payload: WikiArtifactJsonObject;
  mergeOutcome: WikiUserEditMergeOutcome;
  createdAt?: string;
}

export interface ListWikiUserEditsResult {
  items: WikiUserEdit[];
}

export interface DeleteWikiArtifactResult {
  deleted: boolean;
  id: string;
  staleArtifactCount: number;
}

export interface CreateWikiCompileJobPayload {
  id?: string;
  topicId?: string;
  query: string;
  instructions?: string;
  sourceMemoryIds?: string[];
  maxAttempts?: number;
  runAfter?: string;
  createdAt?: string;
}

export interface WikiCompileJobSummary {
  id: string;
  status: WikiCompileJobStatus;
  topicId?: string;
  query: string;
  instructions: string;
  sourceMemoryIds: string[];
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  runAfter?: string;
  claimedAt?: string;
  finishedAt?: string;
  lastError?: string;
  resultTopicId?: string;
}

export interface ListWikiCompileJobsResult {
  jobs: WikiCompileJobSummary[];
}

export interface CreateWikiCompileJobEventPayload {
  id?: string;
  jobId: string;
  kind: WikiCompileEventKind;
  level?: WikiCompileEventLevel;
  message?: string;
  detail?: Record<string, unknown>;
  createdAt?: string;
}

export interface WikiCompileJobEvent {
  id: string;
  jobId: string;
  kind: WikiCompileEventKind;
  level: WikiCompileEventLevel;
  message: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface ListWikiCompileJobEventsResult {
  events: WikiCompileJobEvent[];
}

export interface WikiCompileResultPayload {
  topic?: CreateTopicPagePayload | UpdateTopicPagePayload;
  sourceRefs?: TopicPageSourceRef[];
  edges?: TopicGraphEdgeInput[];
  completedAt?: string;
}

export interface TopicGraphEdgeInput {
  id?: string;
  fromTopicId?: string;
  toTopicId?: string;
  memoryId?: string;
  chunkId?: string;
  kind: TopicGraphEdgeKind;
  weight?: number;
  label?: string;
  createdAt?: string;
}

export interface TopicGraphEdge extends Required<Pick<TopicGraphEdgeInput, "id" | "kind">> {
  fromTopicId: string;
  toTopicId?: string;
  memoryId?: string;
  chunkId?: string;
  weight: number;
  label: string;
  createdAt: string;
}

export interface ListTopicGraphEdgesResult {
  edges: TopicGraphEdge[];
}

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  canonicalId: string;
  refId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  dimension: GraphEdgeDimension;
  edgeType: string;
  evidenceSourceId?: string;
  evidenceChunkIds: string[];
  weight: number;
  createdBy: GraphEdgeCreatedBy;
  createdAt: string;
}

export interface GraphEvidenceAnchor {
  sourceId: string;
  chunkId?: string;
  ord?: number;
  excerpt: string;
  pageStart?: number;
  pageEnd?: number;
}

export interface BuildSourceGraphPayload {
  sourceId: string;
  mode?: "deterministic" | "llm";
}

export interface BuildSourceGraphResult {
  sourceId: string;
  nodeCount: number;
  edgeCount: number;
  evidenceChunkCount: number;
  requestedMode?: "deterministic" | "llm";
  appliedMode?: "deterministic" | "llm";
  deterministicEdgeCount?: number;
  citationEdgeCount?: number;
  llmEdgeCount?: number;
  fallbackReason?: string;
  skipped?: boolean;
  reason?: string;
}

export interface EnqueueSourceGraphJobPayload {
  sourceId: string;
  mode: "deterministic" | "llm";
}

export interface GraphNeighborsPayload {
  nodeId?: string;
  sourceId?: string;
  canonicalId?: string;
  kind?: GraphNodeKind;
  dimension?: GraphEdgeDimension;
  depth?: number;
  limit?: number;
}

export interface GraphSubgraphPayload {
  sourceIds?: string[];
  dimension?: GraphEdgeDimension;
  limit?: number;
}

export interface GraphNodeRef {
  nodeId?: string;
  sourceId?: string;
  canonicalId?: string;
  kind?: GraphNodeKind;
}

export interface GraphPathPayload {
  from: GraphNodeRef;
  to: GraphNodeRef;
  dimension?: GraphEdgeDimension;
  maxDepth?: number;
  limit?: number;
}

export interface GraphTimelinePayload {
  sourceIds?: string[];
  canonicalId?: string;
  kind?: GraphNodeKind;
  dimension?: GraphEdgeDimension;
  limit?: number;
  order?: "asc" | "desc";
}

export interface GraphQueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  evidence: GraphEvidenceAnchor[];
}

export interface CaptureBasePayload {
  sourceUrl: string;
  sourceTitle: string;
  normalizedText: string;
  capturedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CaptureMarkdownPayload {
  sourceUrl: string;
  sourceTitle: string;
  markdownText: string;
  capturedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CapturePdfPayload {
  sourceUrl: string;
  sourceTitle: string;
  bytes: ArrayBuffer | Uint8Array;
  capturedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CapturePdfTransportPayload {
  sourceUrl: string;
  sourceTitle: string;
  bytesBase64: string;
  byteLength: number;
  capturedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface PdfRawFileResult {
  memoryId: string;
  sourceTitle: string;
  sourceUrl: string;
  bytes: ArrayBuffer | Uint8Array;
  byteLength: number;
  contentType: "application/pdf";
}

export interface CaptureSelectionPayload extends CaptureBasePayload {
  contextBefore?: string;
  contextAfter?: string;
  xpath?: string;
  textFragment?: string;
}

export interface CaptureResult {
  status: "saved" | "duplicate";
  memory: MemorySummary;
}

export interface SearchMemoryResult {
  items: SearchMemoryItem[];
  query: string;
}

export interface ListMemoriesResult {
  items: MemorySummary[];
}

export interface DeleteMemoryResult {
  deleted: boolean;
  id: string;
}

export interface RepairResult {
  action: RepairAction;
  health: EngineHealth;
}

export interface TestProviderResult {
  ok: true;
}

export interface MemoryVersionInfo {
  groupKey: string;
  versionNo: number;
  isCurrent: boolean;
  supersedesMemoryId?: string;
  supersededByMemoryId?: string;
}

export interface AnchorInfo {
  id: string;
  memoryId: string;
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  xpath?: string;
  textFragment?: string;
  lastResolutionStatus?: string;
}

export interface JobSummary {
  id: string;
  type: JobType;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  progressCurrent: number;
  progressTotal: number;
  cancelRequested: boolean;
  lastError?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface GetJobStatusResult {
  jobs: JobSummary[];
}

export interface CreateOrchestrationRunPayload {
  id?: string;
  kind: OrchestrationKind;
  targetJobId: string;
}

export interface OrchestrationRunFilter {
  kind?: OrchestrationKind;
  status?: OrchestrationRunStatus;
  targetJobId?: string;
  limit?: number;
}

export interface OrchestrationRunSummary {
  id: string;
  kind: OrchestrationKind;
  status: OrchestrationRunStatus;
  targetJobId: string;
  progressCurrent: number;
  progressTotal: number;
  cancelRequested: boolean;
  retryOfRunId?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface ListOrchestrationRunsResult {
  runs: OrchestrationRunSummary[];
}

export interface OrchestrationEvent {
  id: string;
  runId: string;
  kind: OrchestrationEventKind;
  level: OrchestrationEventLevel;
  message: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface ListOrchestrationEventsResult {
  events: OrchestrationEvent[];
}

export interface ReindexResult {
  jobId: string;
  status: JobStatus;
}

export interface AnchorResolveResult {
  status: "resolved" | "missing_anchor" | "missing_memory";
  memoryId: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceKind?: SourceKind;
  anchor?: AnchorInfo;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessageExcerpt: string;
  currentEvidenceRevision: number;
  sourcePageUrl?: string;
  sourcePageTitle?: string;
  ownerId?: string;
  ownerHeartbeatAt?: string;
}

export interface SessionEvidenceRecord {
  id: string;
  sessionId: string;
  revision: number;
  sourceKind: SourceKind;
  pageUrl: string;
  pageTitle: string;
  text: string;
  excerpt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CoveredEvidenceRef {
  id: string;
  revision: number;
}

export interface CompactionRecord {
  id: string;
  sessionId: string;
  summary: string;
  firstKeptMessageId: string;
  evidenceSummary: string;
  firstKeptEvidenceId?: string;
  firstKeptEvidenceRevision?: number;
  previousCompactionId?: string;
  coveredEvidence: CoveredEvidenceRef[];
  tokensBefore: number;
  createdAt: string;
}

export interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  status: ChatMessageStatus;
  content: string;
  scope: AgentScope;
  createdAt: string;
  updatedAt: string;
  pageUrl?: string;
  pageTitle?: string;
  selectionText?: string;
  citations: LocalCitation[];
  worldKnowledge: string[];
  evidenceRefs: string[];
  error?: AgentErrorInfo;
  retry?: Record<string, unknown>;
  piAgentMessageJson?: Record<string, unknown>;
  runId?: string;
  queueOrder?: number;
}

export interface ChatSessionDetail extends ChatSessionSummary {
  messages: ChatMessageRecord[];
  evidence: SessionEvidenceRecord[];
}

export interface ListChatSessionsResult {
  items: ChatSessionSummary[];
}

export interface ClioWebSource {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
}

export interface ClioWebSearchResult {
  id: string;
  runId: string;
  query: string;
  answer: string;
  sources: ClioWebSource[];
  provider: string;
  createdAt: string;
  completedAt: string;
}

export interface ClioWebSearchRequest {
  runId: string;
  query: string;
  createdAt: string;
}

export type ClioWebSearchEvent =
  | { type: "started"; runId: string; query: string; provider: string; createdAt: string }
  | { type: "answer_delta"; runId: string; delta: string }
  | { type: "completed"; runId: string; result: ClioWebSearchResult }
  | { type: "failed"; runId: string; error: { code: string; message: string; detail?: string } };

export interface WebSearchHistoryRecord {
  id: string;
  query: string;
  answer: string;
  sources: ClioWebSource[];
  provider: string;
  createdAt: string;
}

export interface ListWebSearchHistoryResult {
  items: WebSearchHistoryRecord[];
}

export type ClioImageGenerationMode = "generate" | "edit";
export type ClioImageInputKind = "data_url" | "base64" | "url";

export interface ClioImageInput {
  kind: ClioImageInputKind;
  value: string;
  mimeType?: string;
  name?: string;
}

export interface ClioImageOutput {
  mimeType: string;
  dataUrl: string;
  b64Json: string;
}

export interface ClioImageGenerationRequest {
  runId: string;
  mode: ClioImageGenerationMode;
  prompt: string;
  createdAt: string;
  input?: ClioImageInput;
}

export interface ClioImageGenerationResult {
  id: string;
  runId: string;
  mode: ClioImageGenerationMode;
  prompt: string;
  model: string;
  size: string;
  provider: string;
  createdAt: string;
  completedAt: string;
  output: ClioImageOutput;
  input?: ClioImageInput;
}

export type ClioImageGenerationEvent =
  | {
      type: "started";
      runId: string;
      mode: ClioImageGenerationMode;
      prompt: string;
      provider: string;
      model: string;
      size: string;
      createdAt: string;
    }
  | { type: "completed"; runId: string; result: ClioImageGenerationResult }
  | { type: "cancelled"; runId: string; reason?: string }
  | { type: "failed"; runId: string; error: { code: string; message: string; detail?: string } };

export interface ImageGenerationHistoryRecord {
  id: string;
  mode: ClioImageGenerationMode;
  prompt: string;
  model: string;
  size: string;
  provider: string;
  createdAt: string;
  output: ClioImageOutput;
  input?: ClioImageInput;
}

export interface ListImageGenerationHistoryResult {
  items: ImageGenerationHistoryRecord[];
}

export interface SessionLeaseResult {
  status: SessionLeaseStatus;
  session?: ChatSessionSummary;
  ownerId?: string;
  ownerHeartbeatAt?: string;
}

export interface CreateChatSessionPayload {
  id?: string;
  title: string;
  pageUrl?: string;
  pageTitle?: string;
  initialScope?: AgentScope;
  ownerId?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AppendSessionEvidencePayload {
  id?: string;
  sessionId: string;
  evidence: EvidenceItem & { sourceKind: SourceKind };
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateCompactionPayload {
  id?: string;
  sessionId: string;
  summary: string;
  firstKeptMessageId: string;
  evidenceSummary: string;
  firstKeptEvidenceId?: string;
  firstKeptEvidenceRevision?: number;
  previousCompactionId?: string;
  coveredEvidence?: CoveredEvidenceRef[];
  tokensBefore: number;
  createdAt?: string;
}

export interface UpsertChatMessagePayload {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  status: ChatMessageStatus;
  content: string;
  scope: AgentScope;
  createdAt?: string;
  updatedAt?: string;
  pageUrl?: string;
  pageTitle?: string;
  selectionText?: string;
  citations?: LocalCitation[];
  worldKnowledge?: string[];
  evidenceRefs?: string[];
  error?: AgentErrorInfo;
  retry?: Record<string, unknown>;
  piAgentMessageJson?: Record<string, unknown>;
  runId?: string;
  queueOrder?: number;
}

export interface UpdateChatMessagePayload {
  id: string;
  sessionId: string;
  status?: ChatMessageStatus;
  content?: string;
  appendContent?: string;
  updatedAt?: string;
  citations?: LocalCitation[];
  worldKnowledge?: string[];
  evidenceRefs?: string[];
  error?: AgentErrorInfo;
  clearError?: boolean;
  retry?: Record<string, unknown>;
  clearRetry?: boolean;
  piAgentMessageJson?: Record<string, unknown>;
  runId?: string;
  queueOrder?: number;
}

export interface EmbeddingReindexModelDescriptor {
  id: string;
  provider: EmbeddingReindexProviderId;
  label: string;
  dimension: number;
  metric: "cosine";
}

export interface ActiveEmbeddingModelSummary {
  id: string;
  provider: EmbeddingRuntimeProviderId;
  label: string;
  dimension: number;
  metric: "cosine";
  status: "active";
  updatedAt: string;
}

export type EngineRequest =
  | { kind: "health" }
  | { kind: "capturePage"; payload: CaptureBasePayload }
  | { kind: "captureMarkdown"; payload: CaptureMarkdownPayload }
  | { kind: "capturePdf"; payload: CapturePdfPayload }
  | { kind: "captureSelection"; payload: CaptureSelectionPayload }
  | { kind: "retrieveSources"; payload: RetrieveSourcesPayload }
  | { kind: "searchKnowledgeBase"; payload: SearchKnowledgeBasePayload }
  | { kind: "listWorkingSetEntries" }
  | { kind: "getWorkingSetStatus" }
  | { kind: "pinWorkingSetSource"; payload: WorkingSetSourcePayload }
  | { kind: "evictWorkingSetSource"; payload: EvictWorkingSetSourcePayload }
  | { kind: "setWorkingSetSourceDepth"; payload: SetWorkingSetSourceDepthPayload }
  | { kind: "reloadWorkingSetSource"; payload: WorkingSetSourcePayload }
  | { kind: "searchMemory"; query: string; limit?: number }
  | { kind: "listMemories"; limit?: number }
  | { kind: "getMemory"; id: string }
  | { kind: "getPdfRawFile"; id: string }
  | { kind: "getMemoryEvidenceWindows"; payload: GetMemoryEvidenceWindowsPayload }
  | { kind: "buildSourceContextPack"; payload: BuildSourceContextPackPayload }
  | {
      kind: "appendSourceContextCompressionLogs";
      payload: AppendSourceContextCompressionLogsPayload;
    }
  | { kind: "listSourceContextCompressionLogs"; filter?: SourceContextCompressionLogFilter }
  | { kind: "clearSourceContextCompressionLogs"; filter?: SourceContextCompressionLogFilter }
  | {
      kind: "appendSourceContextMapArtifacts";
      payload: AppendSourceContextMapArtifactsPayload;
    }
  | { kind: "listSourceContextMapArtifacts"; filter?: SourceContextMapArtifactFilter }
  | { kind: "clearSourceContextMapArtifacts"; filter?: SourceContextMapArtifactFilter }
  | {
      kind: "createOrResumeSourceContextMapRun";
      payload: CreateOrResumeSourceContextMapRunPayload;
    }
  | { kind: "listSourceContextMapRuns"; filter?: SourceContextMapRunFilter }
  | { kind: "getSourceContextMapRun"; id: string }
  | { kind: "cancelSourceContextMapRun"; id: string }
  | { kind: "retrySourceContextMapRun"; id: string }
  | { kind: "resumeSourceContextMapRun"; id: string }
  | { kind: "listSourceContextMapEvents"; runId: string; limit?: number }
  | { kind: "claimSourceContextMapStep"; runId: string; now?: string }
  | { kind: "completeSourceContextMapStep"; payload: CompleteSourceContextMapStepPayload }
  | { kind: "failSourceContextMapStep"; payload: FailSourceContextMapStepPayload }
  | { kind: "markSourceContextMapReduceStarted"; payload: MarkSourceContextMapReduceStartedPayload }
  | {
      kind: "markSourceContextMapReduceCompleted";
      payload: MarkSourceContextMapReduceCompletedPayload;
    }
  | { kind: "markSourceContextMapReduceFailed"; payload: MarkSourceContextMapReduceFailedPayload }
  | { kind: "deleteMemory"; id: string }
  | { kind: "listTopicPages"; query?: string; limit?: number }
  | { kind: "getTopicPage"; id: string }
  | { kind: "createTopicPage"; payload: CreateTopicPagePayload }
  | { kind: "updateTopicPage"; id: string; payload: UpdateTopicPagePayload }
  | { kind: "deleteTopicPage"; id: string }
  | { kind: "publishWikiArtifacts"; payload: PublishWikiArtifactsPayload }
  | { kind: "listWikiArtifacts"; filter?: WikiArtifactFilter }
  | { kind: "getWikiArtifact"; id: string }
  | { kind: "appendWikiUserEdit"; payload: AppendWikiUserEditPayload }
  | { kind: "listWikiUserEdits"; artifactId: string; limit?: number }
  | { kind: "deleteWikiArtifact"; id: string }
  | { kind: "enqueueWikiCompileRun"; payload: EnqueueWikiCompileRunPayload }
  | { kind: "listWikiCompileRuns"; filter?: WikiCompileRunFilter }
  | { kind: "getWikiCompileRun"; id: string }
  | { kind: "cancelWikiCompileRun"; id: string }
  | { kind: "retryWikiCompileRun"; id: string }
  | { kind: "resumeWikiCompileRun"; id: string }
  | { kind: "listWikiCompileEvents"; runId: string; limit?: number }
  | { kind: "createWikiCompileRun"; payload: CreateWikiCompileRunPayload }
  | { kind: "recoverWikiCompileRuns"; payload: RecoverWikiCompileRunsPayload }
  | { kind: "claimNextWikiCompileStep"; leaseOwner: string; now?: string; leaseMs?: number }
  | { kind: "getWikiCompileStepInput"; runId: string; stepId: string; leaseOwner: string }
  | { kind: "completeWikiCompileStep"; payload: CompleteWikiCompileStepPayload }
  | { kind: "failWikiCompileStep"; payload: FailWikiCompileStagePayload }
  | { kind: "pauseWikiCompileRun"; payload: PauseWikiCompileRunPayload }
  | { kind: "claimWikiCompileReduce"; leaseOwner: string; now?: string; leaseMs?: number }
  | { kind: "getWikiCompileReduceInput"; runId: string; leaseOwner: string }
  | { kind: "completeWikiCompileReduce"; payload: CompleteWikiCompileReducePayload }
  | { kind: "failWikiCompileReduce"; payload: FailWikiCompileStagePayload }
  | { kind: "enqueueWikiCompile"; payload: CreateWikiCompileJobPayload }
  | { kind: "listWikiCompileJobs"; status?: WikiCompileJobStatus; limit?: number }
  | { kind: "getWikiCompileJob"; id: string }
  | { kind: "appendWikiCompileJobEvent"; payload: CreateWikiCompileJobEventPayload }
  | { kind: "listWikiCompileJobEvents"; jobId: string; limit?: number }
  | { kind: "claimNextWikiCompileJob"; id?: string; now?: string }
  | { kind: "completeWikiCompileJob"; id: string; result: WikiCompileResultPayload }
  | { kind: "failWikiCompileJob"; id: string; error: string; retryAfter?: string; now?: string }
  | { kind: "listTopicGraphEdges"; topicId: string; edgeKind?: TopicGraphEdgeKind }
  | { kind: "buildSourceGraph"; payload: BuildSourceGraphPayload }
  | { kind: "enqueueSourceGraphJob"; payload: EnqueueSourceGraphJobPayload }
  | { kind: "queryGraphNeighbors"; payload: GraphNeighborsPayload }
  | { kind: "queryGraphSubgraph"; payload: GraphSubgraphPayload }
  | { kind: "queryGraphPath"; payload: GraphPathPayload }
  | { kind: "queryGraphTimeline"; payload: GraphTimelinePayload }
  | { kind: "repair"; action: RepairAction }
  | { kind: "getActiveEmbeddingModel" }
  | { kind: "getJobStatus"; status?: JobStatus; limit?: number }
  | { kind: "runJob"; id: string }
  | { kind: "cancelJob"; id: string }
  | { kind: "createOrchestrationRun"; payload: CreateOrchestrationRunPayload }
  | { kind: "listOrchestrationRuns"; filter?: OrchestrationRunFilter }
  | { kind: "runOrchestration"; id: string }
  | { kind: "cancelOrchestrationRun"; id: string }
  | { kind: "retryOrchestrationRun"; id: string }
  | { kind: "listOrchestrationEvents"; runId: string; limit?: number }
  | { kind: "enqueueChunkMetaTier2Job"; payload: EnqueueChunkMetaTier2JobPayload }
  | { kind: "listChunkMetaTier2Audit"; filter?: ChunkMetaTier2AuditFilter }
  | { kind: "clearChunkMetaTier2Audit"; filter: ChunkMetaTier2AuditFilter }
  | { kind: "reindex"; scope: "fts" }
  | { kind: "reindex"; scope: "embeddings"; model: EmbeddingReindexModelDescriptor }
  | { kind: "enqueueEmbeddingReindex"; model: EmbeddingReindexModelDescriptor }
  | { kind: "resolveAnchor"; memoryId: string }
  | { kind: "createChatSession"; payload: CreateChatSessionPayload }
  | { kind: "listChatSessions"; limit?: number }
  | { kind: "loadChatSession"; sessionId: string }
  | { kind: "claimChatSession"; sessionId: string; ownerId: string; now?: string }
  | { kind: "heartbeatChatSession"; sessionId: string; ownerId: string; now?: string }
  | { kind: "releaseChatSession"; sessionId: string; ownerId: string }
  | { kind: "appendSessionEvidence"; payload: AppendSessionEvidencePayload }
  | { kind: "appendCompaction"; payload: CreateCompactionPayload }
  | { kind: "listCompactions"; sessionId: string; limit?: number }
  | { kind: "getLatestCompaction"; sessionId: string }
  | { kind: "upsertChatMessage"; payload: UpsertChatMessagePayload }
  | { kind: "updateChatMessage"; payload: UpdateChatMessagePayload }
  | { kind: "deleteChatMessage"; sessionId: string; messageId: string }
  | { kind: "clearQueuedChatMessages"; sessionId: string }
  | { kind: "recoverInterruptedChatSession"; sessionId: string }
  | { kind: "listWebSearchHistory"; limit?: number }
  | { kind: "appendWebSearchHistory"; payload: WebSearchHistoryRecord }
  | { kind: "deleteWebSearchHistory"; id: string }
  | { kind: "clearWebSearchHistory" }
  | { kind: "listImageGenerationHistory"; limit?: number }
  | { kind: "appendImageGenerationHistory"; payload: ImageGenerationHistoryRecord }
  | { kind: "deleteImageGenerationHistory"; id: string };

export type WikiCompileWorkerRequest = Extract<
  EngineRequest,
  {
    kind:
      | "createWikiCompileRun"
      | "recoverWikiCompileRuns"
      | "claimNextWikiCompileStep"
      | "getWikiCompileStepInput"
      | "completeWikiCompileStep"
      | "failWikiCompileStep"
      | "pauseWikiCompileRun"
      | "claimWikiCompileReduce"
      | "getWikiCompileReduceInput"
      | "completeWikiCompileReduce"
      | "failWikiCompileReduce";
  }
>;

export type EngineTransportRequest =
  | Exclude<EngineRequest, { kind: "capturePdf" } | WikiCompileWorkerRequest>
  | { kind: "capturePdf"; payload: CapturePdfTransportPayload };

export type EngineResultFor<T extends EngineRequest> = T extends { kind: "health" }
  ? EngineHealth
  : T extends { kind: "capturePage" | "captureMarkdown" | "capturePdf" | "captureSelection" }
    ? CaptureResult
    : T extends { kind: "retrieveSources" }
      ? RetrieveSourcesResult
      : T extends { kind: "searchKnowledgeBase" }
        ? SearchKnowledgeBaseResult
        : T extends {
              kind:
                | "listWorkingSetEntries"
                | "getWorkingSetStatus"
                | "pinWorkingSetSource"
                | "evictWorkingSetSource"
                | "setWorkingSetSourceDepth"
                | "reloadWorkingSetSource";
            }
          ? WorkingSetStatusResult
          : T extends { kind: "searchMemory" }
            ? SearchMemoryResult
            : T extends { kind: "listMemories" }
              ? ListMemoriesResult
              : T extends { kind: "getMemory" }
                ? MemoryDetail | null
                : T extends { kind: "getPdfRawFile" }
                  ? PdfRawFileResult
                  : T extends { kind: "getMemoryEvidenceWindows" }
                    ? GetMemoryEvidenceWindowsResult
                    : T extends { kind: "buildSourceContextPack" }
                      ? SourceContextPackResult
                      : T extends {
                            kind:
                              | "appendSourceContextCompressionLogs"
                              | "listSourceContextCompressionLogs";
                          }
                        ? {
                            items: SourceContextCompressionLogRecord[];
                          }
                        : T extends { kind: "clearSourceContextCompressionLogs" }
                          ? {
                              cleared: number;
                            }
                          : T extends {
                                kind:
                                  | "appendSourceContextMapArtifacts"
                                  | "listSourceContextMapArtifacts";
                              }
                            ? {
                                items: SourceContextMapArtifactRecord[];
                              }
                            : T extends { kind: "clearSourceContextMapArtifacts" }
                              ? {
                                  cleared: number;
                                }
                              : T extends {
                                    kind: "createOrResumeSourceContextMapRun";
                                  }
                                ? SourceContextMapRunDetail
                                : T extends { kind: "listSourceContextMapRuns" }
                                  ? ListSourceContextMapRunsResult
                                  : T extends { kind: "getSourceContextMapRun" }
                                    ? SourceContextMapRunDetail | null
                                    : T extends {
                                          kind:
                                            | "cancelSourceContextMapRun"
                                            | "retrySourceContextMapRun"
                                            | "resumeSourceContextMapRun"
                                            | "markSourceContextMapReduceStarted"
                                            | "markSourceContextMapReduceCompleted"
                                            | "markSourceContextMapReduceFailed";
                                        }
                                      ? SourceContextMapRunSummary
                                      : T extends { kind: "listSourceContextMapEvents" }
                                        ? ListSourceContextMapEventsResult
                                        : T extends { kind: "claimSourceContextMapStep" }
                                          ? SourceContextMapClaimStepResult
                                          : T extends {
                                                kind:
                                                  | "completeSourceContextMapStep"
                                                  | "failSourceContextMapStep";
                                              }
                                            ? SourceContextMapStepRecord
                                            : T extends { kind: "deleteMemory" }
                                              ? DeleteMemoryResult
                                              : T extends { kind: "listTopicPages" }
                                                ? ListTopicPagesResult
                                                : T extends {
                                                      kind: "getTopicPage" | "updateTopicPage";
                                                    }
                                                  ? TopicPageDetail | null
                                                  : T extends { kind: "createTopicPage" }
                                                    ? TopicPageDetail
                                                    : T extends { kind: "deleteTopicPage" }
                                                      ? DeleteTopicPageResult
                                                      : T extends { kind: "publishWikiArtifacts" }
                                                        ? PublishWikiArtifactsResult
                                                        : T extends { kind: "listWikiArtifacts" }
                                                          ? ListWikiArtifactsResult
                                                          : T extends { kind: "getWikiArtifact" }
                                                            ? WikiArtifactDetail | null
                                                            : T extends {
                                                                  kind: "appendWikiUserEdit";
                                                                }
                                                              ? WikiUserEdit
                                                              : T extends {
                                                                    kind: "listWikiUserEdits";
                                                                  }
                                                                ? ListWikiUserEditsResult
                                                                : T extends {
                                                                      kind: "deleteWikiArtifact";
                                                                    }
                                                                  ? DeleteWikiArtifactResult
                                                                  : T extends {
                                                                        kind: "enqueueWikiCompile";
                                                                      }
                                                                    ? WikiCompileJobSummary
                                                                    : T extends {
                                                                          kind:
                                                                            | "enqueueWikiCompileRun"
                                                                            | "createWikiCompileRun";
                                                                        }
                                                                      ? WikiCompileCreateResult
                                                                      : T extends {
                                                                            kind: "listWikiCompileRuns";
                                                                          }
                                                                        ? ListWikiCompileRunsResult
                                                                        : T extends {
                                                                              kind: "getWikiCompileRun";
                                                                            }
                                                                          ? WikiCompileRunDetail | null
                                                                          : T extends {
                                                                                kind:
                                                                                  | "cancelWikiCompileRun"
                                                                                  | "retryWikiCompileRun"
                                                                                  | "resumeWikiCompileRun"
                                                                                  | "pauseWikiCompileRun"
                                                                                  | "failWikiCompileStep"
                                                                                  | "failWikiCompileReduce";
                                                                              }
                                                                            ? WikiCompileRunSummary
                                                                            : T extends {
                                                                                  kind: "listWikiCompileEvents";
                                                                                }
                                                                              ? ListWikiCompileEventsResult
                                                                              : T extends {
                                                                                    kind: "recoverWikiCompileRuns";
                                                                                  }
                                                                                ? RecoverWikiCompileRunsResult
                                                                                : T extends {
                                                                                      kind: "claimNextWikiCompileStep";
                                                                                    }
                                                                                  ? WikiCompileClaimStepResult
                                                                                  : T extends {
                                                                                        kind: "getWikiCompileStepInput";
                                                                                      }
                                                                                    ? WikiCompileMapInput
                                                                                    : T extends {
                                                                                          kind: "completeWikiCompileStep";
                                                                                        }
                                                                                      ? WikiCompileStepRecord
                                                                                      : T extends {
                                                                                            kind: "claimWikiCompileReduce";
                                                                                          }
                                                                                        ? WikiCompileClaimReduceResult
                                                                                        : T extends {
                                                                                              kind: "getWikiCompileReduceInput";
                                                                                            }
                                                                                          ? WikiCompileReduceInput
                                                                                          : T extends {
                                                                                                kind: "completeWikiCompileReduce";
                                                                                              }
                                                                                            ? WikiCompileRunSummary
                                                                                            : T extends {
                                                                                                  kind: "listWikiCompileJobs";
                                                                                                }
                                                                                              ? ListWikiCompileJobsResult
                                                                                              : T extends {
                                                                                                    kind: "appendWikiCompileJobEvent";
                                                                                                  }
                                                                                                ? WikiCompileJobEvent
                                                                                                : T extends {
                                                                                                      kind: "listWikiCompileJobEvents";
                                                                                                    }
                                                                                                  ? ListWikiCompileJobEventsResult
                                                                                                  : T extends {
                                                                                                        kind:
                                                                                                          | "getWikiCompileJob"
                                                                                                          | "claimNextWikiCompileJob";
                                                                                                      }
                                                                                                    ? WikiCompileJobSummary | null
                                                                                                    : T extends {
                                                                                                          kind: "completeWikiCompileJob";
                                                                                                        }
                                                                                                      ? {
                                                                                                          job: WikiCompileJobSummary;
                                                                                                          topic: TopicPageDetail;
                                                                                                        }
                                                                                                      : T extends {
                                                                                                            kind: "failWikiCompileJob";
                                                                                                          }
                                                                                                        ? WikiCompileJobSummary | null
                                                                                                        : T extends {
                                                                                                              kind: "listTopicGraphEdges";
                                                                                                            }
                                                                                                          ? ListTopicGraphEdgesResult
                                                                                                          : T extends {
                                                                                                                kind: "buildSourceGraph";
                                                                                                              }
                                                                                                            ? BuildSourceGraphResult
                                                                                                            : T extends {
                                                                                                                  kind:
                                                                                                                    | "queryGraphNeighbors"
                                                                                                                    | "queryGraphSubgraph"
                                                                                                                    | "queryGraphPath"
                                                                                                                    | "queryGraphTimeline";
                                                                                                                }
                                                                                                              ? GraphQueryResult
                                                                                                              : T extends {
                                                                                                                    kind: "repair";
                                                                                                                  }
                                                                                                                ? RepairResult
                                                                                                                : T extends {
                                                                                                                      kind: "getActiveEmbeddingModel";
                                                                                                                    }
                                                                                                                  ? ActiveEmbeddingModelSummary | null
                                                                                                                  : T extends {
                                                                                                                        kind: "getJobStatus";
                                                                                                                      }
                                                                                                                    ? GetJobStatusResult
                                                                                                                    : T extends {
                                                                                                                          kind: "listOrchestrationRuns";
                                                                                                                        }
                                                                                                                      ? ListOrchestrationRunsResult
                                                                                                                      : T extends {
                                                                                                                            kind: "listOrchestrationEvents";
                                                                                                                          }
                                                                                                                        ? ListOrchestrationEventsResult
                                                                                                                        : T extends {
                                                                                                                              kind:
                                                                                                                                | "createOrchestrationRun"
                                                                                                                                | "runOrchestration"
                                                                                                                                | "cancelOrchestrationRun"
                                                                                                                                | "retryOrchestrationRun";
                                                                                                                            }
                                                                                                                          ? OrchestrationRunSummary
                                                                                                                          : T extends {
                                                                                                                                kind:
                                                                                                                                  | "runJob"
                                                                                                                                  | "cancelJob"
                                                                                                                                  | "enqueueChunkMetaTier2Job"
                                                                                                                                  | "enqueueSourceGraphJob";
                                                                                                                              }
                                                                                                                            ? JobSummary
                                                                                                                            : T extends {
                                                                                                                                  kind: "listChunkMetaTier2Audit";
                                                                                                                                }
                                                                                                                              ? {
                                                                                                                                  items: ChunkMetaTier2AuditRecord[];
                                                                                                                                }
                                                                                                                              : T extends {
                                                                                                                                    kind: "clearChunkMetaTier2Audit";
                                                                                                                                  }
                                                                                                                                ? {
                                                                                                                                    cleared: number;
                                                                                                                                  }
                                                                                                                                : T extends {
                                                                                                                                      kind:
                                                                                                                                        | "reindex"
                                                                                                                                        | "enqueueEmbeddingReindex";
                                                                                                                                    }
                                                                                                                                  ? ReindexResult
                                                                                                                                  : T extends {
                                                                                                                                        kind: "resolveAnchor";
                                                                                                                                      }
                                                                                                                                    ? AnchorResolveResult
                                                                                                                                    : T extends {
                                                                                                                                          kind: "createChatSession";
                                                                                                                                        }
                                                                                                                                      ? ChatSessionSummary
                                                                                                                                      : T extends {
                                                                                                                                            kind: "listChatSessions";
                                                                                                                                          }
                                                                                                                                        ? ListChatSessionsResult
                                                                                                                                        : T extends {
                                                                                                                                              kind:
                                                                                                                                                | "loadChatSession"
                                                                                                                                                | "recoverInterruptedChatSession";
                                                                                                                                            }
                                                                                                                                          ? ChatSessionDetail | null
                                                                                                                                          : T extends {
                                                                                                                                                kind:
                                                                                                                                                  | "claimChatSession"
                                                                                                                                                  | "heartbeatChatSession"
                                                                                                                                                  | "releaseChatSession";
                                                                                                                                              }
                                                                                                                                            ? SessionLeaseResult
                                                                                                                                            : T extends {
                                                                                                                                                  kind: "appendSessionEvidence";
                                                                                                                                                }
                                                                                                                                              ? SessionEvidenceRecord
                                                                                                                                              : T extends {
                                                                                                                                                    kind: "appendCompaction";
                                                                                                                                                  }
                                                                                                                                                ? CompactionRecord
                                                                                                                                                : T extends {
                                                                                                                                                      kind: "listCompactions";
                                                                                                                                                    }
                                                                                                                                                  ? {
                                                                                                                                                      items: CompactionRecord[];
                                                                                                                                                    }
                                                                                                                                                  : T extends {
                                                                                                                                                        kind: "getLatestCompaction";
                                                                                                                                                      }
                                                                                                                                                    ? CompactionRecord | null
                                                                                                                                                    : T extends {
                                                                                                                                                          kind:
                                                                                                                                                            | "upsertChatMessage"
                                                                                                                                                            | "updateChatMessage";
                                                                                                                                                        }
                                                                                                                                                      ? ChatMessageRecord
                                                                                                                                                      : T extends {
                                                                                                                                                            kind: "deleteChatMessage";
                                                                                                                                                          }
                                                                                                                                                        ? {
                                                                                                                                                            deleted: boolean;
                                                                                                                                                          }
                                                                                                                                                        : T extends {
                                                                                                                                                              kind: "clearQueuedChatMessages";
                                                                                                                                                            }
                                                                                                                                                          ? {
                                                                                                                                                              cleared: number;
                                                                                                                                                            }
                                                                                                                                                          : T extends {
                                                                                                                                                                kind: "listWebSearchHistory";
                                                                                                                                                              }
                                                                                                                                                            ? ListWebSearchHistoryResult
                                                                                                                                                            : T extends {
                                                                                                                                                                  kind: "appendWebSearchHistory";
                                                                                                                                                                }
                                                                                                                                                              ? WebSearchHistoryRecord
                                                                                                                                                              : T extends {
                                                                                                                                                                    kind: "deleteWebSearchHistory";
                                                                                                                                                                  }
                                                                                                                                                                ? {
                                                                                                                                                                    deleted: boolean;
                                                                                                                                                                  }
                                                                                                                                                                : T extends {
                                                                                                                                                                      kind: "clearWebSearchHistory";
                                                                                                                                                                    }
                                                                                                                                                                  ? {
                                                                                                                                                                      cleared: number;
                                                                                                                                                                    }
                                                                                                                                                                  : T extends {
                                                                                                                                                                        kind: "listImageGenerationHistory";
                                                                                                                                                                      }
                                                                                                                                                                    ? ListImageGenerationHistoryResult
                                                                                                                                                                    : T extends {
                                                                                                                                                                          kind: "appendImageGenerationHistory";
                                                                                                                                                                        }
                                                                                                                                                                      ? ImageGenerationHistoryRecord
                                                                                                                                                                      : T extends {
                                                                                                                                                                            kind: "deleteImageGenerationHistory";
                                                                                                                                                                          }
                                                                                                                                                                        ? {
                                                                                                                                                                            deleted: boolean;
                                                                                                                                                                          }
                                                                                                                                                                        : never;

export type EngineResponse<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; detail?: string } };

export type ProviderRequest =
  | { kind: "getProviderSettings" }
  | { kind: "saveGeminiProvider"; apiKey?: string; model: string }
  | { kind: "testGeminiProvider"; apiKey?: string; model?: string }
  | { kind: "ensureGeminiHostPermission" }
  | { kind: "saveOpenAIProvider"; apiKey?: string; model: string; baseUrl?: string }
  | { kind: "testOpenAIProvider"; apiKey?: string; model?: string; baseUrl?: string }
  | { kind: "ensureOpenAIHostPermission"; baseUrl?: string }
  | {
      kind: "saveOpenAICompatibleProvider";
      apiKey?: string;
      model: string;
      baseUrl?: string;
      providerName?: string;
    }
  | {
      kind: "testOpenAICompatibleProvider";
      apiKey?: string;
      model?: string;
      baseUrl?: string;
      providerName?: string;
    }
  | { kind: "ensureOpenAICompatibleHostPermission"; baseUrl?: string }
  | { kind: "setActiveProvider"; provider: ProviderId }
  | { kind: "getSearchProviderSettings" }
  | {
      kind: "saveSearchProviderSettings";
      provider: SearchProviderId;
      openai?: SearchOpenAIOverrideSettings;
      openaiCompatible?: SearchOpenAICompatibleOverrideSettings;
    }
  | { kind: "getImageGenerationSettings" }
  | { kind: "saveImageGenerationSettings"; settings: SaveImageGenerationSettingsInput }
  | { kind: "ensureImageGenerationHostPermission"; baseUrl?: string }
  | { kind: "getKnowledgeBaseAiSettings" }
  | { kind: "saveKnowledgeBaseAiSettings"; settings: SaveKnowledgeBaseAiSettingsInput }
  | { kind: "getVisionProviderSettings" }
  | { kind: "saveVisionProviderSettings"; settings: SaveVisionProviderSettingsInput }
  | {
      kind: "ensureVisionProviderHostPermission";
      provider?: Exclude<VisionProviderId, "auto">;
      baseUrl?: string;
    }
  | LocalEmbeddingModelRequest;

export type ProviderConfigRequest = { kind: "readActiveProviderConfig" };

export type ProviderConfigResult =
  | import("@/src/agent-runtime/provider-settings").StoredProviderConfig
  | undefined;

export type UiRequest = { kind: "openOptions" };

export type UiResultFor<T extends UiRequest> = T extends { kind: "openOptions" }
  ? { opened: true }
  : never;

export type ProviderResultFor<T extends ProviderRequest> = T extends LocalEmbeddingModelRequest
  ? LocalEmbeddingModelResult
  : T extends {
        kind:
          | "getProviderSettings"
          | "saveGeminiProvider"
          | "ensureGeminiHostPermission"
          | "saveOpenAIProvider"
          | "ensureOpenAIHostPermission"
          | "saveOpenAICompatibleProvider"
          | "ensureOpenAICompatibleHostPermission"
          | "setActiveProvider";
      }
    ? ProviderSettings
    : T extends { kind: "getSearchProviderSettings" | "saveSearchProviderSettings" }
      ? SearchProviderSettings
      : T extends { kind: "getImageGenerationSettings" | "saveImageGenerationSettings" }
        ? ImageGenerationSettings
        : T extends {
              kind: "getKnowledgeBaseAiSettings" | "saveKnowledgeBaseAiSettings";
            }
          ? KnowledgeBaseAiSettings
          : T extends { kind: "ensureImageGenerationHostPermission" }
            ? ProviderSettings
            : T extends {
                  kind: "getVisionProviderSettings" | "saveVisionProviderSettings";
                }
              ? VisionProviderSettings
              : T extends { kind: "ensureVisionProviderHostPermission" }
                ? ProviderSettings
                : T extends {
                      kind:
                        | "testGeminiProvider"
                        | "testOpenAIProvider"
                        | "testOpenAICompatibleProvider";
                    }
                  ? TestProviderResult
                  : never;

export type ProviderResponse<T = unknown> = EngineResponse<T>;

export type UiResponse<T = unknown> = EngineResponse<T>;

export interface EngineRequestMessage {
  type: typeof CLIO_ENGINE_REQUEST;
  request: EngineTransportRequest;
}

export interface OffscreenRequestMessage {
  type: typeof CLIO_OFFSCREEN_REQUEST;
  request: EngineTransportRequest;
}

export interface WikiCompileWakeMessage {
  type: typeof CLIO_WIKI_COMPILE_WAKE;
}

export interface WorkerRequestMessage {
  type: typeof CLIO_WORKER_REQUEST;
  requestId: string;
  request: EngineRequest;
}

export interface WorkerResponseMessage {
  type: typeof CLIO_WORKER_RESPONSE;
  requestId: string;
  response: EngineResponse;
}

export interface WorkerEmbeddingRequest {
  modelId: string;
  provider: EmbeddingReindexProviderId;
  purpose: LocalEmbeddingPurpose;
  inputs: string[];
}

export interface LocalEmbeddingModelRequestMessage {
  type: typeof CLIO_LOCAL_EMBEDDING_REQUEST;
  request: LocalEmbeddingModelRequest;
}

export interface WorkerEmbeddingRequestMessage {
  type: typeof CLIO_WORKER_EMBEDDING_REQUEST;
  requestId: string;
  request: WorkerEmbeddingRequest;
}

export interface WorkerEmbeddingResponseMessage {
  type: typeof CLIO_WORKER_EMBEDDING_RESPONSE;
  requestId: string;
  response: EngineResponse<number[][]>;
}

export type WorkerChunkMetaSummaryRequest = ChunkMetaSummaryInput;

export interface WorkerChunkMetaSummaryRequestMessage {
  type: typeof CLIO_WORKER_CHUNK_META_SUMMARY_REQUEST;
  requestId: string;
  request: WorkerChunkMetaSummaryRequest;
}

export interface WorkerChunkMetaSummaryResponseMessage {
  type: typeof CLIO_WORKER_CHUNK_META_SUMMARY_RESPONSE;
  requestId: string;
  response: EngineResponse<ChunkMetaSummaryResult>;
}

export type WorkerVisionAnalysisRequest = FigureVisionAnalysisInput;

export interface WorkerVisionAnalysisRequestMessage {
  type: typeof CLIO_WORKER_VISION_ANALYSIS_REQUEST;
  requestId: string;
  request: WorkerVisionAnalysisRequest;
}

export interface WorkerVisionAnalysisResponseMessage {
  type: typeof CLIO_WORKER_VISION_ANALYSIS_RESPONSE;
  requestId: string;
  response: EngineResponse<FigureVisionAnalysisResult>;
}

export type WorkerGraphExtractionRequest = GraphExtractionInput;

export interface WorkerGraphExtractionRequestMessage {
  type: typeof CLIO_WORKER_GRAPH_EXTRACTION_REQUEST;
  requestId: string;
  request: WorkerGraphExtractionRequest;
}

export interface WorkerGraphExtractionResponseMessage {
  type: typeof CLIO_WORKER_GRAPH_EXTRACTION_RESPONSE;
  requestId: string;
  response: EngineResponse<GraphExtractionResult>;
}

export type KnowledgeBaseClusterLabelRefinementRequest = KnowledgeBaseClusterLabelRefinementInput;
export type KnowledgeBaseClusterLabelRefinementResult =
  KnowledgeBaseClusterLabelRefinementRuntimeResult;

export interface KnowledgeBaseClusterLabelRefinementRequestMessage {
  type: typeof CLIO_KB_CLUSTER_LABEL_REFINEMENT_REQUEST;
  requestId: string;
  request: KnowledgeBaseClusterLabelRefinementRequest;
}

export interface KnowledgeBaseClusterLabelRefinementResponseMessage {
  type: typeof CLIO_KB_CLUSTER_LABEL_REFINEMENT_REQUEST;
  requestId: string;
  response: EngineResponse<KnowledgeBaseClusterLabelRefinementResult>;
}

export type ContentCommand =
  | { action: "toggleRail" }
  | { action: "openRail"; query?: string; memoryId?: string }
  | { action: "openSettings" }
  | { action: "openCommandPalette" }
  | { action: "savePage" }
  | { action: "saveSelection" };

export interface ContentCommandMessage {
  type: typeof CLIO_CONTENT_COMMAND;
  command: ContentCommand;
}

export interface ProviderRequestMessage {
  type: typeof CLIO_PROVIDER_REQUEST;
  request: ProviderRequest;
}

export interface ProviderConfigRequestMessage {
  type: typeof CLIO_PROVIDER_CONFIG_REQUEST;
  request: ProviderConfigRequest;
}

export interface UiRequestMessage {
  type: typeof CLIO_UI_REQUEST;
  request: UiRequest;
}

export interface AgentStreamRequestMessage {
  type: typeof CLIO_AGENT_STREAM_REQUEST;
  requestId: string;
  request: AgentChatRequest;
}

export interface AgentStreamSubscribeMessage {
  type: typeof CLIO_AGENT_STREAM_SUBSCRIBE;
  requestId: string;
  runId: string;
  sessionId: string;
  assistantMessageId: string;
}

export interface AgentStreamCompactMessage {
  type: typeof CLIO_AGENT_STREAM_COMPACT;
  requestId: string;
  runId: string;
  sessionId?: string;
}

export interface AgentStreamCancelMessage {
  type: typeof CLIO_AGENT_STREAM_CANCEL;
  requestId: string;
}

export interface AgentStreamEventMessage {
  type: typeof CLIO_AGENT_STREAM_EVENT;
  requestId: string;
  event: AgentStreamEvent;
}

export interface WebSearchStreamRequestMessage {
  type: typeof CLIO_WEB_SEARCH_STREAM_REQUEST;
  requestId: string;
  request: ClioWebSearchRequest;
}

export interface WebSearchStreamEventMessage {
  type: typeof CLIO_WEB_SEARCH_STREAM_EVENT;
  requestId: string;
  event: ClioWebSearchEvent;
}

export interface ImageGenerationStreamRequestMessage {
  type: typeof CLIO_IMAGE_GENERATION_STREAM_REQUEST;
  requestId: string;
  request: ClioImageGenerationRequest;
}

export interface ImageGenerationStreamCancelMessage {
  type: typeof CLIO_IMAGE_GENERATION_STREAM_CANCEL;
  requestId: string;
}

export interface ImageGenerationStreamEventMessage {
  type: typeof CLIO_IMAGE_GENERATION_STREAM_EVENT;
  requestId: string;
  event: ClioImageGenerationEvent;
}

export type AgentRunRequest =
  | { kind: "start"; request: AgentChatRequest }
  | { kind: "subscribe"; runId: string; sessionId: string; assistantMessageId: string }
  | { kind: "compact"; runId: string; sessionId?: string }
  | { kind: "cancel"; runId: string };

export interface AgentRunRequestMessage {
  type: typeof CLIO_AGENT_RUN_REQUEST;
  request: AgentRunRequest;
}

export interface AgentRunEventMessage {
  type: typeof CLIO_AGENT_RUN_EVENT;
  event: AgentStreamEvent;
}

export type WebSearchRunRequest = { kind: "start"; request: ClioWebSearchRequest };

export type ImageGenerationRunRequest =
  | { kind: "start"; request: ClioImageGenerationRequest }
  | { kind: "cancel"; runId: string };

export interface WebSearchRunRequestMessage {
  type: typeof CLIO_WEB_SEARCH_RUN_REQUEST;
  request: WebSearchRunRequest;
}

export interface WebSearchRunEventMessage {
  type: typeof CLIO_WEB_SEARCH_RUN_EVENT;
  event: ClioWebSearchEvent;
}

export interface ImageGenerationRunRequestMessage {
  type: typeof CLIO_IMAGE_GENERATION_RUN_REQUEST;
  request: ImageGenerationRunRequest;
}

export interface ImageGenerationRunEventMessage {
  type: typeof CLIO_IMAGE_GENERATION_RUN_EVENT;
  event: ClioImageGenerationEvent;
}

export class EngineRpcError extends Error {
  readonly code: string;
  readonly detail?: string;

  constructor(code: string, message: string, detail?: string) {
    super(message);
    this.name = "EngineRpcError";
    this.code = code;
    this.detail = detail;
  }
}

export function engineErrorFromUnknown(error: unknown, code = "ENGINE_ERROR") {
  if (error instanceof EngineRpcError) {
    return {
      code: error.code,
      message: error.message,
      detail: error.detail,
    };
  }
  if (error instanceof Error) {
    return {
      code,
      message: error.message,
      detail: error.stack,
    };
  }
  return {
    code,
    message: String(error),
  };
}

export function createRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function encodeEngineRequestForChrome(request: EngineRequest): EngineTransportRequest {
  if (isWikiCompileWorkerRequest(request)) {
    throw new EngineRpcError(
      "ENGINE_TRANSPORT_FORBIDDEN",
      "Worker-only Wiki compile scheduler requests cannot cross the extension transport.",
    );
  }
  if (request.kind !== "capturePdf") return request;
  const { bytes, ...payload } = request.payload;
  const normalizedBytes = pdfBytesToUint8Array(bytes);
  return {
    kind: "capturePdf",
    payload: {
      ...payload,
      bytesBase64: encodeBytesBase64(normalizedBytes),
      byteLength: normalizedBytes.byteLength,
    },
  };
}

export function decodeEngineRequestFromChrome(request: EngineTransportRequest): EngineRequest {
  if (request.kind !== "capturePdf") return request;
  const { bytesBase64, byteLength, ...payload } = request.payload;
  const bytes = decodeBytesBase64(bytesBase64);
  if (bytes.byteLength !== byteLength) {
    throw new EngineRpcError(
      "PDF_TRANSPORT_LENGTH_MISMATCH",
      "PDF upload bytes were truncated while crossing the extension message boundary.",
    );
  }
  return {
    kind: "capturePdf",
    payload: { ...payload, bytes },
  };
}

export function encodeEngineResponseForChrome(
  request: EngineRequest,
  response: EngineResponse,
): EngineResponse {
  if (request.kind !== "getPdfRawFile" || !response.ok) return response;
  const value = response.value as PdfRawFileResult;
  const { bytes, ...result } = value;
  const normalizedBytes = pdfBytesToUint8Array(bytes);
  return {
    ok: true,
    value: {
      ...result,
      bytesBase64: encodeBytesBase64(normalizedBytes),
    },
  };
}

export function decodeEngineResponseFromChrome<T>(
  request: EngineRequest,
  response: EngineResponse<T> | null | undefined,
): EngineResponse<T> | null | undefined {
  if (request.kind !== "getPdfRawFile" || response === null || response === undefined) {
    return response;
  }
  if (!response.ok) return response;
  const value = response.value as Record<string, unknown>;
  if (typeof value.bytesBase64 !== "string") {
    throw new EngineRpcError(
      "PDF_TRANSPORT_RESPONSE_INVALID",
      "Raw PDF bytes were not returned in a browser-readable format.",
    );
  }
  const { bytesBase64, ...result } = value;
  return {
    ok: true,
    value: {
      ...result,
      bytes: decodeBytesBase64(bytesBase64),
    } as T,
  };
}

export function isEngineRequestMessage(value: unknown): value is EngineRequestMessage {
  return (
    isRecord(value) && value.type === CLIO_ENGINE_REQUEST && isEngineTransportRequest(value.request)
  );
}

export function isOffscreenRequestMessage(value: unknown): value is OffscreenRequestMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_OFFSCREEN_REQUEST &&
    isEngineTransportRequest(value.request)
  );
}

export function isWikiCompileWakeMessage(value: unknown): value is WikiCompileWakeMessage {
  return isRecord(value) && value.type === CLIO_WIKI_COMPILE_WAKE;
}

export function isWorkerRequestMessage(value: unknown): value is WorkerRequestMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_WORKER_REQUEST &&
    typeof value.requestId === "string" &&
    isEngineRequest(value.request)
  );
}

export function isWorkerResponseMessage(value: unknown): value is WorkerResponseMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_WORKER_RESPONSE &&
    typeof value.requestId === "string" &&
    isEngineResponse(value.response)
  );
}

export function isWorkerEmbeddingRequestMessage(
  value: unknown,
): value is WorkerEmbeddingRequestMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_WORKER_EMBEDDING_REQUEST &&
    typeof value.requestId === "string" &&
    isWorkerEmbeddingRequest(value.request)
  );
}

export function isLocalEmbeddingModelRequestMessage(
  value: unknown,
): value is LocalEmbeddingModelRequestMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_LOCAL_EMBEDDING_REQUEST &&
    isLocalEmbeddingModelRequest(value.request)
  );
}

export function isWorkerEmbeddingResponseMessage(
  value: unknown,
): value is WorkerEmbeddingResponseMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_WORKER_EMBEDDING_RESPONSE &&
    typeof value.requestId === "string" &&
    isEmbeddingVectorBatchResponse(value.response)
  );
}

export function isWorkerChunkMetaSummaryRequestMessage(
  value: unknown,
): value is WorkerChunkMetaSummaryRequestMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_WORKER_CHUNK_META_SUMMARY_REQUEST &&
    typeof value.requestId === "string" &&
    isWorkerChunkMetaSummaryRequest(value.request)
  );
}

export function isWorkerChunkMetaSummaryResponseMessage(
  value: unknown,
): value is WorkerChunkMetaSummaryResponseMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_WORKER_CHUNK_META_SUMMARY_RESPONSE &&
    typeof value.requestId === "string" &&
    isChunkMetaSummaryResponse(value.response)
  );
}

export function isWorkerVisionAnalysisRequestMessage(
  value: unknown,
): value is WorkerVisionAnalysisRequestMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_WORKER_VISION_ANALYSIS_REQUEST &&
    typeof value.requestId === "string" &&
    isWorkerVisionAnalysisRequest(value.request)
  );
}

export function isWorkerVisionAnalysisResponseMessage(
  value: unknown,
): value is WorkerVisionAnalysisResponseMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_WORKER_VISION_ANALYSIS_RESPONSE &&
    typeof value.requestId === "string" &&
    isFigureVisionAnalysisResponse(value.response)
  );
}

export function isWorkerGraphExtractionRequestMessage(
  value: unknown,
): value is WorkerGraphExtractionRequestMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_WORKER_GRAPH_EXTRACTION_REQUEST &&
    typeof value.requestId === "string" &&
    isWorkerGraphExtractionRequest(value.request)
  );
}

export function isWorkerGraphExtractionResponseMessage(
  value: unknown,
): value is WorkerGraphExtractionResponseMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_WORKER_GRAPH_EXTRACTION_RESPONSE &&
    typeof value.requestId === "string" &&
    isGraphExtractionResponse(value.response)
  );
}

export function isKnowledgeBaseClusterLabelRefinementRequestMessage(
  value: unknown,
): value is KnowledgeBaseClusterLabelRefinementRequestMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_KB_CLUSTER_LABEL_REFINEMENT_REQUEST &&
    typeof value.requestId === "string" &&
    isKnowledgeBaseClusterLabelRefinementRequest(value.request)
  );
}

export function isKnowledgeBaseClusterLabelRefinementResponseMessage(
  value: unknown,
): value is KnowledgeBaseClusterLabelRefinementResponseMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_KB_CLUSTER_LABEL_REFINEMENT_REQUEST &&
    typeof value.requestId === "string" &&
    isKnowledgeBaseClusterLabelRefinementResponse(value.response)
  );
}

export function isContentCommandMessage(value: unknown): value is ContentCommandMessage {
  return isRecord(value) && value.type === CLIO_CONTENT_COMMAND && isContentCommand(value.command);
}

export function isProviderRequestMessage(value: unknown): value is ProviderRequestMessage {
  return (
    isRecord(value) && value.type === CLIO_PROVIDER_REQUEST && isProviderRequest(value.request)
  );
}

export function isProviderConfigRequestMessage(
  value: unknown,
): value is ProviderConfigRequestMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_PROVIDER_CONFIG_REQUEST &&
    isProviderConfigRequest(value.request)
  );
}

export function isUiRequestMessage(value: unknown): value is UiRequestMessage {
  return isRecord(value) && value.type === CLIO_UI_REQUEST && isUiRequest(value.request);
}

export function isAgentStreamRequestMessage(value: unknown): value is AgentStreamRequestMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_AGENT_STREAM_REQUEST &&
    typeof value.requestId === "string" &&
    isAgentChatRequest(value.request)
  );
}

export function isAgentStreamSubscribeMessage(
  value: unknown,
): value is AgentStreamSubscribeMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_AGENT_STREAM_SUBSCRIBE &&
    typeof value.requestId === "string" &&
    typeof value.runId === "string" &&
    typeof value.sessionId === "string" &&
    typeof value.assistantMessageId === "string"
  );
}

export function isAgentStreamCompactMessage(value: unknown): value is AgentStreamCompactMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_AGENT_STREAM_COMPACT &&
    typeof value.requestId === "string" &&
    typeof value.runId === "string" &&
    (value.sessionId === undefined || typeof value.sessionId === "string")
  );
}

export function isAgentStreamCancelMessage(value: unknown): value is AgentStreamCancelMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_AGENT_STREAM_CANCEL &&
    typeof value.requestId === "string"
  );
}

export function isAgentStreamEventMessage(value: unknown): value is AgentStreamEventMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_AGENT_STREAM_EVENT &&
    typeof value.requestId === "string" &&
    isAgentStreamEvent(value.event)
  );
}

export function isAgentRunRequestMessage(value: unknown): value is AgentRunRequestMessage {
  return (
    isRecord(value) && value.type === CLIO_AGENT_RUN_REQUEST && isAgentRunRequest(value.request)
  );
}

export function isAgentRunEventMessage(value: unknown): value is AgentRunEventMessage {
  return isRecord(value) && value.type === CLIO_AGENT_RUN_EVENT && isAgentStreamEvent(value.event);
}

export function isWebSearchStreamRequestMessage(
  value: unknown,
): value is WebSearchStreamRequestMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_WEB_SEARCH_STREAM_REQUEST &&
    typeof value.requestId === "string" &&
    isClioWebSearchRequest(value.request)
  );
}

export function isWebSearchStreamEventMessage(
  value: unknown,
): value is WebSearchStreamEventMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_WEB_SEARCH_STREAM_EVENT &&
    typeof value.requestId === "string" &&
    isClioWebSearchEvent(value.event)
  );
}

export function isWebSearchRunRequestMessage(value: unknown): value is WebSearchRunRequestMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_WEB_SEARCH_RUN_REQUEST &&
    isWebSearchRunRequest(value.request)
  );
}

export function isWebSearchRunEventMessage(value: unknown): value is WebSearchRunEventMessage {
  return (
    isRecord(value) && value.type === CLIO_WEB_SEARCH_RUN_EVENT && isClioWebSearchEvent(value.event)
  );
}

export function isImageGenerationStreamRequestMessage(
  value: unknown,
): value is ImageGenerationStreamRequestMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_IMAGE_GENERATION_STREAM_REQUEST &&
    typeof value.requestId === "string" &&
    isClioImageGenerationRequest(value.request)
  );
}

export function isImageGenerationStreamCancelMessage(
  value: unknown,
): value is ImageGenerationStreamCancelMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_IMAGE_GENERATION_STREAM_CANCEL &&
    typeof value.requestId === "string"
  );
}

export function isImageGenerationStreamEventMessage(
  value: unknown,
): value is ImageGenerationStreamEventMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_IMAGE_GENERATION_STREAM_EVENT &&
    typeof value.requestId === "string" &&
    isClioImageGenerationEvent(value.event)
  );
}

export function isImageGenerationRunRequestMessage(
  value: unknown,
): value is ImageGenerationRunRequestMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_IMAGE_GENERATION_RUN_REQUEST &&
    isImageGenerationRunRequest(value.request)
  );
}

export function isImageGenerationRunEventMessage(
  value: unknown,
): value is ImageGenerationRunEventMessage {
  return (
    isRecord(value) &&
    value.type === CLIO_IMAGE_GENERATION_RUN_EVENT &&
    isClioImageGenerationEvent(value.event)
  );
}

export function unwrapEngineResponse<T>(response: EngineResponse<T> | null | undefined): T {
  if (response === null || response === undefined) {
    throw new EngineRpcError(
      "RPC_RESPONSE_MISSING",
      "Clio background did not return a response. Reload the extension and refresh this page.",
    );
  }
  if (response.ok) return response.value;
  throw new EngineRpcError(response.error.code, response.error.message, response.error.detail);
}

function isEngineTransportRequest(value: unknown): value is EngineTransportRequest {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "capturePdf") return isCapturePdfTransportPayload(value.payload);
  if (isWikiCompileWorkerRequestKind(value.kind)) return false;
  return isEngineRequest(value);
}

function isEngineRequest(value: unknown): value is EngineRequest {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "health":
      return true;
    case "capturePage":
      return isCapturePayload(value.payload);
    case "captureMarkdown":
      return isCaptureMarkdownPayload(value.payload);
    case "capturePdf":
      return isCapturePdfPayload(value.payload);
    case "captureSelection":
      return isCapturePayload(value.payload);
    case "retrieveSources":
      return isRetrieveSourcesPayload(value.payload);
    case "searchKnowledgeBase":
      return isSearchKnowledgeBasePayload(value.payload);
    case "listWorkingSetEntries":
    case "getWorkingSetStatus":
      return true;
    case "pinWorkingSetSource":
    case "reloadWorkingSetSource":
      return isWorkingSetSourcePayload(value.payload);
    case "evictWorkingSetSource":
      return isEvictWorkingSetSourcePayload(value.payload);
    case "setWorkingSetSourceDepth":
      return isSetWorkingSetSourceDepthPayload(value.payload);
    case "searchMemory":
      return typeof value.query === "string";
    case "listMemories":
      return value.limit === undefined || typeof value.limit === "number";
    case "getMemory":
    case "getPdfRawFile":
      return typeof value.id === "string";
    case "getMemoryEvidenceWindows":
      return isGetMemoryEvidenceWindowsPayload(value.payload);
    case "buildSourceContextPack":
      return isBuildSourceContextPackPayload(value.payload);
    case "appendSourceContextCompressionLogs":
      return isAppendSourceContextCompressionLogsPayload(value.payload);
    case "listSourceContextCompressionLogs":
    case "clearSourceContextCompressionLogs":
      return value.filter === undefined || isSourceContextCompressionLogFilter(value.filter);
    case "appendSourceContextMapArtifacts":
      return isAppendSourceContextMapArtifactsPayload(value.payload);
    case "listSourceContextMapArtifacts":
    case "clearSourceContextMapArtifacts":
      return value.filter === undefined || isSourceContextMapArtifactFilter(value.filter);
    case "createOrResumeSourceContextMapRun":
      return isCreateOrResumeSourceContextMapRunPayload(value.payload);
    case "listSourceContextMapRuns":
      return value.filter === undefined || isSourceContextMapRunFilter(value.filter);
    case "getSourceContextMapRun":
    case "cancelSourceContextMapRun":
    case "retrySourceContextMapRun":
    case "resumeSourceContextMapRun":
      return typeof value.id === "string";
    case "listSourceContextMapEvents":
      return (
        typeof value.runId === "string" &&
        (value.limit === undefined || typeof value.limit === "number")
      );
    case "claimSourceContextMapStep":
      return (
        typeof value.runId === "string" &&
        (value.now === undefined || typeof value.now === "string")
      );
    case "completeSourceContextMapStep":
      return isCompleteSourceContextMapStepPayload(value.payload);
    case "failSourceContextMapStep":
      return isFailSourceContextMapStepPayload(value.payload);
    case "markSourceContextMapReduceStarted":
      return isMarkSourceContextMapReduceStartedPayload(value.payload);
    case "markSourceContextMapReduceCompleted":
      return isMarkSourceContextMapReduceCompletedPayload(value.payload);
    case "markSourceContextMapReduceFailed":
      return isMarkSourceContextMapReduceFailedPayload(value.payload);
    case "deleteMemory":
      return typeof value.id === "string";
    case "listTopicPages":
      return (
        (value.query === undefined || typeof value.query === "string") &&
        (value.limit === undefined || typeof value.limit === "number")
      );
    case "getTopicPage":
    case "deleteTopicPage":
      return typeof value.id === "string";
    case "createTopicPage":
      return isCreateTopicPagePayload(value.payload);
    case "updateTopicPage":
      return typeof value.id === "string" && isUpdateTopicPagePayload(value.payload);
    case "publishWikiArtifacts":
      return isPublishWikiArtifactsPayload(value.payload);
    case "listWikiArtifacts":
      return value.filter === undefined || isWikiArtifactFilter(value.filter);
    case "getWikiArtifact":
    case "deleteWikiArtifact":
      return isBoundedWikiString(value.id, WIKI_ARTIFACT_ID_MAX_LENGTH);
    case "appendWikiUserEdit":
      return isAppendWikiUserEditPayload(value.payload);
    case "listWikiUserEdits":
      return (
        isBoundedWikiString(value.artifactId, WIKI_ARTIFACT_ID_MAX_LENGTH) &&
        (value.limit === undefined || isWikiArtifactListLimit(value.limit))
      );
    case "enqueueWikiCompileRun":
      return isEnqueueWikiCompileRunPayload(value.payload);
    case "listWikiCompileRuns":
      return value.filter === undefined || isWikiCompileRunFilter(value.filter);
    case "getWikiCompileRun":
    case "cancelWikiCompileRun":
    case "retryWikiCompileRun":
    case "resumeWikiCompileRun":
      return typeof value.id === "string";
    case "listWikiCompileEvents":
      return (
        typeof value.runId === "string" &&
        (value.limit === undefined ||
          (typeof value.limit === "number" && Number.isInteger(value.limit)))
      );
    case "createWikiCompileRun":
      return isCreateWikiCompileRunPayload(value.payload);
    case "recoverWikiCompileRuns":
      return isRecoverWikiCompileRunsPayload(value.payload);
    case "claimNextWikiCompileStep":
    case "claimWikiCompileReduce":
      return (
        typeof value.leaseOwner === "string" &&
        (value.now === undefined || typeof value.now === "string") &&
        (value.leaseMs === undefined ||
          (typeof value.leaseMs === "number" && Number.isInteger(value.leaseMs)))
      );
    case "getWikiCompileStepInput":
      return (
        typeof value.runId === "string" &&
        typeof value.stepId === "string" &&
        typeof value.leaseOwner === "string"
      );
    case "completeWikiCompileStep":
      return isCompleteWikiCompileStepPayload(value.payload);
    case "failWikiCompileStep":
    case "failWikiCompileReduce":
      return isFailWikiCompileStagePayload(value.payload);
    case "pauseWikiCompileRun":
      return isPauseWikiCompileRunPayload(value.payload);
    case "getWikiCompileReduceInput":
      return typeof value.runId === "string" && typeof value.leaseOwner === "string";
    case "completeWikiCompileReduce":
      return isCompleteWikiCompileReducePayload(value.payload);
    case "enqueueWikiCompile":
      return isCreateWikiCompileJobPayload(value.payload);
    case "listWikiCompileJobs":
      return (
        (value.status === undefined || isWikiCompileJobStatus(value.status)) &&
        (value.limit === undefined || typeof value.limit === "number")
      );
    case "appendWikiCompileJobEvent":
      return isCreateWikiCompileJobEventPayload(value.payload);
    case "listWikiCompileJobEvents":
      return (
        typeof value.jobId === "string" &&
        (value.limit === undefined || typeof value.limit === "number")
      );
    case "getWikiCompileJob":
    case "claimNextWikiCompileJob":
      return value.kind === "claimNextWikiCompileJob"
        ? (value.id === undefined || typeof value.id === "string") &&
            (value.now === undefined || typeof value.now === "string")
        : typeof value.id === "string";
    case "completeWikiCompileJob":
      return typeof value.id === "string" && isWikiCompileResultPayload(value.result);
    case "failWikiCompileJob":
      return (
        typeof value.id === "string" &&
        typeof value.error === "string" &&
        (value.retryAfter === undefined || typeof value.retryAfter === "string") &&
        (value.now === undefined || typeof value.now === "string")
      );
    case "listTopicGraphEdges":
      return (
        typeof value.topicId === "string" &&
        (value.edgeKind === undefined || isTopicGraphEdgeKind(value.edgeKind))
      );
    case "buildSourceGraph":
      return isBuildSourceGraphPayload(value.payload);
    case "enqueueSourceGraphJob":
      return isEnqueueSourceGraphJobPayload(value.payload);
    case "queryGraphNeighbors":
      return isGraphNeighborsPayload(value.payload);
    case "queryGraphSubgraph":
      return isGraphSubgraphPayload(value.payload);
    case "queryGraphPath":
      return isGraphPathPayload(value.payload);
    case "queryGraphTimeline":
      return isGraphTimelinePayload(value.payload);
    case "repair":
      return isRepairAction(value.action);
    case "getActiveEmbeddingModel":
      return true;
    case "getJobStatus":
      return (
        (value.status === undefined || isJobStatus(value.status)) &&
        (value.limit === undefined || typeof value.limit === "number")
      );
    case "runJob":
    case "cancelJob":
      return typeof value.id === "string";
    case "createOrchestrationRun":
      return isCreateOrchestrationRunPayload(value.payload);
    case "listOrchestrationRuns":
      return value.filter === undefined || isOrchestrationRunFilter(value.filter);
    case "runOrchestration":
    case "cancelOrchestrationRun":
    case "retryOrchestrationRun":
      return typeof value.id === "string";
    case "listOrchestrationEvents":
      return (
        typeof value.runId === "string" &&
        (value.limit === undefined || typeof value.limit === "number")
      );
    case "enqueueChunkMetaTier2Job":
      return isEnqueueChunkMetaTier2JobPayload(value.payload);
    case "listChunkMetaTier2Audit":
      return value.filter === undefined || isChunkMetaTier2AuditFilter(value.filter, false);
    case "clearChunkMetaTier2Audit":
      return isChunkMetaTier2AuditFilter(value.filter, true);
    case "reindex":
      if (value.scope === "fts") return true;
      if (value.scope === "embeddings") return isEmbeddingReindexModelDescriptor(value.model);
      return false;
    case "enqueueEmbeddingReindex":
      return isEmbeddingReindexModelDescriptor(value.model);
    case "resolveAnchor":
      return typeof value.memoryId === "string";
    case "createChatSession":
      return isCreateChatSessionPayload(value.payload);
    case "listChatSessions":
      return value.limit === undefined || typeof value.limit === "number";
    case "loadChatSession":
    case "clearQueuedChatMessages":
    case "recoverInterruptedChatSession":
      return typeof value.sessionId === "string";
    case "listWebSearchHistory":
      return value.limit === undefined || typeof value.limit === "number";
    case "appendWebSearchHistory":
      return isWebSearchHistoryRecord(value.payload);
    case "deleteWebSearchHistory":
      return typeof value.id === "string";
    case "clearWebSearchHistory":
      return true;
    case "listImageGenerationHistory":
      return value.limit === undefined || typeof value.limit === "number";
    case "appendImageGenerationHistory":
      return isImageGenerationHistoryRecord(value.payload);
    case "deleteImageGenerationHistory":
      return typeof value.id === "string";
    case "claimChatSession":
    case "heartbeatChatSession":
      return (
        typeof value.sessionId === "string" &&
        typeof value.ownerId === "string" &&
        (value.now === undefined || typeof value.now === "string")
      );
    case "releaseChatSession":
      return typeof value.sessionId === "string" && typeof value.ownerId === "string";
    case "appendSessionEvidence":
      return isAppendSessionEvidencePayload(value.payload);
    case "appendCompaction":
      return isCreateCompactionPayload(value.payload);
    case "listCompactions":
      return (
        typeof value.sessionId === "string" &&
        (value.limit === undefined || typeof value.limit === "number")
      );
    case "getLatestCompaction":
      return typeof value.sessionId === "string";
    case "upsertChatMessage":
      return isUpsertChatMessagePayload(value.payload);
    case "updateChatMessage":
      return isUpdateChatMessagePayload(value.payload);
    case "deleteChatMessage":
      return typeof value.sessionId === "string" && typeof value.messageId === "string";
    default:
      return false;
  }
}

function isWikiCompileWorkerRequestKind(kind: string) {
  return (
    kind === "createWikiCompileRun" ||
    kind === "recoverWikiCompileRuns" ||
    kind === "claimNextWikiCompileStep" ||
    kind === "getWikiCompileStepInput" ||
    kind === "completeWikiCompileStep" ||
    kind === "failWikiCompileStep" ||
    kind === "pauseWikiCompileRun" ||
    kind === "claimWikiCompileReduce" ||
    kind === "getWikiCompileReduceInput" ||
    kind === "completeWikiCompileReduce" ||
    kind === "failWikiCompileReduce"
  );
}

function isWikiCompileWorkerRequest(request: EngineRequest): request is WikiCompileWorkerRequest {
  return isWikiCompileWorkerRequestKind(request.kind);
}

function isCapturePayload(value: unknown): value is CaptureBasePayload {
  return (
    isRecord(value) &&
    typeof value.sourceUrl === "string" &&
    typeof value.sourceTitle === "string" &&
    typeof value.normalizedText === "string"
  );
}

function isCaptureMarkdownPayload(value: unknown): value is CaptureMarkdownPayload {
  return (
    isRecord(value) &&
    typeof value.sourceUrl === "string" &&
    typeof value.sourceTitle === "string" &&
    typeof value.markdownText === "string"
  );
}

function isCapturePdfPayload(value: unknown): value is CapturePdfPayload {
  return (
    isRecord(value) &&
    typeof value.sourceUrl === "string" &&
    typeof value.sourceTitle === "string" &&
    isPdfBytes(value.bytes)
  );
}

function isCapturePdfTransportPayload(value: unknown): value is CapturePdfTransportPayload {
  return (
    isRecord(value) &&
    typeof value.sourceUrl === "string" &&
    typeof value.sourceTitle === "string" &&
    typeof value.bytesBase64 === "string" &&
    value.bytesBase64.length > 0 &&
    typeof value.byteLength === "number" &&
    Number.isInteger(value.byteLength) &&
    value.byteLength > 0
  );
}

function isPdfBytes(value: unknown): value is ArrayBuffer | Uint8Array {
  return (
    value instanceof Uint8Array ||
    value instanceof ArrayBuffer ||
    Object.prototype.toString.call(value) === "[object ArrayBuffer]"
  );
}

function pdfBytesToUint8Array(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  if (bytes instanceof Uint8Array) return new Uint8Array(bytes);
  return new Uint8Array(bytes.slice(0));
}

function encodeBytesBase64(bytes: Uint8Array): string {
  const chunkSize = 24_576;
  let encoded = "";
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, bytes.byteLength);
    let binary = "";
    for (let index = offset; index < end; index += 1) {
      binary += String.fromCharCode(bytes[index] ?? 0);
    }
    encoded += btoa(binary);
  }
  return encoded;
}

function decodeBytesBase64(encoded: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(encoded);
  } catch (error) {
    throw new EngineRpcError(
      "PDF_TRANSPORT_BASE64_INVALID",
      "PDF upload bytes were corrupted while crossing the extension message boundary.",
      error instanceof Error ? error.message : String(error),
    );
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isGetMemoryEvidenceWindowsPayload(
  value: unknown,
): value is GetMemoryEvidenceWindowsPayload {
  return (
    isRecord(value) &&
    (value.query === undefined || typeof value.query === "string") &&
    (value.memoryIds === undefined ||
      (Array.isArray(value.memoryIds) &&
        value.memoryIds.every((item) => typeof item === "string"))) &&
    (value.anchors === undefined ||
      (Array.isArray(value.anchors) && value.anchors.every(isGetMemoryEvidenceWindowAnchor))) &&
    (value.limit === undefined || typeof value.limit === "number") &&
    (value.maxWindowsPerMemory === undefined || typeof value.maxWindowsPerMemory === "number") &&
    (value.contextChunksBefore === undefined || typeof value.contextChunksBefore === "number") &&
    (value.contextChunksAfter === undefined || typeof value.contextChunksAfter === "number")
  );
}

function isGetMemoryEvidenceWindowAnchor(value: unknown): value is GetMemoryEvidenceWindowAnchor {
  if (!isRecord(value) || typeof value.memoryId !== "string") return false;
  const hasChunkId = value.chunkId !== undefined;
  const hasOrd = value.ord !== undefined;
  return (
    (value.chunkId === undefined || typeof value.chunkId === "string") &&
    (value.ord === undefined || (typeof value.ord === "number" && Number.isFinite(value.ord))) &&
    (hasChunkId || hasOrd)
  );
}

function isBuildSourceContextPackPayload(value: unknown): value is BuildSourceContextPackPayload {
  return (
    isRecord(value) &&
    (value.query === undefined || typeof value.query === "string") &&
    (value.sourceIds === undefined ||
      (Array.isArray(value.sourceIds) &&
        value.sourceIds.every((item) => typeof item === "string"))) &&
    (value.sourceDepthOverrides === undefined ||
      (Array.isArray(value.sourceDepthOverrides) &&
        value.sourceDepthOverrides.every(isSourceContextPackSourceDepthOverride))) &&
    (value.anchors === undefined ||
      (Array.isArray(value.anchors) && value.anchors.every(isGetMemoryEvidenceWindowAnchor))) &&
    (value.useWorkingSet === undefined || typeof value.useWorkingSet === "boolean") &&
    (value.maxTotalTokens === undefined || typeof value.maxTotalTokens === "number") &&
    (value.maxGroups === undefined || typeof value.maxGroups === "number") &&
    (value.maxGroupTokens === undefined || typeof value.maxGroupTokens === "number") &&
    (value.maxSources === undefined || typeof value.maxSources === "number") &&
    (value.maxWindowsPerSource === undefined || typeof value.maxWindowsPerSource === "number") &&
    (value.contextChunksBefore === undefined || typeof value.contextChunksBefore === "number") &&
    (value.contextChunksAfter === undefined || typeof value.contextChunksAfter === "number")
  );
}

function isSourceContextPackSourceDepthOverride(
  value: unknown,
): value is SourceContextPackSourceDepthOverride {
  return (
    isRecord(value) &&
    typeof value.sourceId === "string" &&
    value.sourceId.trim().length > 0 &&
    isWorkingSetLoadDepth(value.loadDepth)
  );
}

function isAppendSourceContextCompressionLogsPayload(
  value: unknown,
): value is AppendSourceContextCompressionLogsPayload {
  return (
    isRecord(value) &&
    (typeof value.sessionId === "string" || typeof value.runId === "string") &&
    (value.sessionId === undefined || typeof value.sessionId === "string") &&
    (value.runId === undefined || typeof value.runId === "string") &&
    Array.isArray(value.entries) &&
    value.entries.every(isSourceContextCompressionLogEntry) &&
    (value.createdAt === undefined || typeof value.createdAt === "string")
  );
}

function isSourceContextCompressionLogEntry(
  value: unknown,
): value is SourceContextCompressionLogEntry {
  return (
    isRecord(value) &&
    isSourceContextCompressionReason(value.reason) &&
    typeof value.message === "string" &&
    (value.sourceId === undefined || typeof value.sourceId === "string") &&
    (value.chunkId === undefined || typeof value.chunkId === "string") &&
    (value.requestedLoadDepth === undefined || isWorkingSetLoadDepth(value.requestedLoadDepth)) &&
    (value.selectedLoadDepth === undefined || isWorkingSetLoadDepth(value.selectedLoadDepth)) &&
    isOptionalFiniteNumber(value.tokenEstimate) &&
    isOptionalFiniteNumber(value.omittedTokenEstimate) &&
    isOptionalFiniteNumber(value.omittedWindowCount) &&
    (value.lostInfoTypes === undefined ||
      (Array.isArray(value.lostInfoTypes) &&
        value.lostInfoTypes.every(isSourceContextLostInfoType)))
  );
}

function isSourceContextCompressionReason(value: unknown): value is SourceContextCompressionReason {
  return (
    value === "query_no_hits" ||
    value === "source_not_found" ||
    value === "source_over_budget" ||
    value === "source_downgraded" ||
    value === "chunk_window_omitted" ||
    value === "parent_context_selected" ||
    value === "full_depth_bounded" ||
    value === "group_limit_reached"
  );
}

function isSourceContextLostInfoType(value: unknown): value is SourceContextLostInfoType {
  return (
    value === "query_candidates" ||
    value === "source" ||
    value === "load_depth" ||
    value === "chunk_windows" ||
    value === "chunk_detail" ||
    value === "full_document" ||
    value === "groups"
  );
}

function isSourceContextCompressionLogFilter(
  value: unknown,
): value is SourceContextCompressionLogFilter {
  return (
    isRecord(value) &&
    (value.sessionId === undefined || typeof value.sessionId === "string") &&
    (value.runId === undefined || typeof value.runId === "string") &&
    (value.sourceId === undefined || typeof value.sourceId === "string") &&
    isOptionalFiniteNumber(value.limit)
  );
}

function isAppendSourceContextMapArtifactsPayload(
  value: unknown,
): value is AppendSourceContextMapArtifactsPayload {
  return (
    isRecord(value) &&
    typeof value.runId === "string" &&
    (value.sessionId === undefined || typeof value.sessionId === "string") &&
    Array.isArray(value.entries) &&
    value.entries.every(isSourceContextMapArtifactEntry) &&
    (value.createdAt === undefined || typeof value.createdAt === "string")
  );
}

function isSourceContextMapArtifactEntry(value: unknown): value is SourceContextMapArtifactEntry {
  return (
    isRecord(value) &&
    isSourceContextMapArtifactStage(value.stage) &&
    isSourceContextMapArtifactStatus(value.status) &&
    (value.groupId === undefined || typeof value.groupId === "string") &&
    isOptionalFiniteNumber(value.groupIndex) &&
    (value.sourceIds === undefined ||
      (Array.isArray(value.sourceIds) &&
        value.sourceIds.every((item) => typeof item === "string"))) &&
    (value.windowRefs === undefined ||
      (Array.isArray(value.windowRefs) &&
        value.windowRefs.every(isSourceContextMapArtifactWindowRef))) &&
    (value.evidenceIds === undefined ||
      (Array.isArray(value.evidenceIds) &&
        value.evidenceIds.every((item) => typeof item === "string"))) &&
    isOptionalFiniteNumber(value.tokenEstimate) &&
    (value.inputSummary === undefined || typeof value.inputSummary === "string") &&
    (value.outputSummary === undefined || typeof value.outputSummary === "string") &&
    (value.mapArtifactIds === undefined ||
      (Array.isArray(value.mapArtifactIds) &&
        value.mapArtifactIds.every((item) => typeof item === "string"))) &&
    (value.errorCode === undefined || typeof value.errorCode === "string") &&
    (value.errorMessage === undefined || typeof value.errorMessage === "string") &&
    (value.createdAt === undefined || typeof value.createdAt === "string")
  );
}

function isSourceContextMapArtifactWindowRef(value: unknown): value is SourceContextMapWindowRef {
  return (
    isRecord(value) &&
    typeof value.sourceId === "string" &&
    typeof value.chunkId === "string" &&
    isOptionalFiniteNumber(value.ord)
  );
}

function isSourceContextMapArtifactStage(value: unknown): value is SourceContextMapArtifactStage {
  return value === "map" || value === "reduce";
}

function isSourceContextMapArtifactStatus(value: unknown): value is SourceContextMapArtifactStatus {
  return value === "started" || value === "completed" || value === "failed";
}

function isSourceContextMapArtifactFilter(value: unknown): value is SourceContextMapArtifactFilter {
  return (
    isRecord(value) &&
    (value.sessionId === undefined || typeof value.sessionId === "string") &&
    (value.runId === undefined || typeof value.runId === "string") &&
    (value.stage === undefined || isSourceContextMapArtifactStage(value.stage)) &&
    (value.status === undefined || isSourceContextMapArtifactStatus(value.status)) &&
    (value.sourceId === undefined || typeof value.sourceId === "string") &&
    isOptionalFiniteNumber(value.limit)
  );
}

function isCreateOrResumeSourceContextMapRunPayload(
  value: unknown,
): value is CreateOrResumeSourceContextMapRunPayload {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    (value.sessionId === undefined || typeof value.sessionId === "string") &&
    typeof value.ownerRunId === "string" &&
    value.ownerRunId.trim().length > 0 &&
    (value.mode === undefined || value.mode === "research" || value.mode === "auto") &&
    typeof value.planSignature === "string" &&
    value.planSignature.trim().length > 0 &&
    isOptionalPositiveInteger(value.maxConcurrentMaps) &&
    Array.isArray(value.steps) &&
    value.steps.length > 0 &&
    value.steps.every(isSourceContextMapStepPlan) &&
    (value.createdAt === undefined || typeof value.createdAt === "string")
  );
}

function isSourceContextMapStepPlan(value: unknown): value is SourceContextMapStepPlan {
  return (
    isRecord(value) &&
    typeof value.groupId === "string" &&
    value.groupId.trim().length > 0 &&
    typeof value.groupIndex === "number" &&
    Number.isFinite(value.groupIndex) &&
    value.groupIndex >= 0 &&
    Array.isArray(value.sourceIds) &&
    value.sourceIds.every((item) => typeof item === "string") &&
    Array.isArray(value.windowRefs) &&
    value.windowRefs.every(isSourceContextMapArtifactWindowRef) &&
    Array.isArray(value.evidenceIds) &&
    value.evidenceIds.every((item) => typeof item === "string") &&
    isOptionalFiniteNumber(value.tokenEstimate) &&
    (value.inputSummary === undefined || typeof value.inputSummary === "string") &&
    typeof value.stepSignature === "string" &&
    value.stepSignature.trim().length > 0
  );
}

function isSourceContextMapRunFilter(value: unknown): value is SourceContextMapRunFilter {
  return (
    isRecord(value) &&
    (value.sessionId === undefined || typeof value.sessionId === "string") &&
    (value.ownerRunId === undefined || typeof value.ownerRunId === "string") &&
    (value.status === undefined || isSourceContextMapRunStatus(value.status)) &&
    isOptionalFiniteNumber(value.limit)
  );
}

function isCompleteSourceContextMapStepPayload(
  value: unknown,
): value is CompleteSourceContextMapStepPayload {
  return (
    isRecord(value) &&
    typeof value.stepId === "string" &&
    value.stepId.trim().length > 0 &&
    typeof value.outputSummary === "string" &&
    (value.artifactId === undefined || typeof value.artifactId === "string") &&
    (value.completedAt === undefined || typeof value.completedAt === "string")
  );
}

function isFailSourceContextMapStepPayload(
  value: unknown,
): value is FailSourceContextMapStepPayload {
  return (
    isRecord(value) &&
    typeof value.stepId === "string" &&
    value.stepId.trim().length > 0 &&
    (value.errorCode === undefined || typeof value.errorCode === "string") &&
    typeof value.errorMessage === "string" &&
    (value.failedAt === undefined || typeof value.failedAt === "string")
  );
}

function isMarkSourceContextMapReduceStartedPayload(
  value: unknown,
): value is MarkSourceContextMapReduceStartedPayload {
  return (
    isRecord(value) &&
    typeof value.runId === "string" &&
    value.runId.trim().length > 0 &&
    (value.mapArtifactIds === undefined ||
      (Array.isArray(value.mapArtifactIds) &&
        value.mapArtifactIds.every((item) => typeof item === "string"))) &&
    (value.inputSummary === undefined || typeof value.inputSummary === "string") &&
    isOptionalFiniteNumber(value.tokenEstimate) &&
    (value.startedAt === undefined || typeof value.startedAt === "string")
  );
}

function isMarkSourceContextMapReduceCompletedPayload(
  value: unknown,
): value is MarkSourceContextMapReduceCompletedPayload {
  return (
    isRecord(value) &&
    typeof value.runId === "string" &&
    value.runId.trim().length > 0 &&
    (value.outputSummary === undefined || typeof value.outputSummary === "string") &&
    (value.artifactId === undefined || typeof value.artifactId === "string") &&
    (value.completedAt === undefined || typeof value.completedAt === "string")
  );
}

function isMarkSourceContextMapReduceFailedPayload(
  value: unknown,
): value is MarkSourceContextMapReduceFailedPayload {
  return (
    isRecord(value) &&
    typeof value.runId === "string" &&
    value.runId.trim().length > 0 &&
    (value.errorCode === undefined || typeof value.errorCode === "string") &&
    typeof value.errorMessage === "string" &&
    (value.failedAt === undefined || typeof value.failedAt === "string")
  );
}

function isSourceContextMapRunStatus(value: unknown): value is SourceContextMapRunStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "reducing" ||
    value === "done" ||
    value === "failed" ||
    value === "cancelled"
  );
}

function isEnqueueChunkMetaTier2JobPayload(
  value: unknown,
): value is EnqueueChunkMetaTier2JobPayload {
  return (
    isRecord(value) &&
    typeof value.sourceId === "string" &&
    value.sourceId.trim().length > 0 &&
    isOptionalPositiveInteger(value.maxChunks)
  );
}

function isChunkMetaTier2AuditFilter(
  value: unknown,
  requireSourceOrJob: boolean,
): value is ChunkMetaTier2AuditFilter {
  if (!isRecord(value)) return false;
  const hasSource = typeof value.sourceId === "string" && value.sourceId.trim().length > 0;
  const hasJob = typeof value.jobId === "string" && value.jobId.trim().length > 0;
  return (
    (!requireSourceOrJob || hasSource || hasJob) &&
    (value.sourceId === undefined || hasSource) &&
    (value.jobId === undefined || hasJob) &&
    (value.status === undefined || isChunkMetaTier2AuditStatus(value.status)) &&
    isOptionalFiniteNumber(value.limit)
  );
}

function isChunkMetaTier2AuditStatus(value: unknown): value is ChunkMetaTier2AuditStatus {
  return (
    value === "summarized" || value === "unavailable" || value === "error" || value === "skipped"
  );
}

function isOptionalFiniteNumber(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function isOptionalPositiveInteger(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value > 0);
}

function isRetrieveSourcesPayload(value: unknown): value is RetrieveSourcesPayload {
  return (
    isRecord(value) &&
    typeof value.query === "string" &&
    (value.strength === undefined || isRetrieveStrength(value.strength)) &&
    (value.limit === undefined || typeof value.limit === "number") &&
    (value.scope === undefined || value.scope === "all") &&
    (value.includeChunks === undefined || typeof value.includeChunks === "number") &&
    (value.filter === undefined || isRetrieveSourcesFilter(value.filter))
  );
}

function isSearchKnowledgeBasePayload(value: unknown): value is SearchKnowledgeBasePayload {
  return (
    isRecord(value) &&
    typeof value.query === "string" &&
    (value.mode === undefined || value.mode === "exact" || value.mode === "semantic") &&
    (value.strength === undefined || isRetrieveStrength(value.strength)) &&
    (value.limit === undefined || typeof value.limit === "number") &&
    (value.includeChunks === undefined || typeof value.includeChunks === "number") &&
    (value.filter === undefined || isRetrieveSourcesFilter(value.filter)) &&
    (value.clustering === undefined || isKnowledgeBaseClusteringOptions(value.clustering))
  );
}

function isRetrieveStrength(value: unknown): value is RetrieveStrength {
  return value === "strict" || value === "balanced" || value === "broad";
}

function isKnowledgeBaseClusteringOptions(value: unknown): value is KnowledgeBaseClusteringOptions {
  return (
    isRecord(value) &&
    isKnowledgeBaseEngineClusterBy(value.clusterBy) &&
    (value.granularity === undefined || isKnowledgeBaseClusterGranularity(value.granularity)) &&
    (value.semanticBackend === undefined || value.clusterBy === "semantic") &&
    (value.semanticBackend === undefined ||
      isKnowledgeBaseSemanticClusterBackend(value.semanticBackend)) &&
    (value.refinement === undefined || isKnowledgeBaseClusterRefinementOptions(value.refinement))
  );
}

function isKnowledgeBaseClusterRefinementOptions(
  value: unknown,
): value is NonNullable<KnowledgeBaseClusteringOptions["refinement"]> {
  return (
    isRecord(value) &&
    (value.providerBackedLabels === undefined || typeof value.providerBackedLabels === "boolean")
  );
}

function isKnowledgeBaseEngineClusterBy(value: unknown): value is KnowledgeBaseEngineClusterBy {
  return (
    value === "semantic" ||
    value === "topic" ||
    value === "graph" ||
    value === "year" ||
    value === "venue" ||
    value === "source_type"
  );
}

function isKnowledgeBaseClusterGranularity(
  value: unknown,
): value is KnowledgeBaseClusterGranularity {
  return value === "coarse" || value === "medium" || value === "fine";
}

function isKnowledgeBaseSemanticClusterBackend(
  value: unknown,
): value is KnowledgeBaseSemanticClusterBackend {
  return value === "auto" || value === "embedding" || value === "metadata";
}

function isRetrieveSourcesFilter(value: unknown): value is RetrieveSourcesFilter {
  return (
    isRecord(value) &&
    (value.sourceTypes === undefined ||
      (Array.isArray(value.sourceTypes) &&
        value.sourceTypes.every((item) => typeof item === "string"))) &&
    (value.lifecycleStatuses === undefined ||
      (Array.isArray(value.lifecycleStatuses) &&
        value.lifecycleStatuses.every(isRetrieveSourceLifecycleFilter))) &&
    (value.doi === undefined || typeof value.doi === "string") &&
    (value.arxivIds === undefined ||
      (Array.isArray(value.arxivIds) &&
        value.arxivIds.every((item) => typeof item === "string"))) &&
    (value.years === undefined ||
      (Array.isArray(value.years) && value.years.every((item) => typeof item === "number"))) &&
    (value.venues === undefined ||
      (Array.isArray(value.venues) && value.venues.every((item) => typeof item === "string"))) &&
    (value.authors === undefined ||
      (Array.isArray(value.authors) && value.authors.every((item) => typeof item === "string")))
  );
}

function isRetrieveSourceLifecycleFilter(value: unknown): value is RetrieveSourceLifecycleFilter {
  return value === "fresh" || value === "stale" || value === "archived";
}

function isWorkingSetLoadDepth(value: unknown): value is WorkingSetLoadDepth {
  return value === "meta" || value === "outline" || value === "chunks" || value === "full";
}

function isWorkingSetSourcePayload(value: unknown): value is WorkingSetSourcePayload {
  return (
    isRecord(value) &&
    typeof value.sourceId === "string" &&
    (value.loadDepth === undefined || isWorkingSetLoadDepth(value.loadDepth))
  );
}

function isEvictWorkingSetSourcePayload(value: unknown): value is EvictWorkingSetSourcePayload {
  return (
    isRecord(value) &&
    typeof value.sourceId === "string" &&
    (value.reason === undefined || typeof value.reason === "string")
  );
}

function isSetWorkingSetSourceDepthPayload(
  value: unknown,
): value is SetWorkingSetSourceDepthPayload {
  return (
    isRecord(value) && typeof value.sourceId === "string" && isWorkingSetLoadDepth(value.loadDepth)
  );
}

function isRepairAction(value: unknown): value is RepairAction {
  return value === "retry_init" || value === "rebuild_fts" || value === "reset_library";
}

function isTopicPageSourceRef(value: unknown): value is TopicPageSourceRef {
  return (
    isRecord(value) &&
    typeof value.memoryId === "string" &&
    (value.chunkId === undefined || typeof value.chunkId === "string") &&
    (value.quote === undefined || typeof value.quote === "string")
  );
}

function isCreateTopicPagePayload(value: unknown): value is CreateTopicPagePayload {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    (value.slug === undefined || typeof value.slug === "string") &&
    typeof value.title === "string" &&
    (value.summary === undefined || typeof value.summary === "string") &&
    (value.content === undefined || typeof value.content === "string") &&
    (value.sourceRefs === undefined ||
      (Array.isArray(value.sourceRefs) && value.sourceRefs.every(isTopicPageSourceRef))) &&
    (value.createdAt === undefined || typeof value.createdAt === "string") &&
    (value.updatedAt === undefined || typeof value.updatedAt === "string")
  );
}

function isUpdateTopicPagePayload(value: unknown): value is UpdateTopicPagePayload {
  return (
    isRecord(value) &&
    (value.slug === undefined || typeof value.slug === "string") &&
    (value.title === undefined || typeof value.title === "string") &&
    (value.summary === undefined || typeof value.summary === "string") &&
    (value.content === undefined || typeof value.content === "string") &&
    (value.sourceRefs === undefined ||
      (Array.isArray(value.sourceRefs) && value.sourceRefs.every(isTopicPageSourceRef))) &&
    (value.updatedAt === undefined || typeof value.updatedAt === "string")
  );
}

export const WIKI_ARTIFACT_RPC_LIMITS = Object.freeze({
  idLength: 512,
  artifactKeyLength: 512,
  titleLength: 1_024,
  contentLength: 1_000_000,
  versionLength: 512,
  batchItems: 128,
  evidenceItems: 256,
  linkItems: 512,
  listItems: 500,
});

const WIKI_ARTIFACT_ID_MAX_LENGTH = WIKI_ARTIFACT_RPC_LIMITS.idLength;
const WIKI_ARTIFACT_KEY_MAX_LENGTH = WIKI_ARTIFACT_RPC_LIMITS.artifactKeyLength;
const WIKI_ARTIFACT_TITLE_MAX_LENGTH = WIKI_ARTIFACT_RPC_LIMITS.titleLength;
const WIKI_ARTIFACT_CONTENT_MAX_LENGTH = WIKI_ARTIFACT_RPC_LIMITS.contentLength;
const WIKI_ARTIFACT_VERSION_MAX_LENGTH = WIKI_ARTIFACT_RPC_LIMITS.versionLength;
const WIKI_ARTIFACT_BATCH_MAX_ITEMS = WIKI_ARTIFACT_RPC_LIMITS.batchItems;
const WIKI_ARTIFACT_EVIDENCE_MAX_ITEMS = WIKI_ARTIFACT_RPC_LIMITS.evidenceItems;
const WIKI_ARTIFACT_LINK_MAX_ITEMS = WIKI_ARTIFACT_RPC_LIMITS.linkItems;
const WIKI_ARTIFACT_LIST_MAX_ITEMS = WIKI_ARTIFACT_RPC_LIMITS.listItems;
const WIKI_ARTIFACT_JSON_MAX_DEPTH = 8;
const WIKI_ARTIFACT_JSON_MAX_NODES = 4_096;
const WIKI_ARTIFACT_JSON_MAX_COLLECTION_ITEMS = 256;
const WIKI_ARTIFACT_JSON_MAX_STRING_CHARS = 262_144;
const WIKI_ARTIFACT_JSON_MAX_KEY_LENGTH = 256;

interface WikiArtifactJsonGuardState {
  nodes: number;
  stringChars: number;
  seen: WeakSet<object>;
}

function isPublishWikiArtifactsPayload(value: unknown): value is PublishWikiArtifactsPayload {
  if (
    !isRecord(value) ||
    !isWikiArtifactScope(value.scope) ||
    !isBoundedWikiString(value.inputSignature, WIKI_ARTIFACT_VERSION_MAX_LENGTH) ||
    !isBoundedWikiString(value.compilerVersion, WIKI_ARTIFACT_VERSION_MAX_LENGTH) ||
    !isBoundedWikiString(value.promptVersion, WIKI_ARTIFACT_VERSION_MAX_LENGTH) ||
    (value.modelId !== undefined &&
      !isBoundedWikiString(value.modelId, WIKI_ARTIFACT_VERSION_MAX_LENGTH)) ||
    (value.freshness !== undefined &&
      value.freshness !== "partial" &&
      value.freshness !== "fresh") ||
    !Array.isArray(value.artifacts) ||
    value.artifacts.length === 0 ||
    value.artifacts.length > WIKI_ARTIFACT_BATCH_MAX_ITEMS ||
    !value.artifacts.every(isWikiArtifactDraft) ||
    (value.links !== undefined &&
      (!Array.isArray(value.links) ||
        value.links.length > WIKI_ARTIFACT_LINK_MAX_ITEMS ||
        !value.links.every(isWikiArtifactLinkInput)))
  ) {
    return false;
  }

  const artifactRefs = new Set<string>();
  for (const artifact of value.artifacts) {
    const ref = getWikiArtifactBatchRefKey(artifact);
    if (artifactRefs.has(ref)) return false;
    artifactRefs.add(ref);
  }

  for (const link of value.links ?? []) {
    const fromRef = getWikiArtifactBatchRefKey(link.from);
    if (!artifactRefs.has(fromRef)) return false;
    if ("artifactKind" in link.to) {
      const toRef = getWikiArtifactBatchRefKey(link.to);
      if (!artifactRefs.has(toRef) || toRef === fromRef) return false;
    }
  }
  return true;
}

function isWikiArtifactScope(value: unknown): value is WikiArtifactScope {
  return (
    isRecord(value) &&
    isWikiArtifactScopeKind(value.kind) &&
    isBoundedWikiString(value.id, WIKI_ARTIFACT_ID_MAX_LENGTH)
  );
}

function isWikiArtifactDraft(value: unknown): value is WikiArtifactDraft {
  if (
    !isRecord(value) ||
    !isWikiArtifactKind(value.artifactKind) ||
    !isBoundedWikiString(value.artifactKey, WIKI_ARTIFACT_KEY_MAX_LENGTH) ||
    !isBoundedWikiString(value.title, WIKI_ARTIFACT_TITLE_MAX_LENGTH) ||
    !isBoundedWikiString(value.content, WIKI_ARTIFACT_CONTENT_MAX_LENGTH) ||
    (value.payload !== undefined && !isBoundedWikiArtifactJsonObject(value.payload)) ||
    (value.coverage !== undefined && !isBoundedWikiArtifactJsonObject(value.coverage)) ||
    (value.evidence !== undefined &&
      (!Array.isArray(value.evidence) ||
        value.evidence.length > WIKI_ARTIFACT_EVIDENCE_MAX_ITEMS ||
        !value.evidence.every(isWikiArtifactEvidenceInput)))
  ) {
    return false;
  }
  return value.artifactKind !== "claim" || (value.evidence?.length ?? 0) > 0;
}

function isWikiArtifactEvidenceInput(value: unknown): value is WikiArtifactEvidenceInput {
  if (!isRecord(value)) return false;
  const hasParserKind = value.parserArtifactKind !== undefined;
  const hasParserId = value.parserArtifactId !== undefined;
  return (
    isBoundedWikiString(value.sourceId, WIKI_ARTIFACT_ID_MAX_LENGTH) &&
    isBoundedWikiString(value.chunkId, WIKI_ARTIFACT_ID_MAX_LENGTH) &&
    (value.pageNo === undefined ||
      (Number.isInteger(value.pageNo) &&
        Number(value.pageNo) > 0 &&
        Number(value.pageNo) <= 1_000_000)) &&
    (value.bbox === undefined || isBoundedWikiArtifactJsonObject(value.bbox)) &&
    hasParserKind === hasParserId &&
    (!hasParserKind ||
      (isBoundedWikiString(value.parserArtifactKind, WIKI_ARTIFACT_KEY_MAX_LENGTH) &&
        isBoundedWikiString(value.parserArtifactId, WIKI_ARTIFACT_ID_MAX_LENGTH))) &&
    (value.anchor === undefined || isBoundedWikiArtifactJsonObject(value.anchor))
  );
}

function isWikiArtifactBatchRef(value: unknown): value is WikiArtifactBatchRef {
  return (
    isRecord(value) &&
    isWikiArtifactKind(value.artifactKind) &&
    isBoundedWikiString(value.artifactKey, WIKI_ARTIFACT_KEY_MAX_LENGTH)
  );
}

function isWikiArtifactLinkTarget(value: unknown): value is WikiArtifactLinkTarget {
  if (!isRecord(value)) return false;
  if (value.artifactId !== undefined) {
    return (
      isBoundedWikiString(value.artifactId, WIKI_ARTIFACT_ID_MAX_LENGTH) &&
      value.artifactKind === undefined &&
      value.artifactKey === undefined
    );
  }
  return isWikiArtifactBatchRef(value);
}

function isWikiArtifactLinkInput(value: unknown): value is WikiArtifactLinkInput {
  return (
    isRecord(value) &&
    isWikiArtifactBatchRef(value.from) &&
    isWikiArtifactLinkTarget(value.to) &&
    isWikiArtifactLinkKind(value.kind) &&
    isWikiArtifactLinkCreatedBy(value.createdBy) &&
    (value.creatorVersion === undefined ||
      isBoundedWikiString(value.creatorVersion, WIKI_ARTIFACT_VERSION_MAX_LENGTH))
  );
}

function isWikiArtifactFilter(value: unknown): value is WikiArtifactFilter {
  return (
    isRecord(value) &&
    (value.scope === undefined || isWikiArtifactScope(value.scope)) &&
    (value.artifactKind === undefined || isWikiArtifactKind(value.artifactKind)) &&
    (value.freshness === undefined || isWikiArtifactFreshness(value.freshness)) &&
    (value.inputSignature === undefined ||
      isBoundedWikiString(value.inputSignature, WIKI_ARTIFACT_VERSION_MAX_LENGTH)) &&
    (value.includeHistory === undefined || typeof value.includeHistory === "boolean") &&
    (value.limit === undefined || isWikiArtifactListLimit(value.limit))
  );
}

function isAppendWikiUserEditPayload(value: unknown): value is AppendWikiUserEditPayload {
  return (
    isRecord(value) &&
    (value.id === undefined || isBoundedWikiString(value.id, WIKI_ARTIFACT_ID_MAX_LENGTH)) &&
    isBoundedWikiString(value.baseArtifactId, WIKI_ARTIFACT_ID_MAX_LENGTH) &&
    (value.previousEditId === undefined ||
      isBoundedWikiString(value.previousEditId, WIKI_ARTIFACT_ID_MAX_LENGTH)) &&
    (value.candidateArtifactId === undefined ||
      isBoundedWikiString(value.candidateArtifactId, WIKI_ARTIFACT_ID_MAX_LENGTH)) &&
    isWikiUserEditKind(value.editKind) &&
    isBoundedWikiArtifactJsonObject(value.payload) &&
    isWikiUserEditMergeOutcome(value.mergeOutcome) &&
    (value.createdAt === undefined ||
      isBoundedWikiString(value.createdAt, WIKI_ARTIFACT_VERSION_MAX_LENGTH))
  );
}

function getWikiArtifactBatchRefKey(value: WikiArtifactBatchRef): string {
  return `${value.artifactKind}\u0000${value.artifactKey}`;
}

function isWikiArtifactListLimit(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= WIKI_ARTIFACT_LIST_MAX_ITEMS
  );
}

function isBoundedWikiString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

export function isBoundedWikiArtifactJsonObject(value: unknown): value is WikiArtifactJsonObject {
  if (!isRecord(value)) return false;
  return isBoundedWikiJsonValue(value, 0, {
    nodes: 0,
    stringChars: 0,
    seen: new WeakSet<object>(),
  });
}

function isBoundedWikiJsonValue(
  value: unknown,
  depth: number,
  state: WikiArtifactJsonGuardState,
): value is WikiArtifactJsonValue {
  if (depth > WIKI_ARTIFACT_JSON_MAX_DEPTH || state.nodes >= WIKI_ARTIFACT_JSON_MAX_NODES) {
    return false;
  }
  state.nodes += 1;

  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    state.stringChars += value.length;
    return state.stringChars <= WIKI_ARTIFACT_JSON_MAX_STRING_CHARS;
  }
  if (typeof value !== "object") return false;
  if (state.seen.has(value)) return false;
  state.seen.add(value);

  if (Array.isArray(value)) {
    return (
      value.length <= WIKI_ARTIFACT_JSON_MAX_COLLECTION_ITEMS &&
      value.every((item) => isBoundedWikiJsonValue(item, depth + 1, state))
    );
  }
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const entries = Object.entries(value);
  if (entries.length > WIKI_ARTIFACT_JSON_MAX_COLLECTION_ITEMS) return false;
  return entries.every(([key, item]) => {
    if (key.length > WIKI_ARTIFACT_JSON_MAX_KEY_LENGTH) return false;
    state.stringChars += key.length;
    return (
      state.stringChars <= WIKI_ARTIFACT_JSON_MAX_STRING_CHARS &&
      isBoundedWikiJsonValue(item, depth + 1, state)
    );
  });
}

function isWikiArtifactScopeKind(value: unknown): value is WikiArtifactScopeKind {
  return value === "source" || value === "topic" || value === "library";
}

function isWikiArtifactKind(value: unknown): value is WikiArtifactKind {
  return (
    value === "source_digest" ||
    value === "section" ||
    value === "topic" ||
    value === "claim" ||
    value === "index"
  );
}

function isWikiArtifactFreshness(value: unknown): value is WikiArtifactFreshness {
  return value === "partial" || value === "fresh" || value === "stale";
}

function isWikiArtifactLinkKind(value: unknown): value is WikiArtifactLinkKind {
  return (
    value === "derived_from" ||
    value === "contains" ||
    value === "related" ||
    value === "contradicts"
  );
}

function isWikiArtifactLinkCreatedBy(value: unknown): value is WikiArtifactLinkCreatedBy {
  return value === "compiler" || value === "projector" || value === "user";
}

function isWikiUserEditKind(value: unknown): value is WikiUserEditKind {
  return value === "patch" || value === "override";
}

function isWikiUserEditMergeOutcome(value: unknown): value is WikiUserEditMergeOutcome {
  return (
    value === "authored" ||
    value === "unchanged" ||
    value === "auto_merged" ||
    value === "conflict" ||
    value === "keep_user" ||
    value === "accept_machine" ||
    value === "manual_merge"
  );
}

function isCreateWikiCompileJobPayload(value: unknown): value is CreateWikiCompileJobPayload {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    (value.topicId === undefined || typeof value.topicId === "string") &&
    typeof value.query === "string" &&
    (value.instructions === undefined || typeof value.instructions === "string") &&
    (value.sourceMemoryIds === undefined ||
      (Array.isArray(value.sourceMemoryIds) &&
        value.sourceMemoryIds.every((item) => typeof item === "string"))) &&
    (value.maxAttempts === undefined || typeof value.maxAttempts === "number") &&
    (value.runAfter === undefined || typeof value.runAfter === "string") &&
    (value.createdAt === undefined || typeof value.createdAt === "string")
  );
}

function isWikiCompileResultPayload(value: unknown): value is WikiCompileResultPayload {
  return (
    isRecord(value) &&
    (value.topic === undefined ||
      isCreateTopicPagePayload(value.topic) ||
      isUpdateTopicPagePayload(value.topic)) &&
    (value.sourceRefs === undefined ||
      (Array.isArray(value.sourceRefs) && value.sourceRefs.every(isTopicPageSourceRef))) &&
    (value.edges === undefined ||
      (Array.isArray(value.edges) && value.edges.every(isTopicGraphEdgeInput))) &&
    (value.completedAt === undefined || typeof value.completedAt === "string")
  );
}

function isCreateWikiCompileJobEventPayload(
  value: unknown,
): value is CreateWikiCompileJobEventPayload {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    typeof value.jobId === "string" &&
    isWikiCompileEventKind(value.kind) &&
    (value.level === undefined || isWikiCompileEventLevel(value.level)) &&
    (value.message === undefined || typeof value.message === "string") &&
    (value.detail === undefined || isRecord(value.detail)) &&
    (value.createdAt === undefined || typeof value.createdAt === "string")
  );
}

function isTopicGraphEdgeInput(value: unknown): value is TopicGraphEdgeInput {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    (value.fromTopicId === undefined || typeof value.fromTopicId === "string") &&
    (value.toTopicId === undefined || typeof value.toTopicId === "string") &&
    (value.memoryId === undefined || typeof value.memoryId === "string") &&
    (value.chunkId === undefined || typeof value.chunkId === "string") &&
    isTopicGraphEdgeKind(value.kind) &&
    (value.weight === undefined || typeof value.weight === "number") &&
    (value.label === undefined || typeof value.label === "string") &&
    (value.createdAt === undefined || typeof value.createdAt === "string")
  );
}

function isBuildSourceGraphPayload(value: unknown): value is BuildSourceGraphPayload {
  return (
    isRecord(value) &&
    typeof value.sourceId === "string" &&
    (value.mode === undefined || value.mode === "deterministic" || value.mode === "llm")
  );
}

function isEnqueueSourceGraphJobPayload(value: unknown): value is EnqueueSourceGraphJobPayload {
  return (
    isRecord(value) &&
    typeof value.sourceId === "string" &&
    value.sourceId.trim().length > 0 &&
    (value.mode === "deterministic" || value.mode === "llm")
  );
}

function isGraphNeighborsPayload(value: unknown): value is GraphNeighborsPayload {
  return (
    isRecord(value) &&
    (value.nodeId === undefined || typeof value.nodeId === "string") &&
    (value.sourceId === undefined || typeof value.sourceId === "string") &&
    (value.canonicalId === undefined || typeof value.canonicalId === "string") &&
    (value.kind === undefined || isGraphNodeKind(value.kind)) &&
    (value.dimension === undefined || isGraphEdgeDimension(value.dimension)) &&
    (value.depth === undefined || typeof value.depth === "number") &&
    (value.limit === undefined || typeof value.limit === "number")
  );
}

function isGraphSubgraphPayload(value: unknown): value is GraphSubgraphPayload {
  return (
    isRecord(value) &&
    (value.sourceIds === undefined ||
      (Array.isArray(value.sourceIds) &&
        value.sourceIds.every((item) => typeof item === "string"))) &&
    (value.dimension === undefined || isGraphEdgeDimension(value.dimension)) &&
    (value.limit === undefined || typeof value.limit === "number")
  );
}

function isGraphNodeRef(value: unknown): value is GraphNodeRef {
  if (!isRecord(value)) return false;
  const hasLocator =
    typeof value.nodeId === "string" ||
    typeof value.sourceId === "string" ||
    typeof value.canonicalId === "string";
  return (
    hasLocator &&
    (value.nodeId === undefined || typeof value.nodeId === "string") &&
    (value.sourceId === undefined || typeof value.sourceId === "string") &&
    (value.canonicalId === undefined || typeof value.canonicalId === "string") &&
    (value.kind === undefined || isGraphNodeKind(value.kind))
  );
}

function isGraphPathPayload(value: unknown): value is GraphPathPayload {
  return (
    isRecord(value) &&
    isGraphNodeRef(value.from) &&
    isGraphNodeRef(value.to) &&
    (value.dimension === undefined || isGraphEdgeDimension(value.dimension)) &&
    (value.maxDepth === undefined || typeof value.maxDepth === "number") &&
    (value.limit === undefined || typeof value.limit === "number")
  );
}

function isGraphTimelinePayload(value: unknown): value is GraphTimelinePayload {
  return (
    isRecord(value) &&
    (value.sourceIds === undefined ||
      (Array.isArray(value.sourceIds) &&
        value.sourceIds.every((item) => typeof item === "string"))) &&
    (value.canonicalId === undefined || typeof value.canonicalId === "string") &&
    (value.kind === undefined || isGraphNodeKind(value.kind)) &&
    (value.dimension === undefined || isGraphEdgeDimension(value.dimension)) &&
    (value.limit === undefined || typeof value.limit === "number") &&
    (value.order === undefined || value.order === "asc" || value.order === "desc")
  );
}

function isGraphNodeKind(value: unknown): value is GraphNodeKind {
  return (
    value === "source" ||
    value === "person" ||
    value === "venue" ||
    value === "domain" ||
    value === "problem" ||
    value === "method" ||
    value === "dataset" ||
    value === "metric"
  );
}

function isGraphEdgeDimension(value: unknown): value is GraphEdgeDimension {
  return (
    value === "metadata" || value === "citation" || value === "domain" || value === "technical"
  );
}

function isJobStatus(value: unknown): value is JobStatus {
  return value === "queued" || value === "running" || value === "done" || value === "failed";
}

function isOrchestrationKind(value: unknown): value is OrchestrationKind {
  return value === "post_capture_job";
}

function isOrchestrationRunStatus(value: unknown): value is OrchestrationRunStatus {
  return (
    value === "queued" ||
    value === "running" ||
    value === "done" ||
    value === "failed" ||
    value === "cancelled"
  );
}

function isCreateOrchestrationRunPayload(value: unknown): value is CreateOrchestrationRunPayload {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    isOrchestrationKind(value.kind) &&
    typeof value.targetJobId === "string"
  );
}

function isOrchestrationRunFilter(value: unknown): value is OrchestrationRunFilter {
  return (
    isRecord(value) &&
    (value.kind === undefined || isOrchestrationKind(value.kind)) &&
    (value.status === undefined || isOrchestrationRunStatus(value.status)) &&
    (value.targetJobId === undefined || typeof value.targetJobId === "string") &&
    (value.limit === undefined || typeof value.limit === "number")
  );
}

function isWikiCompileJobStatus(value: unknown): value is WikiCompileJobStatus {
  return value === "queued" || value === "running" || value === "done" || value === "failed";
}

function isWikiCompileEventLevel(value: unknown): value is WikiCompileEventLevel {
  return value === "info" || value === "warning" || value === "error";
}

function isWikiCompileEventKind(value: unknown): value is WikiCompileEventKind {
  return (
    value === "queued" ||
    value === "claimed" ||
    value === "sources_selected" ||
    value === "provider_started" ||
    value === "provider_delta" ||
    value === "completed" ||
    value === "failed"
  );
}

function isTopicGraphEdgeKind(value: unknown): value is TopicGraphEdgeKind {
  return value === "source" || value === "related" || value === "mentions";
}

function isCreateChatSessionPayload(value: unknown): value is CreateChatSessionPayload {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    typeof value.title === "string" &&
    (value.pageUrl === undefined || typeof value.pageUrl === "string") &&
    (value.pageTitle === undefined || typeof value.pageTitle === "string") &&
    (value.initialScope === undefined || isAgentScope(value.initialScope)) &&
    (value.ownerId === undefined || typeof value.ownerId === "string") &&
    (value.createdAt === undefined || typeof value.createdAt === "string") &&
    (value.metadata === undefined || isRecord(value.metadata))
  );
}

function isAppendSessionEvidencePayload(value: unknown): value is AppendSessionEvidencePayload {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    typeof value.sessionId === "string" &&
    isSessionEvidenceItem(value.evidence) &&
    (value.createdAt === undefined || typeof value.createdAt === "string") &&
    (value.metadata === undefined || isRecord(value.metadata))
  );
}

function isCreateCompactionPayload(value: unknown): value is CreateCompactionPayload {
  return (
    isRecord(value) &&
    (value.id === undefined || typeof value.id === "string") &&
    typeof value.sessionId === "string" &&
    typeof value.summary === "string" &&
    typeof value.firstKeptMessageId === "string" &&
    typeof value.evidenceSummary === "string" &&
    (value.firstKeptEvidenceId === undefined || typeof value.firstKeptEvidenceId === "string") &&
    (value.firstKeptEvidenceRevision === undefined ||
      typeof value.firstKeptEvidenceRevision === "number") &&
    (value.previousCompactionId === undefined || typeof value.previousCompactionId === "string") &&
    (value.coveredEvidence === undefined ||
      (Array.isArray(value.coveredEvidence) &&
        value.coveredEvidence.every(isCoveredEvidenceRef))) &&
    typeof value.tokensBefore === "number" &&
    (value.createdAt === undefined || typeof value.createdAt === "string")
  );
}

function isCoveredEvidenceRef(value: unknown): value is CoveredEvidenceRef {
  return isRecord(value) && typeof value.id === "string" && typeof value.revision === "number";
}

function isUpsertChatMessagePayload(value: unknown): value is UpsertChatMessagePayload {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sessionId === "string" &&
    isChatMessageRole(value.role) &&
    isChatMessageStatus(value.status) &&
    typeof value.content === "string" &&
    isAgentScope(value.scope) &&
    (value.createdAt === undefined || typeof value.createdAt === "string") &&
    (value.updatedAt === undefined || typeof value.updatedAt === "string") &&
    isOptionalChatMessageMetadata(value)
  );
}

function isUpdateChatMessagePayload(value: unknown): value is UpdateChatMessagePayload {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sessionId === "string" &&
    (value.status === undefined || isChatMessageStatus(value.status)) &&
    (value.content === undefined || typeof value.content === "string") &&
    (value.appendContent === undefined || typeof value.appendContent === "string") &&
    (value.updatedAt === undefined || typeof value.updatedAt === "string") &&
    isOptionalChatMessageMetadata(value)
  );
}

function isOptionalChatMessageMetadata(value: Record<string, unknown>) {
  return (
    (value.pageUrl === undefined || typeof value.pageUrl === "string") &&
    (value.pageTitle === undefined || typeof value.pageTitle === "string") &&
    (value.selectionText === undefined || typeof value.selectionText === "string") &&
    (value.citations === undefined ||
      (Array.isArray(value.citations) && value.citations.every(isLocalCitation))) &&
    (value.worldKnowledge === undefined ||
      (Array.isArray(value.worldKnowledge) &&
        value.worldKnowledge.every((item) => typeof item === "string"))) &&
    (value.evidenceRefs === undefined ||
      (Array.isArray(value.evidenceRefs) &&
        value.evidenceRefs.every((item) => typeof item === "string"))) &&
    (value.error === undefined || isAgentErrorInfo(value.error)) &&
    (value.clearError === undefined || typeof value.clearError === "boolean") &&
    (value.retry === undefined || isRecord(value.retry)) &&
    (value.clearRetry === undefined || typeof value.clearRetry === "boolean") &&
    (value.piAgentMessageJson === undefined || isRecord(value.piAgentMessageJson)) &&
    (value.runId === undefined || typeof value.runId === "string") &&
    (value.queueOrder === undefined || typeof value.queueOrder === "number")
  );
}

function isChatMessageRole(value: unknown): value is ChatMessageRole {
  return value === "user" || value === "assistant" || value === "evidence";
}

function isChatMessageStatus(value: unknown): value is ChatMessageStatus {
  return (
    value === "queued" ||
    value === "streaming" ||
    value === "completed" ||
    value === "failed" ||
    value === "cancelled" ||
    value === "interrupted"
  );
}

function isAgentScope(value: unknown): value is AgentScope {
  return value === "general" || value === "current-page" || value === "selection";
}

function isContentCommand(value: unknown): value is ContentCommand {
  if (!isRecord(value) || typeof value.action !== "string") return false;
  if (
    value.action === "toggleRail" ||
    value.action === "openSettings" ||
    value.action === "openCommandPalette" ||
    value.action === "savePage" ||
    value.action === "saveSelection"
  ) {
    return true;
  }
  if (value.action === "openRail") {
    return (
      (value.query === undefined || typeof value.query === "string") &&
      (value.memoryId === undefined || typeof value.memoryId === "string")
    );
  }
  return false;
}

function isProviderRequest(value: unknown): value is ProviderRequest {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (isLocalEmbeddingModelRequest(value)) return true;
  switch (value.kind) {
    case "getProviderSettings":
    case "ensureGeminiHostPermission":
      return true;
    case "ensureOpenAIHostPermission":
      return value.baseUrl === undefined || typeof value.baseUrl === "string";
    case "ensureOpenAICompatibleHostPermission":
      return value.baseUrl === undefined || typeof value.baseUrl === "string";
    case "saveGeminiProvider":
      return (
        typeof value.model === "string" &&
        (value.apiKey === undefined || typeof value.apiKey === "string")
      );
    case "saveOpenAIProvider":
      return (
        typeof value.model === "string" &&
        (value.baseUrl === undefined || typeof value.baseUrl === "string") &&
        (value.apiKey === undefined || typeof value.apiKey === "string")
      );
    case "saveOpenAICompatibleProvider":
      return (
        typeof value.model === "string" &&
        (value.apiKey === undefined || typeof value.apiKey === "string") &&
        (value.baseUrl === undefined || typeof value.baseUrl === "string") &&
        (value.providerName === undefined || typeof value.providerName === "string")
      );
    case "testGeminiProvider":
      return (
        (value.model === undefined || typeof value.model === "string") &&
        (value.apiKey === undefined || typeof value.apiKey === "string")
      );
    case "testOpenAIProvider":
      return (
        (value.model === undefined || typeof value.model === "string") &&
        (value.baseUrl === undefined || typeof value.baseUrl === "string") &&
        (value.apiKey === undefined || typeof value.apiKey === "string")
      );
    case "testOpenAICompatibleProvider":
      return (
        (value.model === undefined || typeof value.model === "string") &&
        (value.apiKey === undefined || typeof value.apiKey === "string") &&
        (value.baseUrl === undefined || typeof value.baseUrl === "string") &&
        (value.providerName === undefined || typeof value.providerName === "string")
      );
    case "setActiveProvider":
      return (
        value.provider === "gemini" ||
        value.provider === "openai" ||
        value.provider === "openai-compatible"
      );
    case "getSearchProviderSettings":
      return true;
    case "saveSearchProviderSettings":
      return (
        isSearchProviderId(value.provider) &&
        (value.openai === undefined || isSearchOpenAIOverrideSettings(value.openai)) &&
        (value.openaiCompatible === undefined ||
          isSearchOpenAICompatibleOverrideSettings(value.openaiCompatible))
      );
    case "getImageGenerationSettings":
      return true;
    case "saveImageGenerationSettings":
      return isSaveImageGenerationSettingsInput(value.settings);
    case "getKnowledgeBaseAiSettings":
      return true;
    case "saveKnowledgeBaseAiSettings":
      return (
        isRecord(value.settings) &&
        isRecord(value.settings.wiki) &&
        typeof value.settings.wiki.enabled === "boolean"
      );
    case "ensureImageGenerationHostPermission":
      return value.baseUrl === undefined || typeof value.baseUrl === "string";
    case "getVisionProviderSettings":
      return true;
    case "saveVisionProviderSettings":
      return isSaveVisionProviderSettingsInput(value.settings);
    case "ensureVisionProviderHostPermission":
      return (
        (value.provider === undefined ||
          value.provider === "gemini" ||
          value.provider === "openai" ||
          value.provider === "openai-compatible") &&
        (value.baseUrl === undefined || typeof value.baseUrl === "string")
      );
    default:
      return false;
  }
}

function isProviderConfigRequest(value: unknown): value is ProviderConfigRequest {
  return isRecord(value) && value.kind === "readActiveProviderConfig";
}

function isUiRequest(value: unknown): value is UiRequest {
  return isRecord(value) && value.kind === "openOptions";
}

function isAgentRunRequest(value: unknown): value is AgentRunRequest {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "start":
      return isAgentChatRequest(value.request);
    case "subscribe":
      return (
        typeof value.runId === "string" &&
        typeof value.sessionId === "string" &&
        typeof value.assistantMessageId === "string"
      );
    case "compact":
      return (
        typeof value.runId === "string" &&
        (value.sessionId === undefined || typeof value.sessionId === "string")
      );
    case "cancel":
      return typeof value.runId === "string";
    default:
      return false;
  }
}

function isWebSearchRunRequest(value: unknown): value is WebSearchRunRequest {
  return isRecord(value) && value.kind === "start" && isClioWebSearchRequest(value.request);
}

function isImageGenerationRunRequest(value: unknown): value is ImageGenerationRunRequest {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "start":
      return isClioImageGenerationRequest(value.request);
    case "cancel":
      return typeof value.runId === "string";
    default:
      return false;
  }
}

function isClioWebSearchRequest(value: unknown): value is ClioWebSearchRequest {
  return (
    isRecord(value) &&
    typeof value.runId === "string" &&
    typeof value.query === "string" &&
    typeof value.createdAt === "string"
  );
}

function isClioImageGenerationRequest(value: unknown): value is ClioImageGenerationRequest {
  return (
    isRecord(value) &&
    typeof value.runId === "string" &&
    isClioImageGenerationMode(value.mode) &&
    typeof value.prompt === "string" &&
    typeof value.createdAt === "string" &&
    (value.input === undefined || isClioImageInput(value.input))
  );
}

function isAgentChatRequest(value: unknown): value is AgentChatRequest {
  if (!isRecord(value)) return false;
  return (
    typeof value.runId === "string" &&
    typeof value.question === "string" &&
    isAgentScope(value.scope) &&
    typeof value.pageUrl === "string" &&
    typeof value.pageTitle === "string" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isEvidenceItem) &&
    (value.currentTurnEvidenceRefs === undefined ||
      (Array.isArray(value.currentTurnEvidenceRefs) &&
        value.currentTurnEvidenceRefs.every((item) => typeof item === "string"))) &&
    (value.sourceContextPack === undefined ||
      isSourceContextPackRequestOptions(value.sourceContextPack)) &&
    (value.providerContext === undefined || isProviderContext(value.providerContext)) &&
    (value.sessionId === undefined || typeof value.sessionId === "string") &&
    (value.userMessageId === undefined || typeof value.userMessageId === "string") &&
    (value.assistantMessageId === undefined || typeof value.assistantMessageId === "string") &&
    (value.evidenceRevision === undefined || typeof value.evidenceRevision === "number")
  );
}

function isProviderContext(value: unknown) {
  return (
    isRecord(value) &&
    (value.summary === undefined || typeof value.summary === "string") &&
    (value.evidenceSummary === undefined || typeof value.evidenceSummary === "string") &&
    Array.isArray(value.messages) &&
    value.messages.every(isProviderContextMessage) &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isEvidenceItem)
  );
}

function isProviderContextMessage(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string" &&
    typeof value.createdAt === "string"
  );
}

function isEvidenceItem(value: unknown): value is EvidenceItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isEvidenceSourceKind(value.sourceKind) &&
    typeof value.sourceUrl === "string" &&
    typeof value.sourceTitle === "string" &&
    typeof value.text === "string" &&
    typeof value.excerpt === "string"
  );
}

function isSessionEvidenceItem(value: unknown): value is EvidenceItem & { sourceKind: SourceKind } {
  return isEvidenceItem(value) && isSourceKind(value.sourceKind);
}

function isEvidenceSourceKind(value: unknown): value is EvidenceSourceKind {
  return value === "page" || value === "selection" || value === "memory" || value === "web";
}

function isSourceKind(value: unknown): value is SourceKind {
  return value === "page" || value === "selection";
}

function isAgentStreamEvent(value: unknown): value is AgentStreamEvent {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.runId !== "string") {
    return false;
  }
  switch (value.type) {
    case "run_started":
    case "run_completed":
    case "run_cancelled":
      return true;
    case "runtime_status":
      return (
        typeof value.message === "string" &&
        (typeof value.running === "boolean" || value.running === undefined)
      );
    case "thinking_delta":
      return typeof value.delta === "string";
    case "tool_trace":
      return isAgentToolTrace(value.trace);
    case "text_delta":
      return typeof value.delta === "string";
    case "citation":
      return isLocalCitation(value.citation);
    case "citation_validation":
      return isCitationValidationResult(value.validation);
    case "citation_repair_started":
      return (
        isCitationValidationReason(value.reason) &&
        typeof value.attempt === "number" &&
        Number.isFinite(value.attempt) &&
        value.attempt >= 0 &&
        typeof value.message === "string"
      );
    case "world_knowledge":
      return typeof value.note === "string";
    case "run_failed":
      return isRecord(value.error) && typeof value.error.message === "string";
    case "run_resolved":
      return (
        (value.message === undefined || typeof value.message === "string") &&
        (value.removeAssistantMessageId === undefined ||
          typeof value.removeAssistantMessageId === "string")
      );
    default:
      return false;
  }
}

function isClioWebSearchEvent(value: unknown): value is ClioWebSearchEvent {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.runId !== "string") {
    return false;
  }
  switch (value.type) {
    case "started":
      return (
        typeof value.query === "string" &&
        typeof value.provider === "string" &&
        typeof value.createdAt === "string"
      );
    case "answer_delta":
      return typeof value.delta === "string";
    case "completed":
      return isClioWebSearchResult(value.result);
    case "failed":
      return (
        isRecord(value.error) &&
        typeof value.error.code === "string" &&
        typeof value.error.message === "string" &&
        (value.error.detail === undefined || typeof value.error.detail === "string")
      );
    default:
      return false;
  }
}

function isClioImageGenerationEvent(value: unknown): value is ClioImageGenerationEvent {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.runId !== "string") {
    return false;
  }
  switch (value.type) {
    case "started":
      return (
        isClioImageGenerationMode(value.mode) &&
        typeof value.prompt === "string" &&
        typeof value.provider === "string" &&
        typeof value.model === "string" &&
        typeof value.size === "string" &&
        typeof value.createdAt === "string"
      );
    case "completed":
      return isClioImageGenerationResult(value.result);
    case "cancelled":
      return value.reason === undefined || typeof value.reason === "string";
    case "failed":
      return isRpcErrorInfo(value.error);
    default:
      return false;
  }
}

function isClioWebSearchResult(value: unknown): value is ClioWebSearchResult {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.runId === "string" &&
    typeof value.query === "string" &&
    typeof value.answer === "string" &&
    Array.isArray(value.sources) &&
    value.sources.every(isClioWebSource) &&
    typeof value.provider === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.completedAt === "string"
  );
}

function isClioImageGenerationResult(value: unknown): value is ClioImageGenerationResult {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.runId === "string" &&
    isClioImageGenerationMode(value.mode) &&
    typeof value.prompt === "string" &&
    typeof value.model === "string" &&
    typeof value.size === "string" &&
    typeof value.provider === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.completedAt === "string" &&
    isClioImageOutput(value.output) &&
    (value.input === undefined || isClioImageInput(value.input))
  );
}

function isWebSearchHistoryRecord(value: unknown): value is WebSearchHistoryRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.query === "string" &&
    typeof value.answer === "string" &&
    Array.isArray(value.sources) &&
    value.sources.every(isClioWebSource) &&
    typeof value.provider === "string" &&
    typeof value.createdAt === "string"
  );
}

function isImageGenerationHistoryRecord(value: unknown): value is ImageGenerationHistoryRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    isClioImageGenerationMode(value.mode) &&
    typeof value.prompt === "string" &&
    typeof value.model === "string" &&
    typeof value.size === "string" &&
    typeof value.provider === "string" &&
    typeof value.createdAt === "string" &&
    isClioImageOutput(value.output) &&
    (value.input === undefined || isClioImageInput(value.input))
  );
}

function isClioWebSource(value: unknown): value is ClioWebSource {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.url === "string" &&
    typeof value.domain === "string" &&
    typeof value.snippet === "string"
  );
}

function isClioImageGenerationMode(value: unknown): value is ClioImageGenerationMode {
  return value === "generate" || value === "edit";
}

function isClioImageInput(value: unknown): value is ClioImageInput {
  return (
    isRecord(value) &&
    (value.kind === "data_url" || value.kind === "base64" || value.kind === "url") &&
    typeof value.value === "string" &&
    (value.mimeType === undefined || typeof value.mimeType === "string") &&
    (value.name === undefined || typeof value.name === "string")
  );
}

function isClioImageOutput(value: unknown): value is ClioImageOutput {
  return (
    isRecord(value) &&
    typeof value.mimeType === "string" &&
    typeof value.dataUrl === "string" &&
    typeof value.b64Json === "string"
  );
}

function isSearchOpenAIOverrideSettings(value: unknown): value is SearchOpenAIOverrideSettings {
  return (
    isRecord(value) &&
    (value.apiKey === undefined || typeof value.apiKey === "string") &&
    (value.model === undefined || typeof value.model === "string") &&
    (value.baseUrl === undefined || typeof value.baseUrl === "string")
  );
}

function isSearchOpenAICompatibleOverrideSettings(
  value: unknown,
): value is SearchOpenAICompatibleOverrideSettings {
  return (
    isRecord(value) &&
    (value.apiKey === undefined || typeof value.apiKey === "string") &&
    (value.model === undefined || typeof value.model === "string") &&
    (value.baseUrl === undefined || typeof value.baseUrl === "string")
  );
}

function isSearchProviderId(value: unknown): value is SearchProviderId {
  return value === "auto" || value === "openai" || value === "openai-compatible";
}

function isSaveImageGenerationSettingsInput(
  value: unknown,
): value is SaveImageGenerationSettingsInput {
  return (
    isRecord(value) &&
    (value.apiKey === undefined || typeof value.apiKey === "string") &&
    (value.model === undefined || typeof value.model === "string") &&
    (value.baseUrl === undefined || typeof value.baseUrl === "string") &&
    (value.size === undefined ||
      value.size === "1024x1024" ||
      value.size === "1024x1536" ||
      value.size === "1536x1024" ||
      value.size === "auto")
  );
}

function isSaveVisionProviderSettingsInput(
  value: unknown,
): value is SaveVisionProviderSettingsInput {
  return (
    isRecord(value) &&
    (value.provider === undefined || isVisionProviderId(value.provider)) &&
    (value.gemini === undefined || isVisionGeminiSettingsInput(value.gemini)) &&
    (value.openai === undefined || isVisionOpenAISettingsInput(value.openai)) &&
    (value.openaiCompatible === undefined ||
      isVisionOpenAICompatibleSettingsInput(value.openaiCompatible))
  );
}

function isVisionGeminiSettingsInput(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    (value.apiKey === undefined || typeof value.apiKey === "string") &&
    (value.model === undefined || typeof value.model === "string")
  );
}

function isVisionOpenAISettingsInput(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    (value.apiKey === undefined || typeof value.apiKey === "string") &&
    (value.model === undefined || typeof value.model === "string") &&
    (value.baseUrl === undefined || typeof value.baseUrl === "string")
  );
}

function isVisionOpenAICompatibleSettingsInput(value: unknown) {
  return (
    isVisionOpenAISettingsInput(value) &&
    (value.providerName === undefined || typeof value.providerName === "string")
  );
}

function isAgentToolTrace(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.toolCallId === "string" &&
    typeof value.toolName === "string" &&
    (value.status === "running" || value.status === "completed" || value.status === "failed") &&
    (value.summary === undefined || typeof value.summary === "string")
  );
}

function isLocalCitation(value: unknown): value is LocalCitation {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.evidenceId === "string" &&
    typeof value.label === "string" &&
    isEvidenceSourceKind(value.sourceKind) &&
    typeof value.sourceUrl === "string" &&
    typeof value.sourceTitle === "string" &&
    typeof value.excerpt === "string" &&
    (value.outputOffset === undefined ||
      (typeof value.outputOffset === "number" &&
        Number.isFinite(value.outputOffset) &&
        value.outputOffset >= 0))
  );
}

function isAgentErrorInfo(value: unknown): value is AgentErrorInfo {
  return isRpcErrorInfo(value);
}

function isRpcErrorInfo(value: unknown): value is AgentErrorInfo {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    (value.detail === undefined || typeof value.detail === "string")
  );
}

function isEngineResponse(value: unknown): value is EngineResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (value.ok) return "value" in value;
  return (
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string"
  );
}

function isEmbeddingVectorBatchResponse(value: unknown): value is EngineResponse<number[][]> {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (value.ok) return isEmbeddingVectorBatch(value.value);
  return (
    isRecord(value.error) &&
    typeof value.error.code === "string" &&
    typeof value.error.message === "string" &&
    (value.error.detail === undefined || typeof value.error.detail === "string")
  );
}

function isWorkerEmbeddingRequest(value: unknown): value is WorkerEmbeddingRequest {
  return (
    isRecord(value) &&
    typeof value.modelId === "string" &&
    value.modelId.length > 0 &&
    isEmbeddingReindexProviderId(value.provider) &&
    (value.purpose === "query" || value.purpose === "document") &&
    !("apiKey" in value) &&
    Array.isArray(value.inputs) &&
    value.inputs.length > 0 &&
    value.inputs.every((input) => typeof input === "string")
  );
}

const forbiddenWorkerChunkMetaSummaryFields = [
  "apiKey",
  "fullText",
  "normalizedText",
  "pdfBytes",
  "rawBytes",
] as const;

function hasForbiddenWorkerChunkMetaSummaryField(value: Record<string, unknown>) {
  return forbiddenWorkerChunkMetaSummaryFields.some((field) => field in value);
}

function isWorkerChunkMetaSummaryRequest(value: unknown): value is WorkerChunkMetaSummaryRequest {
  if (!isRecord(value) || hasForbiddenWorkerChunkMetaSummaryField(value)) return false;
  return (
    typeof value.sourceId === "string" &&
    value.sourceId.length > 0 &&
    typeof value.chunkId === "string" &&
    value.chunkId.length > 0 &&
    typeof value.ord === "number" &&
    Number.isFinite(value.ord) &&
    typeof value.role === "string" &&
    value.role.length > 0 &&
    typeof value.chunkTextExcerpt === "string" &&
    value.chunkTextExcerpt.length > 0 &&
    (value.sourceTitle === undefined || typeof value.sourceTitle === "string") &&
    (value.sourceType === undefined || typeof value.sourceType === "string") &&
    (value.docContext === undefined || typeof value.docContext === "string") &&
    (value.sectionPath === undefined || typeof value.sectionPath === "string")
  );
}

function isWorkerVisionAnalysisRequest(value: unknown): value is WorkerVisionAnalysisRequest {
  if (!isRecord(value) || !isRecord(value.image)) return false;
  return (
    typeof value.analysisId === "string" &&
    value.analysisId.length > 0 &&
    typeof value.imageId === "string" &&
    value.imageId.length > 0 &&
    typeof value.pageNumber === "number" &&
    Number.isFinite(value.pageNumber) &&
    (value.label === undefined || typeof value.label === "string") &&
    (value.caption === undefined || typeof value.caption === "string") &&
    (value.pageContext === undefined || typeof value.pageContext === "string") &&
    typeof value.image.base64 === "string" &&
    value.image.base64.length > 0 &&
    (value.image.mimeType === "image/png" ||
      value.image.mimeType === "image/jpeg" ||
      value.image.mimeType === "image/webp") &&
    (value.image.byteLength === undefined ||
      (typeof value.image.byteLength === "number" && Number.isFinite(value.image.byteLength))) &&
    !("apiKey" in value) &&
    !("pdfBytes" in value) &&
    !("fullText" in value)
  );
}

const forbiddenWorkerGraphExtractionFields = [
  "apiKey",
  "fullText",
  "normalizedText",
  "pdfBytes",
  "rawBytes",
  "rawProviderResponse",
] as const;

function hasForbiddenWorkerGraphExtractionField(value: Record<string, unknown>) {
  return forbiddenWorkerGraphExtractionFields.some((field) => field in value);
}

function isWorkerGraphExtractionRequest(value: unknown): value is WorkerGraphExtractionRequest {
  return (
    isRecord(value) &&
    !hasForbiddenWorkerGraphExtractionField(value) &&
    typeof value.sourceId === "string" &&
    value.sourceId.length > 0 &&
    (value.sourceTitle === undefined || typeof value.sourceTitle === "string") &&
    (value.sourceType === undefined || typeof value.sourceType === "string") &&
    (value.abstract === undefined || typeof value.abstract === "string") &&
    Array.isArray(value.chunks) &&
    value.chunks.length > 0 &&
    value.chunks.length <= 10 &&
    value.chunks.every(isWorkerGraphExtractionChunk)
  );
}

function isWorkerGraphExtractionChunk(value: unknown) {
  return (
    isRecord(value) &&
    !hasForbiddenWorkerGraphExtractionField(value) &&
    typeof value.chunkId === "string" &&
    value.chunkId.length > 0 &&
    typeof value.ord === "number" &&
    Number.isFinite(value.ord) &&
    (value.sectionPath === undefined || typeof value.sectionPath === "string") &&
    typeof value.excerpt === "string" &&
    value.excerpt.length > 0
  );
}

const forbiddenKnowledgeBaseClusterLabelRefinementFields = [
  "apiKey",
  "fullText",
  "normalizedText",
  "chunkText",
  "pdfBytes",
  "rawBytes",
  "rawProviderResponse",
] as const;

function hasForbiddenKnowledgeBaseClusterLabelRefinementField(value: Record<string, unknown>) {
  return forbiddenKnowledgeBaseClusterLabelRefinementFields.some((field) => field in value);
}

function isKnowledgeBaseClusterLabelRefinementRequest(
  value: unknown,
): value is KnowledgeBaseClusterLabelRefinementRequest {
  return (
    isRecord(value) &&
    !hasForbiddenKnowledgeBaseClusterLabelRefinementField(value) &&
    Array.isArray(value.clusters) &&
    value.clusters.length > 0 &&
    value.clusters.every(isKnowledgeBaseClusterLabelRefinementClusterInput)
  );
}

function isKnowledgeBaseClusterLabelRefinementClusterInput(value: unknown) {
  return (
    isRecord(value) &&
    !hasForbiddenKnowledgeBaseClusterLabelRefinementField(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.label === "string" &&
    value.label.length > 0 &&
    (value.summary === undefined || typeof value.summary === "string") &&
    value.clusterBy === "topic" &&
    typeof value.sourceCount === "number" &&
    Number.isFinite(value.sourceCount) &&
    value.sourceCount > 0 &&
    Array.isArray(value.examples) &&
    value.examples.every(isKnowledgeBaseClusterLabelRefinementExample)
  );
}

function isKnowledgeBaseClusterLabelRefinementExample(value: unknown) {
  return (
    isRecord(value) &&
    !hasForbiddenKnowledgeBaseClusterLabelRefinementField(value) &&
    typeof value.sourceId === "string" &&
    value.sourceId.length > 0 &&
    (value.title === undefined || typeof value.title === "string") &&
    (value.sourceType === undefined || typeof value.sourceType === "string") &&
    (value.year === undefined || (typeof value.year === "number" && Number.isFinite(value.year))) &&
    (value.venue === undefined || typeof value.venue === "string") &&
    (value.authors === undefined ||
      (Array.isArray(value.authors) && value.authors.every((item) => typeof item === "string"))) &&
    (value.abstractSnippet === undefined || typeof value.abstractSnippet === "string") &&
    (value.topicTerms === undefined ||
      (Array.isArray(value.topicTerms) &&
        value.topicTerms.every((item) => typeof item === "string")))
  );
}

function isChunkMetaSummaryResponse(
  value: unknown,
): value is EngineResponse<ChunkMetaSummaryResult> {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (!value.ok) {
    return (
      isRecord(value.error) &&
      typeof value.error.code === "string" &&
      typeof value.error.message === "string" &&
      (value.error.detail === undefined || typeof value.error.detail === "string")
    );
  }
  const result = value.value;
  return (
    isRecord(result) &&
    (result.status === "summarized" ||
      result.status === "unavailable" ||
      result.status === "error") &&
    (result.providerKind === undefined || result.providerKind === "chat") &&
    (result.sectionSummary === undefined || typeof result.sectionSummary === "string") &&
    (result.chunkSummary === undefined || typeof result.chunkSummary === "string") &&
    (result.semanticRelations === undefined ||
      (Array.isArray(result.semanticRelations) &&
        result.semanticRelations.every(isChunkMetaSemanticRelationCandidate))) &&
    (result.reason === undefined || typeof result.reason === "string")
  );
}

function isChunkMetaSemanticRelationCandidate(value: unknown) {
  return (
    isRecord(value) &&
    isChunkMetaSemanticRelationKind(value.kind) &&
    typeof value.target === "string" &&
    value.target.length > 0 &&
    (value.label === undefined || typeof value.label === "string") &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    (value.reason === undefined || typeof value.reason === "string") &&
    value.source === "remote_llm"
  );
}

function isChunkMetaSemanticRelationKind(value: unknown) {
  return (
    value === "parent" ||
    value === "previous" ||
    value === "next" ||
    value === "section" ||
    value === "role" ||
    value === "citation_hint"
  );
}

function isFigureVisionAnalysisResponse(
  value: unknown,
): value is EngineResponse<FigureVisionAnalysisResult> {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (!value.ok) {
    return (
      isRecord(value.error) &&
      typeof value.error.code === "string" &&
      typeof value.error.message === "string" &&
      (value.error.detail === undefined || typeof value.error.detail === "string")
    );
  }
  const result = value.value;
  if (!isRecord(result)) return false;
  return (
    (result.status === "analyzed" ||
      result.status === "unavailable" ||
      result.status === "error") &&
    typeof result.analysisId === "string" &&
    typeof result.imageId === "string" &&
    (result.providerKind === undefined || result.providerKind === "chat") &&
    (result.summary === undefined || typeof result.summary === "string") &&
    (result.chartType === undefined || typeof result.chartType === "string") &&
    Array.isArray(result.extractedLabels) &&
    result.extractedLabels.every((item) => typeof item === "string") &&
    Array.isArray(result.extractedValues) &&
    result.extractedValues.every((item) => typeof item === "string") &&
    Array.isArray(result.claims) &&
    result.claims.every(isFigureVisionClaim) &&
    (result.reason === undefined || typeof result.reason === "string")
  );
}

function isGraphExtractionResponse(value: unknown): value is EngineResponse<GraphExtractionResult> {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (!value.ok) {
    return (
      isRecord(value.error) &&
      typeof value.error.code === "string" &&
      typeof value.error.message === "string" &&
      (value.error.detail === undefined || typeof value.error.detail === "string")
    );
  }
  const result = value.value;
  return (
    isRecord(result) &&
    (result.status === "extracted" ||
      result.status === "unavailable" ||
      result.status === "error") &&
    (result.providerKind === undefined || result.providerKind === "chat") &&
    Array.isArray(result.entities) &&
    result.entities.every(isGraphExtractionEntity) &&
    Array.isArray(result.relations) &&
    result.relations.every(isGraphExtractionRelation) &&
    (result.reason === undefined || typeof result.reason === "string")
  );
}

function isGraphExtractionEntity(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.kind === "domain" ||
      value.kind === "problem" ||
      value.kind === "method" ||
      value.kind === "dataset" ||
      value.kind === "metric") &&
    typeof value.label === "string" &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1
  );
}

function isGraphExtractionRelation(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.sourceEntityId === "string" &&
    typeof value.targetEntityId === "string" &&
    (value.dimension === "domain" || value.dimension === "technical") &&
    typeof value.edgeType === "string" &&
    typeof value.confidence === "number" &&
    Number.isFinite(value.confidence) &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    Array.isArray(value.evidenceChunkIds) &&
    value.evidenceChunkIds.length > 0 &&
    value.evidenceChunkIds.every((item) => typeof item === "string")
  );
}

function isFigureVisionClaim(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.claimId === "string" &&
    typeof value.text === "string" &&
    (value.confidence === "low" || value.confidence === "medium" || value.confidence === "high")
  );
}

function isKnowledgeBaseClusterLabelRefinementResponse(
  value: unknown,
): value is EngineResponse<KnowledgeBaseClusterLabelRefinementResult> {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (!value.ok) {
    return (
      isRecord(value.error) &&
      typeof value.error.code === "string" &&
      typeof value.error.message === "string" &&
      (value.error.detail === undefined || typeof value.error.detail === "string")
    );
  }
  const result = value.value;
  return (
    isRecord(result) &&
    (result.status === "refined" || result.status === "unavailable" || result.status === "error") &&
    (result.providerKind === undefined || result.providerKind === "chat") &&
    Array.isArray(result.clusters) &&
    result.clusters.every(isKnowledgeBaseClusterLabelRefinementItem) &&
    (result.reason === undefined || typeof result.reason === "string")
  );
}

function isKnowledgeBaseClusterLabelRefinementItem(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.clusterId === "string" &&
    value.clusterId.length > 0 &&
    (value.status === "refined" || value.status === "unavailable" || value.status === "error") &&
    (value.providerKind === undefined || value.providerKind === "chat") &&
    (value.label === undefined || typeof value.label === "string") &&
    (value.summary === undefined || typeof value.summary === "string") &&
    (value.confidence === undefined ||
      (typeof value.confidence === "number" &&
        Number.isFinite(value.confidence) &&
        value.confidence >= 0 &&
        value.confidence <= 1)) &&
    (value.reason === undefined || typeof value.reason === "string")
  );
}

function isEmbeddingReindexModelDescriptor(
  value: unknown,
): value is EmbeddingReindexModelDescriptor {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    isEmbeddingReindexProviderId(value.provider) &&
    typeof value.label === "string" &&
    value.label.length > 0 &&
    typeof value.dimension === "number" &&
    Number.isInteger(value.dimension) &&
    value.dimension > 0 &&
    value.metric === "cosine"
  );
}

function isEmbeddingVectorBatch(value: unknown): value is number[][] {
  return Array.isArray(value) && value.every((vector) => isEmbeddingVector(vector));
}

function isEmbeddingVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
