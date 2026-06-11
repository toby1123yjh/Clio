import type { PageContext, SelectionSnapshot } from "@/src/rail/app/rail-state";
import { describe, expect, it } from "vitest";
import { buildSelectionEvidence } from "./agent-evidence";

const page: PageContext = {
  url: "https://example.com/a",
  title: "Example",
};

const selection: SelectionSnapshot = {
  text: " Selected evidence text ",
  sourceUrl: page.url,
  sourceTitle: page.title,
  contextBefore: "Before",
  contextAfter: "After",
  capturedAt: "2026-05-22T00:00:00.000Z",
  xpath: "/html/body/p[1]",
  textFragment: "https://example.com/a#:~:text=Selected%20evidence%20text",
};

describe("agent evidence builders", () => {
  it("builds structured evidence for selected text", () => {
    const evidence = buildSelectionEvidence(page, selection);

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      sourceKind: "selection",
      sourceUrl: page.url,
      sourceTitle: page.title,
      text: "Selected evidence text",
      anchor: {
        selectedText: "Selected evidence text",
        contextBefore: "Before",
        contextAfter: "After",
        xpath: "/html/body/p[1]",
      },
    });
  });

  it("rejects selection QA without selection evidence", () => {
    expect(() => buildSelectionEvidence(page, undefined)).toThrow(
      "Select text on the page, then ask Clio about that selection.",
    );
  });
});
