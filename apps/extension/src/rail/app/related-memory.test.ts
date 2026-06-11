import { describe, expect, it } from "vitest";
import type { SearchMemoryItem } from "../../shared/rpc";
import type { PageContext, SelectionSnapshot } from "./rail-state";
import {
  buildRelatedMemoryQuery,
  filterRelatedMemoryItems,
  shouldLoadRelatedCards,
} from "./related-memory";

const activePage: PageContext = {
  url: "https://example.com/articles/browser-memory?ref=home#section",
  title: "Browser memory architecture",
};

function snapshot(overrides: Partial<SelectionSnapshot> = {}): SelectionSnapshot {
  return {
    text: "selected passage about local FTS",
    sourceUrl: activePage.url,
    sourceTitle: activePage.title,
    contextBefore: "before",
    contextAfter: "after",
    capturedAt: "2026-05-21T00:00:00.000Z",
    ...overrides,
  };
}

function item(overrides: Partial<SearchMemoryItem> = {}): SearchMemoryItem {
  return {
    id: "mem-1",
    sourceKind: "page",
    sourceUrl: "https://docs.example.com/browser-memory",
    sourceTitle: "Docs",
    capturedAt: "2026-05-21T00:00:00.000Z",
    excerpt: "A local browser memory note.",
    snippet: "A local browser memory note.",
    version: {
      groupKey: "page:https://docs.example.com/browser-memory",
      versionNo: 1,
      isCurrent: true,
    },
    ...overrides,
  };
}

describe("related memory helpers", () => {
  it("builds a selection-first query when live selection is available", () => {
    const query = buildRelatedMemoryQuery({
      activePageContext: activePage,
      liveSelectionText: " live selected browser agent text ",
      selectionSnapshot: snapshot({ text: "old selected text" }),
      readableText: "readable article text should be lower priority",
    });

    expect(query).toContain("live selected browser agent text");
    expect(query).toContain("Browser memory architecture");
    expect(query).not.toContain("old selected text");
    expect(query).not.toContain("readable article text");
  });

  it("uses a matching selection snapshot when live selection is absent", () => {
    const query = buildRelatedMemoryQuery({
      activePageContext: activePage,
      selectionSnapshot: snapshot(),
      readableText: "readable article text",
    });

    expect(query).toContain("selected passage about local FTS");
    expect(query).not.toContain("readable article text");
  });

  it("falls back to page title, URL tokens, and readable prefix without a selection", () => {
    const query = buildRelatedMemoryQuery({
      activePageContext: activePage,
      selectionSnapshot: snapshot({ sourceUrl: "https://other.example.com/" }),
      readableText: "Readable page prefix about local storage and retrieval.",
    });

    expect(query).toContain("Browser memory architecture");
    expect(query).toContain("browser memory");
    expect(query).toContain("Readable page prefix");
  });

  it("filters current-page and sensitive-source memories from proactive cards", () => {
    const related = filterRelatedMemoryItems(
      [
        item({
          id: "current",
          sourceUrl: "https://example.com/articles/browser-memory?ref=home#old",
        }),
        item({ id: "mail", sourceUrl: "https://mail.example.com/inbox" }),
        item({ id: "one", sourceUrl: "https://docs.example.com/one" }),
        item({ id: "two", sourceUrl: "https://docs.example.com/two" }),
        item({ id: "three", sourceUrl: "https://docs.example.com/three" }),
        item({ id: "four", sourceUrl: "https://docs.example.com/four" }),
      ],
      activePage.url,
    );

    expect(related.map((memory) => memory.id)).toEqual(["one", "two", "three"]);
  });

  it("suppresses proactive loading on sensitive active pages", () => {
    expect(shouldLoadRelatedCards("https://bank.example.com/account")).toBe(false);
    expect(shouldLoadRelatedCards("https://example.com/articles/browser-memory")).toBe(true);
  });
});
