import { describe, expect, it } from "vitest";
import { MockAgentRuntime } from "./mock-runtime";
import type { AgentChatRequest, AgentStreamEvent } from "./types";

function request(overrides: Partial<AgentChatRequest> = {}): AgentChatRequest {
  return {
    runId: "run-1",
    question: "What matters here?",
    scope: "current-page",
    pageUrl: "https://example.com/a",
    pageTitle: "Example",
    createdAt: "2026-05-22T00:00:00.000Z",
    evidence: [
      {
        id: "page:0",
        sourceKind: "page",
        sourceUrl: "https://example.com/a",
        sourceTitle: "Example",
        text: "Local evidence text",
        excerpt: "Local evidence text",
      },
    ],
    ...overrides,
  };
}

async function collect(stream: AsyncIterable<AgentStreamEvent>) {
  const events: AgentStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe("MockAgentRuntime", () => {
  it("streams deterministic evidence-aware events in order", async () => {
    const events = await collect(new MockAgentRuntime().streamChat(request()));

    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "citation",
      "text_delta",
      "world_knowledge",
      "text_delta",
      "run_completed",
    ]);
    expect(events[2]).toMatchObject({
      type: "citation",
      citation: {
        evidenceId: "page:0",
        label: "Page",
      },
    });
  });

  it("answers without citations when no evidence is attached", async () => {
    const events = await collect(new MockAgentRuntime().streamChat(request({ evidence: [] })));

    expect(events.map((event) => event.type)).toEqual([
      "run_started",
      "text_delta",
      "world_knowledge",
      "run_completed",
    ]);
    expect(events.some((event) => event.type === "citation")).toBe(false);
  });

  it("emits a cancel terminal event when aborted", async () => {
    const controller = new AbortController();
    const events: AgentStreamEvent[] = [];

    for await (const event of new MockAgentRuntime().streamChat(request(), {
      signal: controller.signal,
    })) {
      events.push(event);
      if (event.type === "run_started") controller.abort();
    }

    expect(events.at(-1)?.type).toBe("run_cancelled");
  });
});
