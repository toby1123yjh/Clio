import type { ReplyActionSuggestion, SuggestionInput, SuggestionResult } from "./suggestion-types";

const suggestionCooldownTurns = 3;
const maxSuggestions = 2;

type SuggestionDraft = Omit<ReplyActionSuggestion, "id" | "messageId" | "sessionId">;

const searchTerms = [
  "web search",
  "search web",
  "look up",
  "google",
  "\u8054\u7f51",
  "\u7f51\u4e0a\u67e5",
  "\u641c\u7d22\u4e00\u4e0b",
];
const memoryTerms = [
  "knowledge",
  "memory",
  "history",
  "previous",
  "before",
  "\u77e5\u8bc6\u5e93",
  "\u8bb0\u5fc6",
  "\u5386\u53f2",
  "\u4e4b\u524d",
  "\u4e0a\u6b21",
  "\u770b\u8fc7",
];
const relatedTerms = [
  "related",
  "similar",
  "relevant",
  "\u76f8\u5173",
  "\u7c7b\u4f3c",
  "\u5173\u8054",
];
const summaryTerms = [
  "summarize",
  "summary",
  "tl;dr",
  "\u603b\u7ed3",
  "\u6982\u62ec",
  "\u6458\u8981",
];
const translateTerms = ["translate", "translation", "\u7ffb\u8bd1", "\u8bd1\u6210"];
const saveTerms = [
  "save",
  "capture",
  "remember",
  "\u4fdd\u5b58",
  "\u5b58\u5230",
  "\u8bb0\u4f4f",
  "\u6536\u85cf",
];
const pageReferenceTerms = [
  "this page",
  "this article",
  "this passage",
  "this selection",
  "\u5f53\u524d\u9875",
  "\u8fd9\u4e2a\u9875\u9762",
  "\u8fd9\u7bc7",
  "\u8fd9\u6bb5",
  "\u9009\u533a",
];

export function suggestReplyActions(input: SuggestionInput): SuggestionResult {
  const userText = normalizeText(input.userText);
  const assistantText = normalizeText(input.assistantText);
  if (userText.length === 0 || assistantText.length === 0) return emptySuggestionResult();

  const drafts = buildSuggestionDrafts(input, userText);
  if (drafts.length === 0) return emptySuggestionResult();

  const explicit = drafts.some((draft) => draft.confidence >= 0.9);
  if (!explicit && input.cooldown.completedUserTurnsSinceLastSuggestion < suggestionCooldownTurns) {
    return emptySuggestionResult();
  }

  return {
    generatedBy: "rules",
    chips: drafts.slice(0, maxSuggestions).map((draft, index) => ({
      ...draft,
      id: `${input.messageId}:suggestion:${draft.kind}:${index}`,
      messageId: input.messageId,
      ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    })),
  };
}

function buildSuggestionDrafts(input: SuggestionInput, userText: string): SuggestionDraft[] {
  const drafts: SuggestionDraft[] = [];
  addDraft(drafts, searchSuggestion(userText));
  addDraft(drafts, memorySuggestion(userText));
  addDraft(drafts, relatedSuggestion(userText, input.hasCurrentPage));
  addDraft(drafts, summarySuggestion(userText, input.hasCurrentPage));
  addDraft(drafts, translateSuggestion(userText, input.hasSelection || input.hasAttachedEvidence));
  addDraft(drafts, saveSuggestion(userText, input.hasCurrentPage || input.hasSelection));

  if (!matchesAny(userText, translateTerms)) {
    addDraft(
      drafts,
      pageSuggestion(userText, input.hasCurrentPage || input.hasExplicitPageContext),
    );
  }

  return drafts.sort((left, right) => right.confidence - left.confidence);
}

function searchSuggestion(userText: string): SuggestionDraft | undefined {
  if (!matchesAny(userText, searchTerms)) return undefined;
  return {
    kind: "web_search",
    route: "web_search",
    label: "Open Search",
    reason: "The user asked to search or look something up.",
    confidence: 0.95,
    query: userText,
  };
}

function memorySuggestion(userText: string): SuggestionDraft | undefined {
  if (!matchesAny(userText, memoryTerms)) return undefined;
  return {
    kind: "search_knowledge",
    route: "knowledge_search",
    label: "Search Knowledge",
    reason: "The user referred to knowledge, memory, or history.",
    confidence: 0.9,
    query: userText,
  };
}

function relatedSuggestion(userText: string, hasCurrentPage: boolean): SuggestionDraft | undefined {
  if (!hasCurrentPage) return undefined;
  if (!matchesAny(userText, relatedTerms)) return undefined;
  return {
    kind: "find_related",
    route: "find_related",
    label: "Find Related",
    reason: "The user asked for related material.",
    confidence: 0.9,
    query: userText,
  };
}

function summarySuggestion(userText: string, hasCurrentPage: boolean): SuggestionDraft | undefined {
  if (!hasCurrentPage) return undefined;
  if (!matchesAny(userText, summaryTerms)) return undefined;
  return {
    kind: "summarize_current_page",
    route: "page_summary",
    label: "Open Summarize",
    reason: "The user asked for a summary.",
    confidence: 0.92,
    query: userText,
  };
}

function translateSuggestion(
  userText: string,
  hasTextContext: boolean,
): SuggestionDraft | undefined {
  if (!hasTextContext) return undefined;
  if (!matchesAny(userText, translateTerms)) return undefined;
  return {
    kind: "translate_selection",
    route: "translate_selection",
    label: "Open Translate",
    reason: "The user asked to translate selected or attached text.",
    confidence: 0.92,
    query: userText,
  };
}

function saveSuggestion(userText: string, hasSaveContext: boolean): SuggestionDraft | undefined {
  if (!hasSaveContext) return undefined;
  if (!matchesAny(userText, saveTerms)) return undefined;
  return {
    kind: "save_to_memory",
    route: "save_to_memory",
    label: "Open Save",
    reason: "The user asked to save or remember something.",
    confidence: 0.9,
    query: userText,
  };
}

function pageSuggestion(
  userText: string,
  hasCurrentPageContext: boolean,
): SuggestionDraft | undefined {
  if (!hasCurrentPageContext) return undefined;
  if (!matchesAny(userText, pageReferenceTerms)) return undefined;
  return {
    kind: "ask_current_page",
    route: "page_summary",
    label: "Use Page Tool",
    reason: "The user referred to the current page or selection.",
    confidence: 0.86,
    query: userText,
  };
}

function addDraft(drafts: SuggestionDraft[], draft: SuggestionDraft | undefined) {
  if (draft === undefined) return;
  if (drafts.some((item) => item.kind === draft.kind || item.route === draft.route)) return;
  drafts.push(draft);
}

function matchesAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function emptySuggestionResult(): SuggestionResult {
  return { chips: [], generatedBy: "none" };
}
