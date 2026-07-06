import { describe, expect, it } from "vitest";
import {
  type ActiveEmbeddingModelSummary,
  CLIO_AGENT_RUN_EVENT,
  CLIO_AGENT_RUN_REQUEST,
  CLIO_AGENT_STREAM_COMPACT,
  CLIO_AGENT_STREAM_EVENT,
  CLIO_AGENT_STREAM_SUBSCRIBE,
  CLIO_CONTENT_COMMAND,
  CLIO_ENGINE_REQUEST,
  CLIO_IMAGE_GENERATION_RUN_EVENT,
  CLIO_IMAGE_GENERATION_RUN_REQUEST,
  CLIO_IMAGE_GENERATION_STREAM_CANCEL,
  CLIO_IMAGE_GENERATION_STREAM_EVENT,
  CLIO_IMAGE_GENERATION_STREAM_REQUEST,
  CLIO_PROVIDER_CONFIG_REQUEST,
  CLIO_PROVIDER_REQUEST,
  CLIO_UI_REQUEST,
  CLIO_WEB_SEARCH_RUN_EVENT,
  CLIO_WEB_SEARCH_RUN_REQUEST,
  CLIO_WEB_SEARCH_STREAM_EVENT,
  CLIO_WEB_SEARCH_STREAM_REQUEST,
  CLIO_WORKER_EMBEDDING_REQUEST,
  CLIO_WORKER_EMBEDDING_RESPONSE,
  type RetrieveSourceHitChunk,
  type RetrieveSourceItem,
  isAgentRunEventMessage,
  isAgentRunRequestMessage,
  isAgentStreamCompactMessage,
  isAgentStreamEventMessage,
  isAgentStreamSubscribeMessage,
  isContentCommandMessage,
  isEngineRequestMessage,
  isImageGenerationRunEventMessage,
  isImageGenerationRunRequestMessage,
  isImageGenerationStreamCancelMessage,
  isImageGenerationStreamEventMessage,
  isImageGenerationStreamRequestMessage,
  isProviderConfigRequestMessage,
  isProviderRequestMessage,
  isUiRequestMessage,
  isWebSearchRunEventMessage,
  isWebSearchRunRequestMessage,
  isWebSearchStreamEventMessage,
  isWebSearchStreamRequestMessage,
  isWorkerEmbeddingRequestMessage,
  isWorkerEmbeddingResponseMessage,
} from "./rpc";

describe("session engine RPC guards", () => {
  it("accepts typed PDF and Markdown capture requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "captureMarkdown",
          payload: {
            sourceUrl: "clio://upload/notes.md",
            sourceTitle: "notes.md",
            markdownText: "# Notes\n\nLocal markdown evidence.",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "capturePdf",
          payload: {
            sourceUrl: "clio://upload/paper.pdf",
            sourceTitle: "paper.pdf",
            bytes: new Uint8Array([1, 2, 3]),
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "capturePdf",
          payload: {
            sourceUrl: "clio://upload/paper.pdf",
            sourceTitle: "paper.pdf",
            bytes: new ArrayBuffer(4),
          },
        },
      }),
    ).toBe(true);
  });

  it("rejects malformed PDF and Markdown capture requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "captureMarkdown",
          payload: {
            sourceUrl: "clio://upload/notes.md",
            sourceTitle: "notes.md",
            normalizedText: "# Wrong field",
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "capturePdf",
          payload: {
            sourceUrl: "clio://upload/paper.pdf",
            sourceTitle: "paper.pdf",
            bytes: "not bytes",
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts typed topic page requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listTopicPages", query: "onboarding", limit: 20 },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "getTopicPage", id: "topic-1" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "createTopicPage",
          payload: {
            title: "Customer onboarding",
            summary: "Derived operating notes",
            content: "Use saved memories as evidence.",
            sourceRefs: [{ memoryId: "mem-1", chunkId: "chunk-1", quote: "saved quote" }],
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "updateTopicPage",
          id: "topic-1",
          payload: {
            title: "Updated onboarding",
            sourceRefs: [{ memoryId: "mem-1" }],
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "deleteTopicPage", id: "topic-1" },
      }),
    ).toBe(true);
  });

  it("rejects invalid topic page source refs", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "createTopicPage",
          payload: {
            title: "Customer onboarding",
            sourceRefs: [{ memoryId: 42 }],
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts typed wiki compile job and graph requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "enqueueWikiCompile",
          payload: {
            topicId: "topic-1",
            query: "Customer onboarding",
            instructions: "Focus on durable operating notes.",
            sourceMemoryIds: ["mem-1", "mem-2"],
            maxAttempts: 3,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listWikiCompileJobs", status: "queued", limit: 10 },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "getWikiCompileJob", id: "wiki-job-1" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendWikiCompileJobEvent",
          payload: {
            jobId: "wiki-job-1",
            kind: "sources_selected",
            level: "info",
            message: "2 source memories selected.",
            detail: { sourceMemoryCount: 2 },
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listWikiCompileJobEvents", jobId: "wiki-job-1", limit: 20 },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "claimNextWikiCompileJob", now: "2026-06-21T00:00:00.000Z" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "claimNextWikiCompileJob",
          id: "wiki-job-1",
          now: "2026-06-21T00:00:00.000Z",
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "completeWikiCompileJob",
          id: "wiki-job-1",
          result: {
            topic: {
              title: "Customer onboarding",
              summary: "Compiled from saved memories.",
              content: "## What matters\nUse the cited source memories.",
            },
            sourceRefs: [{ memoryId: "mem-1", chunkId: "chunk-1", quote: "saved quote" }],
            edges: [
              {
                kind: "source",
                memoryId: "mem-1",
                chunkId: "chunk-1",
                weight: 1,
                label: "evidence",
              },
              {
                kind: "related",
                toTopicId: "topic-2",
                weight: 0.6,
              },
            ],
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "failWikiCompileJob",
          id: "wiki-job-1",
          error: "Provider failed",
          retryAfter: "2026-06-21T00:01:00.000Z",
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listTopicGraphEdges", topicId: "topic-1", edgeKind: "source" },
      }),
    ).toBe(true);
  });

  it("rejects invalid wiki compile graph edges", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "completeWikiCompileJob",
          id: "wiki-job-1",
          result: {
            edges: [{ kind: "invalid", memoryId: "mem-1" }],
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts typed graph build and query requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceGraph",
          payload: { sourceId: "source-1", mode: "deterministic" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphNeighbors",
          payload: {
            sourceId: "source-1",
            kind: "method",
            dimension: "technical",
            depth: 2,
            limit: 40,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphSubgraph",
          payload: {
            sourceIds: ["source-1", "source-2"],
            dimension: "domain",
            limit: 80,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphPath",
          payload: {
            from: { sourceId: "source-1" },
            to: { canonicalId: "method:retrieval", kind: "method" },
            dimension: "technical",
            maxDepth: 3,
            limit: 80,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphTimeline",
          payload: {
            sourceIds: ["source-1", "source-2"],
            kind: "method",
            dimension: "domain",
            order: "asc",
            limit: 80,
          },
        },
      }),
    ).toBe(true);
  });

  it("rejects invalid graph build and query payloads", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceGraph",
          payload: { sourceId: "source-1", mode: "provider" },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphNeighbors",
          payload: { sourceId: "source-1", kind: "chunk" },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphNeighbors",
          payload: { sourceId: "source-1", dimension: "semantic" },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphSubgraph",
          payload: { sourceIds: ["source-1", 42] },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphPath",
          payload: { from: {}, to: { sourceId: "source-1" } },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphPath",
          payload: { from: { sourceId: "source-1" }, to: { canonicalId: "x" }, maxDepth: "3" },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "queryGraphTimeline",
          payload: { sourceIds: ["source-1"], order: "latest" },
        },
      }),
    ).toBe(false);
  });

  it("rejects invalid wiki compile event payloads", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendWikiCompileJobEvent",
          payload: {
            jobId: "wiki-job-1",
            kind: "provider_started",
            level: "verbose",
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendWikiCompileJobEvent",
          payload: {
            jobId: "wiki-job-1",
            kind: "provider_started",
            detail: "not an object",
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts typed chat session requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "createChatSession",
          payload: {
            title: "Explain persistence",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            initialScope: "general",
            ownerId: "owner-1",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "upsertChatMessage",
          payload: {
            id: "run-1:user",
            sessionId: "sess-1",
            role: "user",
            status: "completed",
            content: "Explain persistence",
            scope: "general",
            evidenceRefs: ["ev-1"],
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "updateChatMessage",
          payload: {
            id: "run-1:assistant",
            sessionId: "sess-1",
            status: "streaming",
            content: "",
            clearError: true,
            clearRetry: true,
          },
        },
      }),
    ).toBe(true);
  });

  it("rejects invalid chat message payloads", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "upsertChatMessage",
          payload: {
            id: "run-1:user",
            sessionId: "sess-1",
            role: "model",
            status: "completed",
            content: "Explain persistence",
            scope: "current-page",
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts typed agent stream subscribe messages", () => {
    expect(
      isAgentStreamSubscribeMessage({
        type: CLIO_AGENT_STREAM_SUBSCRIBE,
        requestId: "request-1",
        runId: "run-1",
        sessionId: "session-1",
        assistantMessageId: "run-1:assistant",
      }),
    ).toBe(true);

    expect(
      isAgentStreamSubscribeMessage({
        type: CLIO_AGENT_STREAM_SUBSCRIBE,
        requestId: "request-1",
        runId: "run-1",
        sessionId: "session-1",
      }),
    ).toBe(false);
  });

  it("accepts typed manual compaction stream messages", () => {
    expect(
      isAgentStreamCompactMessage({
        type: CLIO_AGENT_STREAM_COMPACT,
        requestId: "request-1",
        runId: "compact-1",
        sessionId: "session-1",
      }),
    ).toBe(true);

    expect(
      isAgentStreamCompactMessage({
        type: CLIO_AGENT_STREAM_COMPACT,
        requestId: "request-1",
        runId: "compact-1",
      }),
    ).toBe(true);

    expect(
      isAgentStreamCompactMessage({
        type: CLIO_AGENT_STREAM_COMPACT,
        requestId: "request-1",
        sessionId: "session-1",
      }),
    ).toBe(false);
  });

  it("accepts the Rail settings content command", () => {
    expect(
      isContentCommandMessage({
        type: CLIO_CONTENT_COMMAND,
        command: { action: "openSettings" },
      }),
    ).toBe(true);
  });

  it("accepts typed offscreen agent run request and event messages", () => {
    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "start",
          request: {
            runId: "run-1",
            question: "Explain persistence",
            scope: "general",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            evidence: [],
            currentTurnEvidenceRefs: ["ev-1"],
            sourceContextPack: {
              mode: "research",
              planner: "source_context_planner_v1",
              triggerReason: "explicit_research_command",
              maxTotalTokens: 10_000,
              maxGroups: 3,
              maxGroupTokens: 4_000,
              maxSources: 8,
              maxWindowsPerSource: 2,
              contextChunksBefore: 1,
              contextChunksAfter: 1,
              mapReduce: {
                enabled: true,
                maxGroups: 3,
                perGroupTokenBudget: 4_000,
              },
            },
            createdAt: "2026-05-22T00:00:00.000Z",
          },
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "start",
          request: {
            runId: "run-1",
            question: "Explain persistence",
            scope: "general",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            evidence: [],
            sourceContextPack: {
              mode: "auto",
              planner: "source_context_planner_v1",
              triggerReason: "default_chat_long_context_intent",
              maxTotalTokens: 6_000,
              maxGroups: 2,
              maxGroupTokens: 3_000,
              maxSources: 4,
              maxWindowsPerSource: 2,
              contextChunksBefore: 1,
              contextChunksAfter: 1,
              mapReduce: {
                enabled: true,
                maxGroups: 2,
                perGroupTokenBudget: 3_000,
              },
            },
            createdAt: "2026-05-22T00:00:00.000Z",
          },
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "start",
          request: {
            runId: "run-1",
            question: "Explain persistence",
            scope: "general",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            evidence: [],
            sourceContextPack: { mode: "automatic" },
            createdAt: "2026-05-22T00:00:00.000Z",
          },
        },
      }),
    ).toBe(false);

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "start",
          request: {
            runId: "run-1",
            question: "Explain persistence",
            scope: "general",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            evidence: [],
            sourceContextPack: { mode: "auto", maxTotalTokens: "6000" },
            createdAt: "2026-05-22T00:00:00.000Z",
          },
        },
      }),
    ).toBe(false);

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "subscribe",
          runId: "run-1",
          sessionId: "session-1",
          assistantMessageId: "run-1:assistant",
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "compact",
          runId: "compact-1",
          sessionId: "session-1",
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: { type: "run_resolved", runId: "run-1", message: "Context too large" },
      }),
    ).toBe(true);
  });

  it("accepts memory evidence for agent runs but not session evidence writes", () => {
    const memoryEvidence = {
      id: "memory:mem-1:chunk:chunk-1",
      sourceKind: "memory",
      sourceUrl: "https://example.com/memory",
      sourceTitle: "Saved Memory",
      text: "Bounded memory evidence text",
      excerpt: "Bounded memory evidence text",
    };

    expect(
      isAgentRunRequestMessage({
        type: CLIO_AGENT_RUN_REQUEST,
        request: {
          kind: "start",
          request: {
            runId: "run-memory-1",
            question: "What do I know about billing?",
            scope: "general",
            pageUrl: "https://example.com/a",
            pageTitle: "Example",
            evidence: [memoryEvidence],
            currentTurnEvidenceRefs: [memoryEvidence.id],
            createdAt: "2026-06-29T00:00:00.000Z",
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendSessionEvidence",
          payload: {
            sessionId: "session-1",
            evidence: memoryEvidence,
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts bounded memory evidence window requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "getMemoryEvidenceWindows",
          payload: {
            query: "billing notes",
            memoryIds: ["mem-1", "mem-2"],
            anchors: [
              { memoryId: "mem-1", chunkId: "chunk-1" },
              { memoryId: "mem-2", ord: 3 },
            ],
            limit: 8,
            maxWindowsPerMemory: 2,
            contextChunksBefore: 1,
            contextChunksAfter: 1,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "getMemoryEvidenceWindows",
          payload: {
            memoryIds: [42],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "getMemoryEvidenceWindows",
          payload: {
            anchors: [{ memoryId: "mem-1" }],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "getMemoryEvidenceWindows",
          payload: {
            anchors: [{ memoryId: "mem-1", chunkId: 42 }],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "getMemoryEvidenceWindows",
          payload: {
            query: "billing notes",
            contextChunksBefore: "wide",
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts source context pack requests and rejects invalid payloads", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceContextPack",
          payload: {
            query: "bounded source context",
            sourceIds: ["source-1", "source-2"],
            anchors: [
              { memoryId: "source-1", chunkId: "chunk-1" },
              { memoryId: "source-2", ord: 4 },
            ],
            useWorkingSet: true,
            maxTotalTokens: 12_000,
            maxGroups: 3,
            maxGroupTokens: 4_000,
            maxSources: 8,
            maxWindowsPerSource: 2,
            contextChunksBefore: 1,
            contextChunksAfter: 1,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceContextPack",
          payload: {
            sourceIds: ["source-1", 42],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceContextPack",
          payload: {
            anchors: [{ memoryId: "source-1" }],
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceContextPack",
          payload: {
            useWorkingSet: "yes",
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "buildSourceContextPack",
          payload: {
            maxGroupTokens: "large",
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts source retrieval requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "retrieveSources",
          payload: {
            query: "context window retrieval",
            limit: 20,
            scope: "all",
            includeChunks: 3,
            filter: {
              sourceTypes: ["webpage", "research-note"],
              lifecycleStatuses: ["fresh", "stale", "archived"],
            },
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "retrieveSources",
          payload: {
            query: "context window retrieval",
            scope: "current_page",
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "retrieveSources",
          payload: {
            limit: 20,
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "retrieveSources",
          payload: {
            query: "context window retrieval",
            filter: {
              lifecycleStatuses: ["deleted"],
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "retrieveSources",
          payload: {
            query: "context window retrieval",
            filter: {
              sourceTypes: "webpage",
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts knowledge base search requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            query: "long context degradation",
            limit: 20,
            includeChunks: 2,
            filter: {
              sourceTypes: ["paper", "pdf"],
              lifecycleStatuses: ["fresh", "stale"],
            },
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            query: "long context degradation",
            filter: {
              lifecycleStatuses: ["deleted"],
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            limit: 20,
          },
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "searchKnowledgeBase",
          payload: {
            query: "long context degradation",
            filter: {
              sourceTypes: "paper",
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts working set requests and rejects invalid load depths", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "getWorkingSetStatus" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listWorkingSetEntries" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "pinWorkingSetSource",
          payload: { sourceId: "source-1", loadDepth: "chunks" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "reloadWorkingSetSource",
          payload: { sourceId: "source-1", loadDepth: "full" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "evictWorkingSetSource",
          payload: { sourceId: "source-1", reason: "over budget" },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "setWorkingSetSourceDepth",
          payload: { sourceId: "source-1", loadDepth: "document" },
        },
      }),
    ).toBe(false);
  });

  it("types meta source hits as source-level tracks without widening chunk tracks", () => {
    const item = {
      id: "source-1",
      sourceKind: "page",
      sourceUrl: "https://example.test",
      sourceTitle: "Example",
      capturedAt: "2026-07-01T00:00:00.000Z",
      excerpt: "Example metadata",
      version: {
        groupKey: "page:https://example.test/:hash",
        versionNo: 1,
        isCurrent: true,
      },
      score: 1,
      tracks: ["meta_sources", "vector_meta", "fts_chunks"],
      hitChunks: [],
    } satisfies RetrieveSourceItem;
    const chunk = {
      chunkId: "chunk-1",
      ord: 0,
      snippet: "chunk snippet",
      score: 1,
      track: "fts_chunks",
    } satisfies RetrieveSourceHitChunk;

    expect(item.tracks).toContain("meta_sources");
    expect(item.tracks).toContain("vector_meta");
    expect(chunk.track).toBe("fts_chunks");
  });

  it("accepts explicit queued job run requests", () => {
    const activeModel = {
      id: "openai:base:model:d1536",
      provider: "openai",
      label: "OpenAI text-embedding-3-small",
      dimension: 1536,
      metric: "cosine",
      status: "active",
      updatedAt: "2026-07-03T00:00:00.000Z",
    } satisfies ActiveEmbeddingModelSummary;

    expect(activeModel).not.toHaveProperty("apiKey");

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "getActiveEmbeddingModel" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "runJob", id: "job-1" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "runJob", id: 42 },
      }),
    ).toBe(false);
  });

  it("accepts typed agent thinking and tool trace stream events", () => {
    expect(
      isAgentStreamEventMessage({
        type: CLIO_AGENT_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "thinking_delta",
          runId: "run-1",
          delta: "Checking the selected context.",
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: {
          type: "tool_trace",
          runId: "run-1",
          trace: {
            toolCallId: "tool-1",
            toolName: "search_memory",
            status: "running",
            summary: "Searching local memories",
          },
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: {
          type: "tool_trace",
          runId: "run-1",
          trace: {
            toolCallId: "tool-1",
            toolName: "search_memory",
            status: "waiting",
          },
        },
      }),
    ).toBe(false);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: {
          type: "citation",
          runId: "run-1",
          citation: {
            id: "cite-1",
            evidenceId: "page:0",
            label: "Page",
            sourceKind: "page",
            sourceUrl: "https://example.com",
            sourceTitle: "Example",
            excerpt: "Excerpt",
            outputOffset: 12,
          },
        },
      }),
    ).toBe(true);

    expect(
      isAgentRunEventMessage({
        type: CLIO_AGENT_RUN_EVENT,
        event: {
          type: "citation",
          runId: "run-1",
          citation: {
            id: "cite-1",
            evidenceId: "page:0",
            label: "Page",
            sourceKind: "page",
            sourceUrl: "https://example.com",
            sourceTitle: "Example",
            excerpt: "Excerpt",
            outputOffset: -1,
          },
        },
      }),
    ).toBe(false);

    expect(
      isAgentStreamEventMessage({
        type: CLIO_AGENT_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "citation_validation",
          runId: "run-1",
          validation: {
            status: "warning",
            reason: "missing_memory_citation",
            evidenceCount: 1,
            memoryEvidenceCount: 1,
            citationCount: 0,
            validCitationCount: 0,
            validMemoryCitationCount: 0,
            claimCount: 1,
            coveredClaimCount: 0,
            uncoveredClaimCount: 1,
            uncoveredClaims: [
              {
                text: "The saved memory preserves bounded evidence.",
                position: 0,
                reason: "missing_memory_citation",
              },
            ],
            message: "Source citation could not be verified.",
          },
        },
      }),
    ).toBe(true);

    expect(
      isAgentStreamEventMessage({
        type: CLIO_AGENT_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "citation_validation",
          runId: "run-1",
          validation: {
            status: "warning",
            reason: "missing_memory_claim_citation",
            evidenceCount: 1,
            memoryEvidenceCount: 1,
            citationCount: 0,
            validCitationCount: 0,
            validMemoryCitationCount: 0,
            claimCount: 1,
            coveredClaimCount: 0,
            uncoveredClaimCount: 1,
            uncoveredClaims: [
              {
                text: "The saved memory preserves bounded evidence.",
                position: -1,
                reason: "missing_memory_citation",
              },
            ],
          },
        },
      }),
    ).toBe(false);

    expect(
      isAgentStreamEventMessage({
        type: CLIO_AGENT_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "citation_validation",
          runId: "run-1",
          validation: {
            status: "warning",
            reason: "missing_memory_citation",
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts typed multi-provider setup requests", () => {
    expect(
      isProviderConfigRequestMessage({
        type: CLIO_PROVIDER_CONFIG_REQUEST,
        request: { kind: "readActiveProviderConfig" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "getProviderSettings" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveOpenAIProvider",
          apiKey: "sk-test",
          model: "gpt-5.1",
          baseUrl: "https://api.openai.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveOpenAICompatibleProvider",
          apiKey: "sk-test",
          model: "gpt-5.5",
          baseUrl: "https://new-api.example.test/v1",
          providerName: "custom",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testOpenAIProvider",
          model: "gpt-5.1",
          baseUrl: "https://api.openai.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "ensureOpenAIHostPermission",
          baseUrl: "https://api.openai.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testOpenAICompatibleProvider",
          model: "gpt-5.5",
          baseUrl: "https://new-api.example.test/v1",
          providerName: "custom",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "ensureOpenAICompatibleHostPermission",
          baseUrl: "https://new-api.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "setActiveProvider", provider: "openai" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "setActiveProvider", provider: "openai-compatible" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "getEmbeddingProviderSettings" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveEmbeddingProviderSettings",
          settings: {
            activeProvider: "openai-compatible",
            openai: {
              apiKey: "sk-embedding",
              model: "text-embedding-3-small",
              baseUrl: "https://api.openai.example.test/v1",
              dimension: 1536,
            },
            openaiCompatible: {
              apiKey: "sk-compatible",
              model: "embed-custom",
              baseUrl: "https://embeddings.example.test/v1",
              providerName: "custom",
              dimension: 768,
            },
          },
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testEmbeddingProvider",
          settings: {
            activeProvider: "openai",
            openai: {
              apiKey: "sk-embedding",
              model: "text-embedding-3-small",
              baseUrl: "https://api.openai.example.test/v1",
            },
          },
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "ensureEmbeddingProviderHostPermission",
          provider: "openai-compatible",
          baseUrl: "https://embeddings.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "authorizeEmbeddingReindex" },
      }),
    ).toBe(true);
  });

  it("accepts typed embedding reindex engine requests", () => {
    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "reindex",
          scope: "embeddings",
          model: {
            id: "openai:abcd:text-embedding-3-small:d1536",
            provider: "openai",
            label: "OpenAI Embeddings text-embedding-3-small (1536d)",
            dimension: 1536,
            metric: "cosine",
          },
        },
      }),
    ).toBe(true);
  });

  it("accepts typed worker embedding bridge messages", () => {
    expect(
      isWorkerEmbeddingRequestMessage({
        type: CLIO_WORKER_EMBEDDING_REQUEST,
        requestId: "embedding-request-1",
        request: {
          modelId: "openai:abcd:text-embedding-3-small:d1536",
          inputs: ["bounded chunk text", "bounded meta text"],
        },
      }),
    ).toBe(true);

    expect(
      isWorkerEmbeddingResponseMessage({
        type: CLIO_WORKER_EMBEDDING_RESPONSE,
        requestId: "embedding-request-1",
        response: {
          ok: true,
          value: [
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
          ],
        },
      }),
    ).toBe(true);

    expect(
      isWorkerEmbeddingResponseMessage({
        type: CLIO_WORKER_EMBEDDING_RESPONSE,
        requestId: "embedding-request-1",
        response: {
          ok: false,
          error: {
            code: "PROVIDER_AUTH_ERROR",
            message: "Embedding provider auth failed.",
          },
        },
      }),
    ).toBe(true);
  });

  it("accepts typed Search provider, stream, run, and history requests", () => {
    const searchRequest = {
      runId: "web-search-1",
      query: "browser ai search",
      createdAt: "2026-06-08T00:00:00.000Z",
    };
    const searchResult = {
      id: "search_web-search-1",
      runId: "web-search-1",
      query: "browser ai search",
      answer: "Search answer",
      sources: [
        {
          id: "src-1",
          title: "Example",
          url: "https://example.com/a",
          domain: "example.com",
          snippet: "Source snippet",
        },
      ],
      provider: "OpenAI Search",
      createdAt: "2026-06-08T00:00:00.000Z",
      completedAt: "2026-06-08T00:00:01.000Z",
    };

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveSearchProviderSettings",
          provider: "auto",
          openai: {
            apiKey: "",
            model: "gpt-search",
            baseUrl: "https://api.openai.example.test/v1",
          },
          openaiCompatible: {
            apiKey: "",
            model: "compatible-search-model",
            baseUrl: "https://new-api.example.test/v1",
          },
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveSearchProviderSettings",
          provider: "openai-compatible",
          openaiCompatible: {
            apiKey: "sk-test",
            model: "any-compatible-model",
            baseUrl: "https://new-api.example.test/v1",
          },
        },
      }),
    ).toBe(true);

    expect(
      isWebSearchStreamRequestMessage({
        type: CLIO_WEB_SEARCH_STREAM_REQUEST,
        requestId: "request-1",
        request: searchRequest,
      }),
    ).toBe(true);

    expect(
      isWebSearchStreamEventMessage({
        type: CLIO_WEB_SEARCH_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "answer_delta",
          runId: "web-search-1",
          delta: "Search",
        },
      }),
    ).toBe(true);

    expect(
      isWebSearchRunRequestMessage({
        type: CLIO_WEB_SEARCH_RUN_REQUEST,
        request: {
          kind: "start",
          request: searchRequest,
        },
      }),
    ).toBe(true);

    expect(
      isWebSearchRunEventMessage({
        type: CLIO_WEB_SEARCH_RUN_EVENT,
        event: {
          type: "completed",
          runId: "web-search-1",
          result: searchResult,
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendWebSearchHistory",
          payload: {
            id: searchResult.id,
            query: searchResult.query,
            answer: searchResult.answer,
            sources: searchResult.sources,
            provider: searchResult.provider,
            createdAt: searchResult.createdAt,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listWebSearchHistory", limit: 10 },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "deleteWebSearchHistory", id: "search_web-search-1" },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "clearWebSearchHistory" },
      }),
    ).toBe(true);
  });

  it("accepts typed Image Gen provider, stream, run, and history requests", () => {
    const imageRequest = {
      runId: "image-run-1",
      mode: "edit" as const,
      prompt: "turn this into a clean icon",
      createdAt: "2026-06-09T00:00:00.000Z",
      input: {
        kind: "data_url" as const,
        value: "data:image/png;base64,iVBORw0KGgo=",
        mimeType: "image/png",
        name: "reference.png",
      },
    };
    const imageResult = {
      id: "image_image-run-1",
      runId: "image-run-1",
      mode: "edit" as const,
      prompt: "turn this into a clean icon",
      model: "gpt-image-2",
      size: "1024x1024",
      provider: "Image Gen",
      createdAt: "2026-06-09T00:00:00.000Z",
      completedAt: "2026-06-09T00:00:01.000Z",
      output: {
        mimeType: "image/png",
        dataUrl: "data:image/png;base64,iVBORw0KGgo=",
        b64Json: "iVBORw0KGgo=",
      },
      input: imageRequest.input,
    };

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "getImageGenerationSettings" },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveImageGenerationSettings",
          settings: {
            apiKey: "",
            model: "gpt-image-2",
            baseUrl: "https://images.example.test/v1",
            size: "auto",
          },
        },
      }),
    ).toBe(true);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "ensureImageGenerationHostPermission",
          baseUrl: "https://images.example.test/v1",
        },
      }),
    ).toBe(true);

    expect(
      isImageGenerationStreamRequestMessage({
        type: CLIO_IMAGE_GENERATION_STREAM_REQUEST,
        requestId: "request-1",
        request: imageRequest,
      }),
    ).toBe(true);

    expect(
      isImageGenerationStreamCancelMessage({
        type: CLIO_IMAGE_GENERATION_STREAM_CANCEL,
        requestId: "request-1",
      }),
    ).toBe(true);

    expect(
      isImageGenerationStreamEventMessage({
        type: CLIO_IMAGE_GENERATION_STREAM_EVENT,
        requestId: "request-1",
        event: {
          type: "completed",
          runId: "image-run-1",
          result: imageResult,
        },
      }),
    ).toBe(true);

    expect(
      isImageGenerationRunRequestMessage({
        type: CLIO_IMAGE_GENERATION_RUN_REQUEST,
        request: {
          kind: "start",
          request: imageRequest,
        },
      }),
    ).toBe(true);

    expect(
      isImageGenerationRunRequestMessage({
        type: CLIO_IMAGE_GENERATION_RUN_REQUEST,
        request: {
          kind: "cancel",
          runId: "image-run-1",
        },
      }),
    ).toBe(true);

    expect(
      isImageGenerationRunEventMessage({
        type: CLIO_IMAGE_GENERATION_RUN_EVENT,
        event: {
          type: "completed",
          runId: "image-run-1",
          result: imageResult,
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "appendImageGenerationHistory",
          payload: {
            id: imageResult.id,
            mode: imageResult.mode,
            prompt: imageResult.prompt,
            model: imageResult.model,
            size: imageResult.size,
            provider: imageResult.provider,
            createdAt: imageResult.createdAt,
            output: imageResult.output,
            input: imageResult.input,
          },
        },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "listImageGenerationHistory", limit: 20 },
      }),
    ).toBe(true);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: { kind: "deleteImageGenerationHistory", id: "image_image-run-1" },
      }),
    ).toBe(true);
  });

  it("rejects invalid multi-provider setup requests", () => {
    expect(
      isProviderConfigRequestMessage({
        type: CLIO_PROVIDER_CONFIG_REQUEST,
        request: { kind: "getProviderSettings" },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "setActiveProvider", provider: "anthropic" },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: { kind: "saveOpenAIProvider", apiKey: "sk-test" },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testOpenAIProvider",
          baseUrl: 42,
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testOpenAICompatibleProvider",
          baseUrl: 42,
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveSearchProviderSettings",
          provider: "perplexity",
        },
      }),
    ).toBe(false);

    expect(
      isWebSearchStreamRequestMessage({
        type: CLIO_WEB_SEARCH_STREAM_REQUEST,
        requestId: "request-1",
        request: {
          runId: "web-search-1",
          query: "browser ai search",
        },
      }),
    ).toBe(false);

    expect(
      isWebSearchRunEventMessage({
        type: CLIO_WEB_SEARCH_RUN_EVENT,
        event: {
          type: "completed",
          runId: "web-search-1",
          result: {
            id: "search_web-search-1",
            runId: "web-search-1",
            query: "browser ai search",
            answer: "Search answer",
            sources: [{ title: "Missing fields" }],
            provider: "OpenAI Search",
            createdAt: "2026-06-08T00:00:00.000Z",
            completedAt: "2026-06-08T00:00:01.000Z",
          },
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveImageGenerationSettings",
          settings: {
            size: "512x512",
          },
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "saveEmbeddingProviderSettings",
          settings: {
            activeProvider: "gemini",
          },
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "testEmbeddingProvider",
          settings: {
            activeProvider: "openai",
            openai: {
              apiKey: 42,
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "ensureEmbeddingProviderHostPermission",
          provider: "anthropic",
        },
      }),
    ).toBe(false);

    expect(
      isProviderRequestMessage({
        type: CLIO_PROVIDER_REQUEST,
        request: {
          kind: "authorizeEmbeddingReindex",
          apiKey: "sk-should-not-cross-authorization-boundary",
        },
      }),
    ).toBe(false);

    expect(
      isEngineRequestMessage({
        type: CLIO_ENGINE_REQUEST,
        request: {
          kind: "reindex",
          scope: "embeddings",
          model: {
            id: "openai:abcd:text-embedding-3-small:d1536",
            provider: "openai",
            label: "OpenAI Embeddings text-embedding-3-small (1536d)",
            dimension: "1536",
            metric: "cosine",
          },
        },
      }),
    ).toBe(false);

    expect(
      isWorkerEmbeddingRequestMessage({
        type: CLIO_WORKER_EMBEDDING_REQUEST,
        requestId: "embedding-request-1",
        request: {
          modelId: "openai:abcd:text-embedding-3-small:d1536",
          inputs: ["bounded text"],
          apiKey: "sk-should-not-cross-worker-boundary",
        },
      }),
    ).toBe(false);

    expect(
      isWorkerEmbeddingResponseMessage({
        type: CLIO_WORKER_EMBEDDING_RESPONSE,
        requestId: "embedding-request-1",
        response: {
          ok: true,
          value: [[0.1, Number.NaN]],
        },
      }),
    ).toBe(false);

    expect(
      isImageGenerationStreamRequestMessage({
        type: CLIO_IMAGE_GENERATION_STREAM_REQUEST,
        requestId: "request-1",
        request: {
          runId: "image-run-1",
          mode: "paint",
          prompt: "invalid mode",
          createdAt: "2026-06-09T00:00:00.000Z",
        },
      }),
    ).toBe(false);

    expect(
      isImageGenerationRunEventMessage({
        type: CLIO_IMAGE_GENERATION_RUN_EVENT,
        event: {
          type: "completed",
          runId: "image-run-1",
          result: {
            id: "image_image-run-1",
            runId: "image-run-1",
            mode: "generate",
            prompt: "missing output b64",
            model: "gpt-image-2",
            size: "1024x1024",
            provider: "Image Gen",
            createdAt: "2026-06-09T00:00:00.000Z",
            completedAt: "2026-06-09T00:00:01.000Z",
            output: {
              mimeType: "image/png",
              dataUrl: "data:image/png;base64,iVBORw0KGgo=",
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("accepts typed extension UI requests", () => {
    expect(
      isUiRequestMessage({
        type: CLIO_UI_REQUEST,
        request: { kind: "openOptions" },
      }),
    ).toBe(true);

    expect(
      isUiRequestMessage({
        type: CLIO_UI_REQUEST,
        request: { kind: "openSidePanel" },
      }),
    ).toBe(false);
  });
});
