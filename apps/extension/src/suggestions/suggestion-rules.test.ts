import { describe, expect, it } from "vitest";
import { suggestReplyActions } from "./suggestion-rules";
import type { SuggestionInput } from "./suggestion-types";

function input(overrides: Partial<SuggestionInput>): SuggestionInput {
  return {
    messageId: "run-1:assistant",
    sessionId: "session-1",
    userText: "hi",
    assistantText: "Hello.",
    hasCurrentPage: true,
    hasExplicitPageContext: false,
    hasSelection: false,
    hasAttachedEvidence: false,
    cooldown: { completedUserTurnsSinceLastSuggestion: 3 },
    ...overrides,
  };
}

describe("suggestReplyActions", () => {
  it("does not suggest actions for ordinary chat", () => {
    const result = suggestReplyActions(input({ userText: "hi, how are you?" }));

    expect(result).toEqual({ chips: [], generatedBy: "none" });
  });

  it("suggests web search for explicit search intent", () => {
    const result = suggestReplyActions(input({ userText: "Can you look up the latest docs?" }));

    expect(result.generatedBy).toBe("rules");
    expect(result.chips.map((chip) => [chip.kind, chip.label, chip.route])).toEqual([
      ["web_search", "Open Search", "web_search"],
    ]);
  });

  it("suggests knowledge search for memory and history intent", () => {
    const result = suggestReplyActions(input({ userText: "Find what I saw before in memory" }));

    expect(result.chips[0]?.route).toBe("knowledge_search");
    expect(result.chips[0]?.label).toBe("Search Knowledge");
  });

  it("suggests page summary only when a current page exists", () => {
    const withPage = suggestReplyActions(input({ userText: "summarize this page" }));
    const withoutPage = suggestReplyActions(
      input({ userText: "summarize this page", hasCurrentPage: false }),
    );

    expect(withPage.chips[0]?.route).toBe("page_summary");
    expect(withoutPage.chips).toEqual([]);
  });

  it("suggests translate only when text context exists", () => {
    const noSelection = suggestReplyActions(input({ userText: "translate this selection" }));
    const withSelection = suggestReplyActions(
      input({ userText: "translate this selection", hasSelection: true }),
    );

    expect(noSelection.chips).toEqual([]);
    expect(withSelection.chips[0]?.route).toBe("translate_selection");
  });

  it("respects cooldown for weak page references", () => {
    const cooledDown = suggestReplyActions(
      input({
        userText: "what does this page mean?",
        cooldown: { completedUserTurnsSinceLastSuggestion: 0 },
      }),
    );
    const ready = suggestReplyActions(
      input({
        userText: "what does this page mean?",
        cooldown: { completedUserTurnsSinceLastSuggestion: 3 },
      }),
    );

    expect(cooledDown.chips).toEqual([]);
    expect(ready.chips[0]?.route).toBe("page_summary");
  });

  it("limits suggestions to two chips", () => {
    const result = suggestReplyActions(
      input({
        userText: "search web and find related memory, summarize this page and save it",
        hasSelection: true,
      }),
    );

    expect(result.chips).toHaveLength(2);
  });
});
