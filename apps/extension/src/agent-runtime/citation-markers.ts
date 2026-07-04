import type { AgentStreamEvent, EvidenceItem, EvidenceSourceKind, LocalCitation } from "./types";

const citationMarkerStart = "[[cite:";
const citationMarkerEnd = "]]";

export class CitationMarkerParser {
  private readonly evidenceById: Map<string, EvidenceItem>;
  private readonly emittedEvidenceIds = new Set<string>();
  private pending = "";
  private outputOffset = 0;

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
        if (emitText.length > 0) yield this.textDelta(runId, emitText);
        return;
      }

      const before = input.slice(cursor, markerStart);
      if (before.length > 0) yield this.textDelta(runId, before);

      const markerEnd = input.indexOf(citationMarkerEnd, markerStart + citationMarkerStart.length);
      if (markerEnd === -1) {
        this.pending = input.slice(markerStart);
        return;
      }

      const evidenceId = input.slice(markerStart + citationMarkerStart.length, markerEnd).trim();
      const citation = this.buildCitation(runId, evidenceId, this.outputOffset);
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
    yield this.textDelta(runId, text);
  }

  private textDelta(runId: string, delta: string): AgentStreamEvent {
    this.outputOffset += delta.length;
    return { type: "text_delta", runId, delta };
  }

  private buildCitation(
    runId: string,
    evidenceId: string,
    outputOffset: number,
  ): LocalCitation | undefined {
    if (this.emittedEvidenceIds.has(evidenceId)) return undefined;
    const evidence = this.evidenceById.get(evidenceId);
    if (evidence === undefined) return undefined;
    this.emittedEvidenceIds.add(evidenceId);
    return {
      id: `${runId}:citation:${evidence.id}`,
      evidenceId: evidence.id,
      label: citationLabel(evidence.sourceKind),
      sourceKind: evidence.sourceKind,
      sourceUrl: evidence.sourceUrl,
      sourceTitle: evidence.sourceTitle,
      excerpt: evidence.excerpt,
      outputOffset,
      ...(evidence.anchor === undefined ? {} : { anchor: evidence.anchor }),
    };
  }
}

export function citationLabel(sourceKind: EvidenceSourceKind) {
  switch (sourceKind) {
    case "selection":
      return "Selection";
    case "memory":
      return "Memory";
    case "web":
      return "Web";
    case "page":
      return "Page";
    default:
      return sourceKind satisfies never;
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
