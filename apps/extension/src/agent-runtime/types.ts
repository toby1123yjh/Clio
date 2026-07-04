export type AgentScope = "general" | "current-page" | "selection";

export type EvidenceSourceKind = "page" | "selection" | "memory" | "web";

export interface EvidenceAnchor {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  xpath?: string;
  textFragment?: string;
}

export interface EvidenceItem {
  id: string;
  sourceKind: EvidenceSourceKind;
  sourceUrl: string;
  sourceTitle: string;
  text: string;
  excerpt: string;
  anchor?: EvidenceAnchor;
}

export interface ProviderContextMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ProviderContext {
  summary?: string;
  evidenceSummary?: string;
  messages: ProviderContextMessage[];
  evidence: EvidenceItem[];
}

export interface SourceContextPackRequestOptions {
  mode: "research";
}

export interface AgentChatRequest {
  runId: string;
  sessionId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
  evidenceRevision?: number;
  question: string;
  scope: AgentScope;
  pageUrl: string;
  pageTitle: string;
  evidence: EvidenceItem[];
  currentTurnEvidenceRefs?: string[];
  sourceContextPack?: SourceContextPackRequestOptions;
  providerContext?: ProviderContext;
  createdAt: string;
}

export interface LocalCitation {
  id: string;
  evidenceId: string;
  label: string;
  sourceKind: EvidenceSourceKind;
  sourceUrl: string;
  sourceTitle: string;
  excerpt: string;
  anchor?: EvidenceAnchor;
  outputOffset?: number;
}

export type CitationValidationStatus = "valid" | "warning";

export type CitationValidationReason =
  | "no_memory_evidence"
  | "valid_memory_citation"
  | "valid_memory_claims"
  | "missing_memory_citation"
  | "missing_memory_claim_citation"
  | "invalid_citation"
  | "validator_error";

export type CitationValidationClaimPreviewReason = "missing_memory_citation";

export interface CitationValidationClaimPreview {
  text: string;
  position: number;
  reason: CitationValidationClaimPreviewReason;
}

export interface CitationValidationResult {
  status: CitationValidationStatus;
  reason: CitationValidationReason;
  evidenceCount: number;
  memoryEvidenceCount: number;
  citationCount: number;
  validCitationCount: number;
  validMemoryCitationCount: number;
  claimCount?: number;
  coveredClaimCount?: number;
  uncoveredClaimCount?: number;
  uncoveredClaims?: CitationValidationClaimPreview[];
  message?: string;
}

export type AgentErrorCode =
  | "NO_EVIDENCE"
  | "LOW_CONFIDENCE_EXTRACTION"
  | "SELECTION_REQUIRED"
  | "MOCK_RUNTIME_ERROR"
  | "PROVIDER_CONFIG_REQUIRED"
  | "PROVIDER_PERMISSION_REQUIRED"
  | "PROVIDER_AUTH_ERROR"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_NETWORK_ERROR"
  | "PROVIDER_INTERRUPTED"
  | "PROVIDER_ERROR"
  | "TRANSPORT_ERROR"
  | "CANCELLED"
  | "CONTEXT_TOO_LARGE";

export interface AgentErrorInfo {
  code: AgentErrorCode;
  message: string;
  detail?: string;
}

export type AgentToolTraceStatus = "running" | "completed" | "failed";

export interface AgentToolTrace {
  toolCallId: string;
  toolName: string;
  status: AgentToolTraceStatus;
  summary?: string;
}

export type AgentStreamEvent =
  | { type: "run_started"; runId: string }
  | { type: "runtime_status"; runId: string; message: string; running?: boolean }
  | { type: "thinking_delta"; runId: string; delta: string }
  | { type: "tool_trace"; runId: string; trace: AgentToolTrace }
  | { type: "text_delta"; runId: string; delta: string }
  | { type: "citation"; runId: string; citation: LocalCitation }
  | { type: "citation_validation"; runId: string; validation: CitationValidationResult }
  | { type: "world_knowledge"; runId: string; note: string }
  | { type: "run_completed"; runId: string }
  | { type: "run_failed"; runId: string; error: AgentErrorInfo }
  | { type: "run_cancelled"; runId: string; reason?: string }
  | {
      type: "run_resolved";
      runId: string;
      message?: string;
      removeAssistantMessageId?: string;
    };

export interface IAgentRuntime {
  streamChat(
    request: AgentChatRequest,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<AgentStreamEvent>;
}
