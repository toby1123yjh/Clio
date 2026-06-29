import type {
  ChatMessageRecord,
  ChatSessionDetail,
  CompactionRecord,
  CreateCompactionPayload,
  SessionEvidenceRecord,
} from "@/src/shared/rpc";
import {
  type AgentMessage,
  type CompactionPreparation,
  type CompactionSettings,
  DEFAULT_COMPACTION_SETTINGS,
  type SessionTreeEntry,
  compact,
  estimateContextTokens,
  estimateTokens,
  prepareCompaction,
  shouldCompact,
} from "@earendil-works/pi-agent-core";
import { excerpt } from "../shared/text";
import { buildClioUserPrompt } from "./clio-context";
import { defaultModelForProviderId, modelForProvider, providerLabel } from "./provider-runtime";
import {
  type ProviderId,
  type StoredProviderConfig,
  defaultActiveProvider,
} from "./provider-settings";
import type {
  AgentChatRequest,
  EvidenceAnchor,
  EvidenceItem,
  ProviderContext,
  ProviderContextMessage,
} from "./types";

export const clioCompactionSettings: CompactionSettings = {
  ...DEFAULT_COMPACTION_SETTINGS,
  reserveTokens: 16_384,
  keepRecentTokens: 20_000,
};

export interface ClioCompactionInput {
  session: ChatSessionDetail;
  latestCompaction: CompactionRecord | null;
  currentRequest?: AgentChatRequest;
  signal?: AbortSignal;
}

export type ClioCompactionOutcome =
  | { status: "compacted"; payload: CreateCompactionPayload }
  | { status: "noop" };

export interface IClioCompactionRuntime {
  getContextWindow(modelId?: string): number | Promise<number>;
  shouldCompact(contextTokens: number, contextWindow: number): boolean;
  compact(input: ClioCompactionInput): Promise<ClioCompactionOutcome>;
}

export interface PiAgentCompactionRuntimeOptions {
  loadConfig: () => Promise<StoredProviderConfig | undefined>;
  loadProviderId?: () => Promise<ProviderId>;
  ensureProviderPermission: (
    provider: ProviderId,
    config?: StoredProviderConfig,
  ) => Promise<boolean>;
  settings?: CompactionSettings;
}

export class PiAgentCompactionRuntime implements IClioCompactionRuntime {
  private readonly loadConfig: PiAgentCompactionRuntimeOptions["loadConfig"];
  private readonly loadProviderId: () => Promise<ProviderId>;
  private readonly ensureProviderPermission: PiAgentCompactionRuntimeOptions["ensureProviderPermission"];
  private readonly settings: CompactionSettings;

  constructor(options: PiAgentCompactionRuntimeOptions) {
    this.loadConfig = options.loadConfig;
    this.loadProviderId = options.loadProviderId ?? (async () => defaultActiveProvider);
    this.ensureProviderPermission = options.ensureProviderPermission;
    this.settings = options.settings ?? clioCompactionSettings;
  }

  async getContextWindow() {
    const config = await this.loadConfig();
    if (config !== undefined) return modelForProvider(config).contextWindow;
    return defaultModelForProviderId(await this.loadProviderId()).contextWindow;
  }

  shouldCompact(contextTokens: number, contextWindow: number) {
    return shouldCompact(contextTokens, contextWindow, this.settings);
  }

  async compact(input: ClioCompactionInput): Promise<ClioCompactionOutcome> {
    const preparation = prepareClioCompaction(input, this.settings);
    if (preparation.status === "noop") return preparation;

    const config = await this.loadConfig();
    if (config === undefined) {
      const label = providerLabel(await this.loadProviderId());
      throw new Error(`${label} provider is not configured.`);
    }
    const label = providerLabel(config.provider);
    if (!(await this.ensureProviderPermission(config.provider, config))) {
      throw new Error(`${label} provider permission is not granted.`);
    }

    let summary = input.latestCompaction?.summary ?? "";
    let firstKeptMessageId = preparation.firstKeptMessageId;
    let tokensBefore = preparation.tokensBefore;

    if (preparation.messageEntries.length > 0) {
      const result = compact(
        preparation.messagePreparation,
        modelForProvider(config),
        config.apiKey,
        undefined,
        undefined,
        input.signal,
        "off",
      );
      const compacted = await result;
      if (!compacted.ok) throw compacted.error;
      summary = compacted.value.summary;
      firstKeptMessageId = compacted.value.firstKeptEntryId;
      tokensBefore = compacted.value.tokensBefore;
    }

    return {
      status: "compacted",
      payload: {
        sessionId: input.session.id,
        summary,
        firstKeptMessageId,
        evidenceSummary: preparation.evidenceSummary,
        ...(preparation.firstKeptEvidenceId === undefined
          ? {}
          : { firstKeptEvidenceId: preparation.firstKeptEvidenceId }),
        ...(preparation.firstKeptEvidenceRevision === undefined
          ? {}
          : { firstKeptEvidenceRevision: preparation.firstKeptEvidenceRevision }),
        ...(input.latestCompaction === null
          ? {}
          : { previousCompactionId: input.latestCompaction.id }),
        coveredEvidence: preparation.coveredEvidence.map((record) => ({
          id: record.id,
          revision: record.revision,
        })),
        tokensBefore,
      },
    };
  }
}

export function buildProviderContext(input: {
  session: ChatSessionDetail;
  latestCompaction: CompactionRecord | null;
  maxEvidenceRevision?: number;
  currentTurnEvidenceRefs?: string[];
}): ProviderContext {
  const messages = eligibleProviderMessages(input.session.messages);
  const firstKeptIndex =
    input.latestCompaction === null
      ? 0
      : messages.findIndex((message) => message.id === input.latestCompaction?.firstKeptMessageId);
  const keptMessages = messages
    .slice(firstKeptIndex < 0 ? 0 : firstKeptIndex)
    .map(chatMessageToProviderContextMessage);
  const evidence = retainedEvidence(input.session.evidence, input.latestCompaction, {
    maxEvidenceRevision: input.maxEvidenceRevision,
    currentTurnEvidenceRefs: input.currentTurnEvidenceRefs,
  }).map(sessionEvidenceToAgentEvidence);
  const summary = input.latestCompaction?.summary.trim();
  const evidenceSummary = input.latestCompaction?.evidenceSummary.trim();
  return {
    ...(summary === undefined || summary.length === 0 ? {} : { summary }),
    ...(evidenceSummary === undefined || evidenceSummary.length === 0 ? {} : { evidenceSummary }),
    messages: keptMessages,
    evidence,
  };
}

export function buildRequestWithProviderContext(input: {
  request: AgentChatRequest;
  session: ChatSessionDetail;
  latestCompaction: CompactionRecord | null;
}) {
  const providerContext = buildProviderContext({
    session: input.session,
    latestCompaction: input.latestCompaction,
    maxEvidenceRevision: input.request.evidenceRevision,
    currentTurnEvidenceRefs: input.request.currentTurnEvidenceRefs,
  });
  if (input.request.scope === "general") {
    const { evidenceSummary: _evidenceSummary, ...generalProviderContext } = providerContext;
    const memoryEvidence = input.request.evidence.filter((item) => item.sourceKind === "memory");
    return {
      ...input.request,
      evidence: memoryEvidence,
      currentTurnEvidenceRefs: [],
      providerContext: {
        ...generalProviderContext,
        evidence: memoryEvidence,
      },
    };
  }
  return {
    ...input.request,
    evidence: providerContext.evidence,
    providerContext,
  };
}

export function estimateProviderContextTokens(request: AgentChatRequest) {
  return estimateTokens({
    role: "user",
    content: buildClioUserPrompt(request),
    timestamp: Date.parse(request.createdAt) || Date.now(),
  });
}

interface PreparedClioCompaction {
  status: "compacted";
  messagePreparation: CompactionPreparation;
  messageEntries: SessionTreeEntry[];
  evidenceSummary: string;
  firstKeptMessageId: string;
  firstKeptEvidenceId?: string;
  firstKeptEvidenceRevision?: number;
  coveredEvidence: SessionEvidenceRecord[];
  tokensBefore: number;
}

function prepareClioCompaction(
  input: ClioCompactionInput,
  settings: CompactionSettings,
): PreparedClioCompaction | { status: "noop" } {
  const stableMessages = eligibleProviderMessages(input.session.messages, {
    beforeMessageId: input.currentRequest?.userMessageId,
  });
  const messageEntries = buildSessionEntries(stableMessages, input.latestCompaction);
  const messagePreparationResult = prepareCompaction(messageEntries, settings);
  if (!messagePreparationResult.ok) throw messagePreparationResult.error;
  const messagePreparation = messagePreparationResult.value;
  const messageHasWork =
    messagePreparation !== undefined &&
    (messagePreparation.messagesToSummarize.length > 0 ||
      messagePreparation.turnPrefixMessages.length > 0);

  const stableEvidence = stableEvidenceRecords(input.session.evidence, input.currentRequest);
  const evidencePlan = planEvidenceCompaction(stableEvidence, input.latestCompaction, settings);
  if (!messageHasWork && evidencePlan.coveredEvidence.length === 0) {
    return { status: "noop" };
  }

  const firstKeptMessageId =
    messagePreparation?.firstKeptEntryId ??
    input.latestCompaction?.firstKeptMessageId ??
    stableMessages[0]?.id;
  if (firstKeptMessageId === undefined) return { status: "noop" };

  const messagesForTokenEstimate =
    messagePreparation === undefined ? clioMessagesToAgentMessages(stableMessages) : undefined;

  return {
    status: "compacted",
    messagePreparation:
      messagePreparation ??
      ({
        firstKeptEntryId: firstKeptMessageId,
        messagesToSummarize: [],
        turnPrefixMessages: [],
        isSplitTurn: false,
        tokensBefore: estimateContextTokens(messagesForTokenEstimate ?? []).tokens,
        previousSummary: input.latestCompaction?.summary,
        fileOps: { read: new Set<string>(), written: new Set<string>(), edited: new Set<string>() },
        settings,
      } as PreparedClioCompaction["messagePreparation"]),
    messageEntries: messageHasWork ? messageEntries : [],
    evidenceSummary: evidencePlan.summary,
    firstKeptMessageId,
    ...(evidencePlan.firstKeptEvidenceId === undefined
      ? {}
      : { firstKeptEvidenceId: evidencePlan.firstKeptEvidenceId }),
    ...(evidencePlan.firstKeptEvidenceRevision === undefined
      ? {}
      : { firstKeptEvidenceRevision: evidencePlan.firstKeptEvidenceRevision }),
    coveredEvidence: evidencePlan.coveredEvidence,
    tokensBefore:
      messagePreparation?.tokensBefore ??
      estimateContextTokens(messagesForTokenEstimate ?? []).tokens,
  };
}

function buildSessionEntries(
  messages: ChatMessageRecord[],
  latestCompaction: CompactionRecord | null,
) {
  const entries: SessionTreeEntry[] = [];
  if (latestCompaction !== null) {
    entries.push({
      type: "compaction",
      id: latestCompaction.id,
      parentId: null,
      timestamp: latestCompaction.createdAt,
      summary: latestCompaction.summary,
      firstKeptEntryId: latestCompaction.firstKeptMessageId,
      tokensBefore: latestCompaction.tokensBefore,
    });
  }
  let parentId = entries.at(-1)?.id ?? null;
  for (const message of messages) {
    entries.push({
      type: "message",
      id: message.id,
      parentId,
      timestamp: message.createdAt,
      message: chatMessageToAgentMessage(message),
    });
    parentId = message.id;
  }
  return entries;
}

function eligibleProviderMessages(
  messages: ChatMessageRecord[],
  options: { beforeMessageId?: string } = {},
) {
  const eligible: ChatMessageRecord[] = [];
  for (const message of messages) {
    if (message.id === options.beforeMessageId) break;
    if (message.role === "user" && message.status === "completed") {
      eligible.push(message);
      continue;
    }
    if (message.role === "assistant" && message.status === "completed") {
      eligible.push(message);
    }
  }
  return eligible;
}

function chatMessageToProviderContextMessage(message: ChatMessageRecord): ProviderContextMessage {
  return {
    id: message.id,
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content,
    createdAt: message.createdAt,
  };
}

function clioMessagesToAgentMessages(messages: ChatMessageRecord[]): AgentMessage[] {
  return messages.map(chatMessageToAgentMessage);
}

function chatMessageToAgentMessage(message: ChatMessageRecord): AgentMessage {
  const prefix = message.role === "assistant" ? "Assistant" : "User";
  return {
    role: "user",
    content: `${prefix}: ${message.content}`,
    timestamp: Date.parse(message.createdAt) || Date.now(),
  };
}

function stableEvidenceRecords(
  evidence: SessionEvidenceRecord[],
  currentRequest: AgentChatRequest | undefined,
) {
  if (currentRequest?.scope === "general") return [];
  if (currentRequest?.createdAt === undefined) return evidence;
  const currentTurnEvidenceRefs = new Set(currentRequest.currentTurnEvidenceRefs ?? []);
  return evidence.filter(
    (record) =>
      !currentTurnEvidenceRefs.has(record.id) && record.createdAt < currentRequest.createdAt,
  );
}

function retainedEvidence(
  evidence: SessionEvidenceRecord[],
  latestCompaction: CompactionRecord | null,
  options: { maxEvidenceRevision?: number; currentTurnEvidenceRefs?: string[] },
) {
  const currentTurnEvidenceRefs = new Set(options.currentTurnEvidenceRefs ?? []);
  return evidence.filter((record) => {
    if (currentTurnEvidenceRefs.has(record.id)) return true;
    if (
      options.maxEvidenceRevision !== undefined &&
      record.revision > options.maxEvidenceRevision
    ) {
      return false;
    }
    if (latestCompaction?.firstKeptEvidenceRevision !== undefined) {
      return record.revision >= latestCompaction.firstKeptEvidenceRevision;
    }
    if (latestCompaction?.firstKeptEvidenceId !== undefined) {
      return record.id >= latestCompaction.firstKeptEvidenceId;
    }
    return true;
  });
}

function planEvidenceCompaction(
  stableEvidence: SessionEvidenceRecord[],
  latestCompaction: CompactionRecord | null,
  settings: CompactionSettings,
) {
  const previousRevision = latestCompaction?.firstKeptEvidenceRevision;
  const compactable = stableEvidence.filter((record) =>
    previousRevision === undefined ? true : record.revision >= previousRevision,
  );
  if (compactable.length === 0) {
    return {
      summary: latestCompaction?.evidenceSummary ?? "",
      coveredEvidence: [],
    };
  }

  let recentTokens = 0;
  let firstKeptIndex = compactable.length;
  for (let index = compactable.length - 1; index >= 0; index -= 1) {
    const record = compactable[index];
    if (record === undefined) continue;
    recentTokens += estimateEvidenceTokens(record);
    if (recentTokens >= settings.keepRecentTokens) {
      firstKeptIndex = index;
      break;
    }
  }

  const coveredEvidence = compactable.slice(0, firstKeptIndex);
  const firstKept = compactable[firstKeptIndex];
  if (coveredEvidence.length === 0 || firstKept === undefined) {
    return {
      summary: latestCompaction?.evidenceSummary ?? "",
      coveredEvidence: [],
    };
  }

  return {
    summary: buildEvidenceSummary(latestCompaction?.evidenceSummary, coveredEvidence),
    firstKeptEvidenceId: firstKept.id,
    firstKeptEvidenceRevision: firstKept.revision,
    coveredEvidence,
  };
}

function estimateEvidenceTokens(record: SessionEvidenceRecord) {
  return Math.ceil(
    [record.sourceKind, record.pageTitle, record.pageUrl, record.excerpt, record.text].join("\n")
      .length / 4,
  );
}

function buildEvidenceSummary(
  previousSummary: string | undefined,
  coveredEvidence: SessionEvidenceRecord[],
) {
  const revisionStart = coveredEvidence[0]?.revision;
  const revisionEnd = coveredEvidence.at(-1)?.revision;
  const lines = [
    previousSummary === undefined || previousSummary.trim().length === 0
      ? "Previous evidence summary: none."
      : `Previous evidence summary:\n${previousSummary}`,
    `Newly compacted evidence revisions: ${revisionStart ?? "?"}-${revisionEnd ?? "?"}.`,
    "Key source context:",
    ...coveredEvidence.map(
      (record) =>
        `- ${record.sourceKind} rev ${record.revision}: ${record.pageTitle || record.pageUrl} (${record.pageUrl}). Key excerpt: ${excerpt(record.excerpt || record.text, 220)}`,
    ),
    "Limitations: summarized evidence is background context only and is not citeable.",
  ];
  return lines.join("\n");
}

function sessionEvidenceToAgentEvidence(record: SessionEvidenceRecord): EvidenceItem {
  const anchor = readEvidenceAnchor(record.metadata.anchor);
  return {
    id: record.id,
    sourceKind: record.sourceKind,
    sourceUrl: record.pageUrl,
    sourceTitle: record.pageTitle,
    text: record.text,
    excerpt: record.excerpt,
    ...(anchor === undefined ? {} : { anchor }),
  };
}

function readEvidenceAnchor(value: unknown): EvidenceAnchor | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.selectedText !== "string" ||
    typeof record.contextBefore !== "string" ||
    typeof record.contextAfter !== "string"
  ) {
    return undefined;
  }
  return {
    selectedText: record.selectedText,
    contextBefore: record.contextBefore,
    contextAfter: record.contextAfter,
    ...(typeof record.xpath === "string" ? { xpath: record.xpath } : {}),
    ...(typeof record.textFragment === "string" ? { textFragment: record.textFragment } : {}),
  };
}
