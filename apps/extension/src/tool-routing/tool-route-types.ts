export type ExplicitToolRouteKind =
  | "web_search"
  | "knowledge_search"
  | "find_related"
  | "page_summary"
  | "translate_selection"
  | "save_to_memory";

export type ExplicitToolTrigger = "reply_chip" | "toolbox" | "context_menu" | "slash_command";

export type ExplicitToolTraceStatus = "running" | "completed" | "failed";

export interface ExplicitToolTrace {
  id: string;
  route: ExplicitToolRouteKind;
  trigger: ExplicitToolTrigger;
  status: ExplicitToolTraceStatus;
  inputSummary: string;
  sourceSummary?: string;
  messageId?: string;
  sessionId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ExplicitToolRouteRequest {
  route: ExplicitToolRouteKind;
  trigger: ExplicitToolTrigger;
  query?: string;
  messageId?: string;
  sessionId?: string;
}

export function explicitToolRouteLabel(route: ExplicitToolRouteKind) {
  switch (route) {
    case "web_search":
      return "Web search";
    case "knowledge_search":
      return "Knowledge search";
    case "find_related":
      return "Find related";
    case "page_summary":
      return "Summarize";
    case "translate_selection":
      return "Translate";
    case "save_to_memory":
      return "Save to memory";
    default:
      return exhaustive(route);
  }
}

export function explicitToolTriggerLabel(trigger: ExplicitToolTrigger) {
  switch (trigger) {
    case "reply_chip":
      return "reply suggestion";
    case "toolbox":
      return "toolbox";
    case "context_menu":
      return "context menu";
    case "slash_command":
      return "slash command";
    default:
      return exhaustive(trigger);
  }
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled explicit tool route value: ${String(value)}`);
}
