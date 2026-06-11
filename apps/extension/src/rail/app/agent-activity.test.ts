import { describe, expect, it } from "vitest";
import {
  buildAgentActivitySnapshot,
  formatExplicitToolTraceMeta,
  formatExplicitToolTraceSummary,
  formatToolName,
  formatToolTraceStatus,
  normalizeActivityText,
  truncateActivityText,
} from "./agent-activity";

describe("agent activity display projection", () => {
  it("returns no snapshot when an assistant message has no trace activity", () => {
    expect(buildAgentActivitySnapshot({})).toBeUndefined();
  });

  it("summarizes thinking and the latest tool trace", () => {
    const snapshot = buildAgentActivitySnapshot({
      thinkingTrace: " Checking the selected context. ",
      toolTraces: [
        {
          toolCallId: "tool-1",
          toolName: "search_memory",
          status: "completed",
          summary: "3 local matches",
        },
      ],
    });

    expect(snapshot).toMatchObject({
      thinking: "Checking the selected context.",
      summary: "Thinking / search memory done - 3 local matches",
    });
    expect(snapshot?.traces).toHaveLength(1);
    expect(snapshot?.explicitToolTraces).toHaveLength(0);
  });

  it("summarizes explicit tool traces without requiring provider activity", () => {
    const trace = {
      id: "trace-1",
      route: "web_search",
      trigger: "reply_chip",
      status: "completed",
      inputSummary: "look up more",
      sourceSummary: "Opened Search",
      createdAt: "2026-05-21T00:00:00.000Z",
    } as const;
    const snapshot = buildAgentActivitySnapshot({
      explicitToolTraces: [trace],
    });

    expect(formatExplicitToolTraceSummary(trace)).toBe("Web search opened - Opened Search");
    expect(formatExplicitToolTraceMeta(trace)).toBe("reply suggestion / completed");
    expect(snapshot?.summary).toBe("Web search opened - Opened Search");
    expect(snapshot?.explicitToolTraces).toHaveLength(1);
  });

  it("normalizes tool names and statuses for compact display", () => {
    expect(formatToolName("web_search")).toBe("web search");
    expect(formatToolName("")).toBe("tool");
    expect(formatToolTraceStatus("running")).toBe("running");
    expect(formatToolTraceStatus("completed")).toBe("done");
    expect(formatToolTraceStatus("failed")).toBe("failed");
  });

  it("normalizes and truncates noisy trace text", () => {
    expect(normalizeActivityText("  one\n\n two\tthree  ")).toBe("one two three");
    expect(truncateActivityText("abcdefghij", 8)).toBe("abcde...");
  });
});
