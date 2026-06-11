import type { AgentChatRequest } from "./types";

export const clioAgentSystemPrompt =
  "You are Clio, a browser assistant. If the user attached page evidence, use it first. " +
  "Do not emit raw citation ids or machine citation markers. " +
  "When a response should visibly indicate attached source usage, write [source] and Clio will render the real source link. " +
  "If no evidence is attached, answer as a general assistant without source markers.";

export function buildClioUserPrompt(request: AgentChatRequest): string {
  if (request.providerContext !== undefined) {
    return buildCompactedContextPrompt(request);
  }

  if (request.scope === "general") {
    return [
      `Question: ${request.question}`,
      "Scope: general",
      "No page or selection context is attached.",
    ].join("\n\n");
  }

  const evidenceBlock =
    request.evidence.length === 0
      ? ["Evidence: none attached by the user."]
      : [
          "Evidence:",
          ...request.evidence.map(
            (item, index) =>
              `${index + 1}. id=${item.id}\nsource=${item.sourceTitle} (${item.sourceUrl})\n${item.text}`,
          ),
        ];
  return [
    `Question: ${request.question}`,
    `Scope: ${request.scope}`,
    `Page: ${request.pageTitle} (${request.pageUrl})`,
    ...evidenceBlock,
  ].join("\n\n");
}

function buildCompactedContextPrompt(request: AgentChatRequest): string {
  const context = request.providerContext;
  if (context === undefined) return buildClioUserPrompt(request);

  const summaryBlock =
    context.summary === undefined
      ? ["Conversation summary: none."]
      : ["Conversation summary:", context.summary];
  const messageBlock =
    context.messages.length === 0
      ? ["Recent conversation: none."]
      : [
          "Recent conversation:",
          ...context.messages.map((message, index) =>
            [
              `${index + 1}. ${message.role.toUpperCase()} (${message.createdAt})`,
              message.content,
            ].join("\n"),
          ),
        ];
  const scopeBlock =
    request.scope === "general"
      ? ["Scope: general", "No page or selection context is attached."]
      : [`Scope: ${request.scope}`, `Page: ${request.pageTitle} (${request.pageUrl})`];
  const evidenceSummaryBlock =
    request.scope === "general"
      ? []
      : context.evidenceSummary === undefined
        ? ["Evidence summary: none."]
        : [
            "Evidence summary (background only; not a visible source marker):",
            context.evidenceSummary,
            "Do not expose summarized-only evidence as [source]. Use [source] only for concrete evidence listed below.",
          ];
  const evidenceBlock =
    request.scope === "general"
      ? []
      : context.evidence.length === 0
        ? ["Concrete source evidence: none attached by the user."]
        : [
            "Concrete source evidence:",
            ...context.evidence.map(
              (item, index) =>
                `${index + 1}. id=${item.id}\nsource=${item.sourceTitle} (${item.sourceUrl})\n${item.text}`,
            ),
          ];

  return [
    `Question: ${request.question}`,
    ...scopeBlock,
    ...summaryBlock,
    ...messageBlock,
    ...evidenceSummaryBlock,
    ...evidenceBlock,
  ].join("\n\n");
}
