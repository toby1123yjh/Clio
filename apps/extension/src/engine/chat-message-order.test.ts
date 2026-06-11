import type { ChatMessageRecord } from "@/src/shared/rpc";
import { describe, expect, it } from "vitest";
import { compareChatMessagesForDisplay } from "./chat-message-order";

const at = "2026-05-22T00:00:00.000Z";

function message(overrides: Partial<ChatMessageRecord>): ChatMessageRecord {
  return {
    id: "run-1:user",
    sessionId: "session-1",
    role: "user",
    status: "completed",
    content: "hi",
    scope: "current-page",
    createdAt: at,
    updatedAt: at,
    citations: [],
    worldKnowledge: [],
    evidenceRefs: [],
    ...overrides,
  };
}

describe("chat message display order", () => {
  it("keeps a same-timestamp turn in user, evidence, assistant order", () => {
    const sorted = [
      message({
        id: "run-1:assistant",
        role: "assistant",
        status: "completed",
        runId: "run-1",
      }),
      message({
        id: "run-1:evidence:1",
        role: "evidence",
      }),
      message({
        id: "run-1:user",
        role: "user",
        runId: "run-1",
      }),
    ].sort(compareChatMessagesForDisplay);

    expect(sorted.map((item) => item.id)).toEqual([
      "run-1:user",
      "run-1:evidence:1",
      "run-1:assistant",
    ]);
  });

  it("keeps same-timestamp turns grouped before applying role order", () => {
    const sorted = [
      message({
        id: "run-b:assistant",
        role: "assistant",
        runId: "run-b",
      }),
      message({
        id: "run-a:assistant",
        role: "assistant",
        runId: "run-a",
      }),
      message({
        id: "run-b:user",
        role: "user",
        runId: "run-b",
      }),
      message({
        id: "run-a:user",
        role: "user",
        runId: "run-a",
      }),
    ].sort(compareChatMessagesForDisplay);

    expect(sorted.map((item) => item.id)).toEqual([
      "run-a:user",
      "run-a:assistant",
      "run-b:user",
      "run-b:assistant",
    ]);
  });
});
