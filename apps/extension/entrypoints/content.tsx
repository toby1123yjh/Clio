import type {
  ImageGenerationSettings,
  SaveImageGenerationSettingsInput,
} from "@/src/agent-runtime/image-generation-settings";
import {
  type ImageGenerationStreamController,
  openImageGenerationStream,
} from "@/src/agent-runtime/image-generation-stream-client";
import { assembleLocalRagEvidencePack } from "@/src/agent-runtime/local-rag-evidence";
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
  type AgentStreamController,
  openAgentStream,
  openManualCompactStream,
  subscribeAgentStream,
} from "@/src/agent-runtime/stream-client";
import type { AgentChatRequest, AgentStreamEvent, EvidenceItem } from "@/src/agent-runtime/types";
import {
  type WebSearchStreamController,
  openWebSearchStream,
} from "@/src/agent-runtime/web-search-stream-client";
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
  RailShell,
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
  type CaptureSelectionPayload,
  type ChatMessageRecord,
  type ChatSessionDetail,
  type ChatSessionSummary,
  type ClioImageGenerationEvent,
  type ClioWebSearchEvent,
  type ClioWebSearchResult,
  type ContentCommand,
  type CreateWikiCompileJobEventPayload,
  type EngineHealth,
  type ImageGenerationHistoryRecord,
  type MemoryDetail,
  type SearchMemoryItem,
  type TopicGraphEdge,
  type TopicPageDetail,
  type TopicPageSummary,
  type WebSearchHistoryRecord,
  type WikiCompileJobEvent,
  type WikiCompileJobSummary,
  isContentCommandMessage,
} from "@/src/shared/rpc";
import { excerpt, hashText, normalizeText } from "@/src/shared/text";
import {
  type ReplyActionSuggestion,
  type SuggestionCooldownState,
  suggestReplyActions,
} from "@/src/suggestions/suggestion-engine";
import {
  type ExplicitToolRouteKind,
  type ExplicitToolTrace,
  explicitToolRouteLabel,
} from "@/src/tool-routing/tool-route-types";
import styles from "@/src/ui/tailwind.css?inline";
import katexStyles from "katex/dist/katex.min.css?inline";
import * as React from "react";
import { createRoot } from "react-dom/client";

const commandEventName = "clio:content-command";
const relatedSearchLimit = 12;

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

interface SessionSuggestionCooldown {
  completedUserTurnCount: number;
  lastSuggestedTurnCount: number;
}

const defaultSuggestionCooldown: SuggestionCooldownState = {
  completedUserTurnsSinceLastSuggestion: 3,
};

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

function memoryDetailToAgentEvidence(memory: MemoryDetail): EvidenceItem {
  return {
    id: memory.id,
    sourceKind: "memory",
    sourceUrl: memory.sourceUrl,
    sourceTitle: memory.sourceTitle,
    text: memory.normalizedText,
    excerpt: memory.excerpt,
    ...(memory.anchor === undefined
      ? {}
      : {
          anchor: {
            selectedText: memory.anchor.selectedText,
            contextBefore: memory.anchor.contextBefore,
            contextAfter: memory.anchor.contextAfter,
            ...(memory.anchor.xpath === undefined ? {} : { xpath: memory.anchor.xpath }),
            ...(memory.anchor.textFragment === undefined
              ? {}
              : { textFragment: memory.anchor.textFragment }),
          },
        }),
  };
}

async function loadLocalRagEvidencePack(query: string): Promise<EvidenceItem[]> {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length === 0) return [];
  try {
    const search = await requestEngine({ kind: "searchMemory", query: normalizedQuery, limit: 8 });
    const memoryIds = search.items.map((item) => item.id).slice(0, 8);
    if (memoryIds.length === 0) return [];
    const memories = await Promise.all(
      memoryIds.map((id) => requestEngine({ kind: "getMemory", id })),
    );
    return assembleLocalRagEvidencePack({
      query: normalizedQuery,
      memories: memories.flatMap((memory) => (memory === null ? [] : [memory])),
      maxItems: 6,
      maxCharsPerItem: 1_200,
      maxTotalChars: 4_800,
    });
  } catch {
    return [];
  }
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
    style.textContent = `${styles}\n${katexStyles}`;
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
  const [health, setHealth] = React.useState<EngineHealth | null>(null);
  const [providerSettings, setProviderSettings] = React.useState<ProviderSettings | null>(null);
  const [searchProviderSettings, setSearchProviderSettings] =
    React.useState<SearchProviderSettings | null>(null);
  const [imageGenerationSettings, setImageGenerationSettings] =
    React.useState<ImageGenerationSettings | null>(null);
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
  const [toast, setToast] = React.useState<ToastState | null>(null);
  const [railWidth, setRailWidth] = React.useState(defaultRailWidth);
  const [railTheme, setRailTheme] = React.useState<RailTheme>(defaultRailTheme);
  const [collapsedLauncherPosition, setCollapsedLauncherPosition] =
    React.useState<CollapsedLauncherPosition>(defaultCollapsedLauncherPosition);
  const [collapsedLauncherDragPoint, setCollapsedLauncherDragPoint] =
    React.useState<CollapsedLauncherDragPoint | null>(null);
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
    };
  }, []);

  React.useEffect(() => {
    if (railState.runtimeStatus === undefined || railState.runtimeStatus.running) return;
    const timer = window.setTimeout(() => {
      dispatch({ type: "CLEAR_RUNTIME_STATUS" });
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [railState.runtimeStatus]);

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

  const loadLibrary = React.useCallback(
    async (nextQuery = railState.query) => {
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        const topicResult = await requestEngine({
          kind: "listTopicPages",
          query: nextQuery.trim().length > 0 ? nextQuery : undefined,
          limit: 40,
        });
        const wikiJobsResult = await requestEngine({
          kind: "listWikiCompileJobs",
          limit: 8,
        });
        const result =
          nextQuery.trim().length > 0
            ? await requestEngine({ kind: "searchMemory", query: nextQuery, limit: 40 })
            : await requestEngine({ kind: "listMemories", limit: 40 });
        setTopicPages(topicResult.items);
        setWikiCompileJobs(wikiJobsResult.jobs);
        if (wikiJobsResult.jobs[0] !== undefined) {
          await loadWikiCompileJobEvents(wikiJobsResult.jobs[0].id);
        } else {
          setWikiCompileJobEvents([]);
        }
        setItems(result.items.map(toSearchItem));
      } catch (error) {
        showToast(errorToast(error));
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    [loadWikiCompileJobEvents, railState.query, showToast],
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
    [loadChatHistory, maybeAttachReplySuggestions],
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
  }, [loadImageGenerationSettings, loadProviderSettings, loadSearchProviderSettings]);

  const refreshSettingsProviders = React.useCallback(async () => {
    const providerOk = await loadProviderSettings();
    const searchOk = await loadSearchProviderSettings();
    const imageOk = await loadImageGenerationSettings();
    return providerOk && searchOk && imageOk;
  }, [loadImageGenerationSettings, loadProviderSettings, loadSearchProviderSettings]);

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
        setProviderMessage("Gemini connection works.");
        return true;
      } catch (error) {
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
        setProviderMessage("OpenAI connection works.");
        return true;
      } catch (error) {
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
        setProviderMessage("OpenAI-compatible connection works.");
        return true;
      } catch (error) {
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
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        const next = await requestEngine({ kind: "getMemory", id });
        setDetail(next);
        dispatch({ type: "SHOW_DETAIL", memoryId: id });
      } catch (error) {
        showToast(errorToast(error));
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    [showToast],
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
        const evidenceDetails = await Promise.all(
          sourceMemoryIds.slice(0, 8).map((id) => requestEngine({ kind: "getMemory", id })),
        );
        const evidence = evidenceDetails
          .flatMap((memory) => (memory === null ? [] : [memoryDetailToAgentEvidence(memory)]))
          .slice(0, 8);
        await appendWikiCompileEvent(claimed.id, {
          kind: "sources_selected",
          level: evidence.length === 0 ? "warning" : "info",
          message:
            evidence.length === 0
              ? "No matching source memories found."
              : `${evidence.length} source memories selected.`,
          detail: {
            sourceMemoryCount: evidence.length,
            memoryIds: evidence.map((item) => item.id),
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
  }, [loadImageGenerationSettings, loadProviderSettings, loadSearchProviderSettings]);

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
    if (railState.mode !== "knowledge-base") return;
    const timer = window.setTimeout(() => {
      void loadLibrary(railState.query);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [loadLibrary, railState.mode, railState.query]);

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
    ) => {
      const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const now = new Date().toISOString();
      const pageContext = railState.activePageContext;
      const scope = forcedScope ?? scopeFromAttachment(attachmentKind);
      const skillRequest = buildSkillRequestDisplay({ content, attachmentKind, skillMode });
      const providerQuestion = buildSkillQuestion({ content, attachmentKind, skillMode });
      const displayContent = buildDisplayContent({ content, attachmentKind, skillMode });
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
      const localRagEvidence =
        scope === "general" ? await loadLocalRagEvidencePack(providerQuestion) : [];
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
    [attachActiveRun, loadChatHistory, maybeAttachReplySuggestions, railState, showToast],
  );

  const handleSubmitDialogue = React.useCallback(
    (content: string, attachment?: ComposerContextAttachmentKind) => {
      void startAgentRun(content, attachment, undefined, railState.composerSkillMode);
    },
    [railState.composerSkillMode, startAgentRun],
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
    [attachActiveRun, loadChatHistory, maybeAttachReplySuggestions, railState, showToast],
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
      }),
    [handleManualCompact, openImageGen],
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
        health={health}
        imageGenerationHistory={imageGenerationHistory}
        imageGenerationSettings={imageGenerationSettings}
        imageGenerationState={imageGenerationState}
        items={items}
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
          setDetail(null);
          dispatch({ type: "OPEN_HOME" });
        }}
        onBackToKnowledgeBase={() => {
          setDetail(null);
          dispatch({ type: "SHOW_KNOWLEDGE_BASE" });
        }}
        onCollapsedKeyDown={handleCollapsedKeyDown}
        onCollapsedPointerDown={handleCollapsedPointerDown}
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
        onOpenMarkdownPreview={(messageId) =>
          dispatch({ type: "SHOW_MARKDOWN_PREVIEW", messageId })
        }
        onReplySuggestion={handleReplySuggestion}
        onCloseMarkdownPreview={() => dispatch({ type: "CLOSE_MARKDOWN_PREVIEW" })}
        onCopyMarkdownPreview={(content) => void handleCopyMarkdownPreview(content)}
        onCopyMarkdownText={(content) => void handleCopyMarkdownText(content)}
        onOpenMarkdownSource={handleOpenMarkdownSource}
        onOpenRelatedMemory={(id) => void openDetail(id)}
        onOpenSettings={openSettings}
        onImagePromptPrefillConsumed={() => dispatch({ type: "CLEAR_IMAGE_PROMPT_PREFILL" })}
        onOpenSource={(memory) => void openSource(memory)}
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
        onRefresh={() => void loadLibrary(railState.query)}
        onRefreshProvider={refreshSettingsProviders}
        onRuntimeStatus={(message) => dispatch({ type: "SET_RUNTIME_STATUS", message })}
        onRetryDialogue={handleRetryDialogue}
        onResizePointerDown={handleResizePointerDown}
        onSavePage={() => void savePage()}
        onSaveSelection={() => void saveSelection()}
        onSaveSelectionFromHome={() => void saveSelectionFromAgentHome()}
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
        onSelectProvider={selectProvider}
        onClearWebSearchHistory={handleClearWebSearchHistory}
        onDeleteWebSearchHistory={(id) => void handleDeleteWebSearchHistory(id)}
        onOpenWebSearchHistory={handleOpenWebSearchHistory}
        onOpenWebSearchSource={handleOpenWebSearchSource}
        onSubmitImageGeneration={handleSubmitImageGeneration}
        onSubmitWebSearch={handleSubmitWebSearch}
        onTestGeminiProvider={testGeminiProvider}
        onTestOpenAICompatibleProvider={testOpenAICompatibleProvider}
        onTestOpenAIProvider={testOpenAIProvider}
        providerLoading={providerLoading}
        providerMessage={providerMessage}
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
      />
      {toast !== null ? <Toast toast={toast} /> : null}
    </div>
  );
}
