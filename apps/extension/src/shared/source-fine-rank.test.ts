import { describe, expect, it } from "vitest";
import {
  SOURCE_FINE_RANK_LIMITS,
  SourceFineRankValidationError,
  allowedRelevanceForStrength,
  assertSourceFineRankPromptBudget,
  boundSourceFineRankRequest,
  validateSourceFineRankProviderResult,
} from "./source-fine-rank";

function request() {
  return {
    query: "find the bounded result",
    strength: "balanced" as const,
    promptVersion: "test-v1",
    candidates: [
      {
        source: {
          id: "source-a",
          title: "A",
          sourceType: "paper",
          keywords: ["rag"],
          sectionHeadings: ["Results"],
        },
        evidence: [{ id: "evidence-a", chunkId: "chunk-a", excerpt: "relevant result" }],
        wiki: [
          {
            artifactId: "artifact-a",
            artifactKind: "source_digest",
            title: "Digest",
            outline: "Results",
            evidenceRefs: ["evidence-a"],
          },
        ],
      },
      {
        source: {
          id: "source-b",
          title: "B",
          sourceType: "paper",
          keywords: [],
          sectionHeadings: [],
        },
        evidence: [{ id: "evidence-b", chunkId: "chunk-b", excerpt: "other result" }],
        wiki: [
          {
            artifactId: "artifact-b",
            artifactKind: "source_digest",
            title: "Digest",
            outline: "Other",
            evidenceRefs: ["chunk-b"],
          },
        ],
      },
    ],
  };
}

describe("source fine rank contract", () => {
  it("maps strength to relevance bands without fixed top-k", () => {
    expect(allowedRelevanceForStrength("strict")).toEqual(["high"]);
    expect(allowedRelevanceForStrength("balanced")).toEqual(["high", "medium"]);
    expect(allowedRelevanceForStrength("broad")).toEqual(["high", "medium", "low"]);
  });

  it("bounds request fields and rejects an oversized candidate batch", () => {
    const baseCandidate = request().candidates[0]!;
    expect(() => boundSourceFineRankRequest({
      ...request(),
      query: ` ${"q".repeat(SOURCE_FINE_RANK_LIMITS.queryChars + 10)} `,
      candidates: Array.from({ length: SOURCE_FINE_RANK_LIMITS.maxCandidates + 4 }, (_, index) => ({
        ...baseCandidate,
        source: { ...baseCandidate.source, id: `source-${index}` },
      })),
    })).toThrowError(SourceFineRankValidationError);
    const bounded = boundSourceFineRankRequest({
      ...request(),
      query: ` ${"q".repeat(SOURCE_FINE_RANK_LIMITS.queryChars + 10)} `,
    });
    expect(bounded.query).toHaveLength(SOURCE_FINE_RANK_LIMITS.queryChars);
    expect(bounded.candidates).toHaveLength(request().candidates.length);
  });

  it("requires exact candidate coverage and same-candidate evidence refs", () => {
    const input = request();
    expect(() =>
      validateSourceFineRankProviderResult(input, {
        judgments: [
          {
            sourceId: "source-a",
            decision: "keep",
            relevance: "high",
            reason: "supported",
            confidence: 0.9,
            evidenceRefs: ["evidence-a"],
          },
          {
            sourceId: "source-b",
            decision: "drop",
            relevance: "irrelevant",
            reason: "unsupported",
            confidence: 0.8,
            evidenceRefs: ["evidence-a"],
          },
        ],
      }),
    ).toThrowError(SourceFineRankValidationError);
  });

  it("accepts a complete bounded result and rejects oversized prompts", () => {
    const result = validateSourceFineRankProviderResult(request(), {
      judgments: [
        {
          sourceId: "source-a",
          decision: "keep",
          relevance: "high",
          reason: "supported",
          confidence: 0.9,
          evidenceRefs: ["evidence-a", "artifact-a"],
        },
        {
          sourceId: "source-b",
          decision: "drop",
          relevance: "irrelevant",
          reason: "unsupported",
          confidence: 0.8,
          evidenceRefs: ["chunk-b"],
        },
      ],
      model: "test-model",
    });
    expect(result.judgments).toHaveLength(2);
    expect(() => assertSourceFineRankPromptBudget(request(), "token ".repeat(20_000))).toThrow(
      /input budget/,
    );
  });

  it("rejects trace input refs outside the supplied candidate boundary", () => {
    expect(() =>
      validateSourceFineRankProviderResult(request(), {
        judgments: [
          {
            sourceId: "source-a",
            decision: "keep",
            relevance: "high",
            reason: "supported",
            confidence: 0.9,
            evidenceRefs: ["evidence-a"],
          },
          {
            sourceId: "source-b",
            decision: "drop",
            relevance: "irrelevant",
            reason: "unsupported",
            confidence: 0.8,
            evidenceRefs: ["chunk-b"],
          },
        ],
        inputRefs: ["source-a", "source-outside"],
      }),
    ).toThrowError(SourceFineRankValidationError);
  });
});
