import type { AgentChatRequest } from "./types";

export const clioAgentSystemPrompt =
  "You are Clio, a browser assistant. If attached evidence is provided, use it first. " +
  "When a factual sentence uses attached evidence, append [[cite:<exact evidence id>]] after that sentence. " +
  "Use only exact ids listed in the evidence blocks, and do not invent ids. " +
  "If no evidence is attached, answer as a general assistant without citation markers.";

export function buildClioUserPrompt(request: AgentChatRequest): string {
  if (request.providerContext !== undefined) {
    return buildCompactedContextPrompt(request);
  }

  if (request.scope === "general") {
    return buildPromptBlocks([
      `Question: ${request.question}`,
      "Scope: general",
      ...evidencePromptBlock(
        request.evidence,
        "No page, selection, or memory evidence is attached.",
      ),
    ]);
  }

  return buildPromptBlocks([
    `Question: ${request.question}`,
    `Scope: ${request.scope}`,
    `Page: ${request.pageTitle} (${request.pageUrl})`,
    ...evidencePromptBlock(request.evidence, "Evidence: none attached by the user."),
  ]);
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
      ? ["Scope: general"]
      : [`Scope: ${request.scope}`, `Page: ${request.pageTitle} (${request.pageUrl})`];
  const concreteEvidence =
    request.scope === "general"
      ? context.evidence.filter((item) => item.sourceKind === "memory")
      : context.evidence;
  const evidenceSummaryBlock =
    request.scope === "general"
      ? []
      : context.evidenceSummary === undefined
        ? ["Evidence summary: none."]
        : [
            "Evidence summary (background only; not a visible source marker):",
            context.evidenceSummary,
            "Do not cite summarized-only evidence. Use citation markers only for concrete evidence listed below.",
          ];

  return buildPromptBlocks([
    `Question: ${request.question}`,
    ...scopeBlock,
    ...summaryBlock,
    ...messageBlock,
    ...evidenceSummaryBlock,
    ...evidencePromptBlock(
      concreteEvidence,
      "Concrete source evidence: none attached by the user.",
      {
        heading: "Concrete source evidence:",
      },
    ),
  ]);
}

function evidencePromptBlock(
  evidence: AgentChatRequest["evidence"],
  emptyLine: string,
  options: { heading?: string } = {},
) {
  if (evidence.length === 0) return [emptyLine];
  return [
    options.heading ?? "Evidence:",
    ...evidence.map(
      (item, index) =>
        `${index + 1}. id=${item.id}\nkind=${item.sourceKind}\nsource=${item.sourceTitle} (${item.sourceUrl})\n${item.text}`,
    ),
  ];
}

function buildPromptBlocks(lines: string[]) {
  return lines.join("\n\n");
}
