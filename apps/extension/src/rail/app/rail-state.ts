import type {
  AgentErrorInfo,
  AgentScope,
  AgentStreamEvent,
  AgentToolTrace,
  LocalCitation,
} from "@/src/agent-runtime/types";
import type { ReplyActionSuggestion } from "@/src/suggestions/suggestion-types";
import type { ExplicitToolTrace } from "@/src/tool-routing/tool-route-types";

export type RailMode =
  | "collapsed"
  | "agent-home"
  | "knowledge-base"
  | "memory-detail"
  | "chat-history"
  | "web-search"
  | "image-gen"
  | "markdown-preview"
  | "settings"
  | "degraded"
  | "error";

export type ComposerScope = AgentScope;

export interface PageContext {
  url: string;
  title: string;
}

export interface SelectionSnapshot {
  text: string;
  sourceUrl: string;
  sourceTitle: string;
  contextBefore: string;
  contextAfter: string;
  capturedAt: string;
  xpath?: string;
  textFragment?: string;
}

export interface RailDialogueMessage {
  id: string;
  role: "user" | "assistant" | "evidence";
  content: string;
  createdAt: string;
  scope: ComposerScope;
  status: RailDialogueMessageStatus;
  pageUrl?: string;
  pageTitle?: string;
  selectionText?: string;
  citations: LocalCitation[];
  worldKnowledge: string[];
  thinkingTrace?: string;
  toolTraces?: AgentToolTrace[];
  replySuggestions?: ReplyActionSuggestion[];
  explicitToolTraces?: ExplicitToolTrace[];
  error?: AgentErrorInfo;
  retryRequest?: RailDialogueRetryRequest;
  expandedCitationId?: string;
  skillRequest?: RailSkillRequestDisplay;
}

export type ComposerSkillModeId = "translate" | "summarize" | "extract" | "rewrite";

export interface ComposerSkillMode {
  id: ComposerSkillModeId;
  label: string;
  placeholder: string;
  instruction: string;
}

export interface RailSkillRequestDisplay {
  skillId: ComposerSkillModeId;
  skillLabel: string;
  source: "Text" | "Page" | "Selection";
  instruction?: string;
}

export type RailDialogueMessageStatus =
  | "queued"
  | "streaming"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface RailDialogueRetryRequest {
  question: string;
  scope: ComposerScope;
  pageUrl?: string;
  selectionText?: string;
}

export interface ActiveAgentRun {
  runId: string;
  userMessageId: string;
  assistantMessageId: string;
}

export interface ComposerPrefill {
  id: string;
  content: string;
}

export interface ImagePromptPrefill {
  id: string;
  content: string;
}

export interface ComposerAttachmentRequest {
  id: string;
  kind: "selection";
}

export interface RuntimeStatusLine {
  message: string;
  running: boolean;
}

export interface RailState {
  mode: RailMode;
  previousMode: RailMode;
  query: string;
  highlightedMemoryId?: string;
  detailMemoryId?: string;
  selectionSnapshot?: SelectionSnapshot;
  activePageContext: PageContext;
  observedPageContext: PageContext;
  pendingPageChange?: PageContext;
  preservingPreviousPageContext: boolean;
  activeSessionId?: string;
  dialogueMessages: RailDialogueMessage[];
  activeAgentRun?: ActiveAgentRun;
  composerPrefill?: ComposerPrefill;
  imagePromptPrefill?: ImagePromptPrefill;
  previewMessageId?: string;
  composerAttachmentRequest?: ComposerAttachmentRequest;
  composerSkillMode?: ComposerSkillMode;
  commandPaletteOpen: boolean;
  commandPaletteQuery: string;
  runtimeStatus?: RuntimeStatusLine;
  loading: boolean;
  errorMessage?: string;
}

export type RailEvent =
  | { type: "OPEN_HOME"; preferSelection?: boolean }
  | { type: "COLLAPSE" }
  | { type: "TOGGLE" }
  | { type: "SHOW_KNOWLEDGE_BASE"; query?: string; highlightedMemoryId?: string }
  | { type: "SHOW_DETAIL"; memoryId: string }
  | { type: "SHOW_CHAT_HISTORY" }
  | { type: "SHOW_WEB_SEARCH" }
  | { type: "SHOW_IMAGE_GEN"; prompt?: string; idSeed?: string }
  | { type: "SHOW_MARKDOWN_PREVIEW"; messageId: string }
  | { type: "CLOSE_MARKDOWN_PREVIEW" }
  | { type: "SHOW_SETTINGS" }
  | { type: "SET_QUERY"; query: string }
  | { type: "SET_HIGHLIGHT"; memoryId?: string }
  | { type: "SET_SELECTION_SNAPSHOT"; snapshot: SelectionSnapshot }
  | { type: "CLEAR_SELECTION_SNAPSHOT" }
  | { type: "ATTACH_SELECTION_TO_COMPOSER"; snapshot: SelectionSnapshot; idSeed: string }
  | { type: "CLEAR_COMPOSER_ATTACHMENT_REQUEST" }
  | { type: "PREFILL_COMPOSER"; content: string; idSeed: string }
  | { type: "CLEAR_COMPOSER_PREFILL" }
  | { type: "CLEAR_IMAGE_PROMPT_PREFILL" }
  | { type: "SET_COMPOSER_SKILL_MODE"; mode: ComposerSkillMode }
  | { type: "CLEAR_COMPOSER_SKILL_MODE" }
  | { type: "OPEN_COMMAND_PALETTE" }
  | { type: "CLOSE_COMMAND_PALETTE" }
  | { type: "TOGGLE_COMMAND_PALETTE" }
  | { type: "SET_COMMAND_PALETTE_QUERY"; query: string }
  | {
      type: "START_AGENT_RUN";
      content: string;
      now: string;
      idSeed: string;
      scope: ComposerScope;
      selectionText?: string;
      sessionId?: string;
      skillRequest?: RailSkillRequestDisplay;
    }
  | {
      type: "LOAD_CHAT_SESSION";
      sessionId: string;
      messages: RailDialogueMessage[];
      activeRun?: ActiveAgentRun;
    }
  | { type: "SET_ACTIVE_AGENT_RUN"; activeRun?: ActiveAgentRun }
  | { type: "SET_RUNTIME_STATUS"; message: string; running?: boolean }
  | { type: "CLEAR_RUNTIME_STATUS" }
  | { type: "APPLY_AGENT_EVENT"; event: AgentStreamEvent }
  | { type: "AGENT_TRANSPORT_ERROR"; runId: string; error: AgentErrorInfo }
  | { type: "CLEAR_DIALOGUE" }
  | { type: "TOGGLE_CITATION_EXCERPT"; messageId: string; citationId: string }
  | { type: "SET_REPLY_SUGGESTIONS"; messageId: string; suggestions: ReplyActionSuggestion[] }
  | { type: "CLEAR_REPLY_SUGGESTIONS"; messageId: string }
  | { type: "ADD_EXPLICIT_TOOL_TRACE"; messageId: string; trace: ExplicitToolTrace }
  | { type: "OBSERVE_PAGE_CHANGE"; page: PageContext }
  | { type: "ACCEPT_PAGE_CHANGE" }
  | { type: "KEEP_PREVIOUS_PAGE" }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "GO_DEGRADED"; reason: string }
  | { type: "ERROR"; message: string }
  | { type: "CLEAR_ERROR" };

export const agentRuntimeStatusMessage = "Attach page or selection when needed.";
const maxThinkingTraceLength = 480;

export function createInitialRailState(pageContext: PageContext): RailState {
  return {
    mode: "collapsed",
    previousMode: "agent-home",
    query: "",
    activePageContext: pageContext,
    observedPageContext: pageContext,
    preservingPreviousPageContext: false,
    dialogueMessages: [],
    commandPaletteOpen: false,
    commandPaletteQuery: "",
    loading: false,
  };
}

export function isRailExpanded(state: RailState) {
  return state.mode !== "collapsed";
}

export function getComposerScope(): ComposerScope {
  return "general";
}

export function isUnresolvedInterruptedAssistantMessage(message: RailDialogueMessage) {
  return (
    message.role === "assistant" &&
    message.retryRequest !== undefined &&
    (message.status === "failed" || message.status === "interrupted")
  );
}

export function findUnresolvedInterruptedAssistantMessage(messages: RailDialogueMessage[]) {
  return messages.find(isUnresolvedInterruptedAssistantMessage);
}

export function hasUnresolvedInterruptedAnswer(state: RailState) {
  return findUnresolvedInterruptedAssistantMessage(state.dialogueMessages) !== undefined;
}

export function reduceRailState(state: RailState, event: RailEvent): RailState {
  switch (event.type) {
    case "OPEN_HOME":
      return {
        ...state,
        mode: "agent-home",
        previousMode: state.mode === "collapsed" ? state.previousMode : state.mode,
        detailMemoryId: undefined,
        previewMessageId: undefined,
        errorMessage: undefined,
      };
    case "COLLAPSE":
      return {
        ...state,
        mode: "collapsed",
        previousMode: state.mode === "collapsed" ? state.previousMode : state.mode,
        commandPaletteOpen: false,
        commandPaletteQuery: "",
      };
    case "TOGGLE":
      if (state.mode === "collapsed") {
        return {
          ...state,
          mode: "agent-home",
          detailMemoryId: undefined,
          previewMessageId: undefined,
          errorMessage: undefined,
        };
      }
      return {
        ...state,
        mode: "collapsed",
        previousMode: state.mode,
        commandPaletteOpen: false,
        commandPaletteQuery: "",
      };
    case "SHOW_KNOWLEDGE_BASE":
      return {
        ...state,
        mode: "knowledge-base",
        previousMode: state.mode === "collapsed" ? state.previousMode : state.mode,
        detailMemoryId: undefined,
        previewMessageId: undefined,
        composerSkillMode: undefined,
        query: event.query ?? state.query,
        highlightedMemoryId: event.highlightedMemoryId ?? state.highlightedMemoryId,
        errorMessage: undefined,
      };
    case "SHOW_DETAIL":
      return {
        ...state,
        mode: "memory-detail",
        previousMode: state.mode === "collapsed" ? state.previousMode : state.mode,
        detailMemoryId: event.memoryId,
        previewMessageId: undefined,
        composerSkillMode: undefined,
        highlightedMemoryId: event.memoryId,
        errorMessage: undefined,
      };
    case "SHOW_CHAT_HISTORY":
      return {
        ...state,
        mode: "chat-history",
        previousMode: state.mode === "collapsed" ? state.previousMode : state.mode,
        detailMemoryId: undefined,
        previewMessageId: undefined,
        composerSkillMode: undefined,
        errorMessage: undefined,
      };
    case "SHOW_WEB_SEARCH":
      return {
        ...state,
        mode: "web-search",
        previousMode: state.mode === "collapsed" ? state.previousMode : state.mode,
        detailMemoryId: undefined,
        previewMessageId: undefined,
        composerSkillMode: undefined,
        errorMessage: undefined,
      };
    case "SHOW_IMAGE_GEN": {
      const prompt = event.prompt?.trim();
      const { imagePromptPrefill: _imagePromptPrefill, ...rest } = state;
      return {
        ...rest,
        mode: "image-gen",
        previousMode: state.mode === "collapsed" ? state.previousMode : state.mode,
        detailMemoryId: undefined,
        previewMessageId: undefined,
        composerSkillMode: undefined,
        errorMessage: undefined,
        ...(prompt === undefined || prompt.length === 0
          ? {}
          : {
              imagePromptPrefill: {
                id: event.idSeed ?? `${Date.now().toString(36)}`,
                content: prompt,
              },
            }),
      };
    }
    case "SHOW_MARKDOWN_PREVIEW":
      return {
        ...state,
        mode: "markdown-preview",
        previousMode: state.mode === "collapsed" ? state.previousMode : state.mode,
        detailMemoryId: undefined,
        previewMessageId: event.messageId,
        composerSkillMode: undefined,
        commandPaletteOpen: false,
        commandPaletteQuery: "",
        errorMessage: undefined,
      };
    case "CLOSE_MARKDOWN_PREVIEW":
      return {
        ...state,
        mode: "agent-home",
        previousMode: state.mode === "collapsed" ? state.previousMode : state.mode,
        previewMessageId: undefined,
        commandPaletteOpen: false,
        commandPaletteQuery: "",
        errorMessage: undefined,
      };
    case "SHOW_SETTINGS":
      return {
        ...state,
        mode: "settings",
        previousMode: state.mode === "collapsed" ? state.previousMode : state.mode,
        detailMemoryId: undefined,
        previewMessageId: undefined,
        composerSkillMode: undefined,
        commandPaletteOpen: false,
        commandPaletteQuery: "",
        errorMessage: undefined,
      };
    case "SET_QUERY":
      return { ...state, query: event.query };
    case "SET_HIGHLIGHT":
      return { ...state, highlightedMemoryId: event.memoryId };
    case "SET_SELECTION_SNAPSHOT":
      return { ...state, selectionSnapshot: event.snapshot };
    case "CLEAR_SELECTION_SNAPSHOT": {
      const {
        selectionSnapshot: _selectionSnapshot,
        composerAttachmentRequest: _composerAttachmentRequest,
        ...rest
      } = state;
      return rest;
    }
    case "ATTACH_SELECTION_TO_COMPOSER":
      return {
        ...state,
        mode: "agent-home",
        detailMemoryId: undefined,
        previewMessageId: undefined,
        errorMessage: undefined,
        selectionSnapshot: event.snapshot,
        composerAttachmentRequest: {
          id: event.idSeed,
          kind: "selection",
        },
      };
    case "CLEAR_COMPOSER_ATTACHMENT_REQUEST": {
      const { composerAttachmentRequest: _composerAttachmentRequest, ...rest } = state;
      return rest;
    }
    case "PREFILL_COMPOSER": {
      const content = event.content.trim();
      if (content.length === 0) return state;
      return {
        ...state,
        mode: "agent-home",
        detailMemoryId: undefined,
        previewMessageId: undefined,
        errorMessage: undefined,
        composerPrefill: {
          id: event.idSeed,
          content,
        },
        composerSkillMode: undefined,
      };
    }
    case "CLEAR_COMPOSER_PREFILL": {
      const { composerPrefill: _composerPrefill, ...rest } = state;
      return rest;
    }
    case "CLEAR_IMAGE_PROMPT_PREFILL": {
      const { imagePromptPrefill: _imagePromptPrefill, ...rest } = state;
      return rest;
    }
    case "SET_COMPOSER_SKILL_MODE":
      return {
        ...state,
        mode: "agent-home",
        detailMemoryId: undefined,
        previewMessageId: undefined,
        errorMessage: undefined,
        composerSkillMode: event.mode,
      };
    case "CLEAR_COMPOSER_SKILL_MODE": {
      const { composerSkillMode: _composerSkillMode, ...rest } = state;
      return rest;
    }
    case "OPEN_COMMAND_PALETTE":
      return {
        ...state,
        mode: state.mode === "collapsed" ? "agent-home" : state.mode,
        detailMemoryId: state.mode === "collapsed" ? undefined : state.detailMemoryId,
        errorMessage: undefined,
        commandPaletteOpen: true,
      };
    case "CLOSE_COMMAND_PALETTE":
      return {
        ...state,
        commandPaletteOpen: false,
        commandPaletteQuery: "",
      };
    case "TOGGLE_COMMAND_PALETTE":
      if (state.commandPaletteOpen) {
        return {
          ...state,
          commandPaletteOpen: false,
          commandPaletteQuery: "",
        };
      }
      return {
        ...state,
        mode: state.mode === "collapsed" ? "agent-home" : state.mode,
        detailMemoryId: state.mode === "collapsed" ? undefined : state.detailMemoryId,
        errorMessage: undefined,
        commandPaletteOpen: true,
      };
    case "SET_COMMAND_PALETTE_QUERY":
      return {
        ...state,
        commandPaletteQuery: event.query,
      };
    case "START_AGENT_RUN": {
      const content = event.content.trim();
      if (content.length === 0) return state;
      const runId = event.idSeed;
      const userMessageId = `${event.idSeed}:user`;
      const assistantMessageId = `${event.idSeed}:assistant`;
      const userMessage: RailDialogueMessage = {
        id: userMessageId,
        role: "user",
        content,
        createdAt: event.now,
        scope: event.scope,
        status: "completed",
        pageUrl: state.activePageContext.url,
        pageTitle: state.activePageContext.title,
        selectionText: event.selectionText,
        citations: [],
        worldKnowledge: [],
        skillRequest: event.skillRequest,
      };
      const assistantMessage: RailDialogueMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: event.now,
        scope: event.scope,
        status: "streaming",
        pageUrl: state.activePageContext.url,
        pageTitle: state.activePageContext.title,
        selectionText: event.selectionText,
        citations: [],
        worldKnowledge: [],
        toolTraces: [],
        replySuggestions: [],
        explicitToolTraces: [],
        retryRequest: {
          question: content,
          scope: event.scope,
          pageUrl: state.activePageContext.url,
          selectionText: event.selectionText,
        },
      };
      return {
        ...state,
        mode: "agent-home",
        dialogueMessages: [...state.dialogueMessages, userMessage, assistantMessage],
        previewMessageId: undefined,
        runtimeStatus: undefined,
        activeSessionId: event.sessionId ?? state.activeSessionId,
        activeAgentRun: {
          runId,
          userMessageId,
          assistantMessageId,
        },
        composerSkillMode: undefined,
        composerAttachmentRequest: undefined,
      };
    }
    case "LOAD_CHAT_SESSION":
      if (event.activeRun === undefined) {
        const {
          activeAgentRun: _activeAgentRun,
          composerAttachmentRequest: _composerAttachmentRequest,
          composerSkillMode: _composerSkillMode,
          previewMessageId: _previewMessageId,
          runtimeStatus: _runtimeStatus,
          ...rest
        } = state;
        return {
          ...rest,
          mode: "agent-home",
          activeSessionId: event.sessionId,
          dialogueMessages: event.messages,
        };
      }
      return {
        ...state,
        mode: "agent-home",
        activeSessionId: event.sessionId,
        dialogueMessages: event.messages,
        activeAgentRun: event.activeRun,
        composerAttachmentRequest: undefined,
        composerSkillMode: undefined,
        previewMessageId: undefined,
        runtimeStatus: undefined,
      };
    case "SET_ACTIVE_AGENT_RUN": {
      if (event.activeRun === undefined) {
        const { activeAgentRun: _activeAgentRun, runtimeStatus: _runtimeStatus, ...rest } = state;
        return rest;
      }
      return {
        ...state,
        activeAgentRun: event.activeRun,
        runtimeStatus: undefined,
      };
    }
    case "SET_RUNTIME_STATUS":
      return {
        ...state,
        runtimeStatus: {
          message: event.message,
          running: event.running === true,
        },
      };
    case "CLEAR_RUNTIME_STATUS": {
      const { runtimeStatus: _runtimeStatus, ...rest } = state;
      return rest;
    }
    case "APPLY_AGENT_EVENT":
      return applyAgentStreamEvent(state, event.event);
    case "AGENT_TRANSPORT_ERROR":
      return applyAgentStreamEvent(state, {
        type: "run_failed",
        runId: event.runId,
        error: event.error,
      });
    case "CLEAR_DIALOGUE": {
      const {
        activeAgentRun: _activeAgentRun,
        activeSessionId: _activeSessionId,
        previewMessageId: _previewMessageId,
        runtimeStatus: _runtimeStatus,
        ...rest
      } = state;
      return {
        ...rest,
        dialogueMessages: [],
      };
    }
    case "SET_REPLY_SUGGESTIONS":
      return {
        ...state,
        dialogueMessages: state.dialogueMessages.map((message) =>
          message.id !== event.messageId || message.role !== "assistant"
            ? message
            : {
                ...message,
                replySuggestions: event.suggestions,
              },
        ),
      };
    case "CLEAR_REPLY_SUGGESTIONS":
      return {
        ...state,
        dialogueMessages: state.dialogueMessages.map((message) => {
          if (message.id !== event.messageId || message.replySuggestions === undefined) {
            return message;
          }
          const { replySuggestions: _replySuggestions, ...rest } = message;
          return rest;
        }),
      };
    case "ADD_EXPLICIT_TOOL_TRACE":
      return {
        ...state,
        dialogueMessages: state.dialogueMessages.map((message) =>
          message.id !== event.messageId || message.role !== "assistant"
            ? message
            : {
                ...message,
                explicitToolTraces: upsertExplicitToolTrace(
                  message.explicitToolTraces ?? [],
                  event.trace,
                ),
              },
        ),
      };
    case "TOGGLE_CITATION_EXCERPT":
      return {
        ...state,
        dialogueMessages: state.dialogueMessages.map((message) => {
          if (message.id !== event.messageId) return message;
          return {
            ...message,
            expandedCitationId:
              message.expandedCitationId === event.citationId ? undefined : event.citationId,
          };
        }),
      };
    case "OBSERVE_PAGE_CHANGE": {
      if (samePageContext(state.observedPageContext, event.page)) return state;
      if (state.mode === "collapsed") {
        const {
          selectionSnapshot: _selectionSnapshot,
          pendingPageChange: _pending,
          composerAttachmentRequest: _composerAttachmentRequest,
          ...rest
        } = state;
        return {
          ...rest,
          activePageContext: event.page,
          observedPageContext: event.page,
          preservingPreviousPageContext: false,
        };
      }
      const pending =
        !state.preservingPreviousPageContext &&
        !samePageContext(state.activePageContext, event.page)
          ? event.page
          : undefined;
      return {
        ...state,
        observedPageContext: event.page,
        ...(pending === undefined ? {} : { pendingPageChange: pending }),
      };
    }
    case "ACCEPT_PAGE_CHANGE": {
      const nextPage = state.pendingPageChange ?? state.observedPageContext;
      const {
        pendingPageChange: _pendingPageChange,
        selectionSnapshot: _selectionSnapshot,
        composerPrefill: _composerPrefill,
        imagePromptPrefill: _imagePromptPrefill,
        composerAttachmentRequest: _composerAttachmentRequest,
        activeAgentRun: _activeAgentRun,
        activeSessionId: _activeSessionId,
        composerSkillMode: _composerSkillMode,
        previewMessageId: _previewMessageId,
        ...rest
      } = state;
      return {
        ...rest,
        activePageContext: nextPage,
        observedPageContext: nextPage,
        preservingPreviousPageContext: false,
        dialogueMessages: [],
        commandPaletteOpen: false,
        commandPaletteQuery: "",
        runtimeStatus: undefined,
      };
    }
    case "KEEP_PREVIOUS_PAGE": {
      const { pendingPageChange: _pendingPageChange, ...rest } = state;
      return {
        ...rest,
        preservingPreviousPageContext: true,
      };
    }
    case "SET_LOADING":
      return { ...state, loading: event.loading };
    case "GO_DEGRADED":
      return {
        ...state,
        mode: "degraded",
        errorMessage: event.reason,
      };
    case "ERROR":
      return {
        ...state,
        mode: "error",
        errorMessage: event.message,
      };
    case "CLEAR_ERROR": {
      const { errorMessage: _errorMessage, ...rest } = state;
      return rest;
    }
    default:
      return assertNever(event);
  }
}

function samePageContext(left: PageContext, right: PageContext) {
  return left.url === right.url && left.title === right.title;
}

function applyAgentStreamEvent(state: RailState, event: AgentStreamEvent): RailState {
  const activeRun = state.activeAgentRun;
  if (activeRun === undefined || activeRun.runId !== event.runId) return state;
  if (event.type === "runtime_status") {
    return {
      ...state,
      runtimeStatus: {
        message: event.message,
        running: event.running === true,
      },
    };
  }
  if (event.type === "run_resolved") {
    const { activeAgentRun: _activeAgentRun, ...rest } = state;
    return {
      ...rest,
      dialogueMessages:
        event.removeAssistantMessageId === undefined
          ? state.dialogueMessages
          : state.dialogueMessages.filter(
              (message) => message.id !== event.removeAssistantMessageId,
            ),
      runtimeStatus:
        event.message === undefined ? undefined : { message: event.message, running: false },
    };
  }

  const dialogueMessages = state.dialogueMessages.map((message) => {
    if (message.id !== activeRun.assistantMessageId) return message;
    return reduceAssistantMessage(message, event);
  });

  const nextState = {
    ...state,
    dialogueMessages,
    runtimeStatus: event.type === "run_started" ? undefined : state.runtimeStatus,
  };
  if (isTerminalAgentEvent(event)) {
    const { activeAgentRun: _activeAgentRun, ...rest } = nextState;
    return rest;
  }
  return nextState;
}

function reduceAssistantMessage(
  message: RailDialogueMessage,
  event: AgentStreamEvent,
): RailDialogueMessage {
  switch (event.type) {
    case "run_started":
      return {
        ...message,
        status: "streaming",
        error: undefined,
        thinkingTrace: undefined,
        toolTraces: [],
        replySuggestions: [],
        explicitToolTraces: [],
      };
    case "thinking_delta": {
      const thinkingTrace = appendThinkingTrace(message.thinkingTrace, event.delta);
      if (thinkingTrace === message.thinkingTrace) return message;
      return {
        ...message,
        thinkingTrace,
      };
    }
    case "tool_trace":
      return {
        ...message,
        toolTraces: upsertToolTrace(message.toolTraces ?? [], event.trace),
      };
    case "text_delta":
      return {
        ...message,
        content: `${message.content}${event.delta}`,
      };
    case "citation": {
      if (message.citations.some((citation) => citation.id === event.citation.id)) return message;
      return {
        ...message,
        citations: [...message.citations, event.citation],
      };
    }
    case "world_knowledge":
      if (message.worldKnowledge.includes(event.note)) return message;
      return {
        ...message,
        worldKnowledge: [...message.worldKnowledge, event.note],
      };
    case "run_completed":
      return {
        ...message,
        status: "completed",
      };
    case "run_failed":
      return {
        ...message,
        status: "failed",
        error: event.error,
      };
    case "run_cancelled": {
      const { retryRequest: _retryRequest, ...rest } = message;
      return {
        ...rest,
        status: "cancelled",
        error: {
          code: "CANCELLED",
          message: event.reason ?? "Response stopped.",
        },
      };
    }
    case "runtime_status":
    case "run_resolved":
      return message;
    default:
      return assertNever(event);
  }
}

function appendThinkingTrace(current: string | undefined, delta: string) {
  const next = normalizeTraceText(`${current ?? ""}${delta}`);
  if (next.length <= maxThinkingTraceLength) return next;
  return `${next.slice(0, maxThinkingTraceLength - 3).trimEnd()}...`;
}

function normalizeTraceText(value: string) {
  return value.replace(/\s+/g, " ").trimStart();
}

function upsertToolTrace(traces: AgentToolTrace[], trace: AgentToolTrace) {
  const index = traces.findIndex((item) => item.toolCallId === trace.toolCallId);
  if (index < 0) return [...traces, trace];
  return traces.map((item, itemIndex) => (itemIndex === index ? trace : item));
}

function upsertExplicitToolTrace(traces: ExplicitToolTrace[], trace: ExplicitToolTrace) {
  const index = traces.findIndex((item) => item.id === trace.id);
  if (index < 0) return [...traces, trace];
  return traces.map((item, itemIndex) => (itemIndex === index ? trace : item));
}

function isTerminalAgentEvent(event: AgentStreamEvent) {
  return (
    event.type === "run_completed" ||
    event.type === "run_failed" ||
    event.type === "run_cancelled" ||
    event.type === "run_resolved"
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled rail event: ${JSON.stringify(value)}`);
}
