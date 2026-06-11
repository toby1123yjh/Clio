import type { AgentStreamEvent, EvidenceItem, LocalCitation } from "./types";

const citationMarkerStart = "[[cite:";
const citationMarkerEnd = "]]";

export class CitationMarkerParser {
  private readonly evidenceById: Map<string, EvidenceItem>;
  private readonly emittedEvidenceIds = new Set<string>();
  private pending = "";

  constructor(evidence: EvidenceItem[]) {
    this.evidenceById = new Map(evidence.map((item) => [item.id, item]));
  }

  *push(runId: string, delta: string): Iterable<AgentStreamEvent> {
    const input = `${this.pending}${delta}`;
    this.pending = "";
    let cursor = 0;

    while (cursor < input.length) {
      const markerStart = input.indexOf(citationMarkerStart, cursor);
      if (markerStart === -1) {
        const text = input.slice(cursor);
        const pendingLength = citationMarkerPrefixSuffixLength(text);
        const emitText = text.slice(0, text.length - pendingLength);
        this.pending = text.slice(text.length - pendingLength);
        if (emitText.length > 0) yield { type: "text_delta", runId, delta: emitText };
        return;
      }

      const before = input.slice(cursor, markerStart);
      if (before.length > 0) yield { type: "text_delta", runId, delta: before };

      const markerEnd = input.indexOf(citationMarkerEnd, markerStart + citationMarkerStart.length);
      if (markerEnd === -1) {
        this.pending = input.slice(markerStart);
        return;
      }

      const evidenceId = input.slice(markerStart + citationMarkerStart.length, markerEnd).trim();
      const citation = this.buildCitation(runId, evidenceId);
      if (citation !== undefined) {
        yield { type: "citation", runId, citation };
      }
      cursor = markerEnd + citationMarkerEnd.length;
    }
  }

  *flush(runId: string): Iterable<AgentStreamEvent> {
    if (this.pending.length === 0) return;
    const text = this.pending;
    this.pending = "";
    if (text.startsWith(citationMarkerStart) || citationMarkerStart.startsWith(text)) return;
    yield { type: "text_delta", runId, delta: text };
  }

  private buildCitation(runId: string, evidenceId: string): LocalCitation | undefined {
    if (this.emittedEvidenceIds.has(evidenceId)) return undefined;
    const evidence = this.evidenceById.get(evidenceId);
    if (evidence === undefined) return undefined;
    this.emittedEvidenceIds.add(evidenceId);
    return {
      id: `${runId}:citation:${evidence.id}`,
      evidenceId: evidence.id,
      label: evidence.sourceKind === "selection" ? "Selection" : "Page",
      sourceKind: evidence.sourceKind,
      sourceUrl: evidence.sourceUrl,
      sourceTitle: evidence.sourceTitle,
      excerpt: evidence.excerpt,
      ...(evidence.anchor === undefined ? {} : { anchor: evidence.anchor }),
    };
  }
}

function citationMarkerPrefixSuffixLength(text: string) {
  const maxLength = Math.min(text.length, citationMarkerStart.length - 1);
  for (let length = maxLength; length > 0; length -= 1) {
    if (citationMarkerStart.startsWith(text.slice(text.length - length))) {
      return length;
    }
  }
  return 0;
}
