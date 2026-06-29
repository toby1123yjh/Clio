import { citationLabel } from "./citation-markers";
import type { AgentChatRequest, AgentStreamEvent, IAgentRuntime, LocalCitation } from "./types";

const mockDelayMs = 18;

export class MockAgentRuntime implements IAgentRuntime {
  async *streamChat(
    request: AgentChatRequest,
    options: { signal?: AbortSignal } = {},
  ): AsyncIterable<AgentStreamEvent> {
    yield { type: "run_started", runId: request.runId };

    const firstEvidence = request.evidence[0];
    if (firstEvidence === undefined) {
      yield {
        type: "text_delta",
        runId: request.runId,
        delta: `Answering "${request.question}". `,
      };
      yield {
        type: "world_knowledge",
        runId: request.runId,
        note: "No page context was attached for this mock response.",
      };
      yield { type: "run_completed", runId: request.runId };
      return;
    }

    const citation: LocalCitation = {
      id: `${request.runId}:citation:${firstEvidence.id}`,
      evidenceId: firstEvidence.id,
      label: citationLabel(firstEvidence.sourceKind),
      sourceKind: firstEvidence.sourceKind,
      sourceUrl: firstEvidence.sourceUrl,
      sourceTitle: firstEvidence.sourceTitle,
      excerpt: firstEvidence.excerpt,
      ...(firstEvidence.anchor === undefined ? {} : { anchor: firstEvidence.anchor }),
    };

    const deltas = buildMockAnswerDeltas(request, firstEvidence.excerpt);
    const events: AgentStreamEvent[] = [
      { type: "text_delta", runId: request.runId, delta: deltas[0] ?? "" },
      { type: "citation", runId: request.runId, citation },
      { type: "text_delta", runId: request.runId, delta: deltas[1] ?? "" },
      {
        type: "world_knowledge",
        runId: request.runId,
        note: "Mock response only. Real model grounding arrives in Phase 3B.",
      },
      { type: "text_delta", runId: request.runId, delta: deltas[2] ?? "" },
      { type: "run_completed", runId: request.runId },
    ];

    for (const event of events) {
      await sleep(mockDelayMs);
      if (options.signal?.aborted) {
        yield {
          type: "run_cancelled",
          runId: request.runId,
          reason: "User stopped the response.",
        };
        return;
      }
      yield event;
    }
  }
}

function buildMockAnswerDeltas(request: AgentChatRequest, excerpt: string) {
  const scopeLabel =
    request.scope === "selection"
      ? "selected text"
      : request.scope === "current-page"
        ? "current page"
        : "chat";
  const compactQuestion = request.question.replace(/\s+/g, " ").trim();
  const compactExcerpt = excerpt.replace(/\s+/g, " ").trim();
  return [
    `I found local evidence from the ${scopeLabel} for "${compactQuestion}". `,
    `The strongest clue says: ${compactExcerpt}. `,
    "Use this as a grounded draft until the real provider is connected.",
  ];
}

function sleep(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}
