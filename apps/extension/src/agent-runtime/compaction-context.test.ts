import type { ChatMessageRecord, ChatSessionDetail, CompactionRecord } from "@/src/shared/rpc";
import { describe, expect, it } from "vitest";
import { buildProviderContext, buildRequestWithProviderContext } from "./compaction-context";

const at = "2026-05-22T00:00:00.000Z";

function message(overrides: Partial<ChatMessageRecord>): ChatMessageRecord {
  return {
    id: "message-1",
    sessionId: "session-1",
    role: "user",
    status: "completed",
    content: "Hello",
    scope: "current-page",
    createdAt: at,
    updatedAt: at,
    citations: [],
    worldKnowledge: [],
    evidenceRefs: [],
    ...overrides,
  };
}

function session(overrides: Partial<ChatSessionDetail> = {}): ChatSessionDetail {
  return {
    id: "session-1",
    title: "Context",
    createdAt: at,
    updatedAt: at,
    messageCount: 0,
    lastMessageExcerpt: "",
    currentEvidenceRevision: 2,
    messages: [],
    evidence: [],
    ...overrides,
  };
}

describe("compaction provider context", () => {
  it("uses only the latest compaction summary plus messages after kept boundary", () => {
    const context = buildProviderContext({
      session: session({
        messages: [
          message({ id: "old-user", content: "Old question" }),
          message({
            id: "failed-assistant",
            role: "assistant",
            status: "failed",
            content: "Bad answer",
          }),
          message({ id: "kept-user", content: "Recent question" }),
          message({ id: "kept-assistant", role: "assistant", content: "Recent answer" }),
        ],
      }),
      latestCompaction: {
        id: "compaction-2",
        sessionId: "session-1",
        summary: "Older useful turns.",
        firstKeptMessageId: "kept-user",
        evidenceSummary: "Older evidence background.",
        coveredEvidence: [],
        tokensBefore: 1000,
        createdAt: at,
      },
    });

    expect(context.summary).toBe("Older useful turns.");
    expect(context.evidenceSummary).toBe("Older evidence background.");
    expect(context.messages.map((item) => item.id)).toEqual(["kept-user", "kept-assistant"]);
    expect(context.messages.map((item) => item.content)).not.toContain("Bad answer");
  });

  it("keeps only citeable evidence after the compaction evidence boundary", () => {
    const latestCompaction: CompactionRecord = {
      id: "compaction-1",
      sessionId: "session-1",
      summary: "Older useful turns.",
      firstKeptMessageId: "kept-user",
      evidenceSummary: "Summarized evidence is background only.",
      firstKeptEvidenceRevision: 2,
      coveredEvidence: [{ id: "evidence-1", revision: 1 }],
      tokensBefore: 2000,
      createdAt: at,
    };
    const context = buildProviderContext({
      session: session({
        evidence: [
          {
            id: "evidence-1",
            sessionId: "session-1",
            revision: 1,
            sourceKind: "page",
            pageUrl: "https://example.com/old",
            pageTitle: "Old",
            text: "Old raw text",
            excerpt: "Old raw text",
            metadata: {},
            createdAt: at,
          },
          {
            id: "evidence-2",
            sessionId: "session-1",
            revision: 2,
            sourceKind: "selection",
            pageUrl: "https://example.com/new",
            pageTitle: "New",
            text: "New raw text",
            excerpt: "New raw text",
            metadata: {},
            createdAt: at,
          },
        ],
      }),
      latestCompaction,
    });

    expect(context.evidenceSummary).toBe("Summarized evidence is background only.");
    expect(context.evidence.map((item) => item.id)).toEqual(["evidence-2"]);
  });

  it("keeps current-turn evidence citeable even when it is before the compaction boundary", () => {
    const context = buildProviderContext({
      session: session({
        evidence: [
          {
            id: "old-evidence",
            sessionId: "session-1",
            revision: 1,
            sourceKind: "page",
            pageUrl: "https://example.com/old",
            pageTitle: "Old",
            text: "Old raw text",
            excerpt: "Old raw text",
            metadata: {},
            createdAt: at,
          },
          {
            id: "current-turn-evidence",
            sessionId: "session-1",
            revision: 2,
            sourceKind: "selection",
            pageUrl: "https://example.com/current",
            pageTitle: "Current",
            text: "Current turn raw text",
            excerpt: "Current turn raw text",
            metadata: {},
            createdAt: at,
          },
          {
            id: "kept-evidence",
            sessionId: "session-1",
            revision: 3,
            sourceKind: "page",
            pageUrl: "https://example.com/new",
            pageTitle: "New",
            text: "New raw text",
            excerpt: "New raw text",
            metadata: {},
            createdAt: at,
          },
        ],
      }),
      latestCompaction: {
        id: "compaction-1",
        sessionId: "session-1",
        summary: "Older useful turns.",
        firstKeptMessageId: "kept-user",
        evidenceSummary: "Summarized evidence is background only.",
        firstKeptEvidenceRevision: 3,
        coveredEvidence: [
          { id: "old-evidence", revision: 1 },
          { id: "current-turn-evidence", revision: 2 },
        ],
        tokensBefore: 2000,
        createdAt: at,
      },
      currentTurnEvidenceRefs: ["current-turn-evidence"],
    });

    expect(context.evidence.map((item) => item.id)).toEqual([
      "current-turn-evidence",
      "kept-evidence",
    ]);
  });

  it("drops retained evidence when building a general chat provider request", () => {
    const request = {
      runId: "run-1",
      question: "Hi",
      scope: "general" as const,
      pageUrl: "https://example.com/page",
      pageTitle: "Example",
      evidence: [],
      createdAt: at,
    };
    const next = buildRequestWithProviderContext({
      request,
      session: session({
        messages: [message({ id: "user-1", content: "Earlier chat" })],
        evidence: [
          {
            id: "evidence-1",
            sessionId: "session-1",
            revision: 1,
            sourceKind: "page",
            pageUrl: "https://example.com/page",
            pageTitle: "Example",
            text: "Old page evidence",
            excerpt: "Old page evidence",
            metadata: {},
            createdAt: at,
          },
        ],
      }),
      latestCompaction: {
        id: "compaction-1",
        sessionId: "session-1",
        summary: "Earlier useful turns.",
        firstKeptMessageId: "user-1",
        evidenceSummary: "Old evidence summary.",
        coveredEvidence: [],
        tokensBefore: 1000,
        createdAt: at,
      },
    });

    expect(next.evidence).toEqual([]);
    expect(next.currentTurnEvidenceRefs).toEqual([]);
    expect(next.providerContext?.messages.map((item) => item.content)).toEqual(["Earlier chat"]);
    expect(next.providerContext?.evidence).toEqual([]);
    expect(next.providerContext?.evidenceSummary).toBeUndefined();
  });
});
