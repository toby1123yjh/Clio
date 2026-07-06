import type {
  BuildSourceContextPackPayload,
  ChatMessageRecord,
  ChatSessionDetail,
  CompactionRecord,
  EngineRequest,
  SessionEvidenceRecord,
  SourceContextPackResult,
  SourceContextPackWindow,
} from "@/src/shared/rpc";
import { citationValidatorErrorResult, validateCitationCoverage } from "./citation-validator";
import {
  type IClioCompactionRuntime,
  buildRequestWithProviderContext,
  estimateProviderContextTokens,
} from "./compaction-context";
import {
  readSourceContextPackRequestOptions,
  sourceContextPackAutoBudgetDefaults,
  sourceContextPackResearchBudgetDefaults,
} from "./source-context-pack-options";
import type {
  AgentChatRequest,
  AgentStreamEvent,
  CitationValidationResult,
  EvidenceItem,
  IAgentRuntime,
  LocalCitation,
} from "./types";

export interface AgentRunHostOptions {
  runtime: IAgentRuntime;
  compactionRuntime?: IClioCompactionRuntime;
  requestEngine: <T>(request: EngineRequest) => Promise<T>;
  emitEvent: (event: AgentStreamEvent) => void;
}

export interface AgentRunSubscribeInput {
  runId: string;
  sessionId: string;
  assistantMessageId: string;
}

interface HostedAgentRun {
  request: AgentChatRequest;
  abortController: AbortController;
  providerStarted: boolean;
  citations: LocalCitation[];
  citationValidation?: CitationValidationResult;
  worldKnowledge: string[];
  content: string;
}

interface HostedManualCompactRun {
  runId: string;
  sessionId?: string;
  abortController: AbortController;
}

export class AgentRunHost {
  private readonly activeRuns = new Map<string, HostedAgentRun>();
  private readonly activeManualCompactions = new Map<string, HostedManualCompactRun>();
  private readonly runtime: IAgentRuntime;
  private readonly compactionRuntime?: IClioCompactionRuntime;
  private readonly requestEngine: AgentRunHostOptions["requestEngine"];
  private readonly emitEvent: AgentRunHostOptions["emitEvent"];

  constructor(options: AgentRunHostOptions) {
    this.runtime = options.runtime;
    this.compactionRuntime = options.compactionRuntime;
    this.requestEngine = options.requestEngine;
    this.emitEvent = options.emitEvent;
  }

  start(request: AgentChatRequest) {
    const existing = this.activeRuns.get(request.runId);
    if (existing !== undefined) {
      this.emitEvent({ type: "run_started", runId: request.runId });
      return;
    }

    const run: HostedAgentRun = {
      request,
      abortController: new AbortController(),
      providerStarted: false,
      citations: [],
      worldKnowledge: [],
      content: "",
    };
    this.activeRuns.set(request.runId, run);
    void this.pump(run);
  }

  async subscribe(input: AgentRunSubscribeInput) {
    if (this.activeRuns.has(input.runId)) {
      this.emitEvent({ type: "run_started", runId: input.runId });
      return;
    }

    const event: AgentStreamEvent = {
      type: "run_failed",
      runId: input.runId,
      error: {
        code: "PROVIDER_INTERRUPTED",
        message: "Clio lost the active answer. Retry when ready.",
      },
    };
    try {
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: input.assistantMessageId,
          sessionId: input.sessionId,
          status: "interrupted",
          error: event.error,
          updatedAt: new Date().toISOString(),
        },
      });
    } finally {
      this.emitEvent(event);
    }
  }

  cancel(runId: string) {
    this.activeRuns.get(runId)?.abortController.abort();
    this.activeManualCompactions.get(runId)?.abortController.abort();
  }

  snapshot(runId: string) {
    return this.activeRuns.has(runId) || this.activeManualCompactions.has(runId)
      ? { active: true as const, runId }
      : { active: false as const, runId };
  }

  startManualCompact(input: { runId: string; sessionId?: string }) {
    if (this.activeManualCompactions.has(input.runId)) {
      this.emitEvent({
        type: "runtime_status",
        runId: input.runId,
        message: "Compacting...",
        running: true,
      });
      return;
    }

    const run: HostedManualCompactRun = {
      runId: input.runId,
      sessionId: input.sessionId,
      abortController: new AbortController(),
    };
    this.activeManualCompactions.set(input.runId, run);
    void this.pumpManualCompact(run);
  }

  private async pump(run: HostedAgentRun) {
    let terminalEventEmitted = false;
    try {
      const preparedRequest = await this.prepareProviderRequest(run);
      if (preparedRequest === undefined) {
        terminalEventEmitted = true;
        return;
      }

      run.request = preparedRequest;
      run.providerStarted = true;
      for await (const event of this.runtime.streamChat(run.request, {
        signal: run.abortController.signal,
      })) {
        if (event.type === "run_completed") {
          const validationEvent = this.buildCitationValidationEvent(run);
          await this.persistEvent(run, validationEvent);
          this.emitEvent(validationEvent);
        }
        await this.persistEvent(run, event);
        if (isTerminalAgentEvent(event)) {
          terminalEventEmitted = true;
          if (event.type === "run_completed") {
            await this.startNextQueuedFollowUp(run);
          }
          this.emitEvent(event);
          return;
        }
        this.emitEvent(event);
      }
    } catch (error) {
      if (run.abortController.signal.aborted) {
        if (run.providerStarted) {
          const event: AgentStreamEvent = {
            type: "run_cancelled",
            runId: run.request.runId,
            reason: "User stopped the response.",
          };
          await this.persistEvent(run, event);
          this.emitEvent(event);
        } else {
          await this.resolvePreProviderStop(run);
        }
        terminalEventEmitted = true;
        return;
      }
      const event: AgentStreamEvent = {
        type: "run_failed",
        runId: run.request.runId,
        error: {
          code: "PROVIDER_ERROR",
          message: error instanceof Error ? error.message : String(error),
        },
      };
      await this.persistEvent(run, event);
      this.emitEvent(event);
      terminalEventEmitted = true;
    } finally {
      if (run.abortController.signal.aborted && !terminalEventEmitted) {
        const event: AgentStreamEvent = {
          type: "run_cancelled",
          runId: run.request.runId,
          reason: "User stopped the response.",
        };
        await this.persistEvent(run, event);
        this.emitEvent(event);
      }
      this.activeRuns.delete(run.request.runId);
    }
  }

  private async prepareProviderRequest(run: HostedAgentRun): Promise<AgentChatRequest | undefined> {
    const sourceContextRequest = await this.buildSourceContextPackRequest(run);
    if (run.abortController.signal.aborted) {
      await this.resolvePreProviderStop(run);
      return undefined;
    }

    const { sessionId } = sourceContextRequest;
    if (this.compactionRuntime === undefined || sessionId === undefined) {
      return sourceContextRequest;
    }

    const session = await this.requestEngine<ChatSessionDetail | null>({
      kind: "loadChatSession",
      sessionId,
    });
    if (session === null) return sourceContextRequest;

    let latestCompaction = await this.requestEngine<CompactionRecord | null>({
      kind: "getLatestCompaction",
      sessionId,
    });
    const contextWindow = await this.compactionRuntime.getContextWindow();
    let requestWithContext = buildRequestWithProviderContext({
      request: sourceContextRequest,
      session,
      latestCompaction,
    });

    if (
      this.compactionRuntime.shouldCompact(
        estimateProviderContextTokens(requestWithContext),
        contextWindow,
      )
    ) {
      this.emitEvent({
        type: "runtime_status",
        runId: run.request.runId,
        message: "Compacting...",
        running: true,
      });
      try {
        const outcome = await this.compactionRuntime.compact({
          session,
          latestCompaction,
          currentRequest: sourceContextRequest,
          signal: run.abortController.signal,
        });
        if (run.abortController.signal.aborted) {
          await this.resolvePreProviderStop(run);
          return undefined;
        }
        if (outcome.status === "compacted") {
          latestCompaction = await this.requestEngine<CompactionRecord>({
            kind: "appendCompaction",
            payload: outcome.payload,
          });
          requestWithContext = buildRequestWithProviderContext({
            request: sourceContextRequest,
            session,
            latestCompaction,
          });
          if (run.abortController.signal.aborted) {
            await this.resolvePreProviderStop(run);
            return undefined;
          }
        }
      } catch {
        if (run.abortController.signal.aborted) {
          await this.resolvePreProviderStop(run);
          return undefined;
        }
      }
    }

    if (run.abortController.signal.aborted) {
      await this.resolvePreProviderStop(run);
      return undefined;
    }

    if (estimateProviderContextTokens(requestWithContext) > contextWindow) {
      await this.resolveContextTooLarge(run);
      return undefined;
    }

    return requestWithContext;
  }

  private async buildSourceContextPackRequest(run: HostedAgentRun): Promise<AgentChatRequest> {
    const sourceContextPackOptions = run.request.sourceContextPack;
    if (sourceContextPackOptions === undefined) return run.request;

    this.emitEvent({
      type: "runtime_status",
      runId: run.request.runId,
      message: "Building source context...",
      running: true,
    });

    try {
      const pack = await this.requestEngine<SourceContextPackResult>({
        kind: "buildSourceContextPack",
        payload: sourceContextPackPayload(run.request),
      });
      const packEvidence = sourceContextPackToEvidence(pack);
      if (packEvidence.length === 0) {
        this.emitEvent({
          type: "runtime_status",
          runId: run.request.runId,
          message: "No source context found; continuing without it.",
        });
        return run.request;
      }

      this.emitEvent({
        type: "runtime_status",
        runId: run.request.runId,
        message: sourceContextPackStatusMessage(pack, packEvidence.length),
      });
      if (sourceContextPackOptions.mapReduce?.enabled === true) {
        this.emitEvent({
          type: "runtime_status",
          runId: run.request.runId,
          message: sourceContextPackMapReducePlanMessage(pack, sourceContextPackOptions),
        });
      }

      return {
        ...run.request,
        evidence: mergeEvidence(run.request.evidence, packEvidence),
      };
    } catch {
      this.emitEvent({
        type: "runtime_status",
        runId: run.request.runId,
        message: "Source context unavailable; continuing without it.",
      });
      return run.request;
    }
  }

  private async pumpManualCompact(run: HostedManualCompactRun) {
    try {
      if (run.sessionId === undefined || this.compactionRuntime === undefined) {
        this.emitEvent({
          type: "run_resolved",
          runId: run.runId,
          message: run.sessionId === undefined ? "Nothing to compact yet" : "Compact failed",
        });
        return;
      }

      const session = await this.requestEngine<ChatSessionDetail | null>({
        kind: "loadChatSession",
        sessionId: run.sessionId,
      });
      if (session === null) {
        this.emitEvent({
          type: "run_resolved",
          runId: run.runId,
          message: "Nothing to compact yet",
        });
        return;
      }

      const latestCompaction = await this.requestEngine<CompactionRecord | null>({
        kind: "getLatestCompaction",
        sessionId: run.sessionId,
      });
      this.emitEvent({
        type: "runtime_status",
        runId: run.runId,
        message: "Compacting...",
        running: true,
      });
      const outcome = await this.compactionRuntime.compact({
        session,
        latestCompaction,
        signal: run.abortController.signal,
      });
      if (run.abortController.signal.aborted) {
        this.emitEvent({
          type: "run_resolved",
          runId: run.runId,
          message: "Stopped.",
        });
        return;
      }
      if (outcome.status === "noop") {
        this.emitEvent({
          type: "run_resolved",
          runId: run.runId,
          message: "Nothing to compact yet",
        });
        return;
      }

      await this.requestEngine<CompactionRecord>({
        kind: "appendCompaction",
        payload: outcome.payload,
      });
      this.emitEvent({
        type: "run_resolved",
        runId: run.runId,
        message: run.abortController.signal.aborted ? "Stopped." : "Compacted",
      });
    } catch {
      if (run.abortController.signal.aborted) {
        this.emitEvent({
          type: "run_resolved",
          runId: run.runId,
          message: "Stopped.",
        });
        return;
      }
      this.emitEvent({
        type: "run_resolved",
        runId: run.runId,
        message: "Compact failed",
      });
    } finally {
      this.activeManualCompactions.delete(run.runId);
    }
  }

  private async resolveContextTooLarge(run: HostedAgentRun) {
    await this.deleteAssistantPlaceholder(run);
    this.emitEvent({
      type: "run_resolved",
      runId: run.request.runId,
      message: "Context too large",
      removeAssistantMessageId: run.request.assistantMessageId,
    });
  }

  private async resolvePreProviderStop(run: HostedAgentRun) {
    const { sessionId } = run.request;
    if (sessionId !== undefined) {
      await this.requestEngine<{ cleared: number }>({
        kind: "clearQueuedChatMessages",
        sessionId,
      }).catch(() => ({ cleared: 0 }));
    }
    await this.deleteAssistantPlaceholder(run);
    this.emitEvent({
      type: "run_resolved",
      runId: run.request.runId,
      message: "Stopped.",
      removeAssistantMessageId: run.request.assistantMessageId,
    });
  }

  private async deleteAssistantPlaceholder(run: HostedAgentRun) {
    const { sessionId, assistantMessageId } = run.request;
    if (sessionId === undefined || assistantMessageId === undefined) return;
    await this.requestEngine<{ deleted: boolean }>({
      kind: "deleteChatMessage",
      sessionId,
      messageId: assistantMessageId,
    }).catch(() => ({ deleted: false }));
  }

  private async startNextQueuedFollowUp(completedRun: HostedAgentRun) {
    const { sessionId } = completedRun.request;
    if (sessionId === undefined) return;

    const session = await this.requestEngine<ChatSessionDetail | null>({
      kind: "loadChatSession",
      sessionId,
    });
    if (session === null) return;

    const queuedUser = findNextQueuedUserMessage(session.messages);
    if (queuedUser === undefined) return;

    const now = new Date().toISOString();
    const runId = queuedUser.runId ?? runIdFromQueuedUserMessage(queuedUser);
    if (this.activeRuns.has(runId)) return;

    const evidence =
      queuedUser.scope === "general" ? [] : session.evidence.map(sessionEvidenceToAgentEvidence);
    const evidenceRefs = evidence.map((item) => item.id);
    const pageUrl = queuedUser.pageUrl ?? completedRun.request.pageUrl;
    const pageTitle = queuedUser.pageTitle ?? completedRun.request.pageTitle;
    const assistantMessageId = `${runId}:assistant`;
    const currentTurnEvidenceRefs = queuedUser.evidenceRefs;
    const providerQuestion = providerQuestionFromMessage(queuedUser);
    const sourceContextPack = sourceContextPackFromMessage(queuedUser);

    await this.requestEngine<ChatMessageRecord>({
      kind: "updateChatMessage",
      payload: {
        id: queuedUser.id,
        sessionId,
        status: "completed",
        evidenceRefs,
        updatedAt: now,
      },
    });
    await this.requestEngine<ChatMessageRecord>({
      kind: "upsertChatMessage",
      payload: {
        id: assistantMessageId,
        sessionId,
        role: "assistant",
        status: "streaming",
        content: "",
        scope: queuedUser.scope,
        pageUrl,
        pageTitle,
        selectionText: queuedUser.selectionText,
        evidenceRefs,
        retry: {
          question: providerQuestion,
          scope: queuedUser.scope,
          pageUrl,
          selectionText: queuedUser.selectionText,
          evidenceRevision: session.currentEvidenceRevision,
          ...(sourceContextPack === undefined ? {} : { sourceContextPack }),
        },
        runId,
        createdAt: now,
        updatedAt: now,
        piAgentMessageJson: {
          role: "assistant",
          content: "",
          timestamp: Date.parse(now) || Date.now(),
        },
      },
    });

    const nextRun: HostedAgentRun = {
      request: {
        runId,
        sessionId,
        userMessageId: queuedUser.id,
        assistantMessageId,
        evidenceRevision: session.currentEvidenceRevision,
        question: providerQuestion,
        scope: queuedUser.scope,
        pageUrl,
        pageTitle,
        evidence,
        currentTurnEvidenceRefs,
        ...(sourceContextPack === undefined ? {} : { sourceContextPack }),
        createdAt: now,
      },
      abortController: new AbortController(),
      providerStarted: false,
      citations: [],
      worldKnowledge: [],
      content: "",
    };
    this.activeRuns.set(runId, nextRun);
    void this.pump(nextRun);
  }

  private buildCitationValidationEvent(run: HostedAgentRun): AgentStreamEvent {
    const input = {
      evidence: citationEvidenceForRequest(run.request),
      citations: run.citations,
      content: run.content,
    };
    try {
      return {
        type: "citation_validation",
        runId: run.request.runId,
        validation: validateCitationCoverage(input),
      };
    } catch {
      return {
        type: "citation_validation",
        runId: run.request.runId,
        validation: citationValidatorErrorResult(input),
      };
    }
  }

  private async persistEvent(run: HostedAgentRun, event: AgentStreamEvent) {
    const { sessionId, assistantMessageId } = run.request;
    if (sessionId === undefined || assistantMessageId === undefined) return;

    if (event.type === "text_delta") {
      run.content = `${run.content}${event.delta}`;
      const updatedAt = new Date().toISOString();
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          appendContent: event.delta,
          status: "streaming",
          piAgentMessageJson: assistantPiAgentMessageJson(
            run.content,
            updatedAt,
            run.citationValidation,
          ),
          updatedAt,
        },
      });
      return;
    }
    if (event.type === "citation") {
      run.citations.push(event.citation);
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          citations: run.citations,
          updatedAt: new Date().toISOString(),
        },
      });
      return;
    }
    if (event.type === "world_knowledge") {
      if (!run.worldKnowledge.includes(event.note)) {
        run.worldKnowledge.push(event.note);
      }
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          worldKnowledge: run.worldKnowledge,
          updatedAt: new Date().toISOString(),
        },
      });
      return;
    }
    if (event.type === "citation_validation") {
      run.citationValidation = event.validation;
      const updatedAt = new Date().toISOString();
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          piAgentMessageJson: assistantPiAgentMessageJson(run.content, updatedAt, event.validation),
          updatedAt,
        },
      });
      return;
    }
    if (event.type === "run_completed") {
      const updatedAt = new Date().toISOString();
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          status: "completed",
          piAgentMessageJson: assistantPiAgentMessageJson(
            run.content,
            updatedAt,
            run.citationValidation,
          ),
          updatedAt,
        },
      });
      return;
    }
    if (event.type === "run_failed") {
      const updatedAt = new Date().toISOString();
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          status: event.error.code === "PROVIDER_INTERRUPTED" ? "interrupted" : "failed",
          error: event.error,
          piAgentMessageJson: assistantPiAgentMessageJson(
            run.content,
            updatedAt,
            run.citationValidation,
          ),
          updatedAt,
        },
      });
      return;
    }
    if (event.type === "run_cancelled") {
      const updatedAt = new Date().toISOString();
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          status: "cancelled",
          error: {
            code: "CANCELLED",
            message: event.reason ?? "Response stopped.",
          },
          clearRetry: true,
          piAgentMessageJson: assistantPiAgentMessageJson(
            run.content,
            updatedAt,
            run.citationValidation,
          ),
          updatedAt,
        },
      });
    }
  }
}

function assistantPiAgentMessageJson(
  content: string,
  at: string,
  validation?: CitationValidationResult,
) {
  return {
    role: "assistant",
    content,
    timestamp: Date.parse(at) || Date.now(),
    ...(validation === undefined ? {} : { clioCitationValidation: validation }),
  };
}

function citationEvidenceForRequest(request: AgentChatRequest) {
  return request.providerContext?.evidence ?? request.evidence;
}

function sourceContextPackPayload(request: AgentChatRequest): BuildSourceContextPackPayload {
  const options = request.sourceContextPack;
  const defaults = sourceContextPackBudgetDefaults(options);
  return {
    query: request.question,
    useWorkingSet: true,
    maxTotalTokens: options?.maxTotalTokens ?? defaults.maxTotalTokens,
    maxGroups: options?.maxGroups ?? defaults.maxGroups,
    maxGroupTokens: options?.maxGroupTokens ?? defaults.maxGroupTokens,
    maxSources: options?.maxSources ?? defaults.maxSources,
    maxWindowsPerSource: options?.maxWindowsPerSource ?? defaults.maxWindowsPerSource,
    contextChunksBefore: options?.contextChunksBefore ?? defaults.contextChunksBefore,
    contextChunksAfter: options?.contextChunksAfter ?? defaults.contextChunksAfter,
  };
}

function sourceContextPackBudgetDefaults(options: AgentChatRequest["sourceContextPack"]) {
  return options?.mode === "auto"
    ? sourceContextPackAutoBudgetDefaults
    : sourceContextPackResearchBudgetDefaults;
}

function sourceContextPackToEvidence(pack: SourceContextPackResult): EvidenceItem[] {
  const seen = new Set<string>();
  return pack.groups.flatMap((group) =>
    group.windows.flatMap((window) => {
      const evidence = sourceContextWindowToEvidence(window);
      if (seen.has(evidence.id)) return [];
      seen.add(evidence.id);
      return [evidence];
    }),
  );
}

function sourceContextWindowToEvidence(window: SourceContextPackWindow): EvidenceItem {
  const text = compactEvidenceText(window.text);
  return {
    id: `memory:${window.sourceId}:chunk:${window.chunkId}`,
    sourceKind: "memory",
    sourceUrl: window.sourceUrl,
    sourceTitle: window.sourceTitle,
    text,
    excerpt: excerptEvidenceText(text),
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

function mergeEvidence(existing: EvidenceItem[], next: EvidenceItem[]) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of next) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

function sourceContextPackStatusMessage(pack: SourceContextPackResult, evidenceCount: number) {
  const sourceCount = pack.sources.length;
  const groupCount = pack.groups.length;
  const groupIds = sourceContextPackGroupIdSummary(pack);
  const depths = sourceContextPackDepthSummary(pack);
  const prefix =
    `Loaded source context: ${sourceCount} source(s), ` +
    `${groupCount} group(s), ${evidenceCount} window(s)`;
  if (pack.compressionLog.length === 0) {
    return `${prefix}; groups ${groupIds}; depths ${depths}.`;
  }
  const reasons = Array.from(new Set(pack.compressionLog.map((entry) => entry.reason))).join(", ");
  return `${prefix}; groups ${groupIds}; depths ${depths}; adjusted ${reasons}.`;
}

function sourceContextPackMapReducePlanMessage(
  pack: SourceContextPackResult,
  options: NonNullable<AgentChatRequest["sourceContextPack"]>,
) {
  const defaults = sourceContextPackBudgetDefaults(options);
  const groupLimit = options.mapReduce?.maxGroups ?? options.maxGroups ?? defaults.maxGroups;
  const tokenBudget =
    options.mapReduce?.perGroupTokenBudget ?? options.maxGroupTokens ?? defaults.maxGroupTokens;
  const groupSummaries = pack.groups
    .slice(0, groupLimit)
    .map(
      (group) =>
        `${group.id || "group"}: ${group.sourceIds.length} source(s), ` +
        `${group.tokenEstimate} token(s), ${group.windows.length} window(s)`,
    );
  const suffix = groupSummaries.length === 0 ? "no groups" : groupSummaries.join("; ");
  return `Map-reduce plan: ${pack.groups.length} group(s), ${tokenBudget} token(s)/group; ${suffix}.`;
}

function sourceContextPackGroupIdSummary(pack: SourceContextPackResult) {
  const groupIds = pack.groups.map((group) => group.id).filter((id) => id.length > 0);
  if (groupIds.length === 0) return "none";
  return groupIds.slice(0, 4).join(", ");
}

function sourceContextPackDepthSummary(pack: SourceContextPackResult) {
  const depths = Array.from(
    new Set(
      pack.sources.map((source) => `${source.requestedLoadDepth}->${source.selectedLoadDepth}`),
    ),
  );
  return depths.length === 0 ? "none" : depths.join(", ");
}

function compactEvidenceText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function excerptEvidenceText(input: string) {
  const compact = compactEvidenceText(input);
  return compact.length <= 240 ? compact : `${compact.slice(0, 237)}...`;
}

function findNextQueuedUserMessage(messages: ChatMessageRecord[]) {
  return messages
    .filter((message) => message.role === "user" && message.status === "queued")
    .sort((left, right) => {
      const leftOrder = left.queueOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.queueOrder ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.createdAt.localeCompare(right.createdAt);
    })[0];
}

function runIdFromQueuedUserMessage(message: ChatMessageRecord) {
  return message.id.endsWith(":user") ? message.id.slice(0, -":user".length) : message.id;
}

function providerQuestionFromMessage(message: ChatMessageRecord) {
  const value = message.piAgentMessageJson?.clioProviderQuestion;
  return typeof value === "string" && value.trim().length > 0 ? value : message.content;
}

function sourceContextPackFromMessage(
  message: ChatMessageRecord,
): AgentChatRequest["sourceContextPack"] | undefined {
  return readSourceContextPackRequestOptions(message.piAgentMessageJson?.clioSourceContextPack);
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

function isTerminalAgentEvent(event: AgentStreamEvent) {
  return (
    event.type === "run_completed" ||
    event.type === "run_failed" ||
    event.type === "run_cancelled" ||
    event.type === "run_resolved"
  );
}
