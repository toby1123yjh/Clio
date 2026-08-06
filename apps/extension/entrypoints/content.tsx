import { readClioCitationValidation } from "@/src/agent-runtime/citation-validator";
import type {
  ImageGenerationSettings,
  SaveImageGenerationSettingsInput,
} from "@/src/agent-runtime/image-generation-settings";
import {
  type ImageGenerationStreamController,
  openImageGenerationStream,
} from "@/src/agent-runtime/image-generation-stream-client";
import {
  type LocalRagMemory,
  assembleLocalRagEvidencePack,
  planLocalRagRetrieval,
} from "@/src/agent-runtime/local-rag-evidence";
import {
  type MultiSourceRetrievalResult,
  buildMultiSourceRetrievalResult,
} from "@/src/agent-runtime/multi-source-retrieval";
import type {
  ProviderId,
  ProviderSettings,
  SaveGeminiProviderInput,
  SaveOpenAICompatibleProviderInput,
  SaveOpenAIProviderInput,
} from "@/src/agent-runtime/provider-settings";
import type {
  SaveSearchProviderInput,
  SearchProviderSettings,
} from "@/src/agent-runtime/search-provider-settings";
import {
  sourceContextPackAutoBudgetDefaults,
  sourceContextPackResearchBudgetDefaults,
} from "@/src/agent-runtime/source-context-pack-options";
import {
  type AgentStreamController,
  openAgentStream,
  openManualCompactStream,
  subscribeAgentStream,
} from "@/src/agent-runtime/stream-client";
import type { AgentChatRequest, AgentStreamEvent, EvidenceItem } from "@/src/agent-runtime/types";
import type {
  SaveVisionProviderSettingsInput,
  VisionProviderSettings,
} from "@/src/agent-runtime/vision-provider-settings";
import {
  type WebSearchStreamController,
  openWebSearchStream,
} from "@/src/agent-runtime/web-search-stream-client";
import type {
  LocalEmbeddingModelRequest,
  LocalEmbeddingModelStatus,
} from "@/src/local-embedding/contracts";
import { recommendedLocalEmbeddingModelManifest } from "@/src/local-embedding/trusted-models";
import {
  type ComposerContextAttachmentKind,
  type StartSessionTurnResult,
  clearActiveSessionId,
  createOrLoadSessionForTurn,
  enqueueSessionFollowUp,
  getRailOwnerId,
  heartbeatSession,
  loadActiveSessionId,
  retryInterruptedAssistant,
  saveActiveSessionId,
  stopInterruptedAssistant,
} from "@/src/rail/api/chat-session";
import { toSearchItem } from "@/src/rail/api/local-memory";
import {
  type TopicPageFormState,
  type WikiCompileFormState,
  buildWikiCompileQuestion,
  buildWikiCompileResult,
  createTopicPayloadFromForm,
  createWikiCompilePayloadFromForm,
  emptyTopicPageForm,
  emptyWikiCompileForm,
  topicDetailToForm,
  topicDetailToWikiCompileForm,
  updateTopicPayloadFromForm,
} from "@/src/rail/api/local-topic";
import { type RailCommand, createRailCommands } from "@/src/rail/app/command-registry";
import { type ToastState, errorToast } from "@/src/rail/app/feedback";
import type { MarkdownSource } from "@/src/rail/app/markdown-sources";
import {
  type CollapsedLauncherDragPoint,
  type CollapsedLauncherPosition,
  type RailTheme,
  clampCollapsedLauncherDragPoint,
  clampCollapsedLauncherPosition,
  clampRailWidth,
  collapsedIconTopFromRatio,
  collapsedLauncherPositionFromPoint,
  defaultCollapsedLauncherPosition,
  defaultRailTheme,
  defaultRailWidth,
  loadCollapsedLauncherPositionPreference,
  loadRailThemePreference,
  loadRailWidthPreference,
  saveCollapsedLauncherPositionPreference,
  saveRailThemePreference,
  saveRailWidthPreference,
} from "@/src/rail/app/preferences";
import {
  type ComposerScope,
  type ComposerSkillMode,
  type RailDialogueMessage,
  type RailSkillRequestDisplay,
  type SelectionSnapshot,
  createInitialRailState,
  hasUnresolvedInterruptedAnswer,
  isRailExpanded,
  reduceRailState,
} from "@/src/rail/app/rail-state";
import {
  buildRelatedMemoryQuery,
  filterRelatedMemoryItems,
  shouldLoadRelatedCards,
} from "@/src/rail/app/related-memory";
import {
  type SlashCommandContext,
  createSlashCommands,
} from "@/src/rail/app/slash-command-registry";
import { type ToolboxSkill, toolboxSkills } from "@/src/rail/app/toolbox-registry";
import {
  type ImageGenerationDisplayState,
  type ImageGenerationSubmitInput,
  type KnowledgeBaseFilterState,
  type PdfReaderPreviewState,
  type ProviderMessageTone,
  RailShell,
  type SourceContextPlannerBudget,
  type SourceContextPlannerState,
} from "@/src/rail/components/RailShell";
import { SelectionMiniUi } from "@/src/rail/components/SelectionMiniUi";
import { Toast } from "@/src/rail/components/Toast";
import {
  applyPageLayoutCompensation,
  restorePageLayoutCompensation,
} from "@/src/rail/page/layout-compensation";
import {
  installSpaLocationObserver,
  locationChangeEventName,
  readPageContext,
} from "@/src/rail/page/page-context";
import { extractReadablePage } from "@/src/rail/page/readable-page";
import {
  type SelectionState,
  readCurrentSelection,
  readLiveSelectionSnapshot,
} from "@/src/rail/page/selection";
import {
  clearPendingHighlight,
  consumePendingHighlight,
  highlightAnchor,
  highlightEvidenceAnchor,
  storePendingHighlight,
  storePendingHighlightFromAnchor,
} from "@/src/rail/page/source-highlight";
import { requestEngine, requestProvider } from "@/src/shared/chrome-client";
import { sourceUrlsMatch } from "@/src/shared/reliability";
import {
  type ActiveEmbeddingModelSummary,
  type CaptureSelectionPayload,
  type ChatMessageRecord,
  type ChatSessionDetail,
  type ChatSessionSummary,
  type ChunkMetaTier2AuditRecord,
  type ClioImageGenerationEvent,
  type ClioWebSearchEvent,
  type ClioWebSearchResult,
  type ContentCommand,
  type CreateWikiCompileJobEventPayload,
  type EngineHealth,
  type GetMemoryEvidenceWindowAnchor,
  type ImageGenerationHistoryRecord,
  type KnowledgeBaseSearchMode,
  type MemoryDetail,
  type MemoryEvidenceWindow,
  type OrchestrationEvent,
  type OrchestrationRunSummary,
  type RetrieveSourceItem,
  type RetrieveSourceRelevanceBand,
  type RetrieveSourcesFilter,
  type RetrieveSourcesRelevanceTrace,
  type RetrieveSourcesResult,
  type RetrieveSourcesStageTrace,
  type RetrieveStrength,
  type SearchMemoryItem,
  type SourceContextCompressionLogRecord,
  type SourceContextMapArtifactRecord,
  type SourceContextMapEvent,
  type SourceContextMapRunSummary,
  type SourceContextPackResult,
  type TopicGraphEdge,
  type TopicPageDetail,
  type TopicPageSummary,
  type WebSearchHistoryRecord,
  type WikiCompileJobEvent,
  type WikiCompileJobSummary,
  type WorkingSetLoadDepth,
  type WorkingSetStatusResult,
  isContentCommandMessage,
} from "@/src/shared/rpc";
import { excerpt, hashText, normalizeText } from "@/src/shared/text";
import {
  type ReplyActionSuggestion,
  type SuggestionCooldownState,
  suggestReplyActions,
} from "@/src/suggestions/suggestion-engine";
import { testWorkspaceBuildConfig } from "@/src/test-workspace/build-config";
import {
  type TestWorkspaceCleanupResult,
  type TestWorkspaceInitializationResult,
  type TestWorkspaceProgress,
  type TestWorkspaceRunnerDependencies,
  initializeTestWorkspace,
  removeTestWorkspaceSources,
} from "@/src/test-workspace/runner";
import {
  type ExplicitToolRouteKind,
  type ExplicitToolTrace,
  explicitToolRouteLabel,
} from "@/src/tool-routing/tool-route-types";
import { normalizeShadowCssRemUnits } from "@/src/ui/shadow-css";
import styles from "@/src/ui/tailwind.css?inline";
import katexStyles from "katex/dist/katex.min.css?inline";
import * as React from "react";
import { createRoot } from "react-dom/client";

const commandEventName = "clio:content-command";
const relatedSearchLimit = 12;
const defaultSourceContextPlannerBudget = {
  maxTotalTokens: sourceContextPackResearchBudgetDefaults.maxTotalTokens,
  maxGroups: sourceContextPackResearchBudgetDefaults.maxGroups,
  maxGroupTokens: sourceContextPackResearchBudgetDefaults.maxGroupTokens,
  maxSources: sourceContextPackResearchBudgetDefaults.maxSources,
  maxWindowsPerSource: sourceContextPackResearchBudgetDefaults.maxWindowsPerSource,
  contextChunksBefore: sourceContextPackResearchBudgetDefaults.contextChunksBefore,
  contextChunksAfter: sourceContextPackResearchBudgetDefaults.contextChunksAfter,
} as const;
const defaultSourceContextPackIntentNeedles = [
  "research",
  "paper",
  "papers",
  "compare",
  "comparison",
  "synthesize",
  "synthesis",
  "literature",
  "method",
  "methods",
  "evidence",
  "knowledge base",
  "knowledge-base",
  "source context",
  "long context",
  "\u77e5\u8bc6\u5e93",
  "\u8bba\u6587",
  "\u5bf9\u6bd4",
  "\u7efc\u8ff0",
  "\u5206\u6790",
  "\u8bc1\u636e",
  "\u6587\u732e",
  "\u65b9\u6cd5",
  "\u79d1\u7814",
  "\u7814\u7a76",
  "\u957f\u6587",
  "\u8d44\u6599\u5e93",
] as const;

interface WebSearchViewState {
  running: boolean;
  query: string;
  answer: string;
  sources: ClioWebSearchResult["sources"];
  provider?: string;
  createdAt?: string;
  error?: {
    code: string;
    message: string;
    detail?: string;
  };
}

const emptyWebSearchState: WebSearchViewState = {
  running: false,
  query: "",
  answer: "",
  sources: [],
};

const emptyImageGenerationState: ImageGenerationDisplayState = {
  running: false,
  mode: "generate",
  prompt: "",
};

function memoryHasPersistedPdfRawFile(detail: MemoryDetail | null) {
  const rawFile = metadataRecord(detail?.metadata.pdf_raw_file);
  if (rawFile?.status !== "persisted") return false;
  const contentType = rawFile.contentType;
  return contentType === undefined || contentType === "application/pdf";
}

function metadataRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function pdfRawBytesToBlobPart(bytes: unknown): BlobPart {
  if (bytes instanceof ArrayBuffer) return bytes;
  if (bytes instanceof Uint8Array) return copyUint8ArrayToArrayBuffer(bytes);
  if (Array.isArray(bytes) && bytes.every((item) => Number.isInteger(item))) {
    return copyUint8ArrayToArrayBuffer(new Uint8Array(bytes));
  }
  throw new Error("Raw PDF bytes were not returned in a browser-readable format.");
}

function copyUint8ArrayToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

interface SessionSuggestionCooldown {
  completedUserTurnCount: number;
  lastSuggestedTurnCount: number;
}

const defaultSuggestionCooldown: SuggestionCooldownState = {
  completedUserTurnsSinceLastSuggestion: 3,
};

const defaultKnowledgeBaseFilter: KnowledgeBaseFilterState = {
  sourceType: "all",
  lifecycleStatus: "all",
  yearsText: "",
  authorsText: "",
  venuesText: "",
  doiText: "",
  arxivIdsText: "",
};

type KnowledgeUploadKind = "markdown" | "pdf";

function uniqueKnowledgeBaseFilterValues(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next;
}

function normalizeKnowledgeBaseListText(
  value: string,
  options: { allowWhitespace: boolean },
): string[] | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const values = options.allowWhitespace ? trimmed.split(/[\s,;]+/) : trimmed.split(/[\r\n,;]+/);
  const normalized = uniqueKnowledgeBaseFilterValues(values);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeKnowledgeBaseYears(value: string): number[] | undefined {
  const tokens = normalizeKnowledgeBaseListText(value, { allowWhitespace: true });
  if (tokens === undefined) return undefined;
  const years: number[] = [];
  const seen = new Set<number>();
  for (const token of tokens) {
    if (!/^\d{1,4}$/.test(token)) continue;
    const year = Number.parseInt(token, 10);
    if (!Number.isInteger(year) || seen.has(year)) continue;
    seen.add(year);
    years.push(year);
  }
  return years.length > 0 ? years : undefined;
}

function normalizeKnowledgeBaseScalarText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function retrieveFilterForKnowledgeBase(
  filter: KnowledgeBaseFilterState,
): RetrieveSourcesFilter | undefined {
  const sourceTypes =
    filter.sourceType === "all"
      ? undefined
      : filter.sourceType === "webpage"
        ? ["webpage", "page", "selection"]
        : [filter.sourceType];
  const lifecycleStatuses = filter.lifecycleStatus === "all" ? undefined : [filter.lifecycleStatus];
  const years = normalizeKnowledgeBaseYears(filter.yearsText);
  const authors = normalizeKnowledgeBaseListText(filter.authorsText, { allowWhitespace: false });
  const venues = normalizeKnowledgeBaseListText(filter.venuesText, { allowWhitespace: false });
  const doi = normalizeKnowledgeBaseScalarText(filter.doiText);
  const arxivIds = normalizeKnowledgeBaseListText(filter.arxivIdsText, {
    allowWhitespace: true,
  });
  if (
    sourceTypes === undefined &&
    lifecycleStatuses === undefined &&
    years === undefined &&
    authors === undefined &&
    venues === undefined &&
    doi === undefined &&
    arxivIds === undefined
  ) {
    return undefined;
  }
  return {
    ...(sourceTypes === undefined ? {} : { sourceTypes }),
    ...(lifecycleStatuses === undefined ? {} : { lifecycleStatuses }),
    ...(years === undefined ? {} : { years }),
    ...(authors === undefined ? {} : { authors }),
    ...(venues === undefined ? {} : { venues }),
    ...(doi === undefined ? {} : { doi }),
    ...(arxivIds === undefined ? {} : { arxivIds }),
  };
}

function knowledgeUploadKindForFile(file: File): KnowledgeUploadKind | null {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    mime === "text/markdown" ||
    mime === "text/x-markdown" ||
    name.endsWith(".md") ||
    name.endsWith(".markdown")
  ) {
    return "markdown";
  }
  return null;
}

function uploadSourceUrlForFile(file: File) {
  const safeName = encodeURIComponent(file.name.trim() || "untitled");
  return `clio://upload/${safeName}`;
}

function uploadSourceTitleForFile(file: File, kind: KnowledgeUploadKind) {
  const fallback = kind === "pdf" ? "Uploaded PDF" : "Uploaded Markdown";
  return file.name.trim() || fallback;
}

function uploadMetadataForFile(file: File, kind: KnowledgeUploadKind): Record<string, unknown> {
  return {
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type.trim() || (kind === "pdf" ? "application/pdf" : "text/markdown"),
    source_origin: "file_upload",
    upload_last_modified: Number.isFinite(file.lastModified)
      ? new Date(file.lastModified).toISOString()
      : undefined,
  };
}

function uploadSummaryMessage(input: {
  savedCount: number;
  duplicateCount: number;
  unsupportedCount: number;
  failedCount: number;
}) {
  const parts: string[] = [];
  if (input.savedCount > 0) {
    parts.push(`${input.savedCount} saved`);
  }
  if (input.duplicateCount > 0) {
    parts.push(`${input.duplicateCount} already in Clio`);
  }
  if (input.unsupportedCount > 0) {
    parts.push(`${input.unsupportedCount} unsupported`);
  }
  if (input.failedCount > 0) {
    parts.push(`${input.failedCount} failed`);
  }
  return parts.length === 0 ? "No files imported." : `Import complete: ${parts.join(", ")}.`;
}

function selectionSnapshotToCapturePayload(snapshot: SelectionSnapshot): CaptureSelectionPayload {
  return {
    sourceUrl: snapshot.sourceUrl,
    sourceTitle: snapshot.sourceTitle,
    normalizedText: snapshot.text,
    capturedAt: new Date().toISOString(),
    contextBefore: snapshot.contextBefore,
    contextAfter: snapshot.contextAfter,
    xpath: snapshot.xpath,
    textFragment: snapshot.textFragment,
    metadata: {
      contextBefore: snapshot.contextBefore,
      contextAfter: snapshot.contextAfter,
      xpath: snapshot.xpath,
      textFragment: snapshot.textFragment,
    },
  };
}

function chatMessageToRailMessage(record: ChatMessageRecord): RailDialogueMessage {
  const retryQuestion = readString(record.retry, "question");
  const retryScope = readAgentScope(record.retry, "scope");
  const retryRequest =
    record.role === "assistant" &&
    record.status !== "cancelled" &&
    retryQuestion !== undefined &&
    retryScope !== undefined
      ? {
          question: retryQuestion,
          scope: retryScope,
          pageUrl: readString(record.retry, "pageUrl"),
          selectionText: readString(record.retry, "selectionText"),
        }
      : undefined;
  return {
    id: record.id,
    role: record.role,
    content: record.content,
    createdAt: record.createdAt,
    scope: record.scope,
    status: record.status,
    pageUrl: record.pageUrl,
    pageTitle: record.pageTitle,
    selectionText: record.selectionText,
    citations: record.citations,
    citationValidation: readClioCitationValidation(record.piAgentMessageJson),
    worldKnowledge: record.worldKnowledge,
    error: record.error,
    skillRequest: readSkillRequest(record.piAgentMessageJson),
    ...(retryRequest === undefined ? {} : { retryRequest }),
  };
}

function readSkillRequest(value: unknown): RailSkillRequestDisplay | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const field = (value as Record<string, unknown>).clioSkillRequest;
  if (typeof field !== "object" || field === null) return undefined;
  const record = field as Record<string, unknown>;
  if (
    !isComposerSkillModeId(record.skillId) ||
    typeof record.skillLabel !== "string" ||
    !isSkillRequestSource(record.source)
  ) {
    return undefined;
  }
  return {
    skillId: record.skillId,
    skillLabel: record.skillLabel,
    source: record.source,
    ...(typeof record.instruction === "string" && record.instruction.length > 0
      ? { instruction: record.instruction }
      : {}),
  };
}

function isComposerSkillModeId(value: unknown): value is RailSkillRequestDisplay["skillId"] {
  return (
    value === "translate" || value === "summarize" || value === "extract" || value === "rewrite"
  );
}

function isSkillRequestSource(value: unknown): value is RailSkillRequestDisplay["source"] {
  return value === "Text" || value === "Page" || value === "Selection";
}

function activeRunFromMessages(messages: ChatMessageRecord[]) {
  const assistant = messages.find(
    (message) =>
      message.role === "assistant" && message.status === "streaming" && message.runId !== undefined,
  );
  if (assistant?.runId === undefined) return undefined;
  return {
    runId: assistant.runId,
    userMessageId: `${assistant.runId}:user`,
    assistantMessageId: assistant.id,
  };
}

function buildReplySuggestionsForSession(input: {
  session: ChatSessionDetail;
  assistantMessageId: string;
  cooldown: SuggestionCooldownState;
}) {
  const assistantIndex = input.session.messages.findIndex(
    (message) => message.id === input.assistantMessageId && message.role === "assistant",
  );
  if (assistantIndex < 0) return [];

  const assistant = input.session.messages[assistantIndex];
  if (assistant === undefined || assistant.status !== "completed") return [];

  const user = findNearestCompletedUserMessage(input.session.messages, assistantIndex);
  if (user === undefined) return [];

  const result = suggestReplyActions({
    messageId: assistant.id,
    sessionId: input.session.id,
    userText: user.content,
    assistantText: assistant.content,
    hasCurrentPage: typeof assistant.pageUrl === "string" && assistant.pageUrl.length > 0,
    hasExplicitPageContext: assistant.scope === "current-page",
    hasSelection: normalizeText(user.selectionText ?? assistant.selectionText ?? "").length > 0,
    hasAttachedEvidence: user.evidenceRefs.length > 0 || assistant.evidenceRefs.length > 0,
    cooldown: input.cooldown,
  });
  return result.chips;
}

function findNearestCompletedUserMessage(messages: ChatMessageRecord[], beforeIndex: number) {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && message.status === "completed") return message;
  }
}

function countCompletedUserTurns(messages: ChatMessageRecord[]) {
  return messages.filter((message) => message.role === "user" && message.status === "completed")
    .length;
}

function summarizeExplicitRouteInput(suggestion: ReplyActionSuggestion) {
  const raw = normalizeText(suggestion.query ?? suggestion.label);
  if (raw.length === 0) return suggestion.label;
  return raw.length <= 120 ? raw : `${raw.slice(0, 117).trimEnd()}...`;
}

function explicitRouteSourceSummary(route: ExplicitToolRouteKind) {
  switch (route) {
    case "web_search":
      return "Opened Search. Run the search manually.";
    case "knowledge_search":
      return "Opened Knowledge Base. Search manually when ready.";
    case "find_related":
      return "Opened Knowledge Base. Find related memories manually.";
    case "page_summary":
      return "Composer switched to Summarize. Attach page or selection before sending.";
    case "translate_selection":
      return "Composer switched to Translate. Attach selection before sending.";
    case "save_to_memory":
      return "Opened Knowledge Base. Use Save Page or Add selection to save.";
    default:
      return exhaustiveRoute(route);
  }
}

function createExplicitToolTrace(input: {
  suggestion: ReplyActionSuggestion;
  status: ExplicitToolTrace["status"];
  now: string;
}) {
  return {
    id: `${input.suggestion.id}:trace`,
    route: input.suggestion.route,
    trigger: "reply_chip",
    status: input.status,
    inputSummary: summarizeExplicitRouteInput(input.suggestion),
    sourceSummary: explicitRouteSourceSummary(input.suggestion.route),
    messageId: input.suggestion.messageId,
    sessionId: input.suggestion.sessionId,
    createdAt: input.now,
    completedAt: input.now,
  } satisfies ExplicitToolTrace;
}

function evidenceRecordToAgentEvidence(record: {
  id: string;
  sourceKind: "page" | "selection";
  pageUrl: string;
  pageTitle: string;
  text: string;
  excerpt: string;
}): EvidenceItem {
  return {
    id: record.id,
    sourceKind: record.sourceKind,
    sourceUrl: record.pageUrl,
    sourceTitle: record.pageTitle,
    text: record.text,
    excerpt: record.excerpt,
  };
}

function evidenceWindowToAgentEvidence(window: MemoryEvidenceWindow): EvidenceItem {
  const text = normalizeText(window.chunks.map((chunk) => chunk.text).join("\n\n"));
  return {
    id: `memory:${window.memoryId}:chunk:${window.chunkId}`,
    sourceKind: "memory",
    sourceUrl: window.sourceUrl,
    sourceTitle: window.sourceTitle,
    text,
    excerpt: excerpt(text || window.excerpt),
    ...(window.anchor === undefined
      ? {}
      : {
          anchor: {
            selectedText: window.anchor.selectedText,
            contextBefore: window.anchor.contextBefore,
            contextAfter: window.anchor.contextAfter,
            ...(window.anchor.xpath === undefined ? {} : { xpath: window.anchor.xpath }),
            ...(window.anchor.textFragment === undefined
              ? {}
              : { textFragment: window.anchor.textFragment }),
          },
        }),
  };
}

function evidenceWindowsToLocalRagMemories(windows: MemoryEvidenceWindow[]): LocalRagMemory[] {
  const memories = new Map<string, LocalRagMemory>();
  for (const window of windows) {
    const text = normalizeText(window.chunks.map((chunk) => chunk.text).join("\n\n"));
    if (text.length === 0) continue;
    const existing = memories.get(window.memoryId);
    const memory =
      existing ??
      ({
        id: window.memoryId,
        sourceUrl: window.sourceUrl,
        sourceTitle: window.sourceTitle,
        normalizedText: "",
        excerpt: window.excerpt,
        anchor: window.anchor,
        chunks: [],
      } satisfies LocalRagMemory);
    memory.chunks.push({
      id: window.chunkId,
      ord: memory.chunks.length,
      text,
      tokenCount: window.chunks.reduce((total, chunk) => total + chunk.tokenCount, 0),
    });
    memories.set(window.memoryId, memory);
  }
  return Array.from(memories.values());
}

function retrievalEvidenceWindowAnchors(
  result: RetrieveSourcesResult,
): GetMemoryEvidenceWindowAnchor[] {
  const seen = new Set<string>();
  return result.items.flatMap((item) =>
    item.hitChunks.flatMap((chunk) => {
      const memoryId = normalizeText(item.id);
      const chunkId = normalizeText(chunk.chunkId);
      if (memoryId.length === 0 || chunkId.length === 0) return [];
      const key = `${memoryId}:${chunkId}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [
        {
          memoryId,
          chunkId,
          ord: chunk.ord,
        },
      ];
    }),
  );
}

function toKnowledgeBaseSearchItem(item: RetrieveSourceItem): SearchMemoryItem {
  return {
    ...toSearchItem(item),
    snippet: item.hitChunks[0]?.snippet ?? item.excerpt,
  };
}

async function loadLocalRagEvidencePack(query: string): Promise<EvidenceItem[]> {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length === 0) return [];
  if (!planLocalRagRetrieval(normalizedQuery).shouldRetrieve) return [];
  try {
    const retrieval = await requestEngine({
      kind: "retrieveSources",
      payload: {
        query: normalizedQuery,
        limit: 8,
        includeChunks: 2,
      },
    });
    const memoryIds = retrieval.items.map((item) => item.id);
    const anchors = retrievalEvidenceWindowAnchors(retrieval);
    const windows = await requestEngine({
      kind: "getMemoryEvidenceWindows",
      payload: {
        query: normalizedQuery,
        memoryIds,
        anchors,
        limit: 12,
        maxWindowsPerMemory: 2,
        contextChunksBefore: 1,
        contextChunksAfter: 1,
      },
    });
    return assembleLocalRagEvidencePack({
      query: normalizedQuery,
      memories: evidenceWindowsToLocalRagMemories(windows.items),
      maxItems: 6,
      maxCharsPerItem: 1_200,
      maxTotalChars: 4_800,
      contextChunksBefore: 0,
      contextChunksAfter: 0,
    });
  } catch {
    return [];
  }
}

async function loadMultiSourceRagEvidencePack(query: string): Promise<MultiSourceRetrievalResult> {
  const normalizedQuery = normalizeText(query);
  const localEvidence = await loadLocalRagEvidencePack(normalizedQuery);
  return buildMultiSourceRetrievalResult({
    request: {
      query: normalizedQuery,
      trigger: { kind: "ordinary_chat" },
      allowExternal: false,
      externalAvailable: false,
    },
    localEvidence,
  });
}

function planDefaultSourceContextPack(
  query: string,
): AgentChatRequest["sourceContextPack"] | undefined {
  const normalizedQuery = normalizeText(query);
  if (!planLocalRagRetrieval(normalizedQuery).shouldRetrieve) return undefined;
  const lowerQuery = normalizedQuery.toLowerCase();
  if (!defaultSourceContextPackIntentNeedles.some((needle) => lowerQuery.includes(needle))) {
    return undefined;
  }
  return {
    mode: "auto",
    planner: "source_context_planner_v1",
    triggerReason: "default_chat_long_context_intent",
    ...sourceContextPackAutoBudgetDefaults,
    mapReduce: {
      enabled: true,
      maxGroups: sourceContextPackAutoBudgetDefaults.maxGroups,
      perGroupTokenBudget: sourceContextPackAutoBudgetDefaults.maxGroupTokens,
    },
  };
}

function sourceContextPackOptionsFromPlanner(input: {
  sourceIds: string[];
  sourceDepthOverrides: SourceContextPlannerState["sourceDepthOverrides"];
  budget: SourceContextPlannerBudget;
}): AgentChatRequest["sourceContextPack"] {
  const sourceDepthOverrides = sourceContextPlannerDepthOverridesForSelection(input);
  return {
    mode: "research",
    planner: "source_context_planner_v1",
    triggerReason: "explicit_source_picker_planning",
    sourceIds: input.sourceIds,
    ...(sourceDepthOverrides.length === 0 ? {} : { sourceDepthOverrides }),
    useWorkingSet: false,
    ...input.budget,
    mapReduce: {
      enabled: true,
      maxGroups: input.budget.maxGroups,
      perGroupTokenBudget: input.budget.maxGroupTokens,
    },
  };
}

function sourceContextPlannerDepthOverridesForSelection(input: {
  sourceIds: string[];
  sourceDepthOverrides: SourceContextPlannerState["sourceDepthOverrides"];
}) {
  const overrideBySourceId = new Map(
    input.sourceDepthOverrides.map((override) => [override.sourceId, override.loadDepth]),
  );
  return input.sourceIds.flatMap((sourceId) => {
    const loadDepth = overrideBySourceId.get(sourceId);
    return loadDepth === undefined ? [] : [{ sourceId, loadDepth }];
  });
}

function sourceContextPackPreviewSummary(pack: SourceContextPackResult) {
  const windowCount = pack.groups.reduce((total, group) => total + group.windows.length, 0);
  return `Preview: ${pack.sources.length} source(s), ${pack.groups.length} group(s), ${windowCount} window(s), ${pack.trace.totalTokenEstimate} token(s).`;
}

function buildAttachedEvidence(
  kind: ComposerContextAttachmentKind | undefined,
  pageContext: { url: string; title: string },
  selectionSnapshot: SelectionSnapshot | undefined,
): EvidenceItem | undefined {
  if (kind === undefined) return undefined;
  if (kind === "selection") {
    const selectedText = normalizeText(selectionSnapshot?.text ?? "");
    if (selectionSnapshot === undefined || selectedText.length === 0) {
      throw new Error("Select text on the page before attaching selection context.");
    }
    return {
      id: `selection:${hashText(selectedText)}`,
      sourceKind: "selection",
      sourceUrl: selectionSnapshot.sourceUrl,
      sourceTitle: selectionSnapshot.sourceTitle,
      text: selectedText,
      excerpt: excerpt(selectedText, 260),
      anchor: {
        selectedText,
        contextBefore: selectionSnapshot.contextBefore,
        contextAfter: selectionSnapshot.contextAfter,
        ...(selectionSnapshot.xpath === undefined ? {} : { xpath: selectionSnapshot.xpath }),
        ...(selectionSnapshot.textFragment === undefined
          ? {}
          : { textFragment: selectionSnapshot.textFragment }),
      },
    };
  }

  const readable = extractReadablePage();
  const text = normalizeText(readable.text);
  if (text.length === 0) {
    throw new Error("Clio could not find clean page text. Select a passage and try again.");
  }
  const title = readable.title || pageContext.title;
  return {
    id: `page:${hashText(`${pageContext.url}\n${text}`)}`,
    sourceKind: "page",
    sourceUrl: pageContext.url,
    sourceTitle: title,
    text,
    excerpt: excerpt(text, 260),
    anchor: {
      selectedText: excerpt(text, 260),
      contextBefore: "",
      contextAfter: "",
    },
  };
}

function scopeFromAttachment(kind: ComposerContextAttachmentKind | undefined): ComposerScope {
  if (kind === "selection") return "selection";
  if (kind === "page") return "current-page";
  return "general";
}

function buildSkillQuestion(input: {
  content: string;
  attachmentKind?: ComposerContextAttachmentKind;
  skillMode?: ComposerSkillMode;
}) {
  const content = input.content.trim();
  if (input.skillMode === undefined) return content;
  const source =
    input.attachmentKind === "selection"
      ? "Selection"
      : input.attachmentKind === "page"
        ? "Page"
        : "Text";
  const parts = [
    input.skillMode.instruction,
    `Source: ${source}.`,
    content.length > 0 ? `User instruction: ${content}` : undefined,
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return parts.join("\n\n");
}

function buildDisplayContent(input: {
  content: string;
  attachmentKind?: ComposerContextAttachmentKind;
  skillMode?: ComposerSkillMode;
}) {
  const content = input.content.trim();
  if (input.skillMode === undefined) return content;
  if (content.length > 0) return content;
  if (input.attachmentKind === "selection") return `${input.skillMode.label} selection`;
  if (input.attachmentKind === "page") return `${input.skillMode.label} page`;
  return input.skillMode.label;
}

function buildSkillRequestDisplay(input: {
  content: string;
  attachmentKind?: ComposerContextAttachmentKind;
  skillMode?: ComposerSkillMode;
}): RailSkillRequestDisplay | undefined {
  if (input.skillMode === undefined) return undefined;
  return {
    skillId: input.skillMode.id,
    skillLabel: input.skillMode.label,
    source:
      input.attachmentKind === "selection"
        ? "Selection"
        : input.attachmentKind === "page"
          ? "Page"
          : "Text",
    ...(input.content.trim().length > 0 ? { instruction: input.content.trim() } : {}),
  };
}

function readString(value: unknown, key: string) {
  if (typeof value !== "object" || value === null) return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : undefined;
}

function readAgentScope(value: unknown, key: string): ComposerScope | undefined {
  const field = readString(value, key);
  if (field === "general" || field === "current-page" || field === "selection") return field;
  return undefined;
}

function readRelatedReadableText() {
  try {
    return extractReadablePage().text;
  } catch {
    return "";
  }
}

function hasQueuedDialogueMessages(messages: RailDialogueMessage[]) {
  return messages.some((message) => message.role === "user" && message.status === "queued");
}

function isTerminalAgentStreamEvent(event: AgentStreamEvent) {
  return (
    event.type === "run_completed" ||
    event.type === "run_failed" ||
    event.type === "run_cancelled" ||
    event.type === "run_resolved"
  );
}

function providerLabel(provider: ProviderId) {
  if (provider === "openai") return "OpenAI";
  if (provider === "openai-compatible") return "OpenAI Compatible";
  return "Gemini";
}

function localEmbeddingActionMessage(
  kind: Exclude<LocalEmbeddingModelRequest, { kind: "getLocalEmbeddingModelStatus" }>["kind"],
  status: LocalEmbeddingModelStatus,
) {
  if (status.error !== undefined) return status.error.message;
  if (kind === "installLocalEmbeddingModel") return "Local model download started.";
  if (kind === "cancelLocalEmbeddingModelInstall")
    return "Local model download cancellation requested.";
  if (kind === "retryLocalEmbeddingModelInstall") return "Local model download restarted.";
  if (kind === "deleteLocalEmbeddingModel") return "Local embedding model deleted.";
  if (kind === "cancelLocalEmbeddingReindex") return "Local embedding rebuild is stopping.";
  if (kind === "testLocalEmbeddingModel")
    return `Local embedding runtime ready (${status.backend ?? "WASM"}).`;
  return status.active
    ? "Local embeddings rebuilt and activated."
    : "Local embedding rebuild finished.";
}

function exhaustiveRoute(value: never): never {
  throw new Error(`Unhandled explicit tool route: ${String(value)}`);
}

export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  main() {
    const host = document.createElement("div");
    host.id = "clio-toolbox-root";
    document.documentElement.append(host);

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = normalizeShadowCssRemUnits(`${styles}\n${katexStyles}`);
    const mount = document.createElement("div");
    mount.className = "clio-shadow-root";
    shadow.append(style, mount);

    createRoot(mount).render(<ClioContentApp />);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isContentCommandMessage(message)) return false;
      window.dispatchEvent(
        new CustomEvent<ContentCommand>(commandEventName, {
          detail: message.command,
        }),
      );
      sendResponse({ ok: true });
      return false;
    });
  },
});

function ClioContentApp() {
  const initialPageContext = React.useMemo(() => readPageContext(), []);
  const [railState, dispatch] = React.useReducer(
    reduceRailState,
    initialPageContext,
    createInitialRailState,
  );
  const [selection, setSelection] = React.useState<SelectionState | null>(null);
  const [items, setItems] = React.useState<SearchMemoryItem[]>([]);
  const [knowledgeBaseSearchLoading, setKnowledgeBaseSearchLoading] = React.useState(false);
  const [knowledgeBaseRefreshLoading, setKnowledgeBaseRefreshLoading] = React.useState(false);
  const [knowledgeBaseSearchMode, setKnowledgeBaseSearchMode] =
    React.useState<KnowledgeBaseSearchMode>("exact");
  const [knowledgeBaseStrength, setKnowledgeBaseStrength] =
    React.useState<RetrieveStrength>("balanced");
  const [knowledgeBaseRelevance, setKnowledgeBaseRelevance] = React.useState<{
    bands: RetrieveSourceRelevanceBand[];
    stages: RetrieveSourcesStageTrace[];
    trace?: RetrieveSourcesRelevanceTrace;
  }>({ bands: [], stages: [] });
  const knowledgeBaseStrengthRef = React.useRef<RetrieveStrength>("balanced");
  React.useEffect(() => {
    knowledgeBaseStrengthRef.current = knowledgeBaseStrength;
  }, [knowledgeBaseStrength]);
  const [knowledgeBaseFilter, setKnowledgeBaseFilter] = React.useState<KnowledgeBaseFilterState>(
    defaultKnowledgeBaseFilter,
  );
  const knowledgeBaseRetrieveFilter = React.useMemo(
    () => retrieveFilterForKnowledgeBase(knowledgeBaseFilter),
    [knowledgeBaseFilter],
  );
  const [workingSetStatus, setWorkingSetStatus] = React.useState<WorkingSetStatusResult | null>(
    null,
  );
  const [sourceContextCompressionLogs, setSourceContextCompressionLogs] = React.useState<
    SourceContextCompressionLogRecord[]
  >([]);
  const [sourceContextMapArtifacts, setSourceContextMapArtifacts] = React.useState<
    SourceContextMapArtifactRecord[]
  >([]);
  const [sourceContextMapRuns, setSourceContextMapRuns] = React.useState<
    SourceContextMapRunSummary[]
  >([]);
  const [sourceContextMapEvents, setSourceContextMapEvents] = React.useState<
    SourceContextMapEvent[]
  >([]);
  const [chunkMetaTier2Audit, setChunkMetaTier2Audit] = React.useState<ChunkMetaTier2AuditRecord[]>(
    [],
  );
  const [orchestrationRuns, setOrchestrationRuns] = React.useState<OrchestrationRunSummary[]>([]);
  const [orchestrationEvents, setOrchestrationEvents] = React.useState<OrchestrationEvent[]>([]);
  const [sourceContextPlanner, setSourceContextPlanner] = React.useState<SourceContextPlannerState>(
    {
      selectedSourceIds: [],
      sourceDepthOverrides: [],
      budget: { ...defaultSourceContextPlannerBudget },
      preview: null,
      previewLoading: false,
    },
  );
  const [topicPages, setTopicPages] = React.useState<TopicPageSummary[]>([]);
  const [topicDetail, setTopicDetail] = React.useState<TopicPageDetail | null>(null);
  const [topicForm, setTopicForm] = React.useState<TopicPageFormState>(emptyTopicPageForm);
  const [topicFormOpen, setTopicFormOpen] = React.useState(false);
  const [wikiCompileForm, setWikiCompileForm] =
    React.useState<WikiCompileFormState>(emptyWikiCompileForm);
  const [wikiCompileJobs, setWikiCompileJobs] = React.useState<WikiCompileJobSummary[]>([]);
  const [wikiCompileJobEvents, setWikiCompileJobEvents] = React.useState<WikiCompileJobEvent[]>([]);
  const [topicGraphEdges, setTopicGraphEdges] = React.useState<TopicGraphEdge[]>([]);
  const [wikiCompileRunning, setWikiCompileRunning] = React.useState(false);
  const [relatedItems, setRelatedItems] = React.useState<SearchMemoryItem[]>([]);
  const [chatSessions, setChatSessions] = React.useState<ChatSessionSummary[]>([]);
  const [detail, setDetail] = React.useState<MemoryDetail | null>(null);
  const [pdfPreview, setPdfPreview] = React.useState<PdfReaderPreviewState | null>(null);
  const [health, setHealth] = React.useState<EngineHealth | null>(null);
  const [providerSettings, setProviderSettings] = React.useState<ProviderSettings | null>(null);
  const [searchProviderSettings, setSearchProviderSettings] =
    React.useState<SearchProviderSettings | null>(null);
  const [activeEmbeddingModel, setActiveEmbeddingModel] =
    React.useState<ActiveEmbeddingModelSummary | null>(null);
  const [localEmbeddingStatus, setLocalEmbeddingStatus] =
    React.useState<LocalEmbeddingModelStatus | null>(null);
  const [imageGenerationSettings, setImageGenerationSettings] =
    React.useState<ImageGenerationSettings | null>(null);
  const [visionProviderSettings, setVisionProviderSettings] =
    React.useState<VisionProviderSettings | null>(null);
  const [imageGenerationHistory, setImageGenerationHistory] = React.useState<
    ImageGenerationHistoryRecord[]
  >([]);
  const [imageGenerationState, setImageGenerationState] =
    React.useState<ImageGenerationDisplayState>(emptyImageGenerationState);
  const [webSearchHistory, setWebSearchHistory] = React.useState<WebSearchHistoryRecord[]>([]);
  const [webSearchState, setWebSearchState] =
    React.useState<WebSearchViewState>(emptyWebSearchState);
  const [providerLoading, setProviderLoading] = React.useState(false);
  const [providerMessage, setProviderMessage] = React.useState<string | null>(null);
  const [providerMessageTone, setProviderMessageTone] =
    React.useState<ProviderMessageTone>("neutral");
  const [testWorkspaceProgress, setTestWorkspaceProgress] =
    React.useState<TestWorkspaceProgress | null>(null);
  const [testWorkspaceBusy, setTestWorkspaceBusy] = React.useState(false);
  const [testWorkspaceMessage, setTestWorkspaceMessage] = React.useState<string | null>(null);
  const [testWorkspaceMessageTone, setTestWorkspaceMessageTone] =
    React.useState<ProviderMessageTone>("neutral");
  const [testWorkspaceInitializationResult, setTestWorkspaceInitializationResult] =
    React.useState<TestWorkspaceInitializationResult | null>(null);
  const [testWorkspaceCleanupResult, setTestWorkspaceCleanupResult] =
    React.useState<TestWorkspaceCleanupResult | null>(null);
  const [toast, setToast] = React.useState<ToastState | null>(null);
  const [railWidth, setRailWidth] = React.useState(defaultRailWidth);
  const [railTheme, setRailTheme] = React.useState<RailTheme>(defaultRailTheme);
  const [collapsedLauncherPosition, setCollapsedLauncherPosition] =
    React.useState<CollapsedLauncherPosition>(defaultCollapsedLauncherPosition);
  const [collapsedLauncherDragPoint, setCollapsedLauncherDragPoint] =
    React.useState<CollapsedLauncherDragPoint | null>(null);
  const pdfPreviewObjectUrlRef = React.useRef<string | null>(null);
  const detailLoadSequenceRef = React.useRef(0);
  const [viewport, setViewport] = React.useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const railWidthRef = React.useRef(railWidth);
  const collapsedLauncherPositionRef = React.useRef(collapsedLauncherPosition);
  const activeAgentStreamRef = React.useRef<AgentStreamController | null>(null);
  const activeWikiCompileStreamRef = React.useRef<AgentStreamController | null>(null);
  const activeWebSearchStreamRef = React.useRef<WebSearchStreamController | null>(null);
  const activeImageGenerationStreamRef = React.useRef<ImageGenerationStreamController | null>(null);
  const ownerIdRef = React.useRef<string | null>(null);
  const suggestionCooldownRef = React.useRef<Record<string, SessionSuggestionCooldown>>({});
  const knowledgeBaseSearchSequenceRef = React.useRef(0);

  const clearPdfPreview = React.useCallback(() => {
    if (pdfPreviewObjectUrlRef.current !== null) {
      URL.revokeObjectURL(pdfPreviewObjectUrlRef.current);
      pdfPreviewObjectUrlRef.current = null;
    }
    setPdfPreview(null);
  }, []);

  React.useEffect(() => {
    railWidthRef.current = railWidth;
  }, [railWidth]);

  React.useEffect(() => {
    collapsedLauncherPositionRef.current = collapsedLauncherPosition;
  }, [collapsedLauncherPosition]);

  React.useEffect(() => {
    return () => {
      activeAgentStreamRef.current?.close();
      activeWikiCompileStreamRef.current?.close();
      activeWebSearchStreamRef.current?.close();
      activeImageGenerationStreamRef.current?.close();
      if (pdfPreviewObjectUrlRef.current !== null) {
        URL.revokeObjectURL(pdfPreviewObjectUrlRef.current);
        pdfPreviewObjectUrlRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (railState.runtimeStatus === undefined || railState.runtimeStatus.running) return;
    const timer = window.setTimeout(() => {
      dispatch({ type: "CLEAR_RUNTIME_STATUS" });
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [railState.runtimeStatus]);

  React.useEffect(() => {
    if (providerLoading) setProviderMessageTone("neutral");
  }, [providerLoading]);

  const showToast = React.useCallback((next: ToastState) => {
    setToast(next);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const loadHealth = React.useCallback(async () => {
    const next = await requestEngine({ kind: "health" });
    setHealth(next);
    return next;
  }, []);

  const loadProviderSettings = React.useCallback(async () => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      const settings = await requestProvider({ kind: "getProviderSettings" });
      setProviderSettings(settings);
      return true;
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : "Unable to read provider setup.");
      return false;
    } finally {
      setProviderLoading(false);
    }
  }, []);

  const loadSearchProviderSettings = React.useCallback(async () => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      const settings = await requestProvider({ kind: "getSearchProviderSettings" });
      setSearchProviderSettings(settings);
      return true;
    } catch (error) {
      setProviderMessage(
        error instanceof Error ? error.message : "Unable to read search provider setup.",
      );
      return false;
    } finally {
      setProviderLoading(false);
    }
  }, []);

  const loadImageGenerationSettings = React.useCallback(async () => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      const settings = await requestProvider({ kind: "getImageGenerationSettings" });
      setImageGenerationSettings(settings);
      return true;
    } catch (error) {
      setProviderMessage(
        error instanceof Error ? error.message : "Unable to read Image Gen settings.",
      );
      return false;
    } finally {
      setProviderLoading(false);
    }
  }, []);

  const loadVisionProviderSettings = React.useCallback(async () => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      const settings = await requestProvider({ kind: "getVisionProviderSettings" });
      setVisionProviderSettings(settings);
      return true;
    } catch (error) {
      setProviderMessage(
        error instanceof Error ? error.message : "Unable to read Vision provider setup.",
      );
      return false;
    } finally {
      setProviderLoading(false);
    }
  }, []);

  const loadActiveEmbeddingModel = React.useCallback(async () => {
    try {
      const model = await requestEngine({ kind: "getActiveEmbeddingModel" });
      setActiveEmbeddingModel(model);
      return true;
    } catch {
      return false;
    }
  }, []);

  const loadLocalEmbeddingStatus = React.useCallback(async () => {
    try {
      const result = await requestProvider({ kind: "getLocalEmbeddingModelStatus" });
      setLocalEmbeddingStatus(result.status);
      return true;
    } catch (error) {
      setProviderMessageTone("error");
      setProviderMessage(
        error instanceof Error ? error.message : "Unable to read local embedding status.",
      );
      return false;
    }
  }, []);

  const loadWebSearchHistory = React.useCallback(async () => {
    try {
      const result = await requestEngine({ kind: "listWebSearchHistory", limit: 10 });
      setWebSearchHistory(result.items);
    } catch (error) {
      showToast(errorToast(error));
    }
  }, [showToast]);

  const loadImageGenerationHistory = React.useCallback(async () => {
    try {
      const result = await requestEngine({ kind: "listImageGenerationHistory", limit: 20 });
      setImageGenerationHistory(result.items);
    } catch (error) {
      showToast(errorToast(error));
    }
  }, [showToast]);

  const loadWikiCompileJobEvents = React.useCallback(
    async (jobId?: string) => {
      if (jobId === undefined) {
        setWikiCompileJobEvents([]);
        return;
      }
      try {
        const result = await requestEngine({ kind: "listWikiCompileJobEvents", jobId, limit: 40 });
        setWikiCompileJobEvents(result.events);
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [showToast],
  );

  const appendWikiCompileEvent = React.useCallback(
    async (
      jobId: string,
      event: Omit<CreateWikiCompileJobEventPayload, "jobId" | "id" | "createdAt">,
    ) => {
      try {
        await requestEngine({
          kind: "appendWikiCompileJobEvent",
          payload: {
            jobId,
            kind: event.kind,
            level: event.level,
            message: event.message,
            detail: event.detail,
          },
        });
        await loadWikiCompileJobEvents(jobId);
      } catch {
        // Progress events are diagnostic; the compile flow should continue.
      }
    },
    [loadWikiCompileJobEvents],
  );

  const loadSourceContextCompressionLogs = React.useCallback(async (sessionId?: string) => {
    if (sessionId === undefined) {
      setSourceContextCompressionLogs([]);
      return;
    }
    try {
      const result = await requestEngine({
        kind: "listSourceContextCompressionLogs",
        filter: { sessionId, limit: 30 },
      });
      setSourceContextCompressionLogs(result.items);
    } catch {
      setSourceContextCompressionLogs([]);
    }
  }, []);

  const loadSourceContextMapArtifacts = React.useCallback(async (sessionId?: string) => {
    if (sessionId === undefined) {
      setSourceContextMapArtifacts([]);
      return;
    }
    try {
      const result = await requestEngine({
        kind: "listSourceContextMapArtifacts",
        filter: { sessionId, limit: 30 },
      });
      setSourceContextMapArtifacts(result.items);
    } catch {
      setSourceContextMapArtifacts([]);
    }
  }, []);

  const loadSourceContextMapEvents = React.useCallback(async (runId?: string) => {
    if (runId === undefined) {
      setSourceContextMapEvents([]);
      return;
    }
    try {
      const result = await requestEngine({
        kind: "listSourceContextMapEvents",
        runId,
        limit: 40,
      });
      setSourceContextMapEvents(result.events);
    } catch {
      setSourceContextMapEvents([]);
    }
  }, []);

  const loadSourceContextMapRuns = React.useCallback(
    async (sessionId?: string) => {
      if (sessionId === undefined) {
        setSourceContextMapRuns([]);
        setSourceContextMapEvents([]);
        return;
      }
      try {
        const result = await requestEngine({
          kind: "listSourceContextMapRuns",
          filter: { sessionId, limit: 8 },
        });
        setSourceContextMapRuns(result.runs);
        await loadSourceContextMapEvents(result.runs[0]?.id);
      } catch {
        setSourceContextMapRuns([]);
        setSourceContextMapEvents([]);
      }
    },
    [loadSourceContextMapEvents],
  );

  const loadChunkMetaTier2Audit = React.useCallback(async () => {
    try {
      const result = await requestEngine({
        kind: "listChunkMetaTier2Audit",
        filter: { limit: 30 },
      });
      setChunkMetaTier2Audit(result.items);
    } catch {
      setChunkMetaTier2Audit([]);
    }
  }, []);

  const loadOrchestrationEvents = React.useCallback(async (runId?: string) => {
    if (runId === undefined) {
      setOrchestrationEvents([]);
      return;
    }
    try {
      const result = await requestEngine({
        kind: "listOrchestrationEvents",
        runId,
        limit: 40,
      });
      setOrchestrationEvents(result.events);
    } catch {
      setOrchestrationEvents([]);
    }
  }, []);

  const loadOrchestrationRuns = React.useCallback(async () => {
    try {
      const result = await requestEngine({
        kind: "listOrchestrationRuns",
        filter: { kind: "post_capture_job", limit: 8 },
      });
      setOrchestrationRuns(result.runs);
      await loadOrchestrationEvents(result.runs[0]?.id);
    } catch {
      setOrchestrationRuns([]);
      setOrchestrationEvents([]);
    }
  }, [loadOrchestrationEvents]);

  const requestKnowledgeBaseResults = React.useCallback(
    async (nextQuery: string, strength: RetrieveStrength) => {
      const result = await requestEngine({
        kind: "searchKnowledgeBase",
        payload: {
          query: nextQuery,
          mode: knowledgeBaseSearchMode,
          strength,
          limit: 40,
          includeChunks: 2,
          ...(knowledgeBaseRetrieveFilter === undefined
            ? {}
            : { filter: knowledgeBaseRetrieveFilter }),
        },
      });
      return {
        items: result.items.map(toKnowledgeBaseSearchItem),
        bands: result.bands ?? [],
        stages: result.trace.stages ?? [],
        trace: result.trace.relevance,
      };
    },
    [knowledgeBaseRetrieveFilter, knowledgeBaseSearchMode],
  );

  const loadKnowledgeBaseResults = React.useCallback(
    async (nextQuery = railState.query) => {
      const sequence = ++knowledgeBaseSearchSequenceRef.current;
      setKnowledgeBaseSearchLoading(true);
      try {
        const nextResult = await requestKnowledgeBaseResults(
          nextQuery,
          knowledgeBaseStrengthRef.current,
        );
        if (sequence !== knowledgeBaseSearchSequenceRef.current) return;
        setItems(nextResult.items);
        setKnowledgeBaseRelevance({
          bands: nextResult.bands,
          stages: nextResult.stages,
          trace: nextResult.trace,
        });
      } catch (error) {
        if (sequence === knowledgeBaseSearchSequenceRef.current) showToast(errorToast(error));
      } finally {
        if (sequence === knowledgeBaseSearchSequenceRef.current) {
          setKnowledgeBaseSearchLoading(false);
        }
      }
    },
    [railState.query, requestKnowledgeBaseResults, showToast],
  );

  const loadLibrary = React.useCallback(
    async (nextQuery = railState.query, options?: { background?: boolean }) => {
      const background = options?.background === true;
      const searchSequence = ++knowledgeBaseSearchSequenceRef.current;
      if (background) {
        setKnowledgeBaseSearchLoading(false);
        setKnowledgeBaseRefreshLoading(true);
      } else {
        setKnowledgeBaseSearchLoading(true);
        dispatch({ type: "SET_LOADING", loading: true });
      }
      try {
        const [topicResult, wikiJobsResult, nextItems, workingSet, tier2Audit, orchestration] =
          await Promise.all([
            requestEngine({
              kind: "listTopicPages",
              query: nextQuery.trim().length > 0 ? nextQuery : undefined,
              limit: 40,
            }),
            requestEngine({
              kind: "listWikiCompileJobs",
              limit: 8,
            }),
            requestKnowledgeBaseResults(nextQuery, knowledgeBaseStrengthRef.current),
            requestEngine({ kind: "getWorkingSetStatus" }),
            requestEngine({
              kind: "listChunkMetaTier2Audit",
              filter: { limit: 30 },
            }),
            requestEngine({
              kind: "listOrchestrationRuns",
              filter: { kind: "post_capture_job", limit: 8 },
            }),
          ]);
        setTopicPages(topicResult.items);
        setWikiCompileJobs(wikiJobsResult.jobs);
        setWorkingSetStatus(workingSet);
        setChunkMetaTier2Audit(tier2Audit.items);
        setOrchestrationRuns(orchestration.runs);
        await loadOrchestrationEvents(orchestration.runs[0]?.id);
        if (wikiJobsResult.jobs[0] !== undefined) {
          await loadWikiCompileJobEvents(wikiJobsResult.jobs[0].id);
        } else {
          setWikiCompileJobEvents([]);
        }
        if (searchSequence === knowledgeBaseSearchSequenceRef.current) {
          setItems(nextItems.items);
          setKnowledgeBaseRelevance({
            bands: nextItems.bands,
            stages: nextItems.stages,
            trace: nextItems.trace,
          });
        }
      } catch (error) {
        showToast(errorToast(error));
      } finally {
        if (!background && searchSequence === knowledgeBaseSearchSequenceRef.current) {
          setKnowledgeBaseSearchLoading(false);
        }
        if (background) {
          setKnowledgeBaseRefreshLoading(false);
        } else {
          dispatch({ type: "SET_LOADING", loading: false });
        }
      }
    },
    [
      loadOrchestrationEvents,
      loadWikiCompileJobEvents,
      railState.query,
      requestKnowledgeBaseResults,
      showToast,
    ],
  );

  const handleKnowledgeBaseStrengthChange = React.useCallback(
    (nextStrength: RetrieveStrength) => {
      setKnowledgeBaseStrength(nextStrength);
      knowledgeBaseStrengthRef.current = nextStrength;
      const selectedBands =
        nextStrength === "strict"
          ? ["high"]
          : nextStrength === "balanced"
            ? ["high", "medium"]
            : ["high", "medium", "low"];
      const selectedItems = Array.from(
        new Map(
          knowledgeBaseRelevance.bands
            .filter((band) => selectedBands.includes(band.band))
            .flatMap((band) => band.items.map((item) => [item.id, item] as const)),
        ).values(),
      ).slice(0, 40);
      if (knowledgeBaseRelevance.bands.length === 0) return;
      const bandCandidateCount = selectedBands.reduce(
        (total, band) =>
          total +
          (knowledgeBaseRelevance.bands.find((entry) => entry.band === band)?.itemCount ?? 0),
        0,
      );
      const safetyCapped = selectedItems.length < bandCandidateCount;
      setItems(selectedItems.map(toKnowledgeBaseSearchItem));
      setKnowledgeBaseRelevance((current) => ({
        ...current,
        trace:
          current.trace === undefined
            ? current.trace
            : {
                ...current.trace,
                strength: nextStrength,
                selectedBands: selectedBands as RetrieveSourcesRelevanceTrace["selectedBands"],
                selectedCount: selectedItems.length,
                safetyCapped,
              },
        stages: current.stages.map((stage) =>
          stage.id !== "strength_selection"
            ? stage
            : {
                ...stage,
                strategy: `${nextStrength}_bands`,
                outputCount: selectedItems.length,
                droppedCount: Math.max(0, stage.inputCount - selectedItems.length),
                reason: safetyCapped ? "safety_cap" : undefined,
              },
        ),
      }));
    },
    [knowledgeBaseRelevance.bands],
  );

  const pinWorkingSetSource = React.useCallback(
    async (sourceId: string, loadDepth: WorkingSetLoadDepth = "meta") => {
      try {
        const next = await requestEngine({
          kind: "pinWorkingSetSource",
          payload: { sourceId, loadDepth },
        });
        setWorkingSetStatus(next);
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [showToast],
  );

  const evictWorkingSetSource = React.useCallback(
    async (sourceId: string) => {
      try {
        const next = await requestEngine({
          kind: "evictWorkingSetSource",
          payload: { sourceId, reason: "user" },
        });
        setWorkingSetStatus(next);
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [showToast],
  );

  const setWorkingSetSourceDepth = React.useCallback(
    async (sourceId: string, loadDepth: WorkingSetLoadDepth) => {
      try {
        const next = await requestEngine({
          kind: "setWorkingSetSourceDepth",
          payload: { sourceId, loadDepth },
        });
        setWorkingSetStatus(next);
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [showToast],
  );

  const reloadWorkingSetSource = React.useCallback(
    async (sourceId: string, loadDepth?: WorkingSetLoadDepth) => {
      try {
        const next = await requestEngine({
          kind: "reloadWorkingSetSource",
          payload: { sourceId, ...(loadDepth === undefined ? {} : { loadDepth }) },
        });
        setWorkingSetStatus(next);
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [showToast],
  );

  const runChunkMetaTier2Job = React.useCallback(
    async (sourceId: string, maxChunks = 8) => {
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        const queued = await requestEngine({
          kind: "enqueueChunkMetaTier2Job",
          payload: { sourceId, maxChunks },
        });
        const orchestration = await requestEngine({
          kind: "createOrchestrationRun",
          payload: { kind: "post_capture_job", targetJobId: queued.id },
        });
        setOrchestrationRuns((runs) => [orchestration, ...runs].slice(0, 8));
        await loadOrchestrationEvents(orchestration.id);
        const completed = await requestEngine({ kind: "runOrchestration", id: orchestration.id });
        await loadLibrary(railState.query);
        await loadChunkMetaTier2Audit();
        await loadOrchestrationRuns();
        showToast({
          tone: completed.status === "done" ? "success" : "warning",
          message:
            completed.status === "done"
              ? "Tier2 summaries finished. Audit stores summary lengths only."
              : "Tier2 summary job did not finish. Check the audit panel.",
        });
      } catch (error) {
        await loadChunkMetaTier2Audit();
        await loadOrchestrationRuns();
        showToast(errorToast(error));
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    [
      loadChunkMetaTier2Audit,
      loadLibrary,
      loadOrchestrationEvents,
      loadOrchestrationRuns,
      railState.query,
      showToast,
    ],
  );

  const runSourceGraphJob = React.useCallback(
    async (sourceId: string) => {
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        const queued = await requestEngine({
          kind: "enqueueSourceGraphJob",
          payload: { sourceId, mode: "llm" },
        });
        const orchestration = await requestEngine({
          kind: "createOrchestrationRun",
          payload: { kind: "post_capture_job", targetJobId: queued.id },
        });
        setOrchestrationRuns((runs) => [orchestration, ...runs].slice(0, 8));
        await loadOrchestrationEvents(orchestration.id);
        const completed = await requestEngine({ kind: "runOrchestration", id: orchestration.id });
        await loadLibrary(railState.query);
        await loadOrchestrationRuns();
        showToast({
          tone: completed.status === "done" ? "success" : "warning",
          message:
            completed.status === "done"
              ? "Research graph generation finished."
              : "Research graph job did not finish. Check orchestration status.",
        });
      } catch (error) {
        await loadOrchestrationRuns();
        showToast(errorToast(error));
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    [loadLibrary, loadOrchestrationEvents, loadOrchestrationRuns, railState.query, showToast],
  );

  const cancelOrchestrationRun = React.useCallback(
    async (runId: string) => {
      try {
        await requestEngine({ kind: "cancelOrchestrationRun", id: runId });
        await loadOrchestrationRuns();
        showToast({ tone: "warning", message: "Orchestration cancellation requested." });
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [loadOrchestrationRuns, showToast],
  );

  const retryOrchestrationRun = React.useCallback(
    async (runId: string) => {
      try {
        const retry = await requestEngine({ kind: "retryOrchestrationRun", id: runId });
        setOrchestrationRuns((runs) => [retry, ...runs].slice(0, 8));
        await loadOrchestrationEvents(retry.id);
        const completed = await requestEngine({ kind: "runOrchestration", id: retry.id });
        await loadLibrary(railState.query);
        await loadChunkMetaTier2Audit();
        await loadOrchestrationRuns();
        showToast({
          tone: completed.status === "done" ? "success" : "warning",
          message:
            completed.status === "done"
              ? "Orchestration retry finished."
              : "Orchestration retry did not finish.",
        });
      } catch (error) {
        await loadOrchestrationRuns();
        showToast(errorToast(error));
      }
    },
    [
      loadChunkMetaTier2Audit,
      loadLibrary,
      loadOrchestrationEvents,
      loadOrchestrationRuns,
      railState.query,
      showToast,
    ],
  );

  const cancelSourceContextMapRun = React.useCallback(
    async (runId: string) => {
      try {
        await requestEngine({ kind: "cancelSourceContextMapRun", id: runId });
        await loadSourceContextMapRuns(railState.activeSessionId);
        showToast({ tone: "warning", message: "Map scheduler cancellation requested." });
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [loadSourceContextMapRuns, railState.activeSessionId, showToast],
  );

  const retrySourceContextMapRun = React.useCallback(
    async (runId: string) => {
      try {
        const retry = await requestEngine({ kind: "retrySourceContextMapRun", id: runId });
        setSourceContextMapRuns((runs) => [retry, ...runs].slice(0, 8));
        await loadSourceContextMapEvents(retry.id);
        await loadSourceContextMapRuns(railState.activeSessionId);
        showToast({
          tone: "success",
          message: "Map scheduler retry was queued. Start a research run to execute provider work.",
        });
      } catch (error) {
        await loadSourceContextMapRuns(railState.activeSessionId);
        showToast(errorToast(error));
      }
    },
    [loadSourceContextMapEvents, loadSourceContextMapRuns, railState.activeSessionId, showToast],
  );

  const resumeSourceContextMapRun = React.useCallback(
    async (runId: string) => {
      try {
        const resumed = await requestEngine({ kind: "resumeSourceContextMapRun", id: runId });
        setSourceContextMapRuns((runs) =>
          [resumed, ...runs.filter((run) => run.id !== resumed.id)].slice(0, 8),
        );
        await loadSourceContextMapEvents(resumed.id);
        await loadSourceContextMapRuns(railState.activeSessionId);
        showToast({
          tone: "success",
          message: "Map scheduler run is resumable. Start a research run to execute provider work.",
        });
      } catch (error) {
        await loadSourceContextMapRuns(railState.activeSessionId);
        showToast(errorToast(error));
      }
    },
    [loadSourceContextMapEvents, loadSourceContextMapRuns, railState.activeSessionId, showToast],
  );

  const selectSourceContextPlannerSource = React.useCallback((sourceId: string) => {
    setSourceContextPlanner((current) => {
      if (current.selectedSourceIds.includes(sourceId)) return current;
      return {
        ...current,
        selectedSourceIds: [...current.selectedSourceIds, sourceId],
        preview: null,
        previewError: undefined,
      };
    });
  }, []);

  const removeSourceContextPlannerSource = React.useCallback((sourceId: string) => {
    setSourceContextPlanner((current) => ({
      ...current,
      selectedSourceIds: current.selectedSourceIds.filter((id) => id !== sourceId),
      sourceDepthOverrides: current.sourceDepthOverrides.filter(
        (override) => override.sourceId !== sourceId,
      ),
      preview: null,
      previewError: undefined,
    }));
  }, []);

  const setSourceContextPlannerSourceDepth = React.useCallback(
    (sourceId: string, loadDepth: WorkingSetLoadDepth) => {
      setSourceContextPlanner((current) => {
        if (!current.selectedSourceIds.includes(sourceId)) return current;
        return {
          ...current,
          sourceDepthOverrides: [
            ...current.sourceDepthOverrides.filter((override) => override.sourceId !== sourceId),
            { sourceId, loadDepth },
          ],
          preview: null,
          previewError: undefined,
        };
      });
    },
    [],
  );

  const changeSourceContextPlannerBudget = React.useCallback(
    (budget: SourceContextPlannerBudget) => {
      setSourceContextPlanner((current) => ({
        ...current,
        budget,
        preview: null,
        previewError: undefined,
      }));
    },
    [],
  );

  const previewSourceContextPlanner = React.useCallback(
    async (query: string) => {
      const normalizedQuery = normalizeText(query);
      const sourceIds = sourceContextPlanner.selectedSourceIds;
      if (normalizedQuery.length === 0) {
        setSourceContextPlanner((current) => ({
          ...current,
          preview: null,
          previewError: "Enter a research query before previewing.",
        }));
        dispatch({ type: "SET_RUNTIME_STATUS", message: "Enter a research query first" });
        return;
      }
      if (sourceIds.length === 0) {
        setSourceContextPlanner((current) => ({
          ...current,
          preview: null,
          previewError: "Select at least one source before previewing.",
        }));
        dispatch({ type: "SET_RUNTIME_STATUS", message: "Select at least one source first" });
        return;
      }
      setSourceContextPlanner((current) => ({
        ...current,
        previewLoading: true,
        previewError: undefined,
      }));
      const sourceDepthOverrides = sourceContextPlannerDepthOverridesForSelection({
        sourceIds,
        sourceDepthOverrides: sourceContextPlanner.sourceDepthOverrides,
      });
      try {
        const pack = await requestEngine({
          kind: "buildSourceContextPack",
          payload: {
            query: normalizedQuery,
            sourceIds,
            ...(sourceDepthOverrides.length === 0 ? {} : { sourceDepthOverrides }),
            useWorkingSet: false,
            ...sourceContextPlanner.budget,
          },
        });
        setSourceContextPlanner((current) => ({
          ...current,
          preview: pack,
          previewLoading: false,
          previewError: undefined,
        }));
        dispatch({
          type: "SET_RUNTIME_STATUS",
          message: sourceContextPackPreviewSummary(pack),
        });
      } catch (error) {
        setSourceContextPlanner((current) => ({
          ...current,
          preview: null,
          previewLoading: false,
          previewError: error instanceof Error ? error.message : "Preview failed.",
        }));
        showToast(errorToast(error));
      }
    },
    [
      showToast,
      sourceContextPlanner.budget,
      sourceContextPlanner.selectedSourceIds,
      sourceContextPlanner.sourceDepthOverrides,
    ],
  );

  const loadChatHistory = React.useCallback(async () => {
    try {
      const result = await requestEngine({ kind: "listChatSessions", limit: 30 });
      setChatSessions(result.items);
    } catch (error) {
      showToast(errorToast(error));
    }
  }, [showToast]);

  const maybeAttachReplySuggestions = React.useCallback(
    (session: ChatSessionDetail, assistantMessageId: string) => {
      const completedUserTurnCount = countCompletedUserTurns(session.messages);
      const previousCooldown = suggestionCooldownRef.current[session.id];
      const turnsSinceLastSuggestion =
        previousCooldown === undefined
          ? defaultSuggestionCooldown.completedUserTurnsSinceLastSuggestion
          : completedUserTurnCount - previousCooldown.lastSuggestedTurnCount;
      const suggestions = buildReplySuggestionsForSession({
        session,
        assistantMessageId,
        cooldown: {
          completedUserTurnsSinceLastSuggestion: Math.max(0, turnsSinceLastSuggestion),
        },
      });

      suggestionCooldownRef.current[session.id] = {
        completedUserTurnCount,
        lastSuggestedTurnCount:
          suggestions.length === 0
            ? (previousCooldown?.lastSuggestedTurnCount ?? 0)
            : completedUserTurnCount,
      };

      if (suggestions.length === 0) return;
      dispatch({
        type: "SET_REPLY_SUGGESTIONS",
        messageId: assistantMessageId,
        suggestions,
      });
    },
    [],
  );

  const attachActiveRun = React.useCallback(
    (sessionId: string, activeRun: { runId: string; assistantMessageId: string } | undefined) => {
      if (activeRun === undefined) return;
      activeAgentStreamRef.current?.close();
      activeAgentStreamRef.current = subscribeAgentStream(
        {
          runId: activeRun.runId,
          sessionId,
          assistantMessageId: activeRun.assistantMessageId,
        },
        {
          onEvent: (event) => {
            dispatch({ type: "APPLY_AGENT_EVENT", event });
            if (!isTerminalAgentStreamEvent(event)) return;
            activeAgentStreamRef.current = null;
            void requestEngine({ kind: "loadChatSession", sessionId })
              .then((session) => {
                if (session === null) return;
                const nextActiveRun = activeRunFromMessages(session.messages);
                dispatch({
                  type: "LOAD_CHAT_SESSION",
                  sessionId: session.id,
                  messages: session.messages.map(chatMessageToRailMessage),
                  activeRun: nextActiveRun,
                });
                maybeAttachReplySuggestions(session, activeRun.assistantMessageId);
                if (nextActiveRun !== undefined && nextActiveRun.runId !== activeRun.runId) {
                  window.setTimeout(() => attachActiveRun(session.id, nextActiveRun), 0);
                }
                void loadChatHistory();
                void loadSourceContextCompressionLogs(session.id);
                void loadSourceContextMapArtifacts(session.id);
                void loadSourceContextMapRuns(session.id);
              })
              .catch(() => undefined);
          },
          onTransportError: (error) => {
            activeAgentStreamRef.current = null;
            dispatch({
              type: "AGENT_TRANSPORT_ERROR",
              runId: activeRun.runId,
              error,
            });
          },
        },
      );
    },
    [
      loadChatHistory,
      loadSourceContextCompressionLogs,
      loadSourceContextMapArtifacts,
      loadSourceContextMapRuns,
      maybeAttachReplySuggestions,
    ],
  );

  const loadChatSession = React.useCallback(
    async (sessionId: string) => {
      const ownerId = ownerIdRef.current ?? (await getRailOwnerId());
      ownerIdRef.current = ownerId;
      if (railState.activeSessionId !== undefined && railState.activeSessionId !== sessionId) {
        void requestEngine({
          kind: "releaseChatSession",
          sessionId: railState.activeSessionId,
          ownerId,
        }).catch(() => undefined);
      }
      const lease = await requestEngine({ kind: "claimChatSession", sessionId, ownerId });
      if (lease.status === "already_open") {
        showToast({ tone: "warning", message: "This conversation is already open elsewhere." });
        return;
      }
      const session = await requestEngine({ kind: "loadChatSession", sessionId });
      if (session === null) {
        showToast({ tone: "warning", message: "Conversation was not found." });
        return;
      }
      await saveActiveSessionId(railState.activePageContext, sessionId);
      dispatch({
        type: "LOAD_CHAT_SESSION",
        sessionId,
        messages: session.messages.map(chatMessageToRailMessage),
        activeRun: activeRunFromMessages(session.messages),
      });
      attachActiveRun(sessionId, activeRunFromMessages(session.messages));
    },
    [attachActiveRun, railState.activePageContext, railState.activeSessionId, showToast],
  );

  React.useEffect(() => {
    void loadSourceContextCompressionLogs(railState.activeSessionId);
    void loadSourceContextMapArtifacts(railState.activeSessionId);
    void loadSourceContextMapRuns(railState.activeSessionId);
  }, [
    loadSourceContextCompressionLogs,
    loadSourceContextMapArtifacts,
    loadSourceContextMapRuns,
    railState.activeSessionId,
  ]);

  const openHome = React.useCallback(async () => {
    setDetail(null);
    dispatch({ type: "OPEN_HOME" });
    try {
      await loadHealth();
    } catch (error) {
      showToast(errorToast(error));
    }
  }, [loadHealth, showToast]);

  const openKnowledgeBase = React.useCallback(
    async (query?: string, highlightedMemoryId?: string) => {
      setDetail(null);
      dispatch({ type: "SHOW_KNOWLEDGE_BASE", query, highlightedMemoryId });
      try {
        await loadHealth();
        await loadLibrary(query ?? railState.query);
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [loadHealth, loadLibrary, railState.query, showToast],
  );

  const openResearchPlanner = React.useCallback(async () => {
    setDetail(null);
    clearPdfPreview();
    dispatch({ type: "SHOW_RESEARCH_PLANNER" });
    try {
      await loadHealth();
      await loadLibrary(railState.query);
    } catch (error) {
      showToast(errorToast(error));
    }
  }, [clearPdfPreview, loadHealth, loadLibrary, railState.query, showToast]);

  const openWebSearch = React.useCallback(() => {
    setDetail(null);
    dispatch({ type: "SHOW_WEB_SEARCH" });
    void loadWebSearchHistory();
  }, [loadWebSearchHistory]);

  const openImageGen = React.useCallback(
    (prompt?: string) => {
      setDetail(null);
      dispatch({
        type: "SHOW_IMAGE_GEN",
        prompt,
        idSeed: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      });
      void loadImageGenerationSettings();
      void loadImageGenerationHistory();
    },
    [loadImageGenerationHistory, loadImageGenerationSettings],
  );

  const openSettings = React.useCallback(() => {
    setDetail(null);
    dispatch({ type: "SHOW_SETTINGS" });
    void loadProviderSettings();
    void loadSearchProviderSettings();
    void loadImageGenerationSettings();
    void loadVisionProviderSettings();
    void loadActiveEmbeddingModel();
    void loadLocalEmbeddingStatus();
  }, [
    loadActiveEmbeddingModel,
    loadImageGenerationSettings,
    loadLocalEmbeddingStatus,
    loadProviderSettings,
    loadSearchProviderSettings,
    loadVisionProviderSettings,
  ]);

  const refreshSettingsProviders = React.useCallback(async () => {
    const providerOk = await loadProviderSettings();
    const searchOk = await loadSearchProviderSettings();
    const imageOk = await loadImageGenerationSettings();
    const visionOk = await loadVisionProviderSettings();
    const activeEmbeddingOk = await loadActiveEmbeddingModel();
    const localEmbeddingOk = await loadLocalEmbeddingStatus();
    return providerOk && searchOk && imageOk && visionOk && activeEmbeddingOk && localEmbeddingOk;
  }, [
    loadActiveEmbeddingModel,
    loadImageGenerationSettings,
    loadLocalEmbeddingStatus,
    loadProviderSettings,
    loadSearchProviderSettings,
    loadVisionProviderSettings,
  ]);

  const changeRailTheme = React.useCallback((theme: RailTheme) => {
    setRailTheme(theme);
    void saveRailThemePreference(theme).catch(() => undefined);
  }, []);

  const selectProvider = React.useCallback(async (provider: ProviderId) => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      const settings = await requestProvider({ kind: "setActiveProvider", provider });
      setProviderSettings(settings);
      setProviderMessage(`${providerLabel(provider)} selected.`);
      return true;
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : "Unable to switch provider.");
      return false;
    } finally {
      setProviderLoading(false);
    }
  }, []);

  const saveGeminiProvider = React.useCallback(async (input: SaveGeminiProviderInput) => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      const settings = await requestProvider({
        kind: "saveGeminiProvider",
        apiKey: input.apiKey,
        model: input.model,
      });
      setProviderSettings(settings);
      setProviderMessage("Gemini provider saved.");
      return true;
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : "Unable to save provider.");
      return false;
    } finally {
      setProviderLoading(false);
    }
  }, []);

  const testGeminiProvider = React.useCallback(
    async (input: { apiKey?: string; model?: string }) => {
      setProviderLoading(true);
      setProviderMessage(null);
      try {
        await requestProvider({
          kind: "testGeminiProvider",
          apiKey: input.apiKey,
          model: input.model,
        });
        await loadProviderSettings();
        setProviderMessageTone("success");
        setProviderMessage("Gemini connection works.");
        return true;
      } catch (error) {
        setProviderMessageTone("error");
        setProviderMessage(
          error instanceof Error ? error.message : "Gemini connection test failed.",
        );
        return false;
      } finally {
        setProviderLoading(false);
      }
    },
    [loadProviderSettings],
  );

  const saveOpenAIProvider = React.useCallback(async (input: SaveOpenAIProviderInput) => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      const settings = await requestProvider({
        kind: "saveOpenAIProvider",
        apiKey: input.apiKey,
        model: input.model,
        baseUrl: input.baseUrl,
      });
      setProviderSettings(settings);
      setProviderMessage("OpenAI provider saved.");
      return true;
    } catch (error) {
      setProviderMessage(error instanceof Error ? error.message : "Unable to save provider.");
      return false;
    } finally {
      setProviderLoading(false);
    }
  }, []);

  const testOpenAIProvider = React.useCallback(
    async (input: { apiKey?: string; model?: string; baseUrl?: string }) => {
      setProviderLoading(true);
      setProviderMessage(null);
      try {
        await requestProvider({
          kind: "testOpenAIProvider",
          apiKey: input.apiKey,
          model: input.model,
          baseUrl: input.baseUrl,
        });
        await loadProviderSettings();
        setProviderMessageTone("success");
        setProviderMessage("OpenAI connection works.");
        return true;
      } catch (error) {
        setProviderMessageTone("error");
        setProviderMessage(
          error instanceof Error ? error.message : "OpenAI connection test failed.",
        );
        return false;
      } finally {
        setProviderLoading(false);
      }
    },
    [loadProviderSettings],
  );

  const saveOpenAICompatibleProvider = React.useCallback(
    async (input: SaveOpenAICompatibleProviderInput) => {
      setProviderLoading(true);
      setProviderMessage(null);
      try {
        const settings = await requestProvider({
          kind: "saveOpenAICompatibleProvider",
          apiKey: input.apiKey,
          model: input.model,
          baseUrl: input.baseUrl,
          providerName: input.providerName,
        });
        setProviderSettings(settings);
        setProviderMessage("OpenAI-compatible provider saved.");
        return true;
      } catch (error) {
        setProviderMessage(error instanceof Error ? error.message : "Unable to save provider.");
        return false;
      } finally {
        setProviderLoading(false);
      }
    },
    [],
  );

  const saveSearchProvider = React.useCallback(async (input: SaveSearchProviderInput) => {
    setProviderLoading(true);
    setProviderMessage(null);
    try {
      const settings = await requestProvider({
        kind: "saveSearchProviderSettings",
        provider: input.provider,
        openai: input.openai,
        openaiCompatible: input.openaiCompatible,
      });
      setSearchProviderSettings(settings);
      setProviderMessage("Search provider saved.");
      return true;
    } catch (error) {
      setProviderMessage(
        error instanceof Error ? error.message : "Unable to save search provider.",
      );
      return false;
    } finally {
      setProviderLoading(false);
    }
  }, []);

  const saveImageGenerationSettings = React.useCallback(
    async (input: SaveImageGenerationSettingsInput) => {
      setProviderLoading(true);
      setProviderMessage(null);
      try {
        const settings = await requestProvider({
          kind: "saveImageGenerationSettings",
          settings: input,
        });
        setImageGenerationSettings(settings);
        setProviderMessage("Image Gen settings saved.");
        return true;
      } catch (error) {
        setProviderMessage(
          error instanceof Error ? error.message : "Unable to save Image Gen settings.",
        );
        return false;
      } finally {
        setProviderLoading(false);
      }
    },
    [],
  );

  const saveVisionProviderSettings = React.useCallback(
    async (input: SaveVisionProviderSettingsInput) => {
      setProviderLoading(true);
      setProviderMessage(null);
      setProviderMessageTone("neutral");
      try {
        const settings = await requestProvider({
          kind: "saveVisionProviderSettings",
          settings: input,
        });
        setVisionProviderSettings(settings);
        setProviderMessageTone("success");
        setProviderMessage("Vision provider saved.");
        return true;
      } catch (error) {
        setProviderMessageTone("error");
        setProviderMessage(
          error instanceof Error ? error.message : "Unable to save Vision provider.",
        );
        return false;
      } finally {
        setProviderLoading(false);
      }
    },
    [],
  );

  const runLocalEmbeddingAction = React.useCallback(
    async (
      request: Exclude<LocalEmbeddingModelRequest, { kind: "getLocalEmbeddingModelStatus" }>,
    ) => {
      setProviderLoading(true);
      setProviderMessage(null);
      setProviderMessageTone("neutral");
      try {
        const result = await requestProvider(request);
        setLocalEmbeddingStatus(result.status);
        if (request.kind === "authorizeLocalEmbeddingReindex") {
          await loadActiveEmbeddingModel();
        }
        setProviderMessageTone(
          result.status.error !== undefined
            ? "error"
            : result.status.state === "downloading" ||
                result.status.state === "verifying" ||
                result.status.state === "loading"
              ? "neutral"
              : "success",
        );
        setProviderMessage(localEmbeddingActionMessage(request.kind, result.status));
        return true;
      } catch (error) {
        setProviderMessageTone("error");
        setProviderMessage(
          error instanceof Error ? error.message : "Local embedding action failed.",
        );
        await loadLocalEmbeddingStatus();
        return false;
      } finally {
        setProviderLoading(false);
      }
    },
    [loadActiveEmbeddingModel, loadLocalEmbeddingStatus],
  );

  const createTestWorkspaceDependencies = React.useCallback(
    (): TestWorkspaceRunnerDependencies => ({
      getEmbeddingStatus: async () => {
        const result = await requestProvider({ kind: "getLocalEmbeddingModelStatus" });
        setLocalEmbeddingStatus(result.status);
        return result.status;
      },
      installEmbeddingModel: async () => {
        const result = await requestProvider({
          kind: "installLocalEmbeddingModel",
          modelId: recommendedLocalEmbeddingModelManifest.modelId,
        });
        setLocalEmbeddingStatus(result.status);
        return result.status;
      },
      authorizeEmbeddingReindex: async () => {
        const result = await requestProvider({
          kind: "authorizeLocalEmbeddingReindex",
          modelId: recommendedLocalEmbeddingModelManifest.modelId,
        });
        setLocalEmbeddingStatus(result.status);
        return result.status;
      },
      capturePage: (payload) => requestEngine({ kind: "capturePage", payload }),
      captureSelection: (payload) => requestEngine({ kind: "captureSelection", payload }),
      captureMarkdown: (payload) => requestEngine({ kind: "captureMarkdown", payload }),
      capturePdf: (payload) => requestEngine({ kind: "capturePdf", payload }),
      listMemories: (limit) => requestEngine({ kind: "listMemories", limit }),
      deleteMemory: (id) => requestEngine({ kind: "deleteMemory", id }),
      fetchAsset: async (assetPath) => {
        const response = await fetch(chrome.runtime.getURL(assetPath));
        if (!response.ok) {
          throw new Error(`Unable to load staged test asset (${response.status}).`);
        }
        return await response.arrayBuffer();
      },
      onProgress: setTestWorkspaceProgress,
    }),
    [],
  );

  const initializeLocalTestWorkspace = React.useCallback(async () => {
    if (testWorkspaceBuildConfig === null || testWorkspaceBusy) return;
    setTestWorkspaceBusy(true);
    setTestWorkspaceMessage(null);
    setTestWorkspaceMessageTone("neutral");
    setTestWorkspaceInitializationResult(null);
    setTestWorkspaceCleanupResult(null);
    try {
      const result = await initializeTestWorkspace(
        testWorkspaceBuildConfig,
        createTestWorkspaceDependencies(),
      );
      setTestWorkspaceInitializationResult(result);
      setTestWorkspaceMessageTone(result.status === "completed" ? "success" : "error");
      setTestWorkspaceMessage(
        result.status === "completed"
          ? `Test workspace ready: ${result.saved} saved, ${result.duplicates} already present.`
          : `Test workspace partially ready: ${result.failed} of ${result.total} imports failed.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to initialize the test workspace.";
      setTestWorkspaceProgress((current) => ({
        phase: "failed",
        completed: current?.completed ?? 0,
        total: Math.max(1, current?.total ?? 1),
        message,
      }));
      setTestWorkspaceMessageTone("error");
      setTestWorkspaceMessage(message);
    } finally {
      await Promise.all([loadLibrary(""), loadLocalEmbeddingStatus(), loadActiveEmbeddingModel()]);
      setTestWorkspaceBusy(false);
    }
  }, [
    createTestWorkspaceDependencies,
    loadActiveEmbeddingModel,
    loadLibrary,
    loadLocalEmbeddingStatus,
    testWorkspaceBusy,
  ]);

  const removeLocalTestWorkspace = React.useCallback(async () => {
    if (testWorkspaceBuildConfig === null || testWorkspaceBusy) return;
    setTestWorkspaceBusy(true);
    setTestWorkspaceMessage(null);
    setTestWorkspaceMessageTone("neutral");
    setTestWorkspaceInitializationResult(null);
    setTestWorkspaceCleanupResult(null);
    setTestWorkspaceProgress({
      phase: "removing_sources",
      completed: 0,
      total: 1,
      message: "Finding test workspace sources.",
    });
    try {
      const result = await removeTestWorkspaceSources(
        testWorkspaceBuildConfig,
        createTestWorkspaceDependencies(),
      );
      setTestWorkspaceCleanupResult(result);
      setTestWorkspaceProgress({
        phase: "removing_sources",
        completed: Math.max(1, result.matched),
        total: Math.max(1, result.matched),
        message:
          result.failed === 0
            ? `Removed ${result.deleted} test sources.`
            : `Removed ${result.deleted} test sources; ${result.failed} deletions failed.`,
      });
      setTestWorkspaceMessageTone(result.failed === 0 ? "success" : "error");
      setTestWorkspaceMessage(
        result.failed === 0
          ? `Removed ${result.deleted} test sources. Other Knowledge Base data was preserved.`
          : `Removed ${result.deleted} test sources; ${result.failed} deletions failed.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to remove test data.";
      setTestWorkspaceProgress({
        phase: "failed",
        completed: 0,
        total: 1,
        message,
      });
      setTestWorkspaceMessageTone("error");
      setTestWorkspaceMessage(message);
    } finally {
      await loadLibrary("");
      setTestWorkspaceBusy(false);
    }
  }, [createTestWorkspaceDependencies, loadLibrary, testWorkspaceBusy]);

  const testOpenAICompatibleProvider = React.useCallback(
    async (input: { apiKey?: string; model?: string; baseUrl?: string; providerName?: string }) => {
      setProviderLoading(true);
      setProviderMessage(null);
      try {
        await requestProvider({
          kind: "testOpenAICompatibleProvider",
          apiKey: input.apiKey,
          model: input.model,
          baseUrl: input.baseUrl,
          providerName: input.providerName,
        });
        await loadProviderSettings();
        setProviderMessageTone("success");
        setProviderMessage("OpenAI-compatible connection works.");
        return true;
      } catch (error) {
        setProviderMessageTone("error");
        setProviderMessage(
          error instanceof Error ? error.message : "OpenAI-compatible connection test failed.",
        );
        return false;
      } finally {
        setProviderLoading(false);
      }
    },
    [loadProviderSettings],
  );

  const saveSelectionSnapshot = React.useCallback(
    async (snapshot: SelectionSnapshot) => {
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        const result = await requestEngine({
          kind: "captureSelection",
          payload: selectionSnapshotToCapturePayload(snapshot),
        });
        setDetail(null);
        dispatch({
          type: "SHOW_KNOWLEDGE_BASE",
          query: "",
          highlightedMemoryId: result.memory.id,
        });
        await loadLibrary("");
        showToast({
          tone: result.status === "duplicate" ? "warning" : "success",
          message:
            result.status === "duplicate"
              ? "This selection is already in Clio."
              : "Selection saved to Clio.",
        });
      } catch (error) {
        showToast(errorToast(error));
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    [loadLibrary, showToast],
  );

  const saveSelectionFromAgentHome = React.useCallback(async () => {
    const liveSnapshot = readLiveSelectionSnapshot(readPageContext());
    const snapshot = liveSnapshot ?? railState.selectionSnapshot;
    if (snapshot === undefined || normalizeText(snapshot.text).length === 0) {
      showToast({
        tone: "warning",
        message: "Select text on the page before saving.",
      });
      return;
    }
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const result = await requestEngine({
        kind: "captureSelection",
        payload: selectionSnapshotToCapturePayload(snapshot),
      });
      setDetail(null);
      dispatch({ type: "SET_HIGHLIGHT", memoryId: result.memory.id });
      dispatch({ type: "OPEN_HOME" });
      showToast({
        tone: result.status === "duplicate" ? "warning" : "success",
        message:
          result.status === "duplicate"
            ? "This selection is already in Clio."
            : "Selection saved to Clio.",
      });
    } catch (error) {
      showToast(errorToast(error));
    } finally {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, [railState.selectionSnapshot, showToast]);

  const saveSelection = React.useCallback(async () => {
    const liveSnapshot = readLiveSelectionSnapshot(readPageContext());
    const snapshot = liveSnapshot ?? railState.selectionSnapshot;
    if (snapshot === undefined || normalizeText(snapshot.text).length === 0) {
      showToast({
        tone: "warning",
        message: "Select text on the page before saving.",
      });
      return;
    }
    await saveSelectionSnapshot(snapshot);
  }, [railState.selectionSnapshot, saveSelectionSnapshot, showToast]);

  const savePage = React.useCallback(async () => {
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const currentPage = readPageContext();
      const extracted = extractReadablePage();
      const result = await requestEngine({
        kind: "capturePage",
        payload: {
          sourceUrl: currentPage.url,
          sourceTitle: extracted.title || currentPage.title,
          normalizedText: extracted.text,
          capturedAt: new Date().toISOString(),
          metadata: {
            byline: extracted.byline,
            length: extracted.text.length,
            extractionRatio: extracted.ratio,
          },
        },
      });
      setDetail(null);
      dispatch({
        type: "SHOW_KNOWLEDGE_BASE",
        query: "",
        highlightedMemoryId: result.memory.id,
      });
      await loadLibrary("");
      showToast({
        tone: result.status === "duplicate" ? "warning" : "success",
        message:
          result.status === "duplicate" ? "This page is already in Clio." : "Page saved to Clio.",
      });
    } catch (error) {
      showToast(errorToast(error));
    } finally {
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, [loadLibrary, showToast]);

  const uploadKnowledgeFiles = React.useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const uploadItems = files.flatMap((file) => {
        const kind = knowledgeUploadKindForFile(file);
        return kind === null ? [] : [{ file, kind }];
      });
      const unsupportedCount = files.length - uploadItems.length;

      if (uploadItems.length === 0) {
        showToast({
          tone: "warning",
          message: "Choose PDF or Markdown files to import.",
        });
        return;
      }

      dispatch({ type: "SET_LOADING", loading: true });
      let savedCount = 0;
      let duplicateCount = 0;
      let failedCount = 0;
      let firstFailure: string | undefined;
      let highlightedMemoryId: string | undefined;

      try {
        for (const { file, kind } of uploadItems) {
          try {
            const capturedAt = new Date().toISOString();
            const sourceUrl = uploadSourceUrlForFile(file);
            const sourceTitle = uploadSourceTitleForFile(file, kind);
            const metadata = uploadMetadataForFile(file, kind);
            const result =
              kind === "pdf"
                ? await requestEngine({
                    kind: "capturePdf",
                    payload: {
                      sourceUrl,
                      sourceTitle,
                      bytes: await file.arrayBuffer(),
                      capturedAt,
                      metadata,
                    },
                  })
                : await requestEngine({
                    kind: "captureMarkdown",
                    payload: {
                      sourceUrl,
                      sourceTitle,
                      markdownText: await file.text(),
                      capturedAt,
                      metadata,
                    },
                  });

            highlightedMemoryId = result.memory.id;
            if (result.status === "duplicate") {
              duplicateCount += 1;
            } else {
              savedCount += 1;
            }
          } catch (error) {
            failedCount += 1;
            if (firstFailure === undefined) {
              firstFailure =
                error instanceof Error
                  ? `${file.name}: ${error.message}`
                  : `${file.name}: import failed`;
            }
          }
        }

        if (highlightedMemoryId !== undefined) {
          setDetail(null);
          dispatch({
            type: "SHOW_KNOWLEDGE_BASE",
            query: "",
            highlightedMemoryId,
          });
          await loadLibrary("");
        }

        if (savedCount === 0 && duplicateCount === 0 && failedCount > 0) {
          showToast({
            tone: "error",
            message: firstFailure ?? "File import failed.",
          });
          return;
        }

        showToast({
          tone: failedCount > 0 || unsupportedCount > 0 ? "warning" : "success",
          message: uploadSummaryMessage({
            savedCount,
            duplicateCount,
            unsupportedCount,
            failedCount,
          }),
        });
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    [loadLibrary, showToast],
  );

  const searchSelection = React.useCallback(async () => {
    const selectedText = normalizeText(
      readCurrentSelection()?.text ?? railState.selectionSnapshot?.text ?? "",
    );
    if (selectedText.length === 0) return;
    await openKnowledgeBase(selectedText);
  }, [openKnowledgeBase, railState.selectionSnapshot?.text]);

  const openRelatedFromToolbox = React.useCallback(async () => {
    const selectedText = normalizeText(
      readCurrentSelection()?.text ?? railState.selectionSnapshot?.text ?? "",
    );
    const query =
      selectedText.length > 0
        ? selectedText
        : buildRelatedMemoryQuery({
            activePageContext: railState.activePageContext,
            liveSelectionText: undefined,
            selectionSnapshot: undefined,
            readableText: "",
          });
    await openKnowledgeBase(query);
  }, [openKnowledgeBase, railState.activePageContext, railState.selectionSnapshot?.text]);

  const askSelection = React.useCallback(() => {
    const liveSnapshot = readLiveSelectionSnapshot(readPageContext());
    const snapshot = liveSnapshot ?? railState.selectionSnapshot;
    if (snapshot === undefined || normalizeText(snapshot.text).length === 0) {
      showToast({
        tone: "warning",
        message: "Select text on the page before asking.",
      });
      return;
    }
    if (liveSnapshot !== null) {
      dispatch({
        type: "ATTACH_SELECTION_TO_COMPOSER",
        snapshot: liveSnapshot,
        idSeed: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      });
    }
    dispatch({
      type: "PREFILL_COMPOSER",
      content: "Explain this selection",
      idSeed: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    });
  }, [railState.selectionSnapshot, showToast]);

  const addSelectionToComposer = React.useCallback(async () => {
    const snapshot = readLiveSelectionSnapshot(readPageContext());
    if (snapshot === null || normalizeText(snapshot.text).length === 0) {
      showToast({
        tone: "warning",
        message: "Select text on the page before adding it.",
      });
      return;
    }
    dispatch({
      type: "ATTACH_SELECTION_TO_COMPOSER",
      snapshot,
      idSeed: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    });
    await openHome();
  }, [openHome, showToast]);

  const noteSelection = React.useCallback(() => {
    showToast({
      tone: "warning",
      message: "Selection notes are not connected yet.",
    });
  }, [showToast]);

  const openCommandPalette = React.useCallback(async () => {
    if (railState.mode === "collapsed") {
      await openHome();
    }
    dispatch({ type: "OPEN_COMMAND_PALETTE" });
  }, [openHome, railState.mode]);

  const toggleCommandPalette = React.useCallback(() => {
    dispatch({ type: "TOGGLE_COMMAND_PALETTE" });
  }, []);

  const openChatHistory = React.useCallback(() => {
    dispatch({ type: "SHOW_CHAT_HISTORY" });
    void loadChatHistory();
  }, [loadChatHistory]);

  const openClioFromMiniUi = React.useCallback(async () => {
    await openHome();
  }, [openHome]);

  const openDetail = React.useCallback(
    async (id: string) => {
      const loadSequence = detailLoadSequenceRef.current + 1;
      detailLoadSequenceRef.current = loadSequence;
      clearPdfPreview();
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        const next = await requestEngine({ kind: "getMemory", id });
        if (detailLoadSequenceRef.current !== loadSequence) return;
        setDetail(next);
        dispatch({ type: "SHOW_DETAIL", memoryId: id });
        dispatch({ type: "SET_LOADING", loading: false });
        if (!memoryHasPersistedPdfRawFile(next)) return;

        setPdfPreview({ memoryId: id, status: "loading" });
        try {
          const raw = await requestEngine({ kind: "getPdfRawFile", id });
          if (detailLoadSequenceRef.current !== loadSequence) return;
          const objectUrl = URL.createObjectURL(
            new Blob([pdfRawBytesToBlobPart(raw.bytes)], { type: raw.contentType }),
          );
          if (pdfPreviewObjectUrlRef.current !== null) {
            URL.revokeObjectURL(pdfPreviewObjectUrlRef.current);
          }
          pdfPreviewObjectUrlRef.current = objectUrl;
          setPdfPreview({
            memoryId: raw.memoryId,
            status: "ready",
            objectUrl,
            byteLength: raw.byteLength,
            contentType: raw.contentType,
          });
        } catch (error) {
          if (detailLoadSequenceRef.current !== loadSequence) return;
          const toast = errorToast(error);
          setPdfPreview({
            memoryId: id,
            status: toast.tone === "warning" ? "unavailable" : "error",
            message: toast.message,
          });
        }
      } catch (error) {
        if (detailLoadSequenceRef.current !== loadSequence) return;
        showToast(errorToast(error));
      } finally {
        if (detailLoadSequenceRef.current === loadSequence) {
          dispatch({ type: "SET_LOADING", loading: false });
        }
      }
    },
    [clearPdfPreview, showToast],
  );

  const openTopicDetail = React.useCallback(
    async (id: string) => {
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        const next = await requestEngine({ kind: "getTopicPage", id });
        if (next === null) {
          showToast({ tone: "warning", message: "Topic page was not found." });
          await loadLibrary(railState.query);
          return;
        }
        const edges = await requestEngine({
          kind: "listTopicGraphEdges",
          topicId: id,
        });
        setTopicDetail(next);
        setTopicForm(topicDetailToForm(next));
        setWikiCompileForm(topicDetailToWikiCompileForm(next));
        setTopicGraphEdges(edges.edges);
        setTopicFormOpen(false);
      } catch (error) {
        showToast(errorToast(error));
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    [loadLibrary, railState.query, showToast],
  );

  const createTopicPage = React.useCallback(async () => {
    setTopicDetail(null);
    setTopicForm(emptyTopicPageForm);
    setWikiCompileForm(emptyWikiCompileForm);
    setTopicGraphEdges([]);
    setTopicFormOpen(true);
  }, []);

  const editTopicPage = React.useCallback((page: TopicPageDetail) => {
    setTopicDetail(page);
    setTopicForm(topicDetailToForm(page));
    setTopicFormOpen(true);
  }, []);

  const saveTopicPage = React.useCallback(
    async (form: TopicPageFormState, id?: string) => {
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        const next =
          id === undefined
            ? await requestEngine({
                kind: "createTopicPage",
                payload: createTopicPayloadFromForm(form),
              })
            : await requestEngine({
                kind: "updateTopicPage",
                id,
                payload: updateTopicPayloadFromForm(form),
              });
        if (next === null) {
          showToast({ tone: "warning", message: "Topic page was not found." });
          return;
        }
        setTopicDetail(next);
        setTopicForm(topicDetailToForm(next));
        setWikiCompileForm(topicDetailToWikiCompileForm(next));
        const edges = await requestEngine({
          kind: "listTopicGraphEdges",
          topicId: next.id,
        });
        setTopicGraphEdges(edges.edges);
        setTopicFormOpen(false);
        await loadLibrary(railState.query);
        showToast({ tone: "success", message: "Topic page saved." });
      } catch (error) {
        showToast(errorToast(error));
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    [loadLibrary, railState.query, showToast],
  );

  const deleteTopicPage = React.useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this Clio topic page? Source memories are kept.")) return;
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        await requestEngine({ kind: "deleteTopicPage", id });
        setTopicDetail(null);
        setTopicForm(emptyTopicPageForm);
        setWikiCompileForm(emptyWikiCompileForm);
        setTopicGraphEdges([]);
        setTopicFormOpen(false);
        await loadLibrary(railState.query);
        showToast({ tone: "success", message: "Topic page deleted." });
      } catch (error) {
        showToast(errorToast(error));
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    [loadLibrary, railState.query, showToast],
  );

  const deleteMemory = React.useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this local Clio memory? This cannot be undone.")) return;
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        await requestEngine({ kind: "deleteMemory", id });
        setDetail(null);
        dispatch({ type: "SHOW_KNOWLEDGE_BASE" });
        await loadLibrary(railState.query);
        showToast({ tone: "success", message: "Memory deleted." });
      } catch (error) {
        showToast(errorToast(error));
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    [loadLibrary, railState.query, showToast],
  );

  const openSource = React.useCallback(
    async (memory: MemoryDetail) => {
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        const currentPage = readPageContext();
        if (memory.anchor !== undefined && sourceUrlsMatch(memory.sourceUrl, currentPage.url)) {
          if (highlightAnchor(memory.anchor)) {
            showToast({ tone: "success", message: "Source passage highlighted." });
            return;
          }
        }

        if (memory.anchor !== undefined) {
          void storePendingHighlightFromAnchor(memory.anchor, memory).catch(() => undefined);
        } else {
          void clearPendingHighlight().catch(() => undefined);
        }
        window.open(
          memory.anchor?.textFragment ?? memory.sourceUrl,
          "_blank",
          "noopener,noreferrer",
        );

        const result = await requestEngine({ kind: "resolveAnchor", memoryId: memory.id });
        await storePendingHighlight(result, memory);
        const hasAnchor = result.anchor !== undefined || memory.anchor !== undefined;
        showToast({
          tone: hasAnchor ? "success" : "warning",
          message: hasAnchor
            ? "Opened source. Clio will try to highlight the saved passage there."
            : "Opened source. This memory has no saved anchor yet.",
        });
      } catch (error) {
        showToast(errorToast(error));
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    [showToast],
  );

  const openTopicSource = React.useCallback(
    async (memoryId: string) => {
      try {
        const memory = await requestEngine({ kind: "getMemory", id: memoryId });
        if (memory === null) {
          showToast({ tone: "warning", message: "Source memory was not found." });
          return;
        }
        await openSource(memory);
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [openSource, showToast],
  );

  const compileTopicWithAI = React.useCallback(
    async (form: WikiCompileFormState, topicId?: string) => {
      const query = normalizeText(form.query);
      if (query.length === 0) {
        showToast({ tone: "warning", message: "Enter a topic query before compiling." });
        return;
      }
      if (activeWikiCompileStreamRef.current !== null || wikiCompileRunning) {
        showToast({ tone: "warning", message: "Wait for the current Wiki compile to finish." });
        return;
      }

      setWikiCompileRunning(true);
      dispatch({ type: "SET_LOADING", loading: true });
      let job: WikiCompileJobSummary | null = null;
      try {
        const candidates =
          topicId !== undefined && topicDetail?.sourceRefs.length
            ? topicDetail.sourceRefs.map((ref) => ref.memoryId)
            : [];
        job = await requestEngine({
          kind: "enqueueWikiCompile",
          payload: createWikiCompilePayloadFromForm(form, topicId, candidates),
        });
        setWikiCompileJobs((jobs) => [job as WikiCompileJobSummary, ...jobs].slice(0, 8));
        await loadWikiCompileJobEvents(job.id);
        const claimed = await requestEngine({ kind: "claimNextWikiCompileJob", id: job.id });
        if (claimed === null || claimed.id !== job.id) {
          await loadWikiCompileJobEvents(job.id);
          showToast({ tone: "warning", message: "Wiki compile was queued." });
          await loadLibrary(railState.query);
          setWikiCompileRunning(false);
          dispatch({ type: "SET_LOADING", loading: false });
          return;
        }
        job = claimed;
        setWikiCompileJobs((jobs) => [claimed, ...jobs.filter((item) => item.id !== claimed.id)]);
        await loadWikiCompileJobEvents(claimed.id);

        const sourceMemoryIds =
          claimed.sourceMemoryIds.length > 0
            ? claimed.sourceMemoryIds
            : (await requestEngine({ kind: "searchMemory", query, limit: 8 })).items.map(
                (item) => item.id,
              );
        const evidenceWindows = await requestEngine({
          kind: "getMemoryEvidenceWindows",
          payload: {
            query,
            memoryIds: sourceMemoryIds.slice(0, 8),
            limit: 8,
            maxWindowsPerMemory: 1,
            contextChunksBefore: 1,
            contextChunksAfter: 1,
          },
        });
        const evidence = evidenceWindows.items.map(evidenceWindowToAgentEvidence).slice(0, 8);
        await appendWikiCompileEvent(claimed.id, {
          kind: "sources_selected",
          level: evidence.length === 0 ? "warning" : "info",
          message:
            evidence.length === 0
              ? "No matching source memories found."
              : `${evidence.length} source memories selected.`,
          detail: {
            sourceMemoryCount: evidence.length,
            memoryIds: evidenceWindows.items.map((item) => item.memoryId),
          },
        });
        if (evidence.length === 0) {
          await requestEngine({
            kind: "failWikiCompileJob",
            id: claimed.id,
            error: "No saved memories matched this topic.",
          });
          await loadLibrary(railState.query);
          showToast({ tone: "warning", message: "Save or search matching memories first." });
          setWikiCompileRunning(false);
          dispatch({ type: "SET_LOADING", loading: false });
          return;
        }

        const runId = `wiki-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        const createdAt = new Date().toISOString();
        const output: string[] = [];
        const citations: Parameters<typeof buildWikiCompileResult>[0]["citations"] = [];
        let streamedCharacterCount = 0;
        let lastDeltaEventAt = 0;
        const pageContext = railState.activePageContext;
        const request: AgentChatRequest = {
          runId,
          question: buildWikiCompileQuestion({
            query: claimed.query,
            instructions: claimed.instructions,
            evidence,
          }),
          scope: "current-page",
          pageUrl: pageContext.url,
          pageTitle: pageContext.title,
          evidence,
          createdAt,
        };

        await appendWikiCompileEvent(claimed.id, {
          kind: "provider_started",
          message: "Provider generation started.",
          detail: {
            runId,
            sourceMemoryCount: evidence.length,
          },
        });
        activeWikiCompileStreamRef.current = openAgentStream(request, {
          onEvent: (event) => {
            if (event.type === "text_delta") {
              output.push(event.delta);
              streamedCharacterCount += event.delta.length;
              const now = Date.now();
              if (streamedCharacterCount >= 400 && now - lastDeltaEventAt > 1200) {
                lastDeltaEventAt = now;
                void appendWikiCompileEvent(claimed.id, {
                  kind: "provider_delta",
                  message: `${streamedCharacterCount} characters generated.`,
                  detail: { characterCount: streamedCharacterCount },
                });
              }
              return;
            }
            if (event.type === "citation") {
              citations.push(event.citation);
              return;
            }
            if (event.type === "run_completed") {
              activeWikiCompileStreamRef.current = null;
              void requestEngine({
                kind: "completeWikiCompileJob",
                id: claimed.id,
                result: buildWikiCompileResult({
                  job: claimed,
                  text: output.join(""),
                  evidence,
                  citations,
                }),
              })
                .then(async ({ job: completedJob, topic }) => {
                  setTopicDetail(topic);
                  setTopicForm(topicDetailToForm(topic));
                  setWikiCompileForm(topicDetailToWikiCompileForm(topic));
                  const edges = await requestEngine({
                    kind: "listTopicGraphEdges",
                    topicId: topic.id,
                  });
                  setTopicGraphEdges(edges.edges);
                  setWikiCompileJobs((jobs) => [
                    completedJob,
                    ...jobs.filter((item) => item.id !== completedJob.id),
                  ]);
                  await loadWikiCompileJobEvents(completedJob.id);
                  await loadLibrary(railState.query);
                  showToast({ tone: "success", message: "Wiki topic compiled." });
                })
                .catch((error) => showToast(errorToast(error)))
                .finally(() => {
                  setWikiCompileRunning(false);
                  dispatch({ type: "SET_LOADING", loading: false });
                });
              return;
            }
            if (event.type === "run_failed" || event.type === "run_cancelled") {
              activeWikiCompileStreamRef.current = null;
              const message =
                event.type === "run_failed"
                  ? event.error.message
                  : (event.reason ?? "Wiki compile cancelled.");
              void requestEngine({
                kind: "failWikiCompileJob",
                id: claimed.id,
                error: message,
              })
                .then((failedJob) => {
                  if (failedJob !== null) {
                    setWikiCompileJobs((jobs) => [
                      failedJob,
                      ...jobs.filter((item) => item.id !== failedJob.id),
                    ]);
                    void loadWikiCompileJobEvents(failedJob.id);
                  }
                  showToast({ tone: "warning", message });
                })
                .catch((error) => showToast(errorToast(error)))
                .finally(() => {
                  setWikiCompileRunning(false);
                  dispatch({ type: "SET_LOADING", loading: false });
                });
            }
          },
          onTransportError: (error) => {
            activeWikiCompileStreamRef.current = null;
            void requestEngine({
              kind: "failWikiCompileJob",
              id: claimed.id,
              error: error.message,
            })
              .then((failedJob) => {
                if (failedJob !== null) void loadWikiCompileJobEvents(failedJob.id);
              })
              .catch(() => undefined);
            setWikiCompileRunning(false);
            dispatch({ type: "SET_LOADING", loading: false });
            showToast(errorToast(error));
          },
        });
      } catch (error) {
        if (job !== null) {
          await requestEngine({
            kind: "failWikiCompileJob",
            id: job.id,
            error: error instanceof Error ? error.message : String(error),
          }).catch(() => undefined);
          await loadWikiCompileJobEvents(job.id);
        }
        setWikiCompileRunning(false);
        dispatch({ type: "SET_LOADING", loading: false });
        showToast(errorToast(error));
      }
    },
    [
      appendWikiCompileEvent,
      loadLibrary,
      loadWikiCompileJobEvents,
      railState.activePageContext,
      railState.query,
      showToast,
      topicDetail,
      wikiCompileRunning,
    ],
  );

  const handleSubmitWebSearch = React.useCallback(
    (query: string) => {
      const trimmed = normalizeText(query);
      if (trimmed.length === 0) return;
      if (activeWebSearchStreamRef.current !== null) {
        showToast({ tone: "warning", message: "Wait for the current search to finish." });
        return;
      }

      const runId = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const createdAt = new Date().toISOString();
      setWebSearchState({
        running: true,
        query: trimmed,
        answer: "",
        sources: [],
        createdAt,
      });

      activeWebSearchStreamRef.current = openWebSearchStream(
        {
          runId,
          query: trimmed,
          createdAt,
        },
        {
          onEvent: (event: ClioWebSearchEvent) => {
            if (event.type === "started") {
              setWebSearchState({
                running: true,
                query: event.query,
                answer: "",
                sources: [],
                provider: event.provider,
                createdAt: event.createdAt,
              });
              return;
            }
            if (event.type === "answer_delta") {
              setWebSearchState((current) =>
                current.query === trimmed
                  ? {
                      ...current,
                      answer: `${current.answer}${event.delta}`,
                    }
                  : current,
              );
              return;
            }
            if (event.type === "completed") {
              activeWebSearchStreamRef.current = null;
              setWebSearchState({
                running: false,
                query: event.result.query,
                answer: event.result.answer,
                sources: event.result.sources,
                provider: event.result.provider,
                createdAt: event.result.createdAt,
              });
              void loadWebSearchHistory();
              return;
            }
            activeWebSearchStreamRef.current = null;
            setWebSearchState((current) => ({
              ...current,
              running: false,
              error: event.error,
            }));
          },
          onTransportError: (error) => {
            activeWebSearchStreamRef.current = null;
            setWebSearchState((current) => ({
              ...current,
              running: false,
              error,
            }));
          },
        },
      );
    },
    [loadWebSearchHistory, showToast],
  );

  const handleOpenWebSearchHistory = React.useCallback((record: WebSearchHistoryRecord) => {
    setWebSearchState({
      running: false,
      query: record.query,
      answer: record.answer,
      sources: record.sources,
      provider: record.provider,
      createdAt: record.createdAt,
    });
  }, []);

  const handleDeleteWebSearchHistory = React.useCallback(
    async (id: string) => {
      try {
        await requestEngine({ kind: "deleteWebSearchHistory", id });
        setWebSearchHistory((items) => items.filter((item) => item.id !== id));
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [showToast],
  );

  const handleClearWebSearchHistory = React.useCallback(async () => {
    try {
      await requestEngine({ kind: "clearWebSearchHistory" });
      setWebSearchHistory([]);
    } catch (error) {
      showToast(errorToast(error));
    }
  }, [showToast]);

  const handleOpenWebSearchSource = React.useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const handleSubmitImageGeneration = React.useCallback(
    (input: ImageGenerationSubmitInput) => {
      const prompt = normalizeText(input.prompt);
      if (prompt.length === 0) return;
      if (activeImageGenerationStreamRef.current !== null) {
        showToast({ tone: "warning", message: "Wait for the current image to finish." });
        return;
      }

      const runId = `image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const createdAt = new Date().toISOString();
      setImageGenerationState({
        running: true,
        mode: input.mode,
        prompt,
        createdAt,
      });

      activeImageGenerationStreamRef.current = openImageGenerationStream(
        {
          runId,
          mode: input.mode,
          prompt,
          createdAt,
          ...(input.input === undefined ? {} : { input: input.input }),
        },
        {
          onEvent: (event: ClioImageGenerationEvent) => {
            if (event.type === "started") {
              setImageGenerationState({
                running: true,
                mode: event.mode,
                prompt: event.prompt,
                provider: event.provider,
                model: event.model,
                size: event.size,
                createdAt: event.createdAt,
              });
              return;
            }
            if (event.type === "completed") {
              activeImageGenerationStreamRef.current = null;
              setImageGenerationState({
                running: false,
                mode: event.result.mode,
                prompt: event.result.prompt,
                provider: event.result.provider,
                model: event.result.model,
                size: event.result.size,
                createdAt: event.result.createdAt,
                result: event.result,
              });
              void loadImageGenerationHistory();
              return;
            }
            if (event.type === "cancelled") {
              activeImageGenerationStreamRef.current = null;
              setImageGenerationState((current) => ({
                ...current,
                running: false,
                error: {
                  code: "CANCELLED",
                  message: event.reason ?? "Image generation cancelled.",
                },
              }));
              return;
            }
            activeImageGenerationStreamRef.current = null;
            setImageGenerationState((current) => ({
              ...current,
              running: false,
              error: event.error,
            }));
          },
          onTransportError: (error) => {
            activeImageGenerationStreamRef.current = null;
            setImageGenerationState((current) => ({
              ...current,
              running: false,
              error,
            }));
          },
        },
      );
    },
    [loadImageGenerationHistory, showToast],
  );

  const handleCancelImageGeneration = React.useCallback(() => {
    activeImageGenerationStreamRef.current?.cancel();
  }, []);

  const handleDeleteImageGenerationHistory = React.useCallback(
    async (id: string) => {
      try {
        await requestEngine({ kind: "deleteImageGenerationHistory", id });
        setImageGenerationHistory((items) => items.filter((item) => item.id !== id));
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [showToast],
  );

  React.useEffect(() => {
    void loadRailWidthPreference()
      .then(setRailWidth)
      .catch(() => undefined);
    void loadCollapsedLauncherPositionPreference()
      .then(setCollapsedLauncherPosition)
      .catch(() => undefined);
    void loadRailThemePreference()
      .then(setRailTheme)
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    void loadProviderSettings();
    void loadSearchProviderSettings();
    void loadImageGenerationSettings();
    void loadVisionProviderSettings();
    void loadActiveEmbeddingModel();
    void loadLocalEmbeddingStatus();
  }, [
    loadActiveEmbeddingModel,
    loadImageGenerationSettings,
    loadLocalEmbeddingStatus,
    loadProviderSettings,
    loadSearchProviderSettings,
    loadVisionProviderSettings,
  ]);

  React.useEffect(() => {
    if (
      localEmbeddingStatus?.state !== "downloading" &&
      localEmbeddingStatus?.state !== "verifying" &&
      localEmbeddingStatus?.state !== "loading" &&
      localEmbeddingStatus?.reindex?.state !== "queued" &&
      localEmbeddingStatus?.reindex?.state !== "running" &&
      localEmbeddingStatus?.reindex?.state !== "cancel_requested"
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadLocalEmbeddingStatus();
    }, 750);
    return () => window.clearInterval(timer);
  }, [loadLocalEmbeddingStatus, localEmbeddingStatus?.reindex?.state, localEmbeddingStatus?.state]);

  React.useEffect(() => {
    void getRailOwnerId()
      .then((ownerId) => {
        ownerIdRef.current = ownerId;
      })
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void loadActiveSessionId(initialPageContext)
      .then(async (sessionId) => {
        if (cancelled || sessionId === undefined) return;
        await loadChatSession(sessionId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initialPageContext, loadChatSession]);

  React.useEffect(() => {
    const sessionId = railState.activeSessionId;
    if (sessionId === undefined) return undefined;
    const timer = window.setInterval(() => {
      const ownerId = ownerIdRef.current;
      if (ownerId === null) return;
      void heartbeatSession(sessionId, ownerId).catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [railState.activeSessionId]);

  React.useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setRailWidth((width) => clampRailWidth(width));
      setCollapsedLauncherPosition((position) => clampCollapsedLauncherPosition(position));
      setCollapsedLauncherDragPoint((point) =>
        point === null ? null : clampCollapsedLauncherDragPoint(point),
      );
    };
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const railExpanded = isRailExpanded(railState);

  React.useEffect(() => {
    if (railExpanded) {
      applyPageLayoutCompensation(railWidth);
      return () => restorePageLayoutCompensation();
    }
    restorePageLayoutCompensation();
    return undefined;
  }, [railExpanded, railWidth]);

  React.useEffect(() => {
    const update = () => {
      const next = readCurrentSelection();
      setSelection(next);
    };
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 120);
    };
    document.addEventListener("selectionchange", schedule);
    window.addEventListener("pointerup", schedule, true);
    window.addEventListener("mouseup", schedule, true);
    window.addEventListener("keyup", schedule, true);
    window.addEventListener("touchend", schedule, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("pointerup", schedule, true);
      window.removeEventListener("mouseup", schedule, true);
      window.removeEventListener("keyup", schedule, true);
      window.removeEventListener("touchend", schedule, true);
    };
  }, []);

  React.useEffect(() => {
    const update = () => dispatch({ type: "OBSERVE_PAGE_CHANGE", page: readPageContext() });
    const restore = installSpaLocationObserver(update);
    window.addEventListener("popstate", update);
    window.addEventListener(locationChangeEventName, update);
    return () => {
      restore();
      window.removeEventListener("popstate", update);
      window.removeEventListener(locationChangeEventName, update);
    };
  }, []);

  React.useEffect(() => {
    const currentUrl = railState.observedPageContext.url;
    const timer = window.setTimeout(() => {
      void consumePendingHighlight(currentUrl, showToast);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [railState.observedPageContext.url, showToast]);

  React.useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<ContentCommand>).detail;
      if (command.action === "toggleRail") {
        if (railState.mode === "collapsed") {
          void openHome();
          return;
        }
        dispatch({ type: "COLLAPSE" });
        return;
      }
      if (command.action === "openRail") {
        if (command.query !== undefined || command.memoryId !== undefined) {
          void openKnowledgeBase(command.query, command.memoryId);
          return;
        }
        void openHome();
        return;
      }
      if (command.action === "openCommandPalette") {
        void openCommandPalette();
        return;
      }
      if (command.action === "openSettings") {
        openSettings();
        return;
      }
      if (command.action === "savePage") {
        void savePage();
        return;
      }
      if (command.action === "saveSelection") {
        void saveSelection();
      }
    };
    window.addEventListener(commandEventName, onCommand);
    return () => window.removeEventListener(commandEventName, onCommand);
  }, [
    openCommandPalette,
    openHome,
    openKnowledgeBase,
    openSettings,
    railState.mode,
    savePage,
    saveSelection,
  ]);

  React.useEffect(() => {
    if (railState.mode !== "knowledge-base" && railState.mode !== "research-planner") return;
    const timer = window.setTimeout(() => {
      void loadKnowledgeBaseResults(railState.query);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [loadKnowledgeBaseResults, railState.mode, railState.query]);

  React.useEffect(() => {
    if (activeEmbeddingModel !== null || knowledgeBaseSearchMode !== "semantic") return;
    setKnowledgeBaseSearchMode("exact");
  }, [activeEmbeddingModel, knowledgeBaseSearchMode]);

  React.useEffect(() => {
    if (railState.mode !== "agent-home") {
      setRelatedItems([]);
      return undefined;
    }
    const activePageContext = railState.activePageContext;
    if (!shouldLoadRelatedCards(activePageContext.url)) {
      setRelatedItems([]);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      const activeMatchesObserved = sourceUrlsMatch(
        activePageContext.url,
        railState.observedPageContext.url,
      );
      const canUseCurrentDom =
        !railState.preservingPreviousPageContext &&
        railState.pendingPageChange === undefined &&
        activeMatchesObserved;
      const snapshotMatchesActive =
        railState.selectionSnapshot !== undefined &&
        sourceUrlsMatch(railState.selectionSnapshot.sourceUrl, activePageContext.url);
      const liveSelectionText = canUseCurrentDom ? selection?.text : undefined;
      const snapshotText = snapshotMatchesActive ? railState.selectionSnapshot?.text : undefined;
      const hasSelectionText = normalizeText(liveSelectionText ?? snapshotText ?? "").length > 0;
      const query = buildRelatedMemoryQuery({
        activePageContext,
        liveSelectionText,
        selectionSnapshot: railState.selectionSnapshot,
        readableText: canUseCurrentDom && !hasSelectionText ? readRelatedReadableText() : "",
      });

      if (query.length === 0) {
        setRelatedItems([]);
        return;
      }

      void requestEngine({ kind: "searchMemory", query, limit: relatedSearchLimit })
        .then((result) => {
          if (cancelled) return;
          setRelatedItems(filterRelatedMemoryItems(result.items, activePageContext.url));
        })
        .catch(() => {
          if (cancelled) return;
          setRelatedItems([]);
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    railState.activePageContext,
    railState.mode,
    railState.observedPageContext,
    railState.pendingPageChange,
    railState.preservingPreviousPageContext,
    railState.selectionSnapshot,
    selection?.text,
  ]);

  const handleResizePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = railWidthRef.current;
    const onMove = (moveEvent: PointerEvent) => {
      const nextWidth = clampRailWidth(startWidth + startX - moveEvent.clientX);
      setRailWidth(nextWidth);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      void saveRailWidthPreference(railWidthRef.current).catch(() => undefined);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }, []);

  const handleCollapsedPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const startX = event.clientX;
      const startY = event.clientY;
      let moved = false;
      let latestPoint = clampCollapsedLauncherDragPoint({
        x: event.clientX,
        y: event.clientY,
      });
      const updateDragPoint = (point: CollapsedLauncherDragPoint) => {
        latestPoint = clampCollapsedLauncherDragPoint(point);
        setCollapsedLauncherDragPoint(latestPoint);
      };
      const hasMoved = (point: CollapsedLauncherDragPoint) =>
        Math.abs(point.x - startX) > 4 || Math.abs(point.y - startY) > 4;
      const onMove = (moveEvent: PointerEvent) => {
        const point = { x: moveEvent.clientX, y: moveEvent.clientY };
        if (hasMoved(point)) moved = true;
        if (!moved) return;
        updateDragPoint(point);
      };
      const onUp = (upEvent: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const point = { x: upEvent.clientX, y: upEvent.clientY };
        if (hasMoved(point)) moved = true;
        if (moved) {
          latestPoint = clampCollapsedLauncherDragPoint(point);
          const nextPosition = collapsedLauncherPositionFromPoint(
            latestPoint,
            window.innerWidth,
            window.innerHeight,
          );
          collapsedLauncherPositionRef.current = nextPosition;
          setCollapsedLauncherDragPoint(null);
          setCollapsedLauncherPosition(nextPosition);
          void saveCollapsedLauncherPositionPreference(nextPosition).catch(() => undefined);
          return;
        }
        setCollapsedLauncherDragPoint(null);
        void openHome();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    },
    [openHome],
  );

  const handleCollapsedKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      void openHome();
    },
    [openHome],
  );

  const handleAcceptPageChange = React.useCallback(() => {
    if (railState.activeSessionId !== undefined) {
      const ownerId = ownerIdRef.current;
      if (ownerId !== null) {
        void requestEngine({
          kind: "releaseChatSession",
          sessionId: railState.activeSessionId,
          ownerId,
        }).catch(() => undefined);
      }
    }
    void clearActiveSessionId(railState.activePageContext).catch(() => undefined);
    dispatch({ type: "ACCEPT_PAGE_CHANGE" });
  }, [railState.activePageContext, railState.activeSessionId]);

  const handleKeepPreviousPage = React.useCallback(() => {
    dispatch({ type: "KEEP_PREVIOUS_PAGE" });
  }, []);

  const handleToolboxSkill = React.useCallback(
    (skill: ToolboxSkill) => {
      if (skill.launchMode === "composer") {
        if (skill.composerMode === undefined) return;
        dispatch({ type: "SET_COMPOSER_SKILL_MODE", mode: skill.composerMode });
        return;
      }
      if (skill.launchMode === "page") {
        if (skill.id === "image-gen") {
          openImageGen();
          return;
        }
        openWebSearch();
        return;
      }
      void openRelatedFromToolbox();
    },
    [openImageGen, openRelatedFromToolbox, openWebSearch],
  );

  const handleReplySuggestion = React.useCallback(
    (suggestion: ReplyActionSuggestion) => {
      const now = new Date().toISOString();
      dispatch({ type: "CLEAR_REPLY_SUGGESTIONS", messageId: suggestion.messageId });
      try {
        switch (suggestion.route) {
          case "web_search":
            openWebSearch();
            break;
          case "knowledge_search":
          case "find_related":
          case "save_to_memory":
            void openKnowledgeBase();
            break;
          case "page_summary": {
            const summarizeSkill = toolboxSkills.find((skill) => skill.id === "summarize");
            if (summarizeSkill?.composerMode !== undefined) {
              dispatch({ type: "SET_COMPOSER_SKILL_MODE", mode: summarizeSkill.composerMode });
            }
            break;
          }
          case "translate_selection": {
            const translateSkill = toolboxSkills.find((skill) => skill.id === "translate");
            if (translateSkill?.composerMode !== undefined) {
              dispatch({ type: "SET_COMPOSER_SKILL_MODE", mode: translateSkill.composerMode });
            }
            break;
          }
          default:
            exhaustiveRoute(suggestion.route);
        }
        dispatch({
          type: "ADD_EXPLICIT_TOOL_TRACE",
          messageId: suggestion.messageId,
          trace: createExplicitToolTrace({
            suggestion,
            status: "completed",
            now,
          }),
        });
        showToast({
          tone: "success",
          message: `${explicitToolRouteLabel(suggestion.route)} opened.`,
        });
      } catch (error) {
        dispatch({
          type: "ADD_EXPLICIT_TOOL_TRACE",
          messageId: suggestion.messageId,
          trace: {
            ...createExplicitToolTrace({
              suggestion,
              status: "failed",
              now,
            }),
            sourceSummary: error instanceof Error ? error.message : "Route failed.",
          },
        });
        showToast(errorToast(error));
      }
    },
    [openKnowledgeBase, openWebSearch, showToast],
  );

  const startAgentRun = React.useCallback(
    async (
      content: string,
      attachmentKind?: ComposerContextAttachmentKind,
      forcedScope?: ComposerScope,
      skillMode?: ComposerSkillMode,
      options: { sourceContextPack?: AgentChatRequest["sourceContextPack"] } = {},
    ) => {
      const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const now = new Date().toISOString();
      const pageContext = railState.activePageContext;
      const scope = forcedScope ?? scopeFromAttachment(attachmentKind);
      const skillRequest = buildSkillRequestDisplay({ content, attachmentKind, skillMode });
      const providerQuestion = buildSkillQuestion({ content, attachmentKind, skillMode });
      const displayContent = buildDisplayContent({ content, attachmentKind, skillMode });
      const effectiveSourceContextPack =
        options.sourceContextPack ??
        (scope === "general" ? planDefaultSourceContextPack(providerQuestion) : undefined);
      if (activeAgentStreamRef.current === null && hasUnresolvedInterruptedAnswer(railState)) {
        showToast({ tone: "warning", message: "Use Retry, Stop, or Clear before continuing." });
        return;
      }
      if (
        activeAgentStreamRef.current === null &&
        hasQueuedDialogueMessages(railState.dialogueMessages)
      ) {
        dispatch({ type: "SET_RUNTIME_STATUS", message: "Clear queued messages first" });
        return;
      }
      const selectionSnapshot = railState.selectionSnapshot;

      let attachedEvidence: EvidenceItem | undefined;
      try {
        attachedEvidence = buildAttachedEvidence(attachmentKind, pageContext, selectionSnapshot);
      } catch (error) {
        showToast(errorToast(error));
        return;
      }

      const ownerId = ownerIdRef.current ?? (await getRailOwnerId());
      ownerIdRef.current = ownerId;
      const sessionId = railState.activeSessionId ?? (await loadActiveSessionId(pageContext));
      if (activeAgentStreamRef.current !== null) {
        if (sessionId === undefined) {
          showToast({
            tone: "warning",
            message: "Wait for the current answer to attach to a conversation.",
          });
          return;
        }
        try {
          const queued = await enqueueSessionFollowUp({
            sessionId,
            ownerId,
            question: providerQuestion,
            displayContent,
            scope,
            pageContext,
            selectionText: attachmentKind === "selection" ? selectionSnapshot?.text : undefined,
            attachedEvidence,
            skillRequest,
            ...(effectiveSourceContextPack === undefined
              ? {}
              : { sourceContextPack: effectiveSourceContextPack }),
            createdAt: now,
            runId,
          });
          dispatch({
            type: "LOAD_CHAT_SESSION",
            sessionId: queued.session.id,
            messages: queued.session.messages.map(chatMessageToRailMessage),
            activeRun: activeRunFromMessages(queued.session.messages),
          });
          if (attachmentKind === "selection") {
            dispatch({ type: "CLEAR_SELECTION_SNAPSHOT" });
          }
          void loadChatHistory();
        } catch (error) {
          showToast(errorToast(error));
        }
        return;
      }

      const existingSession =
        sessionId === undefined
          ? null
          : await requestEngine({ kind: "loadChatSession", sessionId }).catch(() => null);
      if (
        existingSession?.messages.some(
          (message) => message.role === "user" && message.status === "queued",
        )
      ) {
        dispatch({ type: "SET_RUNTIME_STATUS", message: "Clear queued messages first" });
        return;
      }
      const targetSessionId = existingSession === null ? undefined : sessionId;
      const previousEvidence = existingSession?.evidence.map(evidenceRecordToAgentEvidence) ?? [];
      const multiSourceRag =
        scope === "general" && effectiveSourceContextPack === undefined
          ? await loadMultiSourceRagEvidencePack(providerQuestion)
          : undefined;
      const localRagEvidence = multiSourceRag?.evidence ?? [];
      const evidence =
        scope === "general"
          ? localRagEvidence
          : attachedEvidence === undefined
            ? previousEvidence
            : [...previousEvidence, attachedEvidence];

      let turn: StartSessionTurnResult;
      try {
        turn = await createOrLoadSessionForTurn({
          sessionId: targetSessionId,
          ownerId,
          question: providerQuestion,
          displayContent,
          scope,
          pageContext,
          selectionText: attachmentKind === "selection" ? selectionSnapshot?.text : undefined,
          evidence,
          attachedEvidence,
          skillRequest,
          ...(effectiveSourceContextPack === undefined
            ? {}
            : { sourceContextPack: effectiveSourceContextPack }),
          createdAt: now,
          runId,
        });
      } catch (error) {
        showToast(errorToast(error));
        return;
      }

      dispatch({
        type: "LOAD_CHAT_SESSION",
        sessionId: turn.session.id,
        messages: turn.session.messages.map(chatMessageToRailMessage),
        activeRun: {
          runId,
          userMessageId: turn.userMessage.id,
          assistantMessageId: turn.assistantMessage.id,
        },
      });
      if (attachmentKind === "selection") {
        dispatch({ type: "CLEAR_SELECTION_SNAPSHOT" });
      }

      const request: AgentChatRequest = {
        runId,
        sessionId: turn.session.id,
        userMessageId: turn.userMessage.id,
        assistantMessageId: turn.assistantMessage.id,
        evidenceRevision: turn.evidenceRevision,
        question: providerQuestion,
        scope,
        pageUrl: pageContext.url,
        pageTitle: pageContext.title,
        evidence,
        currentTurnEvidenceRefs: turn.evidenceRecord === undefined ? [] : [turn.evidenceRecord.id],
        ...(effectiveSourceContextPack === undefined
          ? {}
          : { sourceContextPack: effectiveSourceContextPack }),
        createdAt: now,
      };

      activeAgentStreamRef.current = openAgentStream(request, {
        onEvent: (event) => {
          dispatch({ type: "APPLY_AGENT_EVENT", event });
          if (isTerminalAgentStreamEvent(event)) {
            activeAgentStreamRef.current = null;
            void requestEngine({ kind: "loadChatSession", sessionId: turn.session.id })
              .then((session) => {
                if (session === null) return;
                const nextActiveRun = activeRunFromMessages(session.messages);
                dispatch({
                  type: "LOAD_CHAT_SESSION",
                  sessionId: session.id,
                  messages: session.messages.map(chatMessageToRailMessage),
                  activeRun: nextActiveRun,
                });
                maybeAttachReplySuggestions(session, turn.assistantMessage.id);
                if (nextActiveRun !== undefined && nextActiveRun.runId !== runId) {
                  attachActiveRun(session.id, nextActiveRun);
                }
                void loadChatHistory();
                void loadSourceContextCompressionLogs(session.id);
              })
              .catch(() => undefined);
          }
        },
        onTransportError: (error) => {
          activeAgentStreamRef.current = null;
          dispatch({
            type: "AGENT_TRANSPORT_ERROR",
            runId,
            error,
          });
        },
      });
    },
    [
      attachActiveRun,
      loadChatHistory,
      loadSourceContextCompressionLogs,
      maybeAttachReplySuggestions,
      railState,
      showToast,
    ],
  );

  const startSourceContextPlannerResearch = React.useCallback(
    (query: string) => {
      const normalizedQuestion = normalizeText(query);
      const sourceIds = sourceContextPlanner.selectedSourceIds;
      if (normalizedQuestion.length === 0) {
        setSourceContextPlanner((current) => ({
          ...current,
          previewError: "Enter a research query before starting.",
        }));
        dispatch({ type: "SET_RUNTIME_STATUS", message: "Enter a research query first" });
        return;
      }
      if (sourceIds.length === 0) {
        setSourceContextPlanner((current) => ({
          ...current,
          previewError: "Select at least one source before starting research.",
        }));
        dispatch({ type: "SET_RUNTIME_STATUS", message: "Select at least one source first" });
        return;
      }
      void startAgentRun(normalizedQuestion, undefined, "general", undefined, {
        sourceContextPack: sourceContextPackOptionsFromPlanner({
          sourceIds,
          sourceDepthOverrides: sourceContextPlanner.sourceDepthOverrides,
          budget: sourceContextPlanner.budget,
        }),
      });
    },
    [
      sourceContextPlanner.budget,
      sourceContextPlanner.selectedSourceIds,
      sourceContextPlanner.sourceDepthOverrides,
      startAgentRun,
    ],
  );

  const handleSubmitDialogue = React.useCallback(
    (content: string, attachment?: ComposerContextAttachmentKind) => {
      void startAgentRun(content, attachment, undefined, railState.composerSkillMode);
    },
    [railState.composerSkillMode, startAgentRun],
  );

  const handleResearchCommand = React.useCallback(
    (question?: string) => {
      const normalizedQuestion = normalizeText(question ?? "");
      if (normalizedQuestion.length === 0) {
        dispatch({ type: "SET_RUNTIME_STATUS", message: "Usage: /research <question>" });
        return;
      }
      void startAgentRun(normalizedQuestion, undefined, "general", undefined, {
        sourceContextPack: {
          mode: "research",
          planner: "source_context_planner_v1",
          ...sourceContextPackResearchBudgetDefaults,
          mapReduce: {
            enabled: true,
            maxGroups: sourceContextPackResearchBudgetDefaults.maxGroups,
            perGroupTokenBudget: sourceContextPackResearchBudgetDefaults.maxGroupTokens,
          },
        },
      });
    },
    [startAgentRun],
  );

  const handleCancelDialogue = React.useCallback(() => {
    activeAgentStreamRef.current?.cancel();
    if (railState.activeSessionId !== undefined) {
      void requestEngine({
        kind: "clearQueuedChatMessages",
        sessionId: railState.activeSessionId,
      }).catch(() => undefined);
    }
  }, [railState.activeSessionId]);

  const handleClearDialogue = React.useCallback(() => {
    activeAgentStreamRef.current?.cancel();
    activeAgentStreamRef.current?.close();
    activeAgentStreamRef.current = null;
    void clearActiveSessionId(railState.activePageContext).catch(() => undefined);
    if (railState.activeSessionId !== undefined) {
      void requestEngine({
        kind: "clearQueuedChatMessages",
        sessionId: railState.activeSessionId,
      }).catch(() => undefined);
      const ownerId = ownerIdRef.current;
      if (ownerId !== null) {
        void requestEngine({
          kind: "releaseChatSession",
          sessionId: railState.activeSessionId,
          ownerId,
        }).catch(() => undefined);
      }
    }
    dispatch({ type: "CLEAR_DIALOGUE" });
    setSourceContextCompressionLogs([]);
    setSourceContextMapArtifacts([]);
    setSourceContextMapRuns([]);
    setSourceContextMapEvents([]);
  }, [railState.activePageContext, railState.activeSessionId]);

  const handleRetryDialogue = React.useCallback(
    async (messageId: string) => {
      const message = railState.dialogueMessages.find((item) => item.id === messageId);
      if (message?.retryRequest === undefined || railState.activeSessionId === undefined) return;
      if (activeAgentStreamRef.current !== null) {
        showToast({ tone: "warning", message: "Wait for the current answer to finish." });
        return;
      }
      const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const now = new Date().toISOString();
      try {
        const ownerId = ownerIdRef.current ?? (await getRailOwnerId());
        ownerIdRef.current = ownerId;
        const retry = await retryInterruptedAssistant({
          sessionId: railState.activeSessionId,
          assistantMessageId: messageId,
          ownerId,
          runId,
          createdAt: now,
          fallbackPageContext: railState.activePageContext,
        });
        const nextActiveRun = {
          runId,
          userMessageId: `${runId}:retry-user`,
          assistantMessageId: retry.assistantMessage.id,
        };
        dispatch({
          type: "LOAD_CHAT_SESSION",
          sessionId: retry.session.id,
          messages: retry.session.messages.map(chatMessageToRailMessage),
          activeRun: nextActiveRun,
        });
        activeAgentStreamRef.current = openAgentStream(retry.request, {
          onEvent: (event) => {
            dispatch({ type: "APPLY_AGENT_EVENT", event });
            if (!isTerminalAgentStreamEvent(event)) return;
            activeAgentStreamRef.current = null;
            void requestEngine({ kind: "loadChatSession", sessionId: retry.session.id })
              .then((session) => {
                if (session === null) return;
                const nextRun = activeRunFromMessages(session.messages);
                dispatch({
                  type: "LOAD_CHAT_SESSION",
                  sessionId: session.id,
                  messages: session.messages.map(chatMessageToRailMessage),
                  activeRun: nextRun,
                });
                maybeAttachReplySuggestions(session, retry.assistantMessage.id);
                if (nextRun !== undefined && nextRun.runId !== runId) {
                  attachActiveRun(session.id, nextRun);
                }
                void loadChatHistory();
                void loadSourceContextCompressionLogs(session.id);
              })
              .catch(() => undefined);
          },
          onTransportError: (error) => {
            activeAgentStreamRef.current = null;
            dispatch({
              type: "AGENT_TRANSPORT_ERROR",
              runId,
              error,
            });
          },
        });
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [
      attachActiveRun,
      loadChatHistory,
      loadSourceContextCompressionLogs,
      maybeAttachReplySuggestions,
      railState,
      showToast,
    ],
  );

  const handleStopInterruptedDialogue = React.useCallback(
    async (messageId: string) => {
      const message = railState.dialogueMessages.find((item) => item.id === messageId);
      if (message?.retryRequest === undefined || railState.activeSessionId === undefined) return;
      if (activeAgentStreamRef.current !== null) {
        showToast({ tone: "warning", message: "Wait for the current answer to finish." });
        return;
      }
      try {
        const ownerId = ownerIdRef.current ?? (await getRailOwnerId());
        ownerIdRef.current = ownerId;
        const stopped = await stopInterruptedAssistant({
          sessionId: railState.activeSessionId,
          assistantMessageId: messageId,
          ownerId,
          stoppedAt: new Date().toISOString(),
        });
        dispatch({
          type: "LOAD_CHAT_SESSION",
          sessionId: stopped.session.id,
          messages: stopped.session.messages.map(chatMessageToRailMessage),
          activeRun: activeRunFromMessages(stopped.session.messages),
        });
        void loadChatHistory();
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [loadChatHistory, railState.activeSessionId, railState.dialogueMessages, showToast],
  );

  const handleOpenMarkdownSource = React.useCallback(
    (source: MarkdownSource) => {
      const currentPage = readPageContext();
      if (
        source.anchor !== undefined &&
        source.url !== undefined &&
        sourceUrlsMatch(source.url, currentPage.url) &&
        highlightEvidenceAnchor(source.anchor)
      ) {
        showToast({ tone: "success", message: "Source passage highlighted." });
        return;
      }

      if ((source.kind === "page" || source.kind === "selection") && source.url !== undefined) {
        if (source.anchor !== undefined) {
          void storePendingHighlightFromAnchor(source.anchor, {
            id: source.id,
            sourceUrl: source.url,
          }).catch(() => undefined);
        } else {
          void clearPendingHighlight().catch(() => undefined);
        }
        window.open(source.anchor?.textFragment ?? source.url, "_blank", "noopener,noreferrer");
        showToast({
          tone: source.anchor === undefined ? "warning" : "success",
          message:
            source.anchor === undefined
              ? "Opened source."
              : "Opened source. Clio will try to highlight the passage there.",
        });
        return;
      }

      if (source.kind === "memory") {
        void openDetail(source.id);
        return;
      }

      showToast({
        tone: "warning",
        message:
          source.excerpt ?? source.title ?? source.url ?? "Source detail is not connected yet.",
      });
    },
    [openDetail, showToast],
  );

  const handleCopyMarkdownPreview = React.useCallback(
    async (content: string) => {
      try {
        await navigator.clipboard.writeText(content);
        showToast({ tone: "success", message: "Markdown copied." });
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [showToast],
  );

  const handleCopyMarkdownText = React.useCallback(
    async (content: string) => {
      try {
        await navigator.clipboard.writeText(content);
        showToast({ tone: "success", message: "Text copied." });
      } catch (error) {
        showToast(errorToast(error));
      }
    },
    [showToast],
  );

  const handleComposerPrefillConsumed = React.useCallback(() => {
    dispatch({ type: "CLEAR_COMPOSER_PREFILL" });
  }, []);

  const handleComposerAttachmentRequestConsumed = React.useCallback(() => {
    dispatch({ type: "CLEAR_COMPOSER_ATTACHMENT_REQUEST" });
  }, []);

  const handleComposerInputChange = React.useCallback(() => {
    if (railState.runtimeStatus !== undefined && !railState.runtimeStatus.running) {
      dispatch({ type: "CLEAR_RUNTIME_STATUS" });
    }
  }, [railState.runtimeStatus]);

  const handleManualCompact = React.useCallback(() => {
    if (activeAgentStreamRef.current !== null) {
      dispatch({ type: "SET_RUNTIME_STATUS", message: "Command unavailable" });
      return;
    }
    const runId = `compact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    dispatch({
      type: "SET_ACTIVE_AGENT_RUN",
      activeRun: {
        runId,
        userMessageId: `${runId}:operation`,
        assistantMessageId: `${runId}:operation`,
      },
    });
    activeAgentStreamRef.current = openManualCompactStream(
      {
        runId,
        sessionId: railState.activeSessionId,
      },
      {
        onEvent: (event) => {
          dispatch({ type: "APPLY_AGENT_EVENT", event });
          if (!isTerminalAgentStreamEvent(event)) return;
          activeAgentStreamRef.current = null;
          void loadChatHistory();
        },
        onTransportError: (error) => {
          activeAgentStreamRef.current = null;
          dispatch({
            type: "AGENT_TRANSPORT_ERROR",
            runId,
            error,
          });
        },
      },
    );
  }, [loadChatHistory, railState.activeSessionId]);

  const hasSelectionContext =
    normalizeText(selection?.text ?? railState.selectionSnapshot?.text ?? "").length > 0;
  const slashContext: SlashCommandContext = {
    activeSessionId: railState.activeSessionId,
    active: railState.activeAgentRun !== undefined,
    hasQueuedMessages: railState.dialogueMessages.some((message) => message.status === "queued"),
    hasUnresolvedInterruptedAnswer: hasUnresolvedInterruptedAnswer(railState),
  };

  const railCommands = React.useMemo(
    () =>
      createRailCommands({
        hasSelectionContext,
        actions: {
          openKnowledgeBase: () => void openKnowledgeBase(),
          openChatHistory,
          savePage: () => void savePage(),
          saveSelection: () => void saveSelection(),
          searchSelection: () => void searchSelection(),
          askSelection,
          noteSelection,
        },
      }),
    [
      askSelection,
      hasSelectionContext,
      noteSelection,
      openChatHistory,
      openKnowledgeBase,
      savePage,
      saveSelection,
      searchSelection,
    ],
  );

  const slashCommands = React.useMemo(
    () =>
      createSlashCommands({
        compact: handleManualCompact,
        imageGen: openImageGen,
        research: handleResearchCommand,
      }),
    [handleManualCompact, handleResearchCommand, openImageGen],
  );

  const handleExecuteCommand = React.useCallback((command: RailCommand) => {
    if (command.availability.status === "disabled") return;
    dispatch({ type: "CLOSE_COMMAND_PALETTE" });
    command.execute();
  }, []);

  const collapsedTopPx = collapsedIconTopFromRatio(
    collapsedLauncherPosition.yRatio,
    viewport.height,
  );
  const clampedRailWidth = clampRailWidth(railWidth, viewport.width);

  return (
    <div className={`clio-theme-${railTheme}`} data-clio-theme={railTheme}>
      <SelectionMiniUi
        loading={railState.loading}
        onAdd={() => void addSelectionToComposer()}
        onOpenRail={() => void openClioFromMiniUi()}
        onSave={() => void saveSelection()}
        onSearch={() => void searchSelection()}
        selection={selection}
      />
      <RailShell
        chatSessions={chatSessions}
        collapsedDragPoint={collapsedLauncherDragPoint}
        collapsedSide={collapsedLauncherPosition.side}
        collapsedTopPx={collapsedTopPx}
        detail={detail}
        pdfPreview={pdfPreview}
        activeEmbeddingModel={activeEmbeddingModel}
        localEmbeddingStatus={localEmbeddingStatus}
        testWorkspaceBusy={testWorkspaceBusy}
        testWorkspaceCleanupResult={testWorkspaceCleanupResult}
        testWorkspaceConfig={testWorkspaceBuildConfig}
        testWorkspaceInitializationResult={testWorkspaceInitializationResult}
        testWorkspaceMessage={testWorkspaceMessage}
        testWorkspaceMessageTone={testWorkspaceMessageTone}
        testWorkspaceProgress={testWorkspaceProgress}
        health={health}
        imageGenerationHistory={imageGenerationHistory}
        imageGenerationSettings={imageGenerationSettings}
        imageGenerationState={imageGenerationState}
        items={items}
        knowledgeBaseFilter={knowledgeBaseFilter}
        knowledgeBaseRelevance={knowledgeBaseRelevance}
        knowledgeBaseRefreshLoading={knowledgeBaseRefreshLoading}
        knowledgeBaseRetrieveFilter={knowledgeBaseRetrieveFilter}
        knowledgeBaseSearchMode={knowledgeBaseSearchMode}
        knowledgeBaseSearchLoading={knowledgeBaseSearchLoading}
        knowledgeBaseStrength={knowledgeBaseStrength}
        workingSetStatus={workingSetStatus}
        chunkMetaTier2Audit={chunkMetaTier2Audit}
        orchestrationRuns={orchestrationRuns}
        orchestrationEvents={orchestrationEvents}
        sourceContextCompressionLogs={sourceContextCompressionLogs}
        sourceContextMapArtifacts={sourceContextMapArtifacts}
        sourceContextMapRuns={sourceContextMapRuns}
        sourceContextMapEvents={sourceContextMapEvents}
        sourceContextPlanner={sourceContextPlanner}
        topicDetail={topicDetail}
        topicForm={topicForm}
        topicFormOpen={topicFormOpen}
        topicGraphEdges={topicGraphEdges}
        topicPages={topicPages}
        wikiCompileForm={wikiCompileForm}
        wikiCompileJobEvents={wikiCompileJobEvents}
        wikiCompileJobs={wikiCompileJobs}
        wikiCompileRunning={wikiCompileRunning}
        onAcceptPageChange={handleAcceptPageChange}
        onBackToHome={() => {
          detailLoadSequenceRef.current += 1;
          clearPdfPreview();
          setDetail(null);
          dispatch({ type: "OPEN_HOME" });
        }}
        onBackToKnowledgeBase={() => {
          detailLoadSequenceRef.current += 1;
          clearPdfPreview();
          setDetail(null);
          dispatch({ type: "SHOW_KNOWLEDGE_BASE" });
        }}
        onCollapsedKeyDown={handleCollapsedKeyDown}
        onCollapsedPointerDown={handleCollapsedPointerDown}
        onAuthorizeLocalEmbeddingReindex={() =>
          runLocalEmbeddingAction({
            kind: "authorizeLocalEmbeddingReindex",
            modelId: recommendedLocalEmbeddingModelManifest.modelId,
          })
        }
        onCancelLocalEmbeddingInstall={() =>
          runLocalEmbeddingAction({
            kind: "cancelLocalEmbeddingModelInstall",
            modelId: recommendedLocalEmbeddingModelManifest.modelId,
          })
        }
        onCancelLocalEmbeddingReindex={() =>
          runLocalEmbeddingAction({
            kind: "cancelLocalEmbeddingReindex",
            modelId: recommendedLocalEmbeddingModelManifest.modelId,
          })
        }
        onCancelImageGeneration={handleCancelImageGeneration}
        onCancelDialogue={handleCancelDialogue}
        onClearDialogue={handleClearDialogue}
        onCollapse={() => dispatch({ type: "COLLAPSE" })}
        onCommandPaletteQueryChange={(query) =>
          dispatch({ type: "SET_COMMAND_PALETTE_QUERY", query })
        }
        onComposerAttachmentRequestConsumed={handleComposerAttachmentRequestConsumed}
        onComposerPrefillConsumed={handleComposerPrefillConsumed}
        onClearComposerSkillMode={() => dispatch({ type: "CLEAR_COMPOSER_SKILL_MODE" })}
        onDelete={(id) => void deleteMemory(id)}
        onDeleteLocalEmbeddingModel={() =>
          runLocalEmbeddingAction({
            kind: "deleteLocalEmbeddingModel",
            modelId: recommendedLocalEmbeddingModelManifest.modelId,
          })
        }
        onDeleteTopicPage={(id) => void deleteTopicPage(id)}
        onDeleteImageGenerationHistory={(id) => void handleDeleteImageGenerationHistory(id)}
        onCloseCommandPalette={() => dispatch({ type: "CLOSE_COMMAND_PALETTE" })}
        onComposerInputChange={handleComposerInputChange}
        onExecuteCommand={handleExecuteCommand}
        onKeepPreviousPage={handleKeepPreviousPage}
        onOpenChatHistory={openChatHistory}
        onOpenChatSession={(sessionId) => void loadChatSession(sessionId)}
        onOpenDetail={(id) => void openDetail(id)}
        onOpenKnowledgeBase={() => void openKnowledgeBase()}
        onOpenResearchPlanner={() => void openResearchPlanner()}
        onOpenMarkdownPreview={(messageId) =>
          dispatch({ type: "SHOW_MARKDOWN_PREVIEW", messageId })
        }
        onReplySuggestion={handleReplySuggestion}
        onToggleCitationExcerpt={(messageId, citationId) =>
          dispatch({ type: "TOGGLE_CITATION_EXCERPT", messageId, citationId })
        }
        onCloseMarkdownPreview={() => dispatch({ type: "CLOSE_MARKDOWN_PREVIEW" })}
        onCopyMarkdownPreview={(content) => void handleCopyMarkdownPreview(content)}
        onCopyMarkdownText={(content) => void handleCopyMarkdownText(content)}
        onOpenMarkdownSource={handleOpenMarkdownSource}
        onOpenRelatedMemory={(id) => void openDetail(id)}
        onOpenSettings={openSettings}
        onImagePromptPrefillConsumed={() => dispatch({ type: "CLEAR_IMAGE_PROMPT_PREFILL" })}
        onOpenSource={(memory) => void openSource(memory)}
        onKnowledgeBaseFilterChange={setKnowledgeBaseFilter}
        onPinWorkingSetSource={(sourceId, loadDepth) =>
          void pinWorkingSetSource(sourceId, loadDepth)
        }
        onEvictWorkingSetSource={(sourceId) => void evictWorkingSetSource(sourceId)}
        onSetWorkingSetSourceDepth={(sourceId, loadDepth) =>
          void setWorkingSetSourceDepth(sourceId, loadDepth)
        }
        onReloadWorkingSetSource={(sourceId, loadDepth) =>
          void reloadWorkingSetSource(sourceId, loadDepth)
        }
        onRunChunkMetaTier2Job={(sourceId, maxChunks) =>
          void runChunkMetaTier2Job(sourceId, maxChunks)
        }
        onRunSourceGraphJob={(sourceId) => void runSourceGraphJob(sourceId)}
        onCancelOrchestrationRun={(runId) => void cancelOrchestrationRun(runId)}
        onRetryOrchestrationRun={(runId) => void retryOrchestrationRun(runId)}
        onRefreshOrchestrationRuns={() => void loadOrchestrationRuns()}
        onRefreshChunkMetaTier2Audit={() => void loadChunkMetaTier2Audit()}
        onRefreshSourceContextCompressionLogs={() =>
          void loadSourceContextCompressionLogs(railState.activeSessionId)
        }
        onRefreshSourceContextMapArtifacts={() =>
          void loadSourceContextMapArtifacts(railState.activeSessionId)
        }
        onCancelSourceContextMapRun={(runId) => void cancelSourceContextMapRun(runId)}
        onRetrySourceContextMapRun={(runId) => void retrySourceContextMapRun(runId)}
        onResumeSourceContextMapRun={(runId) => void resumeSourceContextMapRun(runId)}
        onRefreshSourceContextMapRuns={() =>
          void loadSourceContextMapRuns(railState.activeSessionId)
        }
        onSelectSourceContextPlannerSource={selectSourceContextPlannerSource}
        onRemoveSourceContextPlannerSource={removeSourceContextPlannerSource}
        onSetSourceContextPlannerSourceDepth={setSourceContextPlannerSourceDepth}
        onSourceContextPlannerBudgetChange={changeSourceContextPlannerBudget}
        onPreviewSourceContextPlanner={(query) => void previewSourceContextPlanner(query)}
        onStartSourceContextPlannerResearch={startSourceContextPlannerResearch}
        onOpenTopicPage={(id) => void openTopicDetail(id)}
        onCreateTopicPage={() => void createTopicPage()}
        onCancelTopicForm={() => setTopicFormOpen(false)}
        onEditTopicPage={(page) => editTopicPage(page)}
        onSaveTopicPage={(form, id) => void saveTopicPage(form, id)}
        onTopicFormChange={setTopicForm}
        onWikiCompileFormChange={setWikiCompileForm}
        onCompileTopicWithAI={(form, topicId) => void compileTopicWithAI(form, topicId)}
        onOpenTopicSource={(memoryId) => void openTopicSource(memoryId)}
        onQueryChange={(query) => dispatch({ type: "SET_QUERY", query })}
        onKnowledgeBaseSearchModeChange={setKnowledgeBaseSearchMode}
        onKnowledgeBaseStrengthChange={handleKnowledgeBaseStrengthChange}
        onRefresh={() => void loadLibrary(railState.query, { background: true })}
        onRefreshProvider={refreshSettingsProviders}
        onRuntimeStatus={(message) => dispatch({ type: "SET_RUNTIME_STATUS", message })}
        onRetryDialogue={handleRetryDialogue}
        onResizePointerDown={handleResizePointerDown}
        onSavePage={() => void savePage()}
        onSaveSelection={() => void saveSelection()}
        onSaveSelectionFromHome={() => void saveSelectionFromAgentHome()}
        onUploadKnowledgeFiles={(files) => void uploadKnowledgeFiles(files)}
        onSearchSelection={() => void searchSelection()}
        onAskSelection={askSelection}
        onNoteSelection={noteSelection}
        onSubmitDialogue={handleSubmitDialogue}
        onStopInterruptedDialogue={handleStopInterruptedDialogue}
        onSwitchToLatestPage={handleAcceptPageChange}
        onToggleCommandPalette={toggleCommandPalette}
        onToolboxSkill={handleToolboxSkill}
        onSaveGeminiProvider={saveGeminiProvider}
        onSaveOpenAICompatibleProvider={saveOpenAICompatibleProvider}
        onSaveOpenAIProvider={saveOpenAIProvider}
        onSaveImageGenerationSettings={saveImageGenerationSettings}
        onSaveSearchProvider={saveSearchProvider}
        onSaveVisionProviderSettings={saveVisionProviderSettings}
        onInstallLocalEmbeddingModel={() =>
          runLocalEmbeddingAction({
            kind: "installLocalEmbeddingModel",
            modelId: recommendedLocalEmbeddingModelManifest.modelId,
          })
        }
        onInitializeTestWorkspace={initializeLocalTestWorkspace}
        onSelectProvider={selectProvider}
        onRemoveTestWorkspace={removeLocalTestWorkspace}
        onClearWebSearchHistory={handleClearWebSearchHistory}
        onDeleteWebSearchHistory={(id) => void handleDeleteWebSearchHistory(id)}
        onOpenWebSearchHistory={handleOpenWebSearchHistory}
        onOpenWebSearchSource={handleOpenWebSearchSource}
        onSubmitImageGeneration={handleSubmitImageGeneration}
        onSubmitWebSearch={handleSubmitWebSearch}
        onTestGeminiProvider={testGeminiProvider}
        onTestLocalEmbeddingModel={() =>
          runLocalEmbeddingAction({
            kind: "testLocalEmbeddingModel",
            modelId: recommendedLocalEmbeddingModelManifest.modelId,
          })
        }
        onRetryLocalEmbeddingInstall={() =>
          runLocalEmbeddingAction({
            kind: "retryLocalEmbeddingModelInstall",
            modelId: recommendedLocalEmbeddingModelManifest.modelId,
          })
        }
        onTestOpenAICompatibleProvider={testOpenAICompatibleProvider}
        onTestOpenAIProvider={testOpenAIProvider}
        providerLoading={providerLoading}
        providerMessage={providerMessage}
        providerMessageTone={providerMessageTone}
        providerSettings={providerSettings}
        railCommands={railCommands}
        railTheme={railTheme}
        railWidth={clampedRailWidth}
        relatedItems={relatedItems}
        searchProviderSettings={searchProviderSettings}
        slashCommands={slashCommands}
        slashContext={slashContext}
        state={railState}
        onThemeChange={changeRailTheme}
        webSearchHistory={webSearchHistory}
        webSearchState={webSearchState}
        visionProviderSettings={visionProviderSettings}
      />
      {toast !== null ? <Toast toast={toast} /> : null}
    </div>
  );
}
