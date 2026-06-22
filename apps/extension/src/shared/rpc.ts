import type {
  ImageGenerationSettings,
  SaveImageGenerationSettingsInput,
} from "@/src/agent-runtime/image-generation-settings";
import type { ProviderId, ProviderSettings } from "@/src/agent-runtime/provider-settings";
import type {
  SearchOpenAICompatibleOverrideSettings,
  SearchOpenAIOverrideSettings,
  SearchProviderId,
  SearchProviderSettings,
} from "@/src/agent-runtime/search-provider-settings";
import type {
  AgentChatRequest,
  AgentErrorInfo,
  AgentScope,
  AgentStreamEvent,
  EvidenceItem,
  LocalCitation,
} from "@/src/agent-runtime/types";

export const CLIO_ENGINE_REQUEST = "clio:engine:request";
export const CLIO_OFFSCREEN_REQUEST = "clio:offscreen:request";
export const CLIO_WORKER_REQUEST = "clio:worker:request";
export const CLIO_WORKER_RESPONSE = "clio:worker:response";
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
export type JobType = "reindex_fts" | "resolve_anchor" | "post_capture_hardening";
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
export type TopicGraphEdgeKind = "source" | "related" | "mentions";
export type ReindexScope = "fts";
export type ChatMessageRole = "user" | "assistant" | "evidence";
export type ChatMessageStatus =
  | "queued"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";
export type SessionLeaseStatus = "claimed" | "already_open" | "missing";

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
  }>;
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

export interface CaptureBasePayload {
  sourceUrl: string;
  sourceTitle: string;
  normalizedText: string;
  capturedAt?: string;
  metadata?: Record<string, unknown>;
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
  lastError?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface GetJobStatusResult {
  jobs: JobSummary[];
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
  evidence: EvidenceItem;
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

export type EngineRequest =
  | { kind: "health" }
  | { kind: "capturePage"; payload: CaptureBasePayload }
  | { kind: "captureSelection"; payload: CaptureSelectionPayload }
  | { kind: "searchMemory"; query: string; limit?: number }
  | { kind: "listMemories"; limit?: number }
  | { kind: "getMemory"; id: string }
  | { kind: "deleteMemory"; id: string }
  | { kind: "listTopicPages"; query?: string; limit?: number }
  | { kind: "getTopicPage"; id: string }
  | { kind: "createTopicPage"; payload: CreateTopicPagePayload }
  | { kind: "updateTopicPage"; id: string; payload: UpdateTopicPagePayload }
  | { kind: "deleteTopicPage"; id: string }
  | { kind: "enqueueWikiCompile"; payload: CreateWikiCompileJobPayload }
  | { kind: "listWikiCompileJobs"; status?: WikiCompileJobStatus; limit?: number }
  | { kind: "getWikiCompileJob"; id: string }
  | { kind: "appendWikiCompileJobEvent"; payload: CreateWikiCompileJobEventPayload }
  | { kind: "listWikiCompileJobEvents"; jobId: string; limit?: number }
  | { kind: "claimNextWikiCompileJob"; id?: string; now?: string }
  | { kind: "completeWikiCompileJob"; id: string; result: WikiCompileResultPayload }
  | { kind: "failWikiCompileJob"; id: string; error: string; retryAfter?: string; now?: string }
  | { kind: "listTopicGraphEdges"; topicId: string; edgeKind?: TopicGraphEdgeKind }
  | { kind: "repair"; action: RepairAction }
  | { kind: "getJobStatus"; status?: JobStatus; limit?: number }
  | { kind: "reindex"; scope: ReindexScope }
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

export type EngineResultFor<T extends EngineRequest> = T extends { kind: "health" }
  ? EngineHealth
  : T extends { kind: "capturePage" | "captureSelection" }
    ? CaptureResult
    : T extends { kind: "searchMemory" }
      ? SearchMemoryResult
      : T extends { kind: "listMemories" }
        ? ListMemoriesResult
        : T extends { kind: "getMemory" }
          ? MemoryDetail | null
          : T extends { kind: "deleteMemory" }
            ? DeleteMemoryResult
            : T extends { kind: "listTopicPages" }
              ? ListTopicPagesResult
              : T extends { kind: "getTopicPage" | "updateTopicPage" }
                ? TopicPageDetail | null
                : T extends { kind: "createTopicPage" }
                  ? TopicPageDetail
                  : T extends { kind: "deleteTopicPage" }
                    ? DeleteTopicPageResult
                    : T extends { kind: "enqueueWikiCompile" }
                      ? WikiCompileJobSummary
                      : T extends { kind: "listWikiCompileJobs" }
                        ? ListWikiCompileJobsResult
                        : T extends { kind: "appendWikiCompileJobEvent" }
                          ? WikiCompileJobEvent
                          : T extends { kind: "listWikiCompileJobEvents" }
                            ? ListWikiCompileJobEventsResult
                            : T extends { kind: "getWikiCompileJob" | "claimNextWikiCompileJob" }
                              ? WikiCompileJobSummary | null
                              : T extends { kind: "completeWikiCompileJob" }
                                ? { job: WikiCompileJobSummary; topic: TopicPageDetail }
                                : T extends { kind: "failWikiCompileJob" }
                                  ? WikiCompileJobSummary | null
                                  : T extends { kind: "listTopicGraphEdges" }
                                    ? ListTopicGraphEdgesResult
                                    : T extends { kind: "repair" }
                                      ? RepairResult
                                      : T extends { kind: "getJobStatus" }
                                        ? GetJobStatusResult
                                        : T extends { kind: "reindex" }
                                          ? ReindexResult
                                          : T extends { kind: "resolveAnchor" }
                                            ? AnchorResolveResult
                                            : T extends { kind: "createChatSession" }
                                              ? ChatSessionSummary
                                              : T extends { kind: "listChatSessions" }
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
                                                    : T extends { kind: "appendSessionEvidence" }
                                                      ? SessionEvidenceRecord
                                                      : T extends { kind: "appendCompaction" }
                                                        ? CompactionRecord
                                                        : T extends { kind: "listCompactions" }
                                                          ? { items: CompactionRecord[] }
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
                                                                ? { deleted: boolean }
                                                                : T extends {
                                                                      kind: "clearQueuedChatMessages";
                                                                    }
                                                                  ? { cleared: number }
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
                                                                        ? { deleted: boolean }
                                                                        : T extends {
                                                                              kind: "clearWebSearchHistory";
                                                                            }
                                                                          ? { cleared: number }
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
  | { kind: "ensureImageGenerationHostPermission"; baseUrl?: string };

export type ProviderConfigRequest = { kind: "readActiveProviderConfig" };

export type ProviderConfigResult =
  | import("@/src/agent-runtime/provider-settings").StoredProviderConfig
  | undefined;

export type UiRequest = { kind: "openOptions" };

export type UiResultFor<T extends UiRequest> = T extends { kind: "openOptions" }
  ? { opened: true }
  : never;

export type ProviderResultFor<T extends ProviderRequest> = T extends {
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
      : T extends { kind: "ensureImageGenerationHostPermission" }
        ? ProviderSettings
        : T extends {
              kind: "testGeminiProvider" | "testOpenAIProvider" | "testOpenAICompatibleProvider";
            }
          ? TestProviderResult
          : never;

export type ProviderResponse<T = unknown> = EngineResponse<T>;

export type UiResponse<T = unknown> = EngineResponse<T>;

export interface EngineRequestMessage {
  type: typeof CLIO_ENGINE_REQUEST;
  request: EngineRequest;
}

export interface OffscreenRequestMessage {
  type: typeof CLIO_OFFSCREEN_REQUEST;
  request: EngineRequest;
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

export function isEngineRequestMessage(value: unknown): value is EngineRequestMessage {
  return isRecord(value) && value.type === CLIO_ENGINE_REQUEST && isEngineRequest(value.request);
}

export function isOffscreenRequestMessage(value: unknown): value is OffscreenRequestMessage {
  return isRecord(value) && value.type === CLIO_OFFSCREEN_REQUEST && isEngineRequest(value.request);
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

export function unwrapEngineResponse<T>(response: EngineResponse<T>): T {
  if (response.ok) return response.value;
  throw new EngineRpcError(response.error.code, response.error.message, response.error.detail);
}

function isEngineRequest(value: unknown): value is EngineRequest {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  switch (value.kind) {
    case "health":
      return true;
    case "capturePage":
      return isCapturePayload(value.payload);
    case "captureSelection":
      return isCapturePayload(value.payload);
    case "searchMemory":
      return typeof value.query === "string";
    case "listMemories":
      return value.limit === undefined || typeof value.limit === "number";
    case "getMemory":
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
    case "repair":
      return isRepairAction(value.action);
    case "getJobStatus":
      return (
        (value.status === undefined || isJobStatus(value.status)) &&
        (value.limit === undefined || typeof value.limit === "number")
      );
    case "reindex":
      return value.scope === "fts";
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

function isCapturePayload(value: unknown): value is CaptureBasePayload {
  return (
    isRecord(value) &&
    typeof value.sourceUrl === "string" &&
    typeof value.sourceTitle === "string" &&
    typeof value.normalizedText === "string"
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

function isJobStatus(value: unknown): value is JobStatus {
  return value === "queued" || value === "running" || value === "done" || value === "failed";
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
    isEvidenceItem(value.evidence) &&
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
    case "ensureImageGenerationHostPermission":
      return value.baseUrl === undefined || typeof value.baseUrl === "string";
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

function isEvidenceItem(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (value.sourceKind === "page" || value.sourceKind === "selection") &&
    typeof value.sourceUrl === "string" &&
    typeof value.sourceTitle === "string" &&
    typeof value.text === "string" &&
    typeof value.excerpt === "string"
  );
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
    (value.sourceKind === "page" || value.sourceKind === "selection") &&
    typeof value.sourceUrl === "string" &&
    typeof value.sourceTitle === "string" &&
    typeof value.excerpt === "string"
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
