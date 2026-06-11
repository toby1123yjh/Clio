import type { AgentScope, EvidenceItem } from "@/src/agent-runtime/types";
import type { PageContext, SelectionSnapshot } from "@/src/rail/app/rail-state";
import { EngineRpcError } from "../../shared/rpc";
import { chunkText, excerpt, hashText, normalizeText } from "../../shared/text";
import { extractReadablePage } from "./readable-page";

const maxPageEvidenceItems = 4;
const pageEvidenceTargetTokens = 360;
const pageEvidenceOverlapTokens = 40;

export interface AgentEvidenceInput {
  scope: AgentScope;
  pageContext: PageContext;
  selectionSnapshot?: SelectionSnapshot;
}

export function buildAgentEvidence(input: AgentEvidenceInput): EvidenceItem[] {
  if (input.scope === "general") {
    return [];
  }
  if (input.scope === "selection") {
    return buildSelectionEvidence(input.pageContext, input.selectionSnapshot);
  }
  return buildCurrentPageEvidence(input.pageContext);
}

export function buildCurrentPageEvidence(pageContext: PageContext): EvidenceItem[] {
  const readable = extractReadablePage();
  const chunks = chunkText(
    readable.text,
    pageEvidenceTargetTokens,
    pageEvidenceOverlapTokens,
  ).slice(0, maxPageEvidenceItems);

  if (chunks.length === 0) {
    throw new EngineRpcError(
      "NO_EVIDENCE",
      "Clio could not find clean page text. Select a passage and try again.",
    );
  }

  return chunks.map((chunk) => {
    const itemExcerpt = excerpt(chunk.text, 260);
    return {
      id: `page:${chunk.ord}:${chunk.hash}`,
      sourceKind: "page",
      sourceUrl: pageContext.url,
      sourceTitle: readable.title || pageContext.title,
      text: chunk.text,
      excerpt: itemExcerpt,
      anchor: {
        selectedText: itemExcerpt,
        contextBefore: "",
        contextAfter: "",
      },
    };
  });
}

export function buildSelectionEvidence(
  pageContext: PageContext,
  selectionSnapshot: SelectionSnapshot | undefined,
): EvidenceItem[] {
  const selectedText = normalizeText(selectionSnapshot?.text ?? "");
  if (selectionSnapshot === undefined || selectedText.length === 0) {
    throw new EngineRpcError(
      "SELECTION_REQUIRED",
      "Select text on the page, then ask Clio about that selection.",
    );
  }

  return [
    {
      id: `selection:${hashText(selectedText)}`,
      sourceKind: "selection",
      sourceUrl: selectionSnapshot.sourceUrl || pageContext.url,
      sourceTitle: selectionSnapshot.sourceTitle || pageContext.title,
      text: selectedText,
      excerpt: excerpt(selectedText, 260),
      anchor: {
        selectedText,
        contextBefore: selectionSnapshot.contextBefore,
        contextAfter: selectionSnapshot.contextAfter,
        ...(selectionSnapshot.xpath === undefined ? {} : { xpath: selectionSnapshot.xpath }),
        ...(selectionSnapshot.textFragment === undefined
          ? {}
          : { textFragment: selectionSnapshot.textFragment }),
      },
    },
  ];
}
