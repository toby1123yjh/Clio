import { describe, expect, it } from "vitest";
import {
  buildMarkdownSources,
  markdownSourceHref,
  markdownToPlainText,
  projectMarkdownSources,
  stripLegacyCitationMarkers,
} from "./markdown-sources";
import type { RailDialogueMessage } from "./rail-state";

const assistant: RailDialogueMessage = {
  id: "assistant-1",
  role: "assistant",
  content: "Answer",
  createdAt: "2026-06-09T00:00:00.000Z",
  scope: "current-page",
  status: "completed",
  pageUrl: "https://example.com/page",
  pageTitle: "Example Page",
  citations: [
    {
      id: "cite-1",
      evidenceId: "page:0",
      label: "Page",
      sourceKind: "page",
      sourceUrl: "https://example.com/page",
      sourceTitle: "Example Page",
      excerpt: "Evidence excerpt",
    },
  ],
  worldKnowledge: [],
};

describe("markdown source helpers", () => {
  it("derives readable source labels from citation data", () => {
    const sources = buildMarkdownSources(assistant);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      id: "cite-1",
      kind: "page",
      label: "Example Page",
      url: "https://example.com/page",
      excerpt: "Evidence excerpt",
    });
  });

  it("uses selection excerpts instead of generic citation labels", () => {
    const sources = buildMarkdownSources({
      ...assistant,
      citations: [
        {
          id: "cite-1",
          evidenceId: "selection:0",
          label: "Selection",
          sourceKind: "selection",
          sourceUrl: "https://example.com/page",
          sourceTitle: "Example Page",
          excerpt: "A selected passage that should identify the source chip",
        },
      ],
    });

    expect(sources[0]?.label).toBe("Selection: A selected passage that should identify the...");
  });

  it("hides legacy cite markers from visible markdown", () => {
    expect(stripLegacyCitationMarkers("Grounded [[cite:page:0]] answer.")).toBe("Grounded answer.");
  });

  it("replaces explicit source placeholders with the Clio source link", () => {
    const projected = projectMarkdownSources("Answer [source].", buildMarkdownSources(assistant));

    expect(projected).toBe(`Answer [source](${markdownSourceHref}).`);
  });

  it("appends a source link when sources exist but no placeholder is present", () => {
    const projected = projectMarkdownSources("Answer.", buildMarkdownSources(assistant));

    expect(projected).toBe(`Answer.\n\n[source](${markdownSourceHref})`);
  });

  it("removes source placeholders when no real sources are available", () => {
    expect(projectMarkdownSources("Answer [source].", [])).toBe("Answer .");
  });

  it("provides a plain-text copy variant", () => {
    expect(markdownToPlainText("## Title\n\n- [Item](https://example.com) [[cite:x]]")).toBe(
      "Title\n\nItem",
    );
  });
});
