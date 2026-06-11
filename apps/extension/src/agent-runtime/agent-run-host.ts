import type {
  ChatMessageRecord,
  ChatSessionDetail,
  CompactionRecord,
  EngineRequest,
  SessionEvidenceRecord,
} from "@/src/shared/rpc";
import {
  type IClioCompactionRuntime,
  buildRequestWithProviderContext,
  estimateProviderContextTokens,
} from "./compaction-context";
import type {
  AgentChatRequest,
  AgentStreamEvent,
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
    const { sessionId } = run.request;
    if (this.compactionRuntime === undefined || sessionId === undefined) {
      return run.request;
    }

    const session = await this.requestEngine<ChatSessionDetail | null>({
      kind: "loadChatSession",
      sessionId,
    });
    if (session === null) return run.request;

    let latestCompaction = await this.requestEngine<CompactionRecord | null>({
      kind: "getLatestCompaction",
      sessionId,
    });
    const contextWindow = await this.compactionRuntime.getContextWindow();
    let requestWithContext = buildRequestWithProviderContext({
      request: run.request,
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
          currentRequest: run.request,
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
            request: run.request,
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
          piAgentMessageJson: assistantPiAgentMessageJson(run.content, updatedAt),
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
    if (event.type === "run_completed") {
      const updatedAt = new Date().toISOString();
      await this.requestEngine<ChatMessageRecord>({
        kind: "updateChatMessage",
        payload: {
          id: assistantMessageId,
          sessionId,
          status: "completed",
          piAgentMessageJson: assistantPiAgentMessageJson(run.content, updatedAt),
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
          piAgentMessageJson: assistantPiAgentMessageJson(run.content, updatedAt),
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
          piAgentMessageJson: assistantPiAgentMessageJson(run.content, updatedAt),
          updatedAt,
        },
      });
    }
  }
}

function assistantPiAgentMessageJson(content: string, at: string) {
  return {
    role: "assistant",
    content,
    timestamp: Date.parse(at) || Date.now(),
  };
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
