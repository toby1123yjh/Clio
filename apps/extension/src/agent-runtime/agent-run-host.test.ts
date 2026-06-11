import type {
  ChatMessageRecord,
  ChatSessionDetail,
  CompactionRecord,
  CreateCompactionPayload,
  EngineRequest,
} from "@/src/shared/rpc";
import { describe, expect, it } from "vitest";
import { AgentRunHost } from "./agent-run-host";
import type { IClioCompactionRuntime } from "./compaction-context";
import type { AgentChatRequest, AgentStreamEvent, IAgentRuntime } from "./types";

function request(overrides: Partial<AgentChatRequest> = {}): AgentChatRequest {
  return {
    runId: "run-1",
    sessionId: "session-1",
    userMessageId: "run-1:user",
    assistantMessageId: "run-1:assistant",
    question: "Explain persistence",
    scope: "current-page",
    pageUrl: "https://example.com/a",
    pageTitle: "Example",
    evidence: [],
    createdAt: "2026-05-22T00:00:00.000Z",
    ...overrides,
  };
}

function runtimeFrom(events: AgentStreamEvent[]): IAgentRuntime {
  return {
    streamChat: async function* () {
      for (const event of events) {
        yield event;
      }
    },
  };
}

function engineRecorder() {
  const calls: EngineRequest[] = [];
  return {
    calls,
    requestEngine: async <T>(request: EngineRequest): Promise<T> => {
      calls.push(request);
      if (request.kind === "loadChatSession") return null as T;
      return {} as T;
    },
  };
}

function session(overrides: Partial<ChatSessionDetail> = {}): ChatSessionDetail {
  return {
    id: "session-1",
    title: "Explain persistence",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
    messageCount: 2,
    lastMessageExcerpt: "Explain persistence",
    currentEvidenceRevision: 0,
    messages: [
      {
        id: "run-1:user",
        sessionId: "session-1",
        role: "user",
        status: "completed",
        content: "Explain persistence",
        scope: "current-page",
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z",
        citations: [],
        worldKnowledge: [],
        evidenceRefs: [],
      },
      {
        id: "run-1:assistant",
        sessionId: "session-1",
        role: "assistant",
        status: "streaming",
        content: "",
        scope: "current-page",
        createdAt: "2026-05-22T00:00:00.000Z",
        updatedAt: "2026-05-22T00:00:00.000Z",
        citations: [],
        worldKnowledge: [],
        evidenceRefs: [],
      },
    ],
    evidence: [],
    ...overrides,
  };
}

async function waitFor(condition: () => boolean) {
  for (let index = 0; index < 20; index += 1) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for condition.");
}

describe("AgentRunHost", () => {
  it("owns active runs and persists stream events outside background ports", async () => {
    const engine = engineRecorder();
    const emitted: AgentStreamEvent[] = [];
    const host = new AgentRunHost({
      runtime: runtimeFrom([
        { type: "run_started", runId: "run-1" },
        { type: "text_delta", runId: "run-1", delta: "hello" },
        { type: "run_completed", runId: "run-1" },
      ]),
      requestEngine: engine.requestEngine,
      emitEvent: (event) => emitted.push(event),
    });

    host.start(request());

    await waitFor(() => emitted.some((event) => event.type === "run_completed"));

    expect(emitted.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "run_completed",
    ]);
    expect(engine.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "updateChatMessage",
          payload: expect.objectContaining({
            id: "run-1:assistant",
            sessionId: "session-1",
            appendContent: "hello",
          }),
        }),
        expect.objectContaining({
          kind: "updateChatMessage",
          payload: expect.objectContaining({
            id: "run-1:assistant",
            sessionId: "session-1",
            status: "completed",
          }),
        }),
      ]),
    );
  });

  it("marks missing active runs as interrupted when subscribe cannot reattach", async () => {
    const engine = engineRecorder();
    const emitted: AgentStreamEvent[] = [];
    const host = new AgentRunHost({
      runtime: runtimeFrom([]),
      requestEngine: engine.requestEngine,
      emitEvent: (event) => emitted.push(event),
    });

    await host.subscribe({
      runId: "missing-run",
      sessionId: "session-1",
      assistantMessageId: "run-1:assistant",
    });

    expect(emitted).toEqual([
      expect.objectContaining({
        type: "run_failed",
        runId: "missing-run",
        error: expect.objectContaining({ code: "PROVIDER_INTERRUPTED" }),
      }),
    ]);
    expect(engine.calls[0]).toMatchObject({
      kind: "updateChatMessage",
      payload: {
        id: "run-1:assistant",
        sessionId: "session-1",
        status: "interrupted",
      },
    });
  });

  it("persists stopped runs as cancelled without retry metadata", async () => {
    const engine = engineRecorder();
    const emitted: AgentStreamEvent[] = [];
    const host = new AgentRunHost({
      runtime: {
        streamChat: async function* (_request, options) {
          yield { type: "run_started", runId: "run-1" };
          await new Promise<void>((resolve) =>
            options?.signal?.addEventListener("abort", () => resolve(), { once: true }),
          );
        },
      },
      requestEngine: engine.requestEngine,
      emitEvent: (event) => emitted.push(event),
    });

    host.start(request());
    await waitFor(() => emitted.some((event) => event.type === "run_started"));
    host.cancel("run-1");
    await waitFor(() => emitted.some((event) => event.type === "run_cancelled"));

    expect(engine.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "updateChatMessage",
          payload: expect.objectContaining({
            id: "run-1:assistant",
            sessionId: "session-1",
            status: "cancelled",
            clearRetry: true,
          }),
        }),
      ]),
    );
  });

  it("keeps provider-started stops as cancelled instead of pre-provider resolution", async () => {
    const engine = engineRecorder();
    const emitted: AgentStreamEvent[] = [];
    const host = new AgentRunHost({
      runtime: {
        streamChat: async function* (_request, options) {
          yield { type: "run_started", runId: "run-1" } satisfies AgentStreamEvent;
          yield { type: "text_delta", runId: "run-1", delta: "partial" } satisfies AgentStreamEvent;
          await new Promise<void>((resolve) =>
            options?.signal?.addEventListener("abort", () => resolve(), { once: true }),
          );
          throw new Error("Provider aborted.");
        },
      },
      requestEngine: engine.requestEngine,
      emitEvent: (event) => emitted.push(event),
    });

    host.start(request());
    await waitFor(() => emitted.some((event) => event.type === "text_delta"));
    host.cancel("run-1");
    await waitFor(() => emitted.some((event) => event.type === "run_cancelled"));

    expect(emitted.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "run_cancelled",
    ]);
    expect(engine.calls.some((engineRequest) => engineRequest.kind === "deleteChatMessage")).toBe(
      false,
    );
    expect(engine.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "updateChatMessage",
          payload: expect.objectContaining({
            id: "run-1:assistant",
            sessionId: "session-1",
            status: "cancelled",
            clearRetry: true,
          }),
        }),
      ]),
    );
  });

  it("resolves over-window context locally without calling the provider", async () => {
    const calls: EngineRequest[] = [];
    let providerCalled = false;
    const emitted: AgentStreamEvent[] = [];
    const host = new AgentRunHost({
      runtime: {
        streamChat: () => {
          providerCalled = true;
          return (async function* () {
            yield { type: "run_started", runId: "unexpected-run" } satisfies AgentStreamEvent;
          })();
        },
      },
      compactionRuntime: {
        getContextWindow: () => 1,
        shouldCompact: () => false,
        compact: async () => ({ status: "noop" }),
      },
      requestEngine: async <T>(engineRequest: EngineRequest): Promise<T> => {
        calls.push(engineRequest);
        if (engineRequest.kind === "loadChatSession") return session() as T;
        if (engineRequest.kind === "getLatestCompaction") return null as T;
        if (engineRequest.kind === "deleteChatMessage") return { deleted: true } as T;
        return {} as T;
      },
      emitEvent: (event) => emitted.push(event),
    });

    host.start(request());

    await waitFor(() => emitted.some((event) => event.type === "run_resolved"));

    expect(providerCalled).toBe(false);
    expect(emitted).toContainEqual({
      type: "run_resolved",
      runId: "run-1",
      message: "Context too large",
      removeAssistantMessageId: "run-1:assistant",
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "deleteChatMessage",
          sessionId: "session-1",
          messageId: "run-1:assistant",
        }),
      ]),
    );
  });

  it("does not start the provider when stop arrives after automatic compaction commits", async () => {
    const calls: EngineRequest[] = [];
    let providerCalled = false;
    const emitted: AgentStreamEvent[] = [];
    const payload: CreateCompactionPayload = {
      sessionId: "session-1",
      summary: "Earlier persistence summary.",
      firstKeptMessageId: "run-1:user",
      evidenceSummary: "",
      tokensBefore: 5000,
    };
    const hostRef: { current?: AgentRunHost } = {};

    const host = new AgentRunHost({
      runtime: {
        streamChat: () => {
          providerCalled = true;
          return (async function* () {
            yield { type: "run_started", runId: "run-1" } satisfies AgentStreamEvent;
          })();
        },
      },
      compactionRuntime: {
        getContextWindow: () => 100_000,
        shouldCompact: () => true,
        compact: async () => ({ status: "compacted", payload }),
      },
      requestEngine: async <T>(engineRequest: EngineRequest): Promise<T> => {
        calls.push(engineRequest);
        if (engineRequest.kind === "loadChatSession") return session() as T;
        if (engineRequest.kind === "getLatestCompaction") return null as T;
        if (engineRequest.kind === "appendCompaction") {
          hostRef.current?.cancel("run-1");
          const record = {
            id: "compaction-1",
            createdAt: "2026-05-22T00:00:01.000Z",
            coveredEvidence: [],
            ...engineRequest.payload,
          } satisfies CompactionRecord;
          return record as T;
        }
        if (engineRequest.kind === "clearQueuedChatMessages") return { cleared: 0 } as T;
        if (engineRequest.kind === "deleteChatMessage") return { deleted: true } as T;
        return {} as T;
      },
      emitEvent: (event) => emitted.push(event),
    });
    hostRef.current = host;

    host.start(request());

    await waitFor(() => emitted.some((event) => event.type === "run_resolved"));

    expect(providerCalled).toBe(false);
    expect(emitted).toContainEqual({
      type: "run_resolved",
      runId: "run-1",
      message: "Stopped.",
      removeAssistantMessageId: "run-1:assistant",
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "appendCompaction", payload }),
        expect.objectContaining({ kind: "clearQueuedChatMessages", sessionId: "session-1" }),
        expect.objectContaining({
          kind: "deleteChatMessage",
          sessionId: "session-1",
          messageId: "run-1:assistant",
        }),
      ]),
    );
  });

  it("pauses later queued follow-ups when a queued turn is context-too-large", async () => {
    const emitted: AgentStreamEvent[] = [];
    const providerCalls: string[] = [];
    let contextWindow = 100_000;
    let messages: ChatMessageRecord[] = [
      ...session().messages,
      {
        id: "queued-1:user",
        sessionId: "session-1",
        role: "user",
        status: "queued",
        content: "Queued one",
        scope: "current-page",
        pageUrl: "https://example.com/a",
        pageTitle: "Example",
        createdAt: "2026-05-22T00:00:01.000Z",
        updatedAt: "2026-05-22T00:00:01.000Z",
        citations: [],
        worldKnowledge: [],
        evidenceRefs: [],
        queueOrder: 1,
        runId: "queued-1",
      },
      {
        id: "queued-2:user",
        sessionId: "session-1",
        role: "user",
        status: "queued",
        content: "Queued two",
        scope: "current-page",
        pageUrl: "https://example.com/a",
        pageTitle: "Example",
        createdAt: "2026-05-22T00:00:02.000Z",
        updatedAt: "2026-05-22T00:00:02.000Z",
        citations: [],
        worldKnowledge: [],
        evidenceRefs: [],
        queueOrder: 2,
        runId: "queued-2",
      },
    ];

    const host = new AgentRunHost({
      runtime: {
        streamChat: async function* (agentRequest) {
          providerCalls.push(agentRequest.runId);
          yield { type: "run_completed", runId: agentRequest.runId } satisfies AgentStreamEvent;
        },
      },
      compactionRuntime: {
        getContextWindow: () => contextWindow,
        shouldCompact: () => false,
        compact: async () => ({ status: "noop" }),
      },
      requestEngine: async <T>(engineRequest: EngineRequest): Promise<T> => {
        if (engineRequest.kind === "loadChatSession") {
          return session({ messages, messageCount: messages.length }) as T;
        }
        if (engineRequest.kind === "getLatestCompaction") return null as T;
        if (engineRequest.kind === "updateChatMessage") {
          messages = messages.map((message) =>
            message.id === engineRequest.payload.id
              ? {
                  ...message,
                  status: engineRequest.payload.status ?? message.status,
                  evidenceRefs: engineRequest.payload.evidenceRefs ?? message.evidenceRefs,
                  updatedAt: engineRequest.payload.updatedAt ?? message.updatedAt,
                }
              : message,
          );
          if (
            engineRequest.payload.id === "run-1:assistant" &&
            engineRequest.payload.status === "completed"
          ) {
            contextWindow = 1;
          }
          const updated = messages.find((message) => message.id === engineRequest.payload.id);
          if (updated === undefined) throw new Error("Missing message");
          return updated as T;
        }
        if (engineRequest.kind === "upsertChatMessage") {
          const now = engineRequest.payload.updatedAt ?? engineRequest.payload.createdAt;
          const record: ChatMessageRecord = {
            id: engineRequest.payload.id,
            sessionId: engineRequest.payload.sessionId,
            role: engineRequest.payload.role,
            status: engineRequest.payload.status,
            content: engineRequest.payload.content,
            scope: engineRequest.payload.scope,
            pageUrl: engineRequest.payload.pageUrl,
            pageTitle: engineRequest.payload.pageTitle,
            selectionText: engineRequest.payload.selectionText,
            createdAt: engineRequest.payload.createdAt ?? now ?? "2026-05-22T00:00:00.000Z",
            updatedAt: now ?? "2026-05-22T00:00:00.000Z",
            citations: engineRequest.payload.citations ?? [],
            worldKnowledge: engineRequest.payload.worldKnowledge ?? [],
            evidenceRefs: engineRequest.payload.evidenceRefs ?? [],
            error: engineRequest.payload.error,
            retry: engineRequest.payload.retry,
            piAgentMessageJson: engineRequest.payload.piAgentMessageJson,
            runId: engineRequest.payload.runId,
            queueOrder: engineRequest.payload.queueOrder,
          };
          messages = [...messages.filter((message) => message.id !== record.id), record];
          return record as T;
        }
        if (engineRequest.kind === "deleteChatMessage") {
          messages = messages.filter((message) => message.id !== engineRequest.messageId);
          return { deleted: true } as T;
        }
        return {} as T;
      },
      emitEvent: (event) => emitted.push(event),
    });

    host.start(request());

    await waitFor(() =>
      emitted.some((event) => event.type === "run_resolved" && event.runId === "queued-1"),
    );

    expect(providerCalls).toEqual(["run-1"]);
    expect(emitted).toContainEqual({
      type: "run_resolved",
      runId: "queued-1",
      message: "Context too large",
      removeAssistantMessageId: "queued-1:assistant",
    });
    expect(messages.find((message) => message.id === "queued-1:user")?.status).toBe("completed");
    expect(messages.find((message) => message.id === "queued-2:user")?.status).toBe("queued");
    expect(messages.some((message) => message.id === "queued-1:assistant")).toBe(false);
  });

  it("uses the provider question metadata when starting a queued skill follow-up", async () => {
    const providerQuestions: string[] = [];
    const assistantRetries: unknown[] = [];
    let messages: ChatMessageRecord[] = [
      ...session().messages,
      {
        id: "queued-1:user",
        sessionId: "session-1",
        role: "user",
        status: "queued",
        content: "Translate page",
        scope: "current-page",
        pageUrl: "https://example.com/a",
        pageTitle: "Example",
        createdAt: "2026-05-22T00:00:01.000Z",
        updatedAt: "2026-05-22T00:00:01.000Z",
        citations: [],
        worldKnowledge: [],
        evidenceRefs: [],
        queueOrder: 1,
        runId: "queued-1",
        piAgentMessageJson: {
          role: "user",
          content: "Translate page",
          clioProviderQuestion: "Translate the attached page.\n\nSource: Page.",
          timestamp: Date.parse("2026-05-22T00:00:01.000Z"),
        },
      },
    ];
    const host = new AgentRunHost({
      runtime: {
        streamChat: async function* (agentRequest) {
          providerQuestions.push(agentRequest.question);
          yield { type: "run_completed", runId: agentRequest.runId } satisfies AgentStreamEvent;
        },
      },
      requestEngine: async <T>(engineRequest: EngineRequest): Promise<T> => {
        if (engineRequest.kind === "loadChatSession") {
          return session({ messages, messageCount: messages.length }) as T;
        }
        if (engineRequest.kind === "updateChatMessage") {
          messages = messages.map((message) =>
            message.id === engineRequest.payload.id
              ? {
                  ...message,
                  status: engineRequest.payload.status ?? message.status,
                  evidenceRefs: engineRequest.payload.evidenceRefs ?? message.evidenceRefs,
                  updatedAt: engineRequest.payload.updatedAt ?? message.updatedAt,
                }
              : message,
          );
          const updated = messages.find((message) => message.id === engineRequest.payload.id);
          if (updated === undefined) throw new Error("Missing message");
          return updated as T;
        }
        if (engineRequest.kind === "upsertChatMessage") {
          if (engineRequest.payload.role === "assistant") {
            assistantRetries.push(engineRequest.payload.retry);
          }
          const now = engineRequest.payload.updatedAt ?? engineRequest.payload.createdAt;
          const record: ChatMessageRecord = {
            id: engineRequest.payload.id,
            sessionId: engineRequest.payload.sessionId,
            role: engineRequest.payload.role,
            status: engineRequest.payload.status,
            content: engineRequest.payload.content,
            scope: engineRequest.payload.scope,
            pageUrl: engineRequest.payload.pageUrl,
            pageTitle: engineRequest.payload.pageTitle,
            selectionText: engineRequest.payload.selectionText,
            createdAt: engineRequest.payload.createdAt ?? now ?? "2026-05-22T00:00:00.000Z",
            updatedAt: now ?? "2026-05-22T00:00:00.000Z",
            citations: engineRequest.payload.citations ?? [],
            worldKnowledge: engineRequest.payload.worldKnowledge ?? [],
            evidenceRefs: engineRequest.payload.evidenceRefs ?? [],
            error: engineRequest.payload.error,
            retry: engineRequest.payload.retry,
            piAgentMessageJson: engineRequest.payload.piAgentMessageJson,
            runId: engineRequest.payload.runId,
            queueOrder: engineRequest.payload.queueOrder,
          };
          messages = [...messages.filter((message) => message.id !== record.id), record];
          return record as T;
        }
        return {} as T;
      },
      emitEvent: () => undefined,
    });

    host.start(request());

    await waitFor(() => providerQuestions.length === 2);

    expect(providerQuestions).toEqual([
      "Explain persistence",
      "Translate the attached page.\n\nSource: Page.",
    ]);
    expect(assistantRetries).toContainEqual(
      expect.objectContaining({
        question: "Translate the attached page.\n\nSource: Page.",
      }),
    );
  });

  it("starts queued general follow-ups without reusing session evidence", async () => {
    const providerRequests: AgentChatRequest[] = [];
    let messages: ChatMessageRecord[] = [
      ...session().messages,
      {
        id: "queued-1:user",
        sessionId: "session-1",
        role: "user",
        status: "queued",
        content: "Pure follow-up",
        scope: "general",
        pageUrl: "https://example.com/a",
        pageTitle: "Example",
        createdAt: "2026-05-22T00:00:01.000Z",
        updatedAt: "2026-05-22T00:00:01.000Z",
        citations: [],
        worldKnowledge: [],
        evidenceRefs: [],
        queueOrder: 1,
        runId: "queued-1",
      },
    ];
    const host = new AgentRunHost({
      runtime: {
        streamChat: async function* (agentRequest) {
          providerRequests.push(agentRequest);
          yield { type: "run_completed", runId: agentRequest.runId } satisfies AgentStreamEvent;
        },
      },
      requestEngine: async <T>(engineRequest: EngineRequest): Promise<T> => {
        if (engineRequest.kind === "loadChatSession") {
          return session({
            currentEvidenceRevision: 1,
            messages,
            messageCount: messages.length,
            evidence: [
              {
                id: "old-page-evidence",
                sessionId: "session-1",
                revision: 1,
                sourceKind: "page",
                pageUrl: "https://example.com/a",
                pageTitle: "Example",
                text: "Old page evidence",
                excerpt: "Old page evidence",
                metadata: {},
                createdAt: "2026-05-22T00:00:00.500Z",
              },
            ],
          }) as T;
        }
        if (engineRequest.kind === "updateChatMessage") {
          messages = messages.map((message) =>
            message.id === engineRequest.payload.id
              ? {
                  ...message,
                  status: engineRequest.payload.status ?? message.status,
                  evidenceRefs: engineRequest.payload.evidenceRefs ?? message.evidenceRefs,
                  updatedAt: engineRequest.payload.updatedAt ?? message.updatedAt,
                }
              : message,
          );
          const updated = messages.find((message) => message.id === engineRequest.payload.id);
          if (updated === undefined) throw new Error("Missing message");
          return updated as T;
        }
        if (engineRequest.kind === "upsertChatMessage") {
          const now = engineRequest.payload.updatedAt ?? engineRequest.payload.createdAt;
          const record: ChatMessageRecord = {
            id: engineRequest.payload.id,
            sessionId: engineRequest.payload.sessionId,
            role: engineRequest.payload.role,
            status: engineRequest.payload.status,
            content: engineRequest.payload.content,
            scope: engineRequest.payload.scope,
            pageUrl: engineRequest.payload.pageUrl,
            pageTitle: engineRequest.payload.pageTitle,
            selectionText: engineRequest.payload.selectionText,
            createdAt: engineRequest.payload.createdAt ?? now ?? "2026-05-22T00:00:00.000Z",
            updatedAt: now ?? "2026-05-22T00:00:00.000Z",
            citations: engineRequest.payload.citations ?? [],
            worldKnowledge: engineRequest.payload.worldKnowledge ?? [],
            evidenceRefs: engineRequest.payload.evidenceRefs ?? [],
            error: engineRequest.payload.error,
            retry: engineRequest.payload.retry,
            piAgentMessageJson: engineRequest.payload.piAgentMessageJson,
            runId: engineRequest.payload.runId,
            queueOrder: engineRequest.payload.queueOrder,
          };
          messages = [...messages.filter((message) => message.id !== record.id), record];
          return record as T;
        }
        return {} as T;
      },
      emitEvent: () => undefined,
    });

    host.start(request());

    await waitFor(() => providerRequests.length === 2);

    expect(providerRequests[1]).toMatchObject({
      runId: "queued-1",
      scope: "general",
      evidence: [],
      currentTurnEvidenceRefs: [],
    });
    expect(messages.find((message) => message.id === "queued-1:user")?.evidenceRefs).toEqual([]);
    expect(messages.find((message) => message.id === "queued-1:assistant")?.evidenceRefs).toEqual(
      [],
    );
  });

  it("runs manual compact without creating transcript messages", async () => {
    const calls: EngineRequest[] = [];
    const emitted: AgentStreamEvent[] = [];
    const payload: CreateCompactionPayload = {
      sessionId: "session-1",
      summary: "Earlier discussion about persistence.",
      firstKeptMessageId: "run-1:user",
      evidenceSummary: "",
      tokensBefore: 5000,
    };
    const compactionRuntime: IClioCompactionRuntime = {
      getContextWindow: () => 100_000,
      shouldCompact: () => false,
      compact: async () => ({ status: "compacted", payload }),
    };
    const host = new AgentRunHost({
      runtime: runtimeFrom([]),
      compactionRuntime,
      requestEngine: async <T>(engineRequest: EngineRequest): Promise<T> => {
        calls.push(engineRequest);
        if (engineRequest.kind === "loadChatSession") return session() as T;
        if (engineRequest.kind === "getLatestCompaction") return null as T;
        if (engineRequest.kind === "appendCompaction") {
          const record = {
            id: "compaction-1",
            createdAt: "2026-05-22T00:00:01.000Z",
            coveredEvidence: [],
            ...engineRequest.payload,
          } satisfies CompactionRecord;
          return record as T;
        }
        return {} as T;
      },
      emitEvent: (event) => emitted.push(event),
    });

    host.startManualCompact({ runId: "compact-1", sessionId: "session-1" });

    await waitFor(() => emitted.some((event) => event.type === "run_resolved"));

    expect(emitted.map((event) => event.type)).toEqual(["runtime_status", "run_resolved"]);
    expect(emitted[0]).toMatchObject({
      type: "runtime_status",
      runId: "compact-1",
      message: "Compacting...",
      running: true,
    });
    expect(emitted[1]).toEqual({
      type: "run_resolved",
      runId: "compact-1",
      message: "Compacted",
    });
    expect(calls).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "appendCompaction", payload })]),
    );
    expect(calls.some((engineRequest) => engineRequest.kind === "upsertChatMessage")).toBe(false);
  });

  it("treats manual compact without an active session as a no-op", async () => {
    const calls: EngineRequest[] = [];
    const emitted: AgentStreamEvent[] = [];
    const host = new AgentRunHost({
      runtime: runtimeFrom([]),
      compactionRuntime: {
        getContextWindow: () => 100_000,
        shouldCompact: () => false,
        compact: async () => ({ status: "noop" }),
      },
      requestEngine: async <T>(engineRequest: EngineRequest): Promise<T> => {
        calls.push(engineRequest);
        return {} as T;
      },
      emitEvent: (event) => emitted.push(event),
    });

    host.startManualCompact({ runId: "compact-1" });

    await waitFor(() => emitted.some((event) => event.type === "run_resolved"));

    expect(emitted).toEqual([
      { type: "run_resolved", runId: "compact-1", message: "Nothing to compact yet" },
    ]);
    expect(calls).toEqual([]);
  });
});
