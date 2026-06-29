import { describe, expect, it } from "vitest";
import { CitationMarkerParser } from "./citation-markers";
import type { AgentStreamEvent, EvidenceItem } from "./types";

const evidence: EvidenceItem = {
  id: "ev_123",
  sourceKind: "selection",
  sourceUrl: "https://example.com/page",
  sourceTitle: "Example",
  text: "Selected evidence text",
  excerpt: "Selected evidence text",
};

function collect(parser: CitationMarkerParser, chunks: string[]) {
  const events: AgentStreamEvent[] = [];
  for (const chunk of chunks) {
    events.push(...parser.push("run-1", chunk));
  }
  events.push(...parser.flush("run-1"));
  return events;
}

describe("CitationMarkerParser", () => {
  it("strips citation markers split across stream chunks", () => {
    const events = collect(new CitationMarkerParser([evidence]), [
      "Grounded ",
      "[[ci",
      "te:ev_123",
      "]] answer.",
    ]);

    expect(events.map((event) => event.type)).toEqual(["text_delta", "citation", "text_delta"]);
    expect(events.find((event) => event.type === "citation")).toMatchObject({
      citation: {
        evidenceId: "ev_123",
        label: "Selection",
      },
    });
    expect(textFrom(events)).toBe("Grounded  answer.");
  });

  it("strips unknown citation markers split across stream chunks", () => {
    const events = collect(new CitationMarkerParser([evidence]), [
      "Invalid ",
      "[[cite:",
      "missing",
      "]] marker.",
    ]);

    expect(events.some((event) => event.type === "citation")).toBe(false);
    expect(textFrom(events)).toBe("Invalid  marker.");
  });

  it("does not flush a partial citation marker prefix as visible text", () => {
    const events = collect(new CitationMarkerParser([evidence]), ["Answer ", "[[ci"]);

    expect(textFrom(events)).toBe("Answer ");
  });

  it("labels local memory evidence as memory citations", () => {
    const events = collect(
      new CitationMarkerParser([
        {
          ...evidence,
          id: "memory:mem-1:chunk:chunk-1",
          sourceKind: "memory",
        },
      ]),
      ["Grounded [[cite:memory:mem-1:chunk:chunk-1]]."],
    );

    expect(events.find((event) => event.type === "citation")).toMatchObject({
      citation: {
        evidenceId: "memory:mem-1:chunk:chunk-1",
        label: "Memory",
        sourceKind: "memory",
      },
    });
  });
});

function textFrom(events: AgentStreamEvent[]) {
  return events
    .filter((event) => event.type === "text_delta")
    .map((event) => event.delta)
    .join("");
}
