import { describe, expect, it } from "vitest";
import { buildClioUserPrompt, clioAgentSystemPrompt } from "./clio-context";
import type { AgentChatRequest, EvidenceItem } from "./types";

const pageEvidence: EvidenceItem = {
  id: "page:0",
  sourceKind: "page",
  sourceUrl: "https://example.com/private-page",
  sourceTitle: "Private Page",
  text: "Private page evidence text",
  excerpt: "Private page evidence text",
};

function request(overrides: Partial<AgentChatRequest> = {}): AgentChatRequest {
  return {
    runId: "run-1",
    question: "Hi",
    scope: "current-page",
    pageUrl: "https://example.com/private-page",
    pageTitle: "Private Page",
    evidence: [pageEvidence],
    createdAt: "2026-05-22T00:00:00.000Z",
    ...overrides,
  };
}

describe("Clio user prompt", () => {
  it("uses source placeholders instead of legacy cite markers", () => {
    expect(clioAgentSystemPrompt).toContain("[source]");
    expect(clioAgentSystemPrompt).not.toContain("[[cite");
  });

  it("keeps general chat free of page metadata and evidence", () => {
    const prompt = buildClioUserPrompt(
      request({
        scope: "general",
        evidence: [],
      }),
    );

    expect(prompt).toContain("Question: Hi");
    expect(prompt).toContain("Scope: general");
    expect(prompt).toContain("No page, selection, or memory evidence is attached.");
    expect(prompt).not.toContain("Page:");
    expect(prompt).not.toContain("Private Page");
    expect(prompt).not.toContain("https://example.com/private-page");
    expect(prompt).not.toContain("Private page evidence text");
  });

  it("includes local memory evidence for general RAG turns without page context", () => {
    const prompt = buildClioUserPrompt(
      request({
        scope: "general",
        evidence: [
          {
            id: "memory:mem-1:chunk:chunk-1",
            sourceKind: "memory",
            sourceUrl: "https://example.com/memory",
            sourceTitle: "Saved Memory",
            text: "Bounded memory evidence text",
            excerpt: "Bounded memory evidence text",
          },
        ],
      }),
    );

    expect(prompt).toContain("Scope: general");
    expect(prompt).toContain("kind=memory");
    expect(prompt).toContain("Saved Memory");
    expect(prompt).toContain("Bounded memory evidence text");
    expect(prompt).not.toContain("Page: Private Page");
  });

  it("keeps compacted general chat free of retained evidence", () => {
    const prompt = buildClioUserPrompt(
      request({
        scope: "general",
        providerContext: {
          summary: "Earlier chat summary.",
          evidenceSummary: "Old evidence summary that should not be sent.",
          messages: [
            {
              id: "message-1",
              role: "user",
              content: "Earlier pure chat",
              createdAt: "2026-05-22T00:00:00.000Z",
            },
          ],
          evidence: [pageEvidence],
        },
      }),
    );

    expect(prompt).toContain("Earlier chat summary.");
    expect(prompt).toContain("Earlier pure chat");
    expect(prompt).not.toContain("Page:");
    expect(prompt).not.toContain("Old evidence summary");
    expect(prompt).toContain("Concrete source evidence: none attached by the user.");
    expect(prompt).not.toContain("Private page evidence text");
  });

  it("includes page evidence for explicit current-page scope", () => {
    const prompt = buildClioUserPrompt(request());

    expect(prompt).toContain("Scope: current-page");
    expect(prompt).toContain("Page: Private Page (https://example.com/private-page)");
    expect(prompt).toContain("Private page evidence text");
  });
});
