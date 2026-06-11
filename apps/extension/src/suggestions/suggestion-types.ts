import type { ExplicitToolRouteKind } from "../tool-routing/tool-route-types";

export type SuggestionKind =
  | "ask_current_page"
  | "summarize_current_page"
  | "search_knowledge"
  | "find_related"
  | "web_search"
  | "translate_selection"
  | "save_to_memory";

export interface SuggestionCooldownState {
  completedUserTurnsSinceLastSuggestion: number;
}

export interface SuggestionInput {
  messageId: string;
  sessionId?: string;
  userText: string;
  assistantText: string;
  hasCurrentPage: boolean;
  hasExplicitPageContext: boolean;
  hasSelection: boolean;
  hasAttachedEvidence: boolean;
  cooldown: SuggestionCooldownState;
}

export interface ReplyActionSuggestion {
  id: string;
  kind: SuggestionKind;
  label: string;
  reason: string;
  confidence: number;
  route: ExplicitToolRouteKind;
  query?: string;
  messageId: string;
  sessionId?: string;
}

export interface SuggestionResult {
  chips: ReplyActionSuggestion[];
  generatedBy: "rules" | "none";
}
