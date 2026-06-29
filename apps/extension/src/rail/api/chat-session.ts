import type { AgentChatRequest, AgentScope, EvidenceItem } from "@/src/agent-runtime/types";
import type { PageContext, RailSkillRequestDisplay } from "@/src/rail/app/rail-state";
import { requestEngine } from "@/src/shared/chrome-client";
import type {
  ChatMessageRecord,
  ChatSessionDetail,
  SessionEvidenceRecord,
  SourceKind,
} from "@/src/shared/rpc";
import { excerpt, normalizeSourceUrl, normalizeText } from "@/src/shared/text";

const activeSessionPrefix = "clio:active-session:";
const railOwnerIdKey = "clio:rail-owner-id";

export type ComposerContextAttachmentKind = "page" | "selection";

export interface StartSessionTurnInput {
  sessionId?: string;
  ownerId: string;
  question: string;
  displayContent?: string;
  scope: AgentScope;
  pageContext: PageContext;
  selectionText?: string;
  evidence: EvidenceItem[];
  attachedEvidence?: EvidenceItem;
  skillRequest?: RailSkillRequestDisplay;
  createdAt: string;
  runId: string;
}

export interface StartSessionTurnResult {
  session: ChatSessionDetail;
  userMessage: ChatMessageRecord;
  assistantMessage: ChatMessageRecord;
  evidenceRecord?: SessionEvidenceRecord;
  evidenceRevision: number;
}

export interface EnqueueSessionFollowUpInput {
  sessionId: string;
  ownerId: string;
  question: string;
  displayContent?: string;
  scope: AgentScope;
  pageContext: PageContext;
  selectionText?: string;
  attachedEvidence?: EvidenceItem;
  skillRequest?: RailSkillRequestDisplay;
  createdAt: string;
  runId: string;
}

export interface EnqueueSessionFollowUpResult {
  session: ChatSessionDetail;
  userMessage: ChatMessageRecord;
  evidenceRecord?: SessionEvidenceRecord;
  evidenceRevision: number;
}

export interface RetryInterruptedAssistantInput {
  sessionId: string;
  assistantMessageId: string;
  ownerId: string;
  runId: string;
  createdAt: string;
  fallbackPageContext: PageContext;
}

export interface RetryInterruptedAssistantResult {
  session: ChatSessionDetail;
  assistantMessage: ChatMessageRecord;
  request: AgentChatRequest;
}

export interface StopInterruptedAssistantInput {
  sessionId: string;
  assistantMessageId: string;
  ownerId: string;
  stoppedAt: string;
}

export interface StopInterruptedAssistantResult {
  session: ChatSessionDetail;
  assistantMessage: ChatMessageRecord;
}

export async function getRailOwnerId() {
  const existing = window.sessionStorage.getItem(railOwnerIdKey);
  if (existing !== null && existing.length > 0) return existing;
  const next = createLocalId("owner");
  window.sessionStorage.setItem(railOwnerIdKey, next);
  return next;
}

export async function loadActiveSessionId(page: PageContext) {
  const result = await chrome.storage.session.get(activeSessionKey(page));
  const value = result[activeSessionKey(page)];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function saveActiveSessionId(page: PageContext, sessionId: string) {
  await chrome.storage.session.set({
    [activeSessionKey(page)]: sessionId,
  });
}

export async function clearActiveSessionId(page: PageContext) {
  await chrome.storage.session.remove(activeSessionKey(page));
}

export async function createOrLoadSessionForTurn(input: StartSessionTurnInput) {
  const displayContent = displayContentFromInput(input.displayContent, input.question);
  const sessionId =
    input.sessionId ??
    (
      await requestEngine({
        kind: "createChatSession",
        payload: {
          title: titleFromQuestion(displayContent),
          pageUrl: input.pageContext.url,
          pageTitle: input.pageContext.title,
          initialScope: input.scope,
          ownerId: input.ownerId,
          createdAt: input.createdAt,
        },
      })
    ).id;

  const lease = await requestEngine({
    kind: "claimChatSession",
    sessionId,
    ownerId: input.ownerId,
    now: input.createdAt,
  });
  if (lease.status === "already_open") {
    throw new Error("This conversation is already open elsewhere.");
  }

  const currentSession = await requestEngine({
    kind: "loadChatSession",
    sessionId,
  });
  if (currentSession === null) {
    throw new Error("Conversation was not found.");
  }
  assertNoUnresolvedInterruptedAnswer(currentSession);
  assertNoQueuedUserMessages(currentSession);

  const evidenceRecord = await appendEvidenceTranscript({
    sessionId,
    attachedEvidence: input.attachedEvidence,
    createdAt: input.createdAt,
    runId: input.runId,
    scope: input.scope,
    pageContext: input.pageContext,
  });

  const evidenceRevision = evidenceRecord?.revision ?? currentSession.currentEvidenceRevision;
  const evidenceRefs = input.evidence.map((item) => item.id);
  const userMessage = await requestEngine({
    kind: "upsertChatMessage",
    payload: {
      id: `${input.runId}:user`,
      sessionId,
      role: "user",
      status: "completed",
      content: displayContent,
      scope: input.scope,
      pageUrl: input.pageContext.url,
      pageTitle: input.pageContext.title,
      selectionText: input.selectionText,
      evidenceRefs,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      piAgentMessageJson: {
        role: "user",
        content: displayContent,
        clioProviderQuestion: input.question,
        ...(input.skillRequest === undefined ? {} : { clioSkillRequest: input.skillRequest }),
        timestamp: Date.parse(input.createdAt) || Date.now(),
      },
    },
  });
  const assistantMessage = await requestEngine({
    kind: "upsertChatMessage",
    payload: {
      id: `${input.runId}:assistant`,
      sessionId,
      role: "assistant",
      status: "streaming",
      content: "",
      scope: input.scope,
      pageUrl: input.pageContext.url,
      pageTitle: input.pageContext.title,
      selectionText: input.selectionText,
      evidenceRefs,
      retry: {
        question: input.question,
        scope: input.scope,
        pageUrl: input.pageContext.url,
        selectionText: input.selectionText,
        evidenceRevision,
      },
      runId: input.runId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      piAgentMessageJson: {
        role: "assistant",
        content: "",
        timestamp: Date.parse(input.createdAt) || Date.now(),
      },
    },
  });

  await saveActiveSessionId(input.pageContext, sessionId);
  const session = await requestEngine({ kind: "loadChatSession", sessionId });
  if (session === null) {
    throw new Error("Chat session disappeared after saving the first turn.");
  }
  return {
    session,
    userMessage,
    assistantMessage,
    evidenceRecord,
    evidenceRevision,
  } satisfies StartSessionTurnResult;
}

export async function enqueueSessionFollowUp(input: EnqueueSessionFollowUpInput) {
  const displayContent = displayContentFromInput(input.displayContent, input.question);
  const lease = await requestEngine({
    kind: "claimChatSession",
    sessionId: input.sessionId,
    ownerId: input.ownerId,
    now: input.createdAt,
  });
  if (lease.status === "already_open") {
    throw new Error("This conversation is already open elsewhere.");
  }

  const currentSession = await requestEngine({
    kind: "loadChatSession",
    sessionId: input.sessionId,
  });
  if (currentSession === null) {
    throw new Error("Chat session disappeared before queuing the follow-up.");
  }
  assertNoUnresolvedInterruptedAnswer(currentSession);

  const evidenceRecord = await appendEvidenceTranscript({
    sessionId: input.sessionId,
    attachedEvidence: input.attachedEvidence,
    createdAt: input.createdAt,
    runId: input.runId,
    scope: input.scope,
    pageContext: input.pageContext,
  });

  const queueOrder =
    currentSession.messages.reduce((max, message) => Math.max(max, message.queueOrder ?? 0), 0) + 1;
  const userMessage = await requestEngine({
    kind: "upsertChatMessage",
    payload: {
      id: `${input.runId}:user`,
      sessionId: input.sessionId,
      role: "user",
      status: "queued",
      content: displayContent,
      scope: input.scope,
      pageUrl: input.pageContext.url,
      pageTitle: input.pageContext.title,
      selectionText: input.selectionText,
      evidenceRefs: evidenceRecord === undefined ? [] : [evidenceRecord.id],
      queueOrder,
      runId: input.runId,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      piAgentMessageJson: {
        role: "user",
        content: displayContent,
        clioProviderQuestion: input.question,
        ...(input.skillRequest === undefined ? {} : { clioSkillRequest: input.skillRequest }),
        timestamp: Date.parse(input.createdAt) || Date.now(),
      },
    },
  });

  await saveActiveSessionId(input.pageContext, input.sessionId);
  const session = await requestEngine({ kind: "loadChatSession", sessionId: input.sessionId });
  if (session === null) {
    throw new Error("Chat session disappeared after queuing the follow-up.");
  }

  return {
    session,
    userMessage,
    evidenceRecord,
    evidenceRevision: session.currentEvidenceRevision,
  } satisfies EnqueueSessionFollowUpResult;
}

export async function retryInterruptedAssistant(input: RetryInterruptedAssistantInput) {
  const lease = await requestEngine({
    kind: "claimChatSession",
    sessionId: input.sessionId,
    ownerId: input.ownerId,
    now: input.createdAt,
  });
  if (lease.status === "already_open") {
    throw new Error("This conversation is already open elsewhere.");
  }

  const session = await requestEngine({
    kind: "loadChatSession",
    sessionId: input.sessionId,
  });
  if (session === null) {
    throw new Error("Conversation was not found.");
  }

  const assistantMessage = session.messages.find(
    (message) => message.id === input.assistantMessageId && message.role === "assistant",
  );
  if (assistantMessage === undefined) {
    throw new Error("Retry target was not found.");
  }
  if (assistantMessage.status !== "failed" && assistantMessage.status !== "interrupted") {
    throw new Error("This answer is not ready for Retry.");
  }

  const retryQuestion = readString(assistantMessage.retry, "question");
  const retryScope = readAgentScope(assistantMessage.retry, "scope");
  if (retryQuestion === undefined || retryScope === undefined) {
    throw new Error("Retry metadata is missing the original question.");
  }

  const evidenceRevision =
    readNumber(assistantMessage.retry, "evidenceRevision") ?? session.currentEvidenceRevision;
  const evidence =
    retryScope === "general"
      ? []
      : session.evidence
          .filter((record) => record.revision <= evidenceRevision)
          .map(sessionEvidenceToAgentEvidence);
  const pageUrl =
    readString(assistantMessage.retry, "pageUrl") ??
    assistantMessage.pageUrl ??
    input.fallbackPageContext.url;
  const pageTitle = assistantMessage.pageTitle ?? input.fallbackPageContext.title;
  const selectionText =
    readString(assistantMessage.retry, "selectionText") ?? assistantMessage.selectionText;
  const retry = buildRetryMetadata(assistantMessage, input.createdAt, {
    question: retryQuestion,
    scope: retryScope,
    pageUrl,
    selectionText,
    evidenceRevision,
  });

  const updatedAssistant = await requestEngine({
    kind: "updateChatMessage",
    payload: {
      id: assistantMessage.id,
      sessionId: input.sessionId,
      status: "streaming",
      content: "",
      clearError: true,
      retry,
      runId: input.runId,
      updatedAt: input.createdAt,
    },
  });
  const refreshed = await requestEngine({ kind: "loadChatSession", sessionId: input.sessionId });
  if (refreshed === null) {
    throw new Error("Conversation was not found after retry start.");
  }

  return {
    session: refreshed,
    assistantMessage: updatedAssistant,
    request: {
      runId: input.runId,
      sessionId: input.sessionId,
      assistantMessageId: assistantMessage.id,
      evidenceRevision,
      question: retryQuestion,
      scope: retryScope,
      pageUrl,
      pageTitle,
      evidence,
      createdAt: input.createdAt,
    },
  } satisfies RetryInterruptedAssistantResult;
}

export async function stopInterruptedAssistant(input: StopInterruptedAssistantInput) {
  const lease = await requestEngine({
    kind: "claimChatSession",
    sessionId: input.sessionId,
    ownerId: input.ownerId,
    now: input.stoppedAt,
  });
  if (lease.status === "already_open") {
    throw new Error("This conversation is already open elsewhere.");
  }

  const session = await requestEngine({
    kind: "loadChatSession",
    sessionId: input.sessionId,
  });
  if (session === null) {
    throw new Error("Conversation was not found.");
  }

  const assistantMessage = session.messages.find(
    (message) => message.id === input.assistantMessageId && message.role === "assistant",
  );
  if (assistantMessage === undefined) {
    throw new Error("Stop target was not found.");
  }
  if (assistantMessage.status !== "failed" && assistantMessage.status !== "interrupted") {
    throw new Error("This answer is not waiting for Stop.");
  }

  const updatedAssistant = await requestEngine({
    kind: "updateChatMessage",
    payload: {
      id: assistantMessage.id,
      sessionId: input.sessionId,
      status: "cancelled",
      error: {
        code: "CANCELLED",
        message: "Response stopped.",
      },
      clearRetry: true,
      updatedAt: input.stoppedAt,
    },
  });
  await requestEngine({
    kind: "clearQueuedChatMessages",
    sessionId: input.sessionId,
  });
  const refreshed = await requestEngine({ kind: "loadChatSession", sessionId: input.sessionId });
  if (refreshed === null) {
    throw new Error("Conversation was not found after stopping the answer.");
  }

  return {
    session: refreshed,
    assistantMessage: updatedAssistant,
  } satisfies StopInterruptedAssistantResult;
}

export async function loadSessionEvidenceRevision(sessionId: string) {
  const session = await requestEngine({ kind: "loadChatSession", sessionId });
  return session?.currentEvidenceRevision ?? 0;
}

export async function heartbeatSession(sessionId: string, ownerId: string) {
  return requestEngine({
    kind: "heartbeatChatSession",
    sessionId,
    ownerId,
    now: new Date().toISOString(),
  });
}

export function titleFromQuestion(question: string) {
  const normalized = normalizeText(question);
  if (normalized.length <= 20) return normalized || "New conversation";
  return normalized.slice(0, 20);
}

function displayContentFromInput(displayContent: string | undefined, providerQuestion: string) {
  const normalized = normalizeText(displayContent ?? "");
  if (normalized.length > 0) return normalized;
  return normalizeText(providerQuestion);
}

export function evidenceTranscriptContent(evidence: SessionEvidenceRecord) {
  if (evidence.sourceKind === "selection") {
    return `Used selection: "${excerpt(evidence.text, 80)}"`;
  }
  return `Used page: ${evidence.pageTitle || sourceHost(evidence.pageUrl)}`;
}

async function appendEvidenceTranscript(input: {
  sessionId: string;
  attachedEvidence?: EvidenceItem;
  createdAt: string;
  runId: string;
  scope: AgentScope;
  pageContext: PageContext;
}) {
  if (input.attachedEvidence === undefined) return undefined;
  const attachedEvidence = sessionEvidenceForAppend(input.attachedEvidence);
  const evidenceRecord = await requestEngine({
    kind: "appendSessionEvidence",
    payload: {
      sessionId: input.sessionId,
      evidence: attachedEvidence,
      createdAt: input.createdAt,
    },
  });
  await requestEngine({
    kind: "upsertChatMessage",
    payload: {
      id: `${input.runId}:evidence:${evidenceRecord.revision}`,
      sessionId: input.sessionId,
      role: "evidence",
      status: "completed",
      content: evidenceTranscriptContent(evidenceRecord),
      scope: input.scope,
      pageUrl: input.pageContext.url,
      pageTitle: input.pageContext.title,
      evidenceRefs: [evidenceRecord.id],
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
  });
  return evidenceRecord;
}

function sessionEvidenceForAppend(
  evidence: EvidenceItem,
): EvidenceItem & { sourceKind: SourceKind } {
  switch (evidence.sourceKind) {
    case "page":
      return { ...evidence, sourceKind: "page" };
    case "selection":
      return { ...evidence, sourceKind: "selection" };
    case "memory":
      throw new Error("Memory evidence cannot be persisted as session evidence.");
    default:
      return evidence.sourceKind satisfies never;
  }
}

function sessionEvidenceToAgentEvidence(record: SessionEvidenceRecord): EvidenceItem {
  return {
    id: record.id,
    sourceKind: record.sourceKind,
    sourceUrl: record.pageUrl,
    sourceTitle: record.pageTitle,
    text: record.text,
    excerpt: record.excerpt,
  };
}

function assertNoUnresolvedInterruptedAnswer(session: ChatSessionDetail) {
  if (session.messages.some(isUnresolvedInterruptedAssistantRecord)) {
    throw new Error("Use Retry, Stop, or Clear before continuing.");
  }
}

function assertNoQueuedUserMessages(session: ChatSessionDetail) {
  if (session.messages.some((message) => message.role === "user" && message.status === "queued")) {
    throw new Error("Clear queued messages first.");
  }
}

function isUnresolvedInterruptedAssistantRecord(message: ChatMessageRecord) {
  return (
    message.role === "assistant" &&
    message.retry !== undefined &&
    (message.status === "failed" || message.status === "interrupted")
  );
}

function buildRetryMetadata(
  message: ChatMessageRecord,
  at: string,
  base: {
    question: string;
    scope: AgentScope;
    pageUrl: string;
    selectionText?: string;
    evidenceRevision: number;
  },
) {
  const existing = isPlainRecord(message.retry) ? message.retry : {};
  const attempts = Array.isArray(existing.attempts) ? existing.attempts : [];
  const attemptCount = readNumber(existing, "attemptCount") ?? 0;
  return {
    ...existing,
    ...base,
    attemptCount: attemptCount + 1,
    attempts: [
      ...attempts,
      {
        at,
        status: message.status,
        contentExcerpt: excerpt(message.content, 240),
        error: message.error,
      },
    ],
  };
}

function readString(value: unknown, key: string) {
  if (!isPlainRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function readNumber(value: unknown, key: string) {
  if (!isPlainRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

function readAgentScope(value: unknown, key: string): AgentScope | undefined {
  const field = readString(value, key);
  if (field === "general" || field === "current-page" || field === "selection") return field;
  return undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function activeSessionKey(page: PageContext) {
  return `${activeSessionPrefix}${normalizeSourceUrl(page.url)}`;
}

function sourceHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function createLocalId(prefix: string) {
  const random =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}
